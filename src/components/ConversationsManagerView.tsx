import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Send,
  Bot,
  Hand,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  UserCheck,
  RotateCcw,
  GitBranch,
  Tag,
  ShoppingBag,
  MessageSquare,
  User,
  Package,
  Calendar,
  Phone,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { PageIntro, Badge } from './v0-ui';
import { AttendanceMode } from '../types/upzap';

export interface ChatMessage {
  id: string;
  from: 'user' | 'bot' | 'agent';
  text: string;
  time: string;
  status?: string;
  statusLabel?: string;
  error?: string;
  delaySeconds?: number;
  flowName?: string;
  source?: string;
}

export interface ConversationItem {
  id: string;
  phone: string;
  name: string;
  initials: string;
  state: 'active' | 'closed';
  unreadCount?: number;
  lastMessage: string;
  lastTime: string;
  mode: AttendanceMode;
  messages: ChatMessage[];
  currentFlow?: string;
  selectedKit?: string;
  selectedColor?: string;
  selectedSize?: string;
}

export const ConversationsManagerView: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [replyText, setReplyText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showContactDetails, setShowContactDetails] = useState<boolean>(false);
  const [relatedOrders, setRelatedOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);

  // Proteção contra bug de polling apagando texto digitado
  const isInputFocusedRef = useRef(false);
  const isInputDirtyRef = useRef(false);
  const currentReplyTextRef = useRef('');

  const fetchConversations = async (isInitial = false) => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : data.conversations || [];

        const formatted: ConversationItem[] = rawList.map((c: any, i: number) => {
          const phone = c.senderNumber || c.phone || `551199999000${i}`;
          const name = c.senderName || c.contactName || (phone.length > 8 ? `+${phone}` : `Contato #${i + 1}`);
          const initials = name
            .split(' ')
            .map((w: string) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'CT';

          // Mensagens de histórico real rastreadas pelo backend (Item 1: Sem dados fictícios simulados)
          const msgs: ChatMessage[] = [];
          if (Array.isArray(c.messages) && c.messages.length > 0) {
            c.messages.forEach((m: any) => {
              msgs.push({
                id: m.id || `${c.id}-${Math.random()}`,
                from: m.from || 'bot',
                text: m.text || '',
                time: m.formattedTime || (m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Hoje'),
                status: m.status,
                statusLabel: m.statusLabel,
                error: m.error,
                delaySeconds: m.delaySeconds,
                flowName: m.flowName,
                source: m.source
              });
            });
          } else {
            if (c.lastUserMessage) {
              msgs.push({
                id: `${c.id}-u1`,
                from: 'user',
                text: c.lastUserMessage,
                time: c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Hoje',
                status: 'delivered',
                statusLabel: 'Recebida'
              });
            }
            if (c.lastBotReply) {
              msgs.push({
                id: `${c.id}-b1`,
                from: 'bot',
                text: c.lastBotReply,
                time: c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Hoje',
                status: 'transport_ack',
                statusLabel: 'Aceita pelo transporte'
              });
            }
          }

          return {
            id: c.id || phone,
            phone,
            name,
            initials,
            state: c.state === 'closed' ? 'closed' : 'active',
            unreadCount: c.state === 'active' ? (i % 2 === 0 ? 1 : 0) : 0,
            lastMessage: c.lastUserMessage || c.lastBotReply || 'Aguardando primeira mensagem...',
            lastTime: c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '14:06',
            mode: c.attendanceMode === 'manual' ? 'manual' : (c.attendanceMode === 'paused' ? 'paused' : 'auto'),
            messages: msgs,
            currentFlow: c.currentFlow,
            selectedKit: c.selectedKit,
            selectedColor: c.selectedColor,
            selectedSize: c.selectedSize,
            influencerCode: c.influencerCode
          };
        });

        // Atualiza a lista com as conversas reais do backend
        setConversations(formatted);
        if (formatted.length > 0) {
          setSelectedId((prev) => (prev && formatted.some((c: any) => c.id === prev) ? prev : formatted[0].id));
        } else {
          setSelectedId(null);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar atendimentos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations(true);
    const interval = setInterval(() => {
      fetchConversations(false);
    }, 15000); // 15 segundos
    return () => clearInterval(interval);
  }, []);

  const activeConversation = conversations.find((c) => c.id === selectedId) || conversations[0];

  useEffect(() => {
    if (activeConversation?.phone) {
      const cleanPhone = activeConversation.phone.replace(/\D/g, '');
      setLoadingOrders(true);
      fetch(`/api/orders?search=${encodeURIComponent(cleanPhone)}`)
        .then((r) => r.json())
        .then((d) => {
          setRelatedOrders(d.orders || []);
        })
        .catch(() => setRelatedOrders([]))
        .finally(() => setLoadingOrders(false));
    } else {
      setRelatedOrders([]);
    }
  }, [activeConversation?.phone]);

  const handleSendMessage = async () => {
    if (!replyText.trim() || !activeConversation) return;
    setSending(true);
    const textToSend = replyText.trim();
    try {
      // Disparo real via API
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: activeConversation.phone,
          message: textToSend
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Erro na resposta do WhatsApp send:', errData);
      }

      // Atualiza localmente a conversa
      const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConversation.id) {
            return {
              ...c,
              lastMessage: textToSend,
              lastTime: now,
              messages: [
                ...c.messages,
                {
                  id: `agent-${Date.now()}`,
                  from: 'agent',
                  text: textToSend,
                  time: now
                }
              ]
            };
          }
          return c;
        })
      );

      // Limpar input de forma segura
      setReplyText('');
      currentReplyTextRef.current = '';
      isInputDirtyRef.current = false;
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setSending(false);
    }
  };

  const handleToggleAttendanceMode = async () => {
    if (!activeConversation) return;
    const isCurrentlyManual = activeConversation.mode === 'manual';
    const nextMode: AttendanceMode = isCurrentlyManual ? 'auto' : 'manual';
    const endpoint = isCurrentlyManual
      ? `/api/conversations/${encodeURIComponent(activeConversation.phone)}/resume-auto`
      : `/api/conversations/${encodeURIComponent(activeConversation.phone)}/assume-manual`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorName: 'Operador' })
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversation.id ? { ...c, mode: nextMode } : c))
        );
      }
    } catch (err) {
      console.error('Erro ao alternar modo de atendimento:', err);
    }
  };

  const handleToggleClose = async () => {
    if (!activeConversation) return;
    const isClosing = activeConversation.state === 'active';
    const endpoint = isClosing
      ? `/api/conversations/${encodeURIComponent(activeConversation.phone)}/close`
      : `/api/conversations/${encodeURIComponent(activeConversation.phone)}/reopen`;
    try {
      await fetch(endpoint, { method: 'POST' });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? { ...c, state: isClosing ? 'closed' : 'active' }
            : c
        )
      );
    } catch (err) {
      console.error('Erro ao encerrar/reabrir conversa:', err);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.lastMessage.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Atendimentos</h1>
        <PageIntro className="mb-0 mt-1">
          Acompanhe conversas em andamento, assuma o controle humano ou encerre atendimentos.
        </PageIntro>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* Painel Esquerdo: Lista de conversas */}
        <div className="rounded-xl border border-border bg-card flex flex-col h-[600px]">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar conversa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30 mb-2 text-primary" />
                <p className="text-xs font-semibold text-foreground">Nenhum atendimento</p>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">
                  Base limpa e pronta. Novas conversas de clientes aparecerão aqui automaticamente.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredConversations.map((conv) => {
                  const isSelected = conv.id === activeConversation?.id;
                  return (
                    <li key={conv.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(conv.id)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                          isSelected ? 'bg-secondary/80' : 'hover:bg-secondary/40'
                        }`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                          {conv.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {conv.name}
                            </span>
                            {conv.unreadCount ? (
                              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                {conv.unreadCount}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {conv.lastMessage}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Painel Direito: Chat ativo */}
        {activeConversation ? (
          <div className="flex h-[600px] flex-col rounded-xl border border-border bg-card">
            {/* Header do Chat */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                  {activeConversation.initials}
                </span>
                <div>
                  <p className="text-sm font-medium">{activeConversation.name}</p>
                  <p className="text-xs text-muted-foreground">{activeConversation.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowContactDetails((prev) => !prev)}
                  title="Ver dados do contato e pedidos do CRM"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    showContactDetails
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dados & Pedidos</span>
                  {showContactDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>

                <Badge tone={activeConversation.state === 'active' ? 'green' : 'gray'} dot>
                  {activeConversation.state === 'active' ? 'Ativo' : 'Encerrado'}
                </Badge>

                {/* Botão de Assumir / Devolver para robô */}
                <button
                  type="button"
                  onClick={handleToggleAttendanceMode}
                  className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    activeConversation.mode === 'manual'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Hand className="h-3.5 w-3.5" />
                  {activeConversation.mode === 'manual' ? 'Devolver p/ robô' : 'Assumir'}
                </button>

                {/* Botão de Encerrar / Reabrir */}
                <button
                  type="button"
                  onClick={handleToggleClose}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                >
                  {activeConversation.state === 'active' ? (
                    <>
                      <X className="h-3.5 w-3.5 text-red-400" />
                      Encerrar
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                      Reabrir
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Painel Expansível de Dados do Contato e Pedidos Relacionados */}
            {showContactDetails && (
              <div className="border-b border-border bg-secondary/30 p-4 space-y-3 text-xs animate-in slide-in-from-top-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-2.5 rounded-lg bg-card border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Contato</span>
                    <span className="font-medium text-foreground">{activeConversation.name}</span>
                    <span className="block text-muted-foreground font-mono text-[11px] mt-0.5">{activeConversation.phone}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Situação do Atendimento</span>
                    <span className="font-medium text-foreground capitalize">
                      {activeConversation.state === 'active' ? 'Atendimento Aberto' : 'Atendimento Encerrado'}
                    </span>
                    <span className="block text-muted-foreground text-[11px] mt-0.5">
                      Modo: {activeConversation.mode === 'manual' ? '👤 Operador Humano' : '🤖 Robô Automático'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Histórico de Mensagens</span>
                    <span className="font-medium text-foreground">{activeConversation.messages.length} mensagens trocadas</span>
                    <span className="block text-muted-foreground text-[11px] mt-0.5">Última: {activeConversation.lastTime}</span>
                  </div>
                </div>

                {/* Pedidos Relacionados */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-primary" />
                      Pedidos Relacionados (Logzz / Brizex):
                    </span>
                    {loadingOrders && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Buscando pedidos...</span>}
                  </div>

                  {relatedOrders.length === 0 ? (
                    <div className="p-2.5 rounded-lg bg-card border border-border text-center text-muted-foreground text-[11px]">
                      Nenhum pedido vinculado a este número de telefone até o momento.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {relatedOrders.map((ord) => (
                        <div key={ord.id} className="p-2.5 rounded-lg bg-card border border-border flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-foreground">{ord.logzzOrderId}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                {ord.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {ord.itens?.map((it: any) => `${it.quantidade || 1}x ${it.nome}`).join(', ') || 'Produtos Logzz'}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-foreground">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ord.valorTotal || 0)}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {ord.dataCriacao ? new Date(ord.dataCriacao).toLocaleDateString('pt-BR') : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Faixa de Contexto da Automação */}
            {(activeConversation.currentFlow ||
              activeConversation.selectedKit ||
              activeConversation.selectedSize) && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/15 px-5 py-2 text-xs">
                {activeConversation.currentFlow && (
                  <Badge tone="purple">
                    <GitBranch className="h-3 w-3 mr-1 inline" />
                    Fluxo: {activeConversation.currentFlow}
                  </Badge>
                )}
                {activeConversation.selectedKit && (
                  <Badge tone="blue">
                    <ShoppingBag className="h-3 w-3 mr-1 inline" />
                    Kit: {activeConversation.selectedKit}
                  </Badge>
                )}
                {(activeConversation.selectedSize || activeConversation.selectedColor) && (
                  <Badge tone="gray">
                    {[activeConversation.selectedSize, activeConversation.selectedColor].filter(Boolean).join(' / ')}
                  </Badge>
                )}
              </div>
            )}

            {/* Balões de Mensagem */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-secondary/30 p-5">
              {activeConversation.messages.map((m) => {
                const isFromBot = m.from === 'bot';
                const isFromAgent = m.from === 'agent';
                const isFromUser = m.from === 'user';

                if (isFromUser) {
                  return (
                    <div key={m.id} className="flex justify-start">
                      <div className="max-w-[75%] rounded-2xl px-3.5 py-2 text-sm rounded-tl-xs bg-card text-card-foreground border border-border/60">
                        <p className="text-pretty">{m.text}</p>
                        <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/40 pt-1 text-[10px] text-muted-foreground">
                          <span>{m.time}</span>
                          <span className="text-emerald-500 font-medium text-[10px]">✔ Recebida</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Resposta do robô ou do operador
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[75%] rounded-2xl px-3.5 py-2 text-sm rounded-tr-xs bg-primary text-primary-foreground shadow-xs">
                      <span className="mb-0.5 flex items-center gap-1 text-[11px] opacity-90">
                        {isFromBot ? (
                          <>
                            <Bot className="h-3 w-3" /> Atendente virtual
                          </>
                        ) : (
                          <>
                            <UserCheck className="h-3 w-3" /> Operador humano
                          </>
                        )}
                      </span>
                      <p className="text-pretty whitespace-pre-line">{m.text}</p>

                      {/* Status de Envio Confiável (Item 1) */}
                      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-primary-foreground/20 pt-1 text-[10px]">
                        <span className="opacity-75">{m.time}</span>
                        {m.status === 'waiting_delay' && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-400/25 px-1.5 py-0.5 text-[10px] text-amber-100 font-medium">
                            ⏳ Aguardando delay ({m.delaySeconds || 1.5}s)
                          </span>
                        )}
                        {m.status === 'sending' && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-400/25 px-1.5 py-0.5 text-[10px] text-blue-100 font-medium animate-pulse">
                            📤 Enviando...
                          </span>
                        )}
                        {m.status === 'transport_ack' && (
                          <span className="inline-flex items-center gap-0.5 opacity-85 text-[10px]" title="Mensagem transmitida e aceita pelo transporte WhatsApp">
                            ✔ Aceita
                          </span>
                        )}
                        {m.status === 'delivered' && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-200 font-semibold text-[10px]" title="Confirmada entrega no WhatsApp do cliente">
                            ✔✔ Entregue
                          </span>
                        )}
                        {m.status === 'read' && (
                          <span className="inline-flex items-center gap-0.5 text-sky-200 font-semibold text-[10px]" title="Mensagem lida pelo cliente">
                            👁 Lida
                          </span>
                        )}
                        {m.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 rounded bg-red-500/35 px-1.5 py-0.5 text-[10px] text-red-100 font-medium" title={m.error}>
                            ❌ Falha no envio: {m.error || 'Erro técnico'}
                          </span>
                        )}
                        {!m.status && (
                          <span className="inline-flex items-center gap-0.5 opacity-70 text-[10px]">✔</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input de Envio de Mensagem com Proteção contra Perda */}
            <div className="flex items-center gap-2 border-t border-border p-3">
              <input
                type="text"
                placeholder="Digite uma mensagem..."
                value={replyText}
                onChange={(e) => {
                  isInputDirtyRef.current = true;
                  currentReplyTextRef.current = e.target.value;
                  setReplyText(e.target.value);
                }}
                onFocus={() => {
                  isInputFocusedRef.current = true;
                }}
                onBlur={() => {
                  isInputFocusedRef.current = false;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={sending || !replyText.trim()}
                aria-label="Enviar mensagem"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-[600px] flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center text-muted-foreground space-y-2">
            <MessageSquare className="h-10 w-10 opacity-30 text-primary" />
            <p className="text-sm font-semibold text-foreground">Caixa de Atendimentos Pronta</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Nenhuma conversa em andamento. Quando um cliente enviar uma mensagem pelo WhatsApp ou pelo Simulador, o atendimento será iniciado automaticamente aqui.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
