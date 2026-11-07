import React, { useState } from 'react';
import {
  Download,
  Upload,
  Database,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { PageIntro, Panel, Badge } from './v0-ui';
import { BaseOficialUpZap } from '../types/upzap';

interface BackupViewProps {
  base?: BaseOficialUpZap;
}

export const BackupView: React.FC<BackupViewProps> = ({ base }) => {
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      let rules = [];
      let specialWords = [];
      let flows = [];
      let eventMappings = [];
      let conversationSettings = null;

      try {
        const rRes = await fetch('/api/rules');
        if (rRes.ok) rules = (await rRes.json()).rules || [];
      } catch {}

      try {
        const swRes = await fetch('/api/special-words');
        if (swRes.ok) {
          const swJson = await swRes.json();
          specialWords = swJson.words || swJson.specialWords || [];
        }
      } catch {}

      try {
        const fRes = await fetch('/api/flows');
        if (fRes.ok) {
          const fJson = await fRes.json();
          flows = fJson.fluxos || fJson.flows || [];
        }
      } catch {}

      try {
        const emRes = await fetch('/api/event-mappings');
        if (emRes.ok) eventMappings = await emRes.json();
      } catch {}

      try {
        const csRes = await fetch('/api/conversations/settings');
        if (csRes.ok) {
          const csJson = await csRes.json();
          conversationSettings = csJson.settings || csJson;
        }
      } catch {}

      const backupData = {
        version: '3.0',
        timestamp: new Date().toISOString(),
        conversationSettings,
        rules,
        flows,
        eventMappings,
        words: specialWords,
        specialWords
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `upzap-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setFeedback({ type: 'success', message: 'Backup gerado e baixado com sucesso!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Erro ao exportar: ${err.message}` });
    } finally {
      setExporting(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoring(true);
    setFeedback(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // 1. Restaurar Regras
        if (parsed.rules && Array.isArray(parsed.rules)) {
          await fetch('/api/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules: parsed.rules })
          });
        }

        // 2. Restaurar Palavras Especiais
        const swList = parsed.words || parsed.specialWords;
        if (swList && Array.isArray(swList)) {
          await fetch('/api/special-words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: swList })
          });
        }

        // 3. Restaurar Fluxos de Automação
        const flowsList = parsed.flows || parsed.fluxos;
        if (flowsList && Array.isArray(flowsList)) {
          await fetch('/api/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fluxos: flowsList })
          });
        }

        // 4. Restaurar Mapeamento de Eventos Brizex
        if (parsed.eventMappings && Array.isArray(parsed.eventMappings)) {
          await fetch('/api/event-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.eventMappings)
          });
        }

        // 4. Restaurar Configurações de Conversas no Backend
        if (parsed.conversationSettings) {
          await fetch('/api/conversations/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.conversationSettings)
          });
        }

        setFeedback({ type: 'success', message: 'Configurações restauradas com sucesso!' });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err: any) {
        setFeedback({ type: 'error', message: `Arquivo de backup inválido: ${err.message}` });
      } finally {
        setRestoring(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Backup</h1>
        <PageIntro className="mb-0 mt-1">
          Exporte e restaure toda a configuração — regras, fluxos, mapeamento de eventos e parâmetros operacionais.
        </PageIntro>
      </div>

      {feedback && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg p-3 text-xs ${
            feedback.type === 'success'
              ? 'bg-accent text-accent-foreground'
              : 'bg-red-500/15 text-red-400'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Exportar */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Exportar</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Baixe um snapshot completo</p>
            </div>
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="p-5">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar configuração
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Gera um arquivo .json com todas as configurações atuais do UpZap.
            </p>
          </div>
        </section>

        {/* Restaurar */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Restaurar</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Envie um arquivo de backup</p>
            </div>
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div className="p-5">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-center transition-colors hover:bg-secondary/40">
              {restoring ? (
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              ) : (
                <Database className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">Arraste ou selecione um .json</span>
              <span className="text-xs text-muted-foreground">
                A configuração atual será substituída com segurança
              </span>
              <input
                type="file"
                accept="application/json"
                onChange={handleFileRestore}
                disabled={restoring}
                className="hidden"
              />
            </label>
          </div>
        </section>
      </div>

      {/* Backups Automáticos */}
      <div className="mt-4">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Backups automáticos</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Snapshot diário programado</p>
            </div>
            <Badge tone="green" dot>
              Ativo
            </Badge>
          </div>
          <div className="p-5">
            <ul className="flex flex-col divide-y divide-border">
              <li className="flex items-center gap-3 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">snapshot-persistente-atual.json</p>
                  <p className="text-xs text-muted-foreground">Sincronizado automaticamente · LocalStorage & Disk</p>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  Baixar cópia
                </button>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};
