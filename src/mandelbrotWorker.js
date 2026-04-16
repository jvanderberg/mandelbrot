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

function colorizeIterations(iterations, colorScheme, maxIterations) {
	const palette = getPalette(colorScheme, maxIterations);
	const rgba = new Uint8ClampedArray(iterations.length * 4);
	for (let x = 0; x < iterations.length; x++) {
		const paletteIndex = Math.min(iterations[x], maxIterations) * 4;
		const rgbaIndex = x * 4;
		rgba[rgbaIndex] = palette[paletteIndex];
		rgba[rgbaIndex + 1] = palette[paletteIndex + 1];
		rgba[rgbaIndex + 2] = palette[paletteIndex + 2];
		rgba[rgbaIndex + 3] = 255;
	}
	return rgba;
}

function getIterationsForLine({ y, width, offsetx, offsety, panx, pany, zoom, maxIterations }) {
	const iterations = new Uint32Array(width);
	const y0 = (y + offsety + pany) / zoom;
	for (let x = 0; x < width; x++) {
		const x0 = (x + offsetx + panx) / zoom;

		let rx = 0;
		let ry = 0;
		let iteration = 0;
		let rxsqr = 0;
		let rysqr = 0;
		while (iteration <= maxIterations && rxsqr + rysqr <= 4) {
			ry = (rx + rx) * ry + y0;
			rx = rxsqr - rysqr + x0;
			rysqr = ry * ry;
			rxsqr = rx * rx;
			iteration++;
		}

		iterations[x] = iteration;
	}
	return { y, iterations };
}

function getColorizedLinesFromJs(params) {
	return {
		lines: params.ys.map(y => {
			const line = getIterationsForLine({ ...params, y });
			return {
				y,
				rgba: colorizeIterations(line.iterations, params.colorScheme, params.maxIterations)
			};
		})
	};
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

function ensureScratchBuffer(wasm, width) {
	if (scratchLen >= width) {
		return scratchPtr;
	}
	if (scratchPtr) {
		wasm.dealloc_u32(scratchPtr, scratchLen);
	}
	scratchPtr = wasm.alloc_u32(width);
	scratchLen = width;
	return scratchPtr;
}

async function computeLines(params) {
	try {
		wasmExports = wasmExports ?? (await initWasm());
		const ptr = ensureScratchBuffer(wasmExports, params.width);
		const lines = params.ys.map(y => {
			wasmExports.render_line(
				y,
				params.width,
				params.offsetx,
				params.offsety,
				params.panx,
				params.pany,
				params.zoom,
				params.maxIterations,
				ptr
			);
			const iterations = new Uint32Array(wasmExports.memory.buffer, ptr, params.width);
			return {
				y,
				rgba: colorizeIterations(iterations, params.colorScheme, params.maxIterations)
			};
		});
		return { lines };
	} catch (error) {
		console.warn('WASM line kernel unavailable, falling back to JS worker path.', error);
		return getColorizedLinesFromJs(params);
	}
}

self.onmessage = async event => {
	const { requestId, ...params } = event.data;
	try {
		const result = await computeLines(params);
		self.postMessage(
			{ requestId, ...result },
			result.lines.map(line => line.rgba.buffer)
		);
	} catch (error) {
		self.postMessage({
			requestId,
			error: error instanceof Error ? error.message : String(error)
		});
	}
};
