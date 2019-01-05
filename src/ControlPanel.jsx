import React from 'react';
import { LAMBDAS } from './common';

const showRemote = [true, true, true, false, true];
const showLines = [false, false, true, false, true];

export const ControlPanel = ({
	maxIterations,
	setMaxIterations,
	method,
	worker,
	setWorker,
	colorScheme,
	setColorScheme,
	numWorkers,
	setNumWorkers,
	setMethod,
	linesPerBatch,
	setLinesPerBatch,
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
				<label for="remoteCheckbox" className={!showRemote[method] ? 'disabled' : 'enabled'}>
					Remote
				</label>
				<span>
					<input
						id="remoteCheckbox"
						disabled={!showRemote[method]}
						type="checkbox"
						checked={worker === 1}
						onChange={event => {
							setWorker(event.target.checked === true ? 1 : 0);
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
					</select>
				</span>
			</div>
			<div className="row">
				<label>Method</label>
				<span>
					<select value={method} onChange={event => setMethod(Number(event.target.value))}>
						<option value="0">Single Threaded</option>
						<option value="1">Single Threaded with Feedback</option>
						<option value="2">Cooperative Threaded</option>
						<option value="3">GPU</option>
						<option value="4">Webworker</option>
					</select>
				</span>
			</div>
			<div className="row">
				<label className={!showLines[method] ? 'disabled' : 'enabled'}>Rows per Batch</label>
				<span>
					<select
						disabled={!showLines[method]}
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
			<div className="row">
				<label>Rows/Time</label>
				<span>
					{rows} / {(time / 10).toFixed(0) / 100}
				</span>
			</div>
		</div>
	</div>
);
