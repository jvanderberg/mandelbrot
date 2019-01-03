import React from 'react';
import ReactDOM from 'react-dom';
import MandelBrotContainer from './MandelBrotContainer.jsx';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware, compose } from 'redux';
import createSagaMiddleware from 'redux-saga';
import { put, fork, call, join, cancel, select, take, takeLatest } from 'redux-saga/effects';
import { MAX_ITERATIONS, wait, workerWrapper, reducer, generatePalette } from './common.js';

const FETCH_API = 'https://dj3b3xgmwj.execute-api.us-west-2.amazonaws.com/prod/getIterations';
const numWorkers = 5;

const sagaMiddleware = createSagaMiddleware();
const store = createStore(
	reducer,
	{
		data: [],
		start: function() {},
		panx: 0,
		pany: 0,
		zoom: 200,
		width: window.innerWidth,
		height: window.innerHeight
	},
	compose(
		applyMiddleware(sagaMiddleware),
		window.devToolsExtension ? window.devToolsExtension() : f => f
	)
);

const task = function*(width, height, start, stop) {
	//	let currentWorker;
	try {
		const palette = generatePalette();
		yield call(wait, 0);
		const maxIterations = MAX_ITERATIONS;
		//Create a new worker, this is expensive, we could pool them.
		for (let inc = 0; inc < stop - start; inc = inc + width * 50) {
			//debugger
			const resp = yield call(
				fetch,
				`${FETCH_API}?start=${start + inc}&stop=${start + inc + width * 10}&width=${width}&offsetx=${-width /
					2}&offsety=${-height / 2}&panx=${-14000}&pany=${0}&zoom=${10000}&maxIterations=${maxIterations}`
			);
			const iterations = yield resp.json();
			const colors = [];
			for (const i in iterations) {
				const iterationCount = iterations[i];
				if (iterationCount === maxIterations + 1) {
					colors[Number(i) + start + inc] = 0;
				} else {
					const index = Math.floor((Math.log(iterationCount) / Math.log(maxIterations)) * 255);
					colors[Number(i) + start + inc] = palette[index];
				}
			}
			yield put({ type: 'setData', value: colors });
			yield call(wait, 0);
		}
	} finally {
	}
};

let tasks = [];
const mandelBrot = function*() {
	//	yield tasks.map(cancel);
	yield call(wait, 200);
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
	yield tasks.map(task => {
		//debugger;
		return join(task);
	});
};

const runner = function*() {
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
	document.getElementById('root')
);
