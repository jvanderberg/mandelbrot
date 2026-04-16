export const WEBGL_ALGORITHM_LABEL = 'WebGL2 Dual Float Always v1';

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;

void main() {
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

out vec4 outColor;

uniform vec2 u_centerX;
uniform vec2 u_centerY;
uniform vec2 u_pixelSizeX;
uniform vec2 u_pixelSizeY;
uniform float u_halfWidth;
uniform float u_halfHeight;
uniform float u_maxIterations;
uniform float u_colorScheme;
uniform float u_one;
uniform float u_other;
uniform float u_magicA;
uniform float u_magicB;

float hueToRgb(float p, float q, float tIn) {
	float t = tIn;
	if (t < 0.0) {
		t += 1.0;
	}
	if (t > 1.0) {
		t -= 1.0;
	}
	if (t < 1.0 / 6.0) {
		return p + (q - p) * 6.0 * t;
	}
	if (t < 0.5) {
		return q;
	}
	if (t < 2.0 / 3.0) {
		return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
	}
	return p;
}

vec3 hslToRgb(float h, float s, float l) {
	if (s == 0.0) {
		return vec3(l, l, l);
	}

	float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
	float p = 2.0 * l - q;
	return vec3(
		hueToRgb(p, q, h + 1.0 / 3.0),
		hueToRgb(p, q, h),
		hueToRgb(p, q, h - 1.0 / 3.0)
	);
}

vec2 df_add(vec2 a, vec2 b) {
	float one = (u_one + u_other) * 0.5;
	float s = (a.x + b.x) * one;
	float v = (s - a.x) * one;
	float e = ((a.x - (s - v) * one) * one + (b.x - v) * one + (a.y + b.y) * one) * one;
	float x = (s + e) * one;
	float y = (e + (s - x) * one) * one;
	return vec2(x, y);
}

vec2 df_sub(vec2 a, vec2 b) {
	return df_add(a, vec2(-b.x, -b.y));
}

vec2 df_mul(vec2 a, vec2 b) {
	float one = (u_one + u_other) * 0.5;
	float c = u_magicA + u_magicB;
	float x = (a.x * b.x) * one;
	float ax = a.x * c;
	float ay = (ax - (ax - a.x) * one) * one;
	float a_lo = (a.x - ay) * one;
	float bx = b.x * c;
	float by = (bx - (bx - b.x) * one) * one;
	float b_lo = (b.x - by) * one;
	float y = ((ay * by - x) * one + ay * b_lo + a_lo * by + a_lo * b_lo + (a.x * b.y + a.y * b.x) * one) * one;
	float s = (x + y) * one;
	float e = (y + (x - s) * one) * one;
	return vec2(s, e);
}

vec3 fractalColor(int iterations, float maxIterations, float colorScheme) {
	if (float(iterations) >= maxIterations) {
		return vec3(0.0, 0.0, 0.0);
	}

	float progress = float(iterations) / maxIterations;
	if (colorScheme < 0.5) {
		return hslToRgb(fract(progress * 2.0), 0.9, 0.5);
	}
	if (colorScheme < 1.5) {
		float hue = (180.0 + fract(progress * 2.0) * 120.0) / 360.0;
		return hslToRgb(hue, 0.9, 0.5);
	}

	float lightness = fract(progress * 2.0) * 0.75;
	return hslToRgb(220.0 / 360.0, 0.9, lightness);
}

void main() {
	vec2 pixelOffsetX = vec2((gl_FragCoord.x - 0.5) - u_halfWidth, 0.0);
	vec2 pixelOffsetY = vec2(u_halfHeight - gl_FragCoord.y - 0.5, 0.0);
	vec2 cx = df_add(u_centerX, df_mul(u_pixelSizeX, pixelOffsetX));
	vec2 cy = df_add(u_centerY, df_mul(u_pixelSizeY, pixelOffsetY));

	int maxIterations = int(u_maxIterations);
	int iterations = 0;
	vec2 zx = vec2(0.0);
	vec2 zy = vec2(0.0);

	for (int i = 0; i < 50000; i++) {
		if (i >= maxIterations) {
			break;
		}

		vec2 x2 = df_mul(zx, zx);
		vec2 y2 = df_mul(zy, zy);
		if (x2.x + y2.x > 4.0) {
			break;
		}

		vec2 zxy = df_mul(zx, zy);
		zxy = df_mul(zxy, vec2(2.0, 0.0));
		zy = df_add(zxy, cy);
		zx = df_add(df_sub(x2, y2), cx);
		iterations++;
	}

	outColor = vec4(fractalColor(iterations, u_maxIterations, u_colorScheme), 1.0);
}
`;

const rendererCache = new WeakMap();
let supportProbePromise;

function getWebGLContext(canvas, attrs = {}) {
	return canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		preserveDrawingBuffer: true,
		powerPreference: 'high-performance',
		...attrs
	});
}

function compileShader(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error.';
		gl.deleteShader(shader);
		throw new Error(info);
	}
	return shader;
}

function createProgram(gl) {
	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
	const program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(program) || 'Unknown program link error.';
		gl.deleteProgram(program);
		throw new Error(info);
	}
	return program;
}

function splitFloat32(value) {
	const hi = Math.fround(value);
	return [hi, value - hi];
}

export function supportsWebGL() {
	if (typeof document === 'undefined') {
		return false;
	}
	const canvas = document.createElement('canvas');
	return !!getWebGLContext(canvas);
}

export async function probeWebGL() {
	if (supportProbePromise) {
		return supportProbePromise;
	}

	supportProbePromise = Promise.resolve().then(() => {
		if (typeof document === 'undefined') {
			return { supported: false, error: 'WebGL2 is not available in this environment.' };
		}
		const canvas = document.createElement('canvas');
		const gl = getWebGLContext(canvas);
		if (!gl) {
			return { supported: false, error: 'WebGL2 is not available in this browser.' };
		}
		return { supported: true, error: '' };
	});

	return supportProbePromise;
}

async function createRenderer(canvas) {
	const gl = getWebGLContext(canvas);
	if (!gl) {
		throw new Error('Unable to create a WebGL2 canvas context.');
	}

	const program = createProgram(gl);
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
	const quadBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

	const positionLocation = gl.getAttribLocation(program, 'a_position');
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
	gl.bindVertexArray(null);

	const renderer = {
		gl,
		program,
		vao,
		quadBuffer,
		locations: {
			centerX: gl.getUniformLocation(program, 'u_centerX'),
			centerY: gl.getUniformLocation(program, 'u_centerY'),
			pixelSizeX: gl.getUniformLocation(program, 'u_pixelSizeX'),
			pixelSizeY: gl.getUniformLocation(program, 'u_pixelSizeY'),
			halfWidth: gl.getUniformLocation(program, 'u_halfWidth'),
			halfHeight: gl.getUniformLocation(program, 'u_halfHeight'),
			maxIterations: gl.getUniformLocation(program, 'u_maxIterations'),
			colorScheme: gl.getUniformLocation(program, 'u_colorScheme'),
			one: gl.getUniformLocation(program, 'u_one'),
			other: gl.getUniformLocation(program, 'u_other'),
			magicA: gl.getUniformLocation(program, 'u_magicA'),
			magicB: gl.getUniformLocation(program, 'u_magicB')
		}
	};

	rendererCache.set(canvas, renderer);
	return renderer;
}

async function getRenderer(canvas) {
	const cached = rendererCache.get(canvas);
	if (cached) {
		return cached;
	}
	return createRenderer(canvas);
}

export async function renderMandelbrotWebGL(canvas, { width, height, panx, pany, zoom, maxIterations, colorScheme }) {
	const renderer = await getRenderer(canvas);
	const { gl, program, vao, locations } = renderer;

	canvas.width = width;
	canvas.height = height;
	gl.viewport(0, 0, width, height);
	gl.useProgram(program);
	gl.bindVertexArray(vao);

	const centerX = panx / zoom;
	const centerY = pany / zoom;
	const pixelSizeX = 1 / zoom;
	const pixelSizeY = 1 / zoom;
	const [centerXHi, centerXLo] = splitFloat32(centerX);
	const [centerYHi, centerYLo] = splitFloat32(centerY);
	const [pixelSizeXHi, pixelSizeXLo] = splitFloat32(pixelSizeX);
	const [pixelSizeYHi, pixelSizeYLo] = splitFloat32(pixelSizeY);
	const one = 0.5 * Math.round(Math.random() * 100000) * 0.00001;
	const other = 1 - one;

	gl.uniform2f(locations.centerX, centerXHi, centerXLo);
	gl.uniform2f(locations.centerY, centerYHi, centerYLo);
	gl.uniform2f(locations.pixelSizeX, pixelSizeXHi, pixelSizeXLo);
	gl.uniform2f(locations.pixelSizeY, pixelSizeYHi, pixelSizeYLo);
	gl.uniform1f(locations.halfWidth, width / 2);
	gl.uniform1f(locations.halfHeight, height / 2);
	gl.uniform1f(locations.maxIterations, maxIterations);
	gl.uniform1f(locations.colorScheme, colorScheme);
	gl.uniform1f(locations.one, one * 2);
	gl.uniform1f(locations.other, other * 2);
	gl.uniform1f(locations.magicA, 2048 + one);
	gl.uniform1f(locations.magicB, 2048 + other);

	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	gl.bindVertexArray(null);
	gl.finish();
}
