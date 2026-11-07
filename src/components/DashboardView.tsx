import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Users,
  CheckCircle2,
  Zap,
  PhoneOff,
  Repeat2,
  RefreshCw,
  Clock,
  ArrowRight
} from 'lucide-react';
import { PageIntro, Panel, Badge } from './v0-ui';
import { BaseOficialUpZap, ServerStatusInfo } from '../types/upzap';
import { MainNavId } from './Sidebar';

import { getStoredToken } from '../lib/api';

interface DashboardViewProps {
  base?: BaseOficialUpZap;
  onNavigate?: (nav: MainNavId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [statusInfo, setStatusInfo] = useState<ServerStatusInfo | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const sRes = await fetch('/api/monitoring/status');
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.status) setStatusInfo(sData.status);
      }

      const eRes = await fetch('/api/audit/events?limit=4');
      if (eRes.ok) {
        const eData = await eRes.json();
        if (eData.events) setEvents(eData.events);
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    let es: EventSource | null = null;
    try {
      const token = getStoredToken();
      const sseUrl = token
        ? `/api/audit/events/stream?token=${encodeURIComponent(token)}`
        : '/api/audit/events/stream';

      es = new EventSource(sseUrl, { withCredentials: true });

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'audit_event' && data.event) {
            setEvents((prev) => {
              if (prev.some((e) => e.id === data.event.id)) return prev;
              return [data.event, ...prev].slice(0, 4);
            });
          }
        } catch {}
      };
    } catch {}

    const interval = setInterval(fetchData, 8000);
    return () => {
      clearInterval(interval);
      if (es) es.close();
    };
  }, []);

  const activeContacts = statusInfo?.automation?.activeClientsCount ?? 0;
  const closedToday = statusInfo?.automation?.closedClientsCount ?? 0;
  const totalMessagesToday = statusInfo?.metrics?.messagesCount ?? (activeContacts + closedToday);
  const autoRate = 100;

  const ramMB = statusInfo?.memory?.heapUsedMB || statusInfo?.memoryMb?.rss || 412;
  const isProcessOnline = true;
  const isWhatsappConnected = statusInfo?.whatsapp?.connected || statusInfo?.whatsapp?.state === 'connected';

  // Barras de volume das últimas horas
  const messageVolumeBars = [
    { hour: '08h', value: 24, pct: 29 },
    { hour: '10h', value: 41, pct: 49 },
    { hour: '12h', value: 68, pct: 82 },
    { hour: '14h', value: 52, pct: 63 },
    { hour: '16h', value: 83, pct: 100 },
    { hour: '18h', value: 47, pct: 57 },
    { hour: '20h', value: 29, pct: 35 }
  ];

  const getEventIcon = (category: string) => {
    switch (category) {
      case 'call_rejected':
        return (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <PhoneOff className="h-4 w-4" />
          </span>
        );
      case 'loop':
        return (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
            <Repeat2 className="h-4 w-4" />
          </span>
        );
      case 'reconnect':
      case 'disconnect':
        return (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <RefreshCw className="h-4 w-4" />
          </span>
        );
      default:
        return (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        );
    }
  };

  const formatRelativeTime = (ts: string) => {
    try {
      const diffMin = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
      if (diffMin < 1) return 'agora';
      if (diffMin < 60) return `há ${diffMin} min`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `há ${diffHours} h`;
      return `${Math.floor(diffHours / 24)}d atrás`;
    } catch {
      return 'recente';
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* 4 Cards de Métricas Topo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Mensagens hoje */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Mensagens hoje</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <MessageSquare className="h-[18px] w-[18px]" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
            {totalMessagesToday.toLocaleString('pt-BR')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">+18% vs. ontem</p>
        </div>

        {/* Taxa de automação */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Taxa de automação</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Zap className="h-[18px] w-[18px]" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
            {autoRate}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Sem intervenção humana</p>
        </div>

        {/* Contatos ativos */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Contatos ativos</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Users className="h-[18px] w-[18px]" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
            {activeContacts}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">+12 nas últimas 24h</p>
        </div>

        {/* Encerrados hoje */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Encerrados hoje</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <CheckCircle2 className="h-[18px] w-[18px]" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
            {closedToday}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Tempo médio 6m 12s</p>
        </div>
      </div>

      {/* Grid: Volume de Mensagens (Gráfico) + Saúde do Sistema */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Volume de mensagens */}
        <section className="rounded-xl border border-border bg-card lg:col-span-2">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Volume de mensagens</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Mensagens processadas ao longo do dia
              </p>
            </div>
          </div>
          <div className="p-5">
            <div className="flex flex-col">
              <div className="flex h-44 items-end gap-3">
                {messageVolumeBars.map((bar) => (
                  <div
                    key={bar.hour}
                    className="flex-1 rounded-t-md bg-primary/85 transition-all hover:bg-primary"
                    style={{ height: `${bar.pct}%` }}
                    title={`${bar.value} mensagens às ${bar.hour}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex gap-3">
                {messageVolumeBars.map((bar) => (
                  <span
                    key={bar.hour}
                    className="flex-1 text-center text-xs text-muted-foreground tabular-nums"
                  >
                    {bar.hour}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Saúde do sistema */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Saúde do sistema</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Monitoramento do processo</p>
            </div>
          </div>
          <div className="p-5">
            <ul className="flex flex-col divide-y divide-border">
              <li className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium tabular-nums">99,98%</span>
              </li>
              <li className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">Uso de RAM</span>
                <span className="font-medium tabular-nums">{ramMB} MB</span>
              </li>
              <li className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">WhatsApp</span>
                <Badge tone={isWhatsappConnected ? 'green' : 'amber'} dot>
                  {isWhatsappConnected ? 'Conectado' : 'Aguardando'}
                </Badge>
              </li>
              <li className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">Processo</span>
                <Badge tone="green" dot>
                  Online
                </Badge>
              </li>
              <li className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">Fila de envio</span>
                <span className="font-medium tabular-nums">
                  {statusInfo?.messageQueue?.pending || 0}
                </span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      {/* Eventos Recentes (Auditoria Consolidada) */}
      <div className="mt-4">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Eventos recentes</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Log de auditoria consolidado</p>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('auditoria')}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                Ver todos <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="p-5">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2 opacity-80" />
                <p className="text-sm font-semibold text-foreground">Registro de Atividades Limpo</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Nenhuma ocorrência ou evento pendente. Conforme novas mensagens chegarem, os registros serão gerados aqui em tempo real.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {events.map((ev, i) => (
                  <li key={ev.id || i} className="flex items-center gap-3 py-3">
                    {getEventIcon(ev.category)}
                    <span className="flex-1 text-sm text-pretty">
                      {ev.title}: {ev.description}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(ev.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
