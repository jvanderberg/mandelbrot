import convert from 'color-convert';

let workers = [];

export const MAX_ITERATIONS = 500;
export const FIXED_WORKERS = 32;
export const ROW_STRIDE = 16;

export function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function createWorker(fn) {
	const func = `function (event) {
		const getIterations = ${fn.toString()};
		const getter = async function() {
			const results = await getIterations(event.data);
			postMessage(results);
		}
		getter();
	}`;
	const blob = new Blob([`self.onmessage = ${func}`], { type: 'text/javascript' });
	const url = URL.createObjectURL(blob);
	return new Worker(url);
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
	return parms =>
		new Promise((resolve, reject) => {
			worker.onmessage = data => {
				resolve(data.data);
			};
			worker.onerror = error => {
				reject(error);
			};
			worker.postMessage(parms);
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
	workers.map(worker => worker.terminate());
	workers = [];

	const workerFns = [];
	for (let i = 0; i < FIXED_WORKERS; i++) {
		const currentWorker = createWorker(getIterationsForLine);
		workers.push(currentWorker);
		workerFns.push(workerWrapper(currentWorker));
	}

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
