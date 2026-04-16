import React, { useEffect, useRef, useState } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { useGesture } from '@use-gesture/react';
import {
	MAX_ITERATIONS,
	calculateMandelbrot,
	drawData,
	syncDrawBufferFromCanvas
} from './common.js';
import { ControlPanel } from './ControlPanel.jsx';

const WHEEL_DEBOUNCE_MS = 10;
const URL_UPDATE_DEBOUNCE_MS = 300;
const PINCH_ZOOM_IN_DAMPING = 0.45;
const PINCH_ZOOM_OUT_DAMPING = 0.85;

function getViewportSize() {
	const viewport = window.visualViewport;
	return {
		width: Math.round(viewport?.width ?? window.innerWidth),
		height: Math.round(viewport?.height ?? window.innerHeight)
	};
}

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
	const viewport = getViewportSize();
	unstable_batchedUpdates(() => {
		setWidth(viewport.width);
		setHeight(viewport.height);
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

function applyPreviewTransform(previewCanvasRef, previewTransform) {
	const previewCanvas = previewCanvasRef.current;
	if (!previewCanvas) {
		return;
	}
	previewCanvas.style.transform = `matrix(${previewTransform.scale}, 0, 0, ${previewTransform.scale}, ${previewTransform.translateX}, ${previewTransform.translateY})`;
}

function resetPreview(previewCanvasRef, previewTransformRef) {
	const identity = { scale: 1, translateX: 0, translateY: 0 };
	previewTransformRef.current = identity;
	applyPreviewTransform(previewCanvasRef, identity);
}

function panViewByDelta(deltaX, deltaY, panx, pany) {
	return {
		panx: panx - deltaX,
		pany: pany - deltaY
	};
}

function invalidateNextRun(activeRunRef) {
	activeRunRef.current += 1;
	return activeRunRef.current;
}

function defaultView() {
	return {
		zoom: 200,
		panx: 0,
		pany: 0
	};
}

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
	const initialViewport = getViewportSize();
	const [width, setWidth] = useState(initialViewport.width);
	const [height, setHeight] = useState(initialViewport.height);
	const [zoom, setZoom] = useState(def.zoom);
	const [panx, setPanx] = useState(def.panx);
	const [pany, setPany] = useState(def.pany);
	const [colorScheme, setColorScheme] = useState(def.colorScheme);
	const [time, setTime] = useState(0);
	const canv = useRef(null);
	const previewCanv = useRef(null);
	const gestureSurface = useRef(null);
	const viewRef = useRef({ width, height, panx, pany, zoom });
	const wheelTimeout = useRef();
	const urlStateTimeout = useRef();
	const pendingView = useRef(null);
	const previewModeRef = useRef('idle');
	const previewVisibleRef = useRef(false);
	const previewTransformRef = useRef({ scale: 1, translateX: 0, translateY: 0 });
	const [previewVisible, setPreviewVisible] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const activeRunRef = useRef(0);
	const activeGestureRef = useRef('none');
	const pinchBaselineRef = useRef(0);
	const pendingChunksRef = useRef([]);
	const pendingRowUnitsRef = useRef(0);
	const drawFlushRef = useRef(0);

	useEffect(() => {
		viewRef.current = { width, height, panx, pany, zoom };
	}, [width, height, panx, pany, zoom]);

	useEffect(() => {
		previewVisibleRef.current = previewVisible;
	}, [previewVisible]);

	useEffect(() => {
		if (data?.runId !== undefined && data.runId !== activeRunRef.current) {
			return;
		}
		if (previewModeRef.current === 'interactive') {
			return;
		}
		const chunks = data?.chunks ?? [];
		if (chunks.length) {
			rows =
				rows +
				(data?.rowUnits ??
					chunks.reduce((count, chunk) => count + (chunk?.lineCount ?? 0), 0));
			setTime(performance.now() - start);
			drawData(data, canv);
			if (previewModeRef.current === 'committing') {
				previewModeRef.current = 'idle';
				pendingView.current = null;
				resetPreview(previewCanv, previewTransformRef);
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
		activeRunRef.current = run;
		controller = new AbortController();
		signal = controller.signal;
		signal.run = run;

		start = performance.now();
		setTime(0);
		rows = 0;
		pendingChunksRef.current = [];
		pendingRowUnitsRef.current = 0;
		if (drawFlushRef.current) {
			window.cancelAnimationFrame(drawFlushRef.current);
			drawFlushRef.current = 0;
		}

		const enqueueData = batch => {
			if (!batch || batch.runId !== activeRunRef.current) {
				return;
			}
			if (batch.chunks?.length) {
				pendingChunksRef.current.push(...batch.chunks);
			}
			pendingRowUnitsRef.current += batch.rowUnits ?? 0;
			if (drawFlushRef.current) {
				return;
			}
			drawFlushRef.current = window.requestAnimationFrame(() => {
				drawFlushRef.current = 0;
				const chunks = pendingChunksRef.current.splice(0);
				const rowUnits = pendingRowUnitsRef.current;
				pendingRowUnitsRef.current = 0;
				if (!chunks.length) {
					return;
				}
				setData({
					runId: activeRunRef.current,
					chunks,
					rowUnits
				});
			});
		};

		calculateMandelbrot(
			signal,
			run,
			width,
			height,
			panx,
			pany,
			zoom,
			enqueueData,
			maxIterations,
			colorScheme
		);

		if (!handlingURLState) {
			if (!hasHydratedURL) {
				hasHydratedURL = true;
			} else {
				window.clearTimeout(urlStateTimeout.current);
				urlStateTimeout.current = window.setTimeout(() => {
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
				}, URL_UPDATE_DEBOUNCE_MS);
			}
		} else {
			handlingURLState = false;
		}

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
			applyPreviewTransform(previewCanv, nextPreviewTransform);
			window.clearTimeout(wheelTimeout.current);
			wheelTimeout.current = window.setTimeout(() => {
				const nextView = pendingView.current;
				if (!nextView) {
					return;
				}
				commitPreview(nextView);
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
		window.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('popstate', handleState);
		window.visualViewport?.addEventListener('resize', onResize);
		window.visualViewport?.addEventListener('scroll', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('wheel', onWheel);
			window.removeEventListener('popstate', handleState);
			window.visualViewport?.removeEventListener('resize', onResize);
			window.visualViewport?.removeEventListener('scroll', onResize);
			window.clearTimeout(wheelTimeout.current);
			window.clearTimeout(urlStateTimeout.current);
			if (drawFlushRef.current) {
				window.cancelAnimationFrame(drawFlushRef.current);
				drawFlushRef.current = 0;
			}
		};
	}, [width, height, panx, pany, zoom, maxIterations, colorScheme]);

	const beginPreview = () => {
		if (controller) {
			controller.abort();
		}
		invalidateNextRun(activeRunRef);
		pendingChunksRef.current = [];
		pendingRowUnitsRef.current = 0;
		if (drawFlushRef.current) {
			window.cancelAnimationFrame(drawFlushRef.current);
			drawFlushRef.current = 0;
		}
		window.clearTimeout(wheelTimeout.current);
		pendingView.current = null;
		resetPreview(previewCanv, previewTransformRef);
		syncPreviewCanvas(canv, previewCanv);
		previewModeRef.current = 'interactive';
		setPreviewVisible(true);
	};

	const commitPreview = nextView => {
		activeGestureRef.current = 'none';
		if (!nextView) {
			resetPreview(previewCanv, previewTransformRef);
			setPreviewVisible(false);
			return;
		}
		previewModeRef.current = 'committing';
		bakePreviewToMainCanvas(canv, previewCanv, previewTransformRef.current);
		syncDrawBufferFromCanvas(canv);
		resetPreview(previewCanv, previewTransformRef);
		setPreviewVisible(false);
		unstable_batchedUpdates(() => {
			if (nextView.zoom !== undefined) {
				setZoom(nextView.zoom);
			}
			setPanx(nextView.panx);
			setPany(nextView.pany);
		});
	};

	const commitViewport = nextView => {
		beginPreview();
		pendingView.current = nextView;
		const previewFromView = viewRef.current;
		const nextPreviewTransform = createPreviewTransform(
			{ ...previewFromView, width, height },
			{ ...previewFromView, width, height, ...nextView }
		);
		previewTransformRef.current = nextPreviewTransform;
		applyPreviewTransform(previewCanv, nextPreviewTransform);
		commitPreview(nextView);
	};

	const zoomFromButton = factor => {
		const currentView = viewRef.current;
		const centerX = width / 2;
		const centerY = height / 2;
		const nextView = zoomViewAtPoint(
			centerX,
			centerY,
			factor,
			currentView.width,
			currentView.height,
			currentView.panx,
			currentView.pany,
			currentView.zoom
		);
		commitViewport(nextView);
	};

	const resetView = () => {
		commitViewport(defaultView());
	};

	const bind = useGesture(
		{
			onDragStart: ({ event, touches, cancel }) => {
				if (touches > 1) {
					cancel();
					return;
				}
				if (event.target !== gestureSurface.current && event.target !== canv.current) {
					return;
				}
				activeGestureRef.current = 'drag';
				beginPreview();
				setIsDragging(true);
			},
			onDrag: ({ active, movement: [mx, my], touches, pinching, cancel }) => {
				if (!active) {
					return;
				}
				if (touches > 1 || pinching) {
					activeGestureRef.current = 'pinch';
					cancel();
					setIsDragging(false);
					return;
				}
				if (activeGestureRef.current !== 'drag') {
					return;
				}
				const nextPreviewTransform = { scale: 1, translateX: mx, translateY: my };
				previewTransformRef.current = nextPreviewTransform;
				applyPreviewTransform(previewCanv, nextPreviewTransform);
			},
			onDragEnd: ({ movement: [mx, my] }) => {
				setIsDragging(false);
				if (activeGestureRef.current !== 'drag') {
					return;
				}
				if (mx === 0 && my === 0) {
					activeGestureRef.current = 'none';
					resetPreview(previewCanv, previewTransformRef);
					setPreviewVisible(false);
					return;
				}
				commitPreview(panViewByDelta(mx, my, viewRef.current.panx, viewRef.current.pany));
			},
			onPinchStart: () => {
				activeGestureRef.current = 'pinch';
				pinchBaselineRef.current = 0;
				beginPreview();
				setIsDragging(false);
			},
			onPinch: ({ origin: [ox, oy], movement: [movementScale], first }) => {
				if (activeGestureRef.current !== 'pinch') {
					return;
				}
				if (first) {
					pinchBaselineRef.current = movementScale;
				}
				const baseView = viewRef.current;
				const calibratedMovement = movementScale - pinchBaselineRef.current;
				const gestureScale = 1 + calibratedMovement;
				const damping = gestureScale >= 1 ? PINCH_ZOOM_IN_DAMPING : PINCH_ZOOM_OUT_DAMPING;
				const dampedScale = 1 + (gestureScale - 1) * damping;
				const nextView = zoomViewAtPoint(
					ox,
					oy,
					Math.max(0.1, dampedScale),
					baseView.width,
					baseView.height,
					baseView.panx,
					baseView.pany,
					baseView.zoom
				);
				pendingView.current = nextView;
				const nextPreviewTransform = createPreviewTransform(baseView, nextView);
				previewTransformRef.current = nextPreviewTransform;
				applyPreviewTransform(previewCanv, nextPreviewTransform);
			},
			onPinchEnd: () => {
				if (activeGestureRef.current !== 'pinch') {
					return;
				}
				commitPreview(pendingView.current);
			}
		},
		{
			drag: {
				pointer: { touch: true, capture: false },
				filterTaps: true
			},
			pinch: {
				pointer: { touch: true },
				pinchOnWheel: false
			},
			eventOptions: { passive: false }
		}
	);

	const canvasStyle = {
		cursor: isDragging ? 'grabbing' : 'grab',
		visibility: previewVisible ? 'hidden' : 'visible',
		touchAction: 'none'
	};
	const previewCanvasStyle = previewVisible
		? {
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				transformOrigin: '0 0',
				transform: 'matrix(1, 0, 0, 1, 0, 0)',
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
				onReset={resetView}
			/>
			<div className="zoomControls">
				<button type="button" className="zoomButton" onClick={() => zoomFromButton(1.35)}>
					+
				</button>
				<button type="button" className="zoomButton" onClick={() => zoomFromButton(1 / 1.35)}>
					-
				</button>
			</div>
			<div
				ref={gestureSurface}
				{...bind()}
				style={{ position: 'relative', width, height, backgroundColor: '#000', touchAction: 'none' }}
			>
				<canvas id="mainCanvas" ref={canv} width={width} height={height} style={canvasStyle} />
				<canvas ref={previewCanv} width={width} height={height} style={previewCanvasStyle} />
			</div>
		</>
	);
};

export default MandelBrotContainer;
