import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const copies = [
  {
    srcDir: resolve(rootDir, 'node_modules/@ffmpeg/ffmpeg/dist/esm'),
    destDir: resolve(rootDir, 'public/ffmpeg/worker'),
    files: ['worker.js', 'const.js', 'errors.js'],
  },
  {
    srcDir: resolve(rootDir, 'node_modules/@ffmpeg/core-mt/dist/esm'),
    destDir: resolve(rootDir, 'public/ffmpeg/core-mt'),
    files: ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'],
  },
  {
    srcDir: resolve(rootDir, 'node_modules/@ffmpeg/core/dist/esm'),
    destDir: resolve(rootDir, 'public/ffmpeg/core-st'),
    files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'],
  },
];

let copiedCount = 0;

for (const { srcDir, destDir, files } of copies) {
  if (!existsSync(srcDir)) {
    console.warn(`[sync-ffmpeg] Skipping missing source directory: ${srcDir}`);
    continue;
  }

  mkdirSync(destDir, { recursive: true });

  for (const file of files) {
    const src = resolve(srcDir, file);
    const dest = resolve(destDir, file);

    if (!existsSync(src)) {
      console.warn(`[sync-ffmpeg] Missing expected file: ${src}`);
      continue;
    }

    let needsCopy = true;
    if (existsSync(dest)) {
      const srcStat = statSync(src);
      const destStat = statSync(dest);
      if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
        needsCopy = false;
      }
    }

    if (needsCopy) {
      copyFileSync(src, dest);
      copiedCount += 1;
    }
  }
}

console.log(
  copiedCount > 0
    ? `[sync-ffmpeg] Synced ${copiedCount} FFmpeg WebAssembly asset(s) to public/ffmpeg/`
    : '[sync-ffmpeg] FFmpeg WebAssembly assets in public/ffmpeg/ are already up to date.'
);
