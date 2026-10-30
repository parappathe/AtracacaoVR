// Liga o núcleo (física, fases, robô) à tela, ao Quest (alavancas, botões, vibração) e ao
// mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { LEVELS, CHAPTERS } from './levels.js';
import { Game, DT, LIM } from './sim.js';
import { Robot } from './robot.js';
import { SHIP } from './bodies.js';
import { qmul, qconj, qlog } from './math.js';
import { buildWorld, buildStation, buildShip, buildCockpit, buildRing, buildAstronaut, Swarm, nozzleThrottle } from './scene.js';
import { Hud, HUD_DIST, fmtTime } from './hud.js';
import { Panel, Label, C as UI } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const f1 = (v) => v.toFixed(1).replace('.', ',');
const E = SHIP.eye;

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(IS_QUEST ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld(renderer);
const { scene, mats } = world;
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 6000);

// nave do jogador: casco, cabine, HUD e o "rig" (no VR é a referência do óculos)
const shipG = new THREE.Group();
scene.add(shipG);
const shipVis = buildShip(mats);
shipG.add(shipVis.group);
const cockpit = buildCockpit(mats);
shipG.add(cockpit.group);
const hud = new Hud();
hud.mesh.position.set(E[0], E[1], E[2] - HUD_DIST);
shipG.add(hud.mesh);
const rig = new THREE.Group();
shipG.add(rig);
rig.add(camera);
const consoleLabel = new Label(0.3, 512, 200);
consoleLabel.mesh.position.set(0, 0.03, 0);
consoleLabel.mesh.rotation.x = -Math.PI / 2;
consoleLabel.mesh.material.depthTest = true;
cockpit.consoleG.add(consoleLabel.mesh);

const panel = new Panel(0.8);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);

// vinheta de conforto (escurece a borda quando a nave gira)
const vignette = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, uA * smoothstep(0.35, 0.95, r)); }',
  transparent: true, depthTest: false, depthWrite: false,
}));
vignette.position.z = -0.1;
vignette.renderOrder = 40;
vignette.visible = false;
camera.add(vignette);

// ---------- Estado ----------
let app = 'menu';            // 'menu' | 'playing' | 'paused' | 'done' | 'failed'
let levelIndex = 0;
let game = null;
let robot = null;
let msg = null;
let endTimer = 0;
let lastResult = null, newRecord = false;
let vis = null;              // objetos 3D da fase atual
let chapterShown = -1;
const prev = { p: new THREE.Vector3(), q: new THREE.Quaternion(), sp: new THREE.Vector3(), sq: new THREE.Quaternion(), ok: false };

const unlockedUpTo = () => {
  let n = 0;
  while (n < LEVELS.length && save.done[n]) n++;
  return Math.min(n, LEVELS.length - 1);
};
const TASK_TEXT = {
  dock: 'Encaixe na estação', capture: 'Pegue o satélite pelo pino', deliver: 'Leve o satélite até o berço (anel laranja)',
  ring: (i) => `Passe pela argola ${i + 1}`, rescue: () => 'Resgate o astronauta',
};
function taskText(t) { if (!t) return 'Concluído'; const f = TASK_TEXT[t.type]; return typeof f === 'function' ? f(t.i) : f; }

function buildVisuals() {
  if (vis) {
    for (const o of vis.objects) scene.remove(o);
    vis.rocks?.dispose(scene); vis.debris?.dispose(scene);
  }
  const L = LEVELS[levelIndex];
  if (chapterShown !== L.chapter) { world.setChapter(L.chapter); chapterShown = L.chapter; }
  const objects = [];
  const station = buildStation(game.station.type, mats);
  scene.add(station); objects.push(station);
  let sat = null;
  if (game.sat) { sat = buildStation('satelite', mats); scene.add(sat); objects.push(sat); }
  const rings = game.rings.map(r => {
    const m = buildRing(mats, r.R);
    m.position.set(...r.c);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...r.n));
    scene.add(m); objects.push(m);
    return m;
  });
  const astros = game.astros.map(() => { const m = buildAstronaut(mats); scene.add(m); objects.push(m); return m; });
  const rocks = game.field.list.length ? new Swarm(scene, mats, 'rock', game.field.list) : null;
  const debris = game.debris.length ? new Swarm(scene, mats, 'debris', game.debris) : null;
  const blinkers = [...station.userData.blinkers, ...(sat?.userData.blinkers || []), ...astros.flatMap(a => a.userData.blinkers), ...shipVis.group.userData.blinkers];
  vis = { objects, station, sat, rings, astros, rocks, debris, blinkers, astroQ: game.astros.map(a => new THREE.Quaternion()) };
}

function loadLevel(i) {
  levelIndex = clamp(i, 0, LEVELS.length - 1);
  game = new Game(LEVELS[levelIndex]);
  robot?.reset();
  buildVisuals();
  acc = 0;
  msg = null;
  prev.ok = false;
  holds.left = holds.right = null;
  look.yaw = 0; look.pitch = 0;
  syncVisuals(1);
}

function startLevel(i) {
  loadLevel(i);
  app = 'playing';
  endTimer = 0;
  panel.hide();
  showMsg(LEVELS[levelIndex].hint, 9, '#eef3ff');
  updateHint();
}
function togglePause() {
  if (app === 'playing') { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'playing'; panel.hide(); }
  updateHint();
}
function goMenu() {
  app = 'menu';
  loadLevel(unlockedUpTo());
  showScreen('main');
  updateHint();
}
function showMsg(text, t = 2.5, color = '#ffd25a') { msg = { text, t, color }; }

// ---------- Menus ----------
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  placePanel();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Atracação', 74);
      p.text('Pilotagem espacial com física de verdade: nada freia sozinho.', 512, 136, { size: 28, color: UI.dim });
      const next = unlockedUpTo();
      p.button(save.done[0] ? `Continuar: fase ${next + 1}` : 'Começar', () => startLevel(next), 262, 185, 500, 96, { size: 38 });
      p.button('Escolher fase', () => showScreen('levels'), 262, 301, 500, 80);
      p.button('Como jogar', () => showScreen('help'), 262, 401, 500, 80);
      const opt = (label, key, x, after) => p.button(`${label}: ${save[key] ? 'sim' : 'não'}`, () => { save[key] = !save[key]; storeSave(save); after?.(); showScreen('main'); }, x, 501, 230, 66, { size: 26 });
      opt('Som', 'sound', 152, () => sfx.setOn(save.sound));
      opt('Vinheta', 'vignette', 397);
      opt('FPS', 'fps', 642);
      const total = Object.values(save.done).reduce((s, d) => s + (d.stars || 0), 0);
      p.text(`Estrelas: ${total} de ${LEVELS.length * 3}`, 512, 610, { size: 26, color: UI.star });
      p.text(vr ? 'Segure o botão lateral (aperto) perto de uma alavanca para pegar nela' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 662, { size: 22, color: UI.dim });
    } else if (name === 'levels') {
      p.title('Fases', 50);
      const up = unlockedUpTo();
      CHAPTERS.forEach((cname, ci) => {
        const y = 92 + ci * 182;
        p.text(cname, 60, y, { size: 24, align: 'left', bold: true, color: UI.edge });
        for (let c = 0; c < 5; c++) {
          const i = ci * 5 + c, l = LEVELS[i], d = save.done[i];
          p.tile(60 + c * 182, y + 18, 170, 140, {
            num: i + 1, name: l.name, stars: d?.stars || 0, done: !!d, locked: i > up, master: c === 4,
            action: () => startLevel(i),
          });
        }
      });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 642, 300, 60, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = vr ? [
        'Aperto perto da alavanca esquerda: deslocar a mão move a nave',
        '(frente, trás, lados, cima, baixo). Soltou: continua andando.',
        'Alavanca direita: inclinar = arfagem e guinada, torcer = rolagem.',
        'A ou X: estabilizar (zera o giro, gasta mais combustível).',
        'Encaixe abaixo de 0,3 m/s, com a cruz centrada e parada.',
        'Astronauta: iguale a velocidade e pegue com a mão pela janela.',
        'B ou Y: pausa (Recentralizar põe os olhos no assento).',
      ] : [
        'W/S: frente e trás · A/D: lados · R/F: sobe e desce.',
        'Setas: arfagem e guinada · Q/E: rolagem · Shift: devagar.',
        'Botão direito do mouse arrastando: girar a nave.',
        'Espaço: estabilizar (zera o giro, gasta mais combustível).',
        'Encaixe abaixo de 0,3 m/s, com a cruz centrada e parada.',
        'Astronauta: iguale a velocidade e encoste o lado direito.',
        'Botão esquerdo arrastando: olhar · C: câmera · Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 56, 128 + i * 58, { size: 26, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 64);
      p.text(`Fase ${levelIndex + 1}: ${LEVELS[levelIndex].name}`, 512, 122, { size: 28, color: UI.dim });
      p.button('Continuar', () => togglePause(), 262, 160, 500, 80);
      p.button('Recomeçar a fase', () => startLevel(levelIndex), 262, 252, 500, 80);
      p.button('Escolher fase', () => showScreen('levels'), 262, 344, 500, 80);
      p.button('Recentralizar', () => { recenter(); togglePause(); }, 262, 436, 245, 80, { size: 28, locked: !vr });
      p.button('Como jogar', () => showScreen('help'), 517, 436, 245, 80, { size: 28 });
      p.button('Mais baixo', () => { save.height -= 0.05; storeSave(save); recenter(); showScreen('pause'); }, 262, 528, 160, 64, { size: 24, locked: !vr });
      p.text(vr ? `altura ${save.height >= 0 ? '+' : ''}${Math.round(save.height * 100)} cm` : '', 512, 560, { size: 22, color: UI.dim });
      p.button('Mais alto', () => { save.height += 0.05; storeSave(save); recenter(); showScreen('pause'); }, 602, 528, 160, 64, { size: 24, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 610, 500, 70);
    } else if (name === 'done') {
      const r = lastResult, L = LEVELS[levelIndex], d = save.done[levelIndex];
      p.title(newRecord ? 'Novo recorde!' : 'Missão cumprida!', 62);
      p.stars(r.stars, 512, 140, 74);
      p.text(`Tempo ${fmtTime(r.time)}  ·  combustível ${f1(r.fuel)}%  ·  dano ${r.damage}%`, 512, 220, { size: 30, bold: true, color: UI.edge });
      p.text(`3 estrelas: até ${L.stars.fuel[0]}% e ${fmtTime(L.stars.time[0])} · 2 estrelas: até ${L.stars.fuel[1]}% e ${fmtTime(L.stars.time[1])}`, 512, 270, { size: 21, color: UI.dim });
      p.text('Dano de 50% ou mais tira uma estrela.', 512, 302, { size: 20, color: UI.dim });
      if (d) p.text(`Melhor: ${d.stars} estrela${d.stars === 1 ? '' : 's'} · ${fmtTime(d.time)} · ${f1(d.fuel)}%`, 512, 338, { size: 23, color: UI.dim });
      if (levelIndex < LEVELS.length - 1) p.button('Próxima fase', () => startLevel(levelIndex + 1), 262, 370, 500, 92, { size: 36 });
      else p.text('Você completou todas as atracações!', 512, 416, { size: 34, bold: true, color: UI.edge });
      p.button('Repetir', () => startLevel(levelIndex), 262, 478, 245, 80);
      p.button('Fases', () => showScreen('levels'), 517, 478, 245, 80);
      p.button('Menu principal', () => goMenu(), 262, 576, 500, 78);
    } else if (name === 'failed') {
      p.title('Missão perdida', 70);
      p.text(game.failReason || '', 512, 160, { size: 32, color: UI.red });
      p.text('Dica: devagar se chega. Sem atrito, cada empurrão precisa de outro para frear.', 512, 220, { size: 22, color: UI.dim });
      p.button('Tentar de novo', () => startLevel(levelIndex), 262, 290, 500, 96, { size: 38 });
      p.button('Fases', () => showScreen('levels'), 262, 410, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 510, 500, 80);
    }
  });
}

function placePanel() {
  if (renderer.xr.isPresenting) {
    if (panel.mesh.parent !== shipG) shipG.add(panel.mesh);
    panel.mesh.scale.setScalar(1);
    panel.mesh.position.set(0, E[1] + save.height * 0 - 0.02, E[2] - 0.75);
    panel.mesh.rotation.set(-0.08, 0, 0);
    return;
  }
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.7 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.7);
  panel.mesh.rotation.set(0, 0, 0);
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.8, visH * 0.92 / 0.5625));
}

function finishLevel() {
  const r = game.result;
  lastResult = r;
  const prevBest = save.done[levelIndex];
  const better = !prevBest || r.stars > prevBest.stars || (r.stars === prevBest.stars && r.time < prevBest.time);
  newRecord = !!prevBest && better;
  if (better) save.done[levelIndex] = { stars: r.stars, time: r.time, fuel: r.fuel, damage: r.damage };
  storeSave(save);
  app = 'done';
  showScreen('done');
  for (let k = 0; k < r.stars; k++) setTimeout(() => sfx.star(k), 400 + k * 230);
  updateHint();
}

// ---------- VR: controles e alavancas ----------
const ctrls = [];
const markGeo = new THREE.SphereGeometry(0.02, 10, 8);
const handMat = new THREE.MeshStandardMaterial({ color: '#d9c7b0', roughness: 0.7 });
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl, grip);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x6ff5d0 }));
  laser.visible = false;
  ctrl.add(laser);
  const mark = new THREE.Mesh(markGeo, handMat);
  grip.add(mark);
  const entry = { ctrl, grip, laser, mark, source: null, side: null, prevButtons: [], hoverIndex: -1 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { if (entry.side) holds[entry.side] = null; entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('selectend', () => { if (entry.source?.hand && entry.side) release(entry.side); });
  ctrl.addEventListener('squeezestart', () => { sfx.unlock(); if (entry.side && !entry.source?.hand) grab(entry.side); });
  ctrl.addEventListener('squeezeend', () => { if (entry.side && !entry.source?.hand) release(entry.side); });
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) {
  try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
}
const both = (v, ms) => { pulse('left', v, ms); pulse('right', v, ms); };

// mão no espaço local da nave
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
function handLocal(side) {
  const e = entryFor(side);
  if (!e) return null;
  rig.updateMatrix();
  _v.copy(e.grip.position).applyMatrix4(rig.matrix);
  _q.copy(rig.quaternion).multiply(e.grip.quaternion);
  if (!Number.isFinite(_v.x)) return null;
  return { p: _v.clone(), q: _q.clone() };
}
const holds = { left: null, right: null };
function grab(side) {
  if (app !== 'playing' || panel.visible) return;
  const h = handLocal(side);
  if (!h) return;
  const lv = side === 'left' ? cockpit.left : cockpit.right;
  if (h.p.distanceTo(lv.rest) > 0.4) return;          // longe da alavanca: não pega
  holds[side] = { p0: h.p.clone(), q0: h.q.clone() };
  pulse(side, 0.4, 30);
  sfx.grab();
}
function release(side) { holds[side] = null; }
const DEAD = 0.12;
const dz = (v) => Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD);
// alavanca esquerda: deslocamento da mão (7 cm = tudo); direita: giro da mão (25° inclinar, 30° torcer)
function vrLevers() {
  const t = [0, 0, 0], r = [0, 0, 0];
  if (holds.left) {
    const h = handLocal('left');
    if (h) { const d = h.p.clone().sub(holds.left.p0); t[0] = dz(clamp(d.x / 0.07, -1, 1)); t[1] = dz(clamp(d.y / 0.07, -1, 1)); t[2] = dz(clamp(d.z / 0.07, -1, 1)); }
  }
  if (holds.right) {
    const h = handLocal('right');
    if (h) {
      const qr = h.q.clone().multiply(holds.right.q0.clone().invert());   // giro da mão desde a pegada (no referencial da nave)
      const rv = qlog([qr.x, qr.y, qr.z, qr.w]);
      r[0] = dz(clamp(rv[0] / (25 * Math.PI / 180), -1, 1));     // inclinar para a frente = nariz desce
      r[1] = dz(clamp(rv[2] / (25 * Math.PI / 180), -1, 1));     // inclinar para o lado = guinada
      r[2] = dz(clamp(rv[1] / (30 * Math.PI / 180), -1, 1));     // torcer = rolagem
    }
  }
  // sem segurar: os direcionais também servem (esquerdo = translação no plano, direito = giro)
  for (const e of ctrls) {
    const ax = e.source?.gamepad?.axes;
    if (!ax || e.source.hand || ax.length < 4) continue;
    if (e.side === 'left' && !holds.left) { t[0] += dz(ax[2]); t[2] += dz(ax[3]); }
    if (e.side === 'right' && !holds.right) { r[1] -= dz(ax[2]); r[0] += dz(ax[3]); }
  }
  let stab = false;
  for (const e of ctrls) if (e.source?.gamepad && !e.source.hand && e.source.gamepad.buttons[4]?.pressed) stab = true;
  return { t: t.map(v => clamp(v, -1, 1)), r: r.map(v => clamp(v, -1, 1)), stab };
}

function onSelect(entry) {
  sfx.unlock();
  if (panel.visible) {
    if (entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } }
    return;
  }
  if (entry.source?.hand && entry.side) grab(entry.side);   // mão rastreada: pinça segura a alavanca
}
function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5]) { if (app === 'playing' || app === 'paused') togglePause(); }   // B ou Y
    e.prevButtons = b;
  }
}

// ---------- VR: sessão e recentralizar ----------
let recenterIn = 0;
function recenter() {
  if (!renderer.xr.isPresenting) return;
  // põe os olhos no assento, olhando para a frente da nave (sentado ou em pé)
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(E[0] - head.x, E[1] + save.height - head.y, E[2] - head.z);
  if (panel.visible) placePanel();
}
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 6;
  if (camera.parent !== rig) rig.add(camera);
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  if (panel.visible) placePanel();
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  holds.left = holds.right = null;
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  if (panel.visible) placePanel();
  onResize();
  updateHint();
});

// ---------- Mouse e teclado (PC) ----------
const look = { yaw: 0, pitch: 0, idle: 0 };
const keys = new Set();
const mouse = { ndc: new THREE.Vector2(0, 0), lookDrag: null, rotDrag: null, rot: [0, 0] };
const raycaster = new THREE.Raycaster();
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (e.button === 0) mouse.lookDrag = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch };
  if (e.button === 2) mouse.rotDrag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture?.(e.pointerId);
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 0) mouse.lookDrag = null;
  if (e.button === 2) { mouse.rotDrag = null; mouse.rot = [0, 0]; }
});
canvas.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (mouse.lookDrag) {
    look.yaw = clamp(mouse.lookDrag.yaw - (e.clientX - mouse.lookDrag.x) * 0.004, -2.4, 2.4);
    look.pitch = clamp(mouse.lookDrag.pitch - (e.clientY - mouse.lookDrag.y) * 0.004, -1.2, 1.2);
    look.idle = 0;
  }
  if (mouse.rotDrag) {
    // arrastar = alavanca virtual: quanto mais longe do ponto do clique, mais forte
    mouse.rot = [clamp(-(e.clientY - mouse.rotDrag.y) / 90, -1, 1), clamp(-(e.clientX - mouse.rotDrag.x) / 90, -1, 1)];
  }
});
window.addEventListener('blur', () => { keys.clear(); mouse.lookDrag = mouse.rotDrag = null; mouse.rot = [0, 0]; });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k.startsWith('arrow') || k === ' ') e.preventDefault();
  if (e.repeat) return;
  if (k === 'escape' || k === 'p') { if (app === 'playing' || app === 'paused') togglePause(); return; }
  if (k === 'c') { save.cam = save.cam === 'cockpit' ? 'chase' : 'cockpit'; storeSave(save); return; }
  keys.add(k);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
function pcCommand() {
  const k = (a) => keys.has(a) ? 1 : 0;
  const pw = keys.has('shift') ? 0.3 : 1;
  const t = [(k('d') - k('a')) * pw, (k('r') - k('f')) * pw, (k('s') - k('w')) * pw];
  const r = [(k('arrowup') - k('arrowdown')) * pw + mouse.rot[0], (k('arrowleft') - k('arrowright')) * pw + mouse.rot[1], (k('q') - k('e')) * pw];
  return { t, r: r.map(v => clamp(v, -1, 1)), stab: keys.has(' ') };
}
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.visible) placePanel();
}
window.addEventListener('resize', onResize);

// ---------- Câmeras ----------
const chase = { pos: new THREE.Vector3(), init: false };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3();
let menuT = 0;
function updatePcCamera(dt) {
  if (renderer.xr.isPresenting) return;
  const inMenu = app === 'menu';
  if (!inMenu && save.cam === 'cockpit') {
    if (camera.parent !== rig) rig.add(camera);
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    camera.position.set(...E);
    if (!mouse.lookDrag) { look.idle += dt; if (look.idle > 2) { look.yaw *= 1 - Math.min(1, dt * 1.5); look.pitch *= 1 - Math.min(1, dt * 1.5); } }
    camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    chase.init = false;
    return;
  }
  if (camera.parent !== scene) scene.add(camera);
  if (inMenu) {
    // passeio lento entre a nave e a estação
    menuT += dt;
    const s = game.station, st = _a.set(...s.p), sh = _b.copy(shipG.position);
    const mid = st.clone().lerp(sh, 0.62);
    const a = menuT * 0.05;
    const r = Math.max(22, sh.distanceTo(st) * 0.55);
    camera.position.set(mid.x + Math.sin(a) * r * 0.9 + r * 0.35, mid.y + r * 0.22 + Math.sin(a * 0.7) * 4, mid.z + Math.cos(a) * r * 0.5 + r * 0.5);
    camera.up.set(0, 1, 0);
    camera.lookAt(mid.x, mid.y - 2, mid.z);
    return;
  }
  const target = _a.set(0, 2.2, 9).applyQuaternion(shipG.quaternion).add(shipG.position);
  if (!chase.init) { chase.pos.copy(target); chase.init = true; }
  chase.pos.lerp(target, Math.min(1, dt * 3));
  camera.position.copy(chase.pos);
  camera.up.copy(_up.set(0, 1, 0).applyQuaternion(shipG.quaternion));
  camera.lookAt(_b.set(0, 0, -8).applyQuaternion(shipG.quaternion).add(shipG.position));
}

// ---------- Raios do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = false;
    e.mark.visible = vr && !!e.source;
    if (!vr || !e.source || !panel.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.visible = true;
    e.laser.scale.z = hit ? hit.distance : 1.5;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    canvas.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else if (!vr) canvas.style.cursor = 'crosshair';
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const msgEl = document.getElementById('msg');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.innerHTML = app === 'playing'
    ? '<span>W/S A/D R/F: mover · setas e Q/E (ou botão direito arrastando): girar · Shift: devagar · Espaço: estabilizar · C: câmera · Esc: pausa</span>'
    : '<span>Clique nas opções do painel</span>';
}
let hudT = 0;
function objective() {
  const done = game.tasks.filter(t => t.done).length;
  return `${taskText(game.cur)}${game.tasks.length > 1 ? `  (${Math.min(done + 1, game.tasks.length)}/${game.tasks.length})` : ''}`;
}
function updateHud(dt) {
  const vr = renderer.xr.isPresenting;
  const playing = app === 'playing' || app === 'done' || app === 'failed';
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const cockpitView = vr || save.cam === 'cockpit';
  hud.mesh.visible = playing && cockpitView && !panel.visible;
  hudT -= dt;
  const ro = game.readout();
  if (hud.mesh.visible && hudT <= 0) {
    hudT = 1 / 15;
    hud.draw({ readout: ro, fuel: game.ship.fuel, damage: game.damage, time: game.t, stab: game.ship.out.stab, wDeg: Math.hypot(...game.ship.w) * 57.3, objective: objective(), msg: msg && playing ? msg : null });
  }
  consoleLabel.set([
    { text: `${levelIndex + 1}. ${LEVELS[levelIndex].name}`, size: 0.3, color: UI.edge },
    { text: objective(), size: 0.26, color: '#eef3ff', bold: false },
    { text: `combustível ${Math.round(game.ship.fuel)}%  ·  dano ${game.damage}%`, size: 0.24, color: game.ship.fuel < 15 ? UI.red : UI.dim, bold: false },
  ]);
  if (vr) { hudEl.style.display = 'none'; msgEl.style.display = 'none'; return; }
  hudEl.style.display = playing ? 'block' : 'none';
  if (playing) {
    let html = `<b>${levelIndex + 1}. ${LEVELS[levelIndex].name}</b> · ${fmtTime(game.t)}<br><em>${objective()}</em>`;
    if (!cockpitView && ro) html += `<br>dist ${f1(ro.dist)} m · aprox ${ro.closing.toFixed(2).replace('.', ',')} m/s · vrel ${ro.relV.toFixed(2).replace('.', ',')} m/s${ro.ang != null ? ` · ângulo ${f1(ro.ang * 57.3)}°` : ''}`;
    html += `<br>combustível <span class="${game.ship.fuel < 15 ? 'bad' : game.ship.fuel < 30 ? 'warn' : ''}">${Math.round(game.ship.fuel)}%</span> · dano <span class="${game.damage > 0 ? 'warn' : ''}">${game.damage}%</span>`;
    if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
  }
  const mtxt = msg && playing && !cockpitView ? msg.text : '';
  if (msgEl.dataset.last !== mtxt) { msgEl.textContent = mtxt; msgEl.style.color = msg?.color || '#fff'; msgEl.dataset.last = mtxt; }
  msgEl.style.display = mtxt ? 'block' : 'none';
}

// ---------- Eventos do jogo -> som, vibração, avisos ----------
const WHY = { ang: 'Torto: alinhe o eixo antes de encostar', roll: 'Cruz girada: acerte a rolagem', spin: 'Gire junto com a estação', lat: 'Fora do centro: acerte a cruz' };
function handleEvents(evs) {
  for (const ev of evs) {
    if (ev.type === 'hit') {
      sfx.hit(ev.v); both(Math.min(1, 0.3 + ev.v / 1.5), 80);
      showMsg(ev.dmg ? `Batida no ${ev.what}! Dano +${ev.dmg}%` : `Encostou no ${ev.what}`, 2, ev.dmg ? '#ff6a5a' : '#ffd25a');
    } else if (ev.type === 'dock') { sfx.clunk(); both(1, 180); showMsg('Encaixado!', 3, '#6ff5d0'); }
    else if (ev.type === 'capture') { sfx.clunk(); both(0.9, 150); showMsg('Satélite preso! Leve até o berço embaixo da estação.', 4, '#6ff5d0'); }
    else if (ev.type === 'deliver') { sfx.clunk(); both(0.7, 120); showMsg('Satélite entregue!', 3, '#6ff5d0'); }
    else if (ev.type === 'dockFail') {
      sfx.bounce(); both(ev.why === 'fast' ? 1 : 0.4, 90);
      if (ev.why === 'fast') { sfx.hit(ev.v); showMsg(`Rápido demais (${ev.v.toFixed(2).replace('.', ',')} m/s)! Amassou: +${ev.dmg}%`, 3, '#ff6a5a'); }
      else showMsg(WHY[ev.why], 3, '#ffb340');
    } else if (ev.type === 'ring') { sfx.ring(); showMsg(`Argola ${ev.i + 1} ✓`, 1.6, '#6ff5d0'); }
    else if (ev.type === 'ringMiss') showMsg('Passou fora da argola: volte e passe por dentro', 2.5, '#ffb340');
    else if (ev.type === 'rescue') { sfx.rescue(); both(0.6, 100); showMsg('Astronauta a bordo!', 2.5, '#6ff5d0'); }
    else if (ev.type === 'tooFast') showMsg('Devagar! Iguale a velocidade dele para pegar.', 2.5, '#ffb340');
    else if (ev.type === 'bump') { sfx.bounce(); showMsg('Cuidado: você empurrou o astronauta', 2.5, '#ffb340'); }
    else if (ev.type === 'fuelLow') { sfx.warn(); showMsg('Combustível baixo', 3, '#ffb340'); }
    else if (ev.type === 'fuelOut') { sfx.alarm(); showMsg('Sem combustível! A nave segue no embalo.', 4, '#ff6a5a'); }
    else if (ev.type === 'task') { sfx.ring(); setTimeout(() => showMsg(taskText(game.cur), 3, '#eef3ff'), 1800); }
    else if (ev.type === 'done') { sfx.done(); endTimer = 2.5; }
    else if (ev.type === 'fail') { sfx.alarm(); both(1, 300); showMsg(ev.reason, 4, '#ff6a5a'); endTimer = 2.0; }
  }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const okXR = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!okXR) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now(), time = 0;
let fpsFrames = 0, fpsTime = 0, vigA = 0, hapT = 0;
let lastCmd = { t: [0, 0, 0], r: [0, 0, 0], stab: false };

function syncVisuals(alpha) {
  const S = game.ship;
  const p = new THREE.Vector3(...S.p), q = new THREE.Quaternion(...S.q);
  const st = game.station, sp = new THREE.Vector3(...st.p), sq = new THREE.Quaternion(...st.q);
  if (prev.ok && alpha < 1) {
    shipG.position.copy(prev.p).lerp(p, alpha); shipG.quaternion.copy(prev.q).slerp(q, alpha);
    vis.station.position.copy(prev.sp).lerp(sp, alpha); vis.station.quaternion.copy(prev.sq).slerp(sq, alpha);
  } else { shipG.position.copy(p); shipG.quaternion.copy(q); vis.station.position.copy(sp); vis.station.quaternion.copy(sq); }
  if (vis.sat) { vis.sat.position.set(...game.sat.p); vis.sat.quaternion.set(...game.sat.q); }
}

function tick(dt) {
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  pollButtons();

  // comando das alavancas
  const auto = dev.autoplay && app === 'playing';
  let cmd = { t: [0, 0, 0], r: [0, 0, 0], stab: false };
  if (app === 'playing' && !auto) cmd = vr ? vrLevers() : pcCommand();

  // física em passos fixos
  if (app === 'playing' || app === 'done' || app === 'failed') {
    acc += dt;
    const n = Math.min(12, Math.floor(acc / DT));
    for (let i = 0; i < n; i++) {
      if (i === n - 1) { prev.p.set(...game.ship.p); prev.q.set(...game.ship.q); prev.sp.set(...game.station.p); prev.sq.set(...game.station.q); prev.ok = true; }
      if (auto && game.state === 'flying') cmd = robot.step(game);
      const reach = vr && !auto ? handReach() : null;
      game.step(app === 'playing' ? cmd : { t: [0, 0, 0], r: [0, 0, 0] }, reach);
      handleEvents(game.events);
    }
    acc -= n * DT;
  } else if (app === 'menu') { game.moveWorld(dt); prev.ok = false; }
  lastCmd = cmd;
  if (endTimer > 0) {
    endTimer -= dt;
    if (endTimer <= 0) {
      if (game.state === 'done') finishLevel();
      else if (game.state === 'failed') { app = 'failed'; showScreen('failed'); updateHint(); }
    }
  }

  syncVisuals(prev.ok ? clamp(acc / DT, 0, 1) : 1);
  updateSceneObjects(dt);
  updateLevers(cmd);
  updatePcCamera(dt);
  world.update(dt, camera.getWorldPosition(_v));
  updateHud(dt);
  updateMenuRays();
  feedback(dt);

  // casco por fora só na câmera de fora (de dentro ele tapa a vista)
  const cockpitView = vr || (save.cam === 'cockpit' && app !== 'menu');
  shipVis.ext.visible = !cockpitView;

  // vinheta de conforto quando a nave gira
  const wv = Math.hypot(...game.ship.w);
  const want = save.vignette && vr && app === 'playing' ? clamp((wv - 0.05) * 3.5, 0, 0.75) : 0;
  vigA += (want - vigA) * Math.min(1, dt * 6);
  vignette.visible = vigA > 0.01;
  vignette.material.uniforms.uA.value = vigA;

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}

// mãos (no mundo) para pegar o astronauta pela janela
function handReach() {
  const out = [];
  for (const side of ['left', 'right']) {
    const h = handLocal(side);
    if (h) { const w = h.p.clone().applyMatrix4(shipG.matrixWorld); out.push({ p: [w.x, w.y, w.z], r: LIM.catchHand }); }
  }
  return out;
}

function updateSceneObjects(dt) {
  // estrelas piscando, argolas, astronautas girando, pedras e detritos
  for (const b of vis.blinkers) { const k = b.userData.blink; b.visible = ((time / k.period + k.phase) % 1) < 0.16; }
  const cur = game.cur;
  game.rings.forEach((r, i) => {
    const m = vis.rings[i], active = cur?.type === 'ring' && cur.i === i;
    m.visible = !r.passed;
    m.userData.torus.material = active ? mats.ring : mats.ringDim;
    m.userData.lights.forEach((l, k) => { l.visible = active && ((time * 2 + k / 8) % 1) < 0.5; });
  });
  game.astros.forEach((a, i) => {
    const m = vis.astros[i];
    m.position.set(...a.p);
    if (a.caught) m.quaternion.copy(shipG.quaternion);
    else { vis.astroQ[i].premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...a.spinAxis), a.spinRate * dt)); m.quaternion.copy(vis.astroQ[i]); }
  });
  vis.rocks?.update(dt);
  vis.debris?.update(dt);
  // berço aceso só quando é a hora de entregar
  if (vis.station.userData.cradle) vis.station.userData.cradle.visible = cur?.type === 'deliver' && ((time * 1.5) % 1) < 0.7;
  // plumas dos propulsores
  const thr = nozzleThrottle(game.ship.out);
  shipVis.plumes.forEach((p, i) => {
    const a = thr[i];
    p.visible = a > 0.05 && app !== 'menu';
    if (p.visible) p.scale.set(0.6 + a * 0.6, (0.4 + a * 0.9) * (0.85 + Math.random() * 0.3), 0.6 + a * 0.6);
  });
}

function updateLevers(cmd) {
  const L = cockpit.left.stick, R = cockpit.right.stick;
  L.position.set(cmd.t[0] * 0.035, 0.05 + cmd.t[1] * 0.03, cmd.t[2] * 0.035);
  R.rotation.set(cmd.r[0] * -0.4, cmd.r[2] * 0.5, cmd.r[1] * 0.4);
}

function feedback(dt) {
  const o = game.ship.out;
  const tSum = Math.abs(o.t[0]) + Math.abs(o.t[1]) + Math.abs(o.t[2]);
  const rSum = Math.abs(o.r[0]) + Math.abs(o.r[1]) + Math.abs(o.r[2]);
  sfx.setJets(app === 'playing' ? tSum : 0, app === 'playing' ? rSum : 0, o.stab && app === 'playing');
  hapT -= dt;
  if (hapT <= 0 && renderer.xr.isPresenting && app === 'playing') {
    hapT = 0.08;
    if (tSum > 0.05) pulse('left', 0.06 + 0.12 * Math.min(1, tSum), 50);
    if (rSum > 0.05) pulse('right', 0.06 + 0.12 * Math.min(1, rSum / 1.5), 50);
  }
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.loadLevel(3)      abre a fase 3 (1 a 15)
// dev.autoplay = true   o robô pilota (com as mesmas alavancas do jogador)
// dev.advance(20)       avança 20 s de jogo na hora
// dev.state()           resumo: tela, fase, tarefa, alvo, combustível, dano
// dev.snapshot()        imagem da tela (JPEG em data URL)
// dev.resetSave()       apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; robot = v ? new Robot() : null; },
  loadLevel(n) { startLevel(n - 1); return this.state(); },
  advance(sec, step = 1 / 72) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  camera(mode) { save.cam = mode === 'chase' ? 'chase' : 'cockpit'; storeSave(save); return save.cam; },
  look(yawDeg = 0, pitchDeg = 0) { look.yaw = yawDeg * Math.PI / 180; look.pitch = pitchDeg * Math.PI / 180; look.idle = -1e9; },
  state() {
    const ro = game.readout();
    return {
      tela: app, fase: levelIndex + 1, nome: LEVELS[levelIndex].name, estado: game.state, tempo: +game.t.toFixed(1),
      tarefa: taskText(game.cur), combustivel: +game.ship.fuel.toFixed(1), dano: game.damage,
      alvo: ro ? { nome: ro.name, distancia: +ro.dist.toFixed(2), aproximacao: +ro.closing.toFixed(3), vrel: +ro.relV.toFixed(3), angulo: ro.ang != null ? +(ro.ang * 57.3).toFixed(1) : null } : null,
      resultado: game.result ? { ...game.result, time: +game.result.time.toFixed(1), fuel: +game.result.fuel.toFixed(1) } : null,
      salvo: save.done[levelIndex] || null,
    };
  },
  snapshot(w = 960) {
    renderer.render(scene, camera);
    const src = renderer.domElement, c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  },
  resetSave() { save.done = {}; storeSave(save); },
};
window.dev = dev;
window.atracacao = { dev, get game() { return game; }, save, sfx, startLevel, goMenu, camera, scene, renderer, world };

goMenu();
renderer.setAnimationLoop(frame);
