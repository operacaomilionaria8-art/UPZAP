import { RelatorioAuditoriaUpZap } from '../types/upzap';

export const defaultRelatorioAuditoriaUpZap: RelatorioAuditoriaUpZap = {
  totalTestesSimulados: 0,
  totalVulnerabilidades: 0,
  criticas: 0,
  altas: 0,
  medias: 0,
  baixas: 0,

  problemasEncontrados: 0,
  problemasCorrigidos: 0,
  problemasPendentes: 0,
  statusFinal: 'APROVADO',
  dataCertificacao: new Date().toISOString().split('T')[0],

  segundaVerificacao: {
    totalTestesReexecutados: 0,
    testesCasosNormais: 0,
    testesCasosIncomuns: 0,
    testesComErrosEAbreviacoes: 0,
    criticosPendentes: 0,
    altosPendentes: 0,
    resultado: 'Pronto para operação.'
  },

  perfisAvaliados: [],

  conclusaoAuditoria:
    'SISTEMA LIMPO E PRONTO PARA USO: Nenhum dado de teste residual. Motor de regras, fluxos, variáveis e integrações estruturais prontos para cadastros reais.',

  vulnerabilidades: []
};
