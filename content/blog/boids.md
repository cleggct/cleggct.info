---
title: Boids
description: Implementing boids with ThreeJS
date: 2025-02-10
tags: ["demo", "blog"]
---

<iframe src="/demos/boids" title="Boids Demo"></iframe>

<a href="/demos/boids">Fullscreen</a>

<br>

## Explanation

This demo was a little different from the others in that it does not use any custom shaders, the whole thing is made with
ThreeJS primitives. In particular, a buffer geometry and a points material. Boids would be a good candidate problem for
GPU-acceleration via compute shaders, and in fact the first version of this demo I wrote used a ThreeJS plugin to provide the
traditional shoehorned OpenGL compute shader stuff, but I decided to go without it to get rid of the additional dependency.
WebGPU offers built in support for compute shaders, but browser support for WebGPU is still lacking, so I decided to stick
with WebGL/ThreeJS. Hence all the velocity calculations and position updates are being done on the CPU.

<br>

## Source

```
import * as THREE from "three";

const WIDTH = 16;
const NUM_BOIDS = WIDTH * WIDTH;
const MAX_SPEED = 0.005;
const EDGE_MIN = 0.01;
const EDGE_MAX = 0.99;
const EDGE_REPULSION = 0.03;
const COHESION = 0.00015;
const ALIGNMENT = 0.0125;
const SEPARATION = 0.05;
const MOUSE_PULL = 0.0001;
const VELOCITY_DAMPING = 0.995;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

let width = window.innerWidth;
let height = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(width, height);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1410);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const geometry = new THREE.BufferGeometry();

// this seems redundant but the ThreeJS points class requires 3D positions in our buffer geometry
// so I have opted to maintain two separate data structures, one for the points in two dimensions
// and one for the points in three dimensions even though the boids are technically only moving in
// two dimensions
const positions = new Float32Array(NUM_BOIDS * 3);
const positionBuffer = new Float32Array(NUM_BOIDS * 2);
const velocities = new Float32Array(NUM_BOIDS * 2);

// randomize positions and velocities
for (let i = 0; i < NUM_BOIDS; i++) {
	const x = Math.random();
	const y = Math.random();
	positionBuffer[i * 2] = x;
	positionBuffer[i * 2 + 1] = y;
	positions[i * 3] = x * 2 - 1;
	positions[i * 3 + 1] = y * 2 - 1;
	positions[i * 3 + 2] = 0;
	velocities[i * 2] = (Math.random() - 0.5) * 2.0 * MAX_SPEED;
	velocities[i * 2 + 1] = (Math.random() - 0.5) * 2.0 * MAX_SPEED;
}

geometry.setAttribute(
	"position",
	new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
);

const material = new THREE.PointsMaterial({ color: 0xffffff, size: 2.0 });
const boids = new THREE.Points(geometry, material);
scene.add(boids);

const mouse = { x: 0.5, y: 0.5, active: false };
let lastMouseMove = 0;

const handleResize = () => {
	width = window.innerWidth;
	height = window.innerHeight;
	renderer.setPixelRatio(window.devicePixelRatio || 1);
	renderer.setSize(width, height);
	camera.updateProjectionMatrix();
};

const handleMouseMove = (event) => {
	const rect = renderer.domElement.getBoundingClientRect();
	mouse.x = clamp01((event.clientX - rect.left) / rect.width);
	mouse.y = clamp01(1 - (event.clientY - rect.top) / rect.height);
	mouse.active = true;
	lastMouseMove = performance.now();
};

const handleMouseLeave = () => {
	mouse.active = false;
	mouse.x = 0.5;
	mouse.y = 0.5;
	lastMouseMove = 0;
};

window.addEventListener("resize", handleResize);
window.addEventListener("mousemove", handleMouseMove);
renderer.domElement.addEventListener("mouseleave", handleMouseLeave);

document.body.appendChild(renderer.domElement);

const animate = () => {
	requestAnimationFrame(animate);

	// iterate over boids...
	for (let i = 0; i < NUM_BOIDS; i++) {
		const idxPos = i * 2;
		const idxVel = i * 2;

		const boidPosX = positionBuffer[idxPos];
		const boidPosY = positionBuffer[idxPos + 1];
		let boidVelX = velocities[idxVel];
		let boidVelY = velocities[idxVel + 1];

		let sumPosX = 0;
		let sumPosY = 0;
		let sumVelX = 0;
		let sumVelY = 0;
		let sepX = 0;
		let sepY = 0;

		// compute the average position and velocity of the flock as well as the deviation for
		// the current boid
		for (let j = 0; j < NUM_BOIDS; j++) {
			if (i === j) continue;
			const nPosX = positionBuffer[j * 2];
			const nPosY = positionBuffer[j * 2 + 1];
			const nVelX = velocities[j * 2];
			const nVelY = velocities[j * 2 + 1];

			sumPosX += nPosX;
			sumPosY += nPosY;
			sumVelX += nVelX;
			sumVelY += nVelY;

			const diffX = nPosX - boidPosX;
			const diffY = nPosY - boidPosY;
			const distanceSq = diffX * diffX + diffY * diffY;
			if (distanceSq < 0.00005 && distanceSq > 0) {
				sepX -= diffX;
				sepY -= diffY;
			}
		}

		const avgPosX = sumPosX / (NUM_BOIDS - 1);
		const avgPosY = sumPosY / (NUM_BOIDS - 1);
		const avgVelX = sumVelX / (NUM_BOIDS - 1);
		const avgVelY = sumVelY / (NUM_BOIDS - 1);

		// apply the boid rules
		const v1x = (avgPosX - boidPosX) * COHESION;
		const v1y = (avgPosY - boidPosY) * COHESION;
		const v2x = (avgVelX - boidVelX) * ALIGNMENT;
		const v2y = (avgVelY - boidVelY) * ALIGNMENT;
		const v3x = sepX * SEPARATION;
		const v3y = sepY * SEPARATION;

		// add in an adjustment for edge repulsion
		let v4x = 0;
		let v4y = 0;
		if (boidPosX < EDGE_MIN) v4x += (EDGE_MIN - boidPosX) * EDGE_REPULSION;
		if (boidPosX > EDGE_MAX) v4x += (EDGE_MAX - boidPosX) * EDGE_REPULSION;
		if (boidPosY < EDGE_MIN) v4y += (EDGE_MIN - boidPosY) * EDGE_REPULSION;
		if (boidPosY > EDGE_MAX) v4y += (EDGE_MAX - boidPosY) * EDGE_REPULSION;

		// add in an adjustment to follow the mouse
		let v5x = 0;
		let v5y = 0;
		if (mouse.active) {
			// ignore the mouse if it is not present or standing still for >3 secs
			if (lastMouseMove && performance.now() - lastMouseMove > 3000) {
				mouse.active = false;
				mouse.x = 0.5;
				mouse.y = 0.5;
				lastMouseMove = 0;
			} else {
				const mouseDirX = mouse.x - boidPosX;
				const mouseDirY = mouse.y - boidPosY;
				const mouseMag =
					Math.sqrt(mouseDirX * mouseDirX + mouseDirY * mouseDirY) || 1;
				v5x = (mouseDirX / mouseMag) * MOUSE_PULL;
				v5y = (mouseDirY / mouseMag) * MOUSE_PULL;
			}
		}

		boidVelX = boidVelX * VELOCITY_DAMPING + v1x + v2x + v3x + v4x + v5x;
		boidVelY = boidVelY * VELOCITY_DAMPING + v1y + v2y + v3y + v4y + v5y;

		// clamp max speed to keep the simulation well behaved
		const speed = Math.sqrt(boidVelX * boidVelX + boidVelY * boidVelY);
		if (speed > MAX_SPEED) {
			boidVelX = (boidVelX / speed) * MAX_SPEED;
			boidVelY = (boidVelY / speed) * MAX_SPEED;
		}

		let newPosX = boidPosX + boidVelX;
		let newPosY = boidPosY + boidVelY;

		if (newPosX < 0) newPosX = 0;
		if (newPosX > 1) newPosX = 1;
		if (newPosY < 0) newPosY = 0;
		if (newPosY > 1) newPosY = 1;

		positionBuffer[idxPos] = newPosX;
		positionBuffer[idxPos + 1] = newPosY;
		velocities[idxVel] = boidVelX;
		velocities[idxVel + 1] = boidVelY;
		positions[i * 3] = newPosX * 2 - 1;
		positions[i * 3 + 1] = newPosY * 2 - 1;
	}

	geometry.attributes.position.needsUpdate = true;
	renderer.render(scene, camera);
};

animate();

```
