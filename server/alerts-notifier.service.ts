import fs from 'fs';
import path from 'path';
import { AuditEvent, auditEventsService } from './audit-events.service';

export interface InternalAlert {
  id: string;
  key: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  origin: 'whatsapp' | 'brizex' | 'automacao' | 'sistema' | 'rede';
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
  details?: Record<string, any>;
  recommendedAction?: string;
  recoveryResult?: string;
  soundEvent?: string;
  recoverySoundEvent?: string;
  audioPlayed?: boolean;
}

export interface InternalAlertsSettings {
  enabled: boolean;
  soundEnabled: boolean;
  soundVolume: number; // 0.0 a 1.0
  notifyOnDisconnect: boolean;
  notifyOnReconnect: boolean;
  notifyOnServerStop: boolean;
  notifyOnCriticalErrors: boolean;
  notifyOnBrizexError: boolean;
  notifyOnLoops: boolean;
}

export class InternalAlertsService {
  private static instance: InternalAlertsService;
  private settingsFile: string;
  private alertsFile: string;
  private settings: InternalAlertsSettings;
  private activeAlerts: Map<string, InternalAlert> = new Map();
  private resolvedAlerts: InternalAlert[] = [];
  private listeners: ((alert: InternalAlert) => void)[] = [];

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.settingsFile = path.join(dataDir, 'alerts_settings.json');
    this.alertsFile = path.join(dataDir, 'active_alerts.json');

    // Configurações padrão internas (sem dependência de serviços externos)
    this.settings = {
      enabled: true,
      soundEnabled: true,
      soundVolume: 0.75,
      notifyOnDisconnect: true,
      notifyOnReconnect: true,
      notifyOnServerStop: true,
      notifyOnCriticalErrors: true,
      notifyOnBrizexError: true,
      notifyOnLoops: true
    };

    this.loadSettings();
    this.loadAlerts();
  }

  public static getInstance(): InternalAlertsService {
    if (!InternalAlertsService.instance) {
      InternalAlertsService.instance = new InternalAlertsService();
    }
    return InternalAlertsService.instance;
  }

  public onAlert(listener: (alert: InternalAlert) => void): void {
    this.listeners.push(listener);
  }

  private loadSettings(): void {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const actual = parsed?.settings || parsed;
        this.settings = {
          ...this.settings,
          enabled: actual.enabled !== false,
          soundEnabled: actual.soundEnabled !== false,
          soundVolume: typeof actual.soundVolume === 'number' ? actual.soundVolume : 0.75,
          notifyOnDisconnect: actual.notifyOnDisconnect !== false,
          notifyOnReconnect: actual.notifyOnReconnect !== false,
          notifyOnServerStop: actual.notifyOnServerStop !== false,
          notifyOnCriticalErrors: actual.notifyOnCriticalErrors !== false,
          notifyOnBrizexError: actual.notifyOnBrizexError !== false,
          notifyOnLoops: actual.notifyOnLoops !== false
        };
      }
    } catch (err) {
      console.error('[InternalAlertsService] Erro ao carregar alerts_settings.json:', err);
    }
  }

  private saveSettings(): void {
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('[InternalAlertsService] Erro ao salvar alerts_settings.json:', err);
    }
  }

  private loadAlerts(): void {
    try {
      if (fs.existsSync(this.alertsFile)) {
        const raw = fs.readFileSync(this.alertsFile, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.active)) {
          this.activeAlerts.clear();
          data.active.forEach((a: InternalAlert) => this.activeAlerts.set(a.key, a));
        }
        if (Array.isArray(data.resolved)) {
          this.resolvedAlerts = data.resolved.slice(0, 100);
        }
      }
    } catch (err) {
      console.error('[InternalAlertsService] Erro ao ler active_alerts.json:', err);
    }
  }

  private saveAlerts(): void {
    try {
      const payload = {
        active: Array.from(this.activeAlerts.values()),
        resolved: this.resolvedAlerts.slice(0, 100)
      };
      fs.writeFileSync(this.alertsFile, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('[InternalAlertsService] Erro ao salvar active_alerts.json:', err);
    }
  }

  public getSettings(): { settings: InternalAlertsSettings } {
    return {
      settings: { ...this.settings }
    };
  }

  public updateSettings(partial: any): InternalAlertsSettings {
    const raw = partial?.settings || partial || {};
    if (typeof raw.enabled === 'boolean') this.settings.enabled = raw.enabled;
    if (typeof raw.soundEnabled === 'boolean') this.settings.soundEnabled = raw.soundEnabled;
    if (typeof raw.soundVolume === 'number') this.settings.soundVolume = Math.min(1, Math.max(0, raw.soundVolume));
    if (typeof raw.notifyOnDisconnect === 'boolean') this.settings.notifyOnDisconnect = raw.notifyOnDisconnect;
    if (typeof raw.notifyOnReconnect === 'boolean') this.settings.notifyOnReconnect = raw.notifyOnReconnect;
    if (typeof raw.notifyOnServerStop === 'boolean') this.settings.notifyOnServerStop = raw.notifyOnServerStop;
    if (typeof raw.notifyOnCriticalErrors === 'boolean') this.settings.notifyOnCriticalErrors = raw.notifyOnCriticalErrors;
    if (typeof raw.notifyOnBrizexError === 'boolean') this.settings.notifyOnBrizexError = raw.notifyOnBrizexError;
    if (typeof raw.notifyOnLoops === 'boolean') this.settings.notifyOnLoops = raw.notifyOnLoops;

    this.saveSettings();
    return { ...this.settings };
  }

  public getActiveAlerts(): InternalAlert[] {
    return Array.from(this.activeAlerts.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getResolvedAlerts(limit = 50): InternalAlert[] {
    return this.resolvedAlerts.slice(0, limit);
  }

  public getAllAlerts(): { active: InternalAlert[]; resolved: InternalAlert[] } {
    return {
      active: this.getActiveAlerts(),
      resolved: this.getResolvedAlerts()
    };
  }

  /**
   * Dispara ou atualiza um alerta interno com prevenção contra duplicação excessiva
   */
  public triggerAlert(
    key: string,
    data: Omit<InternalAlert, 'id' | 'key' | 'createdAt' | 'status'>
  ): InternalAlert {
    const existing = this.activeAlerts.get(key);
    const nowIso = new Date().toISOString();

    if (existing) {
      // Atualiza detalhes sem gerar alarme sonoro redundante
      existing.title = data.title;
      existing.description = data.description;
      existing.details = { ...existing.details, ...data.details, lastOccurrenceAt: nowIso };
      if (data.recommendedAction) existing.recommendedAction = data.recommendedAction;
      this.saveAlerts();
      return existing;
    }

    const newAlert: InternalAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      key,
      severity: data.severity,
      title: data.title,
      description: data.description,
      origin: data.origin,
      status: 'active',
      createdAt: nowIso,
      details: data.details,
      recommendedAction: data.recommendedAction,
      soundEvent: data.soundEvent,
      recoverySoundEvent: data.recoverySoundEvent
    };

    this.activeAlerts.set(key, newAlert);
    this.saveAlerts();

    console.log(`[InternalAlertsService] 🚨 Novo Alerta Interno Ativo: [${newAlert.severity.toUpperCase()}] ${newAlert.title}`);

    // Notifica listeners locais (ex: SSE ou canais WebSocket)
    this.listeners.forEach((fn) => {
      try {
        fn(newAlert);
      } catch (e) {
        console.error('[InternalAlertsService] Erro no listener de alerta:', e);
      }
    });

    return newAlert;
  }

  /**
   * Resolve um alerta ativo pelo key ou ID e registra histórico
   */
  public resolveAlert(keyOrId: string, recoveryResult?: string): boolean {
    let targetKey = keyOrId;
    let alert = this.activeAlerts.get(targetKey);

    if (!alert) {
      // Tenta localizar por ID
      for (const [k, a] of this.activeAlerts.entries()) {
        if (a.id === keyOrId) {
          targetKey = k;
          alert = a;
          break;
        }
      }
    }

    if (!alert) return false;

    this.activeAlerts.delete(targetKey);

    const defaultRecoverySound = alert.origin === 'brizex'
      ? 'integracao_restabelecida'
      : alert.key === 'whatsapp_disconnected'
      ? 'whatsapp_reconectado'
      : 'reconexao_concluida';

    const resolvedAlert: InternalAlert = {
      ...alert,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      recoveryResult: recoveryResult || 'Problema resolvido com sucesso pelo sistema ou operador.',
      recoverySoundEvent: alert.recoverySoundEvent || defaultRecoverySound
    };

    this.resolvedAlerts.unshift(resolvedAlert);
    if (this.resolvedAlerts.length > 100) {
      this.resolvedAlerts = this.resolvedAlerts.slice(0, 100);
    }
    this.saveAlerts();

    console.log(`[InternalAlertsService] 🟢 Alerta Resolvido: ${alert.title} (Motivo: ${resolvedAlert.recoveryResult})`);

    auditEventsService.addEvent({
      type: 'system_alert',
      level: 'success',
      title: `Alerta Resolvido: ${alert.title}`,
      description: resolvedAlert.recoveryResult || 'Alerta marcado como concluído/recuperado.',
      details: { alertKey: targetKey, resolvedAt: resolvedAlert.resolvedAt },
      soundEvent: resolvedAlert.recoverySoundEvent
    });

    return true;
  }

  /**
   * Monitora eventos de auditoria e sincroniza com o quadro de alertas ativos
   */
  public handleAuditEvent(event: AuditEvent): void {
    if (!this.settings.enabled) return;

    // 1. WhatsApp
    if (event.type === 'whatsapp_connection') {
      if (event.level === 'success') {
        if (this.settings.notifyOnReconnect) {
          this.resolveAlert(
            'whatsapp_disconnected',
            `WhatsApp restabelecido: ${event.details?.phoneNumber ? `+${event.details.phoneNumber}` : 'Conexão ativa'}`
          );
        }
      } else if (
        event.level === 'error' ||
        event.level === 'warning' ||
        event.details?.isDrop === true ||
        (event.details?.attempt === 1 && !event.details?.manual) ||
        event.title.toLowerCase().includes('queda') ||
        event.title.toLowerCase().includes('desconexão')
      ) {
        // Ignora desconexão manual voluntária do operador
        if (event.title === 'Desconexão Manual' || event.details?.manual === true) {
          return;
        }

        if (this.settings.notifyOnDisconnect) {
          const isExhausted = Boolean(
            event.details?.isExhausted ||
            (event.details?.attempts !== undefined && event.details?.attempts >= (event.details?.maxAttempts || 10))
          );

          this.triggerAlert('whatsapp_disconnected', {
            severity: isExhausted ? 'critical' : 'warning',
            title: isExhausted ? 'WhatsApp Desconectado (Ação Necessária)' : 'Queda de Conexão WhatsApp',
            description: event.description,
            origin: 'whatsapp',
            details: event.details,
            soundEvent: 'whatsapp_desconectado',
            recoverySoundEvent: 'whatsapp_reconectado',
            recommendedAction: isExhausted
              ? 'Abra a Conexão WhatsApp e reconecte via QR Code ou clique em Forçar Reconexão.'
              : 'O UpZap está tentando restabelecer a conexão automaticamente. Aguarde ou clique em Forçar Reconexão.'
          });
        }
      }
    }

    // 2. Proteção Anti-Loop
    else if (event.type === 'loop_detected') {
      if (this.settings.notifyOnLoops) {
        const contact = event.details?.phone ? `+${event.details.phone}` : 'Contato';
        this.triggerAlert(`loop_${event.details?.phone || 'generic'}`, {
          severity: 'warning',
          title: 'Loop de Mensagens Detectado',
          description: `Disparo repetitivo contido para ${contact}. Atendimento pausado por segurança.`,
          origin: 'automacao',
          details: event.details,
          soundEvent: 'fluxo_falhou',
          recommendedAction: 'Verifique as regras e o fluxo de mensagens desse contato.'
        });
      }
    }

    // 3. Falhas na Integração Brizex
    else if (event.title.includes('Brizex') && (event.level === 'error' || event.level === 'warning')) {
      if (this.settings.notifyOnBrizexError) {
        this.triggerAlert('brizex_integration_error', {
          severity: 'error',
          title: event.title,
          description: event.description,
          origin: 'brizex',
          details: event.details,
          soundEvent: 'brizex_indisponivel',
          recoverySoundEvent: 'integracao_restabelecida',
          recommendedAction: 'Verifique o token de webhook e a URL de retorno na Brizex / Logzz.'
        });
      }
    }

    // 4. Falha de Sincronização de Pedido
    else if (event.title.toLowerCase().includes('pedido') && event.level === 'error') {
      this.triggerAlert(`order_sync_${event.details?.orderId || Date.now()}`, {
        severity: 'error',
        title: event.title,
        description: event.description,
        origin: 'brizex',
        details: event.details,
        soundEvent: 'pedido_sincronizacao_falhou',
        recoverySoundEvent: 'integracao_restabelecida',
        recommendedAction: 'Verifique o payload do pedido recebido e tente reprocessar.'
      });
    }

    // 5. Falha na Execução de Fluxo
    else if (event.title.toLowerCase().includes('fluxo') && event.level === 'error') {
      this.triggerAlert(`flow_fail_${event.details?.flowId || Date.now()}`, {
        severity: 'error',
        title: event.title,
        description: event.description,
        origin: 'automacao',
        details: event.details,
        soundEvent: 'fluxo_falhou',
        recoverySoundEvent: 'reconexao_concluida',
        recommendedAction: 'Inspecione os blocos do fluxo e a conectividade com as mídias.'
      });
    }

    // 6. Erros Críticos de Sistema / Servidor
    else if (event.level === 'error' && this.settings.notifyOnCriticalErrors) {
      this.triggerAlert(`error_${event.id}`, {
        severity: 'error',
        title: `Erro do Sistema: ${event.title}`,
        description: event.description,
        origin: 'sistema',
        details: event.details,
        soundEvent: (event.details?.soundEvent as any) || 'erro_critico',
        recoverySoundEvent: 'reconexao_concluida',
        recommendedAction: 'Inspecione a linha do tempo técnica ou reinicie o processo se necessário.'
      });
    }
  }

  /**
   * Alerta de parada do servidor (execução limpa no graceful shutdown)
   */
  public async notifyServerShutdown(reason: string): Promise<void> {
    console.log(`[InternalAlertsService] ⚠️ Servidor UpZap parando: ${reason}`);
    this.triggerAlert('server_shutdown', {
      severity: 'critical',
      title: 'Servidor UpZap Interrompido',
      description: `Processo encerrado. Motivo: ${reason}`,
      origin: 'sistema',
      recommendedAction: 'Reinicie o servidor Node/PM2 para retomar o atendimento.'
    });
  }

  /**
   * Teste de alerta interno operacional
   */
  public testAlert(): { success: boolean; message: string; alert?: InternalAlert } {
    const alert = this.triggerAlert('test_internal_alert', {
      severity: 'warning',
      title: 'Alerta Operacional de Teste',
      description: 'Este é um teste do sistema de alertas sonoros e visuais internos do UpZap.',
      origin: 'sistema',
      details: { testedAt: new Date().toISOString() },
      recommendedAction: 'Clique no botão Resolver Alerta para confirmar que o teste foi concluído com sucesso.'
    });

    return {
      success: true,
      message: 'Alerta de teste gerado com sucesso na Central de Monitoramento.',
      alert
    };
  }
}

// Exporta singleton compatível com o import existente em server.ts
export const alertsNotifierService = InternalAlertsService.getInstance();
