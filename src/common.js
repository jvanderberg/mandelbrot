import convert from 'color-convert';
import { random } from 'node-forge';
import GPU from 'gpu.js';
let workers = [];
export const LINES_PER_WORKER_CALL = 50;
export const MAX_ITERATIONS = 500;
export const NUM_WORKERS = 4;
export const LAMBDAS = [
	{ name: 'Node JS', value: 'getIterations' },
	{ name: 'Python 3.7', value: 'getIterationsPython' },
	{ name: 'Python 3.7/NumPy', value: 'getIterationsNumPy' }
];
export function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function createWorker(fn, index) {
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
	const worker = new Worker(url);
	return worker;
}

export function getIterations({ start, stop, width, offsetx, offsety, panx, pany, zoom, maxIterations }) {
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

export function getIterationsRemote({
	signal,
	lambda,
	start,
	stop,
	width,
	offsetx,
	offsety,
	panx,
	pany,
	zoom,
	maxIterations
}) {
	const FETCH_API = 'https://dj3b3xgmwj.execute-api.us-west-2.amazonaws.com/prod/' + lambda;
	const resp = fetch(
		`${FETCH_API}?start=${start}&stop=${stop}&width=${width}&offsetx=${offsetx}&offsety=${offsety}&panx=${panx}&pany=${pany}&zoom=${zoom}&maxIterations=${maxIterations}`,
		{ signal }
	);
	return new Promise(resolve => {
		resp.then(response => response.json())
			.then(json => {
				const shifted = [];
				for (let i in json) {
					shifted[start + Number(i)] = json[i];
				}
				resolve(shifted);
			})
			.catch(err => console.log(err));
	});
}

export const workerWrapper = (worker, signal) => {
	let promise;
	// if (signal.aborted) {
	// 	promise = Promise.reject(new DOMException('Aborted', 'AbortError'));
	// } else {
	promise = new Promise((resolve, reject) => {
		// const handleAbort = () => {
		// 	console.log('Rejecting run #', signal.run);
		// 	reject(new DOMException('Aborted', 'AbortError'));
		// 	worker.terminate();
		// 	worker.terminated = true;
		// };
		worker.onmessage = data => {
			worker.inflight = false;
			// signal.removeEventListener('abort', handleAbort);
			if (!signal.aborted) {
				resolve(data.data);
			} else {
				console.log('Ignoring because abort run #', signal.run);
			}
		};
		worker.onerror = error => {
			worker.inflight = false;
			// signal.removeEventListener('abort', handleAbort);
			reject(error);
		};
		// signal.addEventListener('abort', handleAbort);
	});
	// }
	return parms => {
		delete parms.signal;
		worker.postMessage(parms);
		worker.inflight = true;
		return promise;
	};
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
	lambda,
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
	workers.map(worker => worker.terminate());
	workers = [];
	const increment = Math.ceil(height / numWorkers) * width;
	let currentWorker;
	for (let i = 0; i < numWorkers; i++) {
		let stop = (i + 1) * increment;
		const start = stop - increment;
		stop = stop > height * width ? height * width : stop;
		//Create a new worker, this is expensive, we could pool them.
		currentWorker = createWorker(worker, i);
		workers.push(currentWorker);
		runner(
			signal,
			lambda,
			stop,
			start,
			width,
			workerWrapper(currentWorker, signal),
			height,
			panx,
			pany,
			zoom,
			setData,
			colorScheme,
			maxIterations,
			linesPerBatch
		);
		await wait(0);
	}
};

export const calculateMandelbrotGPU = async (
	signal,
	lambda,
	width,
	height,
	panx,
	pany,
	zoom,
	setData,
	maxIterations = MAX_ITERATIONS,
	worker,
	numWorkers,
	colorScheme
) => {
	const gpu = new GPU();

	const increment = Math.ceil(height / numWorkers) * width;
	for (let i = 0; i < numWorkers; i++) {
		let stop = (i + 1) * increment;
		const start = stop - increment;
		stop = stop > height * width ? height * width : stop;
		const doMandelBrot = gpu
			.createKernel(function(start, width, offsetx, offsety, panx, pany, zoom, maxIterations) {
				const x = (start + this.thread.x) % width;
				const y = Math.floor((start + this.thread.x) / width);
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

				return iterations;
			})
			.setOutput([stop - start]);
		const data = doMandelBrot(start, width, -width / 2, -height / 2, panx, pany, zoom, maxIterations);
		const rgb = [];
		for (const i in data) {
			rgb[Number(i) + start] = colorScheme(data[i], maxIterations);
		}
		await wait(0);
		setData(rgb);
	}
};

export const calculateMandelbrotSync = async (
	signal,
	lambda,
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
	runner(
		signal,
		lambda,
		width * height,
		0,
		width,
		worker,
		height,
		panx,
		pany,
		zoom,
		setData,
		colorScheme,
		maxIterations,
		linesPerBatch
	);
};

export const calculateMandelbrotFeedback = async (
	signal,
	lambda,
	width,
	height,
	panx,
	pany,
	zoom,
	setData,
	maxIterations = MAX_ITERATIONS,
	worker = getIterations,
	numWorkers = NUM_WORKERS,
	colorScheme = rainbowColorScheme,
	linesPerBatch = LINES_PER_WORKER_CALL
) => {
	const increment = Math.ceil(height / numWorkers) * width;
	for (let i = 0; i < numWorkers; i++) {
		let stop = (i + 1) * increment;
		const start = stop - increment;
		stop = stop > height * width ? height * width : stop;

		await runner(
			signal,
			lambda,
			stop,
			start,
			width,
			worker,
			height,
			panx,
			pany,
			zoom,
			setData,
			colorScheme,
			maxIterations,
			linesPerBatch
		);
		await wait(0);
		if (signal.aborted) break;
	}
};

function runner(
	signal,
	lambda,
	stop,
	start,
	width,
	worker,
	height,
	panx,
	pany,
	zoom,
	setData,
	colorScheme,
	maxIterations = MAX_ITERATIONS
) {
	const sendResult = data => {
		if (!signal.aborted && window.innerHeight === height && window.innerWidth === width) {
			const rgb = [];
			for (const i in data) {
				rgb[i] = colorScheme(data[i], maxIterations);
			}
			setTimeout(() => {
				if (!signal.aborted && window.innerHeight === height && window.innerWidth === width) {
					console.log('setData for run #', signal.run);
					setData(rgb);
				}
			}, 0);
		}
	};
	const data = worker({
		signal,
		lambda,
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

	if (data.then && typeof data.then === 'function') {
		data.then(newData => {
			sendResult(newData);
		}).catch(err => console.log(err));
	} else {
		sendResult(data);
	}
}

export function drawData(data, canvas) {
	const context = canvas.current.getContext('2d', { alpha: false });
	context.imageSmoothingEnabled = false;
	const imagew = canvas.current.width;
	const imageh = canvas.current.height;
	let top;
	for (let i in data) {
		top = i;
		break;
	}
	context.clearRect(0, Number(top), imagew, data.length / imagew);
	const canvas2 = document.createElement('canvas');
	canvas2.width = canvas.current.width + 'px';
	canvas2.height = canvas.current.height + 'px';
	const imagedata = context.getImageData(0, 0, imagew, imageh);
	for (const i in data) {
		let index = Number(i) * 4;
		const [r, g, b] = data[i];
		imagedata.data[index++] = r;
		imagedata.data[index++] = g;
		imagedata.data[index++] = b;
		imagedata.data[index++] = 255;
	}
	context.putImageData(imagedata, 0, 0);
}
