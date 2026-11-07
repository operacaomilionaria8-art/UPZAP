import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { InternalAlert, AlertSoundEvent } from '../types/upzap';
import { alertAudioService } from '../lib/sound-alerts';

export interface ConnectionStates {
  internet: boolean;
  server: boolean;
  serverLatencyMs: number | null;
  whatsapp: 'connected' | 'connecting' | 'disconnected' | 'error';
  whatsappPhone: string | null;
  whatsappUserName: string | null;
  reconnectAttempts: number;
  reconnectState: 'idle' | 'reconnecting' | 'reconnect_failed';
  brizex: 'ok' | 'warning' | 'error';
}

interface SystemAlertsContextType {
  connections: ConnectionStates;
  activeAlerts: InternalAlert[];
  resolvedAlerts: InternalAlert[];
  soundSettings: { soundEnabled: boolean; soundVolume: number; isBlocked: boolean; isPlaying: boolean };
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  testSound: (event?: AlertSoundEvent) => Promise<boolean>;
  unlockAudio: () => Promise<boolean>;
  resolveAlert: (keyOrId: string, recoveryResult?: string) => Promise<boolean>;
  forceReconnectWhatsApp: () => Promise<{ success: boolean; message: string }>;
  refreshAlerts: () => Promise<void>;
}

const SystemAlertsContext = createContext<SystemAlertsContextType | null>(null);

export const SystemAlertsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connections, setConnections] = useState<ConnectionStates>({
    internet: typeof navigator !== 'undefined' ? navigator.onLine : true,
    server: true,
    serverLatencyMs: null,
    whatsapp: 'disconnected',
    whatsappPhone: null,
    whatsappUserName: null,
    reconnectAttempts: 0,
    reconnectState: 'idle',
    brizex: 'ok'
  });

  const [activeAlerts, setActiveAlerts] = useState<InternalAlert[]>([]);
  const [resolvedAlerts, setResolvedAlerts] = useState<InternalAlert[]>([]);
  const [soundSettingsState, setSoundSettingsState] = useState(() => alertAudioService.getSettings());

  // Rastreamento de transições e deduplicação de alertas sonoros
  const soundedAlertKeysRef = useRef<Set<string>>(new Set());
  const prevConnectionsRef = useRef<ConnectionStates>(connections);
  const consecutiveServerFailsRef = useRef<number>(0);
  const isCheckingRef = useRef(false);

  // Inscreve no alertAudioService para sincronizar estado de áudio (volume, bloqueio, reprodução)
  useEffect(() => {
    const unsubscribe = alertAudioService.subscribe(() => {
      setSoundSettingsState(alertAudioService.getSettings());
    });
    return unsubscribe;
  }, []);

  const setSoundEnabled = (enabled: boolean) => {
    alertAudioService.setSettings(enabled, soundSettingsState.soundVolume);
    setSoundSettingsState(alertAudioService.getSettings());
    fetch('/api/alerts/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soundEnabled: enabled })
    }).catch(() => {});
  };

  const setSoundVolume = (volume: number) => {
    alertAudioService.setSettings(soundSettingsState.soundEnabled, volume);
    setSoundSettingsState(alertAudioService.getSettings());
    fetch('/api/alerts/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soundVolume: volume })
    }).catch(() => {});
  };

  const testSound = async (event?: AlertSoundEvent) => {
    return alertAudioService.testSound(event);
  };

  const unlockAudio = async () => {
    return alertAudioService.unlockAudio();
  };

  const fetchActiveAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/active');
      if (res.ok) {
        const data = await res.json();
        const incomingActive: InternalAlert[] = Array.isArray(data.active) ? data.active : [];
        const incomingResolved: InternalAlert[] = Array.isArray(data.resolved) ? data.resolved : [];

        setActiveAlerts(incomingActive);
        setResolvedAlerts(incomingResolved);

        // Processa novos alertas ativos para disparo de áudio
        incomingActive.forEach((alert) => {
          if (!soundedAlertKeysRef.current.has(alert.key)) {
            soundedAlertKeysRef.current.add(alert.key);

            // Mapeia para o áudio correspondente
            if (alert.soundEvent) {
              alertAudioService.playSound(alert.soundEvent);
            } else if (alert.origin === 'brizex') {
              alertAudioService.playSound('brizex_indisponivel');
            } else if (alert.origin === 'automacao') {
              alertAudioService.playSound('fluxo_falhou');
            } else if (alert.severity === 'critical') {
              alertAudioService.playSound('erro_critico');
            } else {
              alertAudioService.playSound('erro_critico');
            }
          }
        });

        // Limpa chaves de alertas que já foram resolvidos
        const activeKeys = new Set(incomingActive.map(a => a.key));
        soundedAlertKeysRef.current.forEach((k) => {
          if (!activeKeys.has(k) && k !== 'internet_offline' && k !== 'server_unreachable' && k !== 'whatsapp_disconnected') {
            soundedAlertKeysRef.current.delete(k);
          }
        });
      }
    } catch {
      // Falha de rede capturada pelo health check do servidor
    }
  }, []);

  const resolveAlert = async (keyOrId: string, recoveryResult?: string): Promise<boolean> => {
    try {
      const alertTarget = activeAlerts.find(a => a.key === keyOrId || a.id === keyOrId);
      const res = await fetch('/api/alerts/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyOrId, recoveryResult })
      });

      if (res.ok) {
        soundedAlertKeysRef.current.delete(keyOrId);
        await fetchActiveAlerts();

        // Reproduz áudio de recuperação correspondente
        if (alertTarget?.recoverySoundEvent) {
          alertAudioService.playSound(alertTarget.recoverySoundEvent);
        } else if (alertTarget?.origin === 'brizex') {
          alertAudioService.playSound('integracao_restabelecida');
        } else {
          alertAudioService.playSound('reconexao_concluida');
        }
        return true;
      }
    } catch (e) {
      console.warn('Erro ao resolver alerta:', e);
    }
    return false;
  };

  const forceReconnectWhatsApp = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/whatsapp/force-reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        await checkConnectivity();
        return { success: true, message: 'Reconexão solicitada com sucesso!' };
      }
      return { success: false, message: data?.message || 'Falha ao solicitar reconexão.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro de comunicação.' };
    }
  };

  const checkConnectivity = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    // Validação preventiva: testa se o navegador consegue fazer requisição
    const startPing = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('/api/monitoring/status', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const latency = Math.round(performance.now() - startPing);

      if (res.ok) {
        // Servidor e internet confirmados 100% funcionais
        consecutiveServerFailsRef.current = 0;

        // Se a internet estava desconectada e agora recuperou:
        if (soundedAlertKeysRef.current.has('internet_offline')) {
          soundedAlertKeysRef.current.delete('internet_offline');
          alertAudioService.playSound('internet_restabelecida');
        }

        // Se o servidor estava indisponível e agora recuperou:
        if (soundedAlertKeysRef.current.has('server_unreachable')) {
          soundedAlertKeysRef.current.delete('server_unreachable');
          alertAudioService.playSound('reconexao_concluida');
        }

        const data = await res.json();
        const wa = data?.status?.whatsapp || {};
        const newWaState = wa.state || 'disconnected';
        const prevWaState = prevConnectionsRef.current.whatsapp;

        // Transição de estado do WhatsApp
        if (prevWaState !== 'connected' && newWaState === 'connected') {
          // Reconexão confirmada e validada
          soundedAlertKeysRef.current.delete('whatsapp_disconnected');
          alertAudioService.playSound('whatsapp_reconectado');
        } else if (prevWaState === 'connected' && (newWaState === 'disconnected' || newWaState === 'error')) {
          // Desconexão real detectada
          if (!soundedAlertKeysRef.current.has('whatsapp_disconnected')) {
            soundedAlertKeysRef.current.add('whatsapp_disconnected');
            alertAudioService.playSound('whatsapp_desconectado');
          }
        }
        // OBSERVAÇÃO CRÍTICA: quando newWaState === 'connecting', NÃO emite áudio (whatsapp_reconectando suprimido)

        setConnections({
          internet: true,
          server: true,
          serverLatencyMs: latency,
          whatsapp: newWaState,
          whatsappPhone: wa.phoneNumber || null,
          whatsappUserName: wa.userName || null,
          reconnectAttempts: wa.reconnectAttempts || 0,
          reconnectState: wa.reconnectState || 'idle',
          brizex: 'ok'
        });

        prevConnectionsRef.current = {
          internet: true,
          server: true,
          serverLatencyMs: latency,
          whatsapp: newWaState,
          whatsappPhone: wa.phoneNumber || null,
          whatsappUserName: wa.userName || null,
          reconnectAttempts: wa.reconnectAttempts || 0,
          reconnectState: wa.reconnectState || 'idle',
          brizex: 'ok'
        };

        await fetchActiveAlerts();
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      consecutiveServerFailsRef.current += 1;

      // Distinção precisa: se navigator.onLine for false, a internet física caiu
      if (!navOnline) {
        setConnections(prev => ({
          ...prev,
          internet: false,
          server: false,
          serverLatencyMs: null
        }));

        if (!soundedAlertKeysRef.current.has('internet_offline')) {
          soundedAlertKeysRef.current.add('internet_offline');
          alertAudioService.playSound('internet_desconectada');
        }
      } else {
        // Internet está ativa no navegador, mas o servidor UpZap não respondeu (2 falhas consecutivas para evitar jitter transitório)
        if (consecutiveServerFailsRef.current >= 2) {
          setConnections(prev => ({
            ...prev,
            internet: true,
            server: false,
            serverLatencyMs: null
          }));

          if (!soundedAlertKeysRef.current.has('server_unreachable')) {
            soundedAlertKeysRef.current.add('server_unreachable');
            alertAudioService.playSound('servidor_indisponivel');
          }
        }
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, [fetchActiveAlerts]);

  useEffect(() => {
    checkConnectivity();
    const interval = setInterval(checkConnectivity, 15000);

    const handleOnline = () => {
      checkConnectivity();
    };

    const handleOffline = () => {
      setConnections(prev => ({ ...prev, internet: false, server: false }));
      if (!soundedAlertKeysRef.current.has('internet_offline')) {
        soundedAlertKeysRef.current.add('internet_offline');
        alertAudioService.playSound('internet_desconectada');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnectivity]);

  return (
    <SystemAlertsContext.Provider
      value={{
        connections,
        activeAlerts,
        resolvedAlerts,
        soundSettings: soundSettingsState,
        setSoundEnabled,
        setSoundVolume,
        testSound,
        unlockAudio,
        resolveAlert,
        forceReconnectWhatsApp,
        refreshAlerts: checkConnectivity
      }}
    >
      {children}
    </SystemAlertsContext.Provider>
  );
};

export const useSystemAlerts = () => {
  const context = useContext(SystemAlertsContext);
  if (!context) {
    throw new Error('useSystemAlerts must be used within a SystemAlertsProvider');
  }
  return context;
};
