#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/rust/mandelbrot-wasm"
OUT_DIR="$ROOT_DIR/src/wasm"
PROFILE="${1:-release}"

mkdir -p "$OUT_DIR"

if [[ "$PROFILE" == "release" ]]; then
	cargo build --manifest-path "$CRATE_DIR/Cargo.toml" --target wasm32-unknown-unknown --release
	cp "$CRATE_DIR/target/wasm32-unknown-unknown/release/mandelbrot_wasm.wasm" "$OUT_DIR/mandelbrot_wasm.wasm"
else
	cargo build --manifest-path "$CRATE_DIR/Cargo.toml" --target wasm32-unknown-unknown
	cp "$CRATE_DIR/target/wasm32-unknown-unknown/debug/mandelbrot_wasm.wasm" "$OUT_DIR/mandelbrot_wasm.wasm"
fi
