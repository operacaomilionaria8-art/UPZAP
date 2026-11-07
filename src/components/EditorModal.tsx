import React, { useState } from 'react';
import { X, Save, RotateCcw, User, MessageSquare, Sliders } from 'lucide-react';
import { BaseOficialUpZap } from '../types/upzap';

interface EditorModalProps {
  base: BaseOficialUpZap;
  onSave: (updated: BaseOficialUpZap) => void;
  onReset: () => void;
  onClose: () => void;
}

export const EditorModal: React.FC<EditorModalProps> = ({
  base,
  onSave,
  onReset,
  onClose
}) => {
  const [formData, setFormData] = useState<BaseOficialUpZap>(JSON.parse(JSON.stringify(base)));

  const handleIdentidadeChange = (field: keyof typeof formData.identidade, value: any) => {
    setFormData((prev) => ({
      ...prev,
      identidade: {
        ...prev.identidade,
        [field]: value
      }
    }));
  };

  const handleFormaEscreverChange = (field: keyof typeof formData.formaEscrever, value: any) => {
    setFormData((prev) => ({
      ...prev,
      formaEscrever: {
        ...prev.formaEscrever,
        [field]: value
      }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#181816] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#181816] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#181816]">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#A8C3A0]" />
            <h3 className="text-base font-bold text-white">Customizar Base Oficial UpZap</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {/* Identidade Section */}
          <div className="space-y-4 bg-[#181816] border border-white/10 p-4 rounded-xl">
            <h4 className="text-xs font-bold text-[#A8C3A0] uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4" /> 1. Identidade da Atendente
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-white/80 block mb-1">
                  Nome da Atendente:
                </label>
                <input
                  type="text"
                  value={formData.identidade.nome}
                  onChange={(e) => handleIdentidadeChange('nome', e.target.value)}
                  className="w-full bg-[#181816] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#A8C3A0]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white/80 block mb-1">
                  Idade Aproximada:
                </label>
                <input
                  type="text"
                  value={formData.identidade.idadeAproximada}
                  onChange={(e) => handleIdentidadeChange('idadeAproximada', e.target.value)}
                  className="w-full bg-[#181816] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#A8C3A0]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-white/80 block mb-1">
                Estilo de Atendimento:
              </label>
              <textarea
                value={formData.identidade.estiloAtendimento}
                onChange={(e) => handleIdentidadeChange('estiloAtendimento', e.target.value)}
                rows={2}
                className="w-full bg-[#181816] border border-white/10 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-[#A8C3A0]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-white/80 block mb-1">
                  Nível de Simpatia (1 a 10):
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.identidade.nivelSimpatia}
                  onChange={(e) =>
                    handleIdentidadeChange('nivelSimpatia', parseInt(e.target.value) || 9)
                  }
                  className="w-full bg-[#181816] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#A8C3A0]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white/80 block mb-1">
                  Nível de Formalidade (1 a 10):
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.identidade.nivelFormalidade}
                  onChange={(e) =>
                    handleIdentidadeChange('nivelFormalidade', parseInt(e.target.value) || 3)
                  }
                  className="w-full bg-[#181816] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#A8C3A0]"
                />
              </div>
            </div>
          </div>

          {/* Forma de Escrever Section */}
          <div className="space-y-4 bg-[#181816] border border-white/10 p-4 rounded-xl">
            <h4 className="text-xs font-bold text-[#A8C3A0] uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> 2. Forma de Escrever & Emojis
            </h4>

            <div>
              <label className="text-xs font-medium text-white/80 block mb-1">
                Frequência de Emojis:
              </label>
              <input
                type="text"
                value={formData.formaEscrever.frequenciaEmojis}
                onChange={(e) => handleFormaEscreverChange('frequenciaEmojis', e.target.value)}
                className="w-full bg-[#181816] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#A8C3A0]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white/80 block mb-1">
                Expressões Utilizadas (separadas por vírgula):
              </label>
              <textarea
                value={formData.formaEscrever.expressoesUtilizadas.join(', ')}
                onChange={(e) =>
                  handleFormaEscreverChange(
                    'expressoesUtilizadas',
                    e.target.value.split(',').map((s) => s.trim())
                  )
                }
                rows={2}
                className="w-full bg-[#181816] border border-white/10 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-[#A8C3A0]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white/80 block mb-1">
                Expressões NUNCA Utilizadas (separadas por vírgula):
              </label>
              <textarea
                value={formData.formaEscrever.expressoesNuncaUtilizadas.join(', ')}
                onChange={(e) =>
                  handleFormaEscreverChange(
                    'expressoesNuncaUtilizadas',
                    e.target.value.split(',').map((s) => s.trim())
                  )
                }
                rows={2}
                className="w-full bg-[#181816] border border-white/10 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-[#A8C3A0]"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <button
              type="button"
              onClick={onReset}
              className="px-3 py-2 bg-[#181816] hover:bg-white/10 text-white/80 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restaurar Padrão Oficial
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#181816] hover:bg-white/10 text-white/80 rounded-xl text-xs font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#D8C7A3] text-[#181816] hover:bg-[#D8C7A3] text-[#181816] font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-none"
              >
                <Save className="w-4 h-4" /> Salvar Alterações
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
