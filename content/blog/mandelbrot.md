---
title: Mandelbrot Viewer
description: Now with more potential!
date: 2024-11-17
tags: demo
---

<iframe src="/demos/mandelbrot" title="Mandelbrot Viewer Demo"> </iframe>

<a href="/demos/mandelbrot">Fullscreen</a>

## Explanation

Click and drag to select a region to zoom in on. Right click to zoom back out.

<br>

This was my first time implementing the continuous coloration algorithm for the Mandelbrot
set. I had always been intimidated by this algorithm as the mathematics looked quite
strange at first glance, and complex analysis was not my strongest area. I still do not
fully understand the mathematics involved in deriving the potential function of the
Mandelbrot set itself, but if one simply accepts that the potential function is valid then
the broad strokes of the algorithm are quite simple. In the end, figuring out how to
display a border over the selection when you click and drag the mouse proved to be the more
challenging problem in putting together this demo. Maybe next time I write a Mandelbrot
renderer I will finally get around to learning how to simulate double precision floating
point values with a float vector in order to maximize zoom depth.

<br>

<a href="https://en.wikipedia.org/wiki/Plotting_algorithms_for_the_Mandelbrot_set#Continuous_(smooth)_coloring">The Wikipedia
page</a> on plotting algorithms for the Mandelbrot set has a pretty decent explanation of
how the algorithm works.
The potential function gives us a continuous analog to the escape time of a given
point, and by taking the limit as the bailout radius gets very large and rearranging some
terms we can derive an expression for a continuous value that is a function of the selected
point and is within an error of at most 1 of the escape time of that point. This gives us a
way to assign colorings to individual points that behaves much the same as the naive escape
time algorithm with the benefit of being continuous and hence yielding smooth colorations.
The code itself actually does the usual iterative escape time approach with an added step
of computing the continuous error term and adding it to the iteration number, so in
practice it is really just like adding an additional smoothing step to the naive escape
time algorithm.

## Source

```
import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main()	{
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform vec2 bot_left;
uniform vec2 top_right;

void main() {
    vec2 dims = top_right.xy - bot_left.xy;
    vec2 coord = bot_left.xy + vUv.xy * dims.xy;

    int iteration = 0;
    int max = 1000;

    float x = 0.0;
    float y = 0.0;

    float val = 0.0;

    vec3 black = vec3(0.0, 0.0, 0.0);
    vec3 blue = vec3(0.0, 0.1, 1.0);
    vec3 orange = vec3(0.9, 0.5, 0.1);
    vec3 white = vec3(1.0, 1.0, 1.0);

    while ((x * x + y * y < float(1 << 16)) && (iteration < max)) {
        float xtemp = x * x - y * y + coord.x;
        y = 2.0 * x * y + coord.y;
        x = xtemp;
        iteration = iteration + 1;
    }

    if (iteration < max) {
        float logz_n = log(x * x + y * y) / 2.0;
        float nu = log(logz_n / log(2.0)) / log(2.0);
        val = float(iteration) + 1.0 - nu;
    }

    val = val / 10.0;

    float t1 = mod(floor(val), 4.0);

    float l2 = fract(val);
    float l1 = 1.0 - fract(val);

    vec3 color = vec3(1.0, 1.0, 1.0);

    if (t1 < 1.0) {
        color =  l1 * black + l2 * blue;
    }
    else if (t1 < 2.0) {
        color =  l1 * blue + l2 * white;
    }
    else if (t1 < 3.0) {
        color =  l1 * white + l2 * orange;
    }
    else {
        color = l1 * orange + l2 * black;
    }

    gl_FragColor = vec4(color, 1.0);
}
`;

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
	const vertexShaderSource = gl.getShaderSource(vertexShader);
	const fragmentShaderSource = gl.getShaderSource(fragmentShader);

	console.groupCollapsed("vertexShader");
	console.log(vertexShaderSource);
	console.groupEnd();

	console.groupCollapsed("fragmentShader");
	console.log(fragmentShaderSource);
	console.groupEnd();
};

// Selection canvas overlay
const selectionCanvas = document.createElement("canvas");
selectionCanvas.width = window.innerWidth;
selectionCanvas.height = window.innerHeight;
selectionCanvas.style.position = "absolute";
selectionCanvas.style.left = "0";
selectionCanvas.style.top = "0";
selectionCanvas.style.pointerEvents = "none";
selectionCanvas.style.zIndex = "10";
const selectionCtx = selectionCanvas.getContext("2d");
document.body.appendChild(selectionCanvas);

let width = window.innerWidth;
let height = window.innerHeight;

// Calculate initial framing based on screen aspect ratio
const calculateInitialView = (screenWidth, screenHeight) => {
	const screenAspect = screenHeight / screenWidth;

	// Mandelbrot classic view parameters
	const centerX = -0.5;
	const centerY = 0.0;
	const canonicalWidth = 3.5; // Shows from about -2.5 to 1.0
	const canonicalHeight = 2.5; // Shows from about -1.25 to 1.25
	const canonicalAspect = canonicalHeight / canonicalWidth;

	let viewWidth, viewHeight;

	if (screenAspect > canonicalAspect) {
		// Screen is taller than canonical view - fit to width
		viewWidth = canonicalWidth;
		viewHeight = canonicalWidth * screenAspect;
	} else {
		// Screen is wider than canonical view - fit to height
		viewHeight = canonicalHeight;
		viewWidth = canonicalHeight / screenAspect;
	}

	return {
		bot_left: [centerX - viewWidth / 2, centerY - viewHeight / 2],
		top_right: [centerX + viewWidth / 2, centerY + viewHeight / 2],
	};
};

const initialView = calculateInitialView(width, height);

const uniforms = {
	bot_left: { value: initialView.bot_left },
	top_right: { value: initialView.top_right },
};

let state = {
	bot_left: initialView.bot_left,
	top_right: initialView.top_right,
	prev: null,
};

// Geometry
const planeGeometry = new THREE.PlaneGeometry(2, 2);
const shaderMaterial = new THREE.ShaderMaterial({
	vertexShader,
	fragmentShader,
	uniforms,
});

const plane = new THREE.Mesh(planeGeometry, shaderMaterial);
scene.add(plane);

// Mouse state
let mousePos = null;
let mouseDownPos = null;
let mouseUpPos = null;

// Resize handling
const onResize = () => {
	width = window.innerWidth;
	height = window.innerHeight;
	const newAspect = height / width;

	camera.aspect = newAspect;
	camera.updateProjectionMatrix();
	renderer.setSize(width, height);
	selectionCanvas.width = window.innerWidth;
	selectionCanvas.height = window.innerHeight;

	// Maintain the current center and zoom level but adjust for new aspect
	const currentWidth = uniforms.top_right.value[0] - uniforms.bot_left.value[0];
	const currentHeight =
		uniforms.top_right.value[1] - uniforms.bot_left.value[1];
	const centerX =
		(uniforms.bot_left.value[0] + uniforms.top_right.value[0]) / 2;
	const centerY =
		(uniforms.bot_left.value[1] + uniforms.top_right.value[1]) / 2;

	// Keep width the same, adjust height based on new aspect ratio
	const newHeight = currentWidth * newAspect;

	uniforms.bot_left.value = [
		centerX - currentWidth / 2,
		centerY - newHeight / 2,
	];
	uniforms.top_right.value = [
		centerX + currentWidth / 2,
		centerY + newHeight / 2,
	];

	state.bot_left = uniforms.bot_left.value;
	state.top_right = uniforms.top_right.value;

	renderer.render(scene, camera);
};

window.addEventListener("resize", onResize);

const getLocalCoords = (event) => {
	const rect = renderer.domElement.getBoundingClientRect();
	return {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top,
		width: rect.width,
		height: rect.height,
	};
};

const computeSelection = (start, current, dims) => {
	const ratio = dims.height / dims.width;
	const rawWidth = current.x - start.x;
	const rawHeight = current.y - start.y;
	if (Math.abs(rawWidth) < 1) {
		return null;
	}

	const signX = rawWidth === 0 ? 1 : Math.sign(rawWidth);
	const signY = rawHeight === 0 ? 1 : Math.sign(rawHeight);
	const widthMag = Math.abs(rawWidth);
	const heightMag = Math.abs(rawHeight);
	const adjustedHeight = widthMag * ratio;

	let rectWidth;
	let rectHeight;
	if (heightMag > adjustedHeight) {
		rectWidth = signX * widthMag;
		rectHeight = signY * adjustedHeight;
	} else {
		const adjustedWidth = heightMag / ratio;
		rectWidth = signX * adjustedWidth;
		rectHeight = signY * heightMag;
	}

	const endX = start.x + rectWidth;
	const endY = start.y + rectHeight;

	return {
		rectWidth,
		rectHeight,
		minX: Math.min(start.x, endX),
		maxX: Math.max(start.x, endX),
		minY: Math.min(start.y, endY),
		maxY: Math.max(start.y, endY),
		width: Math.abs(endX - start.x),
		height: Math.abs(endY - start.y),
	};
};

const handleMouseDown = (event) => {
	if (event.button !== 0) {
		return;
	}
	const local = getLocalCoords(event);
	mouseDownPos = { x: local.x, y: local.y };
	selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
};

const handleMouseUp = (event) => {
	if (event.button !== 0) {
		return;
	}

	const local = getLocalCoords(event);
	mouseUpPos = { x: local.x, y: local.y };

	selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

	if (mouseDownPos && mouseUpPos) {
		const rect = computeSelection(mouseDownPos, mouseUpPos, { width, height });
		if (!rect) {
			mouseDownPos = null;
			mouseUpPos = null;
			return;
		}

		if (rect.width < 5) {
			mouseDownPos = null;
			mouseUpPos = null;
			return;
		}

		const currentWidth =
			uniforms.top_right.value[0] - uniforms.bot_left.value[0];
		const currentHeight =
			uniforms.top_right.value[1] - uniforms.bot_left.value[1];
		const scaleX = currentWidth / width;
		const scaleY = currentHeight / height;

		const new_bot_left = [
			uniforms.bot_left.value[0] + rect.minX * scaleX,
			uniforms.bot_left.value[1] + (height - rect.maxY) * scaleY,
		];
		const new_top_right = [
			uniforms.bot_left.value[0] + rect.maxX * scaleX,
			uniforms.bot_left.value[1] + (height - rect.minY) * scaleY,
		];

		uniforms.bot_left.value = new_bot_left;
		uniforms.top_right.value = new_top_right;

		state = {
			bot_left: new_bot_left,
			top_right: new_top_right,
			prev: state,
		};

		renderer.render(scene, camera);
	}
	mouseDownPos = null;
	mouseUpPos = null;
};

const handleMouseMove = (event) => {
	const local = getLocalCoords(event);
	mousePos = {
		x: local.x,
		y: local.y,
	};

	if (mouseDownPos) {
		selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

		const rect = computeSelection(
			mouseDownPos,
			{ x: local.x, y: local.y },
			{ width, height },
		);
		if (rect) {
			selectionCtx.strokeStyle = "rgba(255, 255, 255, 0.8)";
			selectionCtx.lineWidth = 1.5;
			selectionCtx.setLineDash([5, 5]);
			selectionCtx.strokeRect(rect.minX, rect.minY, rect.width, rect.height);
			selectionCtx.setLineDash([]);
		}
	}
};

const handleRightClick = (event) => {
	event.preventDefault();
	if (state.prev) {
		const prevState = state.prev;
		const prev_bot_left = prevState.bot_left;
		const prev_top_right = prevState.top_right;

		console.log("(", prev_bot_left, ", ", prev_top_right, ")");

		uniforms.bot_left.value = prev_bot_left;
		uniforms.top_right.value = prev_top_right;

		Object.assign(state, prevState);

		renderer.render(scene, camera);
	}
	return false;
};

window.addEventListener("mousedown", handleMouseDown);
window.addEventListener("mouseup", handleMouseUp);
window.addEventListener("mousemove", handleMouseMove);
window.addEventListener("contextmenu", handleRightClick);

renderer.render(scene, camera);
```
