import React from 'react';
import ReactDOM from 'react-dom';
import MandelBrotContainer from './MandelBrotContainer.jsx';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware, compose } from 'redux';
import createSagaMiddleware from 'redux-saga';
import { put, fork, call, join, cancel, select, take, takeLatest } from 'redux-saga/effects';
import 'babel-polyfill';
import { wait, workerWrapper, reducer, generatePalette } from './common.js';
const worker = require('worker!./worker.js');

const numWorkers = 8;
const workers = [];
function createWorkers() {
	for (let i = 0; i < numWorkers; i++) {
		workers.push(worker());
	}
}

const sagaMiddleware = createSagaMiddleware();
const store = createStore(
	reducer,
	{ data: [], start: function () {}, width: window.innerWidth, height: window.innerHeight },
	compose(applyMiddleware(sagaMiddleware), window.devToolsExtension ? window.devToolsExtension() : f => f)
);

const task = function *(width, height, start, stop) {
	let currentWorker;
	try {
		const palette = generatePalette();
		yield call(wait, 0);
		const maxIterations = 5000;
		//Create a new worker, this is expensive, we could pool them.
		currentWorker = worker();
		for (let inc = 0; inc < stop - start; inc = inc + width * 20) {
			const iterations = yield call(workerWrapper, currentWorker, {
				start: start + inc,
				stop: start + inc + width * 20,
				width: width,
				offsetx: (-width) / 2,
				offsety: (-height) / 2,
				panx: 0,
				pany: 0,
				zoom: 300,
				maxIterations
			});
			for (const i in iterations) {
				const iterationCount = iterations[i];
				if (iterationCount === maxIterations + 1) {
					iterations[i] = 0;
				} else {
					const index = Math.floor(Math.log(iterationCount) / Math.log(maxIterations) * 255);
					iterations[i] = palette[index];
				}
			}
			yield put({ type: 'setData', value: iterations });
			yield call(wait, 0);
		}
	} finally {
		//Kill the worker we recreated
		currentWorker.terminate();
	}
};

let tasks = [];
const mandelBrot = function *() {
	//	yield tasks.map(cancel);
	tasks = [];
	const width = yield select(state => state.width);
	const height = yield select(state => state.height);
	//const increment = Math.floor(height / numWorkers) * width;
	const increment = Math.floor(height / numWorkers) * width;
	let i = increment;
	for (; i < width * height; i = i + increment) {
		tasks.push(yield fork(task, width, height, i - increment, i));
	}
	tasks.push(yield fork(task, width, height, i - increment, width * height));
	yield tasks.map(join);
};

const runner = function *() {
	yield takeLatest('start', mandelBrot);
};

window.onload = () => store.dispatch({ type: 'start' });

//createWorkers();
sagaMiddleware.run(runner);

ReactDOM.render(
	<Provider store={store}>
		<div>
			<MandelBrotContainer />
		</div>
	</Provider>,
	document.getElementById('react')
);
