import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCcw,
  Bot,
  Zap,
  Send,
  User,
  Shield,
  Loader2,
  GitBranch,
  List,
  Tag,
  UserCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { PageIntro, Panel, Badge } from './v0-ui';
import { BaseOficialUpZap } from '../types/upzap';
import { authFetch } from '../lib/api';

interface Message {
  id: string;
  from: 'user' | 'bot';
  text: string;
  triggerBadge?: string;
  options?: Array<{ numero: string | number; texto: string }>;
  time: string;
}

interface DiagnosticInfo {
  regraAcionada: string;
  tipo: string;
  fluxoIniciado: string;
  etapasExecutadas: string[];
  conteudoCarregado: string[];
  mensagensNaFila: number;
  tentativaEnvio: string;
  resultadoEnvio: string;
  eventuaisErros?: string;
  delays: number[];
  timestamp: string;
}

interface SimuladorViewProps {
  base?: BaseOficialUpZap;
}

export const SimuladorView: React.FC<SimuladorViewProps> = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentPhone, setCurrentPhone] = useState<string>('5511999990001');
  const [convState, setConvState] = useState<any>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Carrega estado persistente da conversa no backend ao trocar ou inicializar
  const loadConversationState = async (phone: string) => {
    try {
      const res = await authFetch(`/api/simulator/conversation/${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.conversation) {
          setConvState(data.conversation);
        }
      }
    } catch (e) {
      console.warn('[SimuladorView] Aviso ao carregar estado da conversa:', e);
    }
  };

  useEffect(() => {
    loadConversationState(currentPhone);
  }, [currentPhone]);

  // Enviar mensagem para o motor de simulação real no backend
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      from: 'user',
      text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const res = await authFetch('/api/simulator/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          phone: currentPhone,
          contactName:
            currentPhone === '5511999990001'
              ? 'Mariana Silva'
              : currentPhone === '5511999990002'
              ? 'Camila Santos'
              : 'Isabela Ribeiro'
        })
      });

      if (res.ok) {
        const data = await res.json();
        const result = data.result;
        setConvState(data.conversation || null);

        // Diagnóstico técnico detalhado da simulação
        const executedSteps: string[] = [];
        if (result.matchedType === 'welcome_flow') {
          executedSteps.push('1. Saudação Inicial (Boas-vindas)', '2. Apresentação da Loja Brizex', '3. Menu Principal Numerado');
        } else if (result.matchedType === 'active_menu') {
          executedSteps.push('1. Leitura de Opção do Menu Ativo', `2. Validação Determinística da Escolha`, `3. Transição para ${result.flowName || 'Fluxo Escolhido'}`);
        } else if (result.matchedType === 'rule_flow') {
          executedSteps.push('1. Avaliação de Palavras-Chave', '2. Priorização por Score P1-P4', `3. Acionamento do Fluxo: ${result.flowName}`);
        } else if (result.matchedType === 'human_transfer') {
          executedSteps.push('1. Reconhecimento de Intenção Humana', '2. Pausa da Automação (Robô)', '3. Transferência para Fila de Atendimento');
        } else if (result.matchedType === 'fallback') {
          executedSteps.push('1. Nenhuma Regra ou Opção Correspondente', '2. Diagnóstico: Fluxo não disparado', '3. Emissão de Mensagem de Ajuda/Fallback');
        } else {
          executedSteps.push('1. Processamento determinístico', '2. Resposta gerada');
        }

        const loadedContents: string[] = [];
        if (result.responseTexts?.length) loadedContents.push(`${result.responseTexts.length} blocos de texto gerados`);
        if (result.mediaAttachments?.length) loadedContents.push(...result.mediaAttachments.map((m: any) => `Mídia: ${m.fileName}`));

        setDiagnostic({
          regraAcionada: result.matchedName || 'Nenhuma regra (Fluxo direto)',
          tipo: result.matchedType,
          fluxoIniciado: result.flowName || (result.matchedType === 'fallback' ? 'Nenhum (Mensagem não reconhecida)' : result.matchedName || 'Nenhum fluxo iniciado'),
          etapasExecutadas: executedSteps,
          conteudoCarregado: loadedContents,
          mensagensNaFila: result.responseTexts?.length || 0,
          tentativaEnvio: 'Simulado internamente (Sem envio ao WhatsApp real)',
          resultadoEnvio: result.status === 'success' ? 'Sucesso determinístico (Memória atualizada)' : result.status || 'Processado',
          eventuaisErros: result.matchedType === 'fallback' ? 'Nenhuma palavra-chave ou regra atingiu o limiar de acionamento.' : undefined,
          delays: result.delays || [],
          timestamp: new Date().toLocaleTimeString('pt-BR')
        });

        if (result && Array.isArray(result.responseTexts) && result.responseTexts.length > 0) {
          const newBotMessages: Message[] = result.responseTexts.map((txt: string, idx: number) => ({
            id: `bot-${Date.now()}-${idx}`,
            from: 'bot',
            text: txt,
            triggerBadge: result.matchedName,
            options: (idx === result.responseTexts.length - 1) ? result.activeMenu?.opcoes : undefined,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          }));

          // Aviso explícito quando transferência para atendente humano é executada
          if (result.matchedType === 'human_transfer' || data.conversation?.attendanceMode === 'manual') {
            newBotMessages.push({
              id: `bot-human-${Date.now()}`,
              from: 'bot',
              text: '🔔 [AVISO DO SISTEMA]: O atendimento foi transferido para a equipe humana. O robô foi pausado para esta conversa e aguardará interação manual.',
              triggerBadge: 'Transferido para Humano',
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });
          }

          setMessages((prev) => [...prev, ...newBotMessages]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              from: 'bot',
              text: '(Nenhuma resposta disparada — fluxo não correspondeu ou automação está silenciada)',
              triggerBadge: result?.matchedName || 'Silenciado',
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            }
          ]);
        }
      } else {
        let errorDetail = `Código HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error || errData.message) {
            errorDetail = [errData.error, errData.message].filter(Boolean).join(' - ');
          }
        } catch {
          const rawErr = await res.text().catch(() => '');
          if (rawErr) errorDetail = rawErr.slice(0, 180);
        }

        setDiagnostic({
          regraAcionada: 'Falha',
          tipo: 'erro',
          fluxoIniciado: 'Nenhum',
          etapasExecutadas: ['Interrupção por erro de servidor'],
          conteudoCarregado: [],
          mensagensNaFila: 0,
          tentativaEnvio: 'Interrompida',
          resultadoEnvio: 'Falha',
          eventuaisErros: errorDetail,
          delays: [],
          timestamp: new Date().toLocaleTimeString('pt-BR')
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            from: 'bot',
            text: `⚠️ Erro de comunicação com o servidor (${res.status}): ${errorDetail}`,
            triggerBadge: `Erro ${res.status}`,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          from: 'bot',
          text: `Falha na requisição: ${err.message || 'Erro de conexão'}`,
          triggerBadge: 'Erro de Conexão',
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Reiniciar estado desta conversa no backend
  const handleReset = async () => {
    try {
      const res = await authFetch('/api/simulator/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone })
      });
      if (res.ok) {
        setMessages([]);
        setConvState(null);
      }
    } catch (err) {
      console.warn('[SimuladorView] Erro ao resetar conversa:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Simulador Integrado</h1>
          <PageIntro className="mb-0 mt-1">
            Teste em tempo real o fluxo completo: Boas-vindas, Menus, Regras com Prioridade, Biblioteca e Captura de Influenciadora.
          </PageIntro>
        </div>

        {/* Alternador de Clientes (Item 9: Verificar que duas conversas não misturam dados) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Cliente Simulado:</span>
          <select
            value={currentPhone}
            onChange={(e) => {
              setCurrentPhone(e.target.value);
              setMessages([]);
              setConvState(null);
            }}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="5511999990001">Cliente A (Mariana - 5511...001)</option>
            <option value="5511999990002">Cliente B (Camila - 5511...002)</option>
            <option value="5511999990003">Cliente C (Isabela - 5511...003)</option>
          </select>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
            title="Limpar histórico e reiniciar esta conversa"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reiniciar
          </button>
        </div>
      </div>

      {/* Item 7: Distinção Clara entre Simulação e WhatsApp Real */}
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-sky-200">
        <div className="flex items-center gap-2">
          <span className="flex h-5 px-2 items-center justify-center rounded bg-sky-500/25 font-bold uppercase tracking-wider text-[10px] text-sky-200 shrink-0">
            Ambiente Simulado
          </span>
          <span className="leading-snug">
            Demonstração determinística de regras, transições e variáveis. <strong>Nenhuma mensagem é transmitida ao WhatsApp real nesta tela.</strong>
          </span>
        </div>
        <span className="text-[11px] text-sky-300/80 shrink-0">
          Envios reais: use a aba <strong>Atendimentos</strong> ou converse pelo WhatsApp conectado.
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1 & 2: Chat Interativo */}
        <div className="lg:col-span-2 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          {/* Topo do Chat */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-secondary/20">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Assistente Virtual Brizex</p>
                <p className="text-[10px] text-emerald-400 font-medium">Motor de Automação Ativo</p>
              </div>
            </div>

            {convState?.currentFlow && (
              <Badge tone="purple">
                <GitBranch className="h-3 w-3 mr-1 inline" />
                {convState.currentFlow}
              </Badge>
            )}
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 min-h-[460px] max-h-[560px] overflow-y-auto p-4 space-y-3 bg-secondary/10">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-3">
                <Bot className="h-10 w-10 opacity-30" />
                <div className="max-w-sm space-y-1">
                  <p className="text-xs font-semibold text-foreground">Conversa limpa e pronta para testes</p>
                  <p className="text-[11px]">
                    Envie qualquer mensagem ou clique em um dos atalhos rápidos abaixo para testar o fluxo de boas-vindas.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.from === 'user';
                return (
                  <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-xs space-y-1.5 ${
                        isUser
                          ? 'bg-primary text-primary-foreground rounded-tr-xs'
                          : 'bg-card border border-border text-card-foreground rounded-tl-xs'
                      }`}
                    >
                      {!isUser && m.triggerBadge && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                          <Zap className="h-3 w-3 shrink-0" />
                          <span>{m.triggerBadge}</span>
                        </div>
                      )}

                      <p className="whitespace-pre-line leading-relaxed text-pretty">{m.text}</p>

                      {/* Exclusivamente texto comum numerado - Sem botões interativos (Item 1) */}

                      <span
                        className={`block text-right text-[9px] ${
                          isUser ? 'opacity-70' : 'text-muted-foreground'
                        }`}
                      >
                        {m.time}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Atalhos Rápidos para Testes */}
          <div className="border-t border-border px-4 py-2.5 bg-secondary/30 flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase shrink-0">
              Testes rápidos:
            </span>
            <button
              type="button"
              onClick={() => handleSendMessage('oi')}
              className="rounded bg-background border border-border px-2.5 py-1 text-[11px] text-foreground hover:bg-secondary whitespace-nowrap cursor-pointer font-medium"
            >
              oi
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('1')}
              className="rounded bg-background border border-border px-2.5 py-1 text-[11px] text-foreground hover:bg-secondary whitespace-nowrap cursor-pointer font-bold"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('2')}
              className="rounded bg-background border border-border px-2.5 py-1 text-[11px] text-foreground hover:bg-secondary whitespace-nowrap cursor-pointer font-bold"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('preço')}
              className="rounded bg-background border border-border px-2.5 py-1 text-[11px] text-foreground hover:bg-secondary whitespace-nowrap cursor-pointer font-medium"
            >
              preço
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('falar com atendente')}
              className="rounded bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 text-[11px] text-blue-300 hover:bg-blue-500/20 whitespace-nowrap cursor-pointer font-medium"
            >
              falar com atendente
            </button>
          </div>

          {/* Input de Envio */}
          <div className="flex items-center gap-2 border-t border-border p-3 bg-card">
            <input
              type="text"
              placeholder="Digite sua mensagem de teste como cliente..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={loading || !inputText.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Coluna 3: Painel de Diagnóstico em Tempo Real do Estado da Conversa (Item 6 & 7) */}
        <div className="space-y-4">
          {/* Item 7: Diagnósticos Técnicos da Execução Determinística */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                Diagnóstico Técnico de Execução
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">
                {diagnostic ? diagnostic.timestamp : 'Aguardando'}
              </span>
            </div>

            {diagnostic ? (
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-[11px] text-muted-foreground block">Regra / Gatilho Acionado:</span>
                  <span className="font-semibold text-foreground">{diagnostic.regraAcionada}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">Fluxo Iniciado:</span>
                  <span className="font-semibold text-emerald-400">{diagnostic.fluxoIniciado}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">Etapas Executadas:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {diagnostic.etapasExecutadas.map((et, i) => (
                      <span key={i} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {et}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">Conteúdo Carregado:</span>
                  <div className="text-[11px] text-muted-foreground">
                    {diagnostic.conteudoCarregado.length > 0 ? (
                      diagnostic.conteudoCarregado.join(', ')
                    ) : (
                      <span className="italic">Texto padrão do fluxo</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Fila de Mensagens:</span>
                    <span className="font-semibold text-foreground">{diagnostic.mensagensNaFila} msg(s)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Tentativa de Envio:</span>
                    <span className="text-sky-400 font-medium text-[11px]">Simulada (Local)</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Resultado do Envio:</span>
                  <span className="text-emerald-400 font-semibold">{diagnostic.resultadoEnvio}</span>
                </div>
                {diagnostic.eventuaisErros && (
                  <div className="rounded bg-red-500/10 border border-red-500/30 p-2 text-red-300 text-[11px]">
                    <strong>Erro técnico:</strong> {diagnostic.eventuaisErros}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Envie uma mensagem de teste para inspecionar regra acionada, fluxo, etapas e fila em tempo real.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Memória da Conversa (Backend)
              </h3>
              <Badge tone="green" dot>
                Isolada
              </Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[11px] text-muted-foreground block">Telefone Identificado:</span>
                <span className="font-mono font-semibold text-foreground">{currentPhone}</span>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block">Fluxo Ativo:</span>
                <span className="font-semibold text-emerald-400">
                  {convState?.currentFlow || 'Nenhum fluxo ativo'}
                </span>
              </div>


              <div>
                <span className="text-[11px] text-muted-foreground block">Kit Escolhido (Oferta Brizex):</span>
                <span className="font-semibold text-foreground">
                  {convState?.selectedKit || 'Ainda não selecionado'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block">Boas-vindas Enviadas:</span>
                <span className="font-medium">
                  {convState?.welcomeSent ? '✅ Sim (Não repete ao mudar de assunto)' : 'Aguardando primeira mensagem'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block">Modo de Atendimento:</span>
                <span className="font-semibold">
                  {convState?.attendanceMode === 'manual'
                    ? '👤 Atendimento Manual (Humano)'
                    : convState?.attendanceMode === 'paused'
                    ? '⏸️ Pausado'
                    : '🟢 Automação Ativa'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block">Menu Aguardando Resposta:</span>
                {convState?.activeMenu?.opcoes ? (
                  <span className="text-sky-400 font-medium">
                    Sim ({convState.activeMenu.opcoes.length} opções ativas)
                  </span>
                ) : (
                  <span className="text-muted-foreground">Não</span>
                )}
              </div>
            </div>
          </section>

          {/* Guia de Teste das Ofertas Brizex */}
          <section className="rounded-xl border border-border bg-secondary/20 p-4 text-xs text-muted-foreground space-y-2">
            <h4 className="font-semibold text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Ofertas Oficiais Brizex Validadas:
            </h4>
            <ul className="space-y-1 list-disc list-inside font-mono text-[11px]">
              <li>1 unidade: R$ 97,90</li>
              <li>2 unidades: R$ 167,90 (Mais vendida)</li>
              <li>3 unidades: R$ 197,90</li>
              <li>6 unidades: R$ 297,90</li>
              <li>Tamanhos: M, G e GG</li>
              <li>Cores: Bege e Preto</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};
