import * as THREE from "three";

const SIZE = 512;
let camera, scene, renderer;
let plane, waterMaterial;
const pendingRipples = [];
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let lastPointerRipple = 0;
const RIPPLE_INTERVAL_MS = 50;

// ---- wave simulation ----

const waveTexParams = {
	type: THREE.FloatType,
	minFilter: THREE.LinearFilter,
	magFilter: THREE.LinearFilter,
	wrapS: THREE.ClampToEdgeWrapping,
	wrapT: THREE.ClampToEdgeWrapping,
	depthBuffer: false,
	stencilBuffer: false,
};
let hPrev = new THREE.WebGLRenderTarget(SIZE, SIZE, waveTexParams);
let hCurr = new THREE.WebGLRenderTarget(SIZE, SIZE, waveTexParams);
let hNext = new THREE.WebGLRenderTarget(SIZE, SIZE, waveTexParams);

const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simScene = new THREE.Scene();
const simMat = new THREE.ShaderMaterial({
	uniforms: {
		uHPrev: { value: hPrev.texture },
		uHCurr: { value: hCurr.texture },
		uTexel: { value: new THREE.Vector2(1 / SIZE, 1 / SIZE) },
		uC2Dt2: { value: 0.04 },
		uDamping: { value: 0.02 },

		uSrcCount: { value: 0 },
		uSrcUV: {
			value: Array(8)
				.fill(0)
				.map(() => new THREE.Vector2()),
		},
		uSrcAmp: { value: new Float32Array(8) },
		uSrcSigma: { value: new Float32Array(8) },
	},
	vertexShader: `
    varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
  `,
	fragmentShader: `
    precision highp float;
    uniform sampler2D uHPrev, uHCurr;
    uniform vec2  uTexel;
    uniform float uC2Dt2, uDamping;

    const int MAX_SRC = 8;
    uniform int   uSrcCount;
    uniform vec2  uSrcUV[MAX_SRC];
    uniform float uSrcAmp[MAX_SRC];
    uniform float uSrcSigma[MAX_SRC];

    varying vec2 vUv;
    void main(){
      float hC = texture(uHCurr, vUv).r;
      float hL = texture(uHCurr, vUv - vec2(uTexel.x,0.)).r;
      float hR = texture(uHCurr, vUv + vec2(uTexel.x,0.)).r;
      float hD = texture(uHCurr, vUv - vec2(0.,uTexel.y)).r;
      float hU = texture(uHCurr, vUv + vec2(0.,uTexel.y)).r;

      float lap = (hL + hR + hU + hD - 4.0*hC);
      float hP  = texture(uHPrev, vUv).r;
      float next = (2.0 - uDamping)*hC - (1.0 - uDamping)*hP + uC2Dt2 * lap;

      for (int i=0;i<MAX_SRC;i++){
        if (i>=uSrcCount) break;
        vec2 d = vUv - uSrcUV[i];
        float r2 = dot(d,d);
        float s2 = uSrcSigma[i]*uSrcSigma[i];
        float g = exp(-r2/(2.0*s2));
        next += uSrcAmp[i]*g;
      }

      gl_FragColor = vec4(next,0.,0.,1.);
    }
  `,
	depthTest: false,
	depthWrite: false,
});
simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat));

// ---- per-frame sim step ----
function stepRipples() {
	if (!renderer) return;
	simMat.uniforms.uHPrev.value = hPrev.texture;
	simMat.uniforms.uHCurr.value = hCurr.texture;
	renderer.setRenderTarget(hNext);
	renderer.render(simScene, simCam);
	renderer.setRenderTarget(null);

	[hPrev, hCurr, hNext] = [hCurr, hNext, hPrev];

	if (waterMaterial) {
		waterMaterial.uniforms.uRippleMap.value = hCurr.texture;
	}

	simMat.uniforms.uSrcCount.value = 0;
}

function queueRipple(uv, amp = 0.01, sigma = 0.01) {
	pendingRipples.push({
		uv: uv.clone(),
		amp,
		sigma,
	});
}

function uploadPendingRipples() {
	if (!pendingRipples.length) {
		simMat.uniforms.uSrcCount.value = 0;
		return;
	}

	const count = Math.min(
		pendingRipples.length,
		simMat.uniforms.uSrcUV.value.length,
	);

	for (let i = 0; i < count; i++) {
		const src = pendingRipples.shift();
		simMat.uniforms.uSrcUV.value[i].copy(src.uv);
		simMat.uniforms.uSrcAmp.value[i] = src.amp;
		simMat.uniforms.uSrcSigma.value[i] = src.sigma;
	}

	simMat.uniforms.uSrcCount.value = count;
}

// ---- render scene ----

init();

function init() {
	console.log("test");
	camera = new THREE.PerspectiveCamera(
		70,
		window.innerWidth / window.innerHeight,
		0.1,
		100,
	);
	camera.position.z = 15;
	camera.position.y += 2;

	scene = new THREE.Scene();

	const loader = new THREE.CubeTextureLoader();
	loader.setPath("/textures/envmap_miramar/");
	const textureSkyBox = loader.load([
		"miramar_lf.png",
		"miramar_rt.png",
		"miramar_up.png",
		"miramar_dn.png",
		"miramar_ft.png",
		"miramar_bk.png",
	]);
	scene.background = textureSkyBox;
	const textureLoader = new THREE.TextureLoader();
	const normalMap1 = textureLoader.load("/textures/waternormals1.jpg");
	normalMap1.wrapS = normalMap1.wrapT = THREE.RepeatWrapping;
	const normalMap2 = textureLoader.load("/textures/waternormals2.jpg");
	normalMap2.wrapS = normalMap2.wrapT = THREE.RepeatWrapping;

	waterMaterial = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uNormalMap1: { value: normalMap1 },
			uNormalMap2: { value: normalMap2 },
			uFlowDir1: { value: new THREE.Vector2(1.0, 0.25).normalize() },
			uFlowDir2: { value: new THREE.Vector2(-0.35, 1.0).normalize() },
			uFlowSpeed1: { value: 0.05 },
			uFlowSpeed2: { value: -0.035 },
			uScale1: { value: 4.0 },
			uScale2: { value: 8.0 },
			uTintDeep: { value: new THREE.Color(0xb8cfe0) },
			uTintShallow: { value: new THREE.Color(0xe3f2ff) },
			uOpacity: { value: 0.6 },
			uLightDir: { value: new THREE.Vector3(0.3, 1.0, 0.2).normalize() },
			uWaveAmp: { value: 0.2 },
			uWaveFreq: { value: new THREE.Vector2(0.25, 0.15) },
			uWaveSpeed: { value: new THREE.Vector2(0.6, 0.45) },
			uCamPos: { value: new THREE.Vector3() },
			uFresnelBias: { value: 0.08 },
			uFresnelPower: { value: 4.0 },
			uSpecColor: { value: new THREE.Color(0xf5f9ff) },
			uSpecStrength: { value: 0.8 },
			uShininess: { value: 32.0 },
			uEnvMap: { value: textureSkyBox },
			uRefractionRatio: { value: 0.75 },
			uEnvBlend: { value: 0.6 },
			uRippleMap: { value: hCurr.texture },
			uRippleTexel: { value: new THREE.Vector2(1 / SIZE, 1 / SIZE) },
			uRippleNormalStrength: { value: 30.0 },
			uRippleNormalMix: { value: 0.55 },
			uRippleTintStrength: { value: 0.12 },
		},
		vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vT;
      varying vec3 vB;
      varying vec3 vN;
      uniform float uTime;
      uniform float uWaveAmp;
      uniform vec2 uWaveFreq;
      uniform vec2 uWaveSpeed;
      void main(){
        vUv = uv;
        float localX = position.x;
        float localY = position.y;
        vec3 displaced = position;
        float waveA = sin(localX * uWaveFreq.x + uTime * uWaveSpeed.x);
        float waveB = cos(localY * uWaveFreq.y + uTime * uWaveSpeed.y);
        displaced.z += uWaveAmp * (waveA + waveB);
        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vWorldPos = worldPos.xyz;

        float dHdX = uWaveAmp * uWaveFreq.x * cos(localX * uWaveFreq.x + uTime * uWaveSpeed.x);
        float dHdY = -uWaveAmp * uWaveFreq.y * sin(localY * uWaveFreq.y + uTime * uWaveSpeed.y);
        vec3 normalLocal = normalize(vec3(-dHdX, -dHdY, 1.0));
        vT = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
        vB = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        vN = normalize(normalMatrix * normalLocal);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
		fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vT;
      varying vec3 vB;
      varying vec3 vN;

      uniform sampler2D uNormalMap1;
      uniform sampler2D uNormalMap2;
      uniform vec2 uFlowDir1;
      uniform vec2 uFlowDir2;
      uniform float uFlowSpeed1;
      uniform float uFlowSpeed2;
      uniform float uScale1;
      uniform float uScale2;
      uniform float uTime;
      uniform vec3 uTintDeep;
      uniform vec3 uTintShallow;
      uniform float uOpacity;
      uniform vec3 uLightDir;
      uniform vec3 uCamPos;
      uniform float uFresnelBias;
      uniform float uFresnelPower;
      uniform vec3 uSpecColor;
      uniform float uSpecStrength;
      uniform float uShininess;
      uniform samplerCube uEnvMap;
      uniform float uRefractionRatio;
      uniform float uEnvBlend;
      uniform sampler2D uRippleMap;
      uniform vec2 uRippleTexel;
      uniform float uRippleNormalStrength;
      uniform float uRippleNormalMix;
      uniform float uRippleTintStrength;

      vec3 unpackNormal(vec3 n){
        return normalize(n * 2.0 - 1.0);
      }

      void main(){
        vec2 uv1 = vUv * uScale1 + uFlowDir1 * (uFlowSpeed1 * uTime);
        vec2 uv2 = vUv * uScale2 + uFlowDir2 * (uFlowSpeed2 * uTime);
        vec3 n1 = unpackNormal(texture2D(uNormalMap1, uv1).xyz);
        vec3 n2 = unpackNormal(texture2D(uNormalMap2, uv2).xyz);
        vec3 detailNormal = normalize(n1 + n2);

        float rippleH = texture2D(uRippleMap, vUv).r;
        float rippleHx = texture2D(uRippleMap, vUv + vec2(uRippleTexel.x, 0.0)).r - rippleH;
        float rippleHy = texture2D(uRippleMap, vUv + vec2(0.0, uRippleTexel.y)).r - rippleH;
        vec3 rippleNormal = normalize(vec3(-rippleHx * uRippleNormalStrength, 1.0, -rippleHy * uRippleNormalStrength));
        vec3 nT = normalize(mix(detailNormal, rippleNormal, uRippleNormalMix));
        mat3 TBN = mat3(normalize(vT), normalize(vB), normalize(vN));
        vec3 N = normalize(TBN * nT);

        float light = clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
        float rippleTint = (rippleH - 0.5) * uRippleTintStrength;
        vec3 base = mix(uTintDeep, uTintShallow, pow(light, 1.5));
        base += vec3(rippleTint);

        vec3 V = normalize(uCamPos - vWorldPos);
        float NoV = max(dot(N, V), 0.0);
        float fresnel = clamp(uFresnelBias + pow(1.0 - NoV, uFresnelPower), 0.0, 1.0);

        vec3 I = normalize(vWorldPos - uCamPos);
        vec3 envRefl = textureCube(uEnvMap, reflect(I, N)).rgb;
        vec3 envRefr = textureCube(uEnvMap, refract(I, N, uRefractionRatio)).rgb;
        vec3 envColor = mix(envRefr, envRefl, fresnel);
        vec3 color = mix(base, envColor, uEnvBlend);

        vec3 L = normalize(uLightDir);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), uShininess) * uSpecStrength;
        color += uSpecColor * spec;

        gl_FragColor = vec4(color, uOpacity);
      }
    `,
		side: THREE.DoubleSide,
		transparent: true,
	});

	const geometry = new THREE.PlaneGeometry(100, 24);
	plane = new THREE.Mesh(geometry, waterMaterial);
	plane.position.y = -2;
	plane.rotation.x = 1.7;
	scene.add(plane);

	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	document.body.appendChild(renderer.domElement);

	window.addEventListener("resize", onWindowResize);
	window.addEventListener("pointermove", handlePointerMove);
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize(window.innerWidth, window.innerHeight);
}

function handlePointerMove(event) {
	if (!plane || !camera) return;
	const now = performance.now();
	if (now - lastPointerRipple < RIPPLE_INTERVAL_MS) {
		return;
	}
	pointerNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
	pointerNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointerNDC, camera);
	const hits = raycaster.intersectObject(plane);
	if (!hits.length) return;
	lastPointerRipple = now;
	const uv = hits[0].uv.clone();
	uv.x = THREE.MathUtils.clamp(uv.x, 0, 1);
	uv.y = THREE.MathUtils.clamp(uv.y, 0, 1);
	queueRipple(uv, 0.012, 0.02);
}

function animate() {
	if (waterMaterial) {
		const t = performance.now() * 0.001;
		waterMaterial.uniforms.uTime.value = t;
		waterMaterial.uniforms.uCamPos.value.copy(camera.position);
	}

	uploadPendingRipples();
	stepRipples();
	renderer.render(scene, camera);
}

function getIndex(x, y) {
	return y * (SIZE + 1) + x;
}
