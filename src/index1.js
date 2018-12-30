import React from 'react';
import ReactDOM from 'react-dom';
import MandelBrotContainer from './MandelBrotContainer.jsx';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware, compose } from 'redux';
import createSagaMiddleware from 'redux-saga';
import { put, fork, call, join, select, takeLatest } from 'redux-saga/effects';
import { wait, reducer, generatePalette, getIterations } from './common.js';

const sagaMiddleware = createSagaMiddleware();

const store = createStore(
	reducer,
	{ data: [], start: function() {}, width: window.innerWidth, height: window.innerHeight },
	compose(
		applyMiddleware(sagaMiddleware),
		window.devToolsExtension ? window.devToolsExtension() : f => f
	)
);

const task = function*(width, height, start, stop) {
	const palette = generatePalette();
	yield call(wait, 0);
	const maxIterations = 5000;

	for (let inc = 0; inc < stop - start; inc = inc + width * 10) {
		const iterations = getIterations({
			start: start + inc,
			stop: start + inc + width * 10,
			width: width,
			offsetx: -width / 2,
			offsety: -height / 2,
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
				const index = Math.floor((Math.log(iterationCount) / Math.log(maxIterations)) * 255);
				iterations[i] = palette[index];
			}
		}
		yield put({ type: 'setData', value: iterations });
		yield call(wait, 0);
	}
};

const mandelBrot = function*() {
	//debugger;
	const tasks = [];
	const width = yield select(state => state.width);
	const height = yield select(state => state.height);
	const increment = width * 100;
	let i = increment;
	for (; i < width * height; i = i + increment) {
		tasks.push(yield fork(task, width, height, i - increment, i));
	}
	//debugger;
	tasks.push(yield fork(task, width, height, i - increment, width * height));
	//debugger;
	yield tasks.map(task => {
		//debugger;
		return join(task);
	});
};

const runner = function*() {
	//debugger;
	yield takeLatest('start', mandelBrot);
};

window.onload = () => store.dispatch({ type: 'start' });

sagaMiddleware.run(runner);
ReactDOM.render(
	<Provider store={store}>
		<div>
			<MandelBrotContainer />
		</div>
	</Provider>,
	document.getElementById('root')
);