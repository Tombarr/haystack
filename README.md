# Haystack

![Haystack Icon](./public/favicon-64x64.png)

**Search live video using natural language — runs entirely in your browser.**

Point your webcam, type a description, and Haystack tells you how closely the scene matches.

Live demo: **<https://tombarr.github.io/haystack/>**

![Haystack Screenshot](./screenshot.png)

---

## Features

- **Zero-shot vision** — On-device model matches frames against any text prompt without retraining
- **Fully offline after first load** — models are cached in the browser; works without internet thereafter
- **Real-time probability bar** — vertical fill with adjustable threshold marker
- **Detection events** — hook into `onDetection()` in `App.tsx` to add recording, webhooks, or alerts
- **Webcam dashboard** — live video with score overlay and MATCH indicator

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173/haystack/> — the app will prompt for camera access, then download the model on first run (cached permanently after that).

> **Note:** The first page load triggers one automatic reload as the cross-origin isolation service worker registers itself. This is normal.

---

## Architecture

```text
Browser
  ├── coi-serviceworker.js    Injects COOP/COEP headers (enables SharedArrayBuffer for WASM threads)
  ├── @xenova/transformers    Runs model via ONNX/WASM, fully client-side
  │     └── clip-vit-base-patch32   cached in browser Cache API after first download
  └── React + Vite            UI and build tooling
```

### Cross-origin isolation

ONNX's threaded WASM backend requires `SharedArrayBuffer`, which browsers gate behind:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

GitHub Pages can't set custom HTTP headers, so `coi-serviceworker.js` (from [gzuidhof/coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)) intercepts responses via a service worker and injects these headers. During local development, Vite sets them directly in `server.headers`.

### Inference loop

Frames are captured at ~3 FPS via a self-scheduling `setTimeout` chain (not `requestAnimationFrame`) to avoid queuing inference calls faster than they resolve. Each frame is drawn to a hidden 224×224 canvas, converted to a Blob URL, scored by CLIP/ SigLIP against a two-label softmax (`[your prompt, "something else"]`), then the URL is revoked.

### Detection hook

Edit `onDetection()` in `src/App.tsx` to respond to matches:

```typescript
function onDetection(score: number, prompt: string): void {
  console.log(`[haystack] MATCH: ${score.toFixed(3)} — "${prompt}"`)
  // Add: fetch('/webhook', ...), MediaRecorder.start(), etc.
}
```

---

## Deployment

GitHub Actions automatically builds and deploys to the `gh-pages` branch on every push to `main`.

To enable GitHub Pages for the first time:

1. Push to `main` and let the Action run
2. Go to **Settings > Pages** in your repo
3. Set source to the `gh-pages` branch, root folder

---

## Supported models

Haystack supports several zero-shot vision models. Larger models generally provide better accuracy but require more bandwidth and memory.

| Model | ID | Size |
| --- | --- | --- |
| **CLIP ViT-B/32** | `Xenova/clip-vit-base-patch32` | ~90 MB (Default) |
| **CLIP ViT-B/16** | `Xenova/clip-vit-base-patch16` | ~360 MB |
| **CLIP ViT-L/14** | `Xenova/clip-vit-large-patch14` | ~900 MB |
| **SigLIP B/16** | `Xenova/siglip-base-patch16-224` | ~370 MB |

## Tech stack

| | |
| --- | --- |
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 |
| ML | `@xenova/transformers` (ONNX/WASM) |
| Model | `Xenova/clip-vit-base-patch32` |
| CI/CD | GitHub Actions → `peaceiris/actions-gh-pages` |
