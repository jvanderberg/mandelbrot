import { call } from 'redux-saga/effects';
import convert from 'color-convert';
import { random } from 'node-forge';
let workers = [];
export const LINES_PER_WORKER_CALL = 0;
export const MAX_ITERATIONS = 500;
export const NUM_WORKERS = 8;

export function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function createWorker(fn) {
	const func = `function (event) {
		const getIterations = ${fn.toString()};
		const getter = async function() {
			const results = await getIterations(event.data);
			postMessage(results);
		}
		getter();
	}`;
	var blob = new Blob([`self.onmessage = ${func}`], { type: 'text/javascript' });
	var url = URL.createObjectURL(blob);
	return new Worker(url);
}

export function getIterations({ start, stop, width, offsetx, offsety, panx, pany, zoom, maxIterations }) {
	// Convert the screen coordinate to a fractal coordinate
	const iterationsArray = [];
	for (let i = start; i < stop; i++) {
		const x = i % width;
		const y = Math.floor(i / width);
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

export function getIterationsRemote({ start, stop, width, offsetx, offsety, panx, pany, zoom, maxIterations }) {
	const FETCH_API = 'https://dj3b3xgmwj.execute-api.us-west-2.amazonaws.com/prod/getIterations';
	const resp = fetch(
		`${FETCH_API}?start=${start}&stop=${stop}&width=${width}&offsetx=${offsetx}&offsety=${offsety}&panx=${panx}&pany=${pany}&zoom=${zoom}&maxIterations=${maxIterations}`
	);
	return new Promise(resolve => {
		resp.then(response => response.json()).then(json => {
			const shifted = [];
			for (let i in json) {
				shifted[start + Number(i)] = json[i];
			}
			resolve(shifted);
		});
	});
}

export const workerWrapper = (worker, parms) => {
	const promise = new Promise((resolve, reject) => {
		worker.onmessage = data => {
			worker.inflight = false;
			resolve(data.data);
		};
		worker.onerror = error => {
			worker.inflight = false;
			reject(error);
		};
	});
	worker.postMessage(parms);
	worker.inflight = true;
	return promise;
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

export const getWorker = function*(workers) {
	let currentWorker;
	while (!currentWorker) {
		currentWorker = workers.pop();
		if (currentWorker && currentWorker.inflight === true) {
			//This one is busy, put it back
			workers.push(currentWorker);
			currentWorker = null;
		}
		if (!currentWorker) {
			//No workers available, wait a bit and try again
			yield call(wait, 0);
		}
	}
	return currentWorker;
};

export const calculateMandelbrot = (
	width,
	height,
	panx,
	pany,
	zoom,
	setData,
	maxIterations = MAX_ITERATIONS,
	worker = getIterations,
	numWorkers = NUM_WORKERS,
	colorScheme = random,
	linesPerBatch = LINES_PER_WORKER_CALL
) => {
	workers.forEach(worker => worker.terminate());
	workers = [];
	const increment = Math.ceil(height / numWorkers) * width;
	//let i = increment;
	let currentWorker;
	for (let i = 0; i < numWorkers; i++) {
		let stop = (i + 1) * increment;
		const start = stop - increment;
		stop = stop > height * width ? height * width : stop;
		//Create a new worker, this is expensive, we could pool them.
		currentWorker = createWorker(worker);
		workers.push(currentWorker);
		runner(
			stop,
			start,
			width,
			currentWorker,
			height,
			panx,
			pany,
			zoom,
			setData,
			colorScheme,
			maxIterations,
			linesPerBatch
		);
	}
};

export const calculateMandelbrotSync = (worker, colorScheme) => (
	width,
	height,
	panx,
	pany,
	zoom,
	setData,
	maxIterations = MAX_ITERATIONS
) => {
	const data = getIterations({
		start: 0,
		stop: width * height,
		width: width,
		offsetx: -width / 2,
		offsety: -height / 2,
		panx: panx,
		pany: pany,
		zoom: zoom,
		maxIterations
	});
	const rgb = [];
	for (const i in data) {
		rgb[i] = colorScheme(data[i], maxIterations);
	}
	setData(rgb);
};

export const calculateMandelbrotFeedback = (worker, colorScheme) => async (
	width,
	height,
	panx,
	pany,
	zoom,
	setData,
	maxIterations = MAX_ITERATIONS
) => {
	const increment = Math.ceil(height / NUM_WORKERS) * width;
	for (let i = 0; i < NUM_WORKERS; i++) {
		let stop = (i + 1) * increment;
		const start = stop - increment;
		stop = stop > height * width ? height * width : stop;

		const data = getIterations({
			start: start,
			stop: stop,
			width: width,
			offsetx: -width / 2,
			offsety: -height / 2,
			panx: panx,
			pany: pany,
			zoom: zoom,
			maxIterations
		});
		await wait(0);
		const rgb = [];
		for (const i in data) {
			rgb[i] = colorScheme(data[i], maxIterations);
		}
		setData(rgb);
	}
};

export const calculateMandelbrotParallelSync = (worker, colorScheme) => (
	width,
	height,
	panx,
	pany,
	zoom,
	setData,
	maxIterations = MAX_ITERATIONS
) => {
	const increment = Math.ceil(height / NUM_WORKERS) * width;
	for (let i = 0; i < NUM_WORKERS; i++) {
		let stop = (i + 1) * increment;
		const start = stop - increment;
		stop = stop > height * width ? height * width : stop;
		runner2(stop, start, width, height, panx, pany, zoom, setData, colorScheme, maxIterations);
	}
};

async function runner2(
	stop,
	start,
	width,
	height,
	panx,
	pany,
	zoom,
	setData,
	colorScheme,
	maxIterations = MAX_ITERATIONS
) {
	const rows = width * LINES_PER_WORKER_CALL;
	for (let inc = 0; inc < stop - start; inc = inc + rows) {
		const incStop = start + inc + rows;
		const data = await getIterations({
			start: start + inc,
			stop: incStop < stop ? incStop : stop,
			width: width,
			offsetx: -width / 2,
			offsety: -height / 2,
			panx: panx,
			pany: pany,
			zoom: zoom,
			maxIterations
		});
		await wait(0);
		if (window.innerHeight === height && window.innerWidth === width) {
			const rgb = [];
			for (const i in data) {
				rgb[i] = colorScheme(data[i], maxIterations);
			}
			await wait(0);
			setData(rgb);
			await wait(0);
		}
	}
}
async function runner(
	stop,
	start,
	width,
	currentWorker,
	height,
	panx,
	pany,
	zoom,
	setData,
	colorScheme,
	maxIterations = MAX_ITERATIONS,
	linesPerBatch = LINES_PER_WORKER_CALL
) {
	let rows = width * linesPerBatch;
	if (rows === 0) {
		rows = stop - start;
	}
	for (let inc = 0; inc < stop - start; inc = inc + rows) {
		const incStop = start + inc + rows;
		const data = await workerWrapper(currentWorker, {
			start: start + inc,
			stop: incStop < stop ? incStop : stop,
			width: width,
			offsetx: -width / 2,
			offsety: -height / 2,
			panx: panx,
			pany: pany,
			zoom: zoom,
			maxIterations
		});
		if (window.innerHeight === height && window.innerWidth === width) {
			const rgb = [];
			for (const i in data) {
				rgb[i] = colorScheme(data[i], maxIterations);
			}
			setData(rgb);
		}
	}
}

export function drawData(data, canvas) {
	const context = canvas.current.getContext('2d');
	context.imageSmoothingEnabled = false;
	const imagew = canvas.current.width;
	//const imageh = canvas.current.height;
	let top = 0;
	for (const i in data) {
		top = Number(i) / imagew;
		break;
	}
	let bottom = data.length / imagew;
	//console.log('top', top, 'bottom', bottom);
	const imagedata = context.createImageData(imagew, bottom - top);
	//	const imagedata = context.getImageData(0, 0, imagew, imageh);
	let index = 0;
	for (const i in data) {
		//let index = Number(i) * 4;
		const [r, g, b] = data[i];
		imagedata.data[index++] = r;
		imagedata.data[index++] = g;
		imagedata.data[index++] = b;
		imagedata.data[index++] = 255;
	}
	context.putImageData(imagedata, 0, top);
	//	context.putImageData(imagedata, 0, 0);
}
