export type EditorTabId =
  | 'base'
  | 'regras'
  | 'palavras_chave'
  | 'contra_objecoes'
  | 'fluxos'
  | 'biblioteca'
  | 'audios'
  | 'delays'
  | 'testador';

export interface EditorTabConfig {
  id: EditorTabId;
  label: string;
  icon: string;
  description: string;
  hasSearch: boolean;
  searchPlaceholder?: string;
}

export const EDITOR_TABS: EditorTabConfig[] = [
  {
    id: 'base',
    label: 'Base da Automação',
    icon: '🧠',
    description: 'Definição da identidade da atendente, forma de falar, tom de voz e regras gerais da UpZap.',
    hasSearch: false,
  },
  {
    id: 'regras',
    label: 'Regras',
    icon: '💬',
    description: 'Diretrizes de atendimento, procedimentos de exceção e condutas do robô.',
    hasSearch: true,
    searchPlaceholder: 'Buscar regra de atendimento...',
  },
  {
    id: 'palavras_chave',
    label: 'Palavras-chave',
    icon: '🔑',
    description: 'Mapeamento dos gatilhos de entrada e intenções frequentes dos clientes.',
    hasSearch: true,
    searchPlaceholder: 'Buscar palavra-chave ou intenção...',
  },
  {
    id: 'contra_objecoes',
    label: 'Contra-objeções',
    icon: '🛡️',
    description: 'Matriz de argumentos para contornar dúvidas sobre preço, frete, tecido e confiança.',
    hasSearch: true,
    searchPlaceholder: 'Buscar objeção ou dúvida...',
  },
  {
    id: 'fluxos',
    label: 'Fluxos',
    icon: '🔄',
    description: 'Sequenciamento das etapas do atendimento e funil de conversão.',
    hasSearch: true,
    searchPlaceholder: 'Buscar fluxo conversacional...',
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    icon: '🖼️',
    description: 'Repositório de mídias, fotos do produto em alta resolução e tabelas de medidas.',
    hasSearch: true,
    searchPlaceholder: 'Buscar imagem, catálogo ou mídia...',
  },
  {
    id: 'audios',
    label: 'Áudios',
    icon: '🎤',
    description: 'Amostras de voz humanizada, áudios explicativos e demonstrações em tom natural.',
    hasSearch: true,
    searchPlaceholder: 'Buscar arquivo de áudio ou vinheta...',
  },
  {
    id: 'delays',
    label: 'Delays',
    icon: '⏱️',
    description: 'Tempos de espera entre balões de mensagem para simular digitação humana real.',
    hasSearch: true,
    searchPlaceholder: 'Buscar configuração de tempo de resposta...',
  },
  {
    id: 'testador',
    label: 'Testador',
    icon: '🧪',
    description: 'Sandbox para envio de mensagens em tempo real e verificação das regras ativas.',
    hasSearch: true,
    searchPlaceholder: 'Buscar teste recente...',
  },
];
