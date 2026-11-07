import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Workflow,
  Sparkles,
  MessageSquare,
  Package,
  Clock,
  ExternalLink,
  Layers,
  ArrowRight,
  Filter,
  Unlink,
  X
} from 'lucide-react';
import { PageIntro, Panel, Badge } from './v0-ui';
import { BaseOficialUpZap, UpZapRule, RuleTriggerType, LinearFlow } from '../types/upzap';
import { authFetch } from '../lib/api';

interface RegrasViewProps {
  base?: BaseOficialUpZap;
  onNavigateToFlows?: () => void;
}

export const RegrasView: React.FC<RegrasViewProps> = ({ onNavigateToFlows }) => {
  const [rules, setRules] = useState<UpZapRule[]>([]);
  const [flows, setFlows] = useState<LinearFlow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTriggerFilter, setSelectedTriggerFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<UpZapRule | null>(null);

  // Campos do Formulário
  const [formNome, setFormNome] = useState<string>('');
  const [formDescricao, setFormDescricao] = useState<string>('');
  const [formTipoGatilho, setFormTipoGatilho] = useState<RuleTriggerType>('palavra_chave');
  const [formPalavrasChave, setFormPalavrasChave] = useState<string>('');
  const [formStatusPedido, setFormStatusPedido] = useState<string>('Agendado');
  const [formTempoInatividade, setFormTempoInatividade] = useState<number>(15);
  const [formPrioridade, setFormPrioridade] = useState<'Critica' | 'Alta' | 'Media' | 'Baixa'>('Alta');
  const [formFluxoId, setFormFluxoId] = useState<string>('');
  const [formTextoResposta, setFormTextoResposta] = useState<string>('');
  const [formAtivo, setFormAtivo] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Confirmação de Exclusão
  const [deletingRule, setDeletingRule] = useState<UpZapRule | null>(null);
  const [deletingLoading, setDeletingLoading] = useState<boolean>(false);

  // Testador Rápido de Gatilho
  const [testPhrase, setTestPhrase] = useState<string>('');
  const [testMatchedRule, setTestMatchedRule] = useState<UpZapRule | null>(null);

  const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Carregar regras e fluxos do backend
  const loadData = async () => {
    try {
      setLoading(true);
      const [resRules, resFlows] = await Promise.all([
        authFetch('/api/rules'),
        authFetch('/api/flows')
      ]);

      if (resRules.ok) {
        const data = await resRules.json();
        const loaded: any[] = data.rules || [];
        const normalized: UpZapRule[] = loaded.map((r: any, idx: number) => {
          const rawKeywords =
            r.trigger ||
            (Array.isArray(r.palavrasChave) ? r.palavrasChave.join(', ') : '') ||
            (Array.isArray(r.palavras) ? r.palavras.join(', ') : '') ||
            (Array.isArray(r.todasPalavras) ? r.todasPalavras.join(', ') : '');

          const rawResponse = r.response || r.resposta || '';

          return {
            id: r.id || `rule_${Date.now()}_${idx}`,
            nome: r.nome || r.name || `Regra ${idx + 1}`,
            name: r.nome || r.name || `Regra ${idx + 1}`,
            descricao: r.descricao || '',
            tipoGatilho: r.tipoGatilho || 'palavra_chave',
            statusPedido: r.statusPedido,
            condicoes: r.condicoes || '',
            trigger: rawKeywords,
            palavrasChave: rawKeywords
              ? rawKeywords.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
              : [],
            palavras: rawKeywords
              ? rawKeywords.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
              : [],
            todasPalavras: rawKeywords
              ? rawKeywords.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
              : [],
            response: rawResponse,
            resposta: rawResponse,
            tempoInatividadeMinutos: r.tempoInatividadeMinutos || 15,
            prioridade: r.prioridade || 'Alta',
            priority: r.priority || 'P2',
            fluxoId: r.fluxoId,
            fluxoNome: r.fluxoNome,
            targetFlowId: r.targetFlowId || r.fluxoId,
            fluxosVinculados: r.fluxosVinculados || (r.fluxoId ? [r.fluxoId] : []),
            ativo: r.ativo !== false && r.active !== false,
            active: r.ativo !== false && r.active !== false,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
          };
        });
        setRules(normalized);
      }

      if (resFlows.ok) {
        const data = await resFlows.json();
        setFlows(data.fluxos || data.flows || []);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar dados de regras:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleExternalUpdate = () => {
      loadData();
    };

    window.addEventListener('upzap_rules_updated', handleExternalUpdate);
    window.addEventListener('upzap_flows_updated', handleExternalUpdate);
    return () => {
      window.removeEventListener('upzap_rules_updated', handleExternalUpdate);
      window.removeEventListener('upzap_flows_updated', handleExternalUpdate);
    };
  }, []);

  // Abrir Modal de Criação ou Edição
  const handleOpenModal = (rule?: UpZapRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormNome(rule.nome || rule.name || '');
      setFormDescricao(rule.descricao || '');
      setFormTipoGatilho(rule.tipoGatilho || 'palavra_chave');
      setFormPalavrasChave(rule.trigger || (rule.palavrasChave || rule.palavras || []).join(', '));
      setFormStatusPedido(rule.statusPedido || 'Agendado');
      setFormTempoInatividade(rule.tempoInatividadeMinutos || 15);
      setFormPrioridade(rule.prioridade || 'Alta');
      setFormFluxoId(rule.fluxoId || rule.targetFlowId || '');
      setFormTextoResposta(rule.resposta || rule.response || '');
      setFormAtivo(rule.ativo !== false && rule.active !== false);
    } else {
      setEditingRule(null);
      setFormNome('');
      setFormDescricao('');
      setFormTipoGatilho('palavra_chave');
      setFormPalavrasChave('');
      setFormStatusPedido('Agendado');
      setFormTempoInatividade(15);
      setFormPrioridade('Alta');
      setFormFluxoId('');
      setFormTextoResposta('');
      setFormAtivo(true);
    }
    setIsModalOpen(true);
  };

  // Desvincular fluxo da regra sem excluir nenhum dos dois
  const handleUnlinkFlowFromRule = async (rule: UpZapRule) => {
    try {
      setSaving(true);
      const res = await authFetch(`/api/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rule.id,
          fluxoId: null,
          targetFlowId: null,
          fluxoNome: null,
          fluxosVinculados: [],
          tipoAcao: 'resposta',
          actionType: 'resposta'
        })
      });
      if (res.ok) {
        showFeedback(`Vínculo com fluxo removido da regra "${rule.nome || rule.name}". A regra e o fluxo foram preservados.`);
        loadData();
        window.dispatchEvent(new CustomEvent('upzap_rules_updated'));
      } else {
        const errData = await res.json().catch(() => ({}));
        showFeedback(errData.error || 'Erro ao desvincular fluxo.', 'error');
      }
    } catch (err: any) {
      showFeedback('Erro ao desvincular fluxo: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Regra
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formNome.trim()) {
      showFeedback('Por favor, dê um nome para a regra.', 'error');
      return;
    }

    if (formTipoGatilho === 'palavra_chave' && !formPalavrasChave.trim()) {
      showFeedback('Por favor, informe ao menos uma palavra-chave para o acionamento.', 'error');
      return;
    }

    try {
      setSaving(true);
      const kwArray = formPalavrasChave
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      const selectedFlow = flows.find((f) => f.id === formFluxoId);

      const payload: any = {
        nome: formNome.trim(),
        name: formNome.trim(),
        descricao: formDescricao.trim(),
        tipoGatilho: formTipoGatilho,
        statusPedido: formTipoGatilho.startsWith('pedido_') || formTipoGatilho === 'evento_pedido' ? formStatusPedido : undefined,
        tempoInatividadeMinutos: formTipoGatilho === 'inatividade' ? formTempoInatividade : undefined,
        prioridade: formPrioridade,
        palavrasChave: kwArray,
        palavras: kwArray,
        todasPalavras: kwArray,
        trigger: kwArray.join(', '),
        resposta: formTextoResposta.trim(),
        response: formTextoResposta.trim(),
        fluxoId: formFluxoId ? formFluxoId : null,
        fluxoNome: selectedFlow ? selectedFlow.nome : null,
        targetFlowId: formFluxoId ? formFluxoId : null,
        fluxosVinculados: formFluxoId ? [formFluxoId] : [],
        tipoAcao: formFluxoId ? 'executar_fluxo' : 'resposta',
        actionType: formFluxoId ? 'executar_fluxo' : 'resposta',
        ativo: formAtivo,
        active: formAtivo,
        updatedAt: new Date().toISOString()
      };

      let res: Response;
      if (editingRule) {
        res = await authFetch(`/api/rules/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, id: editingRule.id })
        });
      } else {
        const newId = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        res = await authFetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rule: {
              ...payload,
              id: newId,
              createdAt: new Date().toISOString()
            }
          })
        });
      }

      if (res.ok) {
        showFeedback(editingRule ? 'Regra atualizada com sucesso!' : 'Nova regra criada com sucesso!');
        setIsModalOpen(false);
        loadData();
        window.dispatchEvent(new CustomEvent('upzap_rules_updated'));
      } else {
        const err = await res.json();
        showFeedback(err.error || 'Erro ao salvar regra.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Falha ao salvar: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Alternar Ativo/Inativo
  const handleToggleRuleActive = async (ruleId: string) => {
    try {
      const res = await authFetch(`/api/rules/${ruleId}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === ruleId ? { ...r, ativo: !r.ativo, active: !r.active } : r))
        );
        showFeedback('Status da regra atualizado com sucesso!');
        window.dispatchEvent(new CustomEvent('upzap_rules_updated'));
      } else {
        showFeedback('Erro ao alternar status da regra.', 'error');
      }
    } catch {
      showFeedback('Falha de conexão ao atualizar regra.', 'error');
    }
  };

  // Excluir regra
  const handleConfirmDelete = async () => {
    if (!deletingRule) return;
    try {
      setDeletingLoading(true);
      const res = await authFetch(`/api/rules/${deletingRule.id}`, { method: 'DELETE' });
      if (res.ok) {
        showFeedback('Regra excluída com sucesso.');
        setDeletingRule(null);
        loadData();
        window.dispatchEvent(new CustomEvent('upzap_rules_updated'));
      } else {
        const err = await res.json();
        showFeedback(err.error || 'Erro ao excluir regra.', 'error');
      }
    } catch {
      showFeedback('Falha ao excluir regra.', 'error');
    } finally {
      setDeletingLoading(false);
    }
  };

  // Testador de Gatilho
  useEffect(() => {
    if (!testPhrase.trim()) {
      setTestMatchedRule(null);
      return;
    }
    const clean = testPhrase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const matched = rules.find((r) => {
      if (r.ativo === false && r.active === false) return false;
      const kws = r.palavrasChave || r.palavras || [];
      return kws.some((kw) => {
        const cleanKw = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        return clean.includes(cleanKw);
      });
    });
    setTestMatchedRule(matched || null);
  }, [testPhrase, rules]);

  // Filtragem de regras
  const filteredRules = rules.filter((r) => {
    const matchesSearch =
      searchTerm === '' ||
      r.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.palavrasChave || []).some((kw) => kw.toLowerCase().includes(searchTerm.toLowerCase())) ||
      r.resposta?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedTriggerFilter === 'all') return true;
    if (selectedTriggerFilter === 'palavra_chave') return r.tipoGatilho === 'palavra_chave' || !r.tipoGatilho;
    if (selectedTriggerFilter === 'pedidos') {
      return (
        r.tipoGatilho?.startsWith('pedido_') ||
        r.tipoGatilho === 'evento_pedido' ||
        Boolean(r.statusPedido)
      );
    }
    if (selectedTriggerFilter === 'mensagem') return r.tipoGatilho === 'mensagem_recebida';
    if (selectedTriggerFilter === 'inatividade') return r.tipoGatilho === 'inatividade';
    return true;
  });

  const getTriggerLabel = (type: string, status?: string) => {
    switch (type) {
      case 'palavra_chave':
        return 'Palavra-chave';
      case 'mensagem_recebida':
        return 'Qualquer mensagem';
      case 'pedido_agendado':
        return 'Pedido Agendado (Logzz)';
      case 'pedido_em_separacao':
        return 'Pedido em Separação';
      case 'pedido_separado':
        return 'Mercadoria Separada';
      case 'pedido_em_rota':
        return 'Saiu para Entrega (Em Rota)';
      case 'pedido_entregue':
        return 'Pedido Entregue (Completo)';
      case 'pedido_cancelado':
        return 'Pedido Cancelado';
      case 'pedido_reagendar':
        return 'A Reagendar / Frustrado';
      case 'evento_pedido':
        return status ? `Pedido: ${status}` : 'Evento de Pedido';
      case 'inatividade':
        return 'Tempo de Inatividade';
      case 'manual':
        return 'Disparo Manual';
      default:
        return type || 'Palavra-chave';
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'Critica':
      case 'Crítica':
      case 'P1':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'Alta':
      case 'P2':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Media':
      case 'Média':
      case 'P3':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Notificação / Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Cabeçalho da Página */}
      <PageIntro
        title="Regras de Automação"
        description="Cadastre quantas regras desejar. Cada regra funciona de forma independente e pode acionar respostas diretas ou iniciar fluxos visuais complexos."
      />

      {/* Resumo Rápido */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Total de Regras</span>
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{rules.length}</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Regras Ativas</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {rules.filter((r) => r.ativo !== false && r.active !== false).length}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Gatilhos de Pedidos</span>
            <Package className="h-4 w-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-sky-400">
            {rules.filter((r) => r.tipoGatilho?.startsWith('pedido_') || r.tipoGatilho === 'evento_pedido' || r.statusPedido).length}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Fluxos Vinculados</span>
            <Workflow className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400">
            {rules.filter((r) => r.fluxoId || (r.fluxosVinculados && r.fluxosVinculados.length > 0)).length}
          </p>
        </div>
      </div>

      {/* Barra de Ações e Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar regras por nome, palavra ou resposta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
            />
          </div>

          <select
            value={selectedTriggerFilter}
            onChange={(e) => setSelectedTriggerFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
          >
            <option value="all">Todos os Gatilhos</option>
            <option value="palavra_chave">Palavras-chave</option>
            <option value="pedidos">Pedidos (Brizex/Logzz)</option>
            <option value="mensagem">Qualquer Mensagem</option>
            <option value="inatividade">Inatividade</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToFlows && (
            <button
              type="button"
              onClick={onNavigateToFlows}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
            >
              <Workflow className="h-3.5 w-3.5 text-primary" />
              <span>Ver Fluxos</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Regra</span>
          </button>
        </div>
      </div>

      {/* Testador Rápido de Gatilho */}
      <Panel title="Testador Rápido de Gatilho">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Digite uma mensagem simulada para verificar instantaneamente qual regra configurada responderá:
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={testPhrase}
                onChange={(e) => setTestPhrase(e.target.value)}
                placeholder="Ex: quanto custa a calcinha? / quero comprar / prazo de entrega..."
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
              />
              {testPhrase && (
                <button
                  type="button"
                  onClick={() => setTestPhrase('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {testPhrase.trim() && (
            <div className="p-3 rounded-lg border text-xs">
              {testMatchedRule ? (
                <div className="space-y-1 text-emerald-400">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Regra Acionada: "{testMatchedRule.nome || testMatchedRule.name}"</span>
                  </div>
                  {testMatchedRule.fluxoId ? (
                    <p className="text-muted-foreground pl-6">
                      ➔ Dispara o fluxo visual: <strong>{testMatchedRule.fluxoNome || testMatchedRule.fluxoId}</strong>
                    </p>
                  ) : (
                    <p className="text-muted-foreground pl-6">
                      ➔ Resposta direta: "{testMatchedRule.resposta || testMatchedRule.response}"
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-400 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Nenhuma regra específica acionada. O robô apresentará o menu inicial ou mensagem amigável de orientação.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* Lista de Regras Cadastradas */}
      <Panel title={`Regras Cadastradas (${filteredRules.length})`}>
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs">Carregando regras...</span>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {searchTerm || selectedTriggerFilter !== 'all'
                ? 'Nenhuma regra encontrada para este filtro.'
                : 'Nenhuma regra cadastrada ainda.'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Crie regras para responder a palavras-chave dos clientes ou a eventos de pedidos enviados pela Brizex/Logzz.
            </p>
            <button
              type="button"
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Criar Primeira Regra</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRules.map((rule) => {
              const isActive = rule.ativo !== false && rule.active !== false;
              const hasFlow = Boolean(rule.fluxoId || (rule.fluxosVinculados && rule.fluxosVinculados.length > 0));
              const linkedFlowName = rule.fluxoNome || (flows.find((f) => f.id === rule.fluxoId)?.nome);

              return (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                    isActive
                      ? 'border-border bg-card/70 hover:border-primary/50'
                      : 'border-border/60 bg-card/30 opacity-70'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header do Card */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-foreground line-clamp-1">
                            {rule.nome || rule.name}
                          </h4>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getPriorityBadgeClass(
                              rule.prioridade || 'Alta'
                            )}`}
                          >
                            {rule.prioridade || 'Alta'}
                          </span>
                        </div>
                        {rule.descricao && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {rule.descricao}
                          </p>
                        )}
                      </div>

                      {/* Toggle Ativo */}
                      <button
                        type="button"
                        onClick={() => handleToggleRuleActive(rule.id)}
                        title={isActive ? 'Desativar regra' : 'Ativar regra'}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isActive ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Badge do Gatilho */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-secondary-foreground border border-border">
                        <Sparkles className="h-3 w-3 text-primary" />
                        {getTriggerLabel(rule.tipoGatilho || 'palavra_chave', rule.statusPedido)}
                      </span>

                      {hasFlow && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Workflow className="h-3 w-3" />
                          <span>Fluxo Vinculado</span>
                        </span>
                      )}
                    </div>

                    {/* Palavras-chave ou Status */}
                    {rule.tipoGatilho === 'palavra_chave' || !rule.tipoGatilho ? (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                          Palavras-chave:
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {(rule.palavrasChave || rule.palavras || []).slice(0, 5).map((kw, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground border border-border/80"
                            >
                              {kw}
                            </span>
                          ))}
                          {(rule.palavrasChave || rule.palavras || []).length > 5 && (
                            <span className="text-[10px] text-muted-foreground self-center">
                              +{(rule.palavrasChave || rule.palavras || []).length - 5} mais
                            </span>
                          )}
                        </div>
                      </div>
                    ) : rule.statusPedido ? (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                          Status do Pedido:
                        </span>
                        <p className="text-xs font-semibold text-foreground">
                          {rule.statusPedido}
                        </p>
                      </div>
                    ) : null}

                    {/* Ação: Fluxo ou Resposta Direta */}
                    <div className="space-y-1 pt-1 border-t border-border/60">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                        Ação Executada:
                      </span>
                      {hasFlow ? (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border text-xs">
                          <div className="flex items-center gap-1.5 text-foreground font-medium line-clamp-1">
                            <Workflow className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span>{linkedFlowName || rule.fluxoId}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleUnlinkFlowFromRule(rule)}
                              title="Desvincular fluxo (preserva a regra e o fluxo)"
                              className="text-[10px] text-muted-foreground hover:text-amber-400 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded bg-muted/60 hover:bg-amber-500/10 cursor-pointer"
                            >
                              <Unlink className="h-3 w-3" />
                              <span>Desvincular</span>
                            </button>
                            {onNavigateToFlows && (
                              <button
                                type="button"
                                onClick={onNavigateToFlows}
                                className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0"
                              >
                                Abrir <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="p-2 rounded-lg bg-background/80 border border-border text-[11px] text-muted-foreground line-clamp-2 italic">
                          "{rule.resposta || rule.response || 'Sem resposta de texto configurada'}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Rodapé com Ações */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
                    <span className="text-[10px] text-muted-foreground">
                      {isActive ? '● Ativa' : '○ Inativa'}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenModal(rule)}
                        title="Editar regra"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingRule(rule)}
                        title="Excluir regra"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Modal de Criação / Edição de Regra */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {editingRule ? 'Editar Regra' : 'Nova Regra de Automação'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Configure os critérios de acionamento e a ação correspondente
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4">
              {/* Nome da Regra */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Nome da Regra *
                </label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex: Dúvidas sobre frete, Ofertas de Kits, Aviso de Pedido Agendado"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                  required
                />
              </div>

              {/* Descrição Opcional */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Descrição Opcional
                </label>
                <input
                  type="text"
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Ex: Dispara quando a cliente perguntar valores ou formas de pagamento"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                />
              </div>

              {/* Grid: Tipo de Gatilho e Prioridade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    Tipo de Gatilho *
                  </label>
                  <select
                    value={formTipoGatilho}
                    onChange={(e) => setFormTipoGatilho(e.target.value as RuleTriggerType)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  >
                    <option value="palavra_chave">Palavras-chave (Mensagem)</option>
                    <option value="mensagem_recebida">Qualquer Mensagem Recebida</option>
                    <option value="pedido_agendado">Pedido Agendado (Logzz/Brizex)</option>
                    <option value="pedido_em_separacao">Pedido em Separação</option>
                    <option value="pedido_separado">Mercadoria Separada</option>
                    <option value="pedido_em_rota">Saiu para Entrega (Em Rota)</option>
                    <option value="pedido_entregue">Pedido Entregue (Completo)</option>
                    <option value="pedido_cancelado">Pedido Cancelado</option>
                    <option value="pedido_reagendar">A Reagendar / Frustrado</option>
                    <option value="inatividade">Tempo de Inatividade</option>
                    <option value="manual">Disparo Manual / API</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    Prioridade de Execução
                  </label>
                  <select
                    value={formPrioridade}
                    onChange={(e) => setFormPrioridade(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  >
                    <option value="Critica">Crítica (P1 - Máxima prioridade)</option>
                    <option value="Alta">Alta (P2 - Padrão)</option>
                    <option value="Media">Média (P3 - Intermediária)</option>
                    <option value="Baixa">Baixa (P4 - Fallbacks)</option>
                  </select>
                </div>
              </div>

              {/* Condições específicas por tipo */}
              {formTipoGatilho === 'palavra_chave' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Palavras-chave de Acionamento *</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Separadas por vírgula</span>
                  </label>
                  <input
                    type="text"
                    value={formPalavrasChave}
                    onChange={(e) => setFormPalavrasChave(e.target.value)}
                    placeholder="Ex: preco, precos, valor, quanto custa, tabela, kit"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Plurais e variações sem acento são identificados deterministicamente.
                  </p>
                </div>
              )}

              {(formTipoGatilho.startsWith('pedido_') || formTipoGatilho === 'evento_pedido') && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    Status do Pedido na Logzz
                  </label>
                  <select
                    value={formStatusPedido}
                    onChange={(e) => setFormStatusPedido(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  >
                    <option value="Agendado">Agendado</option>
                    <option value="Em Separação">Em Separação</option>
                    <option value="Separado">Separado</option>
                    <option value="Em Rota">Em Rota</option>
                    <option value="Cancelado">Cancelado</option>
                    <option value="A Reagendar">A Reagendar</option>
                    <option value="Frustrado">Frustrado</option>
                    <option value="Completo">Completo</option>
                  </select>
                </div>
              )}

              {formTipoGatilho === 'inatividade' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    Minutos sem resposta do cliente
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={formTempoInatividade}
                    onChange={(e) => setFormTempoInatividade(parseInt(e.target.value, 10) || 15)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              )}

              {/* Fluxo Vinculado */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Fluxo Vinculado (Opcional)</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Dispara automação visual</span>
                </label>
                <select
                  value={formFluxoId}
                  onChange={(e) => setFormFluxoId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="">Nenhum fluxo (usar apenas resposta direta abaixo)</option>
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome} ({f.blocos?.length || 0} blocos) {f.ativo === false ? '(Inativo)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Texto de Resposta / Mensagem */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Mensagem de Texto / Resposta Direta</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Variáveis: &#123;&#123;nome&#125;&#125;, &#123;&#123;pedido&#125;&#125;, &#123;&#123;status&#125;&#125;, &#123;&#123;valor&#125;&#125;
                  </span>
                </label>
                <textarea
                  value={formTextoResposta}
                  onChange={(e) => setFormTextoResposta(e.target.value)}
                  placeholder="Ex: Olá, {{nome}}! Seu pedido {{pedido}} foi confirmado no valor de {{valor}} e está com status {{status}}."
                  rows={3}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground leading-relaxed"
                />
              </div>

              {/* Status Ativo / Inativo */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formAtivo"
                  checked={formAtivo}
                  onChange={(e) => setFormAtivo(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="formAtivo" className="text-xs text-foreground cursor-pointer font-medium">
                  Regra ativa (pronta para responder a eventos e mensagens)
                </label>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>{editingRule ? 'Atualizar Regra' : 'Criar Regra'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deletingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Confirmar Exclusão de Regra</h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Tem certeza de que deseja excluir a regra <strong>"{deletingRule.nome || deletingRule.name}"</strong>?
              Esta ação removerá o gatilho da automação.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setDeletingRule(null)}
                className="px-3.5 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deletingLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
