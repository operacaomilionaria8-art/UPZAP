import React, { useState, useEffect } from 'react';
import {
  Timer,
  Clock,
  ShieldCheck,
  PhoneOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  KeyRound
} from 'lucide-react';
import { PageIntro, Panel } from './v0-ui';
import { BaseOficialUpZap } from '../types/upzap';
import { AuthUser, authFetch } from '../lib/api';

interface ConfiguracoesViewProps {
  base?: BaseOficialUpZap;
  currentUser?: AuthUser | null;
  onReset?: () => void;
  onNavigateToTab?: (tab: any) => void;
}

export const ConfiguracoesView: React.FC<ConfiguracoesViewProps> = ({ currentUser }) => {
  const [delayHumano, setDelayHumano] = useState(true);
  const [tempoDigitacao, setTempoDigitacao] = useState(2);
  const [encerramentoAuto, setEncerramentoAuto] = useState(30);

  const [protecaoLoop, setProtecaoLoop] = useState(true);
  const [antiDuplicacao, setAntiDuplicacao] = useState(true);
  const [bloquearChamadas, setBloquearChamadas] = useState(true);

  // Estados de Alteração de Senha Própria
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    // 1. Carregar configurações de conversas do backend (/api/conversations/settings)
    fetch('/api/conversations/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = d?.settings || d;
        if (s) {
          if (s.delayHumano !== undefined) setDelayHumano(Boolean(s.delayHumano));
          if (typeof s.tempoDigitacao === 'number') setTempoDigitacao(s.tempoDigitacao);
          if (typeof s.inactivityCloseMinutes === 'number' && s.inactivityCloseMinutes > 0) {
            setEncerramentoAuto(s.inactivityCloseMinutes);
          }
          if (s.loopProtectionEnabled !== undefined) setProtecaoLoop(Boolean(s.loopProtectionEnabled));
        }
      })
      .catch((err) => console.warn('[ConfiguracoesView] Erro ao buscar /api/conversations/settings:', err));

    // 2. Carregar configurações de chamadas do backend
    fetch('/api/calls/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.enabled !== undefined) {
          setBloquearChamadas(d.enabled);
        }
      })
      .catch(() => {});

    // 3. Fallback/cache local
    const saved = localStorage.getItem('upzap_geral_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.encerramentoAuto !== undefined) setEncerramentoAuto(parsed.encerramentoAuto);
        if (parsed.antiDuplicacao !== undefined) setAntiDuplicacao(parsed.antiDuplicacao);
      } catch {}
    }
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'A confirmação não coincide com a nova senha.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordFeedback({ type: 'error', message: 'A nova senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPasswordFeedback({ type: 'error', message: data.error || 'Erro ao alterar senha.' });
      } else {
        setPasswordFeedback({ type: 'success', message: 'Sua senha foi alterada com sucesso!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setPasswordFeedback({ type: 'error', message: 'Erro ao conectar ao servidor.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      // 1. Persiste no backend em /api/conversations/settings (delay e motor real)
      const convRes = await fetch('/api/conversations/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delayHumano,
          tempoDigitacao,
          inactivityCloseMinutes: encerramentoAuto,
          loopProtectionEnabled: protecaoLoop
        })
      });

      if (!convRes.ok) {
        console.warn('[ConfiguracoesView] Aviso ao salvar configurações de conversas:', convRes.status);
      }

      // 2. Sincronizar bloqueio de chamadas no backend
      await fetch('/api/calls/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: bloquearChamadas })
      });

      // 3. Salvar preferências de visualização no localStorage
      localStorage.setItem(
        'upzap_geral_settings',
        JSON.stringify({
          delayHumano,
          tempoDigitacao,
          encerramentoAuto,
          protecaoLoop,
          antiDuplicacao,
          bloquearChamadas
        })
      );

      setFeedback({ type: 'success', message: 'Configurações persistidas e aplicadas com sucesso no backend!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Erro: ${err.message}` });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Geral</h1>
        <PageIntro className="mb-0 mt-1">
          Ajustes gerais de comportamento do atendimento e proteções do sistema.
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

      <div className="flex flex-col gap-4">
        {/* Painel Atendimento */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Atendimento</h2>
            </div>
          </div>
          <div className="p-5">
            <ul className="flex flex-col divide-y divide-border">
              {/* Delay humano */}
              <li className="flex items-center justify-between gap-4 py-3.5">
                <span className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Timer className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">Delay humano</span>
                    <span className="block text-xs text-muted-foreground">
                      Simula digitação antes de responder
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setDelayHumano(!delayHumano)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                    delayHumano ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      delayHumano ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </li>

              {/* Tempo de digitação */}
              <li className="flex items-center justify-between gap-4 py-3.5">
                <span className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">Tempo de digitação</span>
                    <span className="block text-xs text-muted-foreground">
                      Duração do “digitando...” em segundos
                    </span>
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={tempoDigitacao}
                  onChange={(e) => setTempoDigitacao(Number(e.target.value))}
                  className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-center text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </li>

              {/* Encerramento automático */}
              <li className="flex items-center justify-between gap-4 py-3.5">
                <span className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">Encerramento automático</span>
                    <span className="block text-xs text-muted-foreground">
                      Minutos de inatividade até finalizar
                    </span>
                  </span>
                </span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={encerramentoAuto}
                  onChange={(e) => setEncerramentoAuto(Number(e.target.value))}
                  className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-center text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </li>
            </ul>
          </div>
        </section>

        {/* Painel Proteções */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Proteções</h2>
            </div>
          </div>
          <div className="p-5">
            <ul className="flex flex-col divide-y divide-border">
              {/* Proteção contra loops */}
              <li className="flex items-center justify-between gap-4 py-3.5">
                <span className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">Proteção contra loops</span>
                    <span className="block text-xs text-muted-foreground">
                      Pausa o contato ao detectar ciclos entre regras
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setProtecaoLoop(!protecaoLoop)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                    protecaoLoop ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      protecaoLoop ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </li>

              {/* Anti-duplicação */}
              <li className="flex items-center justify-between gap-4 py-3.5">
                <span className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">Anti-duplicação</span>
                    <span className="block text-xs text-muted-foreground">
                      Ignora mensagens repetidas em curto intervalo
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setAntiDuplicacao(!antiDuplicacao)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                    antiDuplicacao ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      antiDuplicacao ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </li>

              {/* Bloquear chamadas */}
              <li className="flex items-center justify-between gap-4 py-3.5">
                <span className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <PhoneOff className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">Bloquear chamadas</span>
                    <span className="block text-xs text-muted-foreground">
                      Recusa voz/vídeo, avisa e registra no log
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setBloquearChamadas(!bloquearChamadas)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                    bloquearChamadas ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      bloquearChamadas ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </li>
            </ul>
          </div>
        </section>

        {/* Painel: Segurança da Própria Conta */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold tracking-tight">Alterar Minha Senha</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Atualize sua senha de acesso individual ao painel UpZap.
              </p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="p-5 space-y-4">
            {passwordFeedback && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  passwordFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}
              >
                {passwordFeedback.message}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Senha Atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Sua senha atual"
                  required
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Nova Senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Confirmar Nova Senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  required
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={changingPassword}
                className="rounded-lg bg-secondary border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors cursor-pointer disabled:opacity-50"
              >
                {changingPassword ? 'Alterando senha...' : 'Atualizar Senha'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1 inline" />}
          Salvar configurações
        </button>
      </div>
    </div>
  );
};
