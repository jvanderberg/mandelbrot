import React, { useState } from 'react';

function dlCanvas() {
	const canvas = document.getElementById('mainCanvas');
	const link = document.getElementById('download');
	let dt = canvas.toDataURL('image/png');
	dt = dt.replace(/data:image\/png;base64,/, '');
	const binStr = atob(dt);
	const len = binStr.length;
	const arr = new Uint8Array(len);

	for (let i = 0; i < len; i++) {
		arr[i] = binStr.charCodeAt(i);
	}
	const blob = new Blob([arr], { type: 'image/png' });
	link.href = window.URL.createObjectURL(blob);
	link.download = 'capture.png';
}

export const ControlPanel = ({
	maxIterations,
	setMaxIterations,
	colorScheme,
	setColorScheme,
	rows,
	time,
	onReset
}) => {
	const [showHelp, setShowHelp] = useState(false);

	return (
		<div className="controlPadding">
			<div className="controlPanel" onClick={event => event.stopPropagation()}>
				{showHelp ? (
					<div className="helpPopup" role="dialog" aria-label="Mandelbrot help">
						<div className="helpPopupHeader">
							<strong>How To Use</strong>
							<button
								type="button"
								className="iconButton helpCloseButton"
								onClick={() => setShowHelp(false)}
								aria-label="Close help"
								title="Close help"
							>
								×
							</button>
						</div>
						<div className="helpLine">Drag the image to pan around the set.</div>
						<div className="helpLine">Use mouse wheel, pinch, or the +/- buttons to zoom.</div>
						<div className="helpLine">Raise Max Iterations when deep zooms start losing detail.</div>
						<div className="helpLine">Use the color menu to switch palettes.</div>
						<div className="helpLine">Download saves the current view, and reset returns to the default view.</div>
						<div className="helpIntro">
							The Mandelbrot set is the collection of complex values <code>c</code> where repeatedly applying
							<code> z = z² + c </code>
							starting from <code>z = 0</code> stays bounded instead of escaping to infinity.
						</div>
					</div>
				) : null}
				<div className="row">
					<label>Max Iterations</label>
					<span>
						<select value={maxIterations} onChange={event => setMaxIterations(Number(event.target.value))}>
							<option value="100">100</option>
							<option value="250">250</option>
							<option value="500">500</option>
							<option value="1000">1000</option>
							<option value="2500">2500</option>
							<option value="5000">5000</option>
							<option value="7500">7500</option>
							<option value="10000">10000</option>
							<option value="15000">15000</option>
							<option value="20000">20000</option>
							<option value="30000">30000</option>
							<option value="40000">40000</option>
							<option value="50000">50000</option>
						</select>
					</span>
				</div>
				<div className="row">
					<label>Color Scheme</label>
					<span>
						<select value={colorScheme} onChange={event => setColorScheme(Number(event.target.value))}>
							<option value="0">Spectrum</option>
							<option value="1">Blue</option>
							<option value="2">Midnight</option>
						</select>
					</span>
				</div>
				<div className="row">
					<label>Rows/Sec</label>
					<span>{time > 0 ? ((rows * 1000) / time).toFixed(0) : 0}</span>
				</div>
				<div className="row">
					<span className="panelActions">
						<a onClick={() => dlCanvas()} id="download" href="blank">
							⇩ Download Image
						</a>
						<button
							type="button"
							className="iconButton helpButton"
							onClick={() => setShowHelp(value => !value)}
							aria-label="Show help"
							aria-expanded={showHelp}
							title="How to use"
						>
							?
						</button>
						<button type="button" className="iconButton" onClick={onReset} aria-label="Reset view" title="Reset view">
							↻
						</button>
					</span>
				</div>
			</div>
		</div>
	);
};
