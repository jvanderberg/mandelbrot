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
	calculateMandelbrotGPU,
	calculateMandelbrotSync,
	calculateMandelbrotParallelSync,
	calculateMandelbrotFeedback,
	LAMBDAS
} from './common.js';
import { ControlPanel } from './ControlPanel.jsx';
import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from 'constants';

function resize(panx, pany, zoom, setWidth, setHeight) {
	setWidth(window.innerWidth);
	setHeight(window.innerHeight);
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

const workers = [getIterations, getIterationsRemote];
const colorSchemes = [rainbowColorScheme, blueColorScheme, blue2ColorScheme];
const methods = [
	calculateMandelbrotSync,
	calculateMandelbrotFeedback,
	calculateMandelbrotParallelSync,
	calculateMandelbrotGPU,
	calculateMandelbrot
];

let start = 0;
let rows = 0;
let stop = 0;
const MandelBrotContainer = () => {
	const [lambda, setLambda] = useState(0);
	const [maxIterations, setMaxIterations] = useState(MAX_ITERATIONS);
	const [data, setData] = useState([]);
	const [width, setWidth] = useState(window.innerWidth);
	const [height, setHeight] = useState(window.innerHeight);
	const [zoom, setZoom] = useState(200);
	const [panx, setPanx] = useState(0);
	const [pany, setPany] = useState(0);
	const canv = useRef(null);
	const [worker, setWorker] = useState(0);
	const [numWorkers, setNumWorkers] = useState(NUM_WORKERS);
	const [colorScheme, setColorScheme] = useState(0);
	const [linesPerBatch, setLinesPerBatch] = useState(LINES_PER_WORKER_CALL);
	const [method, setMethod] = useState(0);
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
			const context = canv.current.getContext('2d');

			context.clearRect(0, 0, canv.current.width, canv.current.height);
			setData([]);
			start = performance.now();
			setTime(0);
			rows = 0;
			methods[method](
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
			const onClick = event => clickHandler(event, width, height, panx, pany, zoom, setPanx, setPany, setZoom);
			const onResize = () => resize(panx, pany, zoom, setWidth, setHeight);

			window.addEventListener('resize', onResize);
			window.addEventListener('click', onClick);
			return () => {
				window.removeEventListener('resize', onResize);
				window.removeEventListener('click', onClick);
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
			worker,
			colorScheme,
			numWorkers,
			linesPerBatch,
			method,
			lambda
		]
	);

	return (
		<>
			<ControlPanel
				maxIterations={maxIterations}
				setMaxIterations={setMaxIterations}
				method={method}
				worker={worker}
				setWorker={setWorker}
				colorScheme={colorScheme}
				numWorkers={numWorkers}
				setNumWorkers={setNumWorkers}
				setMethod={setMethod}
				linesPerBatch={linesPerBatch}
				setLinesPerBatch={setLinesPerBatch}
				setColorScheme={setColorScheme}
				lambda={lambda}
				setLambda={setLambda}
				time={time}
				rows={rows}
			/>
			<canvas ref={canv} width={width} height={height} />
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
