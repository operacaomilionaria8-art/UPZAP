export interface IdentidadeAtendente {
  nome: string;
  idadeAproximada: string;
  personalidade: string[];
  objetivoPrincipal: string;
  nivelSimpatia: number; // 1 to 10
  nivelFormalidade: number; // 1 to 10
  estiloAtendimento: string;
  linguagemUtilizada: string;
}

export interface FormaEscrever {
  comoCumprimenta: string;
  comoIniciaConversas: string;
  comoFazPerguntas: string;
  comoRespondeDuvidas: string;
  comoAgradece: string;
  comoSeDespede: string;
  frequenciaEmojis: string;
  emojisFrequentes: string[];
  expressoesUtilizadas: string[];
  expressoesNuncaUtilizadas: string[];
}

export interface FormaFalar {
  ritmo: string;
  linguagem: string;
  naturalidade: string;
  humanizacao: string;
  tamanhoMedioMensagens: string;
  quandoDividirMensagens: string;
  quandoEnviarAudio: string;
  quandoEnviarImagem: string;
  quandoEnviarVideo: string;
  quandoEnviarPdf: string;
}

export interface CenariosComportamento {
  clienteEducado: string;
  clienteObjetivo: string;
  clienteDemoraResponder: string;
  clienteIndeciso: string;
  clientePedeDesconto: string;
  clienteReclama: string;
  clienteMudaAssunto: string;
  clientePerguntasInesperadas: string;
  clienteApenasEmoji: string;
  clienteApenasOk: string;
}

export interface RegrasComportamento {
  sempreFaz: string[];
  nuncaFaz: string[];
  quandoNaoSouberResponder: string;
  dianteDeDuvidas: string;
  dianteDeReclamacoes: string;
  dianteDeClientesIndecisos: string;
  dianteDeClientesApressados: string;
  cenarios: CenariosComportamento;
}

export interface ObjetivoComercial {
  comoConduzirConversa: string;
  comoGerarConfianca: string;
  comoEvitarParecerRobo: string;
  comoApresentarProduto: string;
  comoConduzirFechamento: string;
}

export interface PadraoAutomacao {
  regrasGerais: string[];
  restricoesAbsolutas: string[];
  diretrizesHumanizacao: string[];
}

export interface ProdutoInfo {
  nome: string;
  preco?: number;
  beneficiosChave: string[];
  material: string;
  coresDisponiveis: string[];
  tamanhosDisponiveis: string[];
  formasPagamento: string[];
}

export interface EtapaConversa {
  id: string;
  ordem: number;
  nome: string;
  objetivo: string;
  quandoIniciada: string;
  quandoTermina: string;
  proximasEtapas: string[];
  informacoesObrigatorias: string[];
  situacoesRetorno: string;
  situacoesEncerramento: string;
}

export interface CaminhoAlternativo {
  id: string;
  cenario: string;
  gatilhoEntrada: string;
  acaoMotorRegras: string;
  etapaDestino: string;
}

export interface ArquiteturaConversa {
  etapasOficiais: EtapaConversa[];
  caminhosAlternativos: CaminhoAlternativo[];
}

export type TipoCondicaoRegra =
  | 'opcao_especifica'
  | 'quantidade_especifica'
  | 'estado_atendimento'
  | 'contem_texto'
  | 'regex_personalizado';

export type OperadorQuantidade = '=' | '>=' | '<=' | '>' | '<' | 'entre';

export type OperadorLogicoCondicoes = 'E' | 'OU';

export interface CondicaoRegra {
  id: string;
  tipo: TipoCondicaoRegra;
  descricao?: string;

  // Campos para opcao_especifica / contem_texto
  valorTexto?: string;
  matchExato?: boolean;

  // Campos para quantidade_especifica
  operadorQtd?: OperadorQuantidade;
  valorQtd?: number;
  valorQtdMax?: number;
  palavraAncora?: string;

  // Campos para estado_atendimento
  estadoEsperado?: 'active' | 'closed' | 'finishing' | 'qualquer';

  // Campos para regex_personalizado
  padraoRegex?: string;
}

/**
 * Modo de atendimento do contato (Itens 10, 11 e 12):
 * - 'auto': Robô UpZap respondendo normalmente
 * - 'manual': Operador humano assumiu o atendimento (bot silenciado)
 * - 'paused': Automação pausada temporariamente (bot silenciado)
 */
export type AttendanceMode = 'auto' | 'manual' | 'paused';

// Item 15: Opção de menu interativo
export interface OpcaoMenuInterativo {
  id: string;
  numero: string | number;      // ex: 1, 2, 3
  texto: string;               // ex: "Ver Produtos"
  descricao?: string;          // Descrição adicional do item
  gatilhoRegra?: string;       // Palavra-chave disparada (ex: "produtos", "precos")
  proximoBlocoId?: string;     // Transição de bloco se usado no FlowBuilder
}

export interface MenuInterativoConfig {
  titulo?: string;             // Cabeçalho do menu
  textoPrincipal: string;      // Mensagem introdutória
  rodape?: string;             // Rodapé do menu
  opcoes: OpcaoMenuInterativo[];
  /**
   * modoExibicao:
   * - 'texto_numerado': Formata lista com números em texto WhatsApp (Ativo na v1)
   * - 'hibrido' / 'botoes': Reservado para versão futura com botões nativos interativos do Baileys
   */
  modoExibicao?: 'hibrido' | 'botoes' | 'texto_numerado';
}

export type MenuDisplayFormat = 'botoes' | 'lista' | 'numerado' | 'texto';

export interface ActiveMenuOption {
  id?: string;
  numero: string | number;
  texto: string;
  descricao?: string;
  acao: 'executar_fluxo' | 'executar_regra' | 'transferir_humano' | 'voltar_menu' | 'encerrar' | 'texto' | 'enviar_biblioteca';
  fluxoId?: string;
  regraId?: string;
  libraryItemId?: string;
  resposta?: string;
}

export interface ActiveMenuState {
  titulo?: string;
  textoPrincipal?: string;
  rodape?: string;
  formato?: MenuDisplayFormat;
  botaoTextoLista?: string;
  opcoes: ActiveMenuOption[];
  createdAt: string;
  aguardandoResposta: boolean;
}

export interface FlowMenuOption {
  id?: string;
  numero: number | string;
  texto: string;
  descricao?: string;
  acao: 'executar_fluxo' | 'executar_regra' | 'transferir_humano' | 'voltar_menu' | 'encerrar' | 'texto' | 'enviar_biblioteca';
  fluxoId?: string;
  regraId?: string;
  libraryItemId?: string;
  resposta?: string;
}

export type FlowBlockType =
  | 'regra'              // Executa uma regra existente cadastrada (Gatilho ou Ação)
  | 'menu'               // Menu numerado com opções estruturadas em texto comum
  | 'aguardar_resposta'  // Pausa a execução aguardando resposta da cliente
  | 'pergunta'           // Pergunta ao cliente aguardando resposta
  | 'texto'              // Texto direto (suporte a {{nome}}, {{pedido}}, etc.)
  | 'mensagem'           // Alias para texto
  | 'midia'              // Mídia direta (compatibilidade)
  | 'imagem'             // Imagem
  | 'video'              // Vídeo
  | 'audio'              // Áudio
  | 'documento'          // Documento / PDF
  | 'delay'              // Delay explícito
  | 'condicao'           // Condição lógica determinística
  | 'tag'                // Aplica tag ao contato no CRM
  | 'executar_fluxo'     // Transição para outro fluxo
  | 'transferir_humano'  // Transferência para equipe humana
  | 'encerrar';          // Encerramento do atendimento

export type BlockConditionType =
  | 'sempre'
  | 'se_objecao_preco'
  | 'se_intencao_compra'
  | 'se_duvida_tamanho'
  | 'se_duvida_entrega';

export interface LinearFlowBlock {
  id: string;
  tipo: FlowBlockType;
  conteudo?: string;
  texto?: string;
  delay?: number;
  delayUnidade?: 'segundos' | 'minutos';
  regraId?: string;             // ID da regra reutilizada (se tipo === 'regra')
  regraNome?: string;           // Nome da regra reutilizada
  condicao?: BlockConditionType | string; // Condição determinística para disparo
  campo?: string;
  valor?: string;
  formatoMenu?: 'numerado';     // Exclusivamente numerado em texto WhatsApp
  tituloMenu?: string;
  rodapeMenu?: string;
  botaoTextoLista?: string;
  opcoes?: FlowMenuOption[];
  arquivo?: string;
  tipoArquivo?: 'imagem' | 'video' | 'audio' | 'documento';
  tag?: string;                 // Nome da etiqueta aplicada ao contato
  libraryItemId?: string;
  targetFlowId?: string;
  targetFlowName?: string;
  x?: number;
  y?: number;
}

export interface FlowConnection {
  id: string;
  fromNodeId: string;
  fromPortId?: string;
  toNodeId: string;
  toPortId?: string;
}

export interface LinearFlow {
  id: string;
  nome: string;
  descricao?: string;
  status: 'Publicado' | 'Rascunho' | 'Inativo' | 'Ativo';
  ativo?: boolean;              // Status ativo/inativo para automação
  regraGatilhoId?: string;      // ID da regra que dispara este fluxo
  regraGatilhoNome?: string;    // Nome da regra gatilho
  isWelcomeFlow?: boolean;
  blocos: LinearFlowBlock[];
  updatedAt?: string;
  createdAt?: string;
  canvasNodes?: any[];
  canvasConnections?: FlowConnection[];
}

export interface LibraryContentItem {
  id: string;
  name: string;
  fileName?: string;
  type: 'foto' | 'audio' | 'video' | 'pdf' | 'texto';
  category: string;
  content?: string;
  size?: string;
  mimetype?: string;
  url?: string;
  filePath?: string;
  updatedAt?: string;
}

// Bloco do Construtor de Fluxos
export interface BlocoFluxo {
  id: string;
  ordem: number;
  titulo: string;
  descricao?: string;
  tipoConteudo: 'texto' | 'midia' | 'menu_interativo' | 'pergunta' | 'finalizacao' | 'executar_fluxo';
  
  // Conteúdo do bloco
  texto?: string;
  midiaArquivo?: string;
  menuInterativo?: MenuInterativoConfig;
  libraryItemId?: string;
  targetFlowId?: string;
  
  // Regras de transição
  proximoBlocoPadraoId?: string;
  condicoesTransicao?: CondicaoRegra[];
  delay?: number;
}

export interface AcaoRegraAutomacao {
  id?: string;
  tipo: 'texto' | 'imagem' | 'video' | 'audio' | 'pdf' | 'foto' | 'executar_fluxo';
  conteudo?: string;
  arquivo?: string;
  fluxoId?: string;
  fluxoNome?: string;
  delay?: number;
}

export interface ClienteItem {
  id: string;
  jid?: string;
  phone: string;
  senderNumber: string;
  contactName: string;
  senderName: string;
  state: 'active' | 'finishing' | 'closed';
  attendanceMode?: AttendanceMode;
  modeChangedAt?: string;
  modeChangedBy?: string;
  lastUserMessage: string;
  lastMessageText?: string;
  lastBotReply?: string;
  lastMessageAt: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  currentFlow: string;
  currentFlowId?: string;
  currentFlowStep?: number;
  lastRuleApplied?: string;
  closedAt?: string;
  closedReason?: string;
  reopenedAt?: string;
  automationPaused?: boolean;
  pausedAt?: string;
  activeMenu?: ActiveMenuState | null;
  waitingForInput?: boolean;
  selectedOption?: string | null;
  selectedProduct?: string | null;
  selectedKit?: string | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
  influencerCode?: string | null;
  welcomeSent?: boolean;
  variables?: Record<string, string>;
}

export interface RegraAutomacao {
  id: string;
  nome: string;
  objetivo: string;
  categoria: 'Atendimento' | 'Produto' | 'Comercial' | 'Pedido' | 'Pós-venda' | 'Casos Especiais';
  estadoConversa: string;
  prioridade: 'Crítica' | 'Alta' | 'Média' | 'Baixa';
  prioridadeNumero?: number;
  finalizaAtendimento?: boolean;
  regrasAnteriores: string[];
  proximasRegras: string[];
  informacoesNecessarias: string[];
  informacoesGeradas: string[];
  resposta?: string;
  delay?: number;
  midiaAnexada?: string;
  acoes?: AcaoRegraAutomacao[];
  // Item 6: Condições adicionais (Condição -> Ação)
  condicoes?: CondicaoRegra[];
  operadorCondicoes?: OperadorLogicoCondicoes; // 'E' (todas) ou 'OU' (qualquer uma)
}

export interface EstruturaRegras {
  regras: RegraAutomacao[];
}

export interface ConjuntoPalavrasChave {
  regraId: string;
  regraNome: string;
  categoria: 'Atendimento' | 'Produto' | 'Comercial' | 'Pedido' | 'Pós-venda' | 'Casos Especiais';
  palavrasCorretas: string[];
  errosDigitacao: string[];
  abreviacoes: string[];
  linguagemInformal: string[];
  giriasRegionalismos: string[];
  frasesCompletas: string[];
  mensagensCurtas: string[];
  emojis: string[];
  errosTecladoTypos: string[];
}

export interface BancoPalavrasChave {
  mapeamentos: ConjuntoPalavrasChave[];
}

export interface RespostaHumana {
  id: string;
  perfilCliente: 'Objetivo' | 'Curioso' | 'Desconfiado' | 'Indeciso' | 'Apressado' | 'Educado' | 'Geral';
  texto: string;
  tomOuEstilo: string;
}

export interface ConjuntoRespostas {
  regraId: string;
  regraNome: string;
  categoria: 'Atendimento' | 'Produto' | 'Comercial' | 'Pedido' | 'Pós-venda' | 'Casos Especiais';
  respostas: RespostaHumana[];
}

export interface BancoRespostas {
  mapeamentos: ConjuntoRespostas[];
}

export interface VariacoesObjecao {
  errosDigitacao: string[];
  abreviacoes: string[];
  giriasLinguagemInformal: string[];
  mensagensCurtas: string[];
  frasesCompletas: string[];
  formasEducadas: string[];
  formasDiretas: string[];
  formasDesconfiadas: string[];
}

export interface ObjecaoItem {
  id: string;
  objecaoPrincipal: string;
  categoria:
    | 'Preço e Valor'
    | 'Segurança e Confiança'
    | 'Adiar Decisão e Indecisão'
    | 'Produto e Dúvidas'
    | 'Logística e Frete'
    | 'Desistência e Atendimento'
    | 'Outras Objeções Ocultas';
  descricaoGatilho: string;
  regraAssociadaUpZap: string;
  proximaAcaoRegra: string;
  variacoes: VariacoesObjecao;
  respostas: RespostaHumana[];
}

export interface BancoObjecoes {
  totalObjecoes: number;
  totalRespostas: number;
  objecoes: ObjecaoItem[];
}

export type RuleExecutionScope = 'ambos' | 'gatilho_global' | 'etapa_fluxo';

export interface UpZapRule {
  id: string;
  name?: string;
  nome?: string;
  descricao?: string;
  priority?: 'P1' | 'P2' | 'P3' | 'P4' | string;
  prioridade?: 'Critica' | 'Alta' | 'Media' | 'Baixa' | 'Crítica' | 'Média' | string;
  category?: string;
  categoria?: string;
  tipoGatilho?: RuleTriggerType;
  statusPedido?: string;
  condicoes?: string;
  trigger?: string;
  palavras?: string[];
  palavrasChave?: string[];
  todasPalavras?: string[];
  matchType?: 'contains' | 'exact' | 'startsWith' | 'regex';
  executionScope?: RuleExecutionScope;
  response?: string;
  resposta?: string;
  tempoInatividadeMinutos?: number;
  libraryItemId?: string;
  mediaUrl?: string;
  mediaName?: string;
  delaySeconds?: number;
  delay?: number;
  actionType?: 'resposta' | 'executar_fluxo' | 'transferir_humano' | 'encerrar' | string;
  tipoAcao?: string;
  targetFlowId?: string;
  targetFlowName?: string;
  fluxoId?: string;
  fluxoNome?: string;
  fluxosVinculados?: string[];
  acoes?: AcaoRegraAutomacao[];
  conditionType?: 'nenhuma' | 'objecao_preco' | 'intencao_compra' | 'duvida_tamanho' | 'duvida_entrega';
  active?: boolean;
  ativo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ItemMidia {
  id: string;
  regraId: string;
  regraNome: string;
  objetivo: string;
  tipo: 'imagem' | 'video' | 'audio' | 'pdf';
  placeholder: string;
  momentoEnvio: string;
  textoAcompanhamento: string;
  proximaRegra: string;
}

export interface OpcaoBotao {
  textoExibido: string;
  objetivo: string;
  regraAcionada: string;
  alternativasTextoEDigitacao: string[];
}

export interface ItemBotao {
  id: string;
  regraId: string;
  contextoPergunta: string;
  botoes: OpcaoBotao[];
  comportamentoEntrada: string;
}

export interface ItemDelay {
  id: string;
  regraId: string;
  tempoSegundos: number;
  tempoFormatado: string;
  motivoHumanizacao: string;
  efeitoVisualWhatsApp: 'Digitando...' | 'Gravando áudio...' | 'Pausa de leitura';
}

export interface ItemAudio {
  id: string;
  regraId: string;
  objetivo: string;
  placeholder: string;
  diretrizGravacao: string;
  momentoEnvio: string;
  transcricaoPadrao: string;
}

export interface EstruturaRecursosMidias {
  totalMidias: number;
  totalBotoes: number;
  totalDelays: number;
  totalAudios: number;
  midias: ItemMidia[];
  botoes: ItemBotao[];
  delays: ItemDelay[];
  audios: ItemAudio[];
}

export interface VulnerabilidadeAuditoria {
  id: string;
  categoria: 'Palavras-Chave e Gatilhos' | 'Fluxo e Ponto sem Saída' | 'Objeções e Dúvidas' | 'Variáveis e Estado' | 'Botões vs Digitação' | 'Situações Inesperadas / Borda';
  perfilClienteSimulado: string;
  problema: string;
  regraEnvolvida: string;
  causa: string;
  correcao: string;
  prioridade: 'Crítico' | 'Alto' | 'Médio' | 'Baixo';
  status: 'Identificado' | 'Em Análise' | 'Corrigido';
  exemploConversaReal?: {
    mensagemCliente: string;
    comportamentoIncorreto: string;
    comportamentoEsperado: string;
  };
}

export interface RelatorioAuditoriaUpZap {
  totalTestesSimulados: number;
  totalVulnerabilidades: number;
  criticas: number;
  altas: number;
  medias: number;
  baixas: number;
  problemasEncontrados: number;
  problemasCorrigidos: number;
  problemasPendentes: number;
  statusFinal: 'APROVADO' | 'NÃO APROVADO';
  dataCertificacao?: string;
  perfisAvaliados: string[];
  segundaVerificacao?: {
    totalTestesReexecutados: number;
    testesCasosNormais: number;
    testesCasosIncomuns: number;
    testesComErrosEAbreviacoes: number;
    criticosPendentes: number;
    altosPendentes: number;
    resultado: string;
  };
  vulnerabilidades: VulnerabilidadeAuditoria[];
  conclusaoAuditoria: string;
}

export interface BaseOficialUpZap {
  titulo: string;
  versao: string;
  plataforma: string;
  dataAtualizacao: string;
  produto: ProdutoInfo;
  identidade: IdentidadeAtendente;
  formaEscrever: FormaEscrever;
  formaFalar: FormaFalar;
  regrasComportamento: RegrasComportamento;
  objetivoComercial: ObjetivoComercial;
  padraoAutomacao: PadraoAutomacao;
  arquiteturaConversa?: ArquiteturaConversa;
  estruturaRegras?: EstruturaRegras;
  bancoPalavrasChave?: BancoPalavrasChave;
  bancoRespostas?: BancoRespostas;
  bancoObjecoes?: BancoObjecoes;
  estruturaRecursosMidias?: EstruturaRecursosMidias;
  relatorioAuditoria?: RelatorioAuditoriaUpZap;
}

export type AuditEventType =
  | 'whatsapp_connection'
  | 'loop_detected'
  | 'call_rejected'
  | 'automation_pause'
  | 'system_alert';
export type AlertSoundEvent =
  | 'internet_desconectada'
  | 'internet_restabelecida'
  | 'whatsapp_desconectado'
  | 'whatsapp_reconectado'
  | 'servidor_indisponivel'
  | 'brizex_indisponivel'
  | 'pedido_sincronizacao_falhou'
  | 'fluxo_falhou'
  | 'erro_critico'
  | 'reconexao_concluida'
  | 'integracao_restabelecida';

export type AuditEventLevel = 'info' | 'warning' | 'error' | 'critical' | 'success';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  level: AuditEventLevel;
  title: string;
  description: string;
  timestamp: string;
  details?: Record<string, any>;
  soundEvent?: AlertSoundEvent;
}

export interface TransitionHistoryItem {
  type: 'rule' | 'flow_block';
  id: string;
  name: string;
  timestamp: number;
}

export interface ServerStatusInfo {
  uptimeSeconds: number;
  uptimeFormatted: string;
  memoryMb: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  pm2: {
    active: boolean;
    id: string | null;
    name: string | null;
  };
  whatsapp: {
    state: 'disconnected' | 'connecting' | 'connected' | 'error';
    phoneNumber: string | null;
    userName: string | null;
    lastConnectedAt: string | null;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    reconnectState: 'idle' | 'reconnecting' | 'reconnect_failed';
    maxBackoffSeconds: number;
  };
  automation: {
    globalPaused: boolean;
    activeClientsCount: number;
    closedClientsCount: number;
    loopProtectionEnabled: boolean;
  };
}

export interface InternalAlert {
  id: string;
  key: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  origin: 'whatsapp' | 'brizex' | 'automacao' | 'sistema' | 'rede';
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
  details?: Record<string, any>;
  recommendedAction?: string;
  recoveryResult?: string;
  soundEvent?: AlertSoundEvent;
  recoverySoundEvent?: AlertSoundEvent;
  audioPlayed?: boolean;
}

export interface InternalAlertsSettings {
  enabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  notifyOnDisconnect: boolean;
  notifyOnReconnect: boolean;
  notifyOnServerStop: boolean;
  notifyOnCriticalErrors: boolean;
  notifyOnBrizexError: boolean;
  notifyOnLoops: boolean;
}

export type AlertsSettings = InternalAlertsSettings;

export type MessageDeliveryStatus =
  | 'scheduled'        // Agendada
  | 'waiting_delay'    // Aguardando delay
  | 'sending'          // Enviando
  | 'transport_ack'    // Aceita pelo serviço de transporte
  | 'delivered'        // Entregue
  | 'read'             // Lida
  | 'failed';          // Falha no envio

export interface TrackedMessage {
  id: string;
  conversationId: string;
  from: 'user' | 'bot' | 'agent';
  text: string;
  timestamp: string; // ISO
  formattedTime: string; // HH:mm
  status: MessageDeliveryStatus;
  statusLabel: string;
  source?: 'whatsapp_real' | 'simulator';
  messageId?: string; // ID da mensagem no Baileys
  error?: string;
  delaySeconds?: number;
  flowName?: string;
  ruleName?: string;
}

// ============================================================
// CRM DE PEDIDOS (LOGZZ -> BRIZEX -> UPZAP)
// ============================================================

export type LogzzOrderStatus =
  | 'Agendado'
  | 'Em Separação'
  | 'Separado'
  | 'Em Rota'
  | 'Cancelado'
  | 'A Reagendar'
  | 'Frustrado'
  | 'Completo';

export interface OrderItem {
  nome: string;
  quantidade: number;
  valorUnitario?: number;
  valorTotal?: number;
  sku?: string;
  kit?: string;
  tamanho?: string;
  cor?: string;
}

export interface OrderDeliveryAddress {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  referencia?: string;
}

export interface OrderCustomer {
  nome: string;
  telefone: string;
  cpf?: string;
  email?: string;
}

export interface OrderStatusHistoryItem {
  status: LogzzOrderStatus;
  data: string; // ISO
  origem: 'logzz' | 'brizex' | 'manual' | 'sistema';
  observacao?: string;
}

export interface OrderInternalNote {
  id: string;
  autor: string;
  texto: string;
  data: string; // ISO
}

export interface UpZapOrder {
  id: string; // ID interno UpZap (ex: upz_ord_...)
  logzzOrderId: string; // ID original do pedido na Logzz (chave primária de deduplicação)
  brizexOrderId?: string; // ID de origem na Brizex, se disponível
  cliente: OrderCustomer;
  endereco: OrderDeliveryAddress;
  itens: OrderItem[];
  valorTotal: number;
  valorFrete?: number;
  metodoPagamento?: string;
  dataCriacao: string; // ISO
  dataAgendamento?: string; // Data programada de entrega
  status: LogzzOrderStatus;
  statusHistory: OrderStatusHistoryItem[];
  ultimaAtualizacao: string; // ISO
  observacoesInternas: OrderInternalNote[];
  responsavel?: string; // Membro da equipe responsável pelo acompanhamento
  motivoCancelamento?: string;
  motivoFalha?: string;
  motivoReagendamento?: string;
  alertaAtraso?: boolean; // True se permanece > 24h em 'Em Separação' ou 'Separado'
  precisaAcompanhamentoHumano?: boolean; // Flag para filtro rápido
  origem: 'brizex' | 'manual' | 'logzz';
  rawPayload?: any; // Payload original para auditoria técnica
}

export interface BrizexIntegrationConfig {
  webhookSecret: string;
  enabled: boolean;
  autoPauseCommercialOnScheduled: boolean;
  webhookUrl: string;
  updatedAt: string;
}

export interface BrizexSyncLog {
  id: string;
  timestamp: string; // ISO
  logzzOrderId?: string;
  brizexOrderId?: string;
  clienteNome?: string;
  clienteTelefone?: string;
  statusLogistico?: string;
  tipoOperacao: 'criacao' | 'atualizacao' | 'erro_validacao' | 'erro_autenticacao' | 'erro_processamento' | 'aviso_status';
  sucesso: boolean;
  mensagem: string;
  detalhes?: any;
  ipOrigem?: string;
}

// ----------------------------------------------------
// SISTEMA DE REGRAS, MÚLTIPLOS FLUXOS E EXECUÇÕES
// ----------------------------------------------------

export type RuleTriggerType =
  | 'palavra_chave'
  | 'mensagem_recebida'
  | 'pedido_agendado'
  | 'pedido_em_separacao'
  | 'pedido_separado'
  | 'pedido_em_rota'
  | 'pedido_entregue'
  | 'pedido_cancelado'
  | 'pedido_reagendar'
  | 'pedido_frustrado'
  | 'evento_pedido'
  | 'inatividade'
  | 'manual';

export type FlowExecutionStatus =
  | 'Aguardando'
  | 'Em execução'
  | 'Concluído'
  | 'Pausado'
  | 'Falhou'
  | 'Cancelado';

export interface FlowExecutionStepLog {
  blocoId: string;
  tipoBloco: string;
  titulo?: string;
  executadoEm: string;
  status: 'sucesso' | 'ignorado' | 'falha';
  detalhes?: string;
}

export interface FlowExecution {
  id: string;
  flowId: string;
  flowName: string;
  ruleId?: string;
  ruleName?: string;
  clienteNome: string;
  clienteTelefone: string;
  orderId?: string;
  logzzOrderId?: string;
  origem: 'brizex' | 'whatsapp' | 'simulador' | 'manual';
  status: FlowExecutionStatus;
  etapaAtual: string;
  etapaIndex: number;
  totalEtapas: number;
  startedAt: string;
  completedAt?: string;
  stepsLog: FlowExecutionStepLog[];
  erro?: string;
}

export interface EventFlowMapping {
  id: string;
  evento: string; // ex: 'pedido_agendado', 'pedido_cancelado', 'pedido_em_rota', 'pedido_entregue', etc.
  nomeEvento: string;
  statusLogzzCorrespondente?: string;
  statusPedido?: string;
  regraId?: string;
  regraNome?: string;
  fluxoId?: string;
  fluxoNome?: string;
  ativo: boolean;
  descricao?: string;
}



