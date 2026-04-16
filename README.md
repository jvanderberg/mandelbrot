# Mandelbrot Explorer

An interactive Mandelbrot viewer built with Vite and React.

The current renderer is a local CPU path that uses a fixed worker pool and progressive scanline rendering so the image starts appearing quickly while the full frame finishes in the background. The hot Mandelbrot line kernel is compiled to WebAssembly from Rust and executed inside the workers.

## Live Site

[Open the live Mandelbrot Explorer](https://jvanderberg.github.io/mandelbrot/)

## Controls

- Mouse wheel zooms in and out around the cursor.
- Left-drag pans the current view.
- URL state is preserved for `panx`, `pany`, `zoom`, `maxIterations`, and `colorScheme`.
- The control panel lets you change:
  - max iterations
  - color scheme
  - image download

## Renderer Notes

- Rendering is local-only. There is no remote render path in the current UI.
- The renderer uses:
  - a worker pool sized from `navigator.hardwareConcurrency`, capped at the render stride
  - a scanline stride of `16`
  - a Rust/WebAssembly batched RGBA renderer inside the workers
  - progressive row batches so the frame fills in quickly

## Local Development

Requirements:

- Node.js 18+
- npm
- Rust toolchain with the `wasm32-unknown-unknown` target

Install dependencies:

```bash
npm install
```

Install the wasm target if needed:

```bash
rustup target add wasm32-unknown-unknown
```

Start the dev server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## GitHub Pages Deployment

This repo includes a GitHub Actions workflow at [.github/workflows/deploy-pages.yml](./.github/workflows/deploy-pages.yml).

It:

1. Builds the Vite app on pushes to `master`
2. Uploads the `dist/` artifact
3. Deploys it to GitHub Pages

The Vite `base` path is set automatically in GitHub Actions so the app serves correctly from the repository path on Pages.

## Project Structure

- [src/MandelBrot.jsx](./src/MandelBrot.jsx): interaction model, viewport state, preview behavior
- [src/common.js](./src/common.js): CPU worker scheduler and Mandelbrot iteration code
- [src/ControlPanel.jsx](./src/ControlPanel.jsx): on-screen controls
