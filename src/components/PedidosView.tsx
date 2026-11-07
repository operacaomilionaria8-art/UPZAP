import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  Search,
  Filter,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Truck,
  RotateCcw,
  Calendar,
  User,
  Phone,
  MapPin,
  ExternalLink,
  MessageSquare,
  FileText,
  Key,
  Copy,
  Check,
  Send,
  Plus,
  Shield,
  Activity,
  ChevronRight,
  Info
} from 'lucide-react';
import { PageIntro, Panel, Badge } from './v0-ui';
import {
  UpZapOrder,
  LogzzOrderStatus,
  BrizexIntegrationConfig,
  BrizexSyncLog,
  OrderInternalNote
} from '../types/upzap';
import { MainNavId } from './Sidebar';

interface PedidosViewProps {
  onNavigateToTab?: (tab: MainNavId) => void;
}

export const PedidosView: React.FC<PedidosViewProps> = ({ onNavigateToTab }) => {
  const [activeTab, setActiveTab] = useState<'pedidos' | 'integracao'>('pedidos');
  const [orders, setOrders] = useState<UpZapOrder[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<'today' | '7days' | '30days' | 'all'>('all');
  const [delayAlertOnly, setDelayAlertOnly] = useState<boolean>(false);
  const [humanOnly, setHumanOnly] = useState<boolean>(false);

  // Modal de Detalhes
  const [selectedOrder, setSelectedOrder] = useState<UpZapOrder | null>(null);
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [submittingNote, setSubmittingNote] = useState<boolean>(false);

  // Modal / Seção de Integração Brizex
  const [config, setConfig] = useState<BrizexIntegrationConfig | null>(null);
  const [syncLogs, setSyncLogs] = useState<BrizexSyncLog[]>([]);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [isSimulatingOrder, setIsSimulatingOrder] = useState<boolean>(false);
  const [isEditingToken, setIsEditingToken] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [savingToken, setSavingToken] = useState<boolean>(false);

  // Toast Feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSaveToken = async () => {
    const cleanSecret = tokenInput.trim();
    if (!cleanSecret) {
      showToast('O token do webhook não pode ser vazio.', 'error');
      return;
    }
    setSavingToken(true);
    try {
      const res = await fetch('/api/integrations/brizex/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookSecret: cleanSecret })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfig(data.config);
        setIsEditingToken(false);
        showToast('Token de autenticação do webhook atualizado com sucesso!', 'success');
      } else {
        showToast(data.error || 'Erro ao atualizar token.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro de comunicação ao salvar token.', 'error');
    } finally {
      setSavingToken(false);
    }
  };

  const loadData = async (isInitial = false) => {
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);
      if (searchTerm.trim()) queryParams.append('search', searchTerm.trim());
      if (periodFilter !== 'all') queryParams.append('period', periodFilter);
      if (delayAlertOnly) queryParams.append('delayAlertOnly', 'true');
      if (humanOnly) queryParams.append('humanOnly', 'true');

      const [ordersRes, statsRes, configRes, logsRes] = await Promise.all([
        fetch(`/api/orders?${queryParams.toString()}`),
        fetch('/api/orders/stats'),
        fetch('/api/integrations/brizex/config'),
        fetch('/api/integrations/brizex/logs?limit=50')
      ]);

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders || []);
      }
      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData.stats);
      }
      if (configRes.ok) {
        const cData = await configRes.json();
        setConfig(cData.config);
      }
      if (logsRes.ok) {
        const lData = await logsRes.json();
        setSyncLogs(lData.logs || []);
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do CRM de pedidos:', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => {
      loadData(false);
    }, 15000); // 15s polling
    return () => clearInterval(interval);
  }, [statusFilter, periodFilter, delayAlertOnly, humanOnly, searchTerm]);

  // Adicionar Nota Interna
  const handleAddNote = async () => {
    if (!selectedOrder || !newNoteText.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autor: 'Equipe UpZap',
          texto: newNoteText.trim()
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedOrder(data.order);
        setNewNoteText('');
        showToast('Observação interna adicionada com sucesso!', 'success');
        loadData(false);
      } else {
        showToast('Erro ao salvar observação interna', 'error');
      }
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSubmittingNote(false);
    }
  };

  // Enviar Pedido Simulado de Teste da Brizex
  const handleSendTestOrder = async () => {
    if (!config) return;
    setIsSimulatingOrder(true);
    try {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const testPayload = {
        logzzOrderId: `LGZ-TEST-${randomNum}`,
        brizexOrderId: `BRZ-TEST-${randomNum}`,
        status: 'Agendado',
        valorTotal: 197.90,
        metodoPagamento: 'Pix na entrega',
        dataCriacao: new Date().toISOString(),
        dataAgendamento: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
        cliente: {
          nome: 'Juliana Mendes Silva (Teste)',
          telefone: '11998765432',
          email: 'juliana.teste@brizex.com.br'
        },
        endereco: {
          logradouro: 'Av. Paulista',
          numero: '1000',
          bairro: 'Bela Vista',
          cidade: 'São Paulo',
          uf: 'SP',
          cep: '01310-100'
        },
        itens: [
          {
            nome: 'Calcinha Cinta Modeladora Brizex',
            quantidade: 3,
            kit: 'Kit 3 Unidades',
            tamanho: 'G',
            cor: 'Bege / Preto',
            valorTotal: 197.90
          }
        ],
        observacao: 'Pedido simulado para verificação de contrato e interrupção comercial'
      };

      const res = await fetch('/api/integrations/brizex/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.webhookSecret}`
        },
        body: JSON.stringify(testPayload)
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`Pedido teste ${data.order?.logzzOrderId} recebido e registrado!`, 'success');
        loadData(false);
      } else {
        const errData = await res.json();
        showToast(`Erro na integração: ${errData.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Falha no envio: ${err.message}`, 'error');
    } finally {
      setIsSimulatingOrder(false);
    }
  };

  const getStatusBadge = (status: LogzzOrderStatus) => {
    switch (status) {
      case 'Agendado':
        return <Badge tone="blue" dot>Agendado</Badge>;
      case 'Em Separação':
        return <Badge tone="amber" dot>Em Separação</Badge>;
      case 'Separado':
        return <Badge tone="amber" dot>Separado</Badge>;
      case 'Em Rota':
        return <Badge tone="purple" dot>Em Rota</Badge>;
      case 'Cancelado':
        return <Badge tone="gray">Cancelado</Badge>;
      case 'A Reagendar':
        return <Badge tone="amber" dot>A Reagendar</Badge>;
      case 'Frustrado':
        return <Badge tone="red" dot>Frustrado</Badge>;
      case 'Completo':
        return <Badge tone="green" dot>Completo</Badge>;
      default:
        return <Badge tone="gray">{status}</Badge>;
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const formatCurrency = (val?: number) => {
    if (typeof val !== 'number') return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getFullWebhookUrl = () => {
    if (typeof window === 'undefined') return '/api/integrations/brizex/orders';
    return `${window.location.origin}/api/integrations/brizex/orders`;
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 rounded-lg px-4 py-3 shadow-lg text-sm font-medium flex items-center gap-2 border animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
              : 'bg-red-950/90 text-red-200 border-red-800'
          }`}
        >
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Header com Navegação de Abas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <PageIntro
            icon={Package}
            title="CRM de Pedidos"
            description="Recepção, organização e acompanhamento logístico humanizado dos pedidos enviados pela Brizex (Logzz ➔ Brizex ➔ UpZap)"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="inline-flex rounded-lg bg-secondary/80 p-1 border border-border">
            <button
              type="button"
              onClick={() => setActiveTab('pedidos')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                activeTab === 'pedidos'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Lista de Pedidos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('integracao')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'integracao'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Key className="w-3.5 h-3.5 text-primary" />
              Integração Brizex
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadData(false)}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg border border-border transition-colors cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Visão de Abas: PEDIDOS */}
      {activeTab === 'pedidos' && (
        <div className="space-y-6">
          {/* Cards de Métricas e Status Oficiais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl border border-border bg-card/60">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Total
              </span>
              <p className="text-xl font-bold text-foreground mt-1">
                {stats?.total ?? orders.length}
              </p>
              <span className="text-[11px] text-muted-foreground">
                {formatCurrency(stats?.valorTotalGeral)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <span className="text-[11px] font-medium text-blue-400 uppercase tracking-wider block">
                Agendado
              </span>
              <p className="text-xl font-bold text-blue-500 mt-1">
                {stats?.agendado ?? 0}
              </p>
              <span className="text-[11px] text-blue-400/80">Programados</span>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
                  Separação
                </span>
                {stats?.alertaAtraso > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                    {stats.alertaAtraso} &gt;24h
                  </span>
                )}
              </div>
              <p className="text-xl font-bold text-amber-500 mt-1">
                {(stats?.emSeparacao ?? 0) + (stats?.separado ?? 0)}
              </p>
              <span className="text-[11px] text-amber-400/80">No Centro de Distr.</span>
            </div>

            <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5">
              <span className="text-[11px] font-medium text-purple-400 uppercase tracking-wider block">
                Em Rota
              </span>
              <p className="text-xl font-bold text-purple-500 mt-1">
                {stats?.emRota ?? 0}
              </p>
              <span className="text-[11px] text-purple-400/80">Com entregador</span>
            </div>

            <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5">
              <span className="text-[11px] font-medium text-red-400 uppercase tracking-wider block">
                Atenção
              </span>
              <p className="text-xl font-bold text-red-500 mt-1">
                {(stats?.frustrado ?? 0) + (stats?.aReagendar ?? 0) + (stats?.cancelado ?? 0)}
              </p>
              <span className="text-[11px] text-red-400/80">Requer contato</span>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider block">
                Completo
              </span>
              <p className="text-xl font-bold text-emerald-500 mt-1">
                {stats?.completo ?? 0}
              </p>
              <span className="text-[11px] text-emerald-400/80">Entregue com sucesso</span>
            </div>
          </div>

          {/* Barra de Filtros e Busca */}
          <Panel className="p-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por cliente, telefone, ID Logzz ou ID Brizex..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="all">Todos os Status</option>
                  <option value="Agendado">1. Agendado</option>
                  <option value="Em Separação">2. Em Separação</option>
                  <option value="Separado">3. Separado</option>
                  <option value="Em Rota">4. Em Rota</option>
                  <option value="Cancelado">5. Cancelado</option>
                  <option value="A Reagendar">6. A Reagendar</option>
                  <option value="Frustrado">7. Frustrado</option>
                  <option value="Completo">8. Completo</option>
                </select>

                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value as any)}
                  className="px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="all">Todo o período</option>
                  <option value="today">Hoje</option>
                  <option value="7days">Últimos 7 dias</option>
                  <option value="30days">Últimos 30 dias</option>
                </select>

                <button
                  type="button"
                  onClick={() => setDelayAlertOnly(!delayAlertOnly)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                    delayAlertOnly
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                      : 'bg-secondary/40 text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Atraso &gt;24h ({stats?.alertaAtraso ?? 0})
                </button>

                <button
                  type="button"
                  onClick={() => setHumanOnly(!humanOnly)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                    humanOnly
                      ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-sm'
                      : 'bg-secondary/40 text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Ação Humana ({stats?.precisaAcompanhamentoHumano ?? 0})
                </button>
              </div>
            </div>
          </Panel>

          {/* Tabela de Pedidos */}
          <Panel className="overflow-hidden border border-border">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                Carregando pedidos do CRM...
              </div>
            ) : orders.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                <Package className="w-8 h-8 text-muted-foreground/40" />
                <p className="font-medium text-foreground">Nenhum pedido encontrado</p>
                <p className="text-xs text-muted-foreground max-w-md">
                  {searchTerm || statusFilter !== 'all' || delayAlertOnly || humanOnly
                    ? 'Nenhum pedido corresponde aos filtros aplicados. Tente ajustar os termos de busca.'
                    : 'Aguardando o recebimento dos primeiros pedidos transmitidos pela Brizex via webhook.'}
                </p>
                <button
                  type="button"
                  onClick={handleSendTestOrder}
                  disabled={isSimulatingOrder}
                  className="mt-3 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  {isSimulatingOrder ? 'Enviando teste...' : 'Simular Recebimento de Pedido (Teste Brizex)'}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-3 px-4 font-medium">Pedido (Logzz / Brizex)</th>
                      <th className="py-3 px-4 font-medium">Cliente & Contato</th>
                      <th className="py-3 px-4 font-medium">Itens / Kit</th>
                      <th className="py-3 px-4 font-medium">Valor Total</th>
                      <th className="py-3 px-4 font-medium">Status Logístico</th>
                      <th className="py-3 px-4 font-medium">Agendamento</th>
                      <th className="py-3 px-4 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {orders.map((order) => {
                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-secondary/20 transition-colors cursor-pointer group"
                          onClick={() => {
                            setSelectedOrder(order);
                          }}
                        >
                          {/* ID Logzz */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              {order.logzzOrderId}
                              {order.alertaAtraso && (
                                <span title="Mais de 24h em Separação">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {order.brizexOrderId ? `Brizex: ${order.brizexOrderId}` : `UpZap: ${order.id.slice(-6)}`}
                            </div>
                          </td>

                          {/* Cliente */}
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-foreground">{order.cliente.nome}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3 text-muted-foreground/70" />
                              {order.cliente.telefone}
                              {order.endereco?.cidade && (
                                <span className="text-muted-foreground/60">
                                  • {order.endereco.cidade}/{order.endereco.uf}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Itens */}
                          <td className="py-3.5 px-4">
                            <div className="text-xs font-medium text-foreground truncate max-w-[200px]">
                              {order.itens[0]?.kit || order.itens[0]?.nome || 'Produto Brizex'}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {order.itens.length > 1
                                ? `+ ${order.itens.length - 1} outros itens`
                                : `${order.itens[0]?.quantidade || 1} un • Tam ${order.itens[0]?.tamanho || 'G'}`}
                            </div>
                          </td>

                          {/* Valor */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-foreground">
                              {formatCurrency(order.valorTotal)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {order.metodoPagamento || 'Logzz'}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {getStatusBadge(order.status)}
                            {order.alertaAtraso && (
                              <div className="mt-1">
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                  Atraso &gt;24h CD
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Data Agendamento */}
                          <td className="py-3.5 px-4 text-xs text-muted-foreground">
                            {order.dataAgendamento ? (
                              <div className="flex items-center gap-1 text-foreground">
                                <Calendar className="w-3.5 h-3.5 text-primary" />
                                {order.dataAgendamento}
                              </div>
                            ) : (
                              'Não agendado'
                            )}
                            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                              Atualizado: {formatDate(order.ultimaAtualizacao)}
                            </div>
                          </td>

                          {/* Ações */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrder(order);
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-md border border-border transition-colors cursor-pointer"
                            >
                              Ver detalhes
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Visão de Abas: INTEGRAÇÃO BRIZEX & CONTRATO */}
      {activeTab === 'integracao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cartão de Credenciais e Endpoint */}
            <Panel className="p-5 space-y-4 lg:col-span-1 border border-border">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Shield className="w-4 h-4 text-primary" />
                Endpoint do Webhook Brizex
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Configure esta URL e Token na Brizex para encaminhar os pedidos recebidos da Logzz diretamente ao UpZap.
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground block mb-1">
                    URL do Webhook (POST)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={getFullWebhookUrl()}
                      className="flex-1 px-3 py-1.5 bg-secondary/60 border border-border rounded text-xs font-mono text-foreground select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(getFullWebhookUrl());
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 2000);
                      }}
                      className="p-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Copiar URL"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground block">
                      Token de Autenticação (Bearer / x-brizex-token)
                    </label>
                    {!isEditingToken ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTokenInput(config?.webhookSecret || '');
                          setIsEditingToken(true);
                        }}
                        className="text-[11px] text-primary hover:underline cursor-pointer"
                      >
                        Alterar token
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingToken(false)}
                        className="text-[11px] text-muted-foreground hover:underline cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>

                  {!isEditingToken ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        readOnly
                        value={config?.webhookSecret || ''}
                        className="flex-1 px-3 py-1.5 bg-secondary/60 border border-border rounded text-xs font-mono text-foreground select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (config?.webhookSecret) {
                            navigator.clipboard.writeText(config.webhookSecret);
                            setCopiedToken(true);
                            setTimeout(() => setCopiedToken(false), 2000);
                          }
                        }}
                        className="p-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Copiar Token"
                      >
                        {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder="Digite o novo token secreto..."
                        className="flex-1 px-3 py-1.5 bg-background border border-primary/50 focus:border-primary rounded text-xs font-mono text-foreground"
                      />
                      <button
                        type="button"
                        disabled={savingToken}
                        onClick={handleSaveToken}
                        className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {savingToken ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  )}

                  <span className="text-[10px] text-muted-foreground/70 block mt-1">
                    Utilize o mesmo token no header Authorization ou x-brizex-token da Brizex.
                  </span>
                </div>

                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-muted-foreground">Pausar vendas em Agendado:</span>
                    <Badge tone="green">Ativo</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-muted-foreground">Deduplicação Logzz:</span>
                    <Badge tone="blue">Ativo (ID Logzz)</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-muted-foreground">Alerta &gt;24h em Separação:</span>
                    <Badge tone="amber">Ativo (Humano)</Badge>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSendTestOrder}
                    disabled={isSimulatingOrder}
                    className="w-full py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSimulatingOrder ? 'Processando teste...' : 'Simular Recebimento da Brizex'}
                  </button>
                </div>
              </div>
            </Panel>

            {/* Contrato e Especificação de Dados */}
            <Panel className="p-5 space-y-4 lg:col-span-2 border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <FileText className="w-4 h-4 text-primary" />
                  Contrato de Dados (Logzz ➔ Brizex ➔ UpZap)
                </div>
                <span className="text-xs text-muted-foreground">Documentação Oficial</span>
              </div>

              <div className="space-y-3 text-xs text-muted-foreground">
                <p>
                  O UpZap valida os dados recebidos pelo webhook em tempo real. Se o pedido já existir pelo identificador original da Logzz (<code className="text-primary font-mono text-[11px]">logzzOrderId</code>), é realizada a atualização do status e enriquecimento do histórico sem duplicação de registro.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-secondary/30 rounded-lg border border-border">
                    <span className="font-semibold text-foreground block mb-1">Campos Obrigatórios:</span>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground/90">
                      <li><code className="text-foreground font-mono">logzzOrderId</code> (ID original Logzz)</li>
                      <li><code className="text-foreground font-mono">cliente.telefone</code> (WhatsApp com DDD)</li>
                      <li><code className="text-foreground font-mono">status</code> (Um dos 8 status oficiais)</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-secondary/30 rounded-lg border border-border">
                    <span className="font-semibold text-foreground block mb-1">Status Oficiais Homologados:</span>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground/90">
                      <li>Agendado, Em Separação, Separado</li>
                      <li>Em Rota, Cancelado, A Reagendar</li>
                      <li>Frustrado, Completo</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-foreground block mb-1">Exemplo de Payload Mínimo Homologado:</span>
                  <pre className="p-3 bg-secondary/50 rounded-lg border border-border text-[11px] font-mono text-foreground overflow-x-auto">
{`{
  "logzzOrderId": "LGZ-892410",
  "brizexOrderId": "BRZ-2026-4401",
  "status": "Agendado",
  "valorTotal": 197.90,
  "cliente": {
    "nome": "Juliana Mendes Silva",
    "telefone": "11998765432"
  },
  "endereco": {
    "cidade": "São Paulo",
    "uf": "SP"
  }
}`}
                  </pre>
                </div>
              </div>
            </Panel>
          </div>

          {/* Logs Recentes de Sincronização Brizex */}
          <Panel className="p-5 border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Activity className="w-4 h-4 text-primary" />
                Histórico Técnico de Sincronizações Recebidas
              </div>
              <span className="text-xs text-muted-foreground">Últimos {syncLogs.length} eventos</span>
            </div>

            {syncLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nenhum evento de sincronização registrado até o momento.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Data/Hora</th>
                      <th className="py-2.5 px-3 font-medium">ID Logzz</th>
                      <th className="py-2.5 px-3 font-medium">Operação</th>
                      <th className="py-2.5 px-3 font-medium">Status Logístico</th>
                      <th className="py-2.5 px-3 font-medium">Resultado</th>
                      <th className="py-2.5 px-3 font-medium">Mensagem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {syncLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-secondary/20 font-mono">
                        <td className="py-2 px-3 text-muted-foreground">{formatDate(log.timestamp)}</td>
                        <td className="py-2 px-3 font-medium text-foreground">{log.logzzOrderId || '—'}</td>
                        <td className="py-2 px-3 text-muted-foreground">{log.tipoOperacao}</td>
                        <td className="py-2 px-3">{log.statusLogistico ? getStatusBadge(log.statusLogistico as any) : '—'}</td>
                        <td className="py-2 px-3">
                          {log.sucesso ? (
                            <span className="text-emerald-400 font-medium">Sucesso</span>
                          ) : (
                            <span className="text-red-400 font-medium">Falha</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground truncate max-w-xs">{log.mensagem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Modal / Drawer de Detalhes do Pedido */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header do Modal */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
                    Pedido Logzz: {selectedOrder.logzzOrderId}
                    {getStatusBadge(selectedOrder.status)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    ID UpZap: {selectedOrder.id} • Criado em {formatDate(selectedOrder.dataCriacao)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              {/* Alerta de mais de 24h em Separação se aplicável */}
              {selectedOrder.alertaAtraso && (
                <div className="p-3.5 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-300 text-xs">
                      Sinalização de Análise Humana: Mais de 24h em Separação no CD
                    </h4>
                    <p className="text-xs text-amber-300/80 mt-0.5">
                      Este pedido está aguardando saída ou preparação há mais de 24 horas. Verifique com a central Logzz ou centro de distribuição sem alterar o status logístico arbitrariamente.
                    </p>
                  </div>
                </div>
              )}

              {/* Grid: Cliente & Endereço */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <User className="w-3.5 h-3.5 text-primary" />
                    Destinatário
                  </div>
                  <p className="font-medium text-foreground text-sm">{selectedOrder.cliente.nome}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    {selectedOrder.cliente.telefone}
                  </p>
                  {selectedOrder.cliente.email && (
                    <p className="text-xs text-muted-foreground">E-mail: {selectedOrder.cliente.email}</p>
                  )}
                  {selectedOrder.cliente.cpf && (
                    <p className="text-xs text-muted-foreground">CPF: {selectedOrder.cliente.cpf}</p>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (onNavigateToTab) onNavigateToTab('atendimentos');
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Ver Conversa no WhatsApp
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    Endereço de Entrega
                  </div>
                  <p className="text-xs text-foreground">
                    {selectedOrder.endereco.logradouro
                      ? `${selectedOrder.endereco.logradouro}, ${selectedOrder.endereco.numero || 'S/N'}${selectedOrder.endereco.complemento ? ` (${selectedOrder.endereco.complemento})` : ''}`
                      : 'Endereço não informado detalhadamente'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedOrder.endereco.bairro ? `${selectedOrder.endereco.bairro} — ` : ''}
                    {selectedOrder.endereco.cidade || 'São Paulo'} / {selectedOrder.endereco.uf || 'SP'}
                  </p>
                  {selectedOrder.endereco.cep && (
                    <p className="text-xs text-muted-foreground font-mono">CEP: {selectedOrder.endereco.cep}</p>
                  )}
                  {selectedOrder.endereco.referencia && (
                    <p className="text-[11px] text-muted-foreground/80 italic">Ref: {selectedOrder.endereco.referencia}</p>
                  )}
                </div>
              </div>

              {/* Itens do Pedido */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Itens Comprados
                </span>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {selectedOrder.itens.map((item, idx) => (
                    <div key={idx} className="p-3 bg-secondary/10 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-medium text-foreground">{item.nome}</span>
                        <div className="text-[11px] text-muted-foreground">
                          {item.kit && <span>{item.kit} • </span>}
                          {item.tamanho && <span>Tamanho: {item.tamanho} • </span>}
                          {item.cor && <span>Cor: {item.cor} • </span>}
                          <span>Qtd: {item.quantidade}</span>
                        </div>
                      </div>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(item.valorTotal || item.valorUnitario)}
                      </span>
                    </div>
                  ))}
                  <div className="p-3 bg-secondary/30 flex items-center justify-between text-xs font-semibold">
                    <span>Valor Total do Pedido:</span>
                    <span className="text-primary text-sm">{formatCurrency(selectedOrder.valorTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Linha do Tempo: Histórico Oficial Logzz */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Histórico de Transições da Logzz
                </span>
                <div className="p-3 rounded-lg border border-border bg-secondary/10 space-y-2.5">
                  {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 ? (
                    selectedOrder.statusHistory.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{item.status}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(item.data)} ({item.origem})
                            </span>
                          </div>
                          {item.observacao && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{item.observacao}</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma transição adicional registrada.</p>
                  )}
                </div>
              </div>

              {/* Observações Internas da Equipe */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Observações Internas (Equipe Humana)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Não visíveis para o cliente
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Adicionar nota interna sobre o acompanhamento..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddNote();
                      }}
                      className="flex-1 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={submittingNote || !newNoteText.trim()}
                      className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {submittingNote ? 'Salvando...' : 'Adicionar Nota'}
                    </button>
                  </div>

                  {selectedOrder.observacoesInternas && selectedOrder.observacoesInternas.length > 0 && (
                    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-secondary/10">
                      {selectedOrder.observacoesInternas.map((note) => (
                        <div key={note.id} className="p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{note.autor}</span>
                            <span>{formatDate(note.data)}</span>
                          </div>
                          <p className="text-foreground text-xs">{note.texto}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="px-6 py-3 border-t border-border flex items-center justify-between bg-secondary/20">
              <span className="text-xs text-muted-foreground">
                Última sincronização: {formatDate(selectedOrder.ultimaAtualizacao)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
