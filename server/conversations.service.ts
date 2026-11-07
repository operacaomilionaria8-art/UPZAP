import fs from 'fs';
import path from 'path';
import {
  AttendanceMode,
  TransitionHistoryItem,
  ActiveMenuState,
  TrackedMessage,
  MessageDeliveryStatus
} from '../src/types/upzap';

export type ConversationState = 'active' | 'finishing' | 'closed';

export interface ConversationInfo {
  id: string;
  jid: string;
  phone: string;
  senderNumber: string;
  contactName: string;
  senderName: string;
  state: ConversationState;
  firstMessageAt: string;
  startedAt: string;
  createdAt: string;
  lastMessageAt: string;
  lastUserMessage: string;
  lastMessageText?: string;
  lastBotReply?: string;
  messageCount: number;
  currentFlow: string;
  currentFlowId?: string;
  currentFlowName?: string;
  currentFlowStep?: number;
  lastRuleApplied?: string;
  recentTransitions?: TransitionHistoryItem[];
  closedAt?: string;
  closedReason?: string;
  reopenedAt?: string;
  updatedAt: string;
  // Controle unificado de modo de atendimento (Itens 10, 11 e 12)
  attendanceMode?: AttendanceMode;
  modeChangedAt?: string;
  modeChangedBy?: string; // 'operador' | 'painel' | 'sistema'
  automationPaused?: boolean;
  pausedAt?: string;
  // Arquitetura de Automação Integrada (Fluxos, Menus, Variáveis de Venda e Influenciadora)
  activeMenu?: ActiveMenuState | null;
  waitingForInput?: boolean;
  selectedOption?: string | null;
  selectedProduct?: string | null;
  selectedKit?: string | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
  influencerCode?: string | null;
  welcomeSent?: boolean;
  lastWelcomeAt?: string | null;
  variables?: Record<string, string>;
  // Item 1: Histórico rastreado com estados confiáveis de envio
  messages?: TrackedMessage[];
}


export interface ConversationSettings {
  autoReopenOnUserMessage: boolean;
  sendPostCloseWarning: boolean;
  postCloseMessageText: string;
  closedConversationAction: 'ignore' | 'send_message' | 'reopen';
  closedConversationMessage: string;
  autoCloseOnLastRule: boolean;
  inactivityCloseMinutes: number;
  delayHumano: boolean;
  tempoDigitacao: number;
  // Item 17: Proteção contra Loops
  loopProtectionEnabled: boolean;
  loopContingencyMessage: string;
  loopSensitivityCycles: number; // 2 ou 3 ciclos completos
  // Item 18: Reconexão Baileys (Ajuste 1: teto de backoff configurável, padrão 60s)
  maxBackoffSeconds: number;
  updatedAt: string;
}

export interface GlobalAutomationStatus {
  paused: boolean;
  pausedAt?: string;
  pausedBy?: string;
}

export type SpecialWordAction = 'transferir_humano' | 'encerrar' | 'resposta_fixa' | 'ignorar';

export interface SpecialWordItem {
  id: string;
  nome: string;
  palavras: string[];
  acao: SpecialWordAction;
  resposta?: string;
  descricao?: string;
  ativo: boolean;
  createdAt?: string;
}

export class ConversationsService {
  private static instance: ConversationsService;
  private statesFile: string;
  private settingsFile: string;
  private specialWordsFile: string;
  private globalAutomationFile: string;
  private processedMessageIds: Set<string> = new Set<string>();

  public hasProcessedMessageId(messageId: string): boolean {
    if (!messageId) return false;
    return this.processedMessageIds.has(messageId);
  }

  public markMessageIdProcessed(messageId: string): void {
    if (!messageId) return;
    this.processedMessageIds.add(messageId);
    if (this.processedMessageIds.size > 2000) {
      const first = this.processedMessageIds.values().next().value;
      if (first) this.processedMessageIds.delete(first);
    }
  }

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.statesFile = path.join(dataDir, 'conversation_states.json');
    this.settingsFile = path.join(dataDir, 'conversation-settings.json');
    this.specialWordsFile = path.join(dataDir, 'special-words.json');
    this.globalAutomationFile = path.join(dataDir, 'automation_global.json');
  }

  public static getInstance(): ConversationsService {
    if (!ConversationsService.instance) {
      ConversationsService.instance = new ConversationsService();
    }
    return ConversationsService.instance;
  }

  private normalizeKey(phoneOrJid: string): string {
    return (phoneOrJid || '').replace(/@.*$/, '').replace(/:\d+$/, '').replace(/\D/g, '');
  }

  private normalizeText(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ----------------------------------------------------
  // CONVERSATION STATES MANAGEMENT (Itens 2, 3 e Registro Automático)
  // ----------------------------------------------------

  public getAllConversations(): Record<string, ConversationInfo> {
    try {
      if (fs.existsSync(this.statesFile)) {
        const raw = fs.readFileSync(this.statesFile, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          return data;
        }
      }
    } catch (err) {
      console.error('[ConversationsService] Erro ao ler conversation_states.json:', err);
    }
    return {};
  }

  public getConversation(phoneOrJid: string): ConversationInfo | null {
    const key = this.normalizeKey(phoneOrJid);
    if (!key) return null;
    const all = this.getAllConversations();
    return all[key] || null;
  }

  public getConversationState(phoneOrJid: string): ConversationState {
    const info = this.getConversation(phoneOrJid);
    return info ? info.state : 'active';
  }

  /**
   * Registra imediatamente qualquer mensagem recebida no ciclo de atendimento.
   * Cria o atendimento como 🟢 Ativo no primeiro contato ou atualiza o existente.
   * Respeita regras de reabertura caso o atendimento esteja encerrado.
   */
  public registerOrUpdateIncomingMessage(
    phoneOrJid: string,
    userText: string,
    contactName?: string,
    jid?: string
  ): {
    conversation: ConversationInfo;
    isNew: boolean;
    isClosed: boolean;
    shouldProcessRules: boolean;
  } {
    const key = this.normalizeKey(phoneOrJid);
    const all = this.getAllConversations();
    const existing = all[key];
    const settings = this.getSettings();
    const nowIso = new Date().toISOString();
    const displayName = contactName && contactName.trim() !== '' ? contactName.trim() : 'Cliente';
    const strPhone = String(phoneOrJid || '');
    const targetJid = jid || (strPhone.includes('@') ? strPhone : `${key}@s.whatsapp.net`);

    // 1. NOVO CLIENTE / PRIMEIRO CONTATO:
    // Cria imediatamente o atendimento como 🟢 Ativo
    if (!existing) {
      const newConv: ConversationInfo = {
        id: key,
        phone: key,
        senderNumber: key,
        contactName: displayName,
        senderName: displayName,
        jid: targetJid,
        state: 'active',
        firstMessageAt: nowIso,
        startedAt: nowIso,
        createdAt: nowIso,
        lastMessageAt: nowIso,
        lastUserMessage: userText,
        lastMessageText: userText,
        messageCount: 1,
        currentFlow: 'Primeiro Contato / Entrada',
        welcomeSent: false,
        activeMenu: null,
        waitingForInput: false,
        selectedOption: null,
        selectedProduct: 'Calcinha Cinta Modeladora Brizex',
        selectedKit: null,
        selectedColor: null,
        selectedSize: null,
        influencerCode: null,
        attendanceMode: 'auto',
        automationPaused: false,
        modeChangedAt: nowIso,
        modeChangedBy: 'sistema',
        variables: {},
        updatedAt: nowIso
      };

      all[key] = newConv;
      this.saveAllConversations(all);

      console.log(`[ConversationsService] 🟢 Novo cliente registrado no ciclo de atendimento: ${key} (${displayName}) [🟢 Ativo]`);
      return {
        conversation: newConv,
        isNew: true,
        isClosed: false,
        shouldProcessRules: true
      };
    }

    // 2. CLIENTE COM ATENDIMENTO EXISTENTE
    let isClosed = existing.state === 'closed';

    // Item 1 e 4: Toda mensagem recebida reabre o ciclo e deve acionar o reconhecimento de regras
    if (isClosed) {
      console.log(`[ConversationsService] 🟢 Reabrindo atendimento para ${key} automaticamente por nova mensagem recebida.`);
      existing.state = 'active';
      existing.reopenedAt = nowIso;
      delete existing.closedAt;
      delete existing.closedReason;
      existing.currentFlow = 'Reaberto por mensagem do cliente';
      isClosed = false;
    }

    // Atualiza metadados do ciclo existente
    existing.lastMessageAt = nowIso;
    existing.lastUserMessage = userText;
    existing.lastMessageText = userText;
    existing.messageCount = (existing.messageCount || 0) + 1;
    existing.updatedAt = nowIso;
    if (displayName && displayName !== 'Cliente') {
      existing.contactName = displayName;
      existing.senderName = displayName;
    }
    if (targetJid) {
      existing.jid = targetJid;
    }

    all[key] = existing;
    this.saveAllConversations(all);

    return {
      conversation: existing,
      isNew: false,
      isClosed: false,
      shouldProcessRules: true
    };
  }

  /**
   * Registra a resposta enviada pelo bot (regra ou palavra especial) no ciclo
   */
  public recordBotReply(
    phoneOrJid: string,
    replyText: string,
    ruleName?: string,
    ruleId?: string,
    finalize?: boolean
  ): ConversationInfo {
    const key = this.normalizeKey(phoneOrJid);
    const all = this.getAllConversations();
    const nowIso = new Date().toISOString();

    const current = all[key] || {
      id: key,
      phone: key,
      senderNumber: key,
      contactName: 'Cliente',
      senderName: 'Cliente',
      jid: `${key}@s.whatsapp.net`,
      state: 'active',
      firstMessageAt: nowIso,
      startedAt: nowIso,
      createdAt: nowIso,
      lastMessageAt: nowIso,
      lastUserMessage: '',
      messageCount: 1,
      currentFlow: ruleName || 'Atendimento em andamento',
      updatedAt: nowIso
    };

    current.lastBotReply = replyText;
    current.updatedAt = nowIso;
    if (ruleName) {
      current.lastRuleApplied = ruleName;
      current.currentFlow = ruleName;
    } else if (ruleId) {
      current.lastRuleApplied = ruleId;
    }

    if (finalize) {
      current.state = 'closed';
      current.closedAt = nowIso;
      current.closedReason = 'natural_flow';
      current.currentFlow = `${ruleName || 'Regra'} 🏁 (Concluído)`;
      console.log(`[ConversationsService] 🏁 Atendimento ${key} encerrado pela regra: ${ruleName || ruleId}`);
    }

    all[key] = current;
    this.saveAllConversations(all);
    return current;
  }

  /**
   * Obtém o rótulo legível em português para cada status de entrega (Item 1)
   */
  public getStatusLabel(status: MessageDeliveryStatus): string {
    switch (status) {
      case 'scheduled':
        return 'Agendada';
      case 'waiting_delay':
        return 'Aguardando delay';
      case 'sending':
        return 'Enviando...';
      case 'transport_ack':
        return 'Aceita pelo transporte';
      case 'delivered':
        return 'Entregue';
      case 'read':
        return 'Lida';
      case 'failed':
        return 'Falha no envio';
      default:
        return 'Desconhecido';
    }
  }

  /**
   * Adiciona uma mensagem rastreada com estado determinístico no histórico da conversa (Item 1)
   */
  public addTrackedMessage(
    phoneOrJid: string,
    msg: {
      id?: string;
      from: 'user' | 'bot' | 'agent';
      text: string;
      status: MessageDeliveryStatus;
      source?: 'whatsapp_real' | 'simulator';
      messageId?: string;
      error?: string;
      delaySeconds?: number;
      flowName?: string;
      ruleName?: string;
    }
  ): TrackedMessage {
    const key = this.normalizeKey(phoneOrJid);
    const all = this.getAllConversations();
    const now = new Date();
    const nowIso = now.toISOString();
    const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const current = all[key] || {
      id: key,
      phone: key,
      senderNumber: key,
      contactName: 'Cliente',
      senderName: 'Cliente',
      jid: `${key}@s.whatsapp.net`,
      state: 'active' as ConversationState,
      firstMessageAt: nowIso,
      startedAt: nowIso,
      createdAt: nowIso,
      lastMessageAt: nowIso,
      lastUserMessage: '',
      messageCount: 0,
      currentFlow: msg.flowName || 'Atendimento em andamento',
      updatedAt: nowIso
    };

    const messages = Array.isArray(current.messages) ? [...current.messages] : [];

    const newMsg: TrackedMessage = {
      id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId: key,
      from: msg.from,
      text: msg.text,
      timestamp: nowIso,
      formattedTime: timeFormatted,
      status: msg.status,
      statusLabel: this.getStatusLabel(msg.status),
      source: msg.source || 'whatsapp_real',
      messageId: msg.messageId,
      error: msg.error,
      delaySeconds: msg.delaySeconds,
      flowName: msg.flowName,
      ruleName: msg.ruleName
    };

    messages.push(newMsg);
    // Limita a janela de mensagens recentes a 100 por conversa
    if (messages.length > 100) messages.shift();

    current.messages = messages;
    current.lastMessageAt = nowIso;
    current.updatedAt = nowIso;
    if (msg.from === 'user') {
      current.lastUserMessage = msg.text;
      current.lastMessageText = msg.text;
    } else {
      current.lastBotReply = msg.text;
    }

    all[key] = current;
    this.saveAllConversations(all);
    return newMsg;
  }

  /**
   * Atualiza o status confiável de uma mensagem rastreada (Item 1)
   */
  public updateTrackedMessageStatus(
    phoneOrJid: string,
    messageId: string,
    status: MessageDeliveryStatus,
    details?: { messageId?: string; error?: string }
  ): boolean {
    const key = this.normalizeKey(phoneOrJid);
    const all = this.getAllConversations();
    const conv = all[key];
    if (!conv || !Array.isArray(conv.messages)) return false;

    const targetMsg = conv.messages.find(
      (m) => m.id === messageId || (details?.messageId && m.messageId === details.messageId)
    );
    if (!targetMsg) return false;

    targetMsg.status = status;
    targetMsg.statusLabel = this.getStatusLabel(status);
    if (details?.messageId) targetMsg.messageId = details.messageId;
    if (details?.error) targetMsg.error = details.error;

    conv.updatedAt = new Date().toISOString();
    all[key] = conv;
    this.saveAllConversations(all);
    return true;
  }

  /**
   * Atualiza o status por ID de transporte Baileys (key.id) recebido via messages.update
   */
  public updateStatusByBaileysKeyId(
    baileysKeyId: string,
    status: MessageDeliveryStatus
  ): boolean {
    if (!baileysKeyId) return false;
    const all = this.getAllConversations();
    let found = false;

    for (const key of Object.keys(all)) {
      const conv = all[key];
      if (Array.isArray(conv.messages)) {
        const msg = conv.messages.find((m) => m.messageId === baileysKeyId);
        if (msg) {
          msg.status = status;
          msg.statusLabel = this.getStatusLabel(status);
          conv.updatedAt = new Date().toISOString();
          found = true;
          break;
        }
      }
    }

    if (found) {
      this.saveAllConversations(all);
    }
    return found;
  }


  public updateConversation(
    phoneOrJid: string,
    updates: Partial<ConversationInfo> & { contactName?: string; jid?: string }
  ): ConversationInfo {
    const key = this.normalizeKey(phoneOrJid);
    const all = this.getAllConversations();
    const nowIso = new Date().toISOString();

    const current = all[key] || {
      id: key,
      jid: updates.jid || `${key}@s.whatsapp.net`,
      phone: key,
      senderNumber: key,
      contactName: updates.contactName || 'Cliente',
      senderName: updates.contactName || 'Cliente',
      state: 'active' as ConversationState,
      firstMessageAt: nowIso,
      startedAt: nowIso,
      createdAt: nowIso,
      lastMessageAt: nowIso,
      lastUserMessage: '',
      messageCount: 1,
      currentFlow: 'Atendimento Manual',
      updatedAt: nowIso
    };

    // Proteção contra concorrência e eventos obsoletos:
    // Se o operador ou sistema alterou o modo recentemente (ex: Devolver para o Robô),
    // um evento assíncrono antigo não pode sobrescrever o modo atual!
    const effectiveUpdates = { ...updates };
    if (
      effectiveUpdates.attendanceMode &&
      effectiveUpdates.attendanceMode !== current.attendanceMode &&
      current.modeChangedAt &&
      effectiveUpdates.modeChangedAt &&
      new Date(effectiveUpdates.modeChangedAt).getTime() < new Date(current.modeChangedAt).getTime()
    ) {
      console.warn(`[ConversationsService] 🛡️ Ignorando alteração obsoleta de modo (${effectiveUpdates.attendanceMode}) para ${key}. Modo atual mantido: ${current.attendanceMode}`);
      delete effectiveUpdates.attendanceMode;
      delete effectiveUpdates.automationPaused;
      delete effectiveUpdates.modeChangedAt;
      delete effectiveUpdates.modeChangedBy;
    }

    const updated: ConversationInfo = {
      ...current,
      ...effectiveUpdates,
      id: key,
      phone: key,
      senderNumber: key,
      jid: effectiveUpdates.jid || current.jid || `${key}@s.whatsapp.net`,
      contactName: effectiveUpdates.contactName || current.contactName || 'Cliente',
      senderName: effectiveUpdates.contactName || current.senderName || 'Cliente',
      firstMessageAt: current.firstMessageAt || nowIso,
      startedAt: current.startedAt || current.firstMessageAt || nowIso,
      createdAt: current.createdAt || current.firstMessageAt || nowIso,
      updatedAt: nowIso
    };

    if (updates.state === 'closed' && !updated.closedAt) {
      updated.closedAt = nowIso;
    } else if (updates.state === 'active') {
      delete updated.closedAt;
      delete updated.closedReason;
    }

    all[key] = updated;
    this.saveAllConversations(all);
    return updated;
  }

  public setConversationState(
    phoneOrJid: string,
    state: ConversationState,
    reason?: string,
    contactName?: string
  ): ConversationInfo {
    return this.updateConversation(phoneOrJid, {
      state,
      closedReason: state === 'closed' ? reason || 'manual' : undefined,
      contactName
    });
  }

  public reopenConversation(phoneOrJid: string): ConversationInfo {
    console.log(`[ConversationsService] 🟢 Reabrindo atendimento para ${phoneOrJid}`);
    const key = this.normalizeKey(phoneOrJid);
    const all = this.getAllConversations();
    const nowIso = new Date().toISOString();

    if (all[key]) {
      all[key].state = 'active';
      all[key].reopenedAt = nowIso;
      all[key].currentFlow = 'Reaberto pelo atendente';
      delete all[key].closedAt;
      delete all[key].closedReason;
      all[key].updatedAt = nowIso;
      this.saveAllConversations(all);
      return all[key];
    }

    return this.updateConversation(phoneOrJid, {
      state: 'active',
      currentFlow: 'Reaberto pelo atendente'
    });
  }

  public closeConversation(phoneOrJid: string, reason: string = 'manual', contactName?: string): ConversationInfo {
    console.log(`[ConversationsService] 🔴 Encerrando atendimento para ${phoneOrJid} (Motivo: ${reason})`);
    const key = this.normalizeKey(phoneOrJid);
    const all = this.getAllConversations();
    const nowIso = new Date().toISOString();

    if (all[key]) {
      all[key].state = 'closed';
      all[key].closedAt = nowIso;
      all[key].closedReason = reason;
      all[key].currentFlow = `Encerrado (${reason})`;
      all[key].updatedAt = nowIso;
      if (contactName) {
        all[key].contactName = contactName;
        all[key].senderName = contactName;
      }
      this.saveAllConversations(all);
      return all[key];
    }

    return this.updateConversation(phoneOrJid, {
      state: 'closed',
      closedReason: reason,
      currentFlow: `Encerrado (${reason})`,
      contactName
    });
  }

  private saveAllConversations(all: Record<string, ConversationInfo>): void {
    try {
      fs.writeFileSync(this.statesFile, JSON.stringify(all, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ConversationsService] Erro ao salvar conversation_states.json:', err);
    }
  }

  // ----------------------------------------------------
  // CONVERSATION SETTINGS (Item 2 & 3)
  // ----------------------------------------------------

  public getSettings(): ConversationSettings {
    const defaultSettings: ConversationSettings = {
      autoReopenOnUserMessage: true,
      sendPostCloseWarning: false,
      postCloseMessageText: 'Este atendimento já foi encerrado. Caso deseje iniciar um novo contato, por favor envie uma mensagem solicitando um novo atendimento.',
      closedConversationAction: 'reopen',
      closedConversationMessage: 'Este atendimento já foi encerrado. Caso deseje iniciar um novo contato, por favor envie uma mensagem solicitando um novo atendimento.',
      autoCloseOnLastRule: false,
      inactivityCloseMinutes: 0,
      delayHumano: true,
      tempoDigitacao: 2,
      loopProtectionEnabled: true,
      loopContingencyMessage: '⚠️ Identificamos uma repetição no fluxo automático do seu atendimento. Nossa equipe continuará manualmente para lhe atender da melhor forma.',
      loopSensitivityCycles: 2,
      maxBackoffSeconds: 60,
      updatedAt: new Date().toISOString()
    };

    try {
      if (fs.existsSync(this.settingsFile)) {
        const data = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8'));
        const autoReopen = data.autoReopenOnUserMessage !== undefined
          ? Boolean(data.autoReopenOnUserMessage)
          : true;
        
        const closedAction: 'ignore' | 'send_message' | 'reopen' = 'reopen';
        const sendWarning = false;

        return {
          ...defaultSettings,
          ...data,
          autoReopenOnUserMessage: true,
          sendPostCloseWarning: false,
          closedConversationAction: 'reopen',
          delayHumano: data.delayHumano !== undefined ? Boolean(data.delayHumano) : defaultSettings.delayHumano,
          tempoDigitacao: typeof data.tempoDigitacao === 'number' ? Math.max(0, Math.min(15, data.tempoDigitacao)) : defaultSettings.tempoDigitacao,
          loopProtectionEnabled: data.loopProtectionEnabled !== undefined ? Boolean(data.loopProtectionEnabled) : defaultSettings.loopProtectionEnabled,
          loopContingencyMessage: data.loopContingencyMessage || defaultSettings.loopContingencyMessage,
          loopSensitivityCycles: typeof data.loopSensitivityCycles === 'number' ? data.loopSensitivityCycles : defaultSettings.loopSensitivityCycles,
          maxBackoffSeconds: typeof data.maxBackoffSeconds === 'number' ? Math.max(30, Math.min(120, data.maxBackoffSeconds)) : defaultSettings.maxBackoffSeconds,
          closedConversationMessage: data.postCloseMessageText || data.closedConversationMessage || defaultSettings.postCloseMessageText,
          postCloseMessageText: data.postCloseMessageText || data.closedConversationMessage || defaultSettings.postCloseMessageText
        };
      }
    } catch (err) {
      console.error('[ConversationsService] Erro ao ler conversation-settings.json:', err);
    }

    return defaultSettings;
  }

  public saveSettings(newSettings: Partial<ConversationSettings>): ConversationSettings {
    const current = this.getSettings();
    const postCloseText = newSettings.postCloseMessageText || newSettings.closedConversationMessage || current.postCloseMessageText;

    // Harmonização da ação de encerramento e reabertura (Item 6)
    let closedAction: 'ignore' | 'send_message' | 'reopen' = current.closedConversationAction;
    let autoReopen = current.autoReopenOnUserMessage;
    let sendWarning = current.sendPostCloseWarning;

    if (newSettings.closedConversationAction) {
      closedAction = newSettings.closedConversationAction;
      if (closedAction === 'reopen') {
        autoReopen = true;
        sendWarning = false;
      } else if (closedAction === 'send_message') {
        autoReopen = false;
        sendWarning = true;
      } else if (closedAction === 'ignore') {
        autoReopen = false;
        sendWarning = false;
      }
    } else if (newSettings.autoReopenOnUserMessage !== undefined) {
      autoReopen = Boolean(newSettings.autoReopenOnUserMessage);
      if (autoReopen) {
        closedAction = 'reopen';
        sendWarning = false;
      } else {
        sendWarning = newSettings.sendPostCloseWarning !== undefined
          ? Boolean(newSettings.sendPostCloseWarning)
          : (current.closedConversationAction !== 'ignore');
        closedAction = sendWarning ? 'send_message' : 'ignore';
      }
    } else if (newSettings.sendPostCloseWarning !== undefined) {
      sendWarning = Boolean(newSettings.sendPostCloseWarning);
      closedAction = sendWarning ? 'send_message' : 'ignore';
      autoReopen = false;
    }

    const updated: ConversationSettings = {
      ...current,
      ...newSettings,
      autoReopenOnUserMessage: autoReopen,
      sendPostCloseWarning: sendWarning,
      closedConversationAction: closedAction,
      postCloseMessageText: postCloseText,
      closedConversationMessage: postCloseText,
      delayHumano: newSettings.delayHumano !== undefined ? Boolean(newSettings.delayHumano) : current.delayHumano,
      tempoDigitacao: typeof newSettings.tempoDigitacao === 'number' ? Math.max(0, Math.min(15, newSettings.tempoDigitacao)) : current.tempoDigitacao,
      inactivityCloseMinutes: typeof newSettings.inactivityCloseMinutes === 'number' ? Math.max(0, newSettings.inactivityCloseMinutes) : current.inactivityCloseMinutes,
      loopProtectionEnabled: newSettings.loopProtectionEnabled !== undefined ? Boolean(newSettings.loopProtectionEnabled) : current.loopProtectionEnabled,
      loopContingencyMessage: newSettings.loopContingencyMessage || current.loopContingencyMessage,
      loopSensitivityCycles: typeof newSettings.loopSensitivityCycles === 'number' ? newSettings.loopSensitivityCycles : current.loopSensitivityCycles,
      maxBackoffSeconds: typeof newSettings.maxBackoffSeconds === 'number' ? Math.max(30, Math.min(120, newSettings.maxBackoffSeconds)) : current.maxBackoffSeconds,
      updatedAt: new Date().toISOString()
    };

    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(updated, null, 2), 'utf-8');
      console.log('[ConversationsService] Configurações de atendimentos salvas com sucesso.');
    } catch (err) {
      console.error('[ConversationsService] Erro ao salvar conversation-settings.json:', err);
    }

    return updated;
  }

  // ----------------------------------------------------
  // SPECIAL WORDS LIST (Item 5)
  // ----------------------------------------------------

  public getSpecialWords(): SpecialWordItem[] {
    try {
      if (fs.existsSync(this.specialWordsFile)) {
        const data = JSON.parse(fs.readFileSync(this.specialWordsFile, 'utf-8'));
        if (Array.isArray(data)) {
          return data;
        }
      }
    } catch (err) {
      console.error('[ConversationsService] Erro ao ler special-words.json:', err);
    }
    return [];
  }

  public saveSpecialWords(items: SpecialWordItem[]): SpecialWordItem[] {
    try {
      fs.writeFileSync(this.specialWordsFile, JSON.stringify(items, null, 2), 'utf-8');
      console.log('[ConversationsService] Palavras especiais salvas com sucesso.');
    } catch (err) {
      console.error('[ConversationsService] Erro ao salvar special-words.json:', err);
    }
    return items;
  }

  /**
   * Avalia a mensagem do cliente contra as Palavras Especiais cadastradas
   */
  public evaluateSpecialWords(userText: string, contactName: string = 'Cliente'): {
    matched: boolean;
    specialWord?: SpecialWordItem;
    matchedKeyword?: string;
    response?: string;
    action?: SpecialWordAction;
  } {
    const rawText = (userText || '').trim();
    const normText = this.normalizeText(rawText);

    if (!normText) return { matched: false };

    const wordTokens = normText.split(' ').filter(Boolean);
    const items = this.getSpecialWords().filter((item) => item.ativo !== false);

    for (const item of items) {
      const keywords = Array.isArray(item.palavras) ? item.palavras : [];

      for (const kw of keywords) {
        if (!kw || typeof kw !== 'string') continue;
        const normKw = this.normalizeText(kw);
        if (!normKw) continue;

        let matched = false;

        if (normKw.includes(' ')) {
          // Expressão composta (ex: "falar com atendente")
          if (normText === normKw || normText.includes(normKw)) {
            matched = true;
          }
        } else {
          // Palavra única isolada ou correspondência exata
          if (normText === normKw || wordTokens.includes(normKw)) {
            matched = true;
          }
        }

        if (matched) {
          let responseText = item.resposta || '';
          responseText = responseText.replace(/\{\{nome\}\}/gi, contactName)
                                     .replace(/\{nome\}/gi, contactName)
                                     .replace(/\{\{cliente\}\}/gi, contactName)
                                     .replace(/\{cliente\}/gi, contactName);

          return {
            matched: true,
            specialWord: item,
            matchedKeyword: kw,
            response: responseText,
            action: item.acao
          };
        }
      }
    }

    return { matched: false };
  }

  // ----------------------------------------------------
  // PAUSAR AUTOMAÇÃO (Item 10 - Bloco 2)
  // ----------------------------------------------------

  public getGlobalAutomationStatus(): GlobalAutomationStatus {
    try {
      if (fs.existsSync(this.globalAutomationFile)) {
        const data = JSON.parse(fs.readFileSync(this.globalAutomationFile, 'utf-8'));
        return {
          paused: Boolean(data?.paused),
          pausedAt: data?.pausedAt,
          pausedBy: data?.pausedBy
        };
      }
    } catch (err) {
      console.error('[ConversationsService] Erro ao ler automation_global.json:', err);
    }
    return { paused: false };
  }

  public setGlobalAutomationStatus(paused: boolean, pausedBy: string = 'painel'): GlobalAutomationStatus {
    const nowIso = new Date().toISOString();
    const status: GlobalAutomationStatus = {
      paused,
      pausedAt: paused ? nowIso : undefined,
      pausedBy: paused ? pausedBy : undefined
    };

    try {
      fs.writeFileSync(this.globalAutomationFile, JSON.stringify(status, null, 2), 'utf-8');
      console.log(`[ConversationsService] ⏸️ Status de automação global atualizado: ${paused ? 'PAUSADO' : 'ATIVO'}`);
    } catch (err) {
      console.error('[ConversationsService] Erro ao salvar automation_global.json:', err);
    }
    return status;
  }

  public isGlobalAutomationPaused(): boolean {
    return this.getGlobalAutomationStatus().paused;
  }

  /**
   * Define o modo de atendimento unificado do cliente (Itens 10, 11 e 12)
   * mode: 'auto' | 'manual' | 'paused'
   */
  public setConversationAttendanceMode(
    phoneOrJid: string,
    mode: AttendanceMode,
    changedBy: string = 'operador'
  ): ConversationInfo {
    const key = this.normalizeKey(phoneOrJid);
    const nowIso = new Date().toISOString();
    console.log(`[ConversationsService] 🎛️ Modo de atendimento do cliente ${key} alterado para: [${mode.toUpperCase()}] por ${changedBy}`);

    const isPausedFlag = mode !== 'auto';
    const updates: Partial<ConversationInfo> = {
      attendanceMode: mode,
      modeChangedAt: nowIso,
      modeChangedBy: changedBy,
      automationPaused: isPausedFlag,
      pausedAt: isPausedFlag ? nowIso : undefined
    };

    if (mode === 'auto') {
      updates.currentFlow = 'Automação Ativa (Robô)';
      updates.lastRuleApplied = 'Robô Ativo';
      delete (updates as any).closedAt;
      delete (updates as any).closedReason;
    }

    return this.updateConversation(phoneOrJid, updates);
  }

  /**
   * Pausar automação do contato (retrocompatibilidade apontando para o modo 'paused')
   */
  public setConversationAutomationPaused(phoneOrJid: string, paused: boolean): ConversationInfo {
    const mode: AttendanceMode = paused ? 'paused' : 'auto';
    return this.setConversationAttendanceMode(phoneOrJid, mode, 'painel');
  }

  /**
   * Assumir atendimento manual (Item 12)
   */
  public assumeManualAttendance(phoneOrJid: string, operatorName: string = 'Operador'): ConversationInfo {
    return this.setConversationAttendanceMode(phoneOrJid, 'manual', operatorName);
  }

  /**
   * Devolver para automação / Retomar atendimento automático (Itens 11 e 12)
   */
  public resumeAutoAttendance(phoneOrJid: string, operatorName: string = 'painel'): ConversationInfo {
    this.resetTransitions(phoneOrJid); // Limpa histórico recente para que loop guard não trave
    return this.setConversationAttendanceMode(phoneOrJid, 'auto', operatorName);
  }

  /**
   * Verifica se o robô deve responder a este contato ou se está pausado/manual
   */
  public isConversationAutomationPaused(phoneOrJid: string): boolean {
    // 1. Se a automação global estiver pausada, nada é respondido automaticamente
    if (this.isGlobalAutomationPaused()) return true;

    // 2. Verifica o modo unificado do cliente
    const conv = this.getConversation(phoneOrJid);
    if (!conv) return false;

    if (conv.attendanceMode) {
      return conv.attendanceMode === 'manual' || conv.attendanceMode === 'paused';
    }

    return Boolean(conv?.automationPaused);
  }

  // ----------------------------------------------------
  // ITEM 17: PROTEÇÃO CONTRA LOOPS
  // ----------------------------------------------------

  /**
   * Registra uma transição recente (regra aplicada ou bloco de fluxo)
   */
  public recordTransition(
    phoneOrJid: string,
    transition: { type: 'rule' | 'flow_block'; id: string; name: string }
  ): void {
    const conv = this.getConversation(phoneOrJid);
    const history: TransitionHistoryItem[] = Array.isArray(conv?.recentTransitions)
      ? [...conv.recentTransitions]
      : [];

    history.push({
      type: transition.type,
      id: transition.id,
      name: transition.name,
      timestamp: Date.now()
    });

    // Mantém as últimas 15 transições na janela deslizante
    const trimmed = history.slice(-15);
    this.updateConversation(phoneOrJid, { recentTransitions: trimmed });
  }

  /**
   * Reseta o histórico de transições do cliente
   */
  public resetTransitions(phoneOrJid: string): void {
    this.updateConversation(phoneOrJid, { recentTransitions: [] });
  }

  /**
   * Detecta se a execução da próxima transição causará um loop cíclico real.
   * Considera janela de tempo (30s) para não bloquear clientes humanos em conversas normais.
   */
  public detectLoop(
    phoneOrJid: string,
    nextItem: { type: 'rule' | 'flow_block'; id: string; name: string }
  ): { isLoop: boolean; pattern?: string; repeatCount?: number; description?: string } {
    const settings = this.getSettings();
    if (!settings.loopProtectionEnabled) {
      return { isLoop: false };
    }

    const conv = this.getConversation(phoneOrJid);
    const now = Date.now();
    // Considera apenas transições nos últimos 30 segundos para evitar falsos positivos
    const rawHistory: TransitionHistoryItem[] = Array.isArray(conv?.recentTransitions)
      ? [...conv.recentTransitions]
      : [];
    const history = rawHistory.filter((h) => !h.timestamp || now - h.timestamp < 30000);

    // Monta a sequência recente projetada
    const sequence = [
      ...history.map((h) => ({ key: `${h.type}:${h.id}`, label: h.name })),
      { key: `${nextItem.type}:${nextItem.id}`, label: nextItem.name }
    ];

    const keys = sequence.map((s) => s.key);
    const n = keys.length;

    // 1. Ciclo unitário rápido (mesmo item repetido 5 vezes em menos de 30 segundos)
    if (n >= 5) {
      const lastKey = keys[n - 1];
      if (
        keys[n - 2] === lastKey &&
        keys[n - 3] === lastKey &&
        keys[n - 4] === lastKey &&
        keys[n - 5] === lastKey
      ) {
        const patternName = sequence[n - 1].label;
        return {
          isLoop: true,
          pattern: `${patternName} x 5`,
          repeatCount: 5,
          description: `Regra ou fluxo "${patternName}" repetido 5 vezes em menos de 30s.`
        };
      }
    }

    return { isLoop: false };
  }

  // ----------------------------------------------------
  // ARQUITETURA DE AUTOMAÇÃO INTEGRADA (FLUXOS, MENUS & ESTADO)
  // ----------------------------------------------------

  public setConversationFlow(
    phoneOrJid: string,
    flowId: string | null,
    flowName?: string,
    step: number = 0
  ): void {
    this.updateConversation(phoneOrJid, {
      currentFlowId: flowId || undefined,
      currentFlowName: flowName || (flowId ? `Fluxo: ${flowId}` : undefined),
      currentFlow: flowName || (flowId ? `Fluxo: ${flowId}` : 'Atendimento Ativo'),
      currentFlowStep: step
    });
  }

  public setActiveMenu(phoneOrJid: string, menu: ActiveMenuState | null): void {
    this.updateConversation(phoneOrJid, {
      activeMenu: menu,
      waitingForInput: Boolean(menu && menu.aguardandoResposta)
    });
  }

  public clearActiveMenu(phoneOrJid: string): void {
    this.updateConversation(phoneOrJid, {
      activeMenu: null,
      waitingForInput: false
    });
  }

  public setInfluencerCode(phoneOrJid: string, code: string): void {
    if (!code) return;
    this.updateConversation(phoneOrJid, {
      influencerCode: code
    });
    console.log(`[ConversationsService] 🏷️ Código de influenciadora preservado para ${phoneOrJid}: ${code}`);
  }

  public setSalesPreferences(
    phoneOrJid: string,
    prefs: {
      kit?: string | null;
      color?: string | null;
      size?: string | null;
      product?: string | null;
      option?: string | null;
    }
  ): void {
    const updateData: Partial<ConversationInfo> = {};
    if (prefs.kit !== undefined) updateData.selectedKit = prefs.kit;
    if (prefs.color !== undefined) updateData.selectedColor = prefs.color;
    if (prefs.size !== undefined) updateData.selectedSize = prefs.size;
    if (prefs.product !== undefined) updateData.selectedProduct = prefs.product;
    if (prefs.option !== undefined) updateData.selectedOption = prefs.option;
    this.updateConversation(phoneOrJid, updateData);
  }

  public markWelcomeSent(phoneOrJid: string, sent: boolean = true): void {
    this.updateConversation(phoneOrJid, {
      welcomeSent: sent,
      lastWelcomeAt: sent ? new Date().toISOString() : null
    });
  }

  public setAttendanceMode(
    phoneOrJid: string,
    mode: AttendanceMode,
    changedBy: string = 'sistema'
  ): ConversationInfo {
    return this.setConversationAttendanceMode(phoneOrJid, mode, changedBy);
  }

  public resetConversationForTest(phoneOrJid: string): void {
    const key = this.normalizeKey(phoneOrJid);
    const all = this.getAllConversations();
    if (all[key]) {
      delete all[key];
      this.saveAllConversations(all);
    }
    console.log(`[ConversationsService] 🔄 Estado de conversa resetado para testes: ${key}`);
  }
}

export const conversationsService = ConversationsService.getInstance();

