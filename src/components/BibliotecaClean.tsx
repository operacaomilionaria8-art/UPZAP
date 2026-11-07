import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  Mic,
  Film,
  FileText,
  Upload,
  Trash2,
  Check,
  Plus,
  Play,
  Volume2,
  Copy,
  ExternalLink,
  Search,
  Eye,
  X,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BaseOficialUpZap } from '../types/upzap';

export interface MediaFile {
  id: string;
  name: string;
  fileName?: string;
  type: 'foto' | 'audio' | 'video' | 'pdf';
  url: string;
  size: string;
  duration?: string;
  category: string;
  previewUrl?: string;
}

interface BibliotecaCleanProps {
  base: BaseOficialUpZap;
  onSelectMedia?: (media: MediaFile) => void;
}

export const BibliotecaClean: React.FC<BibliotecaCleanProps> = ({ base, onSelectMedia }) => {
  const [activeTab, setActiveTab] = useState<'todos' | 'foto' | 'audio' | 'video' | 'pdf'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<MediaFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega arquivos da Biblioteca diretamente da API oficial
  const loadFiles = async () => {
    try {
      const res = await fetch('/api/library/files');
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        const mapped: MediaFile[] = data.files.map((f: any) => {
          const rawType = (f.type || '').toLowerCase();
          const mappedType: 'foto' | 'audio' | 'video' | 'pdf' =
            rawType === 'foto' || rawType === 'image' || rawType === 'imagem'
              ? 'foto'
              : rawType === 'video'
              ? 'video'
              : rawType === 'audio'
              ? 'audio'
              : 'pdf';

          return {
            id: f.id,
            name: f.name || f.fileName,
            fileName: f.fileName || f.name,
            type: mappedType,
            url: f.url || `/api/library/files/${f.fileName || f.name}`,
            previewUrl: f.url || `/api/library/files/${f.fileName || f.name}`,
            size: f.size || '1.0 MB',
            category: f.category || 'Geral'
          };
        });
        setFiles(mapped);
        localStorage.setItem('upzap_library_files', JSON.stringify(mapped));
      } else {
        setFiles([]);
      }
    } catch (err) {
      console.error('Erro ao carregar arquivos da biblioteca:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();

    const handleLibraryUpdate = () => {
      loadFiles();
    };

    window.addEventListener('upzap_library_updated', handleLibraryUpdate);
    return () => {
      window.removeEventListener('upzap_library_updated', handleLibraryUpdate);
    };
  }, []);

  const filteredFiles = files.filter((f) => {
    const matchesTab = activeTab === 'todos' || f.type === activeTab;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      f.name.toLowerCase().includes(term) ||
      f.category.toLowerCase().includes(term);
    return matchesTab && matchesSearch;
  });

  const handleCopyLink = (file: MediaFile) => {
    navigator.clipboard.writeText(file.url);
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 2000);
    if (onSelectMedia) {
      onSelectMedia(file);
    }
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/library/files/${encodeURIComponent(fileToDelete.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id && f.name !== fileToDelete.name));
        if (previewFile?.id === fileToDelete.id) {
          setPreviewFile(null);
        }
        window.dispatchEvent(new CustomEvent('upzap_library_updated'));
      }
    } catch (err) {
      console.error('Erro ao excluir arquivo:', err);
    } finally {
      setIsDeleting(false);
      setFileToDelete(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files;
    if (!uploaded || uploaded.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      for (let i = 0; i < uploaded.length; i++) {
        const file = uploaded[i];

        const rawType = file.type.startsWith('image/')
          ? 'foto'
          : file.type.startsWith('audio/')
          ? 'audio'
          : file.type.startsWith('video/')
          ? 'video'
          : 'pdf';

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const sizeFormatted = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

        const res = await fetch('/api/library/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            fileName: file.name,
            type: rawType,
            dataUrl,
            size: sizeFormatted,
            category: rawType === 'foto' ? 'Fotos do Produto' : rawType === 'video' ? 'Vídeos' : rawType === 'audio' ? 'Áudios' : 'Catálogos'
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Falha ao fazer upload de ${file.name}`);
        }
      }

      await loadFiles();
      window.dispatchEvent(new CustomEvent('upzap_library_updated'));
    } catch (err: any) {
      console.error('Erro durante upload de arquivos:', err);
      setUploadError(err.message || 'Erro durante o upload');
    } finally {
      setIsUploading(false);
      // Reset input value
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Biblioteca de Arquivos</h2>
          <p className="text-xs text-white/60 mt-0.5">
            Fonte única e oficial de fotos, áudios, vídeos e PDFs para as regras de automação.
          </p>
        </div>

        {/* Upload Button */}
        <div className="flex items-center gap-2">
          {isUploading && (
            <div className="flex items-center gap-2 text-xs text-[#A8C3A0] font-semibold bg-[#A8C3A0]/15 px-3 py-1.5 rounded-xl border border-[#A8C3A0]/30">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Enviando arquivo...</span>
            </div>
          )}

          <label className="px-4 py-2 bg-[#D8C7A3] text-[#181816] hover:bg-[#D8C7A3] text-[#181816] font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md shadow-none cursor-pointer self-start sm:self-auto disabled:opacity-50">
            <Upload className="w-4 h-4" />
            <span>Upload de Arquivo</span>
            <input
              type="file"
              multiple
              disabled={isUploading}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,audio/*,video/*,.pdf"
            />
          </label>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 bg-[#D8C7A3]/15 border border-white/10 rounded-xl flex items-center justify-between gap-3 text-[#D8C7A3] text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#D8C7A3] shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="text-[#D8C7A3] hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* TABS E BARRA DE BUSCA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        {/* TABS SUPERIORES: FOTOS | ÁUDIOS | VÍDEOS | PDFs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('todos')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'todos'
                ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30 shadow-sm'
                : 'text-white/60 hover:text-white bg-[#181816] border border-white/10'
            }`}
          >
            Todos ({files.length})
          </button>

          <button
            onClick={() => setActiveTab('foto')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'foto'
                ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30 shadow-sm'
                : 'text-white/60 hover:text-white bg-[#181816] border border-white/10'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" /> Fotos ({files.filter((f) => f.type === 'foto').length})
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'audio'
                ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30 shadow-sm'
                : 'text-white/60 hover:text-white bg-[#181816] border border-white/10'
            }`}
          >
            <Mic className="w-3.5 h-3.5" /> Áudios ({files.filter((f) => f.type === 'audio').length})
          </button>

          <button
            onClick={() => setActiveTab('video')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'video'
                ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30 shadow-sm'
                : 'text-white/60 hover:text-white bg-[#181816] border border-white/10'
            }`}
          >
            <Film className="w-3.5 h-3.5" /> Vídeos ({files.filter((f) => f.type === 'video').length})
          </button>

          <button
            onClick={() => setActiveTab('pdf')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'pdf'
                ? 'bg-[#A8C3A0]/15 text-[#A8C3A0] border border-[#A8C3A0]/30 shadow-sm'
                : 'text-white/60 hover:text-white bg-[#181816] border border-white/10'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> PDFs ({files.filter((f) => f.type === 'pdf').length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar arquivo..."
            className="w-full bg-[#181816] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#A8C3A0]"
          />
        </div>
      </div>

      {/* GRID DE ARQUIVOS */}
      {isLoading ? (
        <div className="py-16 text-center text-white/60 flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#A8C3A0]" />
          <span className="text-xs">Carregando arquivos da Biblioteca...</span>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="py-16 px-6 text-center bg-[#181816] border border-white/10 rounded-2xl flex flex-col items-center justify-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#181816] border border-white/10 flex items-center justify-center text-white/40">
            <ImageIcon className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Nenhum arquivo na biblioteca</h3>
            <p className="text-xs text-white/60 max-w-md">
              {searchTerm
                ? 'Nenhum arquivo encontrado com o termo pesquisado.'
                : 'Faça upload de fotos, áudios gravados, vídeos demonstrativos ou catálogos PDF para vincular às regras de automação.'}
            </p>
          </div>
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}
        >
          <AnimatePresence>
            {filteredFiles.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="group relative bg-[#181816] border border-white/10 hover:border-white/10 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between"
              >
                {/* Media Preview Box */}
                <div className="relative w-full h-36 bg-[#181816] flex items-center justify-center overflow-hidden">
                  {file.type === 'foto' ? (
                    <img
                      src={file.previewUrl || file.url}
                      alt={file.name}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : file.type === 'video' ? (
                    <div className="flex flex-col items-center gap-1.5 text-[#D8C7A3]">
                      <div className="w-10 h-10 rounded-full bg-[#D8C7A3]/15 border border-white/10 flex items-center justify-center">
                        <Play className="w-5 h-5 fill-[#D8C7A3] text-[#D8C7A3] ml-0.5" />
                      </div>
                      <span className="text-[10px] font-mono text-white/60 uppercase">Vídeo MP4</span>
                    </div>
                  ) : file.type === 'audio' ? (
                    <div className="flex flex-col items-center gap-1.5 text-[#A8C3A0]">
                      <div className="w-10 h-10 rounded-full bg-[#A8C3A0]/20 border border-[#A8C3A0]/30 flex items-center justify-center">
                        <Volume2 className="w-5 h-5 text-[#A8C3A0]" />
                      </div>
                      <span className="text-[10px] font-mono text-white/60 uppercase">Áudio WhatsApp</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-[#D8C7A3]">
                      <div className="w-10 h-10 rounded-xl bg-[#D8C7A3]/15 border border-white/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-[#D8C7A3]" />
                      </div>
                      <span className="text-[10px] font-mono text-white/60 uppercase">Documento PDF</span>
                    </div>
                  )}

                  {/* OVERLAY AO PASSAR O MOUSE */}
                  <div className="absolute inset-0 bg-[#181816] backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-1.5 p-2">
                    <button
                      onClick={() => setPreviewFile(file)}
                      className="p-1.5 bg-[#181816] hover:bg-white/10 text-white rounded-lg text-xs transition-all cursor-pointer"
                      title="Visualizar Mídia"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleCopyLink(file)}
                      className="px-2.5 py-1.5 bg-[#D8C7A3] text-[#181816] hover:bg-[#D8C7A3] text-[#181816] font-bold rounded-lg text-xs transition-all shadow-md flex items-center gap-1 cursor-pointer"
                      title="Selecionar / Copiar Link"
                    >
                      {copiedId === file.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === file.id ? 'Copiado' : 'Link'}</span>
                    </button>

                    <button
                      onClick={() => setFileToDelete(file)}
                      className="p-1.5 bg-[#D8C7A3]/15 hover:bg-[#D8C7A3] text-[#181816] text-[#D8C7A3] hover:text-white border border-white/10 rounded-lg text-xs transition-all cursor-pointer"
                      title="Excluir Arquivo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bottom Card Info */}
                <div className="p-3 border-t border-white/10 space-y-1">
                  <p className="text-xs font-semibold text-white truncate" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-white/40">
                    <span>{file.category}</span>
                    <span className="font-mono">{file.size}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal de Prévia de Mídia */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-[#181816] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181816] border border-white/10 rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white truncate pr-2">{previewFile.name}</h3>
              <button
                onClick={() => setPreviewFile(null)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#181816] rounded-xl p-4 flex items-center justify-center min-h-[180px] border border-white/10">
              {previewFile.type === 'foto' && (
                <img
                  src={previewFile.previewUrl || previewFile.url}
                  alt={previewFile.name}
                  className="max-h-72 max-w-full rounded-lg object-contain"
                />
              )}
              {previewFile.type === 'audio' && (
                <div className="w-full space-y-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#A8C3A0]/20 text-[#A8C3A0] mx-auto flex items-center justify-center">
                    <Volume2 className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-white/80 font-mono">{previewFile.name}</p>
                  <audio controls className="w-full h-10">
                    <source src={previewFile.url} />
                    Seu navegador não suporta o reprodutor de áudio.
                  </audio>
                </div>
              )}
              {previewFile.type === 'video' && (
                <div className="w-full space-y-2 text-center">
                  <video controls className="w-full max-h-64 rounded-lg bg-black">
                    <source src={previewFile.url} type="video/mp4" />
                    Seu navegador não suporta o reprodutor de vídeo.
                  </video>
                </div>
              )}
              {previewFile.type === 'pdf' && (
                <div className="text-center space-y-3 p-4">
                  <div className="w-12 h-12 rounded-xl bg-[#D8C7A3]/15 text-[#D8C7A3] mx-auto flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{previewFile.name}</h4>
                    <p className="text-[11px] text-white/60 mt-1">
                      Tamanho: {previewFile.size} • Categoria: {previewFile.category}
                    </p>
                  </div>
                  <a
                    href={previewFile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#181816] hover:bg-white/5 text-[#D8C7A3] border border-white/10 rounded-xl text-xs font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir PDF em nova aba</span>
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-xs text-white/40 font-mono">{previewFile.size}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyLink(previewFile)}
                  className="px-3 py-1.5 bg-[#D8C7A3] text-[#181816] hover:bg-[#D8C7A3] text-[#181816] font-bold rounded-xl text-xs transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Link</span>
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="px-3 py-1.5 bg-[#181816] hover:bg-white/5 text-white/80 border border-white/10 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 bg-[#181816] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181816] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-[#D8C7A3]">
              <div className="p-2.5 bg-[#D8C7A3]/15 border border-white/10 rounded-xl">
                <Trash2 className="w-5 h-5 text-[#D8C7A3]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Excluir Arquivo</h3>
                <p className="text-xs text-white/60">
                  O arquivo será removido da biblioteca e desvinculado das regras.
                </p>
              </div>
            </div>

            <div className="bg-[#181816] p-3 rounded-xl border border-white/10 text-xs text-white/80">
              <span className="text-[10px] uppercase font-bold text-white/40 block">Arquivo:</span>
              <strong className="text-white text-xs block mt-0.5">{fileToDelete.name}</strong>
              <span className="text-[11px] text-white/60 font-mono">
                {fileToDelete.type.toUpperCase()} • {fileToDelete.size}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 bg-[#181816] hover:bg-white/5 text-white/80 border border-white/10 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-[#D8C7A3] text-[#181816] hover:bg-[#D8C7A3] text-[#181816] text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-none cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
