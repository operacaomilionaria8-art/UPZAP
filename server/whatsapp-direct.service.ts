/**
 * WhatsApp Direct Connection Service using Baileys (@whiskeysockets/baileys)
 *
 * Módulo isolado para conexão direta via protocolo Baileys nativo.
 * Suporta autenticação persistente em disco (MultiFileAuthState),
 * geração de QR Code em formato DataURL (PNG) para renderização imediata,
 * detecção automática de conexão e encerramento de sessão seguro.
 */

import * as BaileysModule from '@whiskeysockets/baileys';
import {
  useMultiFileAuthState as _useMultiFileAuthState,
  DisconnectReason as _DisconnectReason,
  WASocket,
  ConnectionState
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { prepareAudioForWhatsApp } from './audio-converter';
import { auditEventsService } from './audit-events.service';
import { conversationsService } from './conversations.service';
import { ActiveMenuState } from '../src/types/upzap';

// Interoperabilidade universal ESM / CJS para o Baileys
const _baileysAny = BaileysModule as any;
const makeWASocket = (
  _baileysAny.makeWASocket ||
  (typeof _baileysAny.default === 'function' ? _baileysAny.default : _baileysAny.default?.default) ||
  _baileysAny
) as typeof import('@whiskeysockets/baileys').makeWASocket;

const useMultiFileAuthState = (
  _baileysAny.useMultiFileAuthState ||
  _baileysAny.default?.useMultiFileAuthState ||
  _useMultiFileAuthState
) as typeof import('@whiskeysockets/baileys').useMultiFileAuthState;

const DisconnectReason = (
  _baileysAny.DisconnectReason ||
  _baileysAny.default?.DisconnectReason ||
  _DisconnectReason
) as typeof import('@whiskeysockets/baileys').DisconnectReason;

const generateWAMessageFromContent = (
  _baileysAny.generateWAMessageFromContent ||
  _baileysAny.default?.generateWAMessageFromContent
) as typeof import('@whiskeysockets/baileys').generateWAMessageFromContent;

export type WhatsAppDirectConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type CallLogStatus = 'rejected' | 'missed' | 'answered_elsewhere';

export interface CallLogEntry {
  id: string;
  from: string;
  callerNumber: string;
  pushName?: string;
  timestamp: string;
  isVideo: boolean;
  status: CallLogStatus;
  warningMessageSent: boolean;
}

export interface CallSettings {
  autoRejectCalls: boolean;
  sendWarningMessage: boolean;
  warningMessageText: string;
  warningDelaySeconds: number;
  updatedAt: string;
}

export interface WhatsAppDirectSessionInfo {
  state: WhatsAppDirectConnectionState;
  qrCodeDataUrl: string | null;
  qrRaw: string | null;
  phoneNumber: string | null;
  userName: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  // Item 18: Controle de reconexão automática e backoff progressivo
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectState: 'idle' | 'reconnecting' | 'reconnect_failed';
  nextReconnectSeconds?: number;
  maxBackoffSeconds: number;
}

export interface DirectIncomingMessage {
  id: string;
  senderPhone: string;
  senderJid: string;
  senderName: string;
  text: string;
  timestamp: number;
  formattedTime?: string;
  fromMe: boolean;
  isGroup: boolean;
}

export type DirectMessageHandler = (message: DirectIncomingMessage) => Promise<void> | void;
export type DirectStateChangeHandler = (state: WhatsAppDirectSessionInfo) => void;

export class WhatsAppDirectService {
  private static instance: WhatsAppDirectService | null = null;
  private sock: WASocket | null = null;
  private isInitializing: boolean = false;
  private isManualDisconnect: boolean = false;
  private authFolder: string;
  private callSettingsFile: string;
  private callLogsFile: string;
  private receivedMessages: DirectIncomingMessage[] = [];
  private reconnectTimeout: NodeJS.Timeout | null = null;

  // Item 18: Reconexão automática com backoff progressivo
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private reconnectState: 'idle' | 'reconnecting' | 'reconnect_failed' = 'idle';
  private nextReconnectSeconds: number = 0;

  private sessionInfo: WhatsAppDirectSessionInfo = {
    state: 'disconnected',
    qrCodeDataUrl: null,
    qrRaw: null,
    phoneNumber: null,
    userName: null,
    lastConnectedAt: null,
    lastError: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    reconnectState: 'idle',
    nextReconnectSeconds: 0,
    maxBackoffSeconds: 60,
  };

  private messageHandlers: DirectMessageHandler[] = [];
  private stateHandlers: DirectStateChangeHandler[] = [];

  private constructor() {
    this.authFolder = process.env.WHATSAPP_SESSION_PATH || path.join(process.cwd(), 'data', 'baileys_auth');
    this.callSettingsFile = path.join(process.cwd(), 'data', 'call-settings.json');
    this.callLogsFile = path.join(process.cwd(), 'data', 'call_logs.json');

    // Garante que o diretório de autenticação existe sem sobrescrever nada
    try {
      if (!fs.existsSync(this.authFolder)) {
        fs.mkdirSync(this.authFolder, { recursive: true });
      }
    } catch (err) {
      console.error('[WhatsAppDirectService] Erro ao criar pasta de autenticação:', err);
    }
  }

  public getAuthFolder(): string {
    return this.authFolder;
  }

  public static getInstance(): WhatsAppDirectService {
    if (!WhatsAppDirectService.instance) {
      WhatsAppDirectService.instance = new WhatsAppDirectService();
    }
    return WhatsAppDirectService.instance;
  }

  /**
   * Obtém as configurações do bloqueio de chamadas
   */
  public getCallSettings(): CallSettings {
    const defaultSettings: CallSettings = {
      autoRejectCalls: true,
      sendWarningMessage: true,
      warningMessageText: 'Olá! Não consigo atender chamadas de voz ou vídeo neste número. Por favor, envie sua dúvida por texto ou áudio por aqui que te respondo.',
      warningDelaySeconds: 1,
      updatedAt: new Date().toISOString()
    };

    try {
      if (fs.existsSync(this.callSettingsFile)) {
        const data = JSON.parse(fs.readFileSync(this.callSettingsFile, 'utf-8'));
        return {
          ...defaultSettings,
          ...data
        };
      }
    } catch (err) {
      console.error('[WhatsAppDirectService] Erro ao ler call-settings.json:', err);
    }

    return defaultSettings;
  }

  /**
   * Salva as configurações de bloqueio de chamadas
   */
  public saveCallSettings(newSettings: Partial<CallSettings>): CallSettings {
    const current = this.getCallSettings();
    const updated: CallSettings = {
      ...current,
      ...newSettings,
      updatedAt: new Date().toISOString()
    };

    try {
      fs.writeFileSync(this.callSettingsFile, JSON.stringify(updated, null, 2), 'utf-8');
      console.log('[WhatsAppDirectService] Configurações de chamadas salvas com sucesso.');
    } catch (err) {
      console.error('[WhatsAppDirectService] Erro ao salvar call-settings.json:', err);
    }

    return updated;
  }

  /**
   * Obtém o histórico de chamadas registradas
   */
  public getCallLogs(limit: number = 100): CallLogEntry[] {
    try {
      if (fs.existsSync(this.callLogsFile)) {
        const data = JSON.parse(fs.readFileSync(this.callLogsFile, 'utf-8'));
        if (Array.isArray(data)) {
          return data.slice(0, limit);
        }
      }
    } catch (err) {
      console.error('[WhatsAppDirectService] Erro ao ler call_logs.json:', err);
    }
    return [];
  }

  /**
   * Registra uma chamada no log persistente
   */
  public recordCallLog(entry: CallLogEntry): void {
    try {
      const currentLogs = this.getCallLogs(500);
      const existingIdx = currentLogs.findIndex((log) => log.id === entry.id);

      if (existingIdx !== -1) {
        currentLogs[existingIdx] = entry;
      } else {
        currentLogs.unshift(entry);
      }

      // Limita a 500 registros para controle de armazenamento
      const trimmed = currentLogs.slice(0, 500);
      fs.writeFileSync(this.callLogsFile, JSON.stringify(trimmed, null, 2), 'utf-8');
      console.log(`[WhatsAppDirectService] Chamada registrada no log: ${entry.callerNumber} (${entry.status})`);

      // Registra evento de auditoria consolidado (Item 19)
      if (entry.status === 'rejected') {
        auditEventsService.addEvent({
          type: 'call_rejected',
          level: 'warning',
          title: `Chamada Recusada: ${entry.pushName || entry.callerNumber}`,
          description: `Chamada de ${entry.isVideo ? 'vídeo' : 'voz'} bloqueada automaticamente.${entry.warningMessageSent ? ' Aviso enviado.' : ''}`,
          details: {
            id: entry.id,
            callerNumber: entry.callerNumber,
            pushName: entry.pushName,
            isVideo: entry.isVideo,
            warningMessageSent: entry.warningMessageSent
          }
        });
      }
    } catch (err) {
      console.error('[WhatsAppDirectService] Erro ao salvar chamada no call_logs.json:', err);
    }
  }

  /**
   * Limpa o histórico de chamadas
   */
  public clearCallLogs(): void {
    try {
      fs.writeFileSync(this.callLogsFile, JSON.stringify([], null, 2), 'utf-8');
    } catch (err) {
      console.error('[WhatsAppDirectService] Erro ao limpar call_logs.json:', err);
    }
  }

  /**
   * Verifica se já existem credenciais salvas em disco
   */
  public hasSavedSession(): boolean {
    try {
      const credsPath = path.join(this.authFolder, 'creds.json');
      return fs.existsSync(credsPath);
    } catch {
      return false;
    }
  }

  /**
   * Retorna o estado atual da sessão do WhatsApp Direct
   */
  public getSessionInfo(): WhatsAppDirectSessionInfo {
    return { ...this.sessionInfo };
  }

  /**
   * Retorna as mensagens recebidas armazenadas temporariamente em memória
   */
  public getReceivedMessages(limit: number = 50): DirectIncomingMessage[] {
    return this.receivedMessages.slice(0, limit);
  }

  /**
   * Limpa a lista temporária de mensagens recebidas
   */
  public clearReceivedMessages(): void {
    this.receivedMessages = [];
  }

  /**
   * Registra ouvinte para mensagens recebidas
   */
  public onMessage(handler: DirectMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Registra ouvinte para alterações de estado e QR Code
   */
  public onStateChange(handler: DirectStateChangeHandler): void {
    this.stateHandlers.push(handler);
  }

  /**
   * Inicia a sessão Baileys com autenticação persistente e gera o QR Code se necessário
   */
  public async initialize(): Promise<WhatsAppDirectSessionInfo> {
    // Se já estiver conectado, retorna a sessão ativa sem gerar novo QR Code
    if (this.sessionInfo.state === 'connected' && this.sock) {
      console.log('[WhatsAppDirectService] WhatsApp já está conectado. Retornando sessão ativa.');
      return this.getSessionInfo();
    }

    // Se já estiver em processo de inicialização, aguarda
    if (this.isInitializing) {
      console.log('[WhatsAppDirectService] Inicialização já em andamento. Aguardando...');
      return this.getSessionInfo();
    }

    this.isInitializing = true;
    this.sessionInfo.state = 'connecting';
    this.sessionInfo.lastError = null;
    this.notifyStateChange();

    try {
      if (!fs.existsSync(this.authFolder)) {
        fs.mkdirSync(this.authFolder, { recursive: true });
      }

      console.log('[WhatsAppDirectService] Carregando credenciais de:', this.authFolder);
      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

      const silentLogger = pino({ level: 'silent' });

      // Se já houver um socket anterior em estado não conectado, fecha antes de criar outro
      if (this.sock) {
        try {
          this.sock.end(undefined);
        } catch {
          // ignore
        }
        this.sock = null;
      }

      console.log('[WhatsAppDirectService] Criando socket Baileys...');
      this.sock = makeWASocket({
        auth: state,
        logger: silentLogger,
        printQRInTerminal: false,
        browser: ['UpZap Web', 'Chrome', '124.0.0'],
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false
      });

      // Salva credenciais sempre que atualizadas
      this.sock.ev.on('creds.update', saveCreds);

      // Gerenciamento de eventos de conexão
      this.sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        // Quando o Baileys emite um novo QR Code
        if (qr) {
          console.log('[WhatsAppDirectService] Novo QR Code gerado pelo Baileys. Convertendo para imagem...');
          try {
            const dataUrl = await QRCode.toDataURL(qr, {
              width: 320,
              margin: 2,
              color: {
                dark: '#0f172a',
                light: '#ffffff'
              }
            });

            this.sessionInfo.qrRaw = qr;
            this.sessionInfo.qrCodeDataUrl = dataUrl;
            this.sessionInfo.state = 'connecting';
            this.sessionInfo.lastError = null;
            console.log('[WhatsAppDirectService] QR Code pronto. Aguardando leitura do QR Code no aplicativo do WhatsApp.');
            this.notifyStateChange();
          } catch (qrErr: any) {
            console.error('[WhatsAppDirectService] Erro ao renderizar QR Code:', qrErr);
            this.sessionInfo.lastError = 'Erro ao processar imagem do QR Code';
            this.notifyStateChange();
          }
        }

        // Quando a conexão é estabelecida com sucesso
        if (connection === 'open') {
          const rawId = this.sock?.user?.id || '';
          const cleanNumber = rawId.replace(/@.*$/, '').replace(/:.*$/, '').replace(/\D/g, '');
          const userName = this.sock?.user?.name || 'Usuário WhatsApp';

          // Reset do contador de tentativas após reconexão bem-sucedida (Ajuste 2)
          this.reconnectAttempts = 0;
          this.reconnectState = 'idle';
          this.nextReconnectSeconds = 0;

          const maxBackoff = conversationsService.getSettings().maxBackoffSeconds || 60;

          this.sessionInfo.state = 'connected';
          this.sessionInfo.qrCodeDataUrl = null;
          this.sessionInfo.qrRaw = null;
          this.sessionInfo.phoneNumber = cleanNumber || null;
          this.sessionInfo.userName = userName;
          this.sessionInfo.lastConnectedAt = new Date().toISOString();
          this.sessionInfo.lastError = null;
          this.sessionInfo.reconnectAttempts = 0;
          this.sessionInfo.reconnectState = 'idle';
          this.sessionInfo.nextReconnectSeconds = 0;
          this.sessionInfo.maxBackoffSeconds = maxBackoff;

          console.log(`[WhatsAppDirectService] 🟢 WhatsApp conectado com sucesso! Número: ${this.sessionInfo.phoneNumber} (${this.sessionInfo.userName})`);

          auditEventsService.addEvent({
            type: 'whatsapp_connection',
            level: 'success',
            title: 'WhatsApp Conectado',
            description: `Sessão estabelecida com sucesso para o número ${cleanNumber || 'identificado'} (${userName}).`,
            details: { phoneNumber: cleanNumber, userName }
          });

          this.notifyStateChange();
        }

        // Quando a conexão é fechada
        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          console.log(`[WhatsAppDirectService] Conexão fechada. Código: ${statusCode}, Desconectado do celular: ${isLoggedOut}, Manual: ${this.isManualDisconnect}`);

          const maxBackoff = conversationsService.getSettings().maxBackoffSeconds || 60;
          this.sessionInfo.maxBackoffSeconds = maxBackoff;

          if (isLoggedOut || this.isManualDisconnect) {
            this.reconnectAttempts = 0;
            this.reconnectState = 'idle';
            this.nextReconnectSeconds = 0;

            this.sessionInfo.state = 'disconnected';
            this.sessionInfo.phoneNumber = null;
            this.sessionInfo.userName = null;
            this.sessionInfo.qrCodeDataUrl = null;
            this.sessionInfo.qrRaw = null;
            this.sessionInfo.reconnectAttempts = 0;
            this.sessionInfo.reconnectState = 'idle';
            this.sessionInfo.nextReconnectSeconds = 0;
            this.sessionInfo.lastError = this.isManualDisconnect ? null : 'Sessão desconectada no WhatsApp do celular.';

            auditEventsService.addEvent({
              type: 'whatsapp_connection',
              level: 'warning',
              title: this.isManualDisconnect ? 'Desconexão Manual' : 'Sessão Encerrada pelo Celular',
              description: this.isManualDisconnect
                ? 'Desconexão voluntária realizada pelo operador através do painel.'
                : 'O WhatsApp foi desconectado no aplicativo do celular (logout intencional). Reconexão automática suspensa.',
              details: { statusCode, isLoggedOut }
            });

            // Limpa credenciais salvas
            try {
              fs.rmSync(this.authFolder, { recursive: true, force: true });
            } catch (err) {
              console.error('[WhatsAppDirectService] Erro ao limpar pasta de auth:', err);
            }

            this.sock = null;
            this.isManualDisconnect = false;
            this.notifyStateChange();
          } else {
            // Queda temporária de rede ou reinício necessário (ex: código 515 restartRequired, timeout, socket reset)
            this.sessionInfo.state = 'disconnected';
            this.sessionInfo.qrCodeDataUrl = null;
            this.sessionInfo.qrRaw = null;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
              this.reconnectState = 'reconnect_failed';
              this.nextReconnectSeconds = 0;
              this.sessionInfo.reconnectAttempts = this.reconnectAttempts;
              this.sessionInfo.reconnectState = 'reconnect_failed';
              this.sessionInfo.nextReconnectSeconds = 0;
              this.sessionInfo.lastError = `Limite de ${this.maxReconnectAttempts} tentativas de reconexão automáticas esgotado. Use o botão 'Reconectar agora' para reiniciar.`;

              auditEventsService.addEvent({
                type: 'whatsapp_connection',
                level: 'error',
                title: 'Tentativas de Reconexão Esgotadas',
                description: `Limite máximo de ${this.maxReconnectAttempts} tentativas automáticas atingido sem sucesso. Aguardando intervenção manual do operador.`,
                details: { attempts: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts, statusCode }
              });

              console.warn(`[WhatsAppDirectService] 🛑 Esgotadas as ${this.maxReconnectAttempts} tentativas de reconexão automática. Aguardando operador.`);
              this.notifyStateChange();
              return;
            }

            // Incrementa tentativa de reconexão e calcula backoff progressivo com teto configurável (Ajuste 1)
            this.reconnectAttempts++;
            this.reconnectState = 'reconnecting';
            const delaySeconds = Math.min(3 * Math.pow(2, this.reconnectAttempts - 1), maxBackoff);
            this.nextReconnectSeconds = delaySeconds;

            this.sessionInfo.reconnectAttempts = this.reconnectAttempts;
            this.sessionInfo.reconnectState = 'reconnecting';
            this.sessionInfo.nextReconnectSeconds = delaySeconds;

            console.log(`[WhatsAppDirectService] 🔄 Tentativa de reconexão #${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${delaySeconds}s (teto: ${maxBackoff}s, código: ${statusCode || 'desconhecido'})...`);

            const isFirstDrop = this.reconnectAttempts === 1;
            auditEventsService.addEvent({
              type: 'whatsapp_connection',
              level: isFirstDrop ? 'warning' : 'info',
              title: isFirstDrop
                ? 'Queda de Conexão WhatsApp'
                : `Reconexão Automática (#${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
              description: isFirstDrop
                ? `A conexão com o WhatsApp caiu (código ${statusCode || 'desconhecido'}). Iniciando reconexão automática em ${delaySeconds}s.`
                : `Tentativa de reconexão #${this.reconnectAttempts} agendada em ${delaySeconds}s (código ${statusCode || 'desconhecido'}).`,
              details: {
                attempt: this.reconnectAttempts,
                maxAttempts: this.maxReconnectAttempts,
                delaySeconds,
                maxBackoff,
                statusCode,
                isDrop: isFirstDrop
              }
            });

            this.notifyStateChange();

            if (this.reconnectTimeout) {
              clearTimeout(this.reconnectTimeout);
            }
            this.reconnectTimeout = setTimeout(() => {
              this.initialize().catch((e) => console.error('[WhatsAppDirectService] Erro na reconexão automática:', e));
            }, delaySeconds * 1000);
          }
        }
      });

      // Gerenciamento de mensagens recebidas (ETAPA 3)
      this.sock.ev.on('messages.upsert', async (upsert: { messages: any[]; type: string }) => {
        const { messages } = upsert;
        if (!messages || !Array.isArray(messages)) return;

        for (const msg of messages) {
          try {
            // 1. Ignorar se não houver payload da mensagem ou chave
            if (!msg.message || !msg.key) continue;

            // 2. Ignorar mensagens enviadas pelo próprio número conectado
            if (msg.key.fromMe) continue;

            const remoteJid = msg.key.remoteJid || '';

            // 3. Ignorar status broadcast do WhatsApp
            if (remoteJid === 'status@broadcast' || remoteJid.includes('@broadcast')) continue;

            const isGroup = remoteJid.includes('@g.us');

            // 4. Identificar o número do remetente
            const senderRaw = isGroup && msg.key.participant ? msg.key.participant : remoteJid;
            const senderPhone = senderRaw.replace(/@.*$/, '').replace(/:\d+$/, '').replace(/\D/g, '');

            // 5. Identificar o nome do contato quando disponível
            const senderName = msg.pushName || 'Contato sem nome';

            // 6. Extrair o texto da mensagem quando for uma mensagem de texto
            let messageContent: any = msg.message;
            if (messageContent?.ephemeralMessage?.message) {
              messageContent = messageContent.ephemeralMessage.message;
            }
            if (messageContent?.viewOnceMessage?.message) {
              messageContent = messageContent.viewOnceMessage.message;
            }
            if (messageContent?.viewOnceMessageV2?.message) {
              messageContent = messageContent.viewOnceMessageV2.message;
            }
            if (messageContent?.documentWithCaptionMessage?.message) {
              messageContent = messageContent.documentWithCaptionMessage.message;
            }

            let text = '';

            if (messageContent.conversation) {
              text = messageContent.conversation;
            } else if (messageContent.extendedTextMessage?.text) {
              text = messageContent.extendedTextMessage.text;
            } else if (messageContent.imageMessage?.caption) {
              text = messageContent.imageMessage.caption;
            } else if (messageContent.videoMessage?.caption) {
              text = messageContent.videoMessage.caption;
            } else if (messageContent.documentMessage?.caption) {
              text = messageContent.documentMessage.caption;
            } else if (messageContent.interactiveResponseMessage) {
              const irm = messageContent.interactiveResponseMessage;
              if (irm.nativeFlowResponseMessage?.paramsJson) {
                try {
                  const parsed = JSON.parse(irm.nativeFlowResponseMessage.paramsJson);
                  text = parsed.id || parsed.selectedId || parsed.title || parsed.display_text || '';
                } catch {
                  text = irm.nativeFlowResponseMessage.paramsJson;
                }
              }
              if (!text && irm.body?.text) {
                text = irm.body.text;
              }
              console.log(`[WhatsAppDirect] 🔘 Resposta interativa recebida (interactiveResponseMessage): "${text}"`);
            } else if (messageContent.buttonsResponseMessage?.selectedButtonId) {
              text = messageContent.buttonsResponseMessage.selectedButtonId;
              console.log(`[WhatsAppDirect] 🔘 Clique de botão recebido (buttonsResponseMessage): "${text}"`);
            } else if (messageContent.buttonsResponseMessage?.selectedDisplayText) {
              text = messageContent.buttonsResponseMessage.selectedDisplayText;
            } else if (messageContent.listResponseMessage?.singleSelectReply?.selectedRowId) {
              text = messageContent.listResponseMessage.singleSelectReply.selectedRowId;
              console.log(`[WhatsAppDirect] 📋 Item de lista selecionado (listResponseMessage): "${text}"`);
            } else if (messageContent.listResponseMessage?.title) {
              text = messageContent.listResponseMessage.title;
            } else if (messageContent.templateButtonReplyMessage?.selectedId) {
              text = messageContent.templateButtonReplyMessage.selectedId;
            } else if (messageContent.templateButtonReplyMessage?.selectedDisplayText) {
              text = messageContent.templateButtonReplyMessage.selectedDisplayText;
            }

            // Ignorar mensagens sem conteúdo textual (ex: chamadas perdidas ou stickers vazios)
            if (!text || !text.trim()) continue;

            const rawTimestamp = msg.messageTimestamp;
            let timestampNumber = Date.now();
            if (typeof rawTimestamp === 'number') {
              timestampNumber = rawTimestamp > 9999999999 ? rawTimestamp : rawTimestamp * 1000;
            } else if (rawTimestamp && typeof rawTimestamp === 'object' && 'low' in (rawTimestamp as any)) {
              timestampNumber = (rawTimestamp as any).low * 1000;
            }

            const formattedTime = new Date(timestampNumber).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });

            const incomingMessage: DirectIncomingMessage = {
              id: msg.key.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              senderPhone: senderPhone || 'Desconhecido',
              senderJid: remoteJid,
              senderName,
              text: text.trim(),
              timestamp: timestampNumber,
              formattedTime,
              fromMe: false,
              isGroup
            };

            // Evita duplicatas se o Baileys emitir múltiplos upserts para o mesmo ID
            const existingIndex = this.receivedMessages.findIndex((m) => m.id === incomingMessage.id);
            if (existingIndex !== -1) {
              // Já existe na lista, atualiza apenas se necessário
              this.receivedMessages[existingIndex] = incomingMessage;
              continue;
            }

            // Armazena temporariamente na lista interna em memória (limite de 100 mensagens)
            this.receivedMessages.unshift(incomingMessage);
            if (this.receivedMessages.length > 100) {
              this.receivedMessages.pop();
            }

            // Logs claros no backend conforme especificação
            console.log('[WhatsApp] Mensagem recebida');
            console.log(`[WhatsApp] Remetente: ${incomingMessage.senderPhone} (${incomingMessage.senderName})`);
            console.log(`[WhatsApp] Texto: ${incomingMessage.text}`);

            // Notifica ouvintes registrados no serviço
            for (const handler of this.messageHandlers) {
              try {
                await handler(incomingMessage);
              } catch (handlerErr) {
                console.error('[WhatsAppDirectService] Erro no manipulador de mensagem:', handlerErr);
              }
            }
          } catch (itemErr) {
            console.error('[WhatsAppDirectService] Erro ao extrair mensagem recebida:', itemErr);
          }
        }
      });

      // Item 1: Rastreamento confiável de confirmações de entrega e leitura (ack/receipts)
      this.sock.ev.on('messages.update', async (updates: any[]) => {
        if (!updates || !Array.isArray(updates)) return;

        for (const update of updates) {
          try {
            const keyId = update.key?.id;
            const statusNumber = update.update?.status;

            if (!keyId) continue;

            // Mapeia os status numéricos do Baileys:
            // 2 = SERVER_ACK (Aceita pelo transporte WhatsApp)
            // 3 = DELIVERY_ACK (Entregue no aparelho do cliente)
            // 4 = READ (Lida pelo cliente)
            // 5 = PLAYED (Áudio reproduzido)
            if (statusNumber === 2 || statusNumber === 'SERVER_ACK') {
              conversationsService.updateStatusByBaileysKeyId(keyId, 'transport_ack');
            } else if (statusNumber === 3 || statusNumber === 'DELIVERY_ACK') {
              conversationsService.updateStatusByBaileysKeyId(keyId, 'delivered');
              console.log(`[WhatsAppDirect] ✔️ Confirmação de entrega recebida para mensagem ${keyId}`);
            } else if (statusNumber === 4 || statusNumber === 'READ' || statusNumber === 5 || statusNumber === 'PLAYED') {
              conversationsService.updateStatusByBaileysKeyId(keyId, 'read');
              console.log(`[WhatsAppDirect] 👁️ Confirmação de leitura recebida para mensagem ${keyId}`);
            }
          } catch (updateErr) {
            console.error('[WhatsAppDirectService] Erro ao processar messages.update:', updateErr);
          }
        }
      });

      // Gerenciamento de chamadas recebidas (Bloqueio Automático de Chamadas - Item 1)
      this.sock.ev.on('call', async (calls: any[]) => {
        if (!calls || !Array.isArray(calls)) return;

        const callSettings = this.getCallSettings();

        for (const call of calls) {
          try {
            const callId = call.id || `call-${Date.now()}`;
            const from = call.from || call.chatId || '';
            const callerNumber = from.replace(/@.*$/, '').replace(/:\d+$/, '').replace(/\D/g, '');
            const isVideo = Boolean(call.isVideo);
            const callStatus = call.status || 'offer';

            console.log(`[WhatsAppDirectService] Evento de chamada detectado: ID=${callId}, De=${callerNumber}, Status=${callStatus}, Video=${isVideo}`);

            // Quando a chamada é oferecida / tocando
            if (callStatus === 'offer' || callStatus === 'ringing') {
              let rejected = false;

              // 1. Rejeição automática se configurado
              if (callSettings.autoRejectCalls && this.sock) {
                try {
                  await this.sock.rejectCall(callId, from);
                  rejected = true;
                  console.log(`[WhatsAppDirectService] 🚫 Chamada ${callId} de ${callerNumber} rejeitada com sucesso.`);
                } catch (rejectErr) {
                  console.error(`[WhatsAppDirectService] Erro ao rejeitar chamada ${callId}:`, rejectErr);
                }
              }

              const logStatus: CallLogStatus = rejected ? 'rejected' : 'missed';
              let warningSent = false;

              // 2. Envio da mensagem de aviso pós-rejeição
              if (rejected && callSettings.sendWarningMessage && callSettings.warningMessageText.trim() && this.sock) {
                const delayMs = Math.max(0, (callSettings.warningDelaySeconds || 1) * 1000);
                setTimeout(async () => {
                  try {
                    await this.sendTextMessage(from, callSettings.warningMessageText.trim());
                    warningSent = true;
                    console.log(`[WhatsAppDirectService] ✉️ Mensagem de aviso de chamada enviada para ${callerNumber}.`);
                    
                    // Atualiza log com flag de envio
                    this.recordCallLog({
                      id: callId,
                      from,
                      callerNumber,
                      pushName: (call as any).pushName || undefined,
                      timestamp: new Date().toISOString(),
                      isVideo,
                      status: logStatus,
                      warningMessageSent: true
                    });
                  } catch (msgErr) {
                    console.error(`[WhatsAppDirectService] Erro ao enviar aviso de chamada para ${callerNumber}:`, msgErr);
                  }
                }, delayMs);
              }

              // 3. Registrar chamada no histórico persistente
              this.recordCallLog({
                id: callId,
                from,
                callerNumber,
                pushName: (call as any).pushName || undefined,
                timestamp: new Date().toISOString(),
                isVideo,
                status: logStatus,
                warningMessageSent: false
              });
            } else if (callStatus === 'timeout' || callStatus === 'missed') {
              this.recordCallLog({
                id: callId,
                from,
                callerNumber,
                pushName: (call as any).pushName || undefined,
                timestamp: new Date().toISOString(),
                isVideo,
                status: 'missed',
                warningMessageSent: false
              });
            }
          } catch (callErr) {
            console.error('[WhatsAppDirectService] Erro ao processar evento de chamada:', callErr);
          }
        }
      });

      return this.getSessionInfo();
    } catch (err: any) {
      console.error('[WhatsAppDirectService] Erro fatal ao iniciar sessão Baileys:', err);
      this.sessionInfo.state = 'error';
      this.sessionInfo.lastError = err.message || 'Falha ao inicializar o serviço do WhatsApp';
      auditEventsService.addEvent({
        type: 'whatsapp_connection',
        level: 'error',
        title: 'Falha Fatal no WhatsApp',
        description: err.message || 'Falha crítica ao inicializar o socket Baileys.',
        details: { error: String(err) }
      });
      this.notifyStateChange();
      return this.getSessionInfo();
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Encerra a sessão ativa e limpa as credenciais locais
   */
  public async disconnect(): Promise<void> {
    console.log('[WhatsAppDirectService] Solicitando desconexão manual...');
    this.isManualDisconnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        // ignore
      }
      try {
        this.sock.end(undefined);
      } catch {
        // ignore
      }
      this.sock = null;
    }

    try {
      if (fs.existsSync(this.authFolder)) {
        fs.rmSync(this.authFolder, { recursive: true, force: true });
        fs.mkdirSync(this.authFolder, { recursive: true });
      }
    } catch (err) {
      console.error('[WhatsAppDirectService] Erro ao resetar pasta de autenticação:', err);
    }

    this.sessionInfo = {
      state: 'disconnected',
      qrCodeDataUrl: null,
      qrRaw: null,
      phoneNumber: null,
      userName: null,
      lastConnectedAt: null,
      lastError: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectState: 'idle',
      nextReconnectSeconds: 0,
      maxBackoffSeconds: conversationsService.getSettings().maxBackoffSeconds || 60,
    };

    console.log('[WhatsAppDirectService] 🔴 Sessão desconectada com sucesso.');
    this.notifyStateChange();
  }

  /**
   * Verifica se há um processo de conexão ou handshake ativamente em curso no Baileys
   */
  public isConnectionInProgress(): boolean {
    return this.isInitializing || this.sessionInfo.state === 'connecting';
  }

  public isConnected(): boolean {
    return this.sessionInfo.state === 'connected' && Boolean(this.sock);
  }

  public isSocketConnected(): boolean {
    return this.isConnected();
  }

  /**
   * Dispara uma reconexão manual imediata, resetando o contador de tentativas (Item 18 & Ajuste 2)
   */
  public async forceReconnectNow(): Promise<WhatsAppDirectSessionInfo> {
    // Evita chamadas concorrentes caso uma conexão já esteja sendo negociada com o Baileys
    if (this.isConnectionInProgress()) {
      console.warn('[WhatsAppDirectService] ⚠️ Tentativa de conexão já em andamento no Baileys. Ignorando chamada duplicada para proteger a sessão.');
      return this.getSessionInfo();
    }

    console.log('[WhatsAppDirectService] 🚀 Forçando reconexão manual imediata solicitada pelo operador...');
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnectAttempts = 0;
    this.reconnectState = 'reconnecting';
    this.nextReconnectSeconds = 0;

    const maxBackoff = conversationsService.getSettings().maxBackoffSeconds || 60;
    this.sessionInfo.reconnectAttempts = 0;
    this.sessionInfo.reconnectState = 'reconnecting';
    this.sessionInfo.nextReconnectSeconds = 0;
    this.sessionInfo.lastError = null;
    this.sessionInfo.maxBackoffSeconds = maxBackoff;

    auditEventsService.addEvent({
      type: 'whatsapp_connection',
      level: 'info',
      title: 'Reconexão Manual Disparada',
      description: 'O operador acionou o botão "Reconectar agora" na aba de Monitoramento. Reiniciando handshake Baileys...',
      details: { manual: true }
    });

    this.notifyStateChange();
    return this.initialize();
  }

  /**
   * Converte um número de telefone para o formato JID utilizado pelo WhatsApp
   */
  public formatToJID(phoneNumberOrJid: string): string {
    if (!phoneNumberOrJid) return '';
    const trimmed = phoneNumberOrJid.trim();
    if (trimmed.includes('@s.whatsapp.net') || trimmed.includes('@g.us') || trimmed.includes('@lid')) {
      return trimmed;
    }
    const cleanNumber = trimmed.replace(/\D/g, '');
    return `${cleanNumber}@s.whatsapp.net`;
  }

  /**
   * Simula a digitação humana (Item 13) enviando presence 'composing'
   * Aguarda com segurança o delay configurado antes de prosseguir com o envio
   */
  public async simulateTyping(jidOrNumber: string, delaySeconds: number = 2): Promise<void> {
    const sock = this.sock;
    if (!sock || this.sessionInfo.state !== 'connected') return;

    try {
      const targetJid = jidOrNumber.includes('@') ? jidOrNumber : `${jidOrNumber.replace(/\D/g, '')}@s.whatsapp.net`;
      const waitMs = Math.min(Math.max(delaySeconds, 0.5), 15) * 1000;

      console.log(`[WhatsAppDirect] ✍️ Simulando digitação humana ('composing') para ${targetJid} por ${(waitMs / 1000).toFixed(1)}s...`);
      
      // Dispara o status 'composing' nativo do Baileys
      await sock.sendPresenceUpdate('composing', targetJid);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      
      // Pausa a digitação ('paused') ao término
      await sock.sendPresenceUpdate('paused', targetJid).catch(() => {});
    } catch (err: any) {
      console.warn(`[WhatsAppDirect] Erro não-bloqueante ao simular digitação: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(delaySeconds * 1000, 2000)));
    }
  }

  /**
   * Envia uma mensagem de texto para um número ou JID de WhatsApp via sessão Baileys
   */
  public async sendTextMessage(target: string, text: string): Promise<{ success: boolean; messageId?: string; to?: string }> {
    // 1. Verificar se existe uma sessão WhatsApp conectada
    if (this.sessionInfo.state !== 'connected' || !this.sock) {
      const errorMsg = 'WhatsApp não está conectado. Conecte antes de enviar mensagens.';
      console.warn(`[WhatsAppDirectService] ⚠️ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const rawTarget = String(target || '').trim();
    if (!rawTarget) {
      throw new Error('Destinatário inválido.');
    }

    if (!text || !text.trim()) {
      throw new Error('O texto da mensagem não pode ser vazio.');
    }

    // 2. Determinar o JID exato de envio
    let jid: string;
    if (rawTarget.includes('@s.whatsapp.net') || rawTarget.includes('@g.us') || rawTarget.includes('@lid')) {
      jid = rawTarget;
    } else {
      const cleanNumber = rawTarget.replace(/\D/g, '');
      if (!cleanNumber || cleanNumber.length < 8) {
        throw new Error('Número de WhatsApp inválido. Forneça o código do país + DDD + número (ex: 5511999999999).');
      }
      jid = this.formatToJID(cleanNumber);
    }

    // 3. Logs no backend conforme especificação
    console.log(`[WhatsApp] Enviando mensagem para JID: ${jid}`);

    try {
      const result = await this.sock.sendMessage(jid, { text: text.trim() });
      console.log('[WhatsApp] Mensagem enviada com sucesso via Baileys');

      return {
        success: true,
        messageId: result?.key?.id || `msg-${Date.now()}`,
        to: jid
      };
    } catch (err: any) {
      console.error(`[WhatsAppDirectService] Erro ao enviar mensagem via Baileys para ${jid}:`, err);
      throw new Error(err.message || 'Falha ao enviar mensagem pelo WhatsApp Baileys');
    }
  }

  /**
   * Envia um arquivo de mídia (PDF, Imagem, Vídeo, Áudio) para um número ou JID de WhatsApp via Baileys
   */
  public async sendMediaMessage(
    target: string,
    options: {
      type: 'image' | 'foto' | 'video' | 'audio' | 'pdf' | 'document';
      buffer?: Buffer;
      filePath?: string;
      fileName?: string;
      caption?: string;
      mimetype?: string;
      ptt?: boolean;
    }
  ): Promise<{ success: boolean; messageId?: string; to?: string }> {
    // 1. Verificar se existe uma sessão WhatsApp conectada
    if (this.sessionInfo.state !== 'connected' || !this.sock) {
      const errorMsg = 'WhatsApp não está conectado. Conecte antes de enviar arquivos.';
      console.warn(`[WhatsAppDirectService] ⚠️ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const rawTarget = String(target || '').trim();
    if (!rawTarget) {
      throw new Error('Destinatário inválido.');
    }

    // 2. Determinar o JID exato de envio
    let jid: string;
    if (rawTarget.includes('@s.whatsapp.net') || rawTarget.includes('@g.us') || rawTarget.includes('@lid')) {
      jid = rawTarget;
    } else {
      const cleanNumber = rawTarget.replace(/\D/g, '');
      if (!cleanNumber || cleanNumber.length < 8) {
        throw new Error('Número de WhatsApp inválido.');
      }
      jid = this.formatToJID(cleanNumber);
    }

    // 3. Obter o Buffer da mídia
    let mediaBuffer: Buffer | null = options.buffer || null;
    if (!mediaBuffer && options.filePath) {
      if (fs.existsSync(options.filePath)) {
        mediaBuffer = fs.readFileSync(options.filePath);
      } else {
        const altPath = path.resolve(process.cwd(), options.filePath);
        if (fs.existsSync(altPath)) {
          mediaBuffer = fs.readFileSync(altPath);
        }
      }
    }

    if (!mediaBuffer) {
      throw new Error(`Arquivo de mídia não encontrado ou vazio: ${options.fileName || options.filePath || 'desconhecido'}`);
    }

    const mediaType = options.type.toLowerCase();
    let messagePayload: any = null;

    if (mediaType === 'pdf' || mediaType === 'document') {
      messagePayload = {
        document: mediaBuffer,
        mimetype: options.mimetype || 'application/pdf',
        fileName: options.fileName || 'documento.pdf',
        caption: options.caption || undefined
      };
    } else if (mediaType === 'image' || mediaType === 'foto') {
      messagePayload = {
        image: mediaBuffer,
        mimetype: options.mimetype || 'image/jpeg',
        caption: options.caption || undefined
      };
    } else if (mediaType === 'video') {
      messagePayload = {
        video: mediaBuffer,
        mimetype: options.mimetype || 'video/mp4',
        caption: options.caption || undefined
      };
    } else if (mediaType === 'audio') {
      const preparedAudio = await prepareAudioForWhatsApp({
        buffer: mediaBuffer,
        filePath: options.filePath,
        fileName: options.fileName,
        mimetype: options.mimetype,
        ptt: options.ptt !== undefined ? options.ptt : true
      });

      messagePayload = {
        audio: preparedAudio.buffer,
        mimetype: preparedAudio.mimetype,
        ptt: preparedAudio.ptt
      };
    } else {
      // Fallback genérico como documento
      messagePayload = {
        document: mediaBuffer,
        mimetype: options.mimetype || 'application/octet-stream',
        fileName: options.fileName || 'arquivo'
      };
    }

    console.log(`[WhatsApp] Enviando mídia (${mediaType}) para JID: ${jid}, arquivo: ${options.fileName || 'mídia'}`);

    try {
      const result = await this.sock.sendMessage(jid, messagePayload);
      console.log('[WhatsApp] Mídia enviada com sucesso via Baileys');

      return {
        success: true,
        messageId: result?.key?.id || `media-${Date.now()}`,
        to: jid
      };
    } catch (err: any) {
      console.error(`[WhatsAppDirectService] Erro ao enviar mídia via Baileys para ${jid}:`, err);
      throw new Error(err.message || 'Falha ao enviar arquivo pelo WhatsApp Baileys');
    }
  }

  /**
   * Envia menu interativo com botões clicáveis ou lista interativa via Baileys,
   * com proteção e fallback determinístico obrigatório para menu numerado (Item 1, 2, 3 e 6)
   */
  /**
   * Envia menu de opções para o WhatsApp via Baileys com garantia de entrega real (Item 1, 2, 3, 4 e 5).
   *
   * NOTA TÉCNICA OBRIGATÓRIA (Limitação do protocolo WhatsApp Web / Baileys MD):
   * A Meta descarta silenciosamente stanzas de nativeFlowMessage (botoes/lista) originadas
   * de conexões Web não-oficiais sem lançar erro no socket (relayMessage resolve com sucesso no Node.js,
   * porém os servidores da Meta nunca transmitem a mensagem para o aparelho do destinatário).
   * Para garantir entrega real 100% confiável no WhatsApp de qualquer cliente (iOS, Android, Web e Desktop),
   * o menu é transmitido como mensagem de texto numerada e estruturada.
   */
  public async sendInteractiveMenuMessage(
    target: string,
    menu: ActiveMenuState,
    fallbackText: string
  ): Promise<{ success: boolean; messageId?: string; to?: string; formatUsed: 'botoes' | 'lista' | 'numerado' | 'texto'; isFallback?: boolean }> {
    if (this.sessionInfo.state !== 'connected' || !this.sock) {
      throw new Error('WhatsApp não está conectado.');
    }

    const jid = this.formatToJID(target);
    const options = Array.isArray(menu.opcoes) ? menu.opcoes : [];
    const textToSend = (fallbackText && fallbackText.trim()) ? fallbackText.trim() : `*${menu.titulo || 'Menu Principal'}*\n\n${menu.textoPrincipal || 'Escolha uma opção:'}\n\n` + options.map((op) => `*${op.numero}* - ${op.texto}`).join('\n') + `\n\n_${menu.rodape || 'Digite o número da opção desejada.'}_`;

    console.log(`[WhatsAppDirect] 📲 Enviando menu com ${options.length} opções em formato texto comum numerado para ${jid}...`);
    const res = await this.sendTextMessage(jid, textToSend);

    return {
      success: true,
      messageId: res.messageId,
      to: jid,
      formatUsed: 'numerado',
      isFallback: false
    };
  }

  /**
   * Método compatível de envio direto
   */
  public async sendMessage(phoneNumber: string, text: string): Promise<boolean> {
    try {
      await this.sendTextMessage(phoneNumber, text);
      return true;
    } catch (err) {
      return false;
    }
  }

  private notifyStateChange(): void {
    const info = this.getSessionInfo();
    for (const handler of this.stateHandlers) {
      try {
        handler(info);
      } catch (err) {
        console.error('[WhatsAppDirectService] Erro no manipulador de estado:', err);
      }
    }
  }
}

export const whatsAppDirectService = WhatsAppDirectService.getInstance();

