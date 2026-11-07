import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Zap,
  MessageSquare,
  Image as ImageIcon,
  ListOrdered,
  CheckCircle2,
  Plus,
  Trash2,
  Pencil,
  Save,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Workflow,
  X,
  Check,
  AlertTriangle,
  Loader2,
  Clock,
  LayoutGrid,
  PanelLeftOpen,
  PanelLeftClose,
  Crosshair,
  ChevronDown,
  Search,
  ExternalLink,
  Bot,
  Copy,
  Undo2,
  Redo2,
  Info,
  Play,
  RotateCcw,
  Send,
  User,
  Layers,
  Link2,
  Tag as TagIcon,
  GitBranch,
  Hourglass,
  PhoneCall
} from 'lucide-react';
import { LinearFlow, LinearFlowBlock, FlowConnection, FlowMenuOption } from '../types/upzap';
import { authFetch } from '../lib/api';
import { FlowsListView } from './flows/FlowsListView';
import { EventMappingsView } from './flows/EventMappingsView';

export interface VisualNode {
  id: string;
  type:
    | 'inicio'
    | 'regra'
    | 'mensagem'
    | 'midia'
    | 'menu'
    | 'encerramento'
    | 'delay'
    | 'condicao'
    | 'tag'
    | 'transferir_humano';
  x: number;
  y: number;
  width: number;
  data: {
    titulo?: string;
    // Para bloco de regra
    ruleId?: string;
    ruleName?: string;
    palavras?: string[];
    resposta?: string;
    trigger?: string;
    // Para bloco de mensagem
    conteudo?: string;
    delay?: number;
    // Para bloco de mídia
    arquivo?: string;
    tipoMidia?: 'foto' | 'video' | 'audio' | 'pdf';
    libraryItemId?: string;
    legenda?: string;
    // Para bloco de menu numerado
    tituloMenu?: string;
    rodapeMenu?: string;
    opcoes?: FlowMenuOption[];
    // Para delay
    delaySeconds?: number;
    // Para condição
    campoCondicao?: string;
    operadorCondicao?: string;
    valorCondicao?: string;
    // Para tag
    tagName?: string;
  };
}

export interface LibraryFileItem {
  id: string;
  name: string;
  fileName?: string;
  type: 'foto' | 'video' | 'audio' | 'pdf' | 'imagem';
  size: string;
  url?: string;
}

interface FlowBuilderViewProps {
  onNavigateToRules?: () => void;
  onNavigateToLibrary?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

// Cores temáticas para as opções de menu (identificação de rotas)
const MENU_OPTION_COLORS = [
  { stroke: '#10b981', fill: '#10b981', ring: 'ring-emerald-400', bg: 'bg-emerald-500/20 text-emerald-400' },
  { stroke: '#0284c7', fill: '#0284c7', ring: 'ring-sky-400', bg: 'bg-sky-500/20 text-sky-400' },
  { stroke: '#8b5cf6', fill: '#8b5cf6', ring: 'ring-purple-400', bg: 'bg-purple-500/20 text-purple-400' },
  { stroke: '#f59e0b', fill: '#f59e0b', ring: 'ring-amber-400', bg: 'bg-amber-500/20 text-amber-400' },
  { stroke: '#f43f5e', fill: '#f43f5e', ring: 'ring-rose-400', bg: 'bg-rose-500/20 text-rose-400' }
];

const SNAP_GRID = 16;
const snapToGrid = (val: number) => Math.round(val / SNAP_GRID) * SNAP_GRID;

// Curva Bézier idêntica à referência: pontos de controle horizontais a max(40, |dx| * 0.5)
export function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx;
  const c1y = y1;
  const c2x = x2 - dx;
  const c2y = y2;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

// ----------------------------------------------------
// CARD DO BLOCO NO CANVAS
// ----------------------------------------------------
interface FlowNodeCardProps {
  node: VisualNode;
  isSelected: boolean;
  connectedIn: boolean;
  connectedOut: boolean;
  connectedOptionPorts: Set<string>;
  isConnectionMode: boolean;
  libraryFiles: LibraryFileItem[];
  linkedRuleInfo?: { id: string; nome: string; ativo: boolean } | null;
  nodeRefCallback: (nodeId: string, el: HTMLDivElement | null) => void;
  onBlockMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onSelect: (e: React.MouseEvent, nodeId: string) => void;
  onStartConnection: (blockId: string, port: string, e: React.MouseEvent) => void;
  onFinishConnection: (toBlockId: string, e: React.MouseEvent) => void;
  onDoubleClick: (node: VisualNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (node: VisualNode) => void;
  onOpenEditRuleModal: (node: VisualNode) => void;
  onOpenEditGeneralNode?: (node: VisualNode) => void;
  onUpdateNodeData: (nodeId: string, partialData: Partial<VisualNode['data']>) => void;
}

const FlowNodeCard: React.FC<FlowNodeCardProps> = React.memo(
  ({
    node,
    isSelected,
    connectedIn,
    connectedOut,
    connectedOptionPorts,
    isConnectionMode,
    libraryFiles,
    linkedRuleInfo,
    nodeRefCallback,
    onBlockMouseDown,
    onSelect,
    onStartConnection,
    onFinishConnection,
    onDoubleClick,
    onDeleteNode,
    onDuplicateNode,
    onOpenEditRuleModal,
    onOpenEditGeneralNode,
    onUpdateNodeData
  }) => {
    const [isTextExpanded, setIsTextExpanded] = useState(false);

    const typeStyle = useMemo(() => {
      switch (node.type) {
        case 'inicio':
          return {
            border: 'border-emerald-500/60 shadow-emerald-950/40',
            iconBg: 'bg-emerald-500/20 text-emerald-400',
            badge: 'Ponto de Partida',
            icon: <Bot className="h-4 w-4" />
          };
        case 'regra':
          return {
            border: 'border-emerald-500/40 hover:border-emerald-400 shadow-emerald-950/20',
            iconBg: 'bg-emerald-500/20 text-emerald-400',
            badge: 'Regra Vinculada',
            icon: <Zap className="h-4 w-4" />
          };
        case 'menu':
          return {
            border: 'border-sky-500/40 hover:border-sky-400 shadow-sky-950/20',
            iconBg: 'bg-sky-500/20 text-sky-400',
            badge: 'Menu Numerado',
            icon: <ListOrdered className="h-4 w-4" />
          };
        case 'midia':
          return {
            border: 'border-purple-500/40 hover:border-purple-400 shadow-purple-950/20',
            iconBg: 'bg-purple-500/20 text-purple-400',
            badge: 'Biblioteca',
            icon: <ImageIcon className="h-4 w-4" />
          };
        case 'mensagem':
          return {
            border: 'border-amber-500/40 hover:border-amber-400 shadow-amber-950/20',
            iconBg: 'bg-amber-500/20 text-amber-400',
            badge: 'Mensagem de Texto',
            icon: <MessageSquare className="h-4 w-4" />
          };
        case 'delay':
          return {
            border: 'border-orange-500/40 hover:border-orange-400 shadow-orange-950/20',
            iconBg: 'bg-orange-500/20 text-orange-400',
            badge: 'Tempo de Espera',
            icon: <Hourglass className="h-4 w-4" />
          };
        case 'condicao':
          return {
            border: 'border-indigo-500/40 hover:border-indigo-400 shadow-indigo-950/20',
            iconBg: 'bg-indigo-500/20 text-indigo-400',
            badge: 'Condição Se/Então',
            icon: <GitBranch className="h-4 w-4" />
          };
        case 'tag':
          return {
            border: 'border-teal-500/40 hover:border-teal-400 shadow-teal-950/20',
            iconBg: 'bg-teal-500/20 text-teal-400',
            badge: 'Tag CRM',
            icon: <TagIcon className="h-4 w-4" />
          };
        case 'transferir_humano':
          return {
            border: 'border-blue-500/40 hover:border-blue-400 shadow-blue-950/20',
            iconBg: 'bg-blue-500/20 text-blue-400',
            badge: 'Atendimento Humano',
            icon: <PhoneCall className="h-4 w-4" />
          };
        case 'encerramento':
        default:
          return {
            border: 'border-rose-500/40 hover:border-rose-400 shadow-rose-950/20',
            iconBg: 'bg-rose-500/20 text-rose-400',
            badge: 'Encerramento',
            icon: <CheckCircle2 className="h-4 w-4" />
          };
      }
    }, [node.type]);

    return (
      <div
        ref={(el) => nodeRefCallback(node.id, el)}
        id={`flow-node-${node.id}`}
        data-block-id={node.id}
        data-type={node.type}
        onMouseDown={(e) => onBlockMouseDown(e, node.id)}
        onClick={(e) => onSelect(e, node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick(node);
        }}
        style={{
          transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
          width: `${node.width}px`
        }}
        className={`flow-block absolute rounded-2xl border bg-slate-900/95 backdrop-blur-md select-none cursor-grab transition-[box-shadow,border-color] duration-150 ${typeStyle.border} ${
          isSelected
            ? 'selected ring-2 ring-emerald-400 border-emerald-400/90 shadow-emerald-500/25 z-20'
            : 'shadow-xl hover:shadow-2xl z-1'
        }`}
      >
        {/* ============================================================ */}
        {/* CONECTOR DE ENTRADA (Borda Esquerda - Centro Vertical)       */}
        {/* ============================================================ */}
        {node.type !== 'inicio' && node.type !== 'regra' && (
          <div
            data-port="input"
            data-block-id={node.id}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // Entrada é apenas alvo, mousedown não inicia nada
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              onFinishConnection(node.id, e);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onFinishConnection(node.id, e);
            }}
            title="Entrada (conectar aqui)"
            className="connector input absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center cursor-crosshair z-30 group/inport"
          >
            <div
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                isConnectionMode
                  ? 'border-emerald-400 bg-emerald-500/40 ring-4 ring-emerald-400/50 scale-125 animate-pulse'
                  : connectedIn
                  ? 'border-emerald-400 bg-emerald-400'
                  : 'border-slate-500 bg-slate-800 group-hover/inport:border-emerald-400 group-hover/inport:bg-emerald-950 group-hover/inport:scale-125'
              }`}
            />
          </div>
        )}

        {/* CABEÇALHO DO BLOCO */}
        <div className="block-header flex items-center justify-between p-3.5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`block-type-icon flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${typeStyle.iconBg}`}>
              {typeStyle.icon}
            </div>

            <div className="min-w-0">
              <span className="block-title block text-xs font-bold text-slate-100 truncate">
                {node.type === 'inicio' && (node.data.titulo || 'Ponto de Partida')}
                {node.type === 'regra' && (node.data.ruleName || 'Regra')}
                {node.type === 'menu' && (node.data.tituloMenu || 'Menu de Opções')}
                {node.type === 'midia' && 'Mídia da Biblioteca'}
                {node.type === 'mensagem' && 'Mensagem de Resposta'}
                {node.type === 'encerramento' && 'Encerramento'}
              </span>
              <span className="block text-[9px] text-slate-400 uppercase font-mono tracking-wider">
                {typeStyle.badge}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Duplicar bloco */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateNode(node);
              }}
              title="Duplicar bloco (Ctrl+D)"
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>

            {/* Editar bloco (regra ou texto/início) */}
            {(node.type === 'regra' || node.type === 'inicio' || node.type === 'mensagem') && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (node.type === 'regra') onOpenEditRuleModal(node);
                  else if (onOpenEditGeneralNode) onOpenEditGeneralNode(node);
                }}
                title={node.type === 'regra' ? 'Editar regra' : 'Editar conteúdo do bloco'}
                className="p-1 rounded-md text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Excluir bloco */}
            {node.type !== 'inicio' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNode(node.id);
                }}
                title="Remover bloco (Delete)"
                className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* CORPO DO BLOCO */}
        <div className="block-body p-3.5 space-y-2.5">
          {/* BLOCO INÍCIO */}
          {node.type === 'inicio' && (
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 leading-relaxed break-words">
                {node.data.conteudo || 'Ponto de partida deste fluxo. Conecte aos blocos seguintes para definir as ações.'}
              </div>
              <div className="flex flex-col gap-1 text-[10px] pt-1 border-t border-slate-800/60">
                {linkedRuleInfo ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 font-medium truncate">
                    <Zap className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span className="truncate">
                      Gatilho: <strong className="text-slate-200">{linkedRuleInfo.nome}</strong> {linkedRuleInfo.ativo ? '(Ativa)' : '(Inativa)'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-400 font-medium">
                    <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span>Sem regra vinculada (vincule na aba Regras)</span>
                  </div>
                )}
                {!connectedOut && (
                  <div className="text-amber-400/90 flex items-center gap-1 mt-0.5">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>Conecte este bloco ao primeiro passo do fluxo</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BLOCO DE REGRA */}
          {node.type === 'regra' && (
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
                  Palavras-chave:
                </span>
                <div className="flex flex-wrap gap-1">
                  {(node.data.palavras || []).slice(0, 4).map((kw, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-emerald-300 border border-slate-700/80"
                    >
                      {kw}
                    </span>
                  ))}
                  {(node.data.palavras || []).length > 4 && (
                    <span className="text-[10px] text-slate-400 font-medium self-center">
                      +{(node.data.palavras || []).length - 4} mais
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Resposta Automática:
                  </span>
                  {(node.data.resposta || '').length > 90 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsTextExpanded((v) => !v);
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                    >
                      {isTextExpanded ? 'Recolher' : 'Ver mais'}
                    </button>
                  )}
                </div>
                <p
                  className={`p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 leading-relaxed italic ${
                    isTextExpanded ? '' : 'line-clamp-2'
                  }`}
                >
                  "{node.data.resposta}"
                </p>
              </div>
            </div>
          )}

          {/* BLOCO DE MENSAGEM */}
          {node.type === 'mensagem' && (
            <div className="space-y-2 text-xs">
              <textarea
                value={node.data.conteudo || ''}
                onChange={(e) => onUpdateNodeData(node.id, { conteudo: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Digite a mensagem adicional..."
                rows={3}
                className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500/80 transition-colors"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Delay: 1.5s
                </span>
                <span className="text-amber-400 font-mono">&#123;&#123;nome&#125;&#125;</span>
              </div>
            </div>
          )}

          {/* BLOCO DE MÍDIA */}
          {node.type === 'midia' && (
            <div className="space-y-2 text-xs">
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Arquivo da Biblioteca:
              </label>
              <select
                value={node.data.arquivo || ''}
                onChange={(e) => onUpdateNodeData(node.id, { arquivo: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500/80 transition-colors cursor-pointer"
              >
                {libraryFiles.map((f) => (
                  <option key={f.id} value={f.fileName || f.name}>
                    {f.fileName || f.name} ({f.size})
                  </option>
                ))}
                {libraryFiles.length === 0 && (
                  <option value="catalogo_produtos.pdf">catalogo_produtos.pdf</option>
                )}
              </select>

              <input
                type="text"
                value={node.data.legenda || ''}
                onChange={(e) => onUpdateNodeData(node.id, { legenda: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Legenda da mídia..."
                className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 focus:outline-none focus:border-purple-500/80"
              />
            </div>
          )}

          {/* BLOCO DE MENU NUMERADO */}
          {node.type === 'menu' && (
            <div className="space-y-2 text-xs">
              <input
                type="text"
                value={node.data.conteudo || ''}
                onChange={(e) => onUpdateNodeData(node.id, { conteudo: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Texto de orientação do menu..."
                className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-medium focus:outline-none focus:border-sky-500/80"
              />

              <div className="space-y-1.5 pt-1">
                {(node.data.opcoes || []).map((op, idx) => {
                  const optId = op.id || `opt_${idx + 1}`;
                  const isOptConnected = connectedOptionPorts.has(optId) || connectedOptionPorts.has(`out-${idx}`);
                  const colorScheme = MENU_OPTION_COLORS[idx % MENU_OPTION_COLORS.length];

                  return (
                    <div
                      key={optId}
                      className="relative flex items-center justify-between gap-2 p-1.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold text-[10px] ${colorScheme.bg}`}
                        >
                          {op.numero || idx + 1}
                        </span>
                        <input
                          type="text"
                          value={op.texto}
                          onChange={(e) => {
                            const newText = e.target.value;
                            const updatedOpts = (node.data.opcoes || []).map((o, i) =>
                              i === idx ? { ...o, texto: newText } : o
                            );
                            onUpdateNodeData(node.id, { opcoes: updatedOpts });
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none w-full"
                        />
                      </div>

                      {/* Conector de saída individual para a opção do menu */}
                      <div
                        data-port={`out-${idx}`}
                        data-opt-id={optId}
                        data-block-id={node.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onStartConnection(node.id, optId, e);
                        }}
                        title={`Saída: opção ${op.numero} (${op.texto})`}
                        className="connector output menu-output h-7 w-7 -mr-2 rounded-full flex items-center justify-center cursor-crosshair z-20 group/optport"
                      >
                        <div
                          style={{
                            borderColor: colorScheme.fill,
                            backgroundColor: isOptConnected ? colorScheme.fill : '#1e293b'
                          }}
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 group-hover/optport:scale-125`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* BLOCO DE DELAY */}
          {node.type === 'delay' && (
            <div className="space-y-1.5 text-xs">
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Tempo de Espera:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={node.data.delay || node.data.delaySeconds || 5}
                  onChange={(e) =>
                    onUpdateNodeData(node.id, {
                      delay: Number(e.target.value),
                      delaySeconds: Number(e.target.value)
                    })
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-20 p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                />
                <span className="text-slate-400 text-[11px]">segundos de pausa</span>
              </div>
            </div>
          )}

          {/* BLOCO DE CONDIÇÃO */}
          {node.type === 'condicao' && (
            <div className="space-y-2 text-xs">
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Regra Condicional:
              </label>
              <input
                type="text"
                value={node.data.campoCondicao || 'mensagem'}
                onChange={(e) => onUpdateNodeData(node.id, { campoCondicao: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Campo (ex: mensagem, status)"
                className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                value={node.data.valorCondicao || ''}
                onChange={(e) => onUpdateNodeData(node.id, { valorCondicao: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Valor esperado..."
                className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* BLOCO DE TAG CRM */}
          {node.type === 'tag' && (
            <div className="space-y-1.5 text-xs">
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Tag a Aplicar:
              </label>
              <input
                type="text"
                value={node.data.tagName || ''}
                onChange={(e) => onUpdateNodeData(node.id, { tagName: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Ex: interessado, lead_quente, vip"
                className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
          )}

          {/* BLOCO TRANSFERIR HUMANO */}
          {node.type === 'transferir_humano' && (
            <div className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/20 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-blue-300 font-semibold">
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Encaminhar para Humano</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Pausa a automação no WhatsApp e adiciona o contato à fila de atendimento.
              </p>
            </div>
          )}

          {/* BLOCO DE ENCERRAMENTO */}
          {node.type === 'encerramento' && (
            <div className="text-center py-2 text-xs text-slate-400 space-y-1">
              <CheckCircle2 className="h-5 w-5 text-rose-400 mx-auto" />
              <p className="text-[11px] text-slate-300">
                {node.data.conteudo || 'Encerra cordialmente o ciclo de atendimento.'}
              </p>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* CONECTOR DE SAÍDA PRINCIPAL (Borda Direita - Centro Vertical) */}
        {/* ============================================================ */}
        {node.type !== 'menu' && node.type !== 'encerramento' && node.type !== 'transferir_humano' && (
          <div
            data-port="output"
            data-block-id={node.id}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onStartConnection(node.id, 'output', e);
            }}
            title="Saída"
            className="connector output absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center cursor-crosshair z-30 group/outport"
          >
            <div
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                connectedOut
                  ? 'border-emerald-400 bg-emerald-400'
                  : 'border-slate-500 bg-slate-800 group-hover/outport:border-emerald-400 group-hover/outport:bg-emerald-950 group-hover/outport:scale-125'
              }`}
            />
          </div>
        )}
      </div>
    );
  }
);
FlowNodeCard.displayName = 'FlowNodeCard';

export interface AvailableBlockType {
  type:
    | 'inicio'
    | 'regra'
    | 'mensagem'
    | 'midia'
    | 'menu'
    | 'delay'
    | 'condicao'
    | 'transferir_humano'
    | 'encerramento';
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}

const AVAILABLE_BLOCK_TYPES: AvailableBlockType[] = [
  {
    type: 'inicio',
    label: 'Início',
    description: 'Ponto de partida do fluxo de atendimento',
    icon: Play,
    iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
    iconColor: 'text-emerald-500'
  },
  {
    type: 'regra',
    label: 'Regra vinculada',
    description: 'Gatilho por palavras-chave do catálogo',
    icon: Zap,
    iconBg: 'bg-amber-500/10 border border-amber-500/20',
    iconColor: 'text-amber-500'
  },
  {
    type: 'mensagem',
    label: 'Mensagem',
    description: 'Texto enviado ao cliente com delay simulado',
    icon: MessageSquare,
    iconBg: 'bg-sky-500/10 border border-sky-500/20',
    iconColor: 'text-sky-500'
  },
  {
    type: 'midia',
    label: 'Mídia',
    description: 'Foto, vídeo, áudio ou documento PDF',
    icon: ImageIcon,
    iconBg: 'bg-purple-500/10 border border-purple-500/20',
    iconColor: 'text-purple-500'
  },
  {
    type: 'menu',
    label: 'Menu numerado',
    description: 'Opções estruturadas para navegação do cliente',
    icon: ListOrdered,
    iconBg: 'bg-teal-500/10 border border-teal-500/20',
    iconColor: 'text-teal-500'
  },
  {
    type: 'delay',
    label: 'Espera',
    description: 'Intervalo de pausa antes da próxima ação',
    icon: Hourglass,
    iconBg: 'bg-orange-500/10 border border-orange-500/20',
    iconColor: 'text-orange-500'
  },
  {
    type: 'condicao',
    label: 'Condição',
    description: 'Ramificação lógica baseada no contexto',
    icon: GitBranch,
    iconBg: 'bg-indigo-500/10 border border-indigo-500/20',
    iconColor: 'text-indigo-500'
  },
  {
    type: 'transferir_humano',
    label: 'Atendimento humano',
    description: 'Pausa a automação e transfere ao atendente',
    icon: PhoneCall,
    iconBg: 'bg-blue-500/10 border border-blue-500/20',
    iconColor: 'text-blue-500'
  },
  {
    type: 'encerramento',
    label: 'Fim',
    description: 'Encerramento cordial do atendimento',
    icon: CheckCircle2,
    iconBg: 'bg-rose-500/10 border border-rose-500/20',
    iconColor: 'text-rose-500'
  }
];

// ----------------------------------------------------
// COMPONENTE PRINCIPAL FLOW BUILDER
// ----------------------------------------------------
export const FlowBuilderView: React.FC<FlowBuilderViewProps> = ({
  onNavigateToRules,
  onNavigateToLibrary,
  isSidebarCollapsed = false,
  onToggleSidebar
}) => {
  const [rules, setRules] = useState<any[]>([]);
  const [libraryFiles, setLibraryFiles] = useState<LibraryFileItem[]>([]);
  const [allFlows, setAllFlows] = useState<LinearFlow[]>([]);
  const [activeTab, setActiveTab] = useState<'editor' | 'flows' | 'mappings'>('editor');
  const [isFlowPickerOpen, setIsFlowPickerOpen] = useState(false);
  const [isAddBlockMenuOpen, setIsAddBlockMenuOpen] = useState(false);
  const [activeFlowId, setActiveFlowId] = useState<string>('flow_boas_vindas');
  const [flowName, setFlowName] = useState<string>('Fluxo Unificado de Atendimento');

  // Estados do Canvas
  const [nodes, setNodes] = useState<VisualNode[]>([]);
  const [connections, setConnections] = useState<FlowConnection[]>([]);
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 30 });
  const [isSmoothTransitionActive, setIsSmoothTransitionActive] = useState<boolean>(false);

  // Seleção leve
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // Modo de conexão (sem linha seguindo o mouse, igual à referência)
  const [connectionMode, setConnectionMode] = useState<{
    fromBlockId: string;
    fromPort: string;
  } | null>(null);

  // Pilha de Histórico (Undo / Redo)
  const historyRef = useRef<{ nodes: VisualNode[]; connections: FlowConnection[] }[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Auto-Save
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Panning & Barra de Espaço
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Menus e Modais
  const [isRulesDropdownOpen, setIsRulesDropdownOpen] = useState<boolean>(false);
  const [ruleSearchTerm, setRuleSearchTerm] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Refs para fechamento inteligente de menus popup
  const flowPickerRef = useRef<HTMLDivElement>(null);
  const rulesDropdownRef = useRef<HTMLDivElement>(null);
  const addBlockMenuRef = useRef<HTMLDivElement>(null);

  // Modal de Edição de Regra Rápida
  const [editingRuleNode, setEditingRuleNode] = useState<VisualNode | null>(null);
  const [ruleModalKeywords, setRuleModalKeywords] = useState<string>('');
  const [ruleModalResponse, setRuleModalResponse] = useState<string>('');

  // Modal de Edição de Bloco Geral (Início, Mensagem, Encerramento)
  const [editingGeneralNode, setEditingGeneralNode] = useState<VisualNode | null>(null);
  const [generalNodeTitle, setGeneralNodeTitle] = useState<string>('');
  const [generalNodeContent, setGeneralNodeContent] = useState<string>('');

  // Modal de Teste do Fluxo (Simulador Integrado)
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [testInputText, setTestInputText] = useState<string>('');
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testMessages, setTestMessages] = useState<Array<{
    id: string;
    sender: 'user' | 'bot';
    text: string;
    time: string;
    matchedType?: string;
    matchedName?: string;
    flowName?: string;
    isHumanTransfer?: boolean;
    mediaAttachments?: any[];
  }>>([]);
  const [testLastResult, setTestLastResult] = useState<{
    matchedType?: string;
    matchedName?: string;
    flowName?: string;
    isHumanTransfer?: boolean;
    responseTexts?: string[];
    delays?: number[];
    activeMenu?: any;
  } | null>(null);
  const testPhone = 'simulador_flow_builder';
  const testChatEndRef = useRef<HTMLDivElement>(null);

  // Loading & Feedback
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Referências diretas ao DOM para manipulação fluida
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const nodeElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const connectionPathsRef = useRef<Map<string, SVGPathElement>>(new Map());
  const connectionHitsRef = useRef<Map<string, SVGPathElement>>(new Map());
  const connectionCirclesRef = useRef<Map<string, SVGCircleElement>>(new Map());

  // Posições atuais em memória para atualização instantânea
  const currentPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const nodesRef = useRef<VisualNode[]>(nodes);
  nodesRef.current = nodes;
  const connectionsRef = useRef<FlowConnection[]>(connections);
  connectionsRef.current = connections;
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;
  const panRef = useRef<{ x: number; y: number }>(pan);
  panRef.current = pan;
  const connectionModeRef = useRef<{ fromBlockId: string; fromPort: string } | null>(null);
  connectionModeRef.current = connectionMode;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleNodeRefCallback = useCallback((nodeId: string, el: HTMLDivElement | null) => {
    if (el) {
      nodeElsRef.current.set(nodeId, el);
    } else {
      nodeElsRef.current.delete(nodeId);
    }
  }, []);

  useEffect(() => {
    nodes.forEach((n) => {
      currentPositionsRef.current.set(n.id, { x: n.x, y: n.y });
      const el = nodeElsRef.current.get(n.id);
      if (el) {
        el.style.transform = `translate3d(${n.x}px, ${n.y}px, 0)`;
      }
    });
  }, [nodes]);

  // Fechamento automático de menus flutuantes ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (isAddBlockMenuOpen && addBlockMenuRef.current && !addBlockMenuRef.current.contains(target)) {
        setIsAddBlockMenuOpen(false);
      }
      if (isFlowPickerOpen && flowPickerRef.current && !flowPickerRef.current.contains(target)) {
        setIsFlowPickerOpen(false);
      }
      if (isRulesDropdownOpen && rulesDropdownRef.current && !rulesDropdownRef.current.contains(target)) {
        setIsRulesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAddBlockMenuOpen, isFlowPickerOpen, isRulesDropdownOpen]);

  // Cálculo da posição da porta em coordenadas do mundo (baseado no offsetWidth/offsetHeight da referência)
  const getPortPosition = useCallback((blockId: string, port: string): { x: number; y: number } | null => {
    const block = nodesRef.current.find((b) => b.id === blockId);
    if (!block) return null;

    const currentPos = currentPositionsRef.current.get(blockId) || { x: block.x, y: block.y };
    const el = nodeElsRef.current.get(blockId);

    const blockW = el?.offsetWidth || block.width || 340;
    const blockH = el?.offsetHeight || 160;

    if (port === 'input' || port === 'in') {
      return { x: currentPos.x, y: currentPos.y + blockH / 2 };
    }

    if (port === 'output' || port === 'out') {
      return { x: currentPos.x + blockW, y: currentPos.y + blockH / 2 };
    }

    // Saídas de opções de menu (por ID opt_1 ou índice out-0)
    if (port.startsWith('out-') || port.startsWith('opt_')) {
      let optIdx = 0;
      if (port.startsWith('out-')) {
        optIdx = parseInt(port.replace('out-', ''), 10) || 0;
      } else {
        const opts = block.data.opcoes || [];
        const foundIdx = opts.findIndex((o) => o.id === port);
        optIdx = foundIdx >= 0 ? foundIdx : (parseInt(port.replace('opt_', ''), 10) - 1) || 0;
      }

      const headerH = 46;
      const bodyH = Math.max(blockH - headerH, 60);
      const opts = block.data.opcoes || [];
      const n = Math.max(opts.length, 1);
      const step = bodyH / (n + 1);

      return {
        x: currentPos.x + blockW,
        y: currentPos.y + headerH + step * (optIdx + 1)
      };
    }

    return { x: currentPos.x + blockW, y: currentPos.y + blockH / 2 };
  }, []);

  // Redesenho das conexões ligadas ao nó movido
  const renderConnectionsForNode = useCallback(
    (nodeId: string) => {
      const activeConns = connectionsRef.current;
      for (const conn of activeConns) {
        if (conn.fromNodeId === nodeId || conn.toNodeId === nodeId) {
          const fromPos = getPortPosition(conn.fromNodeId, conn.fromPortId || 'output');
          const toPos = getPortPosition(conn.toNodeId, 'input');
          if (!fromPos || !toPos) continue;

          const d = bezierPath(fromPos.x, fromPos.y, toPos.x, toPos.y);
          const pathEl = connectionPathsRef.current.get(conn.id);
          const hitEl = connectionHitsRef.current.get(conn.id);
          const circEl = connectionCirclesRef.current.get(conn.id);

          if (pathEl) pathEl.setAttribute('d', d);
          if (hitEl) hitEl.setAttribute('d', d);
          if (circEl) {
            circEl.setAttribute('cx', String(toPos.x));
            circEl.setAttribute('cy', String(toPos.y));
          }
        }
      }
    },
    [getPortPosition]
  );

  // ----------------------------------------------------
  // GESTÃO DE HISTÓRICO
  // ----------------------------------------------------
  const pushHistory = useCallback((newNodes: VisualNode[], newConns: FlowConnection[]) => {
    const currentEntry = {
      nodes: JSON.parse(JSON.stringify(newNodes)),
      connections: JSON.parse(JSON.stringify(newConns))
    };

    const nextIndex = historyIndexRef.current + 1;
    historyRef.current = historyRef.current.slice(0, nextIndex);
    historyRef.current.push(currentEntry);

    if (historyRef.current.length > 30) {
      historyRef.current.shift();
    } else {
      historyIndexRef.current = nextIndex;
    }

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const targetState = historyRef.current[historyIndexRef.current];
      if (targetState) {
        setNodes(JSON.parse(JSON.stringify(targetState.nodes)));
        setConnections(JSON.parse(JSON.stringify(targetState.connections)));
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
        setSaveStatus('dirty');
        showToast('Ação desfeita (Ctrl+Z)');
      }
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const targetState = historyRef.current[historyIndexRef.current];
      if (targetState) {
        setNodes(JSON.parse(JSON.stringify(targetState.nodes)));
        setConnections(JSON.parse(JSON.stringify(targetState.connections)));
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
        setSaveStatus('dirty');
        showToast('Ação refeita (Ctrl+Shift+Z)');
      }
    }
  }, []);

  // ----------------------------------------------------
  // CARREGAR DADOS INICIAIS
  // ----------------------------------------------------
  const loadAllData = async () => {
    try {
      setLoading(true);

      const [resRules, resLib, resFlows] = await Promise.all([
        authFetch('/api/rules').then((r) => (r.ok ? r.json() : { rules: [] })),
        authFetch('/api/library/files').then((r) => (r.ok ? r.json() : { files: [] })),
        authFetch('/api/flows').then((r) => (r.ok ? r.json() : { fluxos: [] }))
      ]);

      const loadedRules: any[] = resRules.rules || [];
      const loadedFiles: LibraryFileItem[] = resLib.files || [];
      const loadedFlows: LinearFlow[] = resFlows.fluxos || resFlows.flows || [];

      setRules(loadedRules);
      setLibraryFiles(loadedFiles);
      setAllFlows(loadedFlows);

      const targetFlow =
        loadedFlows.find((f) => f.id === activeFlowId) ||
        loadedFlows.find((f) => f.id === 'fluxo_unificado_atendimento') ||
        loadedFlows.find((f) => f.isWelcomeFlow) ||
        loadedFlows[0] ||
        null;

      if (targetFlow) {
        setActiveFlowId(targetFlow.id);
        setFlowName(targetFlow.nome || 'Fluxo Principal');
        buildCanvasNodes(targetFlow, loadedRules, loadedFiles);
      } else {
        buildDefaultUnifiedFlow(loadedRules, loadedFiles);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar dados do Flow Builder:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFlowForEdit = (flowId: string, overrideFlow?: LinearFlow) => {
    const target = overrideFlow || allFlows.find((f) => f.id === flowId);
    if (!target) return;
    setActiveFlowId(target.id);
    setFlowName(target.nome);
    buildCanvasNodes(target, rules, libraryFiles);
    setActiveTab('editor');
    showToast(`Editando fluxo: ${target.nome}`);
  };

  const handleCreateFlow = async (newFlowData: Partial<LinearFlow>) => {
    try {
      const res = await authFetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFlowData)
      });
      if (res.ok) {
        const data = await res.json();
        const created: LinearFlow = data.flow || data.fluxo || newFlowData;
        setAllFlows((prev) => [created, ...prev.filter((f) => f.id !== created.id)]);
        handleSelectFlowForEdit(created.id, created);
        showToast('Novo fluxo criado e aberto no editor!');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Erro ao criar fluxo: ${err.error || 'Erro no servidor'}`, 'error');
      }
    } catch (e: any) {
      showToast(`Erro ao criar fluxo: ${e.message}`, 'error');
    }
  };

  const handleDuplicateFlow = async (flowId: string) => {
    try {
      const res = await authFetch(`/api/flows/${flowId}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const duplicated = data.flow || data.fluxo;
        if (duplicated) {
          setAllFlows((prev) => [duplicated, ...prev]);
          showToast('Fluxo duplicado com sucesso!');
        }
      }
    } catch (e: any) {
      showToast(`Erro ao duplicar fluxo: ${e.message}`, 'error');
    }
  };

  const handleToggleFlowActive = async (flowId: string, currentActive: boolean) => {
    try {
      const res = await authFetch(`/api/flows/${flowId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive, ativo: !currentActive })
      });
      if (res.ok) {
        setAllFlows((prev) =>
          prev.map((f) =>
            f.id === flowId
              ? { ...f, ativo: !currentActive, status: !currentActive ? 'Publicado' : 'Inativo' }
              : f
          )
        );
        showToast(!currentActive ? 'Fluxo ativado!' : 'Fluxo desativado!');
      }
    } catch (e: any) {
      showToast(`Erro ao alternar status do fluxo: ${e.message}`, 'error');
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    try {
      const res = await authFetch(`/api/flows/${flowId}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = allFlows.filter((f) => f.id !== flowId);
        setAllFlows(remaining);
        showToast('Fluxo excluído com sucesso!');
        if (activeFlowId === flowId && remaining.length > 0) {
          handleSelectFlowForEdit(remaining[0].id);
        }
      }
    } catch (e: any) {
      showToast(`Erro ao excluir fluxo: ${e.message}`, 'error');
    }
  };

  useEffect(() => {
    loadAllData();

    const handleRulesUpdated = () => {
      authFetch('/api/rules')
        .then((r) => r.json())
        .then((data) => {
          const freshRules = data.rules || [];
          setRules(freshRules);
          setNodes((prev) =>
            prev.map((n) => {
              if (n.type === 'regra' && n.data.ruleId) {
                const r = freshRules.find((rule: any) => rule.id === n.data.ruleId);
                if (r) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      ruleName: r.name || r.nome || n.data.ruleName,
                      trigger: r.trigger || (r.palavras || []).join(', '),
                      palavras: r.palavras || [],
                      resposta: r.response || r.resposta || ''
                    }
                  };
                }
              }
              return n;
            })
          );
        })
        .catch(() => {});
    };

    window.addEventListener('upzap_rules_updated', handleRulesUpdated);
    return () => window.removeEventListener('upzap_rules_updated', handleRulesUpdated);
  }, []);

  const buildDefaultUnifiedFlow = (currentRules: any[], _currentFiles: LibraryFileItem[]) => {
    const defaultNodes: VisualNode[] = [
      {
        id: 'node_inicio_atendimento',
        type: 'inicio',
        x: 80,
        y: 260,
        width: 330,
        data: {
          titulo: 'Entrada do Atendimento',
          conteudo: 'Cliente envia mensagem inicial no WhatsApp. O robô acolhe calorosamente e identifica a intenção.'
        }
      },
      {
        id: 'node_menu_principal',
        type: 'menu',
        x: 480,
        y: 160,
        width: 360,
        data: {
          tituloMenu: 'Menu de Orientação do Cliente',
          conteudo: 'Olá! Como posso ajudar você hoje?',
          rodapeMenu: '👉 Digite o número da opção desejada.',
          opcoes: [
            { id: 'opt_1', numero: 1, texto: 'Preços e kits', acao: 'executar_fluxo' },
            { id: 'opt_2', numero: 2, texto: 'Tamanhos e cores', acao: 'executar_fluxo' },
            { id: 'opt_3', numero: 3, texto: 'Pagamento e entrega', acao: 'executar_fluxo' },
            { id: 'opt_4', numero: 4, texto: 'Finalizar compra', acao: 'executar_fluxo' },
            { id: 'opt_5', numero: 5, texto: 'Falar com atendente', acao: 'transferir_humano' }
          ]
        }
      }
    ];

    const defaultConnections: FlowConnection[] = [
      {
        id: 'conn_inicio_menu',
        fromNodeId: 'node_inicio_atendimento',
        fromPortId: 'output',
        toNodeId: 'node_menu_principal'
      }
    ];

    let branchY = 50;
    const branchX = 920;

    currentRules.forEach((rule) => {
      if (rule.id === 'rule_boas_vindas' || rule.id === 'rule_menu_principal') return;

      const ruleNodeId = `node_rule_${rule.id}`;
      const rawKeywords = rule.trigger || (Array.isArray(rule.palavras) ? rule.palavras.join(', ') : '');

      defaultNodes.push({
        id: ruleNodeId,
        type: 'regra',
        x: branchX,
        y: branchY,
        width: 340,
        data: {
          ruleId: rule.id,
          ruleName: rule.name || rule.nome || `Regra: ${rawKeywords.split(',')[0]}`,
          trigger: rawKeywords,
          palavras: rule.palavras || [],
          resposta: rule.response || rule.resposta || ''
        }
      });

      if (rule.id === 'rule_precos_kits') {
        defaultConnections.push({
          id: 'conn_menu_precos',
          fromNodeId: 'node_menu_principal',
          fromPortId: 'opt_1',
          toNodeId: ruleNodeId
        });
      } else if (rule.id === 'rule_tamanhos_cores') {
        defaultConnections.push({
          id: 'conn_menu_tamanhos',
          fromNodeId: 'node_menu_principal',
          fromPortId: 'opt_2',
          toNodeId: ruleNodeId
        });
      } else if (rule.id === 'rule_pagamento_entrega') {
        defaultConnections.push({
          id: 'conn_menu_pagamento',
          fromNodeId: 'node_menu_principal',
          fromPortId: 'opt_3',
          toNodeId: ruleNodeId
        });
      } else if (rule.id === 'rule_finalizar_compra') {
        defaultConnections.push({
          id: 'conn_menu_checkout',
          fromNodeId: 'node_menu_principal',
          fromPortId: 'opt_4',
          toNodeId: ruleNodeId
        });
      }

      branchY += 210;
    });

    defaultNodes.push({
      id: 'node_midia_catalogo',
      type: 'midia',
      x: 1340,
      y: 90,
      width: 320,
      data: {
        arquivo: 'catalogo_produtos.pdf',
        tipoMidia: 'pdf',
        legenda: 'Tabela oficial de preços e kits Brizex (PDF da Biblioteca)'
      }
    });

    defaultConnections.push({
      id: 'conn_precos_midia',
      fromNodeId: 'node_rule_rule_precos_kits',
      fromPortId: 'output',
      toNodeId: 'node_midia_catalogo'
    });

    defaultNodes.push({
      id: 'node_encerramento_humano',
      type: 'encerramento',
      x: 920,
      y: branchY + 40,
      width: 300,
      data: {
        conteudo: 'Transferência para equipe humana e encerramento do bot.'
      }
    });

    defaultConnections.push({
      id: 'conn_menu_humano',
      fromNodeId: 'node_menu_principal',
      fromPortId: 'opt_5',
      toNodeId: 'node_encerramento_humano'
    });

    setNodes(defaultNodes);
    setConnections(defaultConnections);
    pushHistory(defaultNodes, defaultConnections);
  };

  const buildCanvasNodes = (flow: LinearFlow, currentRules: any[], _currentFiles: LibraryFileItem[]) => {
    if (flow.canvasNodes && flow.canvasNodes.length > 0) {
      setNodes(flow.canvasNodes);
      setConnections(flow.canvasConnections || []);
      pushHistory(flow.canvasNodes, flow.canvasConnections || []);
      return;
    }

    // Se o fluxo possui blocos estruturados, gera nós visuais correspondentes
    if (flow.blocos && flow.blocos.length > 0) {
      const generatedNodes: VisualNode[] = [];
      const generatedConns: FlowConnection[] = [];
      let curX = 120;
      let curY = 160;

      flow.blocos.forEach((bloco, idx) => {
        const nodeId = `node_${bloco.id || idx}_${Date.now()}`;
        if (bloco.tipo === 'menu') {
          generatedNodes.push({
            id: nodeId,
            type: 'menu',
            x: curX,
            y: curY,
            width: 320,
            data: {
              tituloMenu: bloco.tituloMenu || 'Menu de Opções',
              conteudo: bloco.conteudo || 'Selecione uma opção:',
              rodapeMenu: bloco.rodapeMenu || 'Digite o número correspondente',
              opcoes: bloco.opcoes || []
            }
          });
        } else if (bloco.tipo === 'midia') {
          generatedNodes.push({
            id: nodeId,
            type: 'midia',
            x: curX,
            y: curY,
            width: 300,
            data: {
              arquivo: bloco.arquivo,
              legenda: bloco.conteudo,
              tipoMidia: 'foto'
            }
          });
        } else if (bloco.tipo === 'regra') {
          generatedNodes.push({
            id: nodeId,
            type: 'regra',
            x: curX,
            y: curY,
            width: 300,
            data: {
              ruleId: bloco.regraId,
              ruleName: bloco.regraNome,
              resposta: bloco.conteudo
            }
          });
        } else if (bloco.tipo === 'transferir_humano') {
          generatedNodes.push({
            id: nodeId,
            type: 'transferir_humano',
            x: curX,
            y: curY,
            width: 280,
            data: { conteudo: bloco.conteudo || 'Transferir para atendimento humano' }
          });
        } else {
          generatedNodes.push({
            id: nodeId,
            type: idx === 0 ? 'inicio' : 'mensagem',
            x: curX,
            y: curY,
            width: 300,
            data: {
              titulo: idx === 0 ? flow.nome : undefined,
              conteudo: bloco.conteudo || 'Olá! Como posso ajudar?'
            }
          });
        }

        if (idx > 0 && generatedNodes[idx - 1] && generatedNodes[idx - 1].type !== 'menu') {
          generatedConns.push({
            id: `conn_${idx}_${Date.now()}`,
            fromNodeId: generatedNodes[idx - 1].id,
            fromPortId: 'output',
            toNodeId: nodeId
          });
        }

        curX += 360;
      });

      setNodes(generatedNodes);
      setConnections(generatedConns);
      pushHistory(generatedNodes, generatedConns);
      return;
    }

    // Nó inicial padrão para fluxos em branco recém-criados ou limpos
    const initialStartNode: VisualNode = {
      id: `node_start_${flow.id}`,
      type: 'inicio',
      x: 120,
      y: 180,
      width: 300,
      data: {
        titulo: flow.nome || 'Ponto de Partida',
        conteudo: 'Ponto de partida deste fluxo. Conecte aos blocos seguintes para definir as ações.'
      }
    };
    setNodes([initialStartNode]);
    setConnections([]);
    pushHistory([initialStartNode], []);
  };

  // ----------------------------------------------------
  // PERSISTÊNCIA & AUTO-SALVAMENTO
  // ----------------------------------------------------
  const executeSaveFlow = useCallback(
    async (currentNodes: VisualNode[], currentConns: FlowConnection[]) => {
      try {
        setSaving(true);
        setSaveStatus('saving');

        const compiledBlocks: LinearFlowBlock[] = [];
        currentNodes.forEach((node) => {
          if (node.type === 'inicio') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'texto',
              conteudo: node.data.conteudo || 'Olá! Como posso ajudar?',
              delay: 1.0,
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'regra') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'regra',
              conteudo: node.data.resposta,
              regraId: node.data.ruleId,
              regraNome: node.data.ruleName,
              delay: 1.5,
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'mensagem') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'texto',
              conteudo: node.data.conteudo,
              delay: node.data.delay || 1.5,
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'midia') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'midia',
              arquivo: node.data.arquivo,
              conteudo: node.data.legenda,
              delay: 1.5,
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'menu') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'menu',
              formatoMenu: 'numerado',
              tituloMenu: node.data.tituloMenu,
              conteudo: node.data.conteudo,
              rodapeMenu: node.data.rodapeMenu,
              opcoes: node.data.opcoes || [],
              delay: 1.5,
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'delay') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'delay',
              delay: node.data.delay || node.data.delaySeconds || 5,
              conteudo: `Aguardar ${node.data.delay || node.data.delaySeconds || 5}s`,
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'condicao') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'condicao',
              campo: node.data.campoCondicao || 'mensagem',
              valor: node.data.valorCondicao || '',
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'tag') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'tag',
              tag: node.data.tagName || 'interessado',
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'transferir_humano') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'transferir_humano',
              conteudo: 'Transferência para atendimento humano',
              x: node.x,
              y: node.y
            });
          } else if (node.type === 'encerramento') {
            compiledBlocks.push({
              id: `b_${node.id}`,
              tipo: 'encerrar',
              conteudo: 'Encerramento do atendimento',
              x: node.x,
              y: node.y
            });
          }
        });

        const currentFlowMeta = allFlows.find((f) => f.id === activeFlowId);
        const updatedFlow: LinearFlow = {
          id: activeFlowId,
          nome: flowName,
          descricao: currentFlowMeta?.descricao || 'Fluxo de atendimento inteligente UpZap',
          status: currentFlowMeta?.status || 'Publicado',
          ativo: currentFlowMeta?.ativo !== false,
          regraGatilhoId: currentFlowMeta?.regraGatilhoId,
          regraGatilhoNome: currentFlowMeta?.regraGatilhoNome,
          isWelcomeFlow: Boolean(currentFlowMeta?.isWelcomeFlow),
          blocos: compiledBlocks,
          canvasNodes: currentNodes,
          canvasConnections: currentConns,
          updatedAt: new Date().toISOString()
        };

        const res = await authFetch(`/api/flows/${activeFlowId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedFlow)
        });

        if (res.ok) {
          setSaveStatus('saved');
          setAllFlows((prev) => prev.map((f) => (f.id === activeFlowId ? updatedFlow : f)));
        } else {
          const nextList = allFlows.map((f) => (f.id === activeFlowId ? updatedFlow : f));
          if (!nextList.some((f) => f.id === activeFlowId)) nextList.push(updatedFlow);
          await authFetch('/api/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fluxos: nextList })
          });
          setSaveStatus('saved');
          setAllFlows(nextList);
        }
      } catch (err: any) {
        setSaveStatus('dirty');
      } finally {
        setSaving(false);
      }
    },
    [activeFlowId, flowName, allFlows]
  );

  const triggerAutoSave = useCallback(
    (nextNodes: VisualNode[], nextConns: FlowConnection[]) => {
      setSaveStatus('dirty');
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        executeSaveFlow(nextNodes, nextConns);
      }, 2500);
    },
    [executeSaveFlow]
  );

  const handleManualSave = () => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    executeSaveFlow(nodes, connections);
    showToast('Fluxo salvo com sucesso!');
  };

  // ----------------------------------------------------
  // 1) PEGADA DO BLOCO (ARRASTE IDÊNTICO À REFERÊNCIA)
  // ----------------------------------------------------
  const handleBlockMouseDown = useCallback(
    (e: React.MouseEvent, blockId: string) => {
      const target = e.target as HTMLElement;

      // Exceções que NÃO iniciam o arraste do bloco:
      if (
        target.classList.contains('connector') ||
        target.closest('.connector') ||
        target.classList.contains('block-more') ||
        target.closest('.block-more') ||
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      if (e.button !== 0) return;

      const blockEl = nodeElsRef.current.get(blockId);
      const block = nodesRef.current.find((b) => b.id === blockId);
      if (!block || !blockEl) return;

      // Selecionar o bloco no mousedown
      setSelectedNodeId(blockId);
      setSelectedConnectionId(null);

      const startX = e.clientX;
      const startY = e.clientY;
      const origPos = currentPositionsRef.current.get(blockId) || { x: block.x, y: block.y };
      const origX = origPos.x;
      const origY = origPos.y;
      const currentZoom = zoomRef.current;

      blockEl.classList.add('dragging');
      let moved = false;
      let curX = origX;
      let curY = origY;

      function onMove(ev: MouseEvent) {
        const dx = (ev.clientX - startX) / currentZoom;
        const dy = (ev.clientY - startY) / currentZoom;

        // Limiar de ~1px para diferenciar clique de arraste
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          moved = true;
        }

        curX = origX + dx;
        curY = origY + dy;

        // Aplicar direto no elemento via transform/ref sem setState e sem re-render
        blockEl.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
        currentPositionsRef.current.set(blockId, { x: curX, y: curY });

        // Redesenhar linhas em tempo real
        renderConnectionsForNode(blockId);
      }

      function onUp() {
        blockEl.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        if (moved) {
          const finalX = snapToGrid(curX);
          const finalY = snapToGrid(curY);

          blockEl.style.transform = `translate3d(${finalX}px, ${finalY}px, 0)`;
          currentPositionsRef.current.set(blockId, { x: finalX, y: finalY });
          renderConnectionsForNode(blockId);

          const nextNodes = nodesRef.current.map((n) =>
            n.id === blockId ? { ...n, x: finalX, y: finalY } : n
          );
          setNodes(nextNodes);
          pushHistory(nextNodes, connectionsRef.current);
          triggerAutoSave(nextNodes, connectionsRef.current);
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [renderConnectionsForNode, pushHistory, triggerAutoSave]
  );

  // ----------------------------------------------------
  // 2) MODO DE CONEXÃO (SEM LINHA SEGUINDO O MOUSE)
  // ----------------------------------------------------
  const startConnection = useCallback((blockId: string, port: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();

    setConnectionMode({ fromBlockId: blockId, fromPort: port });
  }, []);

  const cancelConnection = useCallback(() => {
    setConnectionMode(null);
  }, []);

  const finishConnection = useCallback(
    (toBlockId: string) => {
      const mode = connectionModeRef.current;
      if (!mode) return;

      const { fromBlockId, fromPort } = mode;

      // Origem igual ao destino cancela
      if (fromBlockId === toBlockId) {
        cancelConnection();
        return;
      }

      const toBlock = nodesRef.current.find((b) => b.id === toBlockId);
      if (!toBlock) {
        cancelConnection();
        return;
      }

      // Bloco de regra ou início não pode receber conexão
      if (toBlock.type === 'regra' || toBlock.type === 'inicio') {
        showToast('Blocos de regra não podem receber conexões (são pontos de entrada)', 'error');
        cancelConnection();
        return;
      }

      // Evitar conexão idêntica já existente
      const exists = connectionsRef.current.some(
        (c) => c.fromNodeId === fromBlockId && c.fromPortId === fromPort && c.toNodeId === toBlockId
      );
      if (exists) {
        showToast('Conexão já existe', 'error');
        cancelConnection();
        return;
      }

      // Substituir conexão anterior da MESMA porta de saída (cada saída tem um único destino)
      const filteredConns = connectionsRef.current.filter(
        (c) => !(c.fromNodeId === fromBlockId && c.fromPortId === fromPort)
      );

      const newConnId = `conn_${fromBlockId}_${fromPort}_${toBlockId}_${Date.now().toString(36)}`;
      const nextConns = [
        ...filteredConns,
        {
          id: newConnId,
          fromNodeId: fromBlockId,
          fromPortId: fromPort,
          toNodeId: toBlockId
        }
      ];

      // Se for bloco de menu, atualizar também o destino da opção
      const nextNodes = nodesRef.current.map((n) => {
        if (n.id === fromBlockId && n.type === 'menu' && n.data.opcoes) {
          const updatedOpts = n.data.opcoes.map((opt, idx) => {
            const optId = opt.id || `opt_${idx + 1}`;
            if (optId === fromPort || `out-${idx}` === fromPort) {
              return { ...opt, targetBlockId: toBlockId };
            }
            return opt;
          });
          return { ...n, data: { ...n.data, opcoes: updatedOpts } };
        }
        return n;
      });

      setNodes(nextNodes);
      setConnections(nextConns);
      cancelConnection();
      pushHistory(nextNodes, nextConns);
      triggerAutoSave(nextNodes, nextConns);
      showToast('Blocos conectados com sucesso!');
    },
    [cancelConnection, pushHistory, triggerAutoSave]
  );

  // ----------------------------------------------------
  // PAN DO CANVAS & DESSELEÇÃO NO VAZIO
  // ----------------------------------------------------
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Se clicou dentro de um bloco ou conector, não faz pan no fundo
    if (target.closest('.flow-block') || target.closest('.connector')) return;
    if (e.button !== 0) return;

    // Deselecionar ao clicar no vazio
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
    setIsRulesDropdownOpen(false);

    // Se estiver em modo de conexão, clicar no vazio cancela
    if (connectionMode) {
      cancelConnection();
      return;
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const origPanX = panRef.current.x;
    const origPanY = panRef.current.y;

    setIsPanning(true);

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPan({
        x: origPanX + dx,
        y: origPanY + dy
      });
    }

    function onUp() {
      setIsPanning(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Fallback no mouseup do viewport para capturar entrada mesmo que o mouse saia ligeiramente
  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!connectionMode) return;
    const inputConn = (e.target as HTMLElement).closest('.connector.input');
    if (inputConn) {
      const targetBlockId = inputConn.getAttribute('data-block-id');
      if (targetBlockId) finishConnection(targetBlockId);
    }
  };

  // Zoom centrado no cursor do mouse
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const currentZoom = zoomRef.current;
    const newZoom = Math.min(2.0, Math.max(0.25, Number((currentZoom * zoomFactor).toFixed(2))));

    if (newZoom === currentZoom) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentPan = panRef.current;
    const newPanX = mouseX - (mouseX - currentPan.x) * (newZoom / currentZoom);
    const newPanY = mouseY - (mouseY - currentPan.y) * (newZoom / currentZoom);

    setZoom(newZoom);
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  // Transição suave apenas para botões
  const triggerSmoothTransition = () => {
    setIsSmoothTransitionActive(true);
    setTimeout(() => {
      setIsSmoothTransitionActive(false);
    }, 200);
  };

  const handleZoomIn = () => {
    triggerSmoothTransition();
    setZoom((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    triggerSmoothTransition();
    setZoom((z) => Math.max(0.25, Number((z - 0.15).toFixed(2))));
  };

  const handleResetZoom = () => {
    triggerSmoothTransition();
    setZoom(1.0);
  };

  const handleFitToView = useCallback(() => {
    if (nodes.length === 0 || !canvasRef.current) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((n) => {
      const pos = currentPositionsRef.current.get(n.id) || { x: n.x, y: n.y };
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + (n.width || 340));
      maxY = Math.max(maxY, pos.y + 260);
    });

    const rect = canvasRef.current.getBoundingClientRect();
    const contentW = maxX - minX || 800;
    const contentH = maxY - minY || 600;

    const padding = 80;
    const scaleX = (rect.width - padding * 2) / contentW;
    const scaleY = (rect.height - padding * 2) / contentH;
    const targetZoom = Math.min(1.15, Math.max(0.35, Math.min(scaleX, scaleY)));

    const targetPanX = (rect.width - contentW * targetZoom) / 2 - minX * targetZoom;
    const targetPanY = (rect.height - contentH * targetZoom) / 2 - minY * targetZoom;

    triggerSmoothTransition();
    setZoom(Number(targetZoom.toFixed(2)));
    setPan({ x: Math.round(targetPanX), y: Math.round(targetPanY) });
    showToast('Visualização ajustada');
  }, [nodes]);

  const handleCenterView = useCallback(() => {
    if (nodes.length === 0 || !canvasRef.current) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((n) => {
      const pos = currentPositionsRef.current.get(n.id) || { x: n.x, y: n.y };
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + (n.width || 340));
      maxY = Math.max(maxY, pos.y + 260);
    });

    const rect = canvasRef.current.getBoundingClientRect();
    const currentZ = zoomRef.current;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    triggerSmoothTransition();
    setPan({
      x: Math.round(rect.width / 2 - cx * currentZ),
      y: Math.round(rect.height / 2 - cy * currentZ)
    });
    showToast('Fluxo centralizado');
  }, [nodes]);

  const handleAutoArrange = () => {
    const levelMap: Record<string, number> = {
      inicio: 0,
      menu: 1,
      regra: 2,
      mensagem: 3,
      midia: 3,
      encerramento: 4
    };

    const levelXs = [80, 480, 920, 1360, 1800];
    const levelCurrentYs = [180, 100, 40, 100, 360];

    const nextNodes = nodes.map((n) => {
      const lvl = levelMap[n.type] ?? 2;
      const x = levelXs[lvl];
      const y = levelCurrentYs[lvl];

      const heightOffset = n.type === 'menu' ? 440 : n.type === 'regra' ? 220 : 200;
      levelCurrentYs[lvl] += heightOffset;

      return {
        ...n,
        x: snapToGrid(x),
        y: snapToGrid(y)
      };
    });

    triggerSmoothTransition();
    setNodes(nextNodes);
    pushHistory(nextNodes, connections);
    triggerAutoSave(nextNodes, connections);
    showToast('Blocos auto-organizados em colunas!');
  };

  // ----------------------------------------------------
  // ATALHOS DE TECLADO
  // ----------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea';

      // Barra de espaço para ativar modo pan
      if (e.code === 'Space' && !isInputActive && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      // Esc para fechar modal ou cancelar modo de conexão e desselecionar
      if (e.key === 'Escape') {
        if (isTestModalOpen) {
          setIsTestModalOpen(false);
          return;
        }
        if (editingRuleNode) {
          setEditingRuleNode(null);
          return;
        }
        if (isAddBlockMenuOpen) {
          setIsAddBlockMenuOpen(false);
          return;
        }
        if (isFlowPickerOpen) {
          setIsFlowPickerOpen(false);
          return;
        }
        if (isRulesDropdownOpen) {
          setIsRulesDropdownOpen(false);
          return;
        }
        cancelConnection();
        setSelectedNodeId(null);
        setSelectedConnectionId(null);
      }

      // Delete ou Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputActive) {
        if (selectedConnectionId) {
          const nextConns = connectionsRef.current.filter((c) => c.id !== selectedConnectionId);
          setConnections(nextConns);
          setSelectedConnectionId(null);
          pushHistory(nodesRef.current, nextConns);
          triggerAutoSave(nodesRef.current, nextConns);
          showToast('Conexão removida');
        } else if (selectedNodeId) {
          const targetNode = nodesRef.current.find((n) => n.id === selectedNodeId);
          if (targetNode && targetNode.type !== 'inicio') {
            const nextNodes = nodesRef.current.filter((n) => n.id !== selectedNodeId);
            const nextConns = connectionsRef.current.filter(
              (c) => c.fromNodeId !== selectedNodeId && c.toNodeId !== selectedNodeId
            );
            setNodes(nextNodes);
            setConnections(nextConns);
            setSelectedNodeId(null);
            pushHistory(nextNodes, nextConns);
            triggerAutoSave(nextNodes, nextConns);
            showToast('Bloco excluído');
          }
        }
      }

      // Ctrl+D para duplicar nó selecionado
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !isInputActive && selectedNodeId) {
        e.preventDefault();
        const nodeToDupl = nodesRef.current.find((n) => n.id === selectedNodeId);
        if (nodeToDupl && nodeToDupl.type !== 'inicio') {
          handleDuplicateNode(nodeToDupl);
        }
      }

      // Ctrl+Z para desfazer
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !isInputActive) {
        e.preventDefault();
        handleUndo();
      }

      // Ctrl+Shift+Z ou Ctrl+Y para refazer
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z' && !isInputActive) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !isInputActive)
      ) {
        e.preventDefault();
        handleRedo();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isTestModalOpen,
    editingRuleNode,
    selectedConnectionId,
    selectedNodeId,
    cancelConnection,
    pushHistory,
    triggerAutoSave,
    handleUndo,
    handleRedo
  ]);

  // ----------------------------------------------------
  // MANIPULAÇÃO DE NÓS
  // ----------------------------------------------------
  const handleDuplicateNode = (node: VisualNode) => {
    const uniqueId = `node_${node.type}_${Date.now().toString(36).slice(2, 6)}`;
    const clonedNode: VisualNode = {
      ...node,
      id: uniqueId,
      x: snapToGrid(node.x + 40),
      y: snapToGrid(node.y + 40),
      data: JSON.parse(JSON.stringify(node.data))
    };

    const nextNodes = [...nodes, clonedNode];
    setNodes(nextNodes);
    setSelectedNodeId(uniqueId);
    pushHistory(nextNodes, connections);
    triggerAutoSave(nextNodes, connections);
    showToast('Bloco duplicado');
  };

  const handleAddRuleFromCatalog = (rule: any) => {
    setIsRulesDropdownOpen(false);

    let targetX = 880;
    let targetY = 240;
    if (selectedNodeId) {
      const active = nodes.find((n) => n.id === selectedNodeId);
      if (active) {
        targetX = snapToGrid(active.x + active.width + 60);
        targetY = snapToGrid(active.y);
      }
    } else if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      targetX = snapToGrid((-pan.x + rect.width / 2 - 160) / zoom);
      targetY = snapToGrid((-pan.y + rect.height / 2 - 100) / zoom);
    }

    const ruleNodeId = `node_rule_${rule.id}_${Date.now().toString(36).slice(2, 6)}`;
    const rawKeywords = rule.trigger || (Array.isArray(rule.palavras) ? rule.palavras.join(', ') : '');

    const newNode: VisualNode = {
      id: ruleNodeId,
      type: 'regra',
      x: targetX,
      y: targetY,
      width: 340,
      data: {
        ruleId: rule.id,
        ruleName: rule.name || rule.nome || `Regra: ${rawKeywords.split(',')[0]}`,
        trigger: rawKeywords,
        palavras: rule.palavras || [],
        resposta: rule.response || rule.resposta || ''
      }
    };

    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setSelectedNodeId(ruleNodeId);
    pushHistory(nextNodes, connections);
    triggerAutoSave(nextNodes, connections);
    showToast('Bloco de regra adicionado');
  };

  const handleAddGenericBlock = (
    type:
      | 'inicio'
      | 'regra'
      | 'mensagem'
      | 'midia'
      | 'menu'
      | 'encerramento'
      | 'delay'
      | 'condicao'
      | 'tag'
      | 'transferir_humano'
  ) => {
    setIsAddBlockMenuOpen(false);

    if (type === 'regra') {
      setIsRulesDropdownOpen(true);
      return;
    }

    if (type === 'inicio') {
      const existing = nodes.find((n) => n.type === 'inicio');
      if (existing) {
        setSelectedNodeId(existing.id);
        showToast('Bloco inicial já presente no fluxo');
        return;
      }
    }

    let targetX = 600;
    let targetY = 200;

    if (selectedNodeId) {
      const active = nodes.find((n) => n.id === selectedNodeId);
      if (active) {
        targetX = snapToGrid(active.x + active.width + 60);
        targetY = snapToGrid(active.y);
      }
    } else if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      targetX = snapToGrid((-pan.x + rect.width / 2 - 160) / zoom);
      targetY = snapToGrid((-pan.y + rect.height / 2 - 100) / zoom);
    }

    const uniqueId = `node_${type}_${Date.now().toString(36).slice(2, 6)}`;
    let newNode: VisualNode;

    if (type === 'inicio') {
      newNode = {
        id: uniqueId,
        type: 'inicio',
        x: targetX,
        y: targetY,
        width: 320,
        data: {
          titulo: 'Início do Fluxo',
          conteudo: 'Ponto de partida do fluxo de atendimento.'
        }
      };
    } else if (type === 'menu') {
      newNode = {
        id: uniqueId,
        type: 'menu',
        x: targetX,
        y: targetY,
        width: 360,
        data: {
          tituloMenu: 'Menu de Opções',
          conteudo: 'Por favor, selecione uma das opções abaixo:',
          rodapeMenu: '👉 Digite o número correspondente.',
          opcoes: [
            { id: 'opt_1', numero: 1, texto: 'Opção 1', acao: 'executar_fluxo' },
            { id: 'opt_2', numero: 2, texto: 'Opção 2', acao: 'executar_fluxo' }
          ]
        }
      };
    } else if (type === 'midia') {
      const firstFile = libraryFiles[0];
      newNode = {
        id: uniqueId,
        type: 'midia',
        x: targetX,
        y: targetY,
        width: 320,
        data: {
          arquivo: firstFile ? firstFile.fileName || firstFile.name : 'catalogo_produtos.pdf',
          tipoMidia: 'pdf',
          legenda: 'Arquivo da Biblioteca'
        }
      };
    } else if (type === 'mensagem') {
      newNode = {
        id: uniqueId,
        type: 'mensagem',
        x: targetX,
        y: targetY,
        width: 320,
        data: {
          conteudo: 'Digite a resposta ou orientação complementar...',
          delay: 1.5
        }
      };
    } else if (type === 'delay') {
      newNode = {
        id: uniqueId,
        type: 'delay',
        x: targetX,
        y: targetY,
        width: 280,
        data: {
          delay: 5,
          delaySeconds: 5
        }
      };
    } else if (type === 'condicao') {
      newNode = {
        id: uniqueId,
        type: 'condicao',
        x: targetX,
        y: targetY,
        width: 300,
        data: {
          campoCondicao: 'mensagem',
          operadorCondicao: 'contem',
          valorCondicao: ''
        }
      };
    } else if (type === 'tag') {
      newNode = {
        id: uniqueId,
        type: 'tag',
        x: targetX,
        y: targetY,
        width: 280,
        data: {
          tagName: 'interessado'
        }
      };
    } else if (type === 'transferir_humano') {
      newNode = {
        id: uniqueId,
        type: 'transferir_humano',
        x: targetX,
        y: targetY,
        width: 300,
        data: {
          conteudo: 'Transferência para atendimento humano'
        }
      };
    } else {
      newNode = {
        id: uniqueId,
        type: 'encerramento',
        x: targetX,
        y: targetY,
        width: 300,
        data: {
          conteudo: 'Finaliza determinística e cordialmente o atendimento.'
        }
      };
    }

    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setSelectedNodeId(uniqueId);
    pushHistory(nextNodes, connections);
    triggerAutoSave(nextNodes, connections);
    showToast(`Bloco ${type} adicionado`);
  };

  const handleDeleteNode = (nodeId: string) => {
    const nextNodes = nodes.filter((n) => n.id !== nodeId);
    const nextConns = connections.filter((c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId);
    setNodes(nextNodes);
    setConnections(nextConns);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    pushHistory(nextNodes, nextConns);
    triggerAutoSave(nextNodes, nextConns);
    showToast('Bloco excluído');
  };

  const handleDeleteConnection = (connId: string) => {
    const nextConns = connections.filter((c) => c.id !== connId);
    setConnections(nextConns);
    if (selectedConnectionId === connId) setSelectedConnectionId(null);
    pushHistory(nodes, nextConns);
    triggerAutoSave(nodes, nextConns);
    showToast('Conexão removida');
  };

  const handleUpdateNodeData = (nodeId: string, partialData: Partial<VisualNode['data']>) => {
    const nextNodes = nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...partialData } } : n
    );
    setNodes(nextNodes);
    triggerAutoSave(nextNodes, connections);
  };

  // Edição rápida de regra
  const handleOpenEditRuleModal = (node: VisualNode) => {
    setEditingRuleNode(node);
    setRuleModalKeywords(node.data.trigger || (node.data.palavras || []).join(', '));
    setRuleModalResponse(node.data.resposta || '');
  };

  const handleSaveRuleModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRuleNode || !editingRuleNode.data.ruleId) return;

    const kwList = ruleModalKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    if (kwList.length === 0) {
      showToast('Por favor, informe ao menos uma palavra-chave.', 'error');
      return;
    }

    try {
      const ruleId = editingRuleNode.data.ruleId;
      const updatedRuleList = rules.map((r) => {
        if (r.id === ruleId) {
          return {
            ...r,
            trigger: ruleModalKeywords.trim(),
            palavras: kwList.map((k) => k.toLowerCase()),
            todasPalavras: kwList.map((k) => k.toLowerCase()),
            response: ruleModalResponse.trim(),
            resposta: ruleModalResponse.trim()
          };
        }
        return r;
      });

      const res = await authFetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: updatedRuleList })
      });

      if (res.ok) {
        setRules(updatedRuleList);
        const nextNodes = nodes.map((n) => {
          if (n.id === editingRuleNode.id) {
            return {
              ...n,
              data: {
                ...n.data,
                trigger: ruleModalKeywords.trim(),
                palavras: kwList.map((k) => k.toLowerCase()),
                resposta: ruleModalResponse.trim()
              }
            };
          }
          return n;
        });
        setNodes(nextNodes);
        setEditingRuleNode(null);
        pushHistory(nextNodes, connections);
        triggerAutoSave(nextNodes, connections);
        showToast('Regra atualizada com sucesso!');
        window.dispatchEvent(new CustomEvent('upzap_rules_updated'));
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Erro ao sincronizar regra.', 'error');
      }
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, 'error');
    }
  };

  // Edição de bloco geral (Início, Mensagem, etc.)
  const handleOpenEditGeneralNode = (node: VisualNode) => {
    setEditingGeneralNode(node);
    setGeneralNodeTitle(node.data.titulo || (node.type === 'inicio' ? 'Ponto de Partida' : 'Mensagem'));
    setGeneralNodeContent(node.data.conteudo || '');
  };

  const handleSaveGeneralNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGeneralNode) return;
    const updatedNodes = nodes.map((n) =>
      n.id === editingGeneralNode.id
        ? {
            ...n,
            data: {
              ...n.data,
              titulo: generalNodeTitle.trim(),
              conteudo: generalNodeContent.trim()
            }
          }
        : n
    );
    setNodes(updatedNodes);
    pushHistory(updatedNodes, connections);
    triggerAutoSave(updatedNodes, connections);
    setEditingGeneralNode(null);
    showToast('Bloco atualizado com sucesso.');
  };

  const handleUnlinkRuleFromFlow = async (flowId: string) => {
    try {
      const res = await authFetch(`/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: flowId,
          regraGatilhoId: null,
          regraGatilhoNome: null
        })
      });
      if (res.ok) {
        showToast('Gatilho desvinculado do fluxo com sucesso.');
        setAllFlows((prev) =>
          prev.map((f) => (f.id === flowId ? { ...f, regraGatilhoId: undefined, regraGatilhoNome: undefined } : f))
        );
        setRules((prev) =>
          prev.map((r) =>
            r.fluxoId === flowId || r.targetFlowId === flowId
              ? { ...r, fluxoId: undefined, targetFlowId: undefined, fluxoNome: undefined, fluxosVinculados: [], tipoAcao: 'resposta', actionType: 'resposta' }
              : r
          )
        );
        window.dispatchEvent(new CustomEvent('upzap_rules_updated'));
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Erro ao desvincular gatilho.', 'error');
      }
    } catch (err: any) {
      showToast('Erro ao desvincular gatilho: ' + err.message, 'error');
    }
  };

  const linkedRuleInfo = useMemo(() => {
    const currentFlow = allFlows.find((f) => f.id === activeFlowId);
    const rule = rules.find(
      (r) =>
        r.fluxoId === activeFlowId ||
        r.targetFlowId === activeFlowId ||
        (Array.isArray(r.fluxosVinculados) && r.fluxosVinculados.includes(activeFlowId)) ||
        (currentFlow?.regraGatilhoId && r.id === currentFlow.regraGatilhoId)
    );
    if (!rule) {
      if (currentFlow?.regraGatilhoNome) {
        return { id: currentFlow.regraGatilhoId || '', nome: currentFlow.regraGatilhoNome, ativo: true };
      }
      return null;
    }
    return {
      id: rule.id,
      nome: rule.nome || rule.name || 'Regra',
      ativo: rule.ativo !== false && rule.active !== false
    };
  }, [rules, activeFlowId, allFlows]);

  const handleToggleFullscreen = () => {
    if (!isFullscreen) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  // ----------------------------------------------------
  // SIMULADOR DO FLUXO INTEGRADO
  // ----------------------------------------------------
  const handleOpenTestModal = () => {
    setIsTestModalOpen(true);
    setTestError(null);
  };

  const handleCloseTestModal = () => {
    setIsTestModalOpen(false);
  };

  const handleResetTestSession = async () => {
    setTestLoading(true);
    setTestError(null);
    try {
      await authFetch('/api/simulator/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone })
      });
      setTestMessages([]);
      setTestLastResult(null);
      showToast('Sessão de teste reiniciada com sucesso!');
    } catch (err: any) {
      setTestError(`Falha ao reiniciar: ${err.message || 'Erro de conexão'}`);
    } finally {
      setTestLoading(false);
    }
  };

  const handleSendTestMessage = async (overrideText?: string) => {
    const textToSend = (overrideText !== undefined ? overrideText : testInputText).trim();
    if (!textToSend || testLoading) return;

    setTestInputText('');
    setTestError(null);

    const now = new Date();
    const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `usr_${Date.now()}`;

    // Adiciona a mensagem do usuário imediatamente ao chat
    setTestMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: textToSend,
        time: formattedTime
      }
    ]);

    setTestLoading(true);

    try {
      const res = await authFetch('/api/simulator/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSend,
          phone: testPhone,
          contactName: 'Cliente Simulação'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao processar mensagem no motor de automação.');
      }

      const result = data.result || {};
      const conversation = data.conversation || {};
      const isHumanTransfer =
        result.matchedType === 'human_transfer' ||
        conversation.attendanceMode === 'human' ||
        conversation.automationPaused === true;

      setTestLastResult({
        matchedType: result.matchedType,
        matchedName: result.matchedName,
        flowName: result.flowName || 'Fluxo Unificado',
        isHumanTransfer,
        responseTexts: result.responseTexts || [],
        delays: result.delays || [],
        activeMenu: result.activeMenu
      });

      // Cria as mensagens do robô geradas pelo motor
      const newBotMessages: Array<{
        id: string;
        sender: 'user' | 'bot';
        text: string;
        time: string;
        matchedType?: string;
        matchedName?: string;
        flowName?: string;
        isHumanTransfer?: boolean;
        mediaAttachments?: any[];
      }> = [];

      if (Array.isArray(result.responseTexts) && result.responseTexts.length > 0) {
        result.responseTexts.forEach((respText: string, idx: number) => {
          newBotMessages.push({
            id: `bot_${Date.now()}_${idx}`,
            sender: 'bot',
            text: respText,
            time: formattedTime,
            matchedType: result.matchedType,
            matchedName: result.matchedName,
            flowName: result.flowName,
            isHumanTransfer,
            mediaAttachments: idx === 0 ? result.mediaAttachments : undefined
          });
        });
      } else if (isHumanTransfer) {
        newBotMessages.push({
          id: `bot_${Date.now()}_human`,
          sender: 'bot',
          text: 'Um de nossos atendentes humanos assumirá seu atendimento em instantes.',
          time: formattedTime,
          matchedType: 'human_transfer',
          matchedName: 'Transferência para Equipe Humana',
          flowName: result.flowName,
          isHumanTransfer: true
        });
      }

      setTestMessages((prev) => [...prev, ...newBotMessages]);
    } catch (err: any) {
      setTestError(err.message || 'Erro ao comunicar com o servidor de simulação.');
    } finally {
      setTestLoading(false);
      setTimeout(() => {
        testChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    }
  };

  // Mapeamento de conexões de entrada e saída para feedback visual
  const connectedInputsSet = useMemo(() => {
    const set = new Set<string>();
    connections.forEach((c) => set.add(c.toNodeId));
    return set;
  }, [connections]);

  const connectedOutputsSet = useMemo(() => {
    const set = new Set<string>();
    connections.forEach((c) => set.add(c.fromNodeId));
    return set;
  }, [connections]);

  const nodeConnectedOptionsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    connections.forEach((c) => {
      if (c.fromPortId) {
        if (!map.has(c.fromNodeId)) map.set(c.fromNodeId, new Set());
        map.get(c.fromNodeId)!.add(c.fromPortId);
      }
    });
    return map;
  }, [connections]);

  const filteredCatalogRules = useMemo(() => {
    const search = ruleSearchTerm.toLowerCase();
    return rules.filter((r) => {
      const name = (r.name || r.nome || '').toLowerCase();
      const trigger = (r.trigger || (Array.isArray(r.palavras) ? r.palavras.join(' ') : '')).toLowerCase();
      return name.includes(search) || trigger.includes(search);
    });
  }, [rules, ruleSearchTerm]);

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full flex flex-col relative overflow-hidden bg-background text-foreground select-none"
    >
      {/* ---------------------------------------------------- */}
      {/* TOP BAR                                              */}
      {/* ---------------------------------------------------- */}
      {/* NAVEGAÇÃO DE ABAS DO FLOW BUILDER                   */}
      {/* ---------------------------------------------------- */}
      <div className="h-10 shrink-0 bg-card border-b border-border px-3.5 flex items-center justify-between gap-3 z-40 select-none">
        <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
              activeTab === 'editor'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Editor Visual (Canvas)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('flows')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
              activeTab === 'flows'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Meus Fluxos</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'flows' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground border border-border'
            }`}>
              {allFlows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mappings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
              activeTab === 'mappings'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Mapeamento Brizex</span>
          </button>
        </div>

        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer"
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {activeTab === 'flows' && (
        <FlowsListView
          flows={allFlows}
          activeFlowId={activeFlowId}
          onSelectFlowForEdit={handleSelectFlowForEdit}
          onCreateFlow={handleCreateFlow}
          onDuplicateFlow={handleDuplicateFlow}
          onToggleFlowActive={handleToggleFlowActive}
          onDeleteFlow={handleDeleteFlow}
          onUnlinkRule={handleUnlinkRuleFromFlow}
          rules={rules}
          loading={loading}
        />
      )}

      {activeTab === 'mappings' && <EventMappingsView flows={allFlows} rules={rules} />}

      {activeTab === 'editor' && (
        <>
          {/* ---------------------------------------------------- */}
          {/* TOP BAR DO CANVAS (REORGANIZAÇÃO VISUAL)             */}
          {/* ---------------------------------------------------- */}
          <header className="topbar h-13 shrink-0 bg-card/95 backdrop-blur-md border-b border-border px-3.5 flex items-center justify-between gap-3 z-30 shadow-xs select-none">
            {/* GRUPO B: Contexto do fluxo (Esquerda) */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                <Workflow className="w-4 h-4" />
              </div>

              {/* Seletor dropdown de fluxos */}
              <div ref={flowPickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsFlowPickerOpen((p) => !p);
                    setIsRulesDropdownOpen(false);
                    setIsAddBlockMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors cursor-pointer active:scale-[0.98]"
                >
                  <span className="text-muted-foreground font-normal">Fluxo:</span>
                  <span className="font-semibold text-foreground max-w-44 truncate">{flowName}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${isFlowPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {isFlowPickerOpen && (
                  <div className="absolute top-full mt-1.5 left-0 w-72 rounded-xl bg-card border border-border shadow-2xl p-2 z-50 space-y-1">
                    <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>Selecionar Fluxo</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsFlowPickerOpen(false);
                          setActiveTab('flows');
                        }}
                        className="text-primary hover:underline font-normal cursor-pointer text-xs"
                      >
                        Gerenciar
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {allFlows.map((fl) => (
                        <button
                          key={fl.id}
                          type="button"
                          onClick={() => {
                            handleSelectFlowForEdit(fl.id);
                            setIsFlowPickerOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-between ${
                            fl.id === activeFlowId
                              ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
                              : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          <span className="truncate">{fl.nome}</span>
                          {fl.isWelcomeFlow && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20 shrink-0">
                              Padrão
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Botão de Regras Cadastradas */}
              <div ref={rulesDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsRulesDropdownOpen((prev) => !prev);
                    setIsFlowPickerOpen(false);
                    setIsAddBlockMenuOpen(false);
                  }}
                  title="Inserir uma regra cadastrada na tela do fluxo"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors cursor-pointer active:scale-[0.98]"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span className="hidden md:inline">Regras</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/10 text-amber-500 font-mono border border-amber-500/20">
                    {rules.length}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${isRulesDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isRulesDropdownOpen && (
                  <div className="absolute top-full mt-1.5 left-0 w-80 rounded-xl bg-card border border-border shadow-2xl p-3 z-50 space-y-2 text-foreground">
                    <div className="flex items-center justify-between pb-1 border-b border-border">
                      <span className="text-xs font-bold text-foreground">Adicionar Regra ao Fluxo</span>
                      <button
                        type="button"
                        onClick={() => setIsRulesDropdownOpen(false)}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={ruleSearchTerm}
                        onChange={(e) => setRuleSearchTerm(e.target.value)}
                        placeholder="Buscar por nome ou gatilho..."
                        className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                      />
                    </div>

                    <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                      {filteredCatalogRules.length === 0 ? (
                        <div className="text-center py-4 text-xs text-muted-foreground">Nenhuma regra encontrada.</div>
                      ) : (
                        filteredCatalogRules.map((rule) => {
                          const triggerText = rule.trigger || (rule.palavras || []).join(', ');
                          return (
                            <button
                              key={rule.id}
                              type="button"
                              onClick={() => handleAddRuleFromCatalog(rule)}
                              className="w-full text-left p-2 rounded-lg bg-muted/40 hover:bg-primary/10 hover:border-primary/30 border border-border transition-all cursor-pointer group"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground group-hover:text-primary">
                                  {rule.name || rule.nome}
                                </span>
                                <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                                Gatilhos: <span className="text-foreground">{triggerText || 'sem palavras'}</span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {onNavigateToRules && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsRulesDropdownOpen(false);
                          onNavigateToRules();
                        }}
                        className="w-full py-1.5 text-center text-xs font-medium text-primary hover:underline transition-colors flex items-center justify-center gap-1 border-t border-border pt-2"
                      >
                        <span>Criar nova regra na Aba Regras</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Indicador discreto de status de salvamento */}
              <div className="hidden sm:flex items-center">
                {saveStatus === 'saved' ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium px-2 py-1 rounded-md bg-emerald-500/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Salvo</span>
                  </div>
                ) : saveStatus === 'saving' ? (
                  <div className="flex items-center gap-1.5 text-xs text-sky-500 font-medium px-2 py-1 rounded-md bg-sky-500/5">
                    <Loader2 className="w-3 h-3 animate-spin text-sky-500" />
                    <span>Salvando...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500 font-medium px-2 py-1 rounded-md bg-amber-500/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="hidden lg:inline">Alterações pendentes</span>
                    <span className="lg:hidden">Pendente</span>
                  </div>
                )}
              </div>
            </div>

            {/* GRUPO C: Inserção de blocos centralizada (+ Adicionar Bloco) */}
            <div className="flex items-center justify-center">
              <div ref={addBlockMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddBlockMenuOpen((p) => !p);
                    setIsFlowPickerOpen(false);
                    setIsRulesDropdownOpen(false);
                  }}
                  title="Abrir catálogo para inserir um novo bloco no canvas"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 transition-all cursor-pointer active:scale-[0.97] shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Adicionar bloco</span>
                  <ChevronDown className={`h-3.5 w-3.5 opacity-70 transition-transform duration-150 ${isAddBlockMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isAddBlockMenuOpen && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-80 max-w-[92vw] rounded-xl bg-card border border-border shadow-2xl p-2.5 z-50 text-foreground animate-in fade-in-0 zoom-in-95 duration-150">
                    <div className="px-2 pb-2 mb-1.5 border-b border-border flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-foreground">Adicionar Bloco ao Fluxo</div>
                        <div className="text-[11px] text-muted-foreground">Selecione uma etapa para posicionar no canvas</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAddBlockMenuOpen(false)}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
                      {AVAILABLE_BLOCK_TYPES.map((block) => {
                        const BlockIcon = block.icon;
                        return (
                          <button
                            key={block.type}
                            type="button"
                            onClick={() => {
                              handleAddGenericBlock(block.type);
                              setIsAddBlockMenuOpen(false);
                            }}
                            className="w-full text-left p-2 rounded-lg hover:bg-muted/80 border border-transparent hover:border-border transition-all cursor-pointer flex items-center gap-2.5 group active:scale-[0.99]"
                          >
                            <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${block.iconBg}`}>
                              <BlockIcon className={`w-3.5 h-3.5 ${block.iconColor}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                                <span>{block.label}</span>
                                <Plus className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {block.description}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* GRUPO D & E: Controles do Canvas + Ações Principais (Direita) */}
            <div className="flex items-center gap-2 shrink-0">
              {/* GRUPO D: Controles do canvas compactos */}
              <div className="flex items-center gap-1">
                {/* Desfazer / Refazer agrupado */}
                <div className="flex items-center bg-secondary rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="Desfazer (Ctrl+Z)"
                    className="p-1.5 text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="w-px h-3.5 bg-border" />
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    title="Refazer (Ctrl+Shift+Z)"
                    className="p-1.5 text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="h-4 w-px bg-border/80 mx-0.5 hidden sm:block" />

                {/* Auto-organizar Grade */}
                <button
                  type="button"
                  onClick={handleAutoArrange}
                  title="Auto-organizar blocos em colunas inteligentes"
                  className="p-1.5 rounded-lg bg-secondary text-foreground hover:bg-accent border border-border transition-colors cursor-pointer"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>

                {/* Ajustar à tela */}
                <button
                  type="button"
                  onClick={handleFitToView}
                  title="Ajustar à tela (Fit View)"
                  className="p-1.5 rounded-lg bg-secondary text-foreground hover:bg-accent border border-border transition-colors cursor-pointer"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </button>

                {/* Controles de Zoom */}
                <div className="hidden sm:flex items-center bg-secondary rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    title="Diminuir Zoom"
                    className="p-1.5 hover:bg-accent text-foreground transition-colors cursor-pointer"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    title="Zoom 100%"
                    className="px-1.5 py-1 text-[11px] font-mono text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    title="Aumentar Zoom"
                    className="p-1.5 hover:bg-accent text-foreground transition-colors cursor-pointer"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Modo Tela Cheia */}
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  title={isFullscreen ? 'Sair da tela cheia' : 'Modo Tela Cheia Imersivo'}
                  className="p-1.5 rounded-lg bg-secondary text-foreground hover:bg-accent border border-border transition-colors cursor-pointer hidden md:flex"
                >
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="h-5 w-px bg-border mx-1" />

              {/* GRUPO E: Ações principais (Testar Fluxo + Salvar) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleOpenTestModal}
                  title="Testar fluxo em tempo real no simulador do robô"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 border border-sky-500/30 font-semibold text-xs transition-all active:scale-[0.97] cursor-pointer shadow-xs"
                >
                  <Play className="h-3.5 w-3.5 fill-sky-500 text-sky-500" />
                  <span className="hidden sm:inline">Testar Fluxo</span>
                  <span className="sm:hidden">Testar</span>
                </button>

                <button
                  type="button"
                  onClick={handleManualSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs transition-all shadow-xs active:scale-[0.97] cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Salvar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </header>

      {/* FEEDBACK TOAST DISCRETO */}
      {feedback && (
        <div
          className={`toast show fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-semibold backdrop-blur-md transition-all ${
            feedback.type === 'success'
              ? 'bg-slate-900 border-emerald-500/50 text-emerald-200'
              : 'bg-slate-900 border-rose-500/50 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* CANVAS VIEWPORT                                      */}
      {/* ---------------------------------------------------- */}
      <div
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleCanvasMouseUp}
        onWheel={handleWheel}
        className={`canvas-container canvas-viewport relative flex-1 w-full h-full overflow-hidden select-none bg-slate-950 ${
          connectionMode
            ? 'cursor-crosshair'
            : isSpacePressed || isPanning
            ? 'cursor-grabbing'
            : 'cursor-grab'
        }`}
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.08) 1.5px, transparent 1.5px)`,
          backgroundSize: `${SNAP_GRID * zoom * 1.5}px ${SNAP_GRID * zoom * 1.5}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`
        }}
      >
        {/* INDICADOR DO MODO DE CONEXÃO (SEM LINHA SEGUINDO O MOUSE) */}
        {connectionMode && (
          <div className="connection-mode-indicator active absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 px-5 py-2 rounded-full text-xs font-bold shadow-2xl z-50 flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-top-2">
            <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
            <span>Clique em um bloco de destino para conectar</span>
            <span className="text-[10px] bg-slate-950/20 px-2 py-0.5 rounded-full font-mono">Esc para cancelar</span>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* CAMADA "MUNDO" (CANVAS-WORLD)                        */}
        {/* ---------------------------------------------------- */}
        <div
          ref={worldRef}
          className="canvas-world absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isSmoothTransitionActive ? 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
            willChange: 'transform'
          }}
        >
          {/* CAMADA SVG DAS CONEXÕES */}
          <svg className="connections-svg absolute inset-0 w-[12000px] h-[12000px] pointer-events-none overflow-visible">
            <defs>
              <linearGradient id="curve-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.9" />
              </linearGradient>

              <filter id="glow-selected" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Conexões estabelecidas */}
            {connections.map((conn) => {
              const fromBlock = nodes.find((b) => b.id === conn.fromNodeId);
              const toBlock = nodes.find((b) => b.id === conn.toNodeId);

              const isBroken = !fromBlock || !toBlock || toBlock.type === 'inicio';
              const fromPos = getPortPosition(conn.fromNodeId, conn.fromPortId || 'output');
              const toPos = getPortPosition(conn.toNodeId, 'input');

              if (!fromPos || !toPos) return null;

              const pathData = bezierPath(fromPos.x, fromPos.y, toPos.x, toPos.y);
              const isSelected = selectedConnectionId === conn.id || selectedNodeId === conn.fromNodeId;

              let strokeColor = 'url(#curve-gradient)';

              if (conn.fromPortId && conn.fromPortId.startsWith('opt_')) {
                const optNum = parseInt(conn.fromPortId.replace('opt_', ''), 10) - 1;
                const col = MENU_OPTION_COLORS[optNum % MENU_OPTION_COLORS.length];
                if (col) {
                  strokeColor = col.stroke;
                }
              }

              if (isBroken) {
                strokeColor = '#ef4444';
              } else if (isSelected) {
                strokeColor = '#10b981';
              }

              return (
                <g key={conn.id} className="group pointer-events-auto">
                  {/* Hit area invisível de 24px para clique fácil */}
                  <path
                    ref={(el) => {
                      if (el) connectionHitsRef.current.set(conn.id, el);
                      else connectionHitsRef.current.delete(conn.id);
                    }}
                    d={pathData}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="24"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConnectionId(conn.id);
                      setSelectedNodeId(null);
                    }}
                    className="cursor-pointer"
                  />

                  {/* Linha Bézier visual */}
                  <path
                    ref={(el) => {
                      if (el) connectionPathsRef.current.set(conn.id, el);
                      else connectionPathsRef.current.delete(conn.id);
                    }}
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isSelected ? '3.5' : '2'}
                    strokeDasharray={isBroken ? '6 4' : undefined}
                    strokeLinecap="round"
                    filter={isSelected ? 'url(#glow-selected)' : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConnectionId(conn.id);
                      setSelectedNodeId(null);
                    }}
                    className="transition-[stroke-width,stroke] duration-150 cursor-pointer hover:stroke-[3.5px]"
                  />

                  {/* Pequena marca (círculo) na ponta de chegada (como na referência) */}
                  <circle
                    ref={(el) => {
                      if (el) connectionCirclesRef.current.set(conn.id, el);
                      else connectionCirclesRef.current.delete(conn.id);
                    }}
                    cx={toPos.x}
                    cy={toPos.y}
                    r={isSelected ? 5 : 4}
                    fill={isBroken ? '#ef4444' : isSelected ? '#10b981' : '#94a3b8'}
                    className="transition-colors duration-150"
                  />
                </g>
              );
            })}
          </svg>

          {/* CAMADA DOS BLOCOS VISUAIS */}
          <div className="absolute inset-0 pointer-events-auto">
            {nodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isConnectedIn = connectedInputsSet.has(node.id);
              const isConnectedOut = connectedOutputsSet.has(node.id);
              const connectedOptionPorts = nodeConnectedOptionsMap.get(node.id) || new Set<string>();

              return (
                <FlowNodeCard
                  key={node.id}
                  node={node}
                  isSelected={isSelected}
                  connectedIn={isConnectedIn}
                  connectedOut={isConnectedOut}
                  connectedOptionPorts={connectedOptionPorts}
                  isConnectionMode={Boolean(connectionMode)}
                  libraryFiles={libraryFiles}
                  linkedRuleInfo={linkedRuleInfo}
                  nodeRefCallback={handleNodeRefCallback}
                  onBlockMouseDown={handleBlockMouseDown}
                  onSelect={(e, id) => {
                    e.stopPropagation();
                    setSelectedNodeId(id);
                    setSelectedConnectionId(null);
                  }}
                  onStartConnection={startConnection}
                  onFinishConnection={finishConnection}
                  onDoubleClick={(n) => {
                    if (n.type === 'regra') handleOpenEditRuleModal(n);
                    else handleOpenEditGeneralNode(n);
                  }}
                  onDeleteNode={handleDeleteNode}
                  onDuplicateNode={handleDuplicateNode}
                  onOpenEditRuleModal={handleOpenEditRuleModal}
                  onOpenEditGeneralNode={handleOpenEditGeneralNode}
                  onUpdateNodeData={handleUpdateNodeData}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* MODAL DE EDIÇÃO DE REGRA (2 CAMPOS ESSENCIAIS)       */}
      {/* ---------------------------------------------------- */}
      {editingRuleNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 text-foreground">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">
                    Editar Regra ({editingRuleNode.data.ruleName})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Ajuste os 2 campos essenciais. A alteração sincroniza instantaneamente com a Aba Regras.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRuleNode(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRuleModal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                  Palavras-chave (gatilhos separados por vírgula):
                </label>
                <input
                  type="text"
                  value={ruleModalKeywords}
                  onChange={(e) => setRuleModalKeywords(e.target.value)}
                  placeholder="Ex: preco, quanto custa, tabela, kits..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                  Texto de Resposta do Robô:
                </label>
                <textarea
                  value={ruleModalResponse}
                  onChange={(e) => setRuleModalResponse(e.target.value)}
                  rows={4}
                  placeholder="Mensagem determinística que será enviada pelo WhatsApp..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground transition-all"
                  required
                />
                <span className="text-[11px] text-muted-foreground block mt-1">
                  Variáveis suportadas: <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">&#123;&#123;nome&#125;&#125;</code>, <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">&#123;&#123;linkCheckout&#125;&#125;</code>
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingRuleNode(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs transition-colors cursor-pointer shadow-xs"
                >
                  <Save className="h-4 w-4" />
                  <span>Salvar Regra</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingGeneralNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 text-foreground">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">
                    Editar Bloco ({editingGeneralNode.type === 'inicio' ? 'Ponto de Partida' : 'Mensagem'})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Ajuste o texto e identificação do bloco. As alterações são sincronizadas no fluxo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingGeneralNode(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGeneralNode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                  Título do Bloco:
                </label>
                <input
                  type="text"
                  value={generalNodeTitle}
                  onChange={(e) => setGeneralNodeTitle(e.target.value)}
                  placeholder="Ex: Ponto de Partida, Boas-vindas..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                  Conteúdo / Descrição do Bloco:
                </label>
                <textarea
                  value={generalNodeContent}
                  onChange={(e) => setGeneralNodeContent(e.target.value)}
                  rows={4}
                  placeholder="Texto ou orientação do bloco..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingGeneralNode(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs transition-colors cursor-pointer shadow-xs"
                >
                  <Save className="h-4 w-4" />
                  <span>Salvar Bloco</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL DE TESTE DO FLUXO (SIMULADOR INTEGRADO)        */}
      {/* ---------------------------------------------------- */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-3 md:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl h-[88vh] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden text-foreground">
            {/* Header do Modal */}
            <div className="px-5 py-3.5 bg-card/95 border-b border-border flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                  <Play className="h-4 w-4 fill-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-foreground text-sm md:text-base truncate">
                      Testador de Fluxo em Tempo Real
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hidden sm:inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Motor Oficial UpZap
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Simula exatamente o comportamento determinístico das regras e menus do robô.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetTestSession}
                  disabled={testLoading}
                  title="Limpar histórico e reiniciar simulação"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reiniciar</span>
                </button>
                <button
                  type="button"
                  onClick={handleCloseTestModal}
                  title="Fechar (Esc)"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Corpo do Modal: Split Chat + Diagnóstico */}
            <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0">
              {/* Lado Esquerdo: Chat Simulador (col-span-7) */}
              <div className="md:col-span-7 flex flex-col h-full border-r border-border bg-background/50 min-h-0">
                {/* Header do Chat / Banner de Segurança */}
                <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center justify-between text-xs text-muted-foreground shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium text-foreground">Robô UpZap (WhatsApp Simulado)</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                    🛡️ Nenhuma mensagem enviada ao WhatsApp real
                  </span>
                </div>

                {/* Área de Mensagens com Scroll */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-0">
                  {testMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                        <MessageSquare className="w-7 h-7" />
                      </div>
                      <div className="max-w-md space-y-1">
                        <h4 className="text-sm font-bold text-foreground">
                          Pronto para testar seu fluxo!
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Envie uma mensagem abaixo para simular o cliente. O motor identificará palavras-chave, navegará pelos menus e executará os blocos configurados.
                        </p>
                      </div>

                      {/* Sugestões Rápidas de Teste */}
                      <div className="pt-2 w-full max-w-md">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                          Clique em uma sugestão para testar agora:
                        </span>
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {['oi', '1', '2', 'preço', 'quanto custa?', 'falar com atendente'].map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => handleSendTestMessage(suggestion)}
                              className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-accent text-foreground border border-border text-xs transition-colors cursor-pointer"
                            >
                              "{suggestion}"
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    testMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-muted-foreground">
                          {msg.sender === 'user' ? (
                            <>
                              <span>Você (Cliente)</span>
                              <User className="w-3 h-3 text-primary" />
                            </>
                          ) : (
                            <>
                              <Bot className="w-3 h-3 text-sky-500" />
                              <span>Robô UpZap</span>
                              {msg.matchedType && (
                                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.2 rounded border border-border font-medium">
                                  {msg.matchedType}
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-xs max-w-[85%] leading-relaxed shadow-xs ${
                            msg.sender === 'user'
                              ? 'bg-primary text-primary-foreground rounded-tr-xs'
                              : 'bg-card text-foreground border border-border rounded-tl-xs'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{msg.text}</div>

                          {msg.mediaAttachments && msg.mediaAttachments.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border flex items-center gap-1.5 text-[11px] text-purple-400">
                              <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                              <span>Mídia anexada: {msg.mediaAttachments[0]?.fileName || 'Arquivo da Biblioteca'}</span>
                            </div>
                          )}

                          {msg.isHumanTransfer && (
                            <div className="mt-2 pt-2 border-t border-amber-500/30 flex items-center gap-1.5 text-[11px] font-semibold text-amber-500">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Transferido para Atendimento Humano (Robô Pausado)</span>
                            </div>
                          )}

                          <div className="mt-1 text-right text-[10px] opacity-60">
                            {msg.time}
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {testLoading && (
                    <div className="flex items-center gap-2 text-xs text-sky-500 p-2 bg-sky-500/10 rounded-xl border border-sky-500/20 w-fit">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Motor determinístico processando regras e blocos...</span>
                    </div>
                  )}

                  {testError && (
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-bold">Erro no teste:</span>
                        <p>{testError}</p>
                      </div>
                    </div>
                  )}

                  <div ref={testChatEndRef} />
                </div>

                {/* Sugestões rápidas de rodapé quando houver mensagens */}
                {testMessages.length > 0 && (
                  <div className="px-4 py-1.5 bg-muted/30 border-t border-border flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold shrink-0">Opções rápidas:</span>
                    {['oi', '1', '2', '3', '4', '5', 'quanto custa?', 'falar com atendente'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => handleSendTestMessage(chip)}
                        disabled={testLoading}
                        className="px-2 py-0.5 rounded-md bg-secondary hover:bg-accent text-foreground text-[11px] border border-border shrink-0 transition-colors cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input de Mensagem */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendTestMessage();
                  }}
                  className="p-3 bg-card border-t border-border flex items-center gap-2 shrink-0"
                >
                  <input
                    type="text"
                    value={testInputText}
                    onChange={(e) => setTestInputText(e.target.value)}
                    placeholder="Digite como se fosse um cliente no WhatsApp..."
                    disabled={testLoading}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!testInputText.trim() || testLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar</span>
                  </button>
                </form>
              </div>

              {/* Lado Direito: Diagnóstico e Rastreamento de Fluxo (col-span-5) */}
              <div className="md:col-span-5 flex flex-col h-full bg-muted/20 p-4 overflow-y-auto space-y-3.5 min-h-0 border-t md:border-t-0 border-border">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Workflow className="w-3.5 h-3.5 text-primary" />
                    Diagnóstico da Automação
                  </h4>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ID: {activeFlowId}
                  </span>
                </div>

                {/* Alerta de Transferência Humana */}
                {testLastResult?.isHumanTransfer && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-500">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>ATENDIMENTO HUMANO DISPARADO</span>
                    </div>
                    <p className="text-[11px] text-amber-500/90 leading-relaxed">
                      A automação foi pausada e a conversa direcionada para um atendente humano real, evitando que o robô interfira na negociação.
                    </p>
                  </div>
                )}

                {/* Gatilho / Regra Reconhecida */}
                <div className="p-3 rounded-xl bg-card border border-border space-y-1.5 shadow-xs">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Gatilho / Regra Disparada
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      {testLastResult?.matchedName || 'Nenhum disparo registrado'}
                    </span>
                    {testLastResult?.matchedType && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                        {testLastResult.matchedType}
                      </span>
                    )}
                  </div>
                </div>

                {/* Fluxo Executado */}
                <div className="p-3 rounded-xl bg-card border border-border space-y-1.5 shadow-xs">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fluxo Visual Ativo
                  </span>
                  <div className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{testLastResult?.flowName || flowName}</span>
                  </div>
                </div>

                {/* Métricas do Disparo */}
                <div className="p-3 rounded-xl bg-card border border-border space-y-2 shadow-xs">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                    Detalhes do Processamento
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-muted/50 border border-border">
                      <span className="text-[10px] text-muted-foreground block">Respostas</span>
                      <span className="font-bold text-foreground">
                        {testLastResult?.responseTexts?.length || 0} bloco(s)
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/50 border border-border">
                      <span className="text-[10px] text-muted-foreground block">Delay Humano</span>
                      <span className="font-bold text-foreground">
                        {testLastResult?.delays?.[0] ? `${testLastResult.delays[0]}s` : '1.5s'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Nota de Segurança da Produção */}
                <div className="mt-auto p-3 rounded-xl bg-primary/10 border border-primary/20 text-[11px] text-primary space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-primary" />
                    <span>Ambiente de Simulação Seguro</span>
                  </div>
                  <p className="text-foreground/80 leading-relaxed">
                    Testes realizados nesta janela utilizam um identificador isolado (<code className="font-mono text-primary bg-primary/10 px-1 rounded">simulador_flow_builder</code>) que não envia mensagens pelo Baileys nem sobrescreve os pedidos da sua base CRM.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
