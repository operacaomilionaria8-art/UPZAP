import React, { useState } from 'react';
import {
  WifiOff,
  ServerCrash,
  Smartphone,
  AlertTriangle,
  RefreshCw,
  Volume2,
  VolumeX,
  ChevronRight,
  X
} from 'lucide-react';
import { useSystemAlerts } from '../context/SystemAlertsContext';

interface GlobalAlertBannerProps {
  onNavigateToMonitoring: () => void;
}

export const GlobalAlertBanner: React.FC<GlobalAlertBannerProps> = ({ onNavigateToMonitoring }) => {
  const {
    connections,
    activeAlerts,
    soundSettings,
    setSoundEnabled,
    unlockAudio,
    forceReconnectWhatsApp
  } = useSystemAlerts();

  const [reconnecting, setReconnecting] = useState(false);
  const [unlockingAudio, setUnlockingAudio] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  // Determina se há alertas graves
  const isInternetDown = !connections.internet;
  const isServerDown = connections.internet && !connections.server;
  const isWhatsAppDown = connections.server && connections.whatsapp !== 'connected';

  // Alertas ativos não descartados
  const relevantAlerts = activeAlerts.filter(a => !dismissedKeys.has(a.id));

  const hasUrgentIssue = isInternetDown || isServerDown || isWhatsAppDown || relevantAlerts.length > 0 || soundSettings.isBlocked;

  if (!hasUrgentIssue) return null;

  const handleReconnect = async () => {
    setReconnecting(true);
    await forceReconnectWhatsApp();
    setReconnecting(false);
  };

  const handleUnlockAudio = async () => {
    setUnlockingAudio(true);
    await unlockAudio();
    setUnlockingAudio(false);
  };

  const isAudioBlockedOnly = soundSettings.isBlocked && !isInternetDown && !isServerDown && !isWhatsAppDown && relevantAlerts.length === 0;

  return (
    <div className={`w-full border-b px-4 py-2.5 text-xs text-foreground transition-all animate-fadeIn ${
      isAudioBlockedOnly ? 'bg-amber-500/10 border-amber-500/20' : 'bg-destructive/15 border-destructive/30'
    }`}>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            isAudioBlockedOnly ? 'bg-amber-500/20 text-amber-500' : 'bg-destructive/20 text-destructive animate-pulse'
          }`}>
            {isInternetDown ? (
              <WifiOff className="h-3.5 w-3.5" />
            ) : isServerDown ? (
              <ServerCrash className="h-3.5 w-3.5" />
            ) : isWhatsAppDown ? (
              <Smartphone className="h-3.5 w-3.5" />
            ) : soundSettings.isBlocked ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
          </span>

          <div className="truncate">
            <span className={`font-semibold mr-1.5 ${isAudioBlockedOnly ? 'text-amber-500' : 'text-destructive'}`}>
              {isInternetDown
                ? 'Conexão Offline:'
                : isServerDown
                ? 'Servidor Inacessível:'
                : isWhatsAppDown
                ? 'WhatsApp Desconectado:'
                : soundSettings.isBlocked
                ? 'Aviso Sonoro Bloqueado:'
                : 'Alerta Operacional:'}
            </span>
            <span className="text-muted-foreground">
              {isInternetDown
                ? 'Seu computador está sem acesso à internet. Restabeleça o Wi-Fi ou cabo de rede.'
                : isServerDown
                ? 'O servidor UpZap não está respondendo. Verifique o processo Node/PM2.'
                : isWhatsAppDown
                ? connections.reconnectState === 'reconnecting'
                  ? `Tentativa ${connections.reconnectAttempts}/10 de reconexão automática em andamento...`
                  : 'O robô não pode enviar ou receber mensagens enquanto desconectado.'
                : soundSettings.isBlocked
                ? 'O navegador bloqueou o áudio automático. Clique em "Ativar Áudio" para liberar os alertas.'
                : relevantAlerts[0]?.title || 'Verifique a Central de Monitoramento para detalhes.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {soundSettings.isBlocked && (
            <button
              type="button"
              onClick={handleUnlockAudio}
              disabled={unlockingAudio}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Volume2 className="h-3 w-3" />
              {unlockingAudio ? 'Ativando...' : 'Ativar Áudio'}
            </button>
          )}

          {isWhatsAppDown && (
            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnecting}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${reconnecting ? 'animate-spin' : ''}`} />
              {reconnecting ? 'Reconectando...' : 'Reconectar'}
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateToMonitoring}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-medium text-xs transition-colors cursor-pointer ${
              isAudioBlockedOnly
                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-500'
                : 'bg-destructive/20 hover:bg-destructive/30 text-destructive'
            }`}
          >
            Central de Monitoramento
            <ChevronRight className="h-3 w-3" />
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundSettings.soundEnabled)}
            title={soundSettings.soundEnabled ? 'Silenciar avisos sonoros' : 'Ativar avisos sonoros'}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
          >
            {soundSettings.soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
