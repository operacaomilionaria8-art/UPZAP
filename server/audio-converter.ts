import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface PrepareAudioOptions {
  buffer?: Buffer;
  filePath?: string;
  fileName?: string;
  mimetype?: string;
  ptt?: boolean;
}

export interface PreparedAudioResult {
  buffer: Buffer;
  mimetype: string;
  ptt: boolean;
  converted: boolean;
  originalFormat?: string;
  finalFormat: string;
  durationSeconds?: number;
}

/**
 * Converte e prepara qualquer arquivo de áudio (MP3, WAV, M4A, AAC, etc.)
 * para o formato OGG com codec Opus (mono, 48kHz), padrão exigido pelo WhatsApp
 * para reprodução confiável e sem erros em dispositivos Android, iPhone e WhatsApp Web.
 * 
 * Mantém o arquivo original da Biblioteca 100% intacto, operando apenas em cópias temporárias.
 */
export async function prepareAudioForWhatsApp(
  options: PrepareAudioOptions
): Promise<PreparedAudioResult> {
  const isPtt = options.ptt !== undefined ? options.ptt : true;
  const fileName = options.fileName || 'audio.mp3';
  const ext = path.extname(fileName).toLowerCase() || '.mp3';

  // 1. Obter o buffer de áudio original
  let sourceBuffer: Buffer | null = options.buffer || null;
  if (!sourceBuffer && options.filePath && fs.existsSync(options.filePath)) {
    try {
      sourceBuffer = fs.readFileSync(options.filePath);
    } catch (readErr) {
      console.error('[AudioConverter] Erro ao ler arquivo de áudio original:', readErr);
    }
  }

  if (!sourceBuffer || sourceBuffer.length === 0) {
    throw new Error(`Buffer de áudio vazio ou não encontrado para "${fileName}"`);
  }

  // 2. Se o arquivo já for Ogg com Opus e tiver cabeçalho OggS e PTT configurado, podemos usar diretamente
  const isOggContainer = sourceBuffer.length > 4 && sourceBuffer.slice(0, 4).toString('ascii') === 'OggS';
  const isAlreadyOpusOgg = isOggContainer && (options.mimetype?.includes('opus') || options.mimetype?.includes('ogg'));

  if (isAlreadyOpusOgg && isPtt) {
    console.log(`[AudioConverter] Áudio "${fileName}" já está no formato Ogg Opus nativo. Envio direto.`);
    return {
      buffer: sourceBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: isPtt,
      converted: false,
      originalFormat: 'ogg/opus',
      finalFormat: 'ogg/opus'
    };
  }

  // 3. Preparar conversão temporária via FFmpeg
  const tempId = `upzap_audio_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tempDir = os.tmpdir();
  const tempInputPath = path.join(tempDir, `${tempId}_input${ext}`);
  const tempOutputPath = path.join(tempDir, `${tempId}_output.opus`);

  console.log(`[AudioConverter] Convertendo áudio "${fileName}" (${ext || 'desconhecido'}, ${sourceBuffer.length} bytes) para Ogg Opus (mono, 48kHz)...`);

  try {
    // Grava cópia temporária do arquivo de entrada
    fs.writeFileSync(tempInputPath, sourceBuffer);

    // Parâmetros otimizados para WhatsApp PTT / Voice Audio:
    // - c:a libopus: codec Opus oficial
    // - b:a 64k: bitrate ótimo para voz e música com alta qualidade e baixo consumo de dados
    // - vbr on: bitrate variável de alta eficiência
    // - ac 1: mono (obrigatório para waveform e reprodução no WhatsApp)
    // - ar 48000: taxa de amostragem padrão do Opus
    // - f ogg: container Ogg compatível com o reprodutor do WhatsApp
    const ffmpegArgs = [
      '-y',
      '-i', tempInputPath,
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-vbr', 'on',
      '-compression_level', '10',
      '-ac', '1',
      '-ar', '48000',
      '-f', 'ogg',
      tempOutputPath
    ];

    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', ffmpegArgs, { timeout: 20000 }, (error, _stdout, stderr) => {
        if (error) {
          console.error('[AudioConverter] Falha na execução do FFmpeg:', error, stderr);
          return reject(error);
        }
        resolve();
      });
    });

    // Validar se o arquivo convertido existe e possui conteúdo
    if (!fs.existsSync(tempOutputPath)) {
      throw new Error('Arquivo de áudio convertido não foi gerado pelo FFmpeg.');
    }

    const convertedBuffer = fs.readFileSync(tempOutputPath);
    if (convertedBuffer.length === 0) {
      throw new Error('Arquivo de áudio convertido gerou 0 bytes.');
    }

    console.log(`[AudioConverter] Áudio convertido com sucesso! Original: ${sourceBuffer.length} bytes ➔ Convertido: ${convertedBuffer.length} bytes (Ogg Opus mono 48kHz)`);

    return {
      buffer: convertedBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: isPtt,
      converted: true,
      originalFormat: ext.replace('.', '') || 'mp3',
      finalFormat: 'ogg/opus'
    };
  } catch (convErr: any) {
    console.warn(`[AudioConverter] ⚠️ Aviso: Falha ao converter áudio via FFmpeg (${convErr.message}). Utilizando fallback...`);

    // Fallback: se a conversão falhar, envia com MIME compatível original
    const fallbackMime = options.mimetype || (ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/mp4');
    return {
      buffer: sourceBuffer,
      mimetype: fallbackMime,
      ptt: false, // fallback como áudio normal se não estiver em opus
      converted: false,
      originalFormat: ext.replace('.', '') || 'unknown',
      finalFormat: fallbackMime
    };
  } finally {
    // 4. Limpeza obrigatória de arquivos temporários em /tmp
    try {
      if (fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
      }
    } catch (cleanupErr) {
      console.warn('[AudioConverter] Erro ao limpar input temporário:', cleanupErr);
    }

    try {
      if (fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
    } catch (cleanupErr) {
      console.warn('[AudioConverter] Erro ao limpar output temporário:', cleanupErr);
    }
  }
}
