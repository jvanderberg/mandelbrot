import React, { useEffect, useRef, useState } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import {
	MAX_ITERATIONS,
	FIXED_WORKERS,
	ROW_STRIDE,
	blue2ColorScheme,
	blueColorScheme,
	calculateMandelbrot,
	drawData,
	rainbowColorScheme
} from './common.js';
import { ControlPanel } from './ControlPanel.jsx';

const WHEEL_DEBOUNCE_MS = 50;

function getURLParms() {
	const parms = new URLSearchParams(window.location.search);
	let url = {};
	for (const entry of parms.entries()) {
		url = { ...url, [entry[0]]: Number(entry[1]) };
	}
	return {
		maxIterations: MAX_ITERATIONS,
		zoom: 200,
		panx: 0,
		pany: 0,
		colorScheme: 0,
		...url
	};
}

function resize(setWidth, setHeight) {
	unstable_batchedUpdates(() => {
		setWidth(window.innerWidth);
		setHeight(window.innerHeight);
	});
}

function zoomViewAtPoint(pageX, pageY, deltaZ, width, height, panx, pany, zoom) {
	const newZoom = zoom * deltaZ;
	return {
		width,
		height,
		zoom: newZoom,
		panx: (((pageX - width / 2) + panx) / zoom) * newZoom - (pageX - width / 2),
		pany: (((pageY - height / 2) + pany) / zoom) * newZoom - (pageY - height / 2)
	};
}

function createPreviewTransform(fromView, toView) {
	const scale = toView.zoom / fromView.zoom;
	return {
		scale,
		translateX: (fromView.panx - fromView.width / 2) * scale - toView.panx + toView.width / 2,
		translateY: (fromView.pany - fromView.height / 2) * scale - toView.pany + toView.height / 2
	};
}

function syncPreviewCanvas(sourceCanvasRef, previewCanvasRef) {
	if (!sourceCanvasRef.current || !previewCanvasRef.current) {
		return;
	}
	const sourceCanvas = sourceCanvasRef.current;
	const previewCanvas = previewCanvasRef.current;
	previewCanvas.width = sourceCanvas.width;
	previewCanvas.height = sourceCanvas.height;
	const context = previewCanvas.getContext('2d', { alpha: false });
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.imageSmoothingEnabled = false;
	context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
	context.drawImage(sourceCanvas, 0, 0);
}

function bakePreviewToMainCanvas(mainCanvasRef, previewCanvasRef, previewTransform) {
	if (!mainCanvasRef.current || !previewCanvasRef.current) {
		return;
	}
	const mainCanvas = mainCanvasRef.current;
	const previewCanvas = previewCanvasRef.current;
	const context = mainCanvas.getContext('2d', { alpha: false });
	context.save();
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
	context.imageSmoothingEnabled = false;
	context.setTransform(
		previewTransform.scale,
		0,
		0,
		previewTransform.scale,
		previewTransform.translateX,
		previewTransform.translateY
	);
	context.drawImage(previewCanvas, 0, 0);
	context.restore();
}

function resetPreview(setPreviewTransform, previewTransformRef) {
	const identity = { scale: 1, translateX: 0, translateY: 0 };
	previewTransformRef.current = identity;
	setPreviewTransform(identity);
}

function panViewByDelta(deltaX, deltaY, panx, pany) {
	return {
		panx: panx - deltaX,
		pany: pany - deltaY
	};
}

const colorSchemes = [rainbowColorScheme, blueColorScheme, blue2ColorScheme];

let start = 0;
let rows = 0;
let signal;
let controller;
let run = 0;
let handlingURLState = false;
let hasHydratedURL = false;

const def = getURLParms();

const MandelBrotContainer = () => {
	const [maxIterations, setMaxIterations] = useState(def.maxIterations);
	const [data, setData] = useState([]);
	const [width, setWidth] = useState(window.innerWidth);
	const [height, setHeight] = useState(window.innerHeight);
	const [zoom, setZoom] = useState(def.zoom);
	const [panx, setPanx] = useState(def.panx);
	const [pany, setPany] = useState(def.pany);
	const [colorScheme, setColorScheme] = useState(def.colorScheme);
	const [time, setTime] = useState(0);
	const canv = useRef(null);
	const previewCanv = useRef(null);
	const viewRef = useRef({ width, height, panx, pany, zoom });
	const wheelTimeout = useRef();
	const pendingView = useRef(null);
	const previewModeRef = useRef('idle');
	const previewVisibleRef = useRef(false);
	const previewTransformRef = useRef({ scale: 1, translateX: 0, translateY: 0 });
	const [previewTransform, setPreviewTransform] = useState({ scale: 1, translateX: 0, translateY: 0 });
	const [previewVisible, setPreviewVisible] = useState(false);
	const dragRef = useRef({ active: false, startX: 0, startY: 0 });
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		viewRef.current = { width, height, panx, pany, zoom };
	}, [width, height, panx, pany, zoom]);

	useEffect(() => {
		previewVisibleRef.current = previewVisible;
	}, [previewVisible]);

	useEffect(() => {
		const pixels = data?.pixels ?? data;
		if (pixels && Object.keys(pixels).length) {
			rows = rows + (data?.rowUnits ?? Object.keys(pixels).length / width);
			if (rows >= height) {
				setTime(performance.now() - start);
			}
			drawData(data, canv);
			if (previewModeRef.current === 'committing') {
				previewModeRef.current = 'idle';
				pendingView.current = null;
				resetPreview(setPreviewTransform, previewTransformRef);
				setPreviewVisible(false);
			}
		}
	}, [data, height, width]);

	useEffect(() => {
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
			signal,
			width,
			height,
			panx,
			pany,
			zoom,
			setData,
			maxIterations,
			colorSchemes[colorScheme](maxIterations)
		);

		if (!handlingURLState) {
			if (!hasHydratedURL) {
				hasHydratedURL = true;
			} else {
			const nextSearch = `?panx=${panx}&pany=${pany}&zoom=${zoom}&maxIterations=${maxIterations}&colorScheme=${colorScheme}`;
			window.history.pushState(
				{
					panx,
					pany,
					zoom,
					maxIterations,
					colorScheme
				},
				'Mandelbrot',
				`${window.location.pathname}${nextSearch}`
			);
			}
		} else {
			handlingURLState = false;
		}

		const onMouseDown = event => {
			if (event.button !== 0 || event.target !== canv.current) {
				return;
			}
			window.clearTimeout(wheelTimeout.current);
			pendingView.current = null;
			resetPreview(setPreviewTransform, previewTransformRef);
			syncPreviewCanvas(canv, previewCanv);
			previewModeRef.current = 'interactive';
			setPreviewVisible(true);
			dragRef.current = {
				active: true,
				startX: event.pageX,
				startY: event.pageY
			};
			setIsDragging(true);
		};

		const onMouseMove = event => {
			if (!dragRef.current.active) {
				return;
			}
			const translateX = event.pageX - dragRef.current.startX;
			const translateY = event.pageY - dragRef.current.startY;
			const nextPreviewTransform = { scale: 1, translateX, translateY };
			previewTransformRef.current = nextPreviewTransform;
			setPreviewTransform(nextPreviewTransform);
		};

		const onMouseUp = event => {
			if (!dragRef.current.active) {
				return;
			}
			dragRef.current.active = false;
			setIsDragging(false);
			const deltaX = event.pageX - dragRef.current.startX;
			const deltaY = event.pageY - dragRef.current.startY;
			if (deltaX === 0 && deltaY === 0) {
				resetPreview(setPreviewTransform, previewTransformRef);
				setPreviewVisible(false);
				return;
			}
			if (controller) {
				controller.abort();
			}
			previewModeRef.current = 'committing';
			bakePreviewToMainCanvas(canv, previewCanv, previewTransformRef.current);
			resetPreview(setPreviewTransform, previewTransformRef);
			setPreviewVisible(false);
			const nextView = panViewByDelta(deltaX, deltaY, viewRef.current.panx, viewRef.current.pany);
			unstable_batchedUpdates(() => {
				setPanx(nextView.panx);
				setPany(nextView.pany);
			});
		};

		const onWheel = event => {
			event.preventDefault();
			const currentPreviewView = pendingView.current ?? viewRef.current;
			const nextPreviewView = zoomViewAtPoint(
				event.pageX,
				event.pageY,
				Math.exp(-event.deltaY * 0.0015),
				currentPreviewView.width,
				currentPreviewView.height,
				currentPreviewView.panx,
				currentPreviewView.pany,
				currentPreviewView.zoom
			);
			pendingView.current = nextPreviewView;
			if (!previewVisibleRef.current) {
				syncPreviewCanvas(canv, previewCanv);
				setPreviewVisible(true);
			}
			previewModeRef.current = 'interactive';
			const nextPreviewTransform = createPreviewTransform(viewRef.current, nextPreviewView);
			previewTransformRef.current = nextPreviewTransform;
			setPreviewTransform(nextPreviewTransform);
			window.clearTimeout(wheelTimeout.current);
			wheelTimeout.current = window.setTimeout(() => {
				const nextView = pendingView.current;
				if (!nextView) {
					return;
				}
				if (controller) {
					controller.abort();
				}
				previewModeRef.current = 'committing';
				bakePreviewToMainCanvas(canv, previewCanv, previewTransformRef.current);
				resetPreview(setPreviewTransform, previewTransformRef);
				setPreviewVisible(false);
				unstable_batchedUpdates(() => {
					setZoom(nextView.zoom);
					setPanx(nextView.panx);
					setPany(nextView.pany);
				});
			}, WHEEL_DEBOUNCE_MS);
		};

		const onResize = () => resize(setWidth, setHeight);
		const handleState = event => {
			if (!event.state) {
				return;
			}
			handlingURLState = true;
			const state = event.state;
			unstable_batchedUpdates(() => {
				setPanx(state.panx);
				setPany(state.pany);
				setZoom(state.zoom);
				setMaxIterations(state.maxIterations);
				setColorScheme(state.colorScheme);
			});
		};

		window.addEventListener('resize', onResize);
		window.addEventListener('mousedown', onMouseDown);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		window.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('popstate', handleState);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			window.removeEventListener('wheel', onWheel);
			window.removeEventListener('popstate', handleState);
			window.clearTimeout(wheelTimeout.current);
			dragRef.current.active = false;
		};
	}, [width, height, panx, pany, zoom, maxIterations, colorScheme]);

	const canvasStyle = {
		cursor: isDragging ? 'grabbing' : 'grab',
		visibility: previewVisible ? 'hidden' : 'visible'
	};
	const previewCanvasStyle = previewVisible
		? {
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				transformOrigin: '0 0',
				transform: `matrix(${previewTransform.scale}, 0, 0, ${previewTransform.scale}, ${previewTransform.translateX}, ${previewTransform.translateY})`,
				willChange: 'transform'
			}
		: { display: 'none' };

	return (
		<>
			<ControlPanel
				maxIterations={maxIterations}
				setMaxIterations={setMaxIterations}
				colorScheme={colorScheme}
				setColorScheme={setColorScheme}
				rows={rows}
				time={time}
				workerCount={FIXED_WORKERS}
				rowStride={ROW_STRIDE}
			/>
			<div style={{ position: 'relative', width, height, backgroundColor: '#000' }}>
				<canvas id="mainCanvas" ref={canv} width={width} height={height} style={canvasStyle} />
				<canvas ref={previewCanv} width={width} height={height} style={previewCanvasStyle} />
			</div>
		</>
	);
};

export default MandelBrotContainer;
