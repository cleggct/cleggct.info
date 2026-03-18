---
title: Conway's Game of Life
description: Implementing life in ThreeJS
date: 2024-11-25
tags: demo blog
---

<iframe src="/demos/life" title="Conway's Game of Life Demo"> </iframe>

<a href="/demos/life">Fullscreen</a>

## Explanation

Hold down the mouse and drag it across to paint randomness on the game world.

<br>

Whenever I learn a new graphics API I always end up implementing two programs first: the Mandelbrot
set and Conway's Game of Life. <a href="/blog/mandelbrot">I already did the Mandelbrot set</a> so the
game of life was next. I am just using a ThreeJS data texture to represent the game world which I am
periodically updating. Everything is done on the CPU. One issue I ran into was the pixels were not perfectly
square and uniform, that stumped me for a bit but it turned out I just needed to turn off mipmaps.

## Source

```
import * as THREE from "three";

const CELL_PIXELS = 4;
const BRUSH_RADIUS = 10;
const computeSpawnRadius = (rows, cols) =>
	Math.max(4, Math.min(150, Math.floor(Math.min(rows, cols) / 3)));

const populateGrid = (grid, radius, rowNum, colNum) => {
	const gridcp = grid.slice();
	for (let i = -radius; i <= radius; i++) {
		for (let j = -radius; j <= radius; j++) {
			if (Math.sqrt(i * i + j * j) <= radius) {
				const indx = (Math.floor(colNum / 2) + i + colNum) % colNum;
				const indy = (Math.floor(rowNum / 2) + j + rowNum) % rowNum;
				gridcp[indx + indy * colNum] = Math.random() > 0.5 ? 255 : 0;
			}
		}
	}
	return gridcp;
};

const nextGen = (rows, cols, currentGrid) => {
	return currentGrid.map((cell, idx) => {
		const row = Math.floor(idx / cols);
		const col = idx % cols;

		const neighbors = [
			currentGrid[((row - 1 + rows) % rows) * cols + ((col - 1 + cols) % cols)],
			currentGrid[((row - 1 + rows) % rows) * cols + col],
			currentGrid[((row - 1 + rows) % rows) * cols + ((col + 1) % cols)],
			currentGrid[row * cols + ((col - 1 + cols) % cols)],
			currentGrid[row * cols + ((col + 1) % cols)],
			currentGrid[((row + 1) % rows) * cols + ((col - 1 + cols) % cols)],
			currentGrid[((row + 1) % rows) * cols + col],
			currentGrid[((row + 1) % rows) * cols + ((col + 1) % cols)],
		];

		const aliveNeighbors = neighbors.filter((n) => n === 255).length;

		if (cell === 255 && (aliveNeighbors < 2 || aliveNeighbors > 3)) {
			return 0;
		}
		if (cell === 0 && aliveNeighbors === 3) {
			return 255;
		}
		return cell;
	});
};

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: false });
let texture;
let material;
let grid = new Uint8Array(0);
let width = 0;
let height = 0;
let aspect = 1;
let rowNum = 0;
let colNum = 0;

const interval = 0.033;
let mousePressed = false;
let mousePosX = null;
let mousePosY = null;

const syncDimensions = (seed = false) => {
	const pixelRatio = window.devicePixelRatio || 1;
	renderer.setPixelRatio(pixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);

	let bufferWidth = renderer.domElement.width;
	let bufferHeight = renderer.domElement.height;

	const newCol = Math.max(1, Math.floor(bufferWidth / CELL_PIXELS));
	const newRow = Math.max(1, Math.floor(bufferHeight / CELL_PIXELS));

	bufferWidth = newCol * CELL_PIXELS;
	bufferHeight = newRow * CELL_PIXELS;

	renderer.setSize(bufferWidth / pixelRatio, bufferHeight / pixelRatio, false);

	width = renderer.domElement.clientWidth;
	height = renderer.domElement.clientHeight;
	aspect = width / height;

	const needsSeed =
		seed ||
		newCol !== colNum ||
		newRow !== rowNum ||
		grid.length !== newRow * newCol;

	colNum = newCol;
	rowNum = newRow;

	if (needsSeed) {
		grid = new Uint8Array(rowNum * colNum).fill(0);
		grid.set(
			populateGrid(grid, computeSpawnRadius(rowNum, colNum), rowNum, colNum),
		);
		if (texture) {
			texture.image.data = grid;
			texture.image.width = colNum;
			texture.image.height = rowNum;
			texture.needsUpdate = true;
			if (material) {
				material.needsUpdate = true;
			}
		}
	}
};

syncDimensions(true);

document.body.appendChild(renderer.domElement);

texture = new THREE.DataTexture(
	grid,
	colNum,
	rowNum,
	THREE.RedFormat,
	THREE.UnsignedByteType,
);
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
texture.needsUpdate = true;

// Geometry
const planeGeometry = new THREE.PlaneGeometry(2, 2);
material = new THREE.MeshBasicMaterial({ map: texture });
const plane = new THREE.Mesh(planeGeometry, material);
scene.add(plane);

// Animation loop
const clock = new THREE.Clock();
let time_passed = 0;

const animate = () => {
	if (mousePressed && mousePosX !== null && mousePosY !== null) {
		const posX = mousePosX;
		const posY = mousePosY;
		const radius = BRUSH_RADIUS;

		const gridcp = grid.slice();
		for (let i = -radius; i <= radius; i++) {
			for (let j = -radius; j <= radius; j++) {
				if (Math.sqrt(i * i + j * j) <= radius) {
					const indx = (posX + i + colNum) % colNum;
					const indy = (posY + j + rowNum) % rowNum;
					gridcp[indx + indy * colNum] = Math.random() > 0.5 ? 255 : 0;
				}
			}
		}

		grid.set(gridcp);
		texture.needsUpdate = true;
		material.needsUpdate = true;
	}

	time_passed += clock.getDelta();
	if (time_passed > interval) {
		grid.set(nextGen(rowNum, colNum, grid));
		texture.needsUpdate = true;
		material.needsUpdate = true;
		time_passed = 0;
	}
	requestAnimationFrame(animate);
	renderer.render(scene, camera);
};

animate();

// Event handlers
const onResize = () => {
	syncDimensions(true);
	camera.updateProjectionMatrix();
};

const handleMouseDown = () => {
	mousePressed = true;
};

const handleMouseUp = () => {
	mousePressed = false;
};

const handleMouseMove = (event) => {
	const rect = renderer.domElement.getBoundingClientRect();
	const normX = (event.clientX - rect.left) / rect.width;
	const normY = 1 - (event.clientY - rect.top) / rect.height;

	if (normX < 0 || normX > 1 || normY < 0 || normY > 1) {
		mousePosX = null;
		mousePosY = null;
		return;
	}

	mousePosX = Math.floor(normX * colNum);
	mousePosY = Math.floor(normY * rowNum);
};

const handleMouseLeave = () => {
	mousePressed = false;
	mousePosX = null;
	mousePosY = null;
};

window.addEventListener("resize", onResize);
renderer.domElement.addEventListener("mouseleave", handleMouseLeave);
renderer.domElement.addEventListener("mousedown", handleMouseDown);
window.addEventListener("mouseup", handleMouseUp);
renderer.domElement.addEventListener("mousemove", handleMouseMove);
```
