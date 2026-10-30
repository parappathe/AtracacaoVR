// Visual: céu (estrelas, Via Láctea, sol, planeta enorme por capítulo), estações, satélite,
// asteroides e detritos instanciados, argolas, astronautas, a nave por fora e a cabine.
// Medidas iguais às de bodies.js (o que se vê é o que bate).
import * as THREE from '../vendor/three/three.module.js';
import { TYPES, SHIP } from './bodies.js';
import { rng } from './math.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();

// ---------- Texturas feitas na hora (canvas) ----------
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 4;
  return t;
}
function panelTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const R = rng(3);
    g.fillStyle = '#e9e6df'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const l = 222 + Math.floor(R() * 26);
      g.fillStyle = `rgb(${l},${l - 2},${l - 8})`;
      g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
      if (R() < 0.25) { g.fillStyle = 'rgba(180,170,150,0.35)'; g.fillRect(x * 128 + 20, y * 128 + 20, 40, 18); }
    }
    g.fillStyle = 'rgba(90,90,90,0.5)';
    for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) for (const [dx, dy] of [[8, 8], [118, 8], [8, 118], [118, 118]]) g.fillRect(k * 128 + dx, j * 128 + dy, 3, 3);
  }, { repeat: [2, 2] });
}
function goldTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const R = rng(8);
    g.fillStyle = '#c99a3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = R() * w, y = R() * h, r = 6 + R() * 26, l = R();
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, l > 0.5 ? 'rgba(255,226,140,0.5)' : 'rgba(120,80,20,0.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, { repeat: [1, 1] });
}
function solarTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0d1f4a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const gr = g.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32);
      gr.addColorStop(0, '#1a3a7e'); gr.addColorStop(1, '#0f2560');
      g.fillStyle = gr; g.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
    }
    g.fillStyle = '#9aa6b8'; g.fillRect(0, h / 2 - 2, w, 4);
  }, { repeat: [2, 1] });
}
function windowTex(cols, rows, seed, lit = 0.8) {
  return canvasTex(512, 256, (g, w, h) => {
    const R = rng(seed);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (R() > lit) continue;
      const warm = R();
      g.fillStyle = warm < 0.7 ? `rgba(255,${200 + Math.floor(R() * 40)},140,1)` : 'rgba(170,230,255,1)';
      g.fillRect(x * cw + cw * 0.3, y * ch + ch * 0.3, cw * 0.4, ch * 0.4);
    }
  }, { repeat: [1, 1] });
}
function targetTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111';
    g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
    g.strokeStyle = '#ff7a2a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  });
}
function glowTex(inner = 'rgba(255,250,235,1)', mid = 'rgba(255,220,160,0.35)') {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.12, inner); gr.addColorStop(0.3, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// ruído 3D simples (para os planetas e as pedras)
function makeNoise(seed) {
  const R = rng(seed), P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = R(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const h = (x, y, z) => G[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  const f = (t) => t * t * (3 - 2 * t);
  const n = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = f(x - xi), v = f(y - yi), w = f(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  return (x, y, z, oct = 5) => { let s = 0, a = 0.5, fr = 1; for (let i = 0; i < oct; i++) { s += a * n(x * fr, y * fr, z * fr); a *= 0.5; fr *= 2.03; } return s / (1 - Math.pow(0.5, oct)); };
}

// Planeta de cada capítulo em textura equiretangular (cor e nuvens)
const PLANETS = [
  { // Terra estilizada: oceanos verde-azulados, continentes de areia e floresta, nuvens
    seed: 21, color(n, lat, c) {
      const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const deep = Math.min(1, Math.max(0, (0.53 - n) * 5));
      const sea = [lerp(60, 22, deep), lerp(160, 78, deep), lerp(178, 140, deep)];
      const m = Math.min(1, Math.max(0, (n - 0.53) * 6));
      const dry = sm(0.45, 0.65, c);
      const land = [lerp(lerp(96, 60, m), lerp(206, 170, m), dry), lerp(lerp(140, 104, m), lerp(178, 130, m), dry), lerp(lerp(78, 60, m), lerp(120, 86, m), dry)];
      const k = sm(0.515, 0.545, n);
      let col = [0, 1, 2].map(i => lerp(sea[i], land[i], k));
      const ice = sm(1.15, 1.32, Math.abs(lat) + (n - 0.5) * 0.6);
      col = col.map((v, i) => lerp(v, [214, 226, 236][i], ice));
      return col;
    }, clouds: true, atmo: [0.45, 0.75, 1.0],
  },
  { // gigante gasoso em faixas, com anéis
    seed: 34, color(n, lat, c) {
      const b = Math.sin(lat * 14 + n * 5.0) * 0.5 + 0.5, b2 = Math.sin(lat * 37 + c * 3) * 0.5 + 0.5;
      return [lerp(196, 236, b) - b2 * 20, lerp(140, 206, b) - b2 * 18, lerp(88, 150, b) - b2 * 10];
    }, clouds: false, atmo: [1.0, 0.8, 0.55], rings: true,
  },
  { // planeta de gelo violeta
    seed: 47, color(n, lat, c) {
      const m = Math.min(1, Math.max(0, (n - 0.4) * 2.5));
      const b = 0.92 + 0.08 * c;
      return [lerp(120, 222, m) * b, lerp(120, 214, m) * b, lerp(196, 248, m) * b];
    }, clouds: true, atmo: [0.7, 0.6, 1.0],
  },
];
const lerp = (a, b, t) => a + (b - a) * t;
const planetCache = {};
function planetTextures(ch) {
  if (planetCache[ch]) return planetCache[ch];
  const P = PLANETS[ch], N = makeNoise(P.seed), N2 = makeNoise(P.seed + 5);
  const W = 1024, H = 512;
  const mk = (fn) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      const lat = (0.5 - y / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
      for (let x = 0; x < W; x++) {
        const lon = x / W * Math.PI * 2, px = cl * Math.cos(lon), pz = cl * Math.sin(lon);
        const [r, gg, b, a] = fn(px, sl, pz, lat);
        const k = (y * W + x) * 4;
        d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = a ?? 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  };
  const map = mk((x, y, z, lat) => P.color(N(x * 2.2 + 3, y * 2.2, z * 2.2, 6), lat, N2(x * 1.3, y * 1.3, z * 1.3, 3)));
  const clouds = P.clouds ? mk((x, y, z) => {
    const n = N2(x * 3.5 + 9, y * 6, z * 3.5, 5), a = Math.max(0, Math.min(1, (n - 0.5) * 3.2));
    return [255, 255, 255, a * 230];
  }) : null;
  return (planetCache[ch] = { map, clouds });
}

const planetVS = `varying vec3 vN; varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const planetFS = `uniform sampler2D map; uniform vec3 sun; uniform vec3 atmo; uniform float rot; uniform float alphaMode;
varying vec3 vN; varying vec2 vUv; varying vec3 vW;
void main(){
  vec4 c = texture2D(map, vec2(vUv.x + rot, vUv.y));
  float d = dot(normalize(vN), sun);
  float lit = smoothstep(-0.12, 0.35, d);
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), 3.0);
  vec3 col = c.rgb * (0.03 + 0.92 * lit) + atmo * rim * (0.15 + 0.85 * smoothstep(-0.25, 0.4, d)) * 0.9;
  float a = alphaMode > 0.5 ? c.a * (0.15 + 0.85 * lit) : 1.0;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;
const atmoFS = `uniform vec3 sun; uniform vec3 atmo; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float f = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);
  float d = smoothstep(-0.35, 0.5, dot(normalize(vN), sun));
  gl_FragColor = vec4(atmo * f * d * 1.2, f * d);
}`;

// ---------- Mundo: céu, luzes, ambiente para reflexos ----------
export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#03040c');
  const sky = new THREE.Group();     // acompanha a câmera (fica infinitamente longe)
  scene.add(sky);

  // estrelas e Via Láctea
  const R = rng(99), pos = [], col = [];
  const addStar = (v, b, tint) => { pos.push(v.x * 4200, v.y * 4200, v.z * 4200); col.push(b * tint[0], b * tint[1], b * tint[2]); };
  for (let i = 0; i < 2600; i++) {
    const v = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize();
    const b = Math.pow(R(), 3) * 1.1 + 0.15, t = R();
    addStar(v, b, t < 0.2 ? [1, 0.82, 0.65] : t < 0.4 ? [0.75, 0.85, 1] : [1, 1, 1]);
  }
  const band = new THREE.Vector3(0.3, 1, 0.25).normalize();
  for (let i = 0; i < 3800; i++) {
    const v = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize();
    const off = v.dot(band);
    if (Math.abs(off) > 0.22 * R()) continue;
    addStar(v, 0.18 + Math.pow(R(), 4) * 0.7, [0.85, 0.85, 1]);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
  stars.renderOrder = -10;
  sky.add(stars);
  // nebulosa suave (faixa colorida no fundo)
  const neb = new THREE.Mesh(new THREE.SphereGeometry(4300, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { band: { value: band }, tint: { value: new THREE.Color('#3a2a6a') } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 band; uniform vec3 tint; varying vec3 vD; void main(){ float b = 1.0 - abs(dot(vD, band)); float g = pow(b, 6.0) * (0.6 + 0.4 * sin(vD.x * 9.0 + vD.y * 5.0) * sin(vD.z * 7.0)); gl_FragColor = vec4(tint * g * 0.55, 1.0); }',
  }));
  neb.renderOrder = -11;
  sky.add(neb);

  // sol
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#fff6e0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunSprite.position.copy(SUN_DIR).multiplyScalar(4000);
  sunSprite.scale.setScalar(900);
  sunSprite.renderOrder = -8;
  sky.add(sunSprite);

  // planeta
  const planetU = { map: { value: null }, sun: { value: SUN_DIR }, atmo: { value: new THREE.Color() }, rot: { value: 0 }, alphaMode: { value: 0 } };
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms: planetU, vertexShader: planetVS, fragmentShader: planetFS, depthWrite: false }));
  planet.renderOrder = -7;
  const cloudU = { ...planetU, map: { value: null }, alphaMode: { value: 1 }, rot: { value: 0 } };
  const clouds = new THREE.Mesh(planet.geometry, new THREE.ShaderMaterial({ uniforms: cloudU, vertexShader: planetVS, fragmentShader: planetFS, transparent: true, depthWrite: false }));
  clouds.scale.setScalar(1.006);
  clouds.renderOrder = -6;
  const atmoMesh = new THREE.Mesh(planet.geometry, new THREE.ShaderMaterial({ uniforms: planetU, vertexShader: planetVS, fragmentShader: atmoFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }));
  atmoMesh.scale.setScalar(1.035);
  atmoMesh.renderOrder = -5;
  const planetG = new THREE.Group();
  planetG.add(planet, clouds, atmoMesh);
  planet.add(new THREE.Object3D());
  sky.add(planetG);
  // anéis do gigante gasoso
  const ringTex = canvasTex(1024, 8, (g, w) => {
    const Rr = rng(5);
    for (let x = 0; x < w; x++) {
      const u = x / w, wave = 0.5 + 0.25 * Math.sin(u * 37) + 0.15 * Math.sin(u * 91 + 1.3) + 0.1 * Math.sin(u * 7.7);
      const a = Math.max(0, wave) * 0.75 * Math.min(1, u * 12, (1 - u) * 14) * (Math.abs(u - 0.6) < 0.035 ? 0.1 : 1);
      const l = 0.85 + 0.15 * Math.sin(u * 53);
      g.fillStyle = `rgba(${Math.round(225 * l)},${Math.round(196 * l)},${Math.round(156 * l)},${a})`; g.fillRect(x, 0, 1, 8);
    }
  });
  const ringGeo = new THREE.RingGeometry(1.3, 2.3, 128, 1);
  { const p = ringGeo.attributes.position, uv = ringGeo.attributes.uv; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r - 1.3) / 1.0, 0.5); } }
  const planetRings = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { map: { value: ringTex }, sun: { value: SUN_DIR } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb * 0.95, c.a * 0.85); }',
  }));
  planetRings.renderOrder = -6;
  planetG.add(planetRings);
  // lua pequena (capítulo 3)
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({ uniforms: { ...planetU, map: { value: null }, atmo: { value: new THREE.Color('#222') } }, vertexShader: planetVS, fragmentShader: planetFS, depthWrite: false }));
  moon.renderOrder = -7;
  sky.add(moon);

  // luzes: sol forte e um pouco de luz refletida pelo planeta
  const sun = new THREE.DirectionalLight('#fff3e2', 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun, sun.target);
  const bounce = new THREE.HemisphereLight('#1a2238', '#3d6a8a', 0.55);
  scene.add(bounce);

  // ambiente para reflexos do metal e da folha dourada
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSphere = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: { sun: { value: SUN_DIR }, low: { value: new THREE.Color('#3d7aa0') } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 sun; uniform vec3 low; varying vec3 vD; void main(){ float s = pow(max(dot(vD, sun), 0.0), 60.0) * 30.0 + pow(max(dot(vD, sun), 0.0), 4.0) * 0.6; float p = smoothstep(0.1, -0.6, vD.y); gl_FragColor = vec4(vec3(0.015, 0.02, 0.04) + low * p * 0.8 + vec3(1.0, 0.95, 0.85) * s, 1.0); }',
  }));
  envScene.add(envSphere);
  let env = null;

  const mats = {
    hull: new THREE.MeshStandardMaterial({ map: panelTex(), roughness: 0.55, metalness: 0.05 }),
    white: new THREE.MeshStandardMaterial({ color: '#e8e6e0', roughness: 0.5, metalness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b8bcc4', roughness: 0.35, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2e36', roughness: 0.6, metalness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ map: goldTex(), color: '#ffd27a', roughness: 0.32, metalness: 1.0 }),
    solar: new THREE.MeshStandardMaterial({ map: solarTex(), roughness: 0.25, metalness: 0.6, color: '#ffffff' }),
    orange: new THREE.MeshStandardMaterial({ color: '#ff7a2a', roughness: 0.5, metalness: 0.1 }),
    target: new THREE.MeshStandardMaterial({ map: targetTex(), roughness: 0.6 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: '#9fd8ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    lightW: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    lightR: new THREE.MeshBasicMaterial({ color: '#ff3b2e' }),
    lightG: new THREE.MeshBasicMaterial({ color: '#3bff7a' }),
    lightA: new THREE.MeshBasicMaterial({ color: '#ffb340' }),
    windows: new THREE.MeshStandardMaterial({ color: '#d9d6cf', map: panelTex(), emissiveMap: windowTex(48, 6, 4, 0.6), emissive: '#ffffff', emissiveIntensity: 1.4, roughness: 0.5, metalness: 0.1 }),
    windows2: new THREE.MeshStandardMaterial({ color: '#c8cdd6', emissiveMap: windowTex(64, 10, 9, 0.5), emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.55, metalness: 0.2 }),
    suit: new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.7 }),
    visor: new THREE.MeshStandardMaterial({ color: '#e0a83a', roughness: 0.1, metalness: 1.0 }),
    plume: new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.2) * (0.55 + 0.45 * sin(vUv.x * 6.2832 * 3.0) * 0.3); gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * a * 0.9, a); }',
    }),
    ring: new THREE.MeshBasicMaterial({ color: '#6ff5d0', transparent: true, opacity: 0.95 }),
    ringDim: new THREE.MeshBasicMaterial({ color: '#2b6f62', transparent: true, opacity: 0.45 }),
  };

  function setChapter(ch) {
    const P = PLANETS[ch], tex = planetTextures(ch);
    planetU.map.value = tex.map;
    planetU.atmo.value.setRGB(...P.atmo);
    cloudU.map.value = tex.clouds;
    clouds.visible = !!tex.clouds;
    planetRings.visible = !!P.rings;
    moon.visible = ch === 2;
    // posição e tamanho do planeta em cada capítulo
    if (ch === 0) { planetG.position.set(600, -2600, -1600); planetG.scale.setScalar(2500); planetG.rotation.set(1.25, 0.4, 0.35); bounce.groundColor.set('#3d6a8a'); scene.background.set('#03040c'); }
    if (ch === 1) { planetG.position.set(-2400, -500, -2500); planetG.scale.setScalar(1300); planetG.rotation.set(0.42, 0.3, -0.25); bounce.groundColor.set('#6a5236'); scene.background.set('#05040a'); }
    if (ch === 2) {
      planetG.position.set(1800, 900, -2900); planetG.scale.setScalar(1500); planetG.rotation.set(-0.2, 0.5, 0.1); bounce.groundColor.set('#4a4a8a'); scene.background.set('#04030c');
      moon.position.set(-1500, -700, -2600); moon.scale.setScalar(260); moon.material.uniforms.map.value = planetTextures(2).map;
    }
    envSphere.material.uniforms.low.value.copy(bounce.groundColor);
    env?.dispose();
    env = pmrem.fromScene(envScene, 0.02).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.9;
  }

  function update(dt, camPos) {
    sky.position.copy(camPos);
    planetU.rot.value += dt * 0.00035;
    cloudU.rot.value += dt * 0.0006;
  }
  return { scene, mats, sky, setChapter, update };
}

// ---------- Peças das estações ----------
const Z = new THREE.Vector3(0, 0, 1);
function alongZ(geo) { geo.rotateX(Math.PI / 2); return geo; }   // cilindros do three são em y
function cylZ(r, z0, z1, mat, seg = 32, open = false) {
  const m = new THREE.Mesh(alongZ(new THREE.CylinderGeometry(r, r, z1 - z0, seg, 1, open)), mat);
  m.position.z = (z0 + z1) / 2;
  return m;
}
function capsuleZ(r, z0, z1, mat) {
  const m = new THREE.Mesh(alongZ(new THREE.CapsuleGeometry(r, z1 - z0, 8, 32)), mat);
  m.position.z = (z0 + z1) / 2;
  return m;
}
function box(hx, hy, hz, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat);
  m.position.set(x, y, z);
  return m;
}
function sphere(r, mat, x = 0, y = 0, z = 0, seg = 32) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.6)), mat);
  m.position.set(x, y, z);
  return m;
}
// Encaixe: colar, anel com pétalas, luzes e o alvo com a cruz em pé (como os de verdade)
function dockingPort(mats, P, collarR = 0.6, collarZ0) {
  const g = new THREE.Group();
  const z = P.p[2];
  g.add(cylZ(collarR, collarZ0, z - 0.25, mats.metal, 24));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 12, 32), mats.white);
  ring.position.z = z - 0.12;
  g.add(ring);
  const face = cylZ(0.56, z - 0.25, z - 0.02, mats.dark, 24);
  g.add(face);
  for (let k = 0; k < 3; k++) {
    const pet = box(0.09, 0.16, 0.12, mats.orange);
    const a = k / 3 * Math.PI * 2 + Math.PI / 2;
    pet.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, z + 0.04);
    pet.rotation.z = a - Math.PI / 2;
    g.add(pet);
  }
  // alvo com cruz: placa e haste em pé, fora do eixo (fica alinhado quando a nave está certa)
  const plate = box(0.22, 0.22, 0.01, mats.target, 0, 1.15, z - 0.4);
  const post = cylZ(0.025, z - 0.4, z - 0.05, mats.white, 8); post.position.y = 1.15;
  const cross = box(0.1, 0.012, 0.012, mats.lightA, 0, 1.15, z - 0.05);
  const cross2 = box(0.012, 0.1, 0.012, mats.lightA, 0, 1.15, z - 0.05);
  g.add(plate, post, cross, cross2);
  // luzes do encaixe (piscam)
  const lights = [];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2;
    const l = sphere(0.045, k % 2 ? mats.lightW : mats.lightG, Math.cos(a) * 0.75, Math.sin(a) * 0.75, z - 0.12, 8);
    lights.push(l); g.add(l);
  }
  g.userData.lights = lights;
  return g;
}
function truss(len, w, mats, axis = 'x') {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6);
  const rods = [];
  const s = w / 2;
  for (const [a, b] of [[s, s], [s, -s], [-s, s], [-s, -s]]) rods.push({ p: [0, a, b], len, rot: 'long' });
  const n = Math.round(len / w);
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + i * len / n;
    rods.push({ p: [x, s, 0], len: w, rot: 'z' }, { p: [x, -s, 0], len: w, rot: 'z' }, { p: [x, 0, s], len: w, rot: 'y' }, { p: [x, 0, -s], len: w, rot: 'y' });
  }
  const im = new THREE.InstancedMesh(geo, mats.metal, rods.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  rods.forEach((r, i) => {
    if (r.rot === 'long') q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    else if (r.rot === 'z') q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    else q.identity();
    sc.set(1, r.len, 1); p.set(...r.p);
    im.setMatrixAt(i, m.compose(p, q, sc));
  });
  g.add(im);
  if (axis === 'y') g.rotation.z = Math.PI / 2;
  return g;
}
function solarWing(mats, hx, hz) {
  const g = new THREE.Group();
  g.add(box(hx, 0.02, hz, mats.solar));
  g.add(box(hx, 0.035, 0.04, mats.metal, 0, 0, hz));
  g.add(box(hx, 0.035, 0.04, mats.metal, 0, 0, -hz));
  return g;
}
function dish(mats, r = 0.8) {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, 0.8), mats.white);
  d.material = mats.white; d.rotation.x = Math.PI;
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, r * 0.9, 6), mats.metal);
  feed.position.y = -r * 0.25;
  g.add(d, feed);
  return g;
}

function blinker(mat, x, y, z, period = 1.6, phase = 0, size = 0.09) {
  const s = sphere(size, mat, x, y, z, 8);
  s.userData.blink = { period, phase };
  return s;
}

// Estação (por tipo) com as medidas de bodies.js
export function buildStation(type, mats) {
  const D = TYPES[type], g = new THREE.Group(), blinkers = [];
  const B = (...a) => { const b = blinker(...a); blinkers.push(b); g.add(b); return b; };
  let port;
  if (type === 'estacao') {
    g.add(capsuleZ(2.2, -12, 4.5, mats.hull));
    for (const z of [-10, -6, 0, 3]) { const band = new THREE.Mesh(new THREE.TorusGeometry(2.21, 0.06, 6, 40), mats.metal); band.position.z = z; g.add(band); }
    g.add(sphere(3, mats.gold, 0, 0, -3, 40));
    for (const s of [-1, 1]) { const hatch = cylZ(0.9, 0, 0.3, mats.white, 20); hatch.rotation.y = Math.PI / 2; hatch.position.set(s * 2.9, 0, -3); g.add(hatch); }
    const tr = truss(34, 1.0, mats); tr.position.set(0, 0, -3); g.add(tr);
    for (const s of [-1, 1]) {
      const w = solarWing(mats, 5.5, 2.3); w.position.set(s * 11.5, 0, -3); g.add(w);
      g.add(box(0.25, 0.25, 0.25, mats.dark, s * 17, 0, -3));
    }
    g.add(box(0.08, 3.3, 1.55, mats.white, 0, 0, -9));
    const rad = box(0.1, 3.4, 1.6, mats.metal, 0, 0, -9); rad.scale.set(0.6, 1, 1); g.add(rad);
    const mast = cylZ(0.12, 0, 3.6, mats.metal, 8); mast.rotation.x = -Math.PI / 2; mast.position.set(0, 2.9, -9); g.add(mast);
    const dsh = dish(mats, 0.9); dsh.position.set(0, 6.6, -9); dsh.rotation.x = -0.4; g.add(dsh);
    // berço do satélite: braço e garra embaixo da estação
    const arm = cylZ(0.18, 0, 1, mats.white, 10); arm.rotation.x = Math.PI / 2; arm.scale.z = 2.9; arm.position.set(0, -3.6, 0); g.add(arm);
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 6, 32), mats.lightA);
    cradle.rotation.x = Math.PI / 2; cradle.position.set(...D.cradle); cradle.position.y += 1.25; g.add(cradle);
    g.userData.cradle = cradle;
    B(mats.lightR, -17.3, 0, -3, 1.4, 0); B(mats.lightG, 17.3, 0, -3, 1.4, 0); B(mats.lightW, 0, 2.3, -12, 2.2, 0.5, 0.12);
    port = dockingPort(mats, D.port, 0.6, 4.5);
  } else if (type === 'satelite') {
    g.add(box(0.8, 0.8, 1.0, mats.gold));
    g.add(box(0.82, 0.82, 0.05, mats.white, 0, 0, 0.98));
    g.add(box(0.82, 0.82, 0.05, mats.white, 0, 0, -0.98));
    for (const s of [-1, 1]) { const w = solarWing(mats, 1.9, 0.6); w.position.set(s * 2.9, 0, 0); g.add(w); g.add(cylZ(0.05, -0.1, 0.1, mats.metal, 6).translateX(s * 0.95)); }
    const dsh = dish(mats, 0.55); dsh.position.set(0, -0.95, -0.3); dsh.rotation.x = Math.PI; g.add(dsh);
    // pino de captura com alvo
    g.add(cylZ(0.12, 1.0, 1.3, mats.metal, 12));
    const t = cylZ(0.3, 1.28, 1.33, mats.target, 24); g.add(t);
    B(mats.lightG, 0.75, 0.75, 1.02, 1.0, 0, 0.05); B(mats.lightR, -0.75, 0.75, 1.02, 1.0, 0.5, 0.05);
    port = null;
  } else if (type === 'posto') {
    // asteroide grande com o posto de mineração
    const geo = rockGeometry(9, 77, 0.1, 5);
    g.add(new THREE.Mesh(geo, mats.rock).translateZ(-4));
    g.add(capsuleZ(1.8, 3, 10.6, mats.hull));
    for (const z of [5, 8]) { const band = new THREE.Mesh(new THREE.TorusGeometry(1.81, 0.06, 6, 32), mats.orange); band.position.z = z; g.add(band); }
    g.add(sphere(2.4, mats.windows, 6, 5, 1, 28));
    const leg = cylZ(0.3, 0, 1, mats.metal, 8); leg.scale.z = 5; leg.position.set(3.2, 2.6, -1.5); leg.lookAt(6, 5, 1); g.add(leg);
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI * 2 + 0.4;
      const tower = box(0.25, 0.25, 2.2, mats.dark, Math.cos(a) * 5, Math.sin(a) * 5, 4.2);
      g.add(tower);
      B(k === 0 ? mats.lightR : mats.lightA, Math.cos(a) * 5, Math.sin(a) * 5, 6.5, 1.8, k * 0.3);
    }
    const tr = truss(12, 0.8, mats); tr.rotation.y = Math.PI / 2; tr.position.set(-4, -3, 0); g.add(tr);
    const dsh = dish(mats, 1.2); dsh.position.set(-5, -3.5, 6); dsh.rotation.x = -1.2; g.add(dsh);
    port = dockingPort(mats, D.port, 0.6, 10.6);
  } else if (type === 'roda') {
    g.add(cylZ(2.5, -6, 4, mats.hull, 40));
    for (const z of [-4, 0, 3]) { const band = new THREE.Mesh(new THREE.TorusGeometry(2.51, 0.07, 6, 40), mats.orange); band.position.z = z; g.add(band); }
    for (let k = 0; k < 4; k++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 31, 16), mats.white);
      sp.position.z = -1; sp.rotation.z = k * Math.PI / 2; if (k > 1) continue; g.add(sp);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(18, 2.25, 20, 96), mats.windows2);
    rim.position.z = -1; g.add(rim);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      const pod = box(1.2, 1.2, 2.6, mats.hull, Math.cos(a) * 18, Math.sin(a) * 18, -1);
      pod.rotation.z = a; g.add(pod);
      B(k % 2 ? mats.lightR : mats.lightW, Math.cos(a) * 20.35, Math.sin(a) * 20.35, -1, 2.0, k / 8, 0.16);
    }
    // painéis atrás do cubo (do lado oposto ao encaixe)
    for (const s of [-1, 1]) { const w = solarWing(mats, 5, 1.6); w.rotation.z = Math.PI / 2; w.position.set(0, s * 7.5, -10); g.add(w); }
    const tr = truss(16, 0.8, mats, 'y'); tr.position.z = -10; g.add(tr);
    g.add(cylZ(0.5, -10, -6, mats.metal, 12));
    port = dockingPort(mats, D.port, 0.6, 4);
  } else if (type === 'cilindro') {
    g.add(cylZ(9, -42, -9, mats.windows2, 64));
    for (const z of [-40, -30, -20, -11]) { const band = new THREE.Mesh(new THREE.TorusGeometry(9.02, 0.12, 6, 64), mats.metal); band.position.z = z; g.add(band); }
    const cap = new THREE.Mesh(new THREE.CircleGeometry(9, 64), mats.hull); cap.position.z = -8.99; g.add(cap);
    const capB = new THREE.Mesh(new THREE.CircleGeometry(9, 64), mats.dark); capB.position.z = -42.01; capB.rotation.y = Math.PI; g.add(capB);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.25, 8, 64), mats.gold); ring.position.z = -8.9; g.add(ring);
    g.add(cylZ(2.4, -9, -1.2, mats.hull, 32));
    for (const [x, y, rz] of [[11, 0, 0], [-11, 0, 0], [0, 11, Math.PI / 2], [0, -11, Math.PI / 2]]) {
      const fin = new THREE.Group();
      fin.add(box(2, 0.2, 14, mats.solar)); fin.add(box(2.05, 0.25, 0.1, mats.metal, 0, 0, 14)); fin.add(box(2.05, 0.25, 0.1, mats.metal, 0, 0, -14));
      fin.position.set(x, y, -26); fin.rotation.z = rz; g.add(fin);
      B(mats.lightR, x * 1.18, y * 1.18, -12, 1.5, x > 0 || y > 0 ? 0 : 0.5, 0.18);
    }
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; B(mats.lightW, Math.cos(a) * 8.6, Math.sin(a) * 8.6, -8.9, 2.4, k / 12, 0.14); }
    port = dockingPort(mats, D.port, 0.6, -1.2);
  }
  if (port) g.add(port);
  g.userData.blinkers = blinkers;
  g.userData.port = port;
  return g;
}

// pedra: icosaedro amassado por ruído, com cores de rocha por vértice
export function rockGeometry(r, seed, rough = 0.28, detail = 3) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const N = makeNoise(seed), p = geo.attributes.position, cols = [];
  const R = rng(seed);
  const base = [0.42 + R() * 0.1, 0.38 + R() * 0.08, 0.34 + R() * 0.06];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = N(v.x * 1.6 + 5, v.y * 1.6, v.z * 1.6, 4), n2 = N(v.x * 5, v.y * 5 + 3, v.z * 5, 2);
    const k = 1 - rough + rough * (n * 0.8 + n2 * 0.2) * 1.0;
    p.setXYZ(i, v.x * r * k, v.y * r * k, v.z * r * k);
    const sh = 0.65 + n2 * 0.55;
    cols.push(base[0] * sh, base[1] * sh, base[2] * sh);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

// Pedras e detritos: um InstancedMesh por formato
export class Swarm {
  constructor(scene, mats, kind, items) {
    this.items = items;
    this.meshes = [];
    const n = 4;
    for (let s = 0; s < n; s++) {
      const count = items.filter(i => i.shape === s).length;
      if (!count) { this.meshes.push(null); continue; }
      let geo, mat;
      if (kind === 'rock') { geo = rockGeometry(1, 300 + s * 17, 0.32, 2); mat = mats.rock; }
      else {
        geo = s === 0 ? new THREE.BoxGeometry(1.4, 0.08, 0.9) : s === 1 ? alongZ(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12)) : s === 2 ? new THREE.BoxGeometry(0.9, 0.9, 0.9) : new THREE.IcosahedronGeometry(0.8, 0);
        mat = s === 0 ? mats.solar : s === 1 ? mats.white : s === 2 ? mats.gold : mats.metal;
      }
      const im = new THREE.InstancedMesh(geo, mat, count);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      scene.add(im);
      this.meshes.push(im);
    }
    this.q = items.map(i => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...i.spinAxis), i.seed * 6.28));
    this.update(0);
  }
  update(dt) {
    const m = new THREE.Matrix4(), sc = new THREE.Vector3(), p = new THREE.Vector3(), dq = new THREE.Quaternion(), ax = new THREE.Vector3();
    const idx = [0, 0, 0, 0];
    this.items.forEach((it, i) => {
      const im = this.meshes[it.shape];
      ax.set(...it.spinAxis);
      dq.setFromAxisAngle(ax, it.spinRate * dt);
      this.q[i].premultiply(dq);
      p.set(...it.p);
      sc.setScalar(it.r);
      im.setMatrixAt(idx[it.shape]++, m.compose(p, this.q[i], sc));
    });
    for (const im of this.meshes) if (im) im.instanceMatrix.needsUpdate = true;
  }
  dispose(scene) { for (const im of this.meshes) if (im) { scene.remove(im); im.geometry.dispose(); im.dispose(); } }
}

// Argola de passagem
export function buildRing(mats, R) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 8, 64), mats.ring);
  g.add(t);
  const lights = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    const l = sphere(0.18, mats.lightW, Math.cos(a) * R, Math.sin(a) * R, 0, 8);
    g.add(l); lights.push(l);
  }
  g.userData = { torus: t, lights };
  return g;
}

// Astronauta: traje branco, viseira dourada, mochila e luz piscando
export function buildAstronaut(mats) {
  const g = new THREE.Group();
  const caps = (r, l, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), mats.suit); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); return m; };
  caps(0.24, 0.35, 0, 0.1, 0);                       // tronco
  const helmet = sphere(0.19, mats.suit, 0, 0.62, 0, 20); g.add(helmet);
  const visor = sphere(0.15, mats.visor, 0, 0.63, -0.07, 20); visor.scale.set(1, 0.8, 0.8); g.add(visor);
  g.add(box(0.2, 0.26, 0.11, mats.white, 0, 0.2, 0.25));
  caps(0.08, 0.42, -0.34, 0.15, 0, 0, 0.6); caps(0.08, 0.42, 0.34, 0.15, 0, 0, -0.9);
  caps(0.1, 0.5, -0.13, -0.5, 0, 0.2, 0.1); caps(0.1, 0.5, 0.13, -0.5, 0, -0.3, -0.1);
  g.add(box(0.12, 0.05, 0.04, mats.orange, 0, 0.3, -0.24));
  const light = blinker(mats.lightA, 0, 0.82, 0.05, 1.0, 0, 0.05);
  g.add(light);
  g.userData.blinkers = [light];
  return g;
}

// ---------- Nave do jogador (por fora) e cabine ----------
// Bocais dos propulsores: 8 cantos, cada um com 3 bicos (x, y e z para fora)
export const NOZZLES = (() => {
  const list = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const pos = [sx * 0.95, sy * 0.62, sz === -1 ? -0.95 : 0.95];
    list.push({ pos, dir: [sx, 0, 0] }, { pos, dir: [0, sy, 0] }, { pos, dir: [0, 0, sz] });
  }
  return list;
})();
export function nozzleThrottle(out) {
  // força desejada e torque desejado (referencial da nave) -> quanto cada bico acende
  const f = out.t, tq = out.r;
  return NOZZLES.map(nz => {
    const push = [-nz.dir[0], -nz.dir[1], -nz.dir[2]];          // o bico empurra a nave para o lado oposto
    let a = Math.max(0, push[0] * f[0] + push[1] * f[1] + push[2] * f[2]);
    const tr = [nz.pos[1] * push[2] - nz.pos[2] * push[1], nz.pos[2] * push[0] - nz.pos[0] * push[2], nz.pos[0] * push[1] - nz.pos[1] * push[0]];
    const tl = Math.hypot(...tr) || 1;
    a += Math.max(0, (tr[0] * tq[0] + tr[1] * tq[1] + tr[2] * tq[2]) / tl) * 0.8;
    return Math.min(1, a);
  });
}

export function buildShip(mats) {
  const g = new THREE.Group();
  const ext = new THREE.Group();          // casco: aparece de fora (e por trás quando dentro)
  g.add(ext);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mats.hull);
  body.scale.set(0.95, 0.78, 0.95); body.position.z = 0.35;
  ext.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), mats.gold);
  belly.scale.set(0.97, 0.8, 0.97); belly.position.z = 0.35; ext.add(belly);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 6, 48), mats.orange);
  stripe.rotation.y = Math.PI / 2; stripe.position.z = 0.35; stripe.scale.set(0.82, 1, 1); ext.add(stripe);
  // cúpula de vidro na frente
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.88, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.glass);
  dome.rotation.x = -Math.PI / 2; dome.position.set(0, 0.25, -0.35); dome.scale.set(1, 1.1, 0.8);
  g.add(dome);
  // sonda de atracação
  g.add(cylZ(0.035, SHIP.probe[2], -1.2, mats.metal, 10));
  const tip = sphere(0.07, mats.orange, 0, 0, SHIP.probe[2], 12); g.add(tip);
  const collar = cylZ(0.14, -1.35, -1.2, mats.metal, 16); g.add(collar);
  // blocos dos propulsores e as plumas
  const plumeGeo = new THREE.ConeGeometry(0.06, 0.38, 10, 1, true); plumeGeo.translate(0, -0.19, 0); plumeGeo.rotateX(Math.PI);
  const plumes = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const blk = box(0.09, 0.09, 0.09, mats.dark, sx * 0.95, sy * 0.62, sz === -1 ? -0.95 : 0.95);
    g.add(blk);
  }
  for (const nz of NOZZLES) {
    const p = new THREE.Mesh(plumeGeo, mats.plume);
    p.position.set(nz.pos[0] + nz.dir[0] * 0.1, nz.pos[1] + nz.dir[1] * 0.1, nz.pos[2] + nz.dir[2] * 0.1);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...nz.dir));
    p.visible = false;
    g.add(p); plumes.push(p);
  }
  const navR = blinker(mats.lightR, -0.98, 0.15, 0.3, 1.2, 0, 0.04), navG = blinker(mats.lightG, 0.98, 0.15, 0.3, 1.2, 0, 0.04);
  g.add(navR, navG);
  g.userData.blinkers = [navR, navG];
  return { group: g, ext, plumes };
}

// Cabine: moldura da janela, console, alavancas. É o referencial fixo que o jogador vê.
export function buildCockpit(mats) {
  const g = new THREE.Group();
  const E = SHIP.eye;
  const frameMat = new THREE.MeshStandardMaterial({ color: '#3a3f4a', roughness: 0.55, metalness: 0.6 });
  const padMat = new THREE.MeshStandardMaterial({ color: '#1d2028', roughness: 0.9 });
  // arcos da cúpula (por cima da cabeça e na frente)
  const arc = (r, z, rot = 0) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 8, 40, Math.PI), frameMat); m.position.set(0, E[1] - 0.25, z); m.rotation.z = rot; g.add(m); return m; };
  arc(0.86, E[2] - 0.62); arc(0.86, E[2] + 0.1);
  // parapeito em volta
  for (const s of [-1, 1]) g.add(box(0.05, 0.05, 0.55, padMat, s * 0.84, E[1] - 0.27, E[2] - 0.25));
  // console inclinado com telas
  const consoleG = new THREE.Group();
  consoleG.position.set(0, E[1] - 0.48, E[2] - 0.52);
  consoleG.rotation.x = -0.55;
  const panelMat = new THREE.MeshStandardMaterial({ color: '#454c5c', roughness: 0.7, metalness: 0.3, emissive: '#0c1424' });
  consoleG.add(box(0.5, 0.025, 0.17, panelMat));
  consoleG.add(box(0.5, 0.012, 0.004, mats.lightA, 0, 0.026, -0.165));
  const btnMats = [mats.lightG, mats.lightA, mats.lightW, mats.lightR];
  for (let k = 0; k < 10; k++) for (const side of [-1, 1]) {
    const b = box(0.012, 0.006, 0.009, btnMats[(k + (side > 0 ? 2 : 0)) % 4], side * (0.36 + (k % 2) * 0.05), 0.028, -0.12 + Math.floor(k / 2) * 0.055);
    consoleG.add(b);
  }
  g.add(consoleG);
  g.add(box(0.5, 0.2, 0.05, frameMat, 0, E[1] - 0.66, E[2] - 0.56));
  // assento
  g.add(box(0.26, 0.04, 0.24, padMat, 0, E[1] - 0.85, E[2] + 0.2));
  g.add(box(0.26, 0.38, 0.04, padMat, 0, E[1] - 0.5, E[2] + 0.42));
  g.add(box(0.12, 0.09, 0.05, padMat, 0, E[1] - 0.02, E[2] + 0.38));
  // alavancas: base, haste e manopla. Pivô na base.
  const lever = (x, color) => {
    const base = new THREE.Group();
    base.position.set(x, E[1] - 0.6, E[2] - 0.22);
    base.add(box(0.07, 0.03, 0.07, padMat));
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.05, 12), padMat); boot.position.y = 0.05; base.add(boot);
    const stick = new THREE.Group();
    stick.position.y = 0.05;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.12, 8), mats.metal); rod.position.y = 0.06; stick.add(rod);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 }));
    knob.position.y = 0.13; knob.scale.set(1, 1.3, 1); stick.add(knob);
    base.add(stick);
    g.add(base);
    return { base, stick, knob, rest: new THREE.Vector3(x, E[1] - 0.6 + 0.05 + 0.13, E[2] - 0.22) };
  };
  const left = lever(-0.24, '#4fe3c1'), right = lever(0.24, '#ffb340');
  return { group: g, consoleG, left, right };
}
