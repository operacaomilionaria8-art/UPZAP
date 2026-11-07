import React from 'react';
import {
  Bot,
  CheckCircle2,
  Copy,
  Download,
  Edit,
  FileText,
  Sparkles,
  SlidersHorizontal,
  Terminal,
  Sliders
} from 'lucide-react';

interface HeaderProps {
  mainSection: 'editor' | 'base_oficial';
  setMainSection: (section: 'editor' | 'base_oficial') => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenExport: () => void;
  onOpenEdit: () => void;
  onCopyAll: () => void;
  copied: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  mainSection,
  setMainSection,
  activeTab,
  setActiveTab,
  onOpenExport,
  onOpenEdit,
  onCopyAll,
  copied,
}) => {
  return (
    <header className="bg-[#181816] border-b border-white/10 sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 gap-4">
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#D8C7A3]/20 to-[#D8C7A3]/10 flex items-center justify-center text-[#181816] font-bold shadow-lg shadow-none">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">UpZap</h1>
                <span className="bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Plataforma Ativa
                </span>
              </div>
              <p className="text-xs text-white/60">
                Automação Determinística &bull; WhatsApp
              </p>
            </div>
          </div>

          {/* Top Level Platform Navigation Switcher */}
          <div className="flex items-center gap-2 bg-[#181816] p-1.5 rounded-xl border border-white/10">
            <button
              onClick={() => setMainSection('editor')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                mainSection === 'editor'
                  ? 'bg-[#D8C7A3] text-[#181816] shadow-md shadow-none'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Editor da Automação
            </button>

            <button
              onClick={() => setMainSection('base_oficial')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                mainSection === 'base_oficial'
                  ? 'bg-[#D8C7A3] text-[#181816] shadow-md shadow-none'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileText className="w-4 h-4" />
              Base Oficial (Documento)
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={onCopyAll}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                copied
                  ? 'bg-[#A8C3A0] text-[#181816] text-white'
                  : 'bg-[#A8C3A0]/20 text-[#A8C3A0] hover:bg-[#A8C3A0]/25 border border-[#A8C3A0]/30'
              }`}
              title="Copiar Toda a Base Oficial"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copiado!' : 'Copiar Base Completa'}
            </button>

            <button
              onClick={onOpenExport}
              className="px-3 py-2 bg-[#181816] hover:bg-white/10 text-white border border-white/10 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>

            <button
              onClick={onOpenEdit}
              className="px-3 py-2 bg-[#181816] hover:bg-white/10 text-white border border-white/10 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <Edit className="w-4 h-4" />
              Customizar Base
            </button>
          </div>
        </div>

        {/* Navigation Sub-Tabs when in Base Oficial Document View */}
        {mainSection === 'base_oficial' && (
          <div className="flex overflow-x-auto no-scrollbar border-t border-white/10 pt-2 pb-1 gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileText className="w-4 h-4" />
              Visão Geral & 6 Pilares
            </button>

            <button
              onClick={() => setActiveTab('prompt')}
              className={`px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'prompt'
                  ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Terminal className="w-4 h-4" />
              Prompt de Sistema UpZap
            </button>

            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'simulator'
                  ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#A8C3A0]" />
              Simulador de Tom & Testes
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'rules'
                  ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Regras do Padrão UpZap
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
