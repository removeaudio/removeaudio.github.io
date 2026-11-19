# RemoveAudio

A fast, privacy-first web application to remove audio tracks from videos directly inside the browser using WebAssembly FFmpeg. Zero server uploads, zero watermarks, zero data storage, and full offline PWA support.

[![Astro](https://img.shields.io/badge/Astro-7.x-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-FFmpeg.wasm-654FF0?logo=webassembly&logoColor=white)](https://github.com/ffmpegwasm/ffmpeg.wasm)
[![MIT License](https://img.shields.io/badge/License-MIT-9E476A)](./LICENSE)
[![100% Client-Side](https://img.shields.io/badge/Processing-100%25%20Client--Side-2B1B22)](https://removeaudio.github.io/privacy/)
[![Zero Data Storage](https://img.shields.io/badge/Storage-Zero%20Data%20Storage-1A5934)](https://removeaudio.github.io/privacy/)

## Live Demo

**[https://removeaudio.github.io/](https://removeaudio.github.io/)**

## Key Features

- **Lossless Audio Stripping (`-c:v copy -an`)**: Removes sound tracks in milliseconds without re-encoding video frames—preserving 100% original visual quality while reducing file size.
- **100% Client-Side & Private**: Powered by `@ffmpeg/ffmpeg` (WebAssembly) running locally inside a browser Web Worker. Files never leave your device.
- **No Watermarks, No Sign-Up**: Export clean silent `MP4`, `MOV`, `WebM`, `MKV`, and `AVI` files with single-file or multi-file batch queue support.
- **Inline Muted Preview & Size Comparison**: Preview the muted output and inspect exact original-vs-muted file sizes before downloading.
- **Offline PWA Support**: Click **Add to Home Screen** to install and cache the local FFmpeg WebAssembly engine so RemoveAudio works 100% offline.
- **8 Languages**: Instant client-side language switching across English, Español, Português, Deutsch, Français, 日本語, 简体中文, and Русский without page reloads.
- **Accessible Light & Dark Mode**: Soft rose default light theme and high-contrast dark theme persisted in `localStorage`.

## Tech Stack & Privacy Architecture

| Layer | Technology |
| :--- | :--- |
| Framework | [Astro](https://astro.build/) (Static output, Islands Architecture) |
| Audio/Video Engine | `@ffmpeg/ffmpeg`, `@ffmpeg/util`, self-hosted `@ffmpeg/core-mt` & `@ffmpeg/core` |
| Cross-Origin Isolation & Offline | Unified `public/sw.js` + `public/coi-serviceworker.js` (`COOP: same-origin`, `COEP: credentialless`) enabling `SharedArrayBuffer` on GitHub Pages |
| Hosting & CI/CD | GitHub Pages + GitHub Actions (`.github/workflows/deploy.yml`, Node.js 24 LTS) |

Because RemoveAudio is deployed as a static bundle with no backend API or file storage, every selected video is read into temporary browser memory, demuxed/remuxed locally via FFmpeg WASM, served via an in-memory `Blob` URL, and freed when cleared or closed. Self-hosted FFmpeg WASM assets are synced automatically from `node_modules` into `public/ffmpeg/` via `scripts/sync-ffmpeg.mjs` during install and build.

## Local Development & Build

Requires **Node.js 24+** (`>=24.0.0`).

```bash
# 1. Install dependencies (automatically syncs FFmpeg WASM core assets to public/ffmpeg/)
npm install

# 2. Start the local development server
npm run dev

# 3. Build the production static site into ./dist
npm run build

# 4. Preview the production build locally
npm run preview
```

## Hire Me / Custom IT Solutions

Need an ultra-fast Astro/React/Next.js web app, a private WebAssembly browser tool, or a high-converting landing page? I am available for freelance projects.

- **Portfolio & Services**: [https://removeaudio.github.io/hire-me/](https://removeaudio.github.io/hire-me/)
- **Direct Email**: [kisharadilshan007@gmail.com](mailto:kisharadilshan007@gmail.com)

## Support the Developer

If RemoveAudio saved you time or helped keep your workflow private, you can support ongoing open-source development:

- **Buy Me a Coffee**: [https://kisharadilshan.gumroad.com/coffee](https://kisharadilshan.gumroad.com/coffee)

## License

Released under the [MIT License](./LICENSE) &copy; 2026 Kishara Dilshan.
