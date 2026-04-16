import wasmUrl from './wasm/mandelbrot_wasm.wasm?url';

let wasmInitPromise;
let wasmExports;
let scratchPtr = 0;
let scratchLen = 0;
const paletteCache = new Map();

function hslToRgb(h, s, l) {
	const hue = ((h % 360) + 360) % 360;
	const sat = s / 100;
	const light = l / 100;
	const chroma = (1 - Math.abs(2 * light - 1)) * sat;
	const segment = hue / 60;
	const x = chroma * (1 - Math.abs((segment % 2) - 1));
	let r1 = 0;
	let g1 = 0;
	let b1 = 0;

	if (segment >= 0 && segment < 1) {
		r1 = chroma;
		g1 = x;
	} else if (segment < 2) {
		r1 = x;
		g1 = chroma;
	} else if (segment < 3) {
		g1 = chroma;
		b1 = x;
	} else if (segment < 4) {
		g1 = x;
		b1 = chroma;
	} else if (segment < 5) {
		r1 = x;
		b1 = chroma;
	} else {
		r1 = chroma;
		b1 = x;
	}

	const m = light - chroma / 2;
	return [
		Math.round((r1 + m) * 255),
		Math.round((g1 + m) * 255),
		Math.round((b1 + m) * 255)
	];
}

function paletteColor(colorScheme, iteration, maxIterations) {
	if (iteration >= maxIterations) {
		return [0, 0, 0];
	}
	switch (colorScheme) {
		case 1:
			return hslToRgb((((120 * 2 * iteration) / maxIterations) % 120) + 180, 90, 50);
		case 2:
			return hslToRgb(220, 90, ((75 * 2 * iteration) / maxIterations) % 75);
		case 0:
		default:
			return hslToRgb(((360 * 2 * iteration) / maxIterations) % 360, 90, 50);
	}
}

function getPalette(colorScheme, maxIterations) {
	const key = `${colorScheme}:${maxIterations}`;
	const cached = paletteCache.get(key);
	if (cached) {
		return cached;
	}
	const palette = new Uint8ClampedArray((maxIterations + 1) * 4);
	for (let iteration = 0; iteration <= maxIterations; iteration++) {
		const [r, g, b] = paletteColor(colorScheme, iteration, maxIterations);
		const index = iteration * 4;
		palette[index] = r;
		palette[index + 1] = g;
		palette[index + 2] = b;
		palette[index + 3] = 255;
	}
	paletteCache.set(key, palette);
	return palette;
}

async function initWasm() {
	if (!wasmInitPromise) {
		wasmInitPromise = (async () => {
			const response = await fetch(wasmUrl);
			if ('instantiateStreaming' in WebAssembly) {
				try {
					const { instance } = await WebAssembly.instantiateStreaming(response.clone(), {});
					return instance.exports;
				} catch (error) {
					console.warn('Falling back to ArrayBuffer wasm init.', error);
				}
			}

			const bytes = await response.arrayBuffer();
			const { instance } = await WebAssembly.instantiate(bytes, {});
			return instance.exports;
		})();
	}

	return wasmInitPromise;
}

function ensureScratchBuffer(wasm, byteLength) {
	if (scratchLen >= byteLength) {
		return scratchPtr;
	}
	if (scratchPtr) {
		wasm.dealloc_u8(scratchPtr, scratchLen);
	}
	scratchPtr = wasm.alloc_u8(byteLength);
	scratchLen = byteLength;
	return scratchPtr;
}

function renderChunkInJs(params) {
	const rgba = new Uint8ClampedArray(params.width * params.lineCount * 4);
	const dx = 1 / params.zoom;
	const lineBytes = params.width * 4;
	const palette = getPalette(params.colorScheme, params.maxIterations);

	for (let lineIndex = 0; lineIndex < params.lineCount; lineIndex++) {
		const y = params.startY + lineIndex * params.lineStep;
		const y0 = (y + params.offsety + params.pany) / params.zoom;
		let x0 = (params.offsetx + params.panx) / params.zoom;
		let rowOffset = lineIndex * lineBytes;

		for (let x = 0; x < params.width; x++) {
			let rx = 0;
			let ry = 0;
			let iteration = 0;
			let rxsqr = 0;
			let rysqr = 0;
			while (iteration <= params.maxIterations && rxsqr + rysqr <= 4) {
				ry = (rx + rx) * ry + y0;
				rx = rxsqr - rysqr + x0;
				rysqr = ry * ry;
				rxsqr = rx * rx;
				iteration++;
			}

			const paletteIndex = Math.min(iteration, params.maxIterations) * 4;
			rgba[rowOffset++] = palette[paletteIndex];
			rgba[rowOffset++] = palette[paletteIndex + 1];
			rgba[rowOffset++] = palette[paletteIndex + 2];
			rgba[rowOffset++] = 255;
			x0 += dx;
		}
	}

	return {
		chunk: {
			startY: params.startY,
			lineCount: params.lineCount,
			lineStep: params.lineStep,
			rgba
		}
	};
}

async function computeChunk(params) {
	try {
		wasmExports = wasmExports ?? (await initWasm());
		const byteLength = params.width * params.lineCount * 4;
		const ptr = ensureScratchBuffer(wasmExports, byteLength);
		wasmExports.render_lines_rgba(
			params.startY,
			params.lineCount,
			params.lineStep,
			params.width,
			params.offsetx,
			params.offsety,
			params.panx,
			params.pany,
			params.zoom,
			params.maxIterations,
			params.colorScheme,
			ptr
		);
		const rgba = new Uint8ClampedArray(wasmExports.memory.buffer, ptr, byteLength).slice();
		return {
			chunk: {
				startY: params.startY,
				lineCount: params.lineCount,
				lineStep: params.lineStep,
				rgba
			}
		};
	} catch (error) {
		console.warn('WASM line kernel unavailable, falling back to JS worker path.', error);
		return renderChunkInJs(params);
	}
}

self.onmessage = async event => {
	const { requestId, ...params } = event.data;
	try {
		const result = await computeChunk(params);
		self.postMessage({ requestId, ...result }, [result.chunk.rgba.buffer]);
	} catch (error) {
		self.postMessage({
			requestId,
			error: error instanceof Error ? error.message : String(error)
		});
	}
};
