import fs from 'fs';
import path from 'path';

export type AuditEventType =
  | 'whatsapp_connection'
  | 'loop_detected'
  | 'call_rejected'
  | 'automation_pause'
  | 'flow_execution'
  | 'system_alert';
export type AuditEventLevel = 'info' | 'warning' | 'error' | 'success';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  level: AuditEventLevel;
  title: string;
  description: string;
  timestamp: string;
  details?: Record<string, any>;
  soundEvent?: string;
}

export class AuditEventsService {
  private static instance: AuditEventsService;
  private auditFile: string;
  private callLogsFile: string;
  private listeners: ((event: AuditEvent) => void)[] = [];

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.auditFile = path.join(dataDir, 'audit_events.json');
    this.callLogsFile = path.join(dataDir, 'call_logs.json');
  }

  public static getInstance(): AuditEventsService {
    if (!AuditEventsService.instance) {
      AuditEventsService.instance = new AuditEventsService();
    }
    return AuditEventsService.instance;
  }

  /**
   * Registra um listener para ser notificado imediatamente quando novos eventos forem gravados
   */
  public onEvent(listener: (event: AuditEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Obtém os eventos de auditoria persistidos
   */
  public getStoredEvents(): AuditEvent[] {
    try {
      if (fs.existsSync(this.auditFile)) {
        const raw = fs.readFileSync(this.auditFile, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          return data;
        }
      }
    } catch (err) {
      console.error('[AuditEventsService] Erro ao ler audit_events.json:', err);
    }
    return [];
  }

  /**
   * Salva a lista de eventos de auditoria
   */
  private saveEvents(events: AuditEvent[]): void {
    try {
      const trimmed = events.slice(0, 500); // Limite de 500 registros para evitar sobrecarga
      fs.writeFileSync(this.auditFile, JSON.stringify(trimmed, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AuditEventsService] Erro ao salvar audit_events.json:', err);
    }
  }

  /**
   * Adiciona um novo evento de auditoria
   */
  public addEvent(event: Omit<AuditEvent, 'id' | 'timestamp'> & { timestamp?: string }): AuditEvent {
    const newEntry: AuditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      type: event.type,
      level: event.level,
      title: event.title,
      description: event.description,
      details: event.details,
      soundEvent: event.soundEvent
    };

    const current = this.getStoredEvents();
    current.unshift(newEntry);
    this.saveEvents(current);

    console.log(`[Auditoria] [${newEntry.level.toUpperCase()}] ${newEntry.title} - ${newEntry.description}`);

    // Notifica listeners registrados (ex: serviço de alertas no celular)
    this.listeners.forEach(fn => {
      try {
        fn(newEntry);
      } catch (err) {
        console.error('[AuditEventsService] Erro ao disparar listener:', err);
      }
    });

    return newEntry;
  }

  /**
   * Obtém todos os eventos consolidados, incluindo chamadas recusadas migradas
   */
  public getAllEvents(typeFilter?: string, limit: number = 100): AuditEvent[] {
    const auditEvents = this.getStoredEvents();

    // Carregar chamadas recusadas para unificação no log de auditoria
    let callEvents: AuditEvent[] = [];
    try {
      if (fs.existsSync(this.callLogsFile)) {
        const raw = fs.readFileSync(this.callLogsFile, 'utf-8');
        const calls = JSON.parse(raw);
        if (Array.isArray(calls)) {
          callEvents = calls.map((c: any) => ({
            id: `call_${c.id || c.timestamp}`,
            type: 'call_rejected' as AuditEventType,
            level: 'warning' as AuditEventLevel,
            title: `Chamada Recusada: ${c.pushName || c.callerNumber || 'Contato'}`,
            description: `Chamada de ${c.isVideo ? 'vídeo' : 'voz'} recusada automaticamente.${c.warningMessageSent ? ' Mensagem de aviso enviada.' : ''}`,
            timestamp: c.timestamp || new Date().toISOString(),
            details: {
              callerNumber: c.callerNumber,
              pushName: c.pushName,
              isVideo: c.isVideo,
              warningMessageSent: c.warningMessageSent,
              status: c.status
            }
          }));
        }
      }
    } catch (err) {
      console.error('[AuditEventsService] Erro ao unificar chamadas:', err);
    }

    // Combina e ordena por timestamp decrescente
    const combined = [...auditEvents, ...callEvents].sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    if (typeFilter && typeFilter !== 'all') {
      return combined.filter(e => e.type === typeFilter).slice(0, limit);
    }

    return combined.slice(0, limit);
  }

  /**
   * Limpa os eventos de auditoria
   */
  public clearEvents(typeFilter?: string): void {
    if (!typeFilter || typeFilter === 'all') {
      this.saveEvents([]);
      return;
    }

    const current = this.getStoredEvents();
    const remaining = current.filter(e => e.type !== typeFilter);
    this.saveEvents(remaining);
  }
}

export const auditEventsService = AuditEventsService.getInstance();
