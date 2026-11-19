import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export interface MuteResult {
  blob: Blob;
  url: string;
  outputName: string;
  originalSize: number;
  mutedSize: number;
  durationMs: number;
}

export interface MuteProgress {
  stage: 'loading' | 'processing';
  ratio: number; // 0..1
}

export const SUPPORTED_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi'] as const;

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let activeVariant: 'core-mt' | 'core-st' | null = null;

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function isSupportedVideoFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return true;
  }
  const type = (file.type || '').toLowerCase();
  return (
    type === 'video/mp4' ||
    type === 'video/quicktime' ||
    type === 'video/webm' ||
    type === 'video/x-matroska' ||
    type === 'video/x-msvideo' ||
    type === 'video/avi'
  );
}

export function buildMutedFilename(originalName: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  if (dotIdx <= 0) {
    return `${originalName}-muted.mp4`;
  }
  const base = originalName.slice(0, dotIdx);
  const ext = originalName.slice(dotIdx + 1).toLowerCase();
  const safeExt = (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'mp4';
  return `${base}-muted.${safeExt}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(value >= 100 ? 1 : 2)} ${units[unitIdx]}`;
}

async function initFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const origin = window.location.origin;
    const classWorkerURL = `${origin}/ffmpeg/worker/worker.js`;
    const canUseMultiThread =
      typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated;

    const tryLoad = async (variant: 'core-mt' | 'core-st'): Promise<FFmpeg> => {
      const instance = new FFmpeg();
      const base = `${origin}/ffmpeg/${variant}`;
      await instance.load({
        classWorkerURL,
        coreURL: `${base}/ffmpeg-core.js`,
        wasmURL: `${base}/ffmpeg-core.wasm`,
        ...(variant === 'core-mt'
          ? { workerURL: `${base}/ffmpeg-core.worker.js` }
          : {}),
      });
      activeVariant = variant;
      return instance;
    };

    try {
      ffmpegInstance = await tryLoad(canUseMultiThread ? 'core-mt' : 'core-st');
      return ffmpegInstance;
    } catch (mtError) {
      if (canUseMultiThread) {
        console.warn('[RemoveAudio] Multi-threaded FFmpeg load failed, falling back to single-threaded core:', mtError);
        ffmpegInstance = await tryLoad('core-st');
        return ffmpegInstance;
      }
      throw mtError;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function getLoadedVariant(): 'core-mt' | 'core-st' | null {
  return activeVariant;
}

/**
 * Strips all audio tracks from a video file losslessly (-c:v copy -an)
 * 100% locally in WebAssembly memory with zero re-encoding.
 */
export async function removeAudioFromVideo(
  file: File,
  onProgress?: (p: MuteProgress) => void
): Promise<MuteResult> {
  const startedAt = performance.now();

  if (!ffmpegInstance || !ffmpegInstance.loaded) {
    onProgress?.({ stage: 'loading', ratio: 0.1 });
  }

  const ffmpeg = await initFfmpeg();
  onProgress?.({ stage: 'processing', ratio: 0.15 });

  const ext = getFileExtension(file.name);
  const safeExt = (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'mp4';
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = `in_${uid}.${safeExt}`;
  const outputPath = `out_${uid}.${safeExt}`;

  const progressHandler = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    const clamped = Math.max(0, Math.min(1, progress));
    // Map FFmpeg 0..1 into smooth 0.2..0.96 range
    onProgress?.({ stage: 'processing', ratio: 0.2 + clamped * 0.76 });
  };

  ffmpeg.on('progress', progressHandler);

  try {
    const inputBytes = await fetchFile(file);
    await ffmpeg.writeFile(inputPath, inputBytes);

    const isMp4Family = safeExt === 'mp4' || safeExt === 'mov';
    const primaryArgs = isMp4Family
      ? ['-i', inputPath, '-c:v', 'copy', '-an', '-movflags', '+faststart', outputPath]
      : ['-i', inputPath, '-c:v', 'copy', '-an', outputPath];

    let exitCode = await ffmpeg.exec(primaryArgs);

    // Fallback: explicitly copy only the primary video stream if extra data/subtitle streams caused mux rejection
    if (exitCode !== 0) {
      const fallbackArgs = isMp4Family
        ? ['-i', inputPath, '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', outputPath]
        : ['-i', inputPath, '-map', '0:v:0', '-c:v', 'copy', '-an', outputPath];
      exitCode = await ffmpeg.exec(fallbackArgs);
    }

    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}`);
    }

    const rawOut = await ffmpeg.readFile(outputPath);
    const outBytes =
      rawOut instanceof Uint8Array
        ? new Uint8Array(rawOut)
        : new TextEncoder().encode(rawOut);

    const mime = MIME_MAP[safeExt] || file.type || 'video/mp4';
    const blob = new Blob([outBytes], { type: mime });
    const url = URL.createObjectURL(blob);

    onProgress?.({ stage: 'processing', ratio: 1 });

    return {
      blob,
      url,
      outputName: buildMutedFilename(file.name),
      originalSize: file.size,
      mutedSize: blob.size,
      durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
    };
  } finally {
    ffmpeg.off('progress', progressHandler);
    await ffmpeg.deleteFile(inputPath).catch(() => {});
    await ffmpeg.deleteFile(outputPath).catch(() => {});
  }
}
