import convert from 'color-convert';

const workerUrl = new URL('./mandelbrotWorker.js', import.meta.url);

let workers = [];
let nextWorkerRequestId = 0;
const canvasStates = new WeakMap();
const paletteCache = new Map();

export const MAX_ITERATIONS = 500;
export const ROW_STRIDE = 16;
export const FIXED_WORKERS = Math.max(
	1,
	Math.min(ROW_STRIDE, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 8) - 1))
);
export const LINES_PER_WORKER_REQUEST = 4;

export function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function getPalette(colorScheme, maxIterations) {
	const key = `${colorScheme}:${maxIterations}`;
	const cached = paletteCache.get(key);
	if (cached) {
		return cached;
	}

	const palette = new Uint8ClampedArray((maxIterations + 1) * 4);
	for (let iteration = 0; iteration <= maxIterations; iteration++) {
		let rgb = [0, 0, 0];
		if (iteration < maxIterations) {
			if (colorScheme === 1) {
				rgb = convert.hsl.rgb((((120 * 2 * iteration) / maxIterations) % 120) + 180, 90, 50);
			} else if (colorScheme === 2) {
				rgb = convert.hsl.rgb(220, 90, ((75 * 2 * iteration) / maxIterations) % 75);
			} else {
				rgb = convert.hsl.rgb(((360 * 2 * iteration) / maxIterations) % 360, 90, 50);
			}
		}
		const index = iteration * 4;
		palette[index] = rgb[0];
		palette[index + 1] = rgb[1];
		palette[index + 2] = rgb[2];
		palette[index + 3] = 255;
	}

	paletteCache.set(key, palette);
	return palette;
}

function renderChunkFallback(job, width, height, panx, pany, zoom, colorScheme, maxIterations) {
	const rgba = new Uint8ClampedArray(width * job.lineCount * 4);
	const palette = getPalette(colorScheme, maxIterations);
	const offsetx = -width / 2;
	const dx = 1 / zoom;
	const lineBytes = width * 4;

	for (let lineIndex = 0; lineIndex < job.lineCount; lineIndex++) {
		const y = job.startY + lineIndex * job.lineStep;
		const y0 = (y - height / 2 + pany) / zoom;
		let x0 = (offsetx + panx) / zoom;
		let rgbaOffset = lineIndex * lineBytes;

		for (let x = 0; x < width; x++) {
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

			const paletteIndex = Math.min(iteration, maxIterations) * 4;
			rgba[rgbaOffset++] = palette[paletteIndex];
			rgba[rgbaOffset++] = palette[paletteIndex + 1];
			rgba[rgbaOffset++] = palette[paletteIndex + 2];
			rgba[rgbaOffset++] = 255;
			x0 += dx;
		}
	}

	return {
		startY: job.startY,
		lineCount: job.lineCount,
		lineStep: job.lineStep,
		rgba
	};
}

function createWorker() {
	return new Worker(workerUrl, { type: 'module' });
}

function ensureWorkers() {
	if (workers.length === FIXED_WORKERS) {
		return workers;
	}

	workers.forEach(worker => worker.terminate());
	workers = [];
	for (let i = 0; i < FIXED_WORKERS; i++) {
		workers.push(createWorker());
	}
	return workers;
}

export function getIterationsForLine({ y, width, offsetx, offsety, panx, pany, zoom, maxIterations }) {
	const iterationsArray = [];
	const start = y * width;
	const stop = start + width;
	for (let i = start; i < stop; i++) {
		const x = i - start;
		const x0 = (x + offsetx + panx) / zoom;
		const y0 = (y + offsety + pany) / zoom;

		let rx = 0;
		let ry = 0;
		let iterations = 0;
		let rxsqr = 0;
		let rysqr = 0;
		while (iterations <= maxIterations && rxsqr + rysqr <= 4) {
			ry = (rx + rx) * ry + y0;
			rx = rxsqr - rysqr + x0;
			rysqr = ry * ry;
			rxsqr = rx * rx;
			iterations++;
		}

		iterationsArray[i] = iterations;
	}
	return iterationsArray;
}

export const workerWrapper = worker => {
	if (!worker.pendingRequests) {
		worker.pendingRequests = new Map();
		worker.onmessage = event => {
			const { requestId } = event.data ?? {};
			const pending = worker.pendingRequests.get(requestId);
			if (!pending) {
				return;
			}
			worker.pendingRequests.delete(requestId);
			if (event.data?.error) {
				pending.reject(new Error(event.data.error));
				return;
			}
			pending.resolve(event.data);
		};
		worker.onerror = error => {
			worker.pendingRequests.forEach(({ reject }) => reject(error));
			worker.pendingRequests.clear();
		};
	}

	return parms =>
		new Promise((resolve, reject) => {
			const requestId = ++nextWorkerRequestId;
			worker.pendingRequests.set(requestId, { resolve, reject });
			worker.postMessage({ ...parms, requestId });
		});
};

export const calculateMandelbrot = async (
	signal,
	runId,
	width,
	height,
	panx,
	pany,
	zoom,
	setData,
	maxIterations = MAX_ITERATIONS,
	colorScheme = 0
) => {
	const workerFns = ensureWorkers().map(workerWrapper);

	for (let phase = 0; phase < ROW_STRIDE; phase++) {
		const jobs = [];
		for (let y = phase; y < height; y += ROW_STRIDE * LINES_PER_WORKER_REQUEST) {
			const remaining = height - y;
			const lineCount = Math.min(LINES_PER_WORKER_REQUEST, Math.ceil(remaining / ROW_STRIDE));
			jobs.push({
				startY: y,
				lineCount,
				lineStep: ROW_STRIDE
			});
		}

		for (let i = 0; i < jobs.length; i += FIXED_WORKERS) {
			const batch = jobs.slice(i, i + FIXED_WORKERS);
			const batchResults = await Promise.all(
				batch.map((job, index) =>
					runner(
						signal,
						job,
						width,
						workerFns[index],
						height,
						panx,
						pany,
						zoom,
						colorScheme,
						maxIterations
					)
				)
			);
			if (signal.aborted) {
				return;
			}
			setData({
				runId,
				chunks: batchResults.flat(),
				rowUnits: batch.reduce((count, job) => count + job.lineCount, 0)
			});
			await wait(0);
		}
	}
};

async function runner(
	signal,
	job,
	width,
	worker,
	height,
	panx,
	pany,
	zoom,
	colorSchemeIndex,
	maxIterations = MAX_ITERATIONS
) {
	const data = worker({
		startY: job.startY,
		lineCount: job.lineCount,
		lineStep: job.lineStep,
		width,
		offsetx: -width / 2,
		offsety: -height / 2,
		panx,
		pany,
		zoom,
		maxIterations,
		colorScheme: colorSchemeIndex
	});

	if (data.then && typeof data.then === 'function') {
		return data
			.then(newData => normalizeLineBatch(newData, width, height))
			.catch(err => {
				console.error(err);
				return [renderChunkFallback(job, width, height, panx, pany, zoom, colorSchemeIndex, maxIterations)];
			});
	}
	return normalizeLineBatch(data, width, height);
}

function normalizeLineBatch(data, width, height) {
	return data?.chunk ? [data.chunk] : [];
}

function getCanvasState(canvasRef) {
	const canvas = canvasRef.current;
	let state = canvasStates.get(canvas);
	if (!state || state.width !== canvas.width || state.height !== canvas.height) {
		const context = canvas.getContext('2d', { alpha: false });
		const imageData = context.createImageData(canvas.width, canvas.height);
		for (let i = 3; i < imageData.data.length; i += 4) {
			imageData.data[i] = 255;
		}
		state = {
			context,
			imageData,
			width: canvas.width,
			height: canvas.height
		};
		canvasStates.set(canvas, state);
	}
	return state;
}

export function syncDrawBufferFromCanvas(canvasRef) {
	const canvas = canvasRef.current;
	if (!canvas) {
		return;
	}
	const context = canvas.getContext('2d', { alpha: false });
	const state = {
		context,
		imageData: context.getImageData(0, 0, canvas.width, canvas.height),
		width: canvas.width,
		height: canvas.height
	};
	canvasStates.set(canvas, state);
}

export function drawData(data, canvas) {
	const chunks = data.chunks ?? [];
	const { context, imageData } = getCanvasState(canvas);
	context.imageSmoothingEnabled = false;
	for (const chunk of chunks) {
		if (!chunk) {
			continue;
		}
		const lineBytes = imageData.width * 4;
		for (let lineIndex = 0; lineIndex < chunk.lineCount; lineIndex++) {
			const targetY = chunk.startY + lineIndex * chunk.lineStep;
			const sourceStart = lineIndex * lineBytes;
			const sourceEnd = sourceStart + lineBytes;
			imageData.data.set(chunk.rgba.subarray(sourceStart, sourceEnd), targetY * lineBytes);
		}
	}
	context.putImageData(imageData, 0, 0);
}
