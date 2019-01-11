import React, { useEffect, useState, useRef } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import PropTypes from 'prop-types';
import {
	drawData,
	getIterations,
	getIterationsRemote,
	rainbowColorScheme,
	calculateMandelbrot,
	MAX_ITERATIONS,
	blueColorScheme,
	blue2ColorScheme,
	NUM_WORKERS,
	LINES_PER_WORKER_CALL,
	LAMBDAS,
	getIterationsGPU
} from './common.js';
import { ControlPanel } from './ControlPanel.jsx';

function getURLParms() {
	const parms = new URLSearchParams(window.location.search);
	let url = {};
	for (const entry of parms.entries()) {
		url = { ...url, [entry[0]]: Number(entry[1]) };
	}
	return {
		parallel: 0,
		lambda: 0,
		maxIterations: MAX_ITERATIONS,
		zoom: 200,
		panx: 0,
		pany: 0,
		worker: 0,
		numWorkers: NUM_WORKERS,
		colorScheme: 0,
		...url
	};
}

function resize(panx, pany, zoom, setWidth, setHeight) {
	unstable_batchedUpdates(() => {
		setWidth(window.innerWidth);
		setHeight(window.innerHeight);
	});
}

function clickHandler(event, width, height, panx, pany, zoom, setPanx, setPany, setZoom) {
	const { pageX, pageY, shiftKey } = event;
	let deltaZ = shiftKey ? 0.5 : 2;
	const newZoom = zoom * deltaZ;
	const mX = width / 2;
	const mY = height / 2;
	const x0 = (pageX + panx) / zoom;
	const y0 = (pageY + pany) / zoom;
	const newPanx = x0 * zoom - mX;
	const newPany = y0 * zoom - mY;
	unstable_batchedUpdates(() => {
		setZoom(newZoom);
		setPanx(newPanx * deltaZ);
		setPany(newPany * deltaZ);
	});
}

const workers = [getIterations, getIterationsRemote, getIterationsGPU];
const colorSchemes = [rainbowColorScheme, blueColorScheme, blue2ColorScheme];

let start = 0;
let rows = 0;
let signal;
let controller;
let run = 0;
let handlingURLState = false;

const def = getURLParms();

const MandelBrotContainer = () => {
	const [parallel, setParallel] = useState(def.parallel);
	const [lambda, setLambda] = useState(def.lambda);
	const [maxIterations, setMaxIterations] = useState(def.maxIterations);
	const [data, setData] = useState([]);
	const [width, setWidth] = useState(window.innerWidth);
	const [height, setHeight] = useState(window.innerHeight);
	const [zoom, setZoom] = useState(def.zoom);
	const [panx, setPanx] = useState(def.panx);
	const [pany, setPany] = useState(def.pany);
	const canv = useRef(null);
	const [worker, setWorker] = useState(def.worker);
	const [numWorkers, setNumWorkers] = useState(def.numWorkers);
	const [colorScheme, setColorScheme] = useState(def.colorScheme);
	const [linesPerBatch, setLinesPerBatch] = useState(LINES_PER_WORKER_CALL);
	const [time, setTime] = useState(0);

	useEffect(() => {
		if (data && data.length) {
			rows = rows + Object.keys(data).length / width;
			if (rows === height) {
				setTime(performance.now() - start);
			}
			drawData(data, canv);
		}
	});
	useEffect(
		() => {
			setData([]);
			if (controller) {
				controller.abort();
			}
			run++;
			controller = new AbortController();
			signal = controller.signal;
			signal.run = run;

			start = performance.now();
			setTime(0);
			rows = 0;
			calculateMandelbrot(
				parallel === 1,
				signal,
				LAMBDAS[lambda].value,
				width,
				height,
				panx,
				pany,
				zoom,
				setData,
				maxIterations,
				workers[worker],
				numWorkers,
				colorSchemes[colorScheme](maxIterations),
				linesPerBatch
			);
			if (!handlingURLState) {
				console.log('pushstate');
				window.history.pushState(
					{
						width,
						height,
						panx,
						pany,
						zoom,
						worker,
						maxIterations,
						colorScheme,
						numWorkers,
						lambda,
						parallel
					},
					'Mandelbrot',
					`/?panx=${panx}&pany=${pany}&zoom=${zoom}&worker=${worker}&parallel=${parallel}&maxIterations=${maxIterations}&colorScheme=${colorScheme}&numWorkers=${numWorkers}&lambda=${lambda}`
				);
			} else {
				handlingURLState = false;
			}
			const onClick = event => clickHandler(event, width, height, panx, pany, zoom, setPanx, setPany, setZoom);
			const onResize = () => resize(panx, pany, zoom, setWidth, setHeight);
			const handleState = state => {
				handlingURLState = true;
				state = state.state;
				unstable_batchedUpdates(() => {
					setPanx(state.panx);
					setPany(state.pany);
					setParallel(state.parallel);
					setZoom(state.zoom);
					setNumWorkers(state.numWorkers);
					setMaxIterations(state.maxIterations);
					setLambda(state.lambda);
					setWorker(state.worker);
					setColorScheme(state.colorScheme);
				});
			};
			window.addEventListener('resize', onResize);
			window.addEventListener('click', onClick);
			window.addEventListener('popstate', handleState);
			return () => {
				window.removeEventListener('resize', onResize);
				window.removeEventListener('click', onClick);
				window.removeEventListener('popstate', handleState);
			};
		},
		[
			width,
			height,
			panx,
			pany,
			zoom,
			worker,
			maxIterations,
			colorScheme,
			numWorkers,
			linesPerBatch,
			lambda,
			parallel
		]
	);

	return (
		<>
			<ControlPanel
				maxIterations={maxIterations}
				setMaxIterations={setMaxIterations}
				parallel={parallel}
				worker={worker}
				setWorker={setWorker}
				colorScheme={colorScheme}
				numWorkers={numWorkers}
				setNumWorkers={setNumWorkers}
				setParallel={setParallel}
				linesPerBatch={linesPerBatch}
				setLinesPerBatch={setLinesPerBatch}
				setColorScheme={setColorScheme}
				lambda={lambda}
				setLambda={setLambda}
				time={time}
				rows={rows}
			/>
			<canvas id="mainCanvas" ref={canv} width={width} height={height} />
		</>
	);
};

export default MandelBrotContainer;

MandelBrotContainer.propTypes = {
	data: PropTypes.array,
	start: PropTypes.func,
	height: PropTypes.number,
	width: PropTypes.number,
	setWidth: PropTypes.func,
	setHeight: PropTypes.func
};
