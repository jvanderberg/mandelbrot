import wasmUrl from './wasm/mandelbrot_wasm.wasm?url';

let wasmInitPromise;

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

async function computeLine(params) {
	try {
		const wasm = await initWasm();
		const ptr = wasm.alloc_u32(params.width);
		wasm.render_line(
			params.y,
			params.width,
			params.offsetx,
			params.offsety,
			params.panx,
			params.pany,
			params.zoom,
			params.maxIterations,
			ptr
		);
		const iterations = new Uint32Array(wasm.memory.buffer, ptr, params.width).slice();
		wasm.dealloc_u32(ptr, params.width);
		return { y: params.y, iterations };
	} catch (error) {
		console.warn('WASM line kernel unavailable, falling back to JS worker path.', error);
		return getIterationsForLine(params);
	}
}

self.onmessage = async event => {
	const { requestId, ...params } = event.data;
	try {
		const result = await computeLine(params);
		self.postMessage({ requestId, ...result }, [result.iterations.buffer]);
	} catch (error) {
		self.postMessage({
			requestId,
			error: error instanceof Error ? error.message : String(error)
		});
	}
};
