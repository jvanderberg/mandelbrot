import React from 'react';
import { LAMBDAS } from './common';

function dlCanvas() {
	const canvas = document.getElementById('mainCanvas');
	const link = document.getElementById('download');
	let dt = canvas.toDataURL('image/png');
	dt = dt.replace(/data:image\/png;base64,/, '');
	const binStr = atob(dt);
	const len = binStr.length;
	const arr = new Uint8Array(len);

	for (var i = 0; i < len; i++) {
		arr[i] = binStr.charCodeAt(i);
	}
	var blob = new Blob([arr], { type: 'image/png' });
	link.href = window.URL.createObjectURL(blob);
	link.download = 'capture.png';
}

export const ControlPanel = ({
	maxIterations,
	setMaxIterations,
	parallel,
	worker,
	setWorker,
	colorScheme,
	setColorScheme,
	numWorkers,
	setNumWorkers,
	setParallel,
	lambda,
	setLambda,
	rows,
	time
}) => (
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
				<label>Calc Location</label>
				<span>
					<select value={worker} onChange={event => setWorker(Number(event.target.value))}>
						<option value="0">Local</option>
						<option value="1">Remote</option>
						<option value="2">GPU</option>
					</select>
				</span>
			</div>
			<div className="row">
				<label className={worker === 2 ? 'disabled' : 'enabled'}>Parallel</label>
				<span>
					<input
						id="parallelCheckbox"
						disabled={worker === 2}
						type="checkbox"
						checked={parallel === 1}
						onChange={event => {
							setParallel(event.target.checked ? 1 : 0);
						}}
					/>
				</span>
			</div>

			<div className="row">
				<label className={worker === 0 ? 'disabled' : 'enabled'}>Remote Lambda</label>
				<span>
					<select disabled={worker === 0} value={lambda} onChange={event => setLambda(event.target.value)}>
						{LAMBDAS.map((l, index) => (
							<option value={index}>{LAMBDAS[index].name}</option>
						))}
					</select>
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
						<option value="128">128</option>
					</select>
				</span>
			</div>

			<div className="row">
				<label>Rows/Time</label>
				<span>
					{rows} / {(time / 10).toFixed(0) / 100}
				</span>
			</div>
			<div className="row">
				<a onClick={() => dlCanvas()} id="download" href="blank">
					Download Image
				</a>
			</div>
		</div>
	</div>
);
