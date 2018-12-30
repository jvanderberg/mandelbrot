import { call } from 'redux-saga/effects';
export function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const reducer = function (state = {}, action) {
	const newState = { ...state };
	if (action.type === 'setData') {
		newState.data = action.value;
	} else if (action.type === 'setWidth') {
		newState.width = action.value;
	} else if (action.type === 'setHeight') {
		newState.height = action.value;
	}
	return newState;
};

export function generatePalette() {
	const palette = [];
	for (let i = 0; i < 256; i++) {
		palette[i] = i << 16;
	}
	return palette;
}

export function getIterations({ start, stop, width, offsetx, offsety, panx, pany, zoom, maxIterations }) {
	// Convert the screen coordinate to a fractal coordinate
	const iterationsArray = [];
	for (let i = start; i < stop; i++) {
		const x = i % width;
		const y = Math.floor(i / width);
		const x0 = (x + offsetx + panx) / zoom;
		const y0 = (y + offsety + pany) / zoom;

		let a = 0;
		let b = 0;
		let rx = 0;
		let ry = 0;
		let iterations = 0;
		while (iterations <= maxIterations && rx * rx + ry * ry <= 4) {
			rx = a * a - b * b + x0;
			ry = 2 * a * b + y0;
			a = rx;
			b = ry;
			iterations++;
		}
		iterationsArray[i] = iterations;
	}
	return iterationsArray;
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

export const getWorker = function *(workers) {
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
