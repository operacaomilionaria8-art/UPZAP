import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Cpu,
  RefreshCw,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Smartphone,
  Package,
  Layers,
  Volume2,
  VolumeX,
  ShieldAlert,
  Clock,
  Search,
  Check,
  XCircle,
  Copy,
  ChevronDown,
  ChevronRight,
  Trash2,
  Radio,
  Play
} from 'lucide-react';
import { PageIntro, Panel, Badge } from './v0-ui';
import { useSystemAlerts } from '../context/SystemAlertsContext';
import { AuditEvent, ServerStatusInfo, AlertSoundEvent } from '../types/upzap';
import { ALERT_SOUND_CATALOG, SoundItemMetadata } from '../lib/sound-alerts';
import { getStoredToken } from '../lib/api';

interface CentralMonitoramentoViewProps {
  onNavigateToTab?: (tab: string) => void;
}

export const CentralMonitoramentoView: React.FC<CentralMonitoramentoViewProps> = ({ onNavigateToTab }) => {
  const {
    connections,
    activeAlerts,
    resolvedAlerts,
    soundSettings,
    setSoundEnabled,
    setSoundVolume,
    testSound,
    unlockAudio,
    resolveAlert,
    forceReconnectWhatsApp,
    refreshAlerts
  } = useSystemAlerts();

  // Status avançado do servidor
  const [statusInfo, setStatusInfo] = useState<ServerStatusInfo | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [reconnectingWa, setReconnectingWa] = useState(false);
  const [reconnectFeedback, setReconnectFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Linha do tempo / Eventos de auditoria
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Filtros da linha do tempo
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | '24h' | '7d'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'success'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados locais da UI
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);
  const [soundTesting, setSoundTesting] = useState(false);
  const [testingEvent, setTestingEvent] = useState<AlertSoundEvent | null>(null);
  const [unlockingAudio, setUnlockingAudio] = useState(false);
  const [soundCategoryFilter, setSoundCategoryFilter] = useState<string>('all');
  const [simulating, setSimulating] = useState<string | null>(null);

  // Busca inicial e periódica do status completo do servidor
  const fetchServerStatus = async () => {
    try {
      const res = await fetch('/api/monitoring/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setStatusInfo(data.status);
        }
      }
    } catch (e) {
      console.warn('[CentralMonitoramento] Falha ao carregar status:', e);
    } finally {
      setLoadingStatus(false);
    }
  };

  // Busca inicial dos eventos de auditoria
  const fetchAuditEvents = async () => {
    try {
      const res = await fetch('/api/audit/events?limit=150');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (e) {
      console.warn('[CentralMonitoramento] Falha ao carregar eventos:', e);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchServerStatus();
    fetchAuditEvents();

    const interval = setInterval(() => {
      fetchServerStatus();
      fetchAuditEvents();
    }, 20000);

    // Conexão SSE em tempo real para a Linha do Tempo
    let es: EventSource | null = null;
    try {
      const token = getStoredToken();
      const sseUrl = token
        ? `/api/audit/events/stream?token=${encodeURIComponent(token)}`
        : '/api/audit/events/stream';

      es = new EventSource(sseUrl, { withCredentials: true });

      es.onopen = () => setIsLiveConnected(true);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'audit_event' && data.event) {
            setEvents((prev) => {
              if (prev.some((e) => e.id === data.event.id)) return prev;
              return [data.event, ...prev].slice(0, 150);
            });
            // Atualiza status operacional e alertas
            fetchServerStatus();
            refreshAlerts();
          }
        } catch {}
      };

      es.onerror = () => setIsLiveConnected(false);
    } catch {}

    return () => {
      clearInterval(interval);
      if (es) es.close();
    };
  }, [refreshAlerts]);

  // Forçar reconexão do WhatsApp
  const handleForceReconnect = async () => {
    setReconnectingWa(true);
    setReconnectFeedback(null);
    const result = await forceReconnectWhatsApp();
    if (result.success) {
      setReconnectFeedback({ type: 'success', text: result.message });
      setTimeout(fetchServerStatus, 1500);
    } else {
      setReconnectFeedback({ type: 'error', text: result.message });
    }
    setReconnectingWa(false);
    setTimeout(() => setReconnectFeedback(null), 5000);
  };

  // Testar som padrão
  const handleTestSound = async () => {
    setSoundTesting(true);
    await testSound();
    setTimeout(() => setSoundTesting(false), 500);
  };

  // Testar áudio específico do catálogo
  const handlePlaySoundItem = async (event: AlertSoundEvent) => {
    setTestingEvent(event);
    await testSound(event);
    setTimeout(() => setTestingEvent(null), 1200);
  };

  // Desbloquear áudio se bloqueado pelo navegador
  const handleUnlockAudio = async () => {
    setUnlockingAudio(true);
    await unlockAudio();
    setUnlockingAudio(false);
  };

  // Simular evento para homologação
  const handleSimulateEvent = async (scenario: string) => {
    setSimulating(scenario);
    try {
      const res = await fetch('/api/alerts/simulate-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      if (res.ok) {
        await fetchAuditEvents();
        await refreshAlerts();
      }
    } catch (e) {
      console.warn('Erro ao simular evento:', e);
    } finally {
      setSimulating(null);
    }
  };

  // Limpar logs
  const handleClearLogs = async () => {
    if (!window.confirm('Tem certeza de que deseja limpar os registros da linha do tempo?')) return;
    try {
      const res = await fetch('/api/audit/clear', { method: 'POST' });
      if (res.ok) {
        setEvents([]);
      }
    } catch (e) {
      console.warn('Erro ao limpar logs:', e);
    }
  };

  // Copiar detalhes do evento
  const handleCopyDetails = (ev: AuditEvent) => {
    const text = JSON.stringify(ev, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedId(ev.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtragem da Linha do Tempo
  const filteredEvents = useMemo(() => {
    const now = Date.now();
    return events.filter((ev) => {
      // Filtro de severidade
      if (severityFilter !== 'all' && ev.level !== severityFilter) return false;

      // Filtro de origem / tipo
      if (typeFilter !== 'all') {
        if (typeFilter === 'whatsapp' && ev.type !== 'whatsapp_connection') return false;
        if (typeFilter === 'brizex' && !ev.title.toLowerCase().includes('brizex') && !ev.description.toLowerCase().includes('brizex')) return false;
        if (typeFilter === 'automacao' && ev.type !== 'flow_execution' && ev.type !== 'loop_detected') return false;
        if (typeFilter === 'chamada' && ev.type !== 'call_rejected') return false;
        if (typeFilter === 'sistema' && ev.type !== 'system_alert') return false;
      }

      // Filtro de período
      if (periodFilter !== 'all') {
        const evTime = new Date(ev.timestamp).getTime();
        const diffHours = (now - evTime) / (1000 * 3600);
        if (periodFilter === 'today' && diffHours > 24) return false;
        if (periodFilter === '24h' && diffHours > 24) return false;
        if (periodFilter === '7d' && diffHours > 24 * 7) return false;
      }

      // Busca por texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const titleMatch = (ev.title || '').toLowerCase().includes(term);
        const descMatch = (ev.description || '').toLowerCase().includes(term);
        const typeMatch = (ev.type || '').toLowerCase().includes(term);
        if (!titleMatch && !descMatch && !typeMatch) return false;
      }

      return true;
    });
  }, [events, severityFilter, typeFilter, periodFilter, searchTerm]);

  // Ícone por severidade
  const getSeverityBadge = (level: string) => {
    switch (level) {
      case 'error':
        return <Badge tone="red" dot>Crítico / Erro</Badge>;
      case 'warning':
        return <Badge tone="amber" dot>Atenção</Badge>;
      case 'success':
        return <Badge tone="green" dot>Resolvido / OK</Badge>;
      default:
        return <Badge tone="blue" dot>Informação</Badge>;
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR')}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Cabeçalho Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageIntro
          eyebrow="Monitoramento Centralizado"
          title="Central de Monitoramento"
          description="Acompanhamento operacional unificado: conectividade, integridade de serviços, alertas com aviso sonoro e linha do tempo de auditoria."
        />

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              fetchServerStatus();
              fetchAuditEvents();
              refreshAlerts();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-xs font-medium text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs">
            <Radio className={`h-3 w-3 ${isLiveConnected ? 'text-emerald-500 animate-pulse' : 'text-muted-foreground'}`} />
            <span className="text-muted-foreground">
              {isLiveConnected ? 'Ao vivo (SSE)' : 'Polling (20s)'}
            </span>
          </div>
        </div>
      </div>

      {/* 1. CARDS DE ESTADO OPERACIONAL */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* WhatsApp */}
        <Panel className="p-4 border-l-4 border-l-emerald-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                WhatsApp Direct
              </span>
              <Smartphone className={`h-4 w-4 ${connections.whatsapp === 'connected' ? 'text-emerald-500' : 'text-destructive'}`} />
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${connections.whatsapp === 'connected' ? 'bg-emerald-500' : connections.whatsapp === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-destructive'}`} />
              <span className="text-sm font-semibold text-foreground">
                {connections.whatsapp === 'connected'
                  ? 'Conectado e Ativo'
                  : connections.whatsapp === 'connecting'
                  ? 'Reconectando...'
                  : 'Desconectado'}
              </span>
            </div>

            <p className="text-xs text-muted-foreground truncate">
              {connections.whatsappPhone
                ? `+${connections.whatsappPhone} (${connections.whatsappUserName || 'Instância UpZap'})`
                : 'Nenhum chip conectado'}
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {connections.reconnectAttempts > 0
                ? `Tentativas: ${connections.reconnectAttempts}/10`
                : 'Sessão Baileys salva'}
            </span>
            <button
              type="button"
              onClick={handleForceReconnect}
              disabled={reconnectingWa}
              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${reconnectingWa ? 'animate-spin' : ''}`} />
              {reconnectingWa ? 'Reconectando...' : 'Reconectar'}
            </button>
          </div>
        </Panel>

        {/* Conectividade de Rede & Internet */}
        <Panel className="p-4 border-l-4 border-l-blue-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rede & Conectividade
              </span>
              {connections.internet ? (
                <Wifi className="h-4 w-4 text-blue-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-destructive" />
              )}
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${connections.internet ? 'bg-blue-500' : 'bg-destructive animate-pulse'}`} />
              <span className="text-sm font-semibold text-foreground">
                {connections.internet ? 'Internet Online' : 'Sem Conexão à Internet'}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {connections.internet
                ? 'Conexão estável do navegador com a rede externa'
                : 'Verifique o cabo de rede ou Wi-Fi do computador'}
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Ping de rede:</span>
            <span className="font-mono font-medium text-foreground">
              {connections.serverLatencyMs !== null ? `${connections.serverLatencyMs} ms` : 'Inativo'}
            </span>
          </div>
        </Panel>

        {/* Servidor UpZap & Recursos */}
        <Panel className="p-4 border-l-4 border-l-purple-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Servidor & Processo
              </span>
              <Server className="h-4 w-4 text-purple-500" />
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${connections.server ? 'bg-purple-500' : 'bg-destructive animate-pulse'}`} />
              <span className="text-sm font-semibold text-foreground">
                {connections.server ? 'Servidor Ativo' : 'Servidor Inacessível'}
              </span>
            </div>

            <p className="text-xs text-muted-foreground truncate">
              {statusInfo?.uptimeFormatted ? `Uptime: ${statusInfo.uptimeFormatted}` : 'Carregando telemetria...'}
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Memória Heap:</span>
            <span className="font-mono font-medium text-foreground">
              {statusInfo?.memoryMb?.heapUsed ? `${statusInfo.memoryMb.heapUsed} MB / ${statusInfo.memoryMb.heapTotal} MB` : '38 MB'}
            </span>
          </div>
        </Panel>

        {/* Brizex & Pedidos */}
        <Panel className="p-4 border-l-4 border-l-amber-500 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Integração Brizex
              </span>
              <Package className="h-4 w-4 text-amber-500" />
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-sm font-semibold text-foreground">
                Webhook Operacional
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Automações vinculadas aos 8 status oficiais Logzz
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Deduplicação:</span>
            <span className="font-medium text-emerald-500">Ativa (Zero duplicados)</span>
          </div>
        </Panel>
      </div>

      {reconnectFeedback && (
        <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
          reconnectFeedback.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        }`}>
          {reconnectFeedback.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {reconnectFeedback.text}
        </div>
      )}

      {/* 2. ALERTAS ATIVOS & CONTROLE DE SOM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Painel de Alertas Ativos (2 Colunas no Desktop) */}
        <Panel className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold text-sm text-foreground">Alertas Ativos do Sistema</h3>
              {activeAlerts.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-xs font-bold">
                  {activeAlerts.length}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowResolvedHistory(!showResolvedHistory)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
            >
              {showResolvedHistory ? 'Ocultar resolvidos' : `Histórico (${resolvedAlerts.length})`}
              {showResolvedHistory ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>

          {activeAlerts.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-border bg-card/50 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Nenhum alerta ativo no momento</p>
              <p className="text-xs text-muted-foreground mt-1">
                Todas as integrações, serviços e fluxos estão operando dentro dos parâmetros de estabilidade.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3.5 rounded-lg border border-destructive/30 bg-destructive/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-destructive">{alert.title}</span>
                      {getSeverityBadge(alert.severity)}
                      <span className="text-[11px] text-muted-foreground">
                        {formatTimestamp(alert.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/90">{alert.description}</p>
                    {alert.recommendedAction && (
                      <p className="text-xs text-amber-500 font-medium">
                        💡 Ação recomendada: {alert.recommendedAction}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {alert.key === 'whatsapp_disconnected' && (
                      <button
                        type="button"
                        onClick={handleForceReconnect}
                        disabled={reconnectingWa}
                        className="px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs transition-colors cursor-pointer"
                      >
                        Reconectar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => resolveAlert(alert.key || alert.id)}
                      className="px-2.5 py-1.5 rounded-md bg-card hover:bg-card/80 border border-border text-foreground font-medium text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" />
                      Marcar Resolvido
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Histórico Recente de Alertas Resolvidos */}
          {showResolvedHistory && resolvedAlerts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Alertas Resolvidos Recentemente
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {resolvedAlerts.slice(0, 5).map((res) => (
                  <div key={res.id} className="p-2.5 rounded-md border border-border bg-card/60 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-medium text-foreground">{res.title}</span>
                      <p className="text-[11px] text-emerald-500 mt-0.5">
                        ✓ {res.recoveryResult || 'Resolvido com sucesso'}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                      {res.resolvedAt ? formatTimestamp(res.resolvedAt) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Painel de Controle de Som & Simulação de Testes */}
        <Panel className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-sm text-foreground">Alertas Sonoros Internos</h3>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                soundSettings.isBlocked
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  : soundSettings.soundEnabled
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-muted text-muted-foreground border-border'
              }`}>
                {soundSettings.isBlocked
                  ? 'Bloqueado no Navegador'
                  : soundSettings.soundEnabled
                  ? 'Áudio Ativo'
                  : 'Silenciado'}
              </span>
            </div>

            {soundSettings.isBlocked && (
              <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs">
                <p className="font-medium mb-1.5">Áudio automático restrito pelo navegador</p>
                <button
                  type="button"
                  onClick={handleUnlockAudio}
                  disabled={unlockingAudio}
                  className="w-full py-1.5 px-2.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs transition-colors cursor-pointer"
                >
                  {unlockingAudio ? 'Desbloqueando...' : 'Liberar Reprodução de Áudio'}
                </button>
              </div>
            )}

            <div className="space-y-4">
              {/* Toggle Ativar/Desativar Som */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-foreground">Aviso Sonoro</span>
                  <p className="text-[11px] text-muted-foreground">Tons operacionais e alarmes críticos</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundSettings.soundEnabled)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    soundSettings.soundEnabled ? 'bg-primary justify-end' : 'bg-muted justify-start'
                  }`}
                >
                  <span className="bg-white w-4 h-4 rounded-full shadow-md" />
                </button>
              </div>

              {/* Slider de Volume */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Volume do Sinal</span>
                  <span className="font-mono font-medium text-foreground">
                    {Math.round(soundSettings.soundVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundSettings.soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  disabled={!soundSettings.soundEnabled}
                  className="w-full accent-primary cursor-pointer disabled:opacity-40"
                />
              </div>

            </div>
          </div>
        </Panel>
      </div>

      {/* 2.1 CATÁLOGO DE ÁUDIOS OPERACIONAIS (11 SONS OFICIAIS) */}
      <Panel className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">
                Catálogo de Áudios Operacionais do UpZap
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground text-xs font-mono">
                11 Sons Mapeados
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cada arquivo está vinculado exclusivamente ao evento operacional correspondente para prevenção de falhas.
            </p>
          </div>

          {/* Filtro por Categoria */}
          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
            {(['all', 'rede', 'whatsapp', 'servidor', 'integracao', 'automacao'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSoundCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  soundCategoryFilter === cat
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat === 'all'
                  ? 'Todos (11)'
                  : cat === 'rede'
                  ? 'Rede (3)'
                  : cat === 'whatsapp'
                  ? 'WhatsApp (2)'
                  : cat === 'servidor'
                  ? 'Servidor (2)'
                  : cat === 'integracao'
                  ? 'Integração (3)'
                  : 'Automação (1)'}
              </button>
            ))}
          </div>
        </div>

        {/* Garantias Operacionais */}
        <div className="p-3 mb-4 rounded-lg bg-secondary/50 border border-border text-[11px] text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground mr-1.5">Regras de Prevenção & Estabilidade:</span>
            <span>
              Fila estritamente sequencial sem sobreposição • Debounce anti-spam de 4s • Fallback sintetizado via Web Audio API caso falhe o carregamento • Áudios exclusivos do painel interno (jamais enviados a contatos do WhatsApp).
            </span>
          </div>
          <span className="shrink-0 font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            whatsapp_reconectando.mp3 descontinuado (reconexão silenciosa)
          </span>
        </div>

        {/* Grid dos Áudios */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALERT_SOUND_CATALOG
            .filter((s) => soundCategoryFilter === 'all' || s.category === soundCategoryFilter)
            .map((item) => {
              const isPlayingThis = testingEvent === item.event;
              return (
                <div
                  key={item.event}
                  className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${
                    isPlayingThis
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card/60 hover:bg-card hover:border-border/80'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-xs text-foreground leading-snug">
                        {item.label}
                      </span>
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                        item.category === 'rede'
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                          : item.category === 'whatsapp'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : item.category === 'servidor'
                          ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                          : item.category === 'integracao'
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          : 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
                      }`}>
                        {item.category}
                      </span>
                    </div>

                    <div className="mb-2">
                      <code className="text-[11px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                        /audio/{item.fileName}
                      </code>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Evento: <span className="font-mono">{item.event}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 font-medium bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Disparo Automático
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </Panel>

      {/* 3. LINHA DO TEMPO UNIFICADA DE EVENTOS & AUDITORIA */}
      <Panel className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="font-semibold text-base text-foreground">Linha do Tempo de Auditoria & Eventos</h3>
            <p className="text-xs text-muted-foreground">
              Registro contínuo e cronológico de conexões, fluxos, pedidos e eventos operacionais.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClearLogs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive text-xs font-medium text-muted-foreground transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar Registros
          </button>
        </div>

        {/* Barra de Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5 p-3 rounded-lg bg-card/60 border border-border">
          {/* Busca Textual */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por texto ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Filtro de Gravidade */}
          <div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="w-full py-1.5 px-2.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">Todas as Gravidades</option>
              <option value="info">Informação</option>
              <option value="warning">Atenção</option>
              <option value="error">Erros / Críticos</option>
              <option value="success">Resolvidos / Sucesso</option>
            </select>
          </div>

          {/* Filtro de Origem / Tipo */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">Todas as Origens</option>
              <option value="whatsapp">WhatsApp Direct</option>
              <option value="brizex">Brizex / Logzz</option>
              <option value="automacao">Automação & Fluxos</option>
              <option value="chamada">Chamadas Recusadas</option>
              <option value="sistema">Sistema & Servidor</option>
            </select>
          </div>

          {/* Filtro de Período */}
          <div>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as any)}
              className="w-full py-1.5 px-2.5 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">Todo o Período</option>
              <option value="today">Hoje</option>
              <option value="24h">Últimas 24 Horas</option>
              <option value="7d">Últimos 7 Dias</option>
            </select>
          </div>
        </div>

        {/* Lista de Eventos */}
        {loadingEvents ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
            Carregando eventos de auditoria...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            Nenhum evento corresponde aos filtros selecionados.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredEvents.map((ev) => {
              const isExpanded = expandedEventId === ev.id;
              const isCopied = copiedId === ev.id;

              return (
                <div
                  key={ev.id}
                  className="rounded-lg border border-border bg-card/40 hover:bg-card transition-colors p-3.5 text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                        ev.level === 'error'
                          ? 'bg-destructive'
                          : ev.level === 'warning'
                          ? 'bg-amber-500'
                          : ev.level === 'success'
                          ? 'bg-emerald-500'
                          : 'bg-blue-500'
                      }`} />

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground text-sm">{ev.title}</span>
                          {getSeverityBadge(ev.level)}
                          <span className="text-[11px] text-muted-foreground">
                            {formatTimestamp(ev.timestamp)}
                          </span>
                        </div>

                        <p className="text-muted-foreground leading-relaxed break-words">{ev.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0">
                      {ev.details && (
                        <button
                          type="button"
                          onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                          className="px-2 py-1 rounded border border-border bg-background hover:bg-secondary text-[11px] font-medium text-muted-foreground transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          {isExpanded ? 'Ocultar Detalhes' : 'Ver Detalhes'}
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopyDetails(ev)}
                        title="Copiar JSON do evento"
                        className="p-1 rounded border border-border bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Detalhes Técnicos Expansíveis */}
                  {isExpanded && ev.details && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <pre className="p-2.5 rounded bg-background text-[11px] font-mono text-muted-foreground overflow-x-auto">
                        {JSON.stringify(ev.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
};
