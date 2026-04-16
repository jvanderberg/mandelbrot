# Mandelbrot Explorer

An interactive Mandelbrot viewer built with Vite, React, Web Workers, and Rust/WebAssembly.

The current renderer is a local CPU path. It keeps interaction smooth by showing an immediate zoom/pan preview, then progressively filling the final image in the background. The hot Mandelbrot kernel runs in WebAssembly inside a worker pool, while the main thread stays focused on input and painting.

## Live Site

[Open the live Mandelbrot Explorer](https://jvanderberg.github.io/mandelbrot/)

## Controls

- Mouse wheel zooms around the cursor.
- Click-drag pans the current view.
- On touch devices, drag pans and pinch zooms.
- `+` and `-` buttons in the upper right zoom around the screen center.
- The control panel lets you:
  - change max iterations
  - switch color schemes
  - download the current image
  - reset to the default view
  - open the built-in help popup
- URL state is preserved for `panx`, `pany`, `zoom`, `maxIterations`, and `colorScheme`.

## Usage Tips

- Start with lower `Max Iterations` for quick exploration, then raise it when you zoom deeper and boundary detail starts to flatten out.
- Use `Midnight` when you want a higher-contrast palette for dark regions.
- The image may appear immediately as a scaled preview during zoom or pan, then sharpen as the actual render finishes.
- `Rows/Sec` is a live throughput indicator for the current machine and browser.

## What Is The Mandelbrot Set?

The Mandelbrot set is the set of complex numbers `c` for which the recurrence

`z(n+1) = z(n)^2 + c`, with `z(0) = 0`

does not escape to infinity. Points inside the set stay bounded; points outside eventually blow up. The interesting boundary between those two behaviors is what produces the familiar self-similar fractal detail.

## Renderer Architecture

- Rendering is local-only. There is no remote render path in the current UI.
- The renderer uses:
  - a worker pool sized from `navigator.hardwareConcurrency`, capped at the render stride
  - a scanline stride of `16`
  - batched jobs of `4` lines per worker request
  - a Rust/WebAssembly RGBA renderer inside each worker
  - progressive row batches so the frame fills in quickly instead of waiting for a complete frame
- The visible interaction model is two-stage:
  - first, the current image is scaled or translated as a preview
  - then the final Mandelbrot view is rendered over that preview

## Performance Optimizations

The current version is much faster than the earlier plain-JS renderer for a few concrete reasons:

### 1. Worker Pool Instead Of Main-Thread Rendering

The frame is split into scanline jobs and dispatched across a persistent worker pool. That keeps the main thread responsive while multiple CPU cores render in parallel.

### 2. Progressive Interleaved Scanlines

Rows are rendered in stride order instead of top-to-bottom. That means you start seeing structure quickly across the whole image instead of waiting for a contiguous block to finish.

### 3. Rust/WebAssembly Mandelbrot Kernel

The inner Mandelbrot loop runs in Rust-compiled WebAssembly rather than JavaScript. This moves the hottest numeric work into a faster execution path and avoids a lot of JS overhead.

### 4. Whole-Batch RGBA Generation In Workers

Workers do not just compute escape counts. They generate final RGBA scanlines before posting results back, so the main thread mostly blits finished pixel data instead of colorizing every pixel itself.

### 5. Batched Worker Messages

Each worker request renders multiple lines at once. That reduces message traffic and JS/WASM boundary overhead compared with one-message-per-line rendering.

### 6. Palette Caching

Color palettes are cached per `colorScheme` and `maxIterations`, both in the worker path and in fallback code, so palette generation is not repeated for every row.

### 7. Cheap Interior Rejection In WASM

The Rust kernel does a cardioid and period-2 bulb membership test before running the full escape loop. Large interior regions can skip the expensive iteration path entirely.

### 8. Incremental Coordinate Stepping

The WASM kernel computes the first `x` coordinate for a row once, then advances by `dx` across the row. That avoids repeating the same division for every pixel.

### 9. Worker Failure Fallback

If a worker chunk fails, the app recomputes that chunk locally rather than leaving permanent missing bands on screen. This is mostly a resilience optimization for Safari and unstable worker runs.

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

The dev and production builds both compile the Rust WASM module first.

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
2. Builds the Rust/WebAssembly module in CI
3. Uploads the `dist/` artifact
4. Deploys it to GitHub Pages

The Vite `base` path is set automatically in GitHub Actions so the app serves correctly from the repository path on Pages.

## Project Structure

- [src/MandelBrot.jsx](./src/MandelBrot.jsx): interaction model, viewport state, preview behavior
- [src/common.js](./src/common.js): worker scheduler, batching, fallback path, canvas blitting
- [src/ControlPanel.jsx](./src/ControlPanel.jsx): on-screen controls
- [src/mandelbrotWorker.js](./src/mandelbrotWorker.js): worker-side WASM loader and RGBA chunk renderer
- [rust/mandelbrot-wasm/src/lib.rs](./rust/mandelbrot-wasm/src/lib.rs): Rust Mandelbrot kernel and palette generation
