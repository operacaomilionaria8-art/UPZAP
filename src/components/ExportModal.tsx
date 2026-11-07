import React, { useState } from 'react';
import { X, Copy, Check, Download, Printer, FileText, Code, MessageSquare } from 'lucide-react';
import { BaseOficialUpZap } from '../types/upzap';

interface ExportModalProps {
  base: BaseOficialUpZap;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ base, onClose }) => {
  const [exportType, setExportType] = useState<'txt' | 'json' | 'whatsapp'>('txt');
  const [copied, setCopied] = useState(false);

  const getTxtContent = () => {
    return `BASE OFICIAL DA AUTOMAÇÃO UPZAP
================================================
PRODUTO: ${base.produto.nome}
VERSÃO: ${base.versao}
DATA DE ATUALIZAÇÃO: ${base.dataAtualizacao}

------------------------------------------------
1. IDENTIDADE DA ATENDENTE
------------------------------------------------
• Nome: ${base.identidade.nome}
• Idade Aproximada: ${base.identidade.idadeAproximada}
• Personalidade: ${base.identidade.personalidade.join(', ')}
• Objetivo Principal: ${base.identidade.objetivoPrincipal}
• Nível de Simpatia: ${base.identidade.nivelSimpatia}/10
• Nível de Formalidade: ${base.identidade.nivelFormalidade}/10
• Estilo de Atendimento: ${base.identidade.estiloAtendimento}

------------------------------------------------
2. FORMA DE ESCREVER
------------------------------------------------
• Como cumprimenta: ${base.formaEscrever.comoCumprimenta}
• Como inicia conversas: ${base.formaEscrever.comoIniciaConversas}
• Como faz perguntas: ${base.formaEscrever.comoFazPerguntas}
• Como responde dúvidas: ${base.formaEscrever.comoRespondeDuvidas}
• Como agradece: ${base.formaEscrever.comoAgradece}
• Como se despede: ${base.formaEscrever.comoSeDespede}
• Frequência de Emojis: ${base.formaEscrever.frequenciaEmojis}
• Emojis Frequentes: ${base.formaEscrever.emojisFrequentes.join(' ')}
• Expressões Utilizadas: ${base.formaEscrever.expressoesUtilizadas.join(' | ')}
• Expressões NUNCA Utilizadas: ${base.formaEscrever.expressoesNuncaUtilizadas.join(' | ')}

------------------------------------------------
3. FORMA DE FALAR
------------------------------------------------
• Ritmo: ${base.formaFalar.ritmo}
• Linguagem: ${base.formaFalar.linguagem}
• Naturalidade: ${base.formaFalar.naturalidade}
• Humanização: ${base.formaFalar.humanizacao}
• Tamanho Médio das Mensagens: ${base.formaFalar.tamanhoMedioMensagens}
• Quando Dividir Mensagens: ${base.formaFalar.quandoDividirMensagens}
• Quando Enviar Áudio: ${base.formaFalar.quandoEnviarAudio}
• Quando Enviar Imagem: ${base.formaFalar.quandoEnviarImagem}

------------------------------------------------
4. REGRAS DE COMPORTAMENTO
------------------------------------------------
O QUE A ATENDENTE SEMPRE FAZ:
${base.regrasComportamento.sempreFaz.map((item) => `- ${item}`).join('\n')}

O QUE A ATENDENTE NUNCA FAZ:
${base.regrasComportamento.nuncaFaz.map((item) => `- ${item}`).join('\n')}

PROTOCOLOS DE AÇÃO:
• Quando não souber responder: ${base.regrasComportamento.quandoNaoSouberResponder}
• Diante de dúvidas: ${base.regrasComportamento.dianteDeDuvidas}
• Diante de reclamações: ${base.regrasComportamento.dianteDeReclamacoes}
• Diante de clientes indecisos: ${base.regrasComportamento.dianteDeClientesIndecisos}
• Diante de clientes apressados: ${base.regrasComportamento.dianteDeClientesApressados}

------------------------------------------------
5. OBJETIVO COMERCIAL
------------------------------------------------
• Como conduzir a conversa: ${base.objetivoComercial.comoConduzirConversa}
• Como gerar confiança: ${base.objetivoComercial.comoGerarConfianca}
• Como evitar parecer robô: ${base.objetivoComercial.comoEvitarParecerRobo}
• Como apresentar o produto: ${base.objetivoComercial.comoApresentarProduto}
• Como conduzir até o fechamento: ${base.objetivoComercial.comoConduzirFechamento}

------------------------------------------------
6. PADRÃO DA AUTOMAÇÃO UPZAP
------------------------------------------------
REGRAS GERAIS:
${base.padraoAutomacao.regrasGerais.map((item) => `- ${item}`).join('\n')}

RESTRIÇÕES ABSOLUTAS:
${base.padraoAutomacao.restricoesAbsolutas.map((item) => `- ${item}`).join('\n')}

DIRETRIZES DE HUMANIZAÇÃO:
${base.padraoAutomacao.diretrizesHumanizacao.map((item) => `- ${item}`).join('\n')}

------------------------------------------------
7. INFORMAÇÕES DO PRODUTO (${base.produto.nome.toUpperCase()})
------------------------------------------------
• Material: ${base.produto.material}
• Benefícios: ${base.produto.beneficiosChave.join(' | ')}
• Cores: ${base.produto.coresDisponiveis.join(', ')}
• Tamanhos: ${base.produto.tamanhosDisponiveis.join(', ')}
• Pagamento: ${base.produto.formasPagamento.join(', ')}

------------------------------------------------
8. RELATÓRIO DE AUDITORIA E TESTES
------------------------------------------------
Total de Simulações: ${base.relatorioAuditoria?.totalTestesSimulados || 0}
Total de Vulnerabilidades: ${base.relatorioAuditoria?.totalVulnerabilidades || 0} (Críticas: ${base.relatorioAuditoria?.criticas || 0}, Altas: ${base.relatorioAuditoria?.altas || 0}, Médias: ${base.relatorioAuditoria?.medias || 0}, Baixas: ${base.relatorioAuditoria?.baixas || 0})

PARECER TÉCNICO DE AUDITORIA:
${base.relatorioAuditoria?.conclusaoAuditoria || 'Auditoria concluída com sucesso.'}

VULNERABILIDADES E CORREÇÕES MAPEADAS:
${(base.relatorioAuditoria?.vulnerabilidades || []).map((v) => `
[${v.id}] ${v.categoria.toUpperCase()} (Prioridade: ${v.prioridade})
• Perfil do Cliente: ${v.perfilClienteSimulado}
• PROBLEMA: ${v.problema}
• REGRA ENVOLVIDA: ${v.regraEnvolvida}
• CAUSA: ${v.causa}
• CORREÇÃO: ${v.correcao}
${v.exemploConversaReal ? `• Exemplo Real: "${v.exemploConversaReal.mensagemCliente}" -> Incorreto: "${v.exemploConversaReal.comportamentoIncorreto}" -> Esperado: "${v.exemploConversaReal.comportamentoEsperado}"` : ''}
`).join('\n')}
`;
  };

  const getWhatsappContent = () => {
    return `*BASE OFICIAL DA AUTOMAÇÃO UPZAP* 🚀
_Produto: ${base.produto.nome}_

*1. IDENTIDADE DA ATENDENTE*
*Nome:* ${base.identidade.nome} (${base.identidade.idadeAproximada})
*Personalidade:* ${base.identidade.personalidade.join(', ')}
*Estilo:* ${base.identidade.estiloAtendimento}

*2. FORMA DE ESCREVER*
• *Emojis:* ${base.formaEscrever.frequenciaEmojis}
• *Expressões Chave:* ${base.formaEscrever.expressoesUtilizadas.join(', ')}
❌ *NUNCA usar:* ${base.formaEscrever.expressoesNuncaUtilizadas.join(', ')}

*3. REGRAS DE COMPORTAMENTO*
✅ *Sempre faz:* ${base.regrasComportamento.sempreFaz.slice(0, 3).join(' | ')}
❌ *Nunca faz:* ${base.regrasComportamento.nuncaFaz.slice(0, 3).join(' | ')}

*4. PADRÃO UPZAP*
• Mensagens curtas e humanizadas.
• Sempre terminar com pergunta de fechamento.
• Pagamento Pix, Cartão e Dinheiro na entrega (quando disponível).
`;
  };

  const getContent = () => {
    if (exportType === 'json') return JSON.stringify(base, null, 2);
    if (exportType === 'whatsapp') return getWhatsappContent();
    return getTxtContent();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = getContent();
    const blob = new Blob([text], {
      type: exportType === 'json' ? 'application/json' : 'text/plain;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `UpZap_Base_Oficial_${base.identidade.nome.toLowerCase()}.${
      exportType === 'json' ? 'json' : 'txt'
    }`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#181816] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#181816] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#181816]">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-[#A8C3A0]" />
            <h3 className="text-base font-bold text-white">Exportar Base Oficial UpZap</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Toolbar */}
        <div className="px-6 py-3 bg-[#181816] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-[#181816] p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setExportType('txt')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                exportType === 'txt'
                  ? 'bg-[#A8C3A0]/20 text-[#A8C3A0] border border-[#A8C3A0]/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Documento TXT
            </button>

            <button
              onClick={() => setExportType('whatsapp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                exportType === 'whatsapp'
                  ? 'bg-[#A8C3A0]/20 text-[#A8C3A0] border border-[#A8C3A0]/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Resumo WhatsApp
            </button>

            <button
              onClick={() => setExportType('json')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                exportType === 'json'
                  ? 'bg-[#A8C3A0]/20 text-[#A8C3A0] border border-[#A8C3A0]/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Code className="w-3.5 h-3.5" /> JSON Config
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-[#181816] hover:bg-white/10 text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border border-white/10"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>

            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                copied
                  ? 'bg-[#A8C3A0] text-[#181816] text-white'
                  : 'bg-[#D8C7A3] text-[#181816] hover:bg-[#D8C7A3] text-[#181816]'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>

            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-[#181816] hover:bg-white/10 text-white border border-white/10 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Baixar
            </button>
          </div>
        </div>

        {/* Content Preview Box */}
        <div className="p-6 overflow-y-auto max-h-[500px]">
          <pre className="bg-[#181816] p-4 rounded-xl border border-white/10 text-xs text-white/80 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
            {getContent()}
          </pre>
        </div>
      </div>
    </div>
  );
};
