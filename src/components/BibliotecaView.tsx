import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  X,
  Search,
  ExternalLink,
  Eye,
  Filter,
  Play,
  FileUp,
  Workflow
} from 'lucide-react';
import { PageIntro, Panel, Badge } from './v0-ui';
import { BaseOficialUpZap } from '../types/upzap';
import { authFetch } from '../lib/api';

export interface LibraryFile {
  id: string;
  name: string;
  fileName?: string;
  size: string;
  type: 'pdf' | 'foto' | 'audio' | 'video' | 'imagem';
  mimetype?: string;
  url: string;
  category?: string;
  updatedAt?: string;
}

interface BibliotecaViewProps {
  base?: BaseOficialUpZap;
  onNavigateToFlows?: () => void;
}

export const BibliotecaView: React.FC<BibliotecaViewProps> = ({ onNavigateToFlows }) => {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'todos' | 'foto' | 'video' | 'audio' | 'pdf'>('todos');
  
  // Modal de Prévia
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null);

  // Notificações e feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Carregar arquivos persistentes da biblioteca
  const fetchFiles = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/library/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar arquivos da biblioteca:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // Upload de arquivo persistente (PDF, Imagem, Vídeo ou Áudio)
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFile = (file: File) => {
    const fileName = file.name;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    let detectedType: 'foto' | 'audio' | 'video' | 'pdf' = 'pdf';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      detectedType = 'foto';
    } else if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) {
      detectedType = 'video';
    } else if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext)) {
      detectedType = 'audio';
    } else if (ext === 'pdf') {
      detectedType = 'pdf';
    } else {
      showFeedback('Formato não suportado. Envie PDFs, Imagens, Vídeos ou Áudios.', 'error');
      return;
    }

    setUploading(true);
    setFeedback(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const res = await authFetch('/api/library/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fileName,
            fileName: fileName,
            type: detectedType,
            size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            dataUrl
          })
        });

        if (res.ok) {
          showFeedback(`Arquivo "${fileName}" enviado e armazenado com sucesso!`);
          fetchFiles();
        } else {
          const errData = await res.json().catch(() => ({}));
          showFeedback(errData.error || 'Erro ao enviar arquivo para o servidor', 'error');
        }
      } catch (err: any) {
        showFeedback(`Erro ao salvar arquivo: ${err.message}`, 'error');
      } finally {
        setUploading(false);
      }
    };

    reader.onerror = () => {
      setUploading(false);
      showFeedback('Erro ao ler o arquivo no navegador.', 'error');
    };

    reader.readAsDataURL(file);
  };

  // Modal de Confirmação de Exclusão
  const [fileToDelete, setFileToDelete] = useState<LibraryFile | null>(null);
  const [deletingFile, setDeletingFile] = useState<boolean>(false);

  // Abrir modal de exclusão
  const handleOpenDeleteModal = (file: LibraryFile) => {
    setFileToDelete(file);
  };

  // Confirmar exclusão real do arquivo da biblioteca
  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;

    setDeletingFile(true);
    const target = fileToDelete;
    const targetName = target.fileName || target.name;

    try {
      const res = await authFetch(`/api/library/files/${encodeURIComponent(target.id)}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== target.id && f.name !== target.id && f.fileName !== target.fileName));
        if (previewFile?.id === target.id) setPreviewFile(null);
        showFeedback(`Arquivo "${targetName}" excluído com sucesso!`);
        window.dispatchEvent(new CustomEvent('upzap_library_updated'));
        setFileToDelete(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showFeedback(`Erro ao excluir arquivo: ${err.error || 'Erro no servidor'}`, 'error');
      }
    } catch {
      showFeedback('Erro de conexão ao excluir arquivo', 'error');
    } finally {
      setDeletingFile(false);
    }
  };

  // Copiar identificador para usar no Flow Builder
  const handleCopyIdentifier = (file: LibraryFile) => {
    const textToCopy = file.fileName || file.name || file.id;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(file.id);
    showFeedback(`Identificador "${textToCopy}" copiado!`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const getNormalizedType = (type: string): 'foto' | 'video' | 'audio' | 'pdf' => {
    if (type === 'imagem' || type === 'foto') return 'foto';
    if (type === 'video') return 'video';
    if (type === 'audio') return 'audio';
    return 'pdf';
  };

  const getFileBadge = (type: string) => {
    const norm = getNormalizedType(type);
    switch (norm) {
      case 'foto':
        return <Badge variant="success">Imagem</Badge>;
      case 'video':
        return <Badge variant="purple">Vídeo</Badge>;
      case 'audio':
        return <Badge variant="warning">Áudio</Badge>;
      case 'pdf':
        return <Badge variant="red">Documento PDF</Badge>;
    }
  };

  const getFileIcon = (type: string) => {
    const norm = getNormalizedType(type);
    switch (norm) {
      case 'foto':
        return <ImageIcon className="h-6 w-6 text-emerald-400" />;
      case 'video':
        return <Video className="h-6 w-6 text-purple-400" />;
      case 'audio':
        return <Music className="h-6 w-6 text-amber-400" />;
      case 'pdf':
        return <FileText className="h-6 w-6 text-rose-400" />;
    }
  };

  // Filtragem dos arquivos
  const filteredFiles = files.filter((file) => {
    const normType = getNormalizedType(file.type);
    const matchesType = selectedTypeFilter === 'todos' || normType === selectedTypeFilter;
    const name = (file.name || file.fileName || '').toLowerCase();
    const matchesSearch = !searchTerm.trim() || name.includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <PageIntro
        title="Biblioteca de Arquivos"
        description="Repositório exclusivo de mídias persistentes (PDFs, Imagens, Vídeos e Áudios) prontas para envio automático através dos Blocos de Mídia no Flow Builder."
        icon={FileUp}
      />

      {feedback && (
        <div
          className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm transition-all ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Banner de Orientações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5 text-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Armazenamento Persistente de Mídias</h4>
            <p className="text-muted-foreground text-xs">
              Envie arquivos suportados pelo WhatsApp (PDF, Imagens JPG/PNG, Vídeos MP4 e Áudios MP3/OGG). Seus arquivos ficam salvos em disco permanente.
            </p>
          </div>
        </div>

        {onNavigateToFlows && (
          <button
            type="button"
            onClick={onNavigateToFlows}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shrink-0"
          >
            <Workflow className="h-3.5 w-3.5 text-primary" />
            <span>Usar no Flow Builder</span>
          </button>
        )}
      </div>

      {/* Área de Ações e Filtros */}
      <Panel>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Campo de Busca */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar arquivo por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Botão de Upload */}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*,video/*,audio/*"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Enviando arquivo...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Enviar Arquivo</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Abas de Filtros por Formato */}
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border mt-4">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 mr-1">
            <Filter className="h-3.5 w-3.5" /> Filtrar:
          </span>
          {[
            { id: 'todos', label: 'Todos os Arquivos', count: files.length },
            { id: 'foto', label: 'Imagens', count: files.filter((f) => getNormalizedType(f.type) === 'foto').length },
            { id: 'video', label: 'Vídeos', count: files.filter((f) => getNormalizedType(f.type) === 'video').length },
            { id: 'audio', label: 'Áudios', count: files.filter((f) => getNormalizedType(f.type) === 'audio').length },
            { id: 'pdf', label: 'Documentos PDF', count: files.filter((f) => getNormalizedType(f.type) === 'pdf').length }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTypeFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedTypeFilter === tab.id
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                selectedTypeFilter === tab.id ? 'bg-black/20 text-white' : 'bg-background text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </Panel>

      {/* Grid de Arquivos da Biblioteca */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm">Carregando arquivos armazenados na biblioteca...</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3 text-muted-foreground">
            <FileUp className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-foreground text-base">Nenhum arquivo encontrado</h3>
          <p className="text-muted-foreground text-xs max-w-sm mt-1">
            {searchTerm
              ? `Nenhum arquivo coincide com o termo "${searchTerm}".`
              : 'Você ainda não enviou nenhum arquivo para a Biblioteca. Clique no botão acima para enviar seu primeiro PDF, imagem, áudio ou vídeo.'}
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Fazer Upload Agora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFiles.map((file) => {
            const fileName = file.fileName || file.name;
            const normType = getNormalizedType(file.type);
            const isCopied = copiedId === file.id;

            return (
              <div
                key={file.id}
                className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60">
                        {getFileIcon(file.type)}
                      </div>
                      <div className="min-w-0">
                        {getFileBadge(file.type)}
                        <span className="block text-[11px] text-muted-foreground mt-0.5">{file.size}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenDeleteModal(file)}
                      title="Excluir arquivo permanentemente"
                      className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Nome do Arquivo */}
                  <h4
                    className="font-medium text-sm text-foreground truncate select-all"
                    title={fileName}
                  >
                    {fileName}
                  </h4>
                </div>

                {/* Prévia visual rápida se for imagem */}
                {normType === 'foto' && file.url && (
                  <div
                    onClick={() => setPreviewFile(file)}
                    className="mt-3 relative h-28 w-full overflow-hidden rounded-lg bg-muted/40 cursor-pointer group-hover:opacity-90 transition-opacity"
                  >
                    <img
                      src={file.url}
                      alt={fileName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Eye className="h-5 w-5 text-white" />
                    </div>
                  </div>
                )}

                {/* Rodapé do Card com Ações */}
                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewFile(file)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5 text-primary" />
                    <span>Visualizar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyIdentifier(file)}
                    title="Copiar nome do arquivo para usar no Bloco de Mídia"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                  >
                    {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{isCopied ? 'Copiado!' : 'Copiar ID'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Prévia de Mídia */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                {getFileIcon(previewFile.type)}
                <div>
                  <h3 className="font-semibold text-foreground text-sm truncate max-w-md">
                    {previewFile.fileName || previewFile.name}
                  </h3>
                  <span className="text-xs text-muted-foreground">{previewFile.size} • Armazenado persistentemente</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo da Prévia */}
            <div className="flex flex-col items-center justify-center min-h-[240px] max-h-[60vh] overflow-y-auto rounded-xl bg-background/50 p-4 border border-border">
              {getNormalizedType(previewFile.type) === 'foto' && (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[50vh] max-w-full rounded-lg object-contain shadow-md"
                />
              )}

              {getNormalizedType(previewFile.type) === 'video' && (
                <video
                  controls
                  autoPlay
                  src={previewFile.url}
                  className="max-h-[50vh] max-w-full rounded-lg"
                />
              )}

              {getNormalizedType(previewFile.type) === 'audio' && (
                <div className="w-full max-w-md py-6 flex flex-col items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Music className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{previewFile.name}</p>
                  <audio controls src={previewFile.url} className="w-full" autoPlay />
                </div>
              )}

              {getNormalizedType(previewFile.type) === 'pdf' && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <FileText className="h-16 w-16 text-rose-400" />
                  <div>
                    <h4 className="font-medium text-foreground">{previewFile.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Documento PDF pronto para envio automático no WhatsApp
                    </p>
                  </div>
                  <a
                    href={previewFile.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Abrir PDF em nova aba</span>
                  </a>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground font-mono">
                {previewFile.fileName || previewFile.name}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyIdentifier(previewFile)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar ID</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">Excluir arquivo da Biblioteca</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tem certeza que deseja excluir o arquivo{' '}
                  <strong className="text-foreground font-mono">{fileToDelete.fileName || fileToDelete.name}</strong>?
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>
                Esta ação removerá o arquivo permanentemente do armazenamento e desvinculará de quaisquer regras ou blocos associados.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                disabled={deletingFile}
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingFile}
                onClick={handleConfirmDelete}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                {deletingFile ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Excluir Arquivo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
