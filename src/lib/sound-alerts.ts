/**
 * UpZap - Gerenciador Centralizado de Áudios de Alerta
 * 
 * Conecta cada evento operacional ao seu arquivo MP3 correspondente.
 * Implementa fila de reprodução sequencial (sem sobreposição), controle de volume,
 * tratamento de bloqueio de autoplay pelo navegador e fallback sintetizado caso
 * um arquivo de áudio falhe no carregamento.
 * 
 * Regra estrita: O áudio 'whatsapp_reconectando.mp3' NUNCA é executado.
 */

import { AlertSoundEvent } from '../types/upzap';

export interface SoundItemMetadata {
  event: AlertSoundEvent;
  fileName: string;
  label: string;
  description: string;
  category: 'rede' | 'whatsapp' | 'servidor' | 'integracao' | 'automacao';
}

export const ALERT_SOUND_CATALOG: SoundItemMetadata[] = [
  {
    event: 'internet_desconectada',
    fileName: 'internet_desconectada.mp3',
    label: 'Internet Desconectada',
    description: 'Perda confirmada da conexão com a internet.',
    category: 'rede'
  },
  {
    event: 'internet_restabelecida',
    fileName: 'internet_restabelecida.mp3',
    label: 'Internet Restabelecida',
    description: 'Recuperação confirmada da conectividade após interrupção.',
    category: 'rede'
  },
  {
    event: 'whatsapp_desconectado',
    fileName: 'whatsapp_desconectado.mp3',
    label: 'WhatsApp Desconectado',
    description: 'Desconexão real da sessão do WhatsApp utilizada pelo UpZap.',
    category: 'whatsapp'
  },
  {
    event: 'whatsapp_reconectado',
    fileName: 'whatsapp_reconectado.mp3',
    label: 'WhatsApp Reconectado',
    description: 'Reconexão confirmada e sessão WhatsApp 100% funcional.',
    category: 'whatsapp'
  },
  {
    event: 'servidor_indisponivel',
    fileName: 'servidor_indisponivel.mp3',
    label: 'Servidor Indisponível',
    description: 'Indisponibilidade confirmada do serviço UpZap.',
    category: 'servidor'
  },
  {
    event: 'brizex_indisponivel',
    fileName: 'brizex_indisponivel.mp3',
    label: 'Brizex Indisponível',
    description: 'Falha confirmada de comunicação com a integração Brizex / Logzz.',
    category: 'integracao'
  },
  {
    event: 'pedido_sincronizacao_falhou',
    fileName: 'pedido_sincronizacao_falhou.mp3',
    label: 'Falha de Sincronização de Pedido',
    description: 'Falha real e não recuperada na sincronização de um pedido.',
    category: 'integracao'
  },
  {
    event: 'fluxo_falhou',
    fileName: 'fluxo_falhou.mp3',
    label: 'Falha em Fluxo de Automação',
    description: 'Falha real na execução de um fluxo de automação.',
    category: 'automacao'
  },
  {
    event: 'erro_critico',
    fileName: 'erro_critico.mp3',
    label: 'Erro Crítico do Sistema',
    description: 'Erro crítico confirmado que exige atenção imediata.',
    category: 'servidor'
  },
  {
    event: 'reconexao_concluida',
    fileName: 'reconexao_concluida.mp3',
    label: 'Reconexão Concluída',
    description: 'Recuperação confirmada de conexão ou serviço restaurado.',
    category: 'rede'
  },
  {
    event: 'integracao_restabelecida',
    fileName: 'integracao_restabelecida.mp3',
    label: 'Integração Restabelecida',
    description: 'Comunicação com integração externa restabelecida e validada.',
    category: 'integracao'
  }
];

class AlertAudioManager {
  private soundEnabled: boolean = true;
  private soundVolume: number = 0.75;
  private isBlockedByBrowser: boolean = false;
  private isUnlocked: boolean = false;

  // Fila de reprodução sequencial para evitar sobreposição de áudios
  private playbackQueue: AlertSoundEvent[] = [];
  private isPlaying: boolean = false;
  private currentAudioElement: HTMLAudioElement | null = null;
  private lastPlayedTimeMap: Map<AlertSoundEvent, number> = new Map();

  // Listeners para notificar a UI sobre estado de bloqueio e reprodução
  private stateListeners: Set<() => void> = new Set();

  constructor() {
    this.loadPreferences();
    this.attachAutoUnlockListeners();
  }

  public subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private notifyListeners(): void {
    this.stateListeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  private loadPreferences(): void {
    if (typeof window === 'undefined') return;
    try {
      const savedEnabled = localStorage.getItem('upzap_sound_alerts_enabled');
      if (savedEnabled !== null) {
        this.soundEnabled = savedEnabled === 'true';
      }
      const savedVolume = localStorage.getItem('upzap_sound_alerts_volume');
      if (savedVolume !== null) {
        const v = parseFloat(savedVolume);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          this.soundVolume = v;
        }
      }
    } catch {}
  }

  private attachAutoUnlockListeners(): void {
    if (typeof window === 'undefined') return;
    const unlockHandler = () => {
      this.unlockAudio();
      window.removeEventListener('click', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
      window.removeEventListener('touchstart', unlockHandler);
    };

    window.addEventListener('click', unlockHandler, { once: true });
    window.addEventListener('keydown', unlockHandler, { once: true });
    window.addEventListener('touchstart', unlockHandler, { once: true });
  }

  public getSettings(): { soundEnabled: boolean; soundVolume: number; isBlocked: boolean; isPlaying: boolean } {
    return {
      soundEnabled: this.soundEnabled,
      soundVolume: this.soundVolume,
      isBlocked: this.isBlockedByBrowser,
      isPlaying: this.isPlaying
    };
  }

  public setSettings(enabled: boolean, volume: number): void {
    this.soundEnabled = enabled;
    this.soundVolume = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem('upzap_sound_alerts_enabled', String(this.soundEnabled));
      localStorage.setItem('upzap_sound_alerts_volume', String(this.soundVolume));
    } catch {}
    this.notifyListeners();
  }

  /**
   * Desbloqueia o contexto de áudio do navegador após interação
   */
  public async unlockAudio(): Promise<boolean> {
    this.isUnlocked = true;
    this.isBlockedByBrowser = false;
    this.notifyListeners();
    return true;
  }

  /**
   * Enfileira a reprodução de um evento de áudio, com verificação de debounce
   */
  public async playSound(event: AlertSoundEvent, options?: { force?: boolean }): Promise<boolean> {
    // Proibição estrita: jamais reproduz whatsapp_reconectando
    if ((event as any) === 'whatsapp_reconectando') {
      console.log('[AlertAudioService] ℹ️ Áudio whatsapp_reconectando suprimido conforme regra estrita.');
      return false;
    }

    if (!this.soundEnabled || this.soundVolume <= 0) {
      return false;
    }

    const now = Date.now();
    const lastPlayed = this.lastPlayedTimeMap.get(event) || 0;

    // Prevenção de duplicatas rápidas: não repete o mesmo evento sonoro em menos de 4 segundos, a menos que forçado
    if (!options?.force && now - lastPlayed < 4000) {
      console.log(`[AlertAudioService] ⏳ Áudio "${event}" ignorado por debounce anti-flood.`);
      return false;
    }

    this.lastPlayedTimeMap.set(event, now);

    // Adiciona à fila de reprodução
    this.playbackQueue.push(event);
    this.processQueue();
    return true;
  }

  /**
   * Processa a fila de áudios sequencialmente para não haver cacofonia
   */
  private async processQueue(): Promise<void> {
    if (this.isPlaying || this.playbackQueue.length === 0) {
      return;
    }

    const nextEvent = this.playbackQueue.shift();
    if (!nextEvent) return;

    this.isPlaying = true;
    this.notifyListeners();

    try {
      await this.executeAudioPlayback(nextEvent);
    } catch (err) {
      console.warn(`[AlertAudioService] Erro ao reproduzir "${nextEvent}":`, err);
    } finally {
      this.isPlaying = false;
      this.notifyListeners();

      // Pequena pausa de 200ms entre áudios consecutivos
      if (this.playbackQueue.length > 0) {
        setTimeout(() => this.processQueue(), 200);
      }
    }
  }

  /**
   * Executa a reprodução física do arquivo MP3 com fallback sintetizado
   */
  private executeAudioPlayback(event: AlertSoundEvent): Promise<void> {
    return new Promise((resolve) => {
      const metadata = ALERT_SOUND_CATALOG.find((item) => item.event === event);
      const fileName = metadata?.fileName || `${event}.mp3`;
      const audioUrl = `/audio/${fileName}`;

      const audio = new Audio(audioUrl);
      this.currentAudioElement = audio;
      audio.volume = this.soundVolume;

      let hasResolved = false;
      const finish = () => {
        if (!hasResolved) {
          hasResolved = true;
          this.currentAudioElement = null;
          resolve();
        }
      };

      // Limite máximo de segurança de 5 segundos para não prender a fila
      const timeoutId = setTimeout(() => {
        finish();
      }, 5000);

      audio.onended = () => {
        clearTimeout(timeoutId);
        finish();
      };

      audio.onerror = (e) => {
        clearTimeout(timeoutId);
        console.warn(`[AlertAudioService] ⚠️ Arquivo "${audioUrl}" falhou ao carregar. Ativando fallback de áudio sintetizado.`, e);
        this.playSynthesizedFallback(event).finally(finish);
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isBlockedByBrowser = false;
            this.notifyListeners();
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            if (err.name === 'NotAllowedError') {
              console.warn('[AlertAudioService] 🔇 Reprodução bloqueada pela política de autoplay do navegador.');
              this.isBlockedByBrowser = true;
              this.notifyListeners();
            } else {
              console.warn('[AlertAudioService] Erro de reprodução HTML5 Audio:', err.message);
              this.playSynthesizedFallback(event).finally(finish);
              return;
            }
            finish();
          });
      }
    });
  }

  /**
   * Fallback via Web Audio API caso o arquivo MP3 esteja temporariamente indisponível ou inacessível
   */
  private async playSynthesizedFallback(event: AlertSoundEvent): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const isRecovery = event.includes('restabelecid') || event.includes('reconectad') || event.includes('concluid');
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isRecovery ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(isRecovery ? 523 : 660, now);
      osc.frequency.exponentialRampToValueAtTime(isRecovery ? 784 : 440, now + 0.3);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.25 * this.soundVolume, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {}
  }

  /**
   * Testa individualmente um áudio do catálogo
   */
  public async testSound(event?: AlertSoundEvent): Promise<boolean> {
    await this.unlockAudio();
    const target = event || 'reconexao_concluida';
    return this.playSound(target, { force: true });
  }

  /**
   * Interrompe qualquer áudio em reprodução e limpa a fila
   */
  public stopAll(): void {
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
      } catch {}
      this.currentAudioElement = null;
    }
    this.playbackQueue = [];
    this.isPlaying = false;
    this.notifyListeners();
  }
}

export const alertAudioService = new AlertAudioManager();
// Exporta retrocompatibilidade com chamadas existentes
export const soundAlerts = {
  getSettings: () => alertAudioService.getSettings(),
  setSettings: (enabled: boolean, volume: number) => alertAudioService.setSettings(enabled, volume),
  unlockAudio: () => alertAudioService.unlockAudio(),
  playWarningSound: () => alertAudioService.playSound('erro_critico'),
  playCriticalSound: () => alertAudioService.playSound('erro_critico'),
  playSuccessSound: () => alertAudioService.playSound('reconexao_concluida'),
  testSound: (vol?: number) => alertAudioService.testSound('reconexao_concluida')
};
