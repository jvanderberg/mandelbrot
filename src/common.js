import convert from 'color-convert';
const workerUrl = new URL('./mandelbrotWorker.js', import.meta.url);

let workers = [];
let nextWorkerRequestId = 0;

export const MAX_ITERATIONS = 500;
export const FIXED_WORKERS = 32;
export const ROW_STRIDE = 16;

export function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
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

export const rainbowColorScheme = maxIterations => {
	const cacheColors = [];
	return data => {
		if (cacheColors[data]) return cacheColors[data];
		const rgb =
			data < maxIterations ? convert.hsl.rgb(((360 * 2 * data) / maxIterations) % 360, 90, 50) : [0, 0, 0];
		cacheColors[data] = rgb;
		return rgb;
	};
};

export const blueColorScheme = maxIterations => {
	const cacheColors = [];
	return data => {
		if (cacheColors[data]) return cacheColors[data];
		const rgb =
			data < maxIterations
				? convert.hsl.rgb((((120 * 2 * data) / maxIterations) % 120) + 180, 90, 50)
				: [0, 0, 0];
		cacheColors[data] = rgb;
		return rgb;
	};
};

export const blue2ColorScheme = maxIterations => {
	const cacheColors = [];
	return data => {
		if (cacheColors[data]) return cacheColors[data];
		const rgb = data < maxIterations ? convert.hsl.rgb(220, 90, ((75 * 2 * data) / maxIterations) % 75) : [0, 0, 0];
		cacheColors[data] = rgb;
		return rgb;
	};
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
	colorScheme = () => [0, 0, 0]
) => {
	const workerFns = ensureWorkers().map(workerWrapper);

	for (let phase = 0; phase < ROW_STRIDE; phase++) {
		const rowJobs = [];
		for (let y = phase; y < height; y += ROW_STRIDE) {
			rowJobs.push({ y });
		}

		for (let i = 0; i < rowJobs.length; i += FIXED_WORKERS) {
			const batch = rowJobs.slice(i, i + FIXED_WORKERS);
			const batchResults = await Promise.all(
				batch.map((job, index) =>
					runner(
						signal,
						job.y,
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
			const batchPixels = [];
			for (const linePixels of batchResults) {
				for (const pixelIndex in linePixels) {
					batchPixels[pixelIndex] = linePixels[pixelIndex];
				}
			}
			setData({
				runId,
				pixels: batchPixels,
				rowUnits: batchResults.length
			});
			await wait(0);
		}
	}
};

async function runner(
	signal,
	y,
	width,
	worker,
	height,
	panx,
	pany,
	zoom,
	colorScheme,
	maxIterations = MAX_ITERATIONS
) {
	const data = worker({
		y,
		width,
		offsetx: -width / 2,
		offsety: -height / 2,
		panx,
		pany,
		zoom,
		maxIterations
	});

	if (data.then && typeof data.then === 'function') {
		return data
			.then(newData => mapLineToRgb(newData, colorScheme, maxIterations, width, height))
			.catch(err => console.log(err));
	}
	return mapLineToRgb(data, colorScheme, maxIterations, width, height);
}

function mapLineToRgb(data, colorScheme, maxIterations, width, height) {
	if (window.innerHeight !== height || window.innerWidth !== width) {
		return [];
	}
	const rgb = [];
	if (data?.iterations && data.y !== undefined) {
		const start = data.y * width;
		for (let x = 0; x < data.iterations.length; x++) {
			rgb[start + x] = colorScheme(data.iterations[x], maxIterations);
		}
		return rgb;
	}
	for (const i in data) {
		rgb[i] = colorScheme(data[i], maxIterations);
	}
	return rgb;
}

export function drawData(data, canvas) {
	const pixels = data.pixels ?? data;
	const context = canvas.current.getContext('2d', { alpha: false });
	context.imageSmoothingEnabled = false;
	const imagew = canvas.current.width;
	const imageh = canvas.current.height;
	const imagedata = context.getImageData(0, 0, imagew, imageh);
	for (const i in pixels) {
		let index = Number(i) * 4;
		const [r, g, b] = pixels[i];
		imagedata.data[index++] = r;
		imagedata.data[index++] = g;
		imagedata.data[index++] = b;
		imagedata.data[index++] = 255;
	}
	context.putImageData(imagedata, 0, 0);
}
