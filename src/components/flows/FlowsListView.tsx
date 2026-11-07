import React, { useState, useMemo } from 'react';
import {
  Workflow,
  Plus,
  Search,
  Zap,
  Copy,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Power,
  Layers,
  Calendar,
  AlertTriangle,
  Loader2,
  FileText,
  Unlink
} from 'lucide-react';
import { LinearFlow } from '../../types/upzap';

interface FlowsListViewProps {
  flows: LinearFlow[];
  activeFlowId: string;
  onSelectFlowForEdit: (flowId: string) => void;
  onCreateFlow: (newFlow: Partial<LinearFlow>) => Promise<void>;
  onDuplicateFlow: (flowId: string) => Promise<void>;
  onToggleFlowActive: (flowId: string, currentActive: boolean) => Promise<void>;
  onDeleteFlow: (flowId: string) => Promise<void>;
  onUnlinkRule?: (flowId: string) => Promise<void>;
  rules: any[];
  loading: boolean;
}

export const FlowsListView: React.FC<FlowsListViewProps> = ({
  flows,
  activeFlowId,
  onSelectFlowForEdit,
  onCreateFlow,
  onDuplicateFlow,
  onToggleFlowActive,
  onDeleteFlow,
  onUnlinkRule,
  rules,
  loading
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<LinearFlow | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Form state para novo fluxo
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [newFlowRuleId, setNewFlowRuleId] = useState('');
  const [newFlowTemplate, setNewFlowTemplate] = useState<'blank' | 'standard'>('blank');
  const [submitting, setSubmitting] = useState(false);

  const filteredFlows = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return flows.filter((f) => {
      const matchSearch =
        (f.nome || '').toLowerCase().includes(term) ||
        (f.descricao || '').toLowerCase().includes(term) ||
        (f.regraGatilhoNome || '').toLowerCase().includes(term);

      const isActive = f.ativo !== false && f.status !== 'Inativo';
      if (statusFilter === 'active') return matchSearch && isActive;
      if (statusFilter === 'inactive') return matchSearch && !isActive;
      return matchSearch;
    });
  }, [flows, searchTerm, statusFilter]);

  const activeCount = useMemo(() => flows.filter((f) => f.ativo !== false && f.status !== 'Inativo').length, [flows]);
  const totalBlocks = useMemo(() => flows.reduce((acc, f) => acc + (f.blocos?.length || 0), 0), [flows]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlowName.trim()) return;

    setSubmitting(true);
    try {
      const selectedRule = rules.find((r) => r.id === newFlowRuleId);
      const initialBlocks =
        newFlowTemplate === 'standard'
          ? [
              {
                id: `b_init_${Date.now()}`,
                tipo: 'texto' as const,
                conteudo: `Olá! Bem-vindo ao atendimento. Como posso ajudar você hoje?`,
                delay: 1.0
              },
              {
                id: `b_menu_${Date.now()}`,
                tipo: 'menu' as const,
                formatoMenu: 'numerado' as const,
                tituloMenu: 'Menu de Opções',
                conteudo: 'Selecione uma das opções abaixo:',
                rodapeMenu: 'Digite o número correspondente',
                opcoes: [
                  { id: 'opt_1', numero: 1, texto: 'Dúvidas sobre o produto', acao: 'executar_fluxo' },
                  { id: 'opt_2', numero: 2, texto: 'Falar com atendente', acao: 'transferir_humano' }
                ]
              }
            ]
          : [];

      await onCreateFlow({
        nome: newFlowName.trim(),
        descricao: newFlowDescription.trim(),
        regraGatilhoId: newFlowRuleId || undefined,
        regraGatilhoNome: selectedRule ? selectedRule.nome || selectedRule.name : undefined,
        status: 'Publicado',
        ativo: true,
        blocos: initialBlocks,
        canvasNodes: [],
        canvasConnections: []
      });

      setNewFlowName('');
      setNewFlowDescription('');
      setNewFlowRuleId('');
      setIsCreateModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (flow: LinearFlow) => {
    setActionLoadingId(flow.id);
    try {
      await onToggleFlowActive(flow.id, flow.ativo !== false && flow.status !== 'Inativo');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDuplicate = async (flow: LinearFlow) => {
    setActionLoadingId(flow.id);
    try {
      await onDuplicateFlow(flow.id);
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!flowToDelete) return;
    setActionLoadingId(flowToDelete.id);
    try {
      await onDeleteFlow(flowToDelete.id);
      setFlowToDelete(null);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="flex-1 w-full h-full flex flex-col bg-background text-foreground overflow-y-auto p-4 md:p-6 space-y-6">
      {/* HEADER & ESTATÍSTICAS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Meus Fluxos de Atendimento
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground border border-border">
                  {flows.length} {flows.length === 1 ? 'fluxo' : 'fluxos'}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Gerencie todos os fluxos de mensagens, menus e automações integradas ao WhatsApp e Brizex.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Novo Fluxo</span>
        </button>
      </div>

      {/* CARDS DE RESUMO */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{activeCount}</div>
            <div className="text-[11px] text-muted-foreground">Fluxos Ativos</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{totalBlocks}</div>
            <div className="text-[11px] text-muted-foreground">Total de Blocos</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">
              {flows.filter((f) => f.regraGatilhoId || f.regraGatilhoNome).length}
            </div>
            <div className="text-[11px] text-muted-foreground">Com Regra Gatilho</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">
              {flows.find((f) => f.isWelcomeFlow) ? '1 Configurado' : 'Padrão'}
            </div>
            <div className="text-[11px] text-muted-foreground">Boas-Vindas Principal</div>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, descrição ou regra..."
            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-muted-foreground">Status:</span>
          <div className="flex items-center bg-secondary p-1 rounded-lg border border-border text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'all' ? 'bg-background text-foreground font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos ({flows.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-background text-emerald-500 font-medium shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Ativos ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'inactive'
                  ? 'bg-background text-destructive font-medium shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Inativos ({flows.length - activeCount})
            </button>
          </div>
        </div>
      </div>

      {/* LISTAGEM DE FLUXOS */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm">Carregando fluxos...</span>
        </div>
      ) : filteredFlows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-dashed border-border rounded-2xl p-6 text-center">
          <Workflow className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-bold text-foreground mb-1">Nenhum fluxo encontrado</h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            {searchTerm || statusFilter !== 'all'
              ? 'Tente ajustar os filtros ou a busca digitada.'
              : 'Você ainda não possui fluxos personalizados. Crie seu primeiro fluxo agora mesmo!'}
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar Primeiro Fluxo</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFlows.map((flow) => {
            const isActive = flow.ativo !== false && flow.status !== 'Inativo';
            const isCurrentActiveInEditor = flow.id === activeFlowId;
            const blockCount = flow.blocos?.length || 0;
            const hasCanvas = (flow.canvasNodes?.length || 0) > 0;
            const isOperating = actionLoadingId === flow.id;

            return (
              <div
                key={flow.id}
                className={`flex flex-col justify-between p-4 rounded-xl border transition-all ${
                  isCurrentActiveInEditor
                    ? 'bg-card border-primary shadow-sm ring-1 ring-primary/40'
                    : 'bg-card border-border hover:border-border/80'
                }`}
              >
                <div>
                  {/* TOPO DO CARD */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                        }`}
                      />
                      <h3 className="text-sm font-bold text-foreground truncate" title={flow.nome}>
                        {flow.nome}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {flow.isWelcomeFlow && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                          Boas-Vindas
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggle(flow)}
                        disabled={isOperating}
                        title={isActive ? 'Desativar Fluxo' : 'Ativar Fluxo'}
                        className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* DESCRIÇÃO */}
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-8 mb-3">
                    {flow.descricao || 'Sem descrição cadastrada.'}
                  </p>

                  {/* REGRA GATILHO */}
                  <div className="p-2.5 rounded-lg bg-secondary/50 border border-border space-y-1 mb-3">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-500" /> Gatilho Inicial:
                      </span>
                      {flow.regraGatilhoNome || flow.regraGatilhoId ? (
                        <div className="flex items-center gap-1.5 max-w-44">
                          <span className="font-semibold text-primary truncate">
                            {flow.regraGatilhoNome || flow.regraGatilhoId}
                          </span>
                          {onUnlinkRule && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUnlinkRule(flow.id);
                              }}
                              title="Desvincular regra deste fluxo (a regra e o fluxo são mantidos)"
                              className="p-1 rounded text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/70 italic">Sem regra vinculada</span>
                      )}
                    </div>
                  </div>

                  {/* METADADOS */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-3 border-b border-border">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3 text-sky-500" /> {blockCount} {blockCount === 1 ? 'bloco' : 'blocos'}
                      {hasCanvas && <span className="text-[10px] text-emerald-500 font-medium">• Visual</span>}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <Calendar className="w-3 h-3" />
                      {flow.updatedAt ? new Date(flow.updatedAt).toLocaleDateString('pt-BR') : 'Hoje'}
                    </span>
                  </div>
                </div>

                {/* BOTÕES DE AÇÃO */}
                <div className="pt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDuplicate(flow)}
                      disabled={isOperating}
                      title="Duplicar fluxo"
                      className="p-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlowToDelete(flow)}
                      disabled={isOperating}
                      title="Excluir fluxo"
                      className="p-1.5 rounded-lg border border-border bg-card hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-muted-foreground transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectFlowForEdit(flow.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isCurrentActiveInEditor
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'border border-border bg-card hover:bg-secondary text-foreground'
                    }`}
                  >
                    <span>{isCurrentActiveInEditor ? 'No Editor' : 'Abrir no Canvas'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CRIAR NOVO FLUXO */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-5 text-foreground animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Workflow className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Criar Novo Fluxo</h3>
                  <p className="text-xs text-muted-foreground">Monte um novo fluxo visual ou estruturado</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Nome do Fluxo <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  placeholder="Ex: Recuperação de Carrinho, Apresentação VIP..."
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={newFlowDescription}
                  onChange={(e) => setNewFlowDescription(e.target.value)}
                  placeholder="Explique o objetivo deste fluxo para sua equipe..."
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Regra Gatilho Inicial (Opcional)
                </label>
                <select
                  value={newFlowRuleId}
                  onChange={(e) => setNewFlowRuleId(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer"
                >
                  <option value="">Nenhuma (fluxo iniciado por menu ou evento)</option>
                  {rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      ⚡ {rule.nome || rule.name} ({rule.tipoGatilho || 'palavra-chave'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Ao vincular uma regra, sempre que o gatilho da regra disparar este fluxo será executado.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">Estrutura Inicial</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewFlowTemplate('blank')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      newFlowTemplate === 'blank'
                        ? 'bg-primary/10 border-primary ring-1 ring-primary'
                        : 'bg-card border-border hover:border-border/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="text-xs font-bold text-foreground">Em Branco</div>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-medium">Recomendado</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">Canvas limpo sem regras pré-definidas para construir livremente</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewFlowTemplate('standard')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      newFlowTemplate === 'standard'
                        ? 'bg-primary/10 border-primary ring-1 ring-primary'
                        : 'bg-card border-border hover:border-border/80'
                    }`}
                  >
                    <div className="text-xs font-bold text-foreground mb-0.5">Com Boas-Vindas + Menu</div>
                    <div className="text-[11px] text-muted-foreground">Modelo opcional com saudação e menu inicial</div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-border bg-card hover:bg-secondary text-foreground cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newFlowName.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer disabled:opacity-50 shadow-xs transition-colors"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Criar Fluxo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {flowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4 text-foreground">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Excluir Fluxo</h3>
                <p className="text-xs text-muted-foreground">Esta ação não poderá ser desfeita</p>
              </div>
            </div>

            <p className="text-xs text-foreground/90">
              Tem certeza que deseja excluir o fluxo <strong className="text-foreground">"{flowToDelete.nome}"</strong>?
              Todas as conexões e configurações serão removidas.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setFlowToDelete(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-border bg-card hover:bg-secondary text-foreground cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer shadow-xs transition-colors"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
