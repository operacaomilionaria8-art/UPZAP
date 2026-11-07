import React, { useState, useEffect } from 'react';
import {
  Link2,
  Save,
  CheckCircle2,
  Clock,
  RotateCcw,
  Loader2,
  Zap,
  Layers,
  Power,
  Info,
  Check,
  AlertCircle
} from 'lucide-react';
import { EventFlowMapping, LinearFlow } from '../../types/upzap';
import { authFetch } from '../../lib/api';

interface EventMappingsViewProps {
  flows: LinearFlow[];
  rules: any[];
}

export const EventMappingsView: React.FC<EventMappingsViewProps> = ({ flows, rules }) => {
  const [mappings, setMappings] = useState<EventFlowMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchMappings = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await authFetch('/api/event-mappings');
      if (res.ok) {
        const data = await res.json();
        setMappings(data.mappings || []);
      } else {
        setErrorMsg('Não foi possível carregar os mapeamentos.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao carregar mapeamentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleToggle = (mappingId: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.id === mappingId ? { ...m, ativo: !m.ativo } : m))
    );
  };

  const handleFlowChange = (mappingId: string, flowId: string) => {
    const selectedFlow = flows.find((f) => f.id === flowId);
    setMappings((prev) =>
      prev.map((m) =>
        m.id === mappingId
          ? {
              ...m,
              fluxoId: flowId || undefined,
              fluxoNome: selectedFlow ? selectedFlow.nome : undefined
            }
          : m
      )
    );
  };

  const handleRuleChange = (mappingId: string, ruleId: string) => {
    const selectedRule = rules.find((r) => r.id === ruleId);
    setMappings((prev) =>
      prev.map((m) =>
        m.id === mappingId
          ? {
              ...m,
              regraId: ruleId || undefined,
              regraNome: selectedRule ? selectedRule.nome || selectedRule.name : undefined
            }
          : m
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMsg(null);
    try {
      const res = await authFetch('/api/event-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings })
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setErrorMsg('Erro ao salvar mapeamentos na API.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao salvar mapeamentos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 w-full h-full flex flex-col bg-background text-foreground overflow-y-auto p-4 md:p-6 space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Mapeamento de Eventos Brizex / Logzz
              </h2>
              <p className="text-xs text-muted-foreground">
                Defina qual fluxo ou regra será disparado automaticamente quando cada status de pedido for recebido via webhook.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30 animate-in fade-in">
              <Check className="w-3.5 h-3.5" /> Mapeamentos salvos!
            </span>
          )}

          <button
            type="button"
            onClick={fetchMappings}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border cursor-pointer transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Salvar Mapeamentos</span>
          </button>
        </div>
      </div>

      {/* BANNER INFORMATIVO */}
      <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3 shadow-xs">
        <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
        <div className="text-xs text-foreground space-y-1">
          <p className="font-semibold text-foreground">Como funciona o disparo de eventos de pedidos:</p>
          <p className="text-muted-foreground">
            Quando o webhook da Brizex/Logzz recebe um pedido novo ou atualização de status, o UpZap identifica o cliente, atualiza o CRM e dispara o fluxo vinculado. Você pode utilizar variáveis dinâmicas nos blocos de mensagem: <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">{"{{nome}}"}</code>, <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">{"{{pedido}}"}</code>, <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">{"{{status}}"}</code>, <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">{"{{valor}}"}</code>, <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">{"{{rastreio}}"}</code> e <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">{"{{itens}}"}</code>.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {errorMsg}
        </div>
      )}

      {/* TABELA DE MAPEAMENTOS */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm">Carregando tabela de mapeamentos...</span>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-foreground">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border font-semibold">
                <tr>
                  <th className="px-4 py-3.5 w-16">Ativo</th>
                  <th className="px-4 py-3.5">Status Oficial Logzz / Evento</th>
                  <th className="px-4 py-3.5">Fluxo Vinculado</th>
                  <th className="px-4 py-3.5">Regra Gatilho (Opcional)</th>
                  <th className="px-4 py-3.5">Descrição do Comportamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mappings.map((m, mIdx) => {
                  const mappingKey = m.id || m.evento || m.statusLogzzCorrespondente || `map-row-${mIdx}`;
                  const displayStatus = m.statusLogzzCorrespondente || m.nomeEvento || m.evento || 'Evento';

                  return (
                    <tr
                      key={mappingKey}
                      className={`hover:bg-muted/40 transition-colors ${
                        !m.ativo ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggle(m.id || mappingKey)}
                          className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            m.ativo
                              ? 'bg-primary/15 border-primary/30 text-primary hover:bg-primary/25'
                              : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                          }`}
                          title={m.ativo ? 'Desativar este evento' : 'Ativar este evento'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </td>

                      <td className="px-4 py-3.5 font-bold text-foreground whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 border border-border font-mono text-primary text-xs w-fit">
                            {displayStatus}
                          </span>
                          {m.nomeEvento && m.nomeEvento !== displayStatus && (
                            <span className="text-[11px] text-muted-foreground font-normal">
                              {m.nomeEvento}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 min-w-56">
                        <div className="relative">
                          <select
                            value={m.fluxoId || ''}
                            onChange={(e) => handleFlowChange(m.id || mappingKey, e.target.value)}
                            disabled={!m.ativo}
                            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-all"
                          >
                            <option value="">Nenhum fluxo vinculado</option>
                            {flows.map((f, fIdx) => (
                              <option key={f.id ? `flow-opt-${f.id}-${fIdx}` : `flow-idx-${fIdx}`} value={f.id}>
                                🔀 {f.nome} ({f.blocos?.length || 0} blocos)
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 min-w-56">
                        <div className="relative">
                          <select
                            value={m.regraId || ''}
                            onChange={(e) => handleRuleChange(m.id || mappingKey, e.target.value)}
                            disabled={!m.ativo}
                            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-all"
                          >
                            <option value="">Nenhuma regra específica</option>
                            {rules.map((r, rIdx) => (
                              <option key={r.id ? `rule-opt-${r.id}-${rIdx}` : `rule-idx-${rIdx}`} value={r.id}>
                                ⚡ {r.nome || r.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {m.descricao || `Dispara automação quando o pedido estiver com status ${displayStatus}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
