import React, { useEffect, useState, useRef } from 'react';
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
	LINES_PER_WORKER_CALL
} from './common.js';
let timer;

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
	setZoom(newZoom);
	setPanx(newPanx * deltaZ);
	setPany(newPany * deltaZ);
}

const workers = [getIterations, getIterationsRemote];
const colorSchemes = [rainbowColorScheme, blueColorScheme, blue2ColorScheme];
const MandelBrotContainer = () => {
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
	useEffect(
		() => {
			//Debounce calls to 'calculate' as they are very very expensive
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(
				() =>
					calculateMandelbrot(
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
					),
				200
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
		[width, height, panx, pany, zoom, worker, maxIterations, worker, colorScheme, numWorkers, linesPerBatch]
	);
	useEffect(() => {
		if (data && data.length) {
			drawData(data, canv);
		}
	});

	return (
		<>
			<div className="controlPadding">
				<div className="controlPanel" onClick={event => event.stopPropagation()}>
					<div className="row">
						<label>Max Iterations</label>
						<span>
							<input
								type="text"
								value={maxIterations}
								onChange={event => setMaxIterations(Number(event.target.value))}
							/>
						</span>
					</div>
					<div className="row">
						<label>Remote</label>
						<span>
							<input
								type="checkbox"
								checked={worker === 1}
								onChange={event => {
									setWorker(event.target.checked === true ? 1 : 0);
								}}
							/>
						</span>
					</div>
					<div className="row">
						<label>Color Scheme</label>
						<span>
							<select value={colorScheme} onChange={event => setColorScheme(Number(event.target.value))}>
								<option value="0">Spectrum</option>
								<option value="1">Blue</option>
								<option value="2">Blue2</option>
							</select>
						</span>
					</div>
					<div className="row">
						<label>Number of Workers</label>
						<span>
							<select value={numWorkers} onChange={event => setNumWorkers(Number(event.target.value))}>
								<option value="1">1</option>
								<option value="2">2</option>
								<option value="3">3</option>
								<option value="4">4</option>
								<option value="8">8</option>
								<option value="16">16</option>
								<option value="32">32</option>
								<option value="64">64</option>
							</select>
						</span>
					</div>
					<div className="row">
						<label>Rows per Batch</label>
						<span>
							<select
								value={linesPerBatch}
								onChange={event => setLinesPerBatch(Number(event.target.value))}
							>
								<option value="50">50</option>
								<option value="25">25</option>
								<option value="10">10</option>
								<option value="1">1</option>
								<option value="0">All</option>
							</select>
						</span>
					</div>
				</div>
			</div>
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
