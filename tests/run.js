// Testes da lógica (Node, sem navegador e sem som): node tests/run.js
import { Ship, Body, Game, DT, LIM, FUEL, starsFor } from '../js/sim.js';
import { SHIP, TYPES, contact } from '../js/bodies.js';
import { LEVELS, CHAPTERS } from '../js/levels.js';
import { Robot } from '../js/robot.js';
import { qrot, qinv, qeuler, qlook, qaxis, qmul, len, sub, add, scale, dot, deg, norm } from '../js/math.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU: ' + msg); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const vnear = (a, b, tol) => len(sub(a, b)) <= tol;
const idle = { t: [0, 0, 0], r: [0, 0, 0] };
function run(ship, cmd, sec) { const n = Math.round(sec / DT); let f = 0; for (let i = 0; i < n; i++) f += ship.step(DT, cmd); return f; }

console.log('Quatérnios');
{
  const q = qeuler(37, -21, 64), v = [0.3, -1.2, 2.5];
  ok(vnear(qinv(q, qrot(q, v)), v, 1e-9), 'girar e desgirar volta ao vetor');
  ok(near(len(qrot(q, v)), len(v), 1e-9), 'giro não muda o tamanho');
  const f = norm([1, -0.4, 0.7]), ql = qlook(f, [0, 1, 0]);
  ok(vnear(qrot(ql, [0, 0, -1]), f, 1e-9), 'qlook aponta o -z para a frente pedida');
  ok(qrot(ql, [0, 1, 0])[1] > 0.5, 'qlook mantém o +y para cima');
}

console.log('Conservação (nada freia sozinho)');
{
  const s = new Ship([0, 0, 0], qeuler(10, 20, 30), [0.4, -0.2, 0.1], [0, 0, 0]);
  const p0 = [...s.p], v0 = [...s.v];
  run(s, idle, 60);
  ok(vnear(s.v, v0, 1e-12), 'sem propulsor a velocidade não muda');
  ok(vnear(s.p, add(p0, scale(v0, 60)), 1e-6), 'sem propulsor a nave anda em linha reta');
  ok(s.fuel === 100, 'sem propulsor não gasta combustível');
  const r = new Ship([0, 0, 0], [0, 0, 0, 1], [0, 0, 0], [0, 0, 0.2]);
  run(r, idle, 30);
  ok(near(r.w[2], 0.2, 1e-9) && near(r.w[0], 0, 1e-9), 'girando num eixo principal continua girando igual');
  const t = new Ship([0, 0, 0], [0, 0, 0, 1], [0, 0, 0], [0.05, 0.1, -0.08]);
  const L0 = t.L, E0 = 0.5 * t.w.reduce((a, w, i) => a + t.I[i] * w * w, 0);
  run(t, idle, 60);
  const E1 = 0.5 * t.w.reduce((a, w, i) => a + t.I[i] * w * w, 0);
  ok(len(sub(t.L, L0)) / len(L0) < 0.01, `momento angular conservado no rodopio (erro ${(len(sub(t.L, L0)) / len(L0) * 100).toFixed(2)}%)`);
  ok(Math.abs(E1 - E0) / E0 < 0.02, 'energia de giro conservada no rodopio');
}

console.log('Propulsores e combustível');
{
  const s = new Ship([0, 0, 0], qeuler(90, 0, 0));
  const used = run(s, { t: [0, 0, -1], r: [0, 0, 0] }, 10);
  const a = SHIP.thrust / SHIP.mass;
  ok(vnear(s.v, scale(s.fwd, a * 10), 1e-6), 'empuxo para a frente acelera no rumo do nariz (girado 90°)');
  ok(near(100 - s.fuel, FUEL.t * 10, 1e-6), 'translação gasta o combustível previsto');
  const v1 = [...s.v];
  run(s, idle, 5);
  ok(vnear(s.v, v1, 1e-12), 'soltou a alavanca: continua na mesma velocidade');
  const e = new Ship(); e.fuel = 0;
  run(e, { t: [1, 1, 1], r: [1, 1, 1] }, 5);
  ok(len(e.v) === 0 && len(e.w) === 0, 'sem combustível os propulsores não fazem nada');
}

console.log('Torque, giro limitado e estabilizar');
{
  const s = new Ship();
  run(s, { t: [0, 0, 0], r: [1, 0, 0] }, 1);
  ok(near(s.w[0], SHIP.torque / SHIP.I[0], 1e-3), 'torque de arfagem = torque / inércia');
  const w1 = s.w[0];
  run(s, idle, 10);
  ok(near(s.w[0], w1, 1e-9), 'soltou: continua girando');
  run(s, { t: [0, 0, 0], r: [1, 0, 0] }, 20);
  ok(s.w[0] <= LIM.wMax + 0.01, 'o giro para no limite de conforto');
  const r = new Ship(); run(r, { t: [0, 0, 0], r: [0, 0, 1] }, 1);
  ok(near(r.w[2], SHIP.torque / SHIP.I[2], 1e-3) && Math.abs(r.w[0]) < 1e-9, 'torcer gira só na rolagem');
  const st = new Ship([0, 0, 0], [0, 0, 0, 1], [0, 0, 0], [0.2, -0.1, 0.15]);
  const manual = [0.2, 0.1, 0.15].reduce((a, w, i) => a + w * st.I[i] / SHIP.torque * FUEL.r, 0);
  const used = run(st, { t: [0, 0, 0], r: [0, 0, 0], stab: true }, 6);
  ok(len(st.w) < 1e-4, 'estabilizar zera a rotação');
  ok(used > manual * 1.2, `estabilizar gasta mais combustível que zerar na mão (${used.toFixed(2)} contra ${manual.toFixed(2)})`);
}

// nave encostando no encaixe da estação, com ajustes
function dockTry(type, { speed = 0.2, yaw = 0, roll = 0, lat = 0, spin = 0, matchSpin = false } = {}) {
  const lvl = { station: { type, spin }, ship: { p: [0, 0, 0] }, tasks: ['dock'], stars: { fuel: [1, 2], time: [1, 2] } };
  const g = new Game(lvl);
  const P = g.station.port();
  const q = qmul(qlook(scale(P.n, -1), P.up), qmul(qaxis([0, 1, 0], yaw * deg), qaxis([0, 0, 1], roll * deg)));
  g.ship.q = q;
  g.ship.p = add(add(P.p, scale(P.n, 0.6 - SHIP.probe[2])), [lat, 0, 0]);
  g.ship.v = scale(P.n, -speed);
  if (matchSpin) g.ship.w = qinv(q, g.station.w);
  const evs = [];
  for (let i = 0; i < 60 * 8 && g.state === 'flying'; i++) { g.step(idle); evs.push(...g.events); }
  return { g, evs };
}

console.log('Encaixe');
{
  let r = dockTry('estacao');
  ok(r.g.state === 'done' && r.evs.some(e => e.type === 'dock'), 'devagar e alinhado: encaixa');
  ok(r.g.damage === 0, 'encaixe certo não dá dano');
  r = dockTry('estacao', { speed: 0.6 });
  const f = r.evs.find(e => e.type === 'dockFail');
  ok(f && f.why === 'fast' && r.g.damage > 0, 'rápido demais: não encaixa e amassa');
  ok(dot(r.g.ship.v, r.g.station.port().n) > 0, 'rápido demais: quica para trás');
  r = dockTry('estacao', { yaw: 10, speed: 0.15 });
  ok(r.evs.some(e => e.type === 'dockFail' && e.why === 'ang') && r.g.damage === 0, 'torta 10°: não encaixa, sem dano');
  r = dockTry('estacao', { roll: 20, speed: 0.15 });
  ok(r.evs.some(e => e.type === 'dockFail' && e.why === 'roll'), 'cruz girada 20°: não encaixa');
  r = dockTry('estacao', { lat: 0.4, speed: 0.15 });
  ok(r.evs.some(e => e.type === 'dockFail' && e.why === 'lat'), 'deslocada 40 cm: não encaixa');
  r = dockTry('roda', { spin: 6, speed: 0.15 });
  ok(r.evs.some(e => e.type === 'dockFail' && e.why === 'spin'), 'estação girando sem girar junto: não encaixa');
  r = dockTry('roda', { spin: 6, speed: 0.15, matchSpin: true });
  ok(r.g.state === 'done', 'girando junto com a estação: encaixa');
  for (const type of ['estacao', 'posto', 'roda', 'cilindro']) {
    const d = dockTry(type);
    ok(d.g.state === 'done' && !d.evs.some(e => e.type === 'hit'), `${type}: encaixa sem o casco bater em nada`);
  }
}

console.log('Batidas e dano');
{
  const hit = (speed) => {
    const lvl = { station: { type: 'estacao' }, ship: { p: [0, 0, 0] }, tasks: ['dock'], stars: { fuel: [1, 2], time: [1, 2] } };
    const g = new Game(lvl);
    g.ship.p = [0, 9, -3]; g.ship.v = [0, -speed, 0];   // descendo em cima do nó central
    let minD = 9;
    for (let i = 0; i < 60 * 12; i++) {
      g.step(idle);
      minD = Math.min(minD, len(sub(g.ship.p, [0, 0, -3])));
    }
    return { g, minD };
  };
  let h = hit(1.0);
  ok(h.g.damage >= 25 && h.g.damage <= 35, `batida a 1 m/s amassa (dano ${h.g.damage})`);
  ok(h.minD > 3 + 1.0 - 0.05, 'o casco não entra na estação');
  ok(h.g.ship.v[1] > 0, 'depois da batida a nave volta');
  h = hit(0.2);
  ok(h.g.damage === 0, 'encostar devagar não amassa');
  const lvl = { station: { type: 'estacao' }, ship: { p: [0, 30, 0] }, tasks: ['dock'], stars: { fuel: [1, 2], time: [1, 2] } };
  const g = new Game(lvl); g.damage = 95; g.ship.p = [0, 9, -3]; g.ship.v = [0, -1.5, 0];
  for (let i = 0; i < 600 && g.state === 'flying'; i++) g.step(idle);
  ok(g.state === 'failed', 'dano 100: a fase falha');
  // forma: ponto dentro da caixa tem distância negativa
  ok(contact({ s: 'box', c: [0, 0, 0], h: [1, 1, 1] }, [0.2, 0, 0]).d < 0 && contact({ s: 'cyl', c: [0, 0], r: 2, z0: -1, z1: 1 }, [0, 3, 0]).d > 0.99, 'distância às formas');
}

console.log('Astronauta, satélite e argola');
{
  const base = { station: { type: 'posto' }, ship: { p: [0, 0, 100] }, stars: { fuel: [1, 2], time: [1, 2] } };
  const reachAt = (g, v) => { const a = g.astros[0]; g.ship.p = sub(a.p, qrot(g.ship.q, SHIP.reach)); g.ship.p = add(g.ship.p, [0, 0, 0.5]); g.ship.v = add(a.v, v); };
  let g = new Game({ ...base, astros: [{ p: [10, 0, 80], v: [0.2, 0, 0] }], tasks: ['rescue:0', 'dock'] });
  reachAt(g, [0, 0, -0.2]);
  for (let i = 0; i < 120; i++) g.step(idle);
  ok(g.astros[0].caught, 'astronauta pego com velocidade igualada');
  g = new Game({ ...base, astros: [{ p: [10, 0, 80], v: [0.2, 0, 0] }], tasks: ['rescue:0', 'dock'] });
  reachAt(g, [0.9, 0, -0.3]);
  let fast = false;
  for (let i = 0; i < 60; i++) { g.step(idle); fast ||= g.events.some(e => e.type === 'tooFast'); }
  ok(!g.astros[0].caught && fast, 'rápido demais: o astronauta escapa da mão');
  g = new Game({ ...base, astros: [{ p: [10, 0, 80], v: [0, 0, 0] }], tasks: ['rescue:0', 'dock'] });
  const hand = [{ p: [10, 0.3, 80], r: LIM.catchHand }];
  g.ship.p = [10, 0, 82.2];
  g.step(idle, hand);
  ok(g.astros[0].caught, 'no VR a mão perto do astronauta pega');

  g = new Game({ station: { type: 'estacao' }, sat: { p: [0, 0, 40] }, ship: { p: [0, 0, 0] }, tasks: ['capture', 'deliver'], stars: { fuel: [1, 2], time: [1, 2] } });
  const P = g.sat.port();
  g.ship.p = add(P.p, scale(P.n, 0.6 - SHIP.probe[2])); g.ship.v = scale(P.n, -0.15);
  for (let i = 0; i < 400 && !g.carrying; i++) g.step(idle);
  ok(g.carrying, 'satélite capturado pelo pino');
  ok(g.ship.mass === SHIP.mass + 600, 'com o satélite a nave fica mais pesada');
  const v0 = [...g.ship.v];
  for (let i = 0; i < 60; i++) g.ship.step(DT, { t: [1, 0, 0], r: [0, 0, 0] });
  ok(near(len(sub(g.ship.v, v0)), SHIP.thrust / (SHIP.mass + 600), 0.01), 'o mesmo empuxo acelera menos com o satélite');

  g = new Game({ ...base, rings: [{ c: [0, 0, 90] }], tasks: ['ring:0', 'dock'] });
  g.ship.v = [0, 0, -2];
  for (let i = 0; i < 400; i++) g.step(idle);
  ok(g.rings[0].passed && g.task === 1, 'passar por dentro da argola conta');
  g = new Game({ ...base, rings: [{ c: [6, 0, 90] }], tasks: ['ring:0', 'dock'] });
  g.ship.v = [0, 0, -2];
  for (let i = 0; i < 400; i++) g.step(idle);
  ok(!g.rings[0].passed, 'passar por fora da argola não conta');
}

console.log('Fases');
{
  ok(LEVELS.length === 15, '15 fases');
  ok(CHAPTERS.every((_, c) => LEVELS.filter(l => l.chapter === c).length === 5), '5 fases por capítulo');
  LEVELS.forEach((L, i) => {
    const g1 = new Game(L), g2 = new Game(L);
    ok(g1.field.list.every((a, k) => vnear(a.p, g2.field.list[k].p, 0)), `fase ${i + 1}: asteroides iguais toda vez`);
    if (L.asteroids) ok(g1.field.list.length === L.asteroids.count, `fase ${i + 1}: cabem todos os asteroides`);
    ok(g1.target() && g1.readout().dist > 10, `fase ${i + 1}: começa longe do primeiro alvo`);
    const lc = g1.station.toLocal(g1.ship.p);
    ok(g1.station.def.shapes.every(sh => contact(sh, lc).d > 5), `fase ${i + 1}: a nave começa fora da estação`);
    for (const a of g1.astros) ok(g1.station.def.shapes.every(sh => contact(sh, g1.station.toLocal(a.p)).d > 3), `fase ${i + 1}: astronauta fora da estação`);
  });
}

console.log('Robô piloto (só as alavancas do jogador)');
const results = [];
LEVELS.forEach((L, i) => {
  const g = new Game(L), rb = new Robot();
  while (g.state === 'flying' && g.t < 1200) g.step(rb.step(g));
  const r = g.result;
  results.push(r);
  const line = `  ${String(i + 1).padStart(2)} ${L.name.padEnd(22)} ${g.state === 'done' ? `${r.time.toFixed(0).padStart(4)} s  combustível ${r.fuel.toFixed(1).padStart(5)}%  dano ${r.damage}  ${'★'.repeat(r.stars)}` : `NÃO TERMINOU (${g.failReason || 'tempo'})`}`;
  console.log(line);
  ok(g.state === 'done', `fase ${i + 1}: robô completa`);
  if (r) {
    ok(r.fuel < (L.fuel ?? 100), `fase ${i + 1}: dentro do combustível`);
    ok(r.damage < 30, `fase ${i + 1}: robô quase sem dano`);
    ok(r.stars === 3, `fase ${i + 1}: robô faz 3 estrelas (folga na calibração)`);
    const s = L.stars;
    ok(s.fuel[0] >= r.fuel * 1.4 && s.time[0] >= r.time * 1.4, `fase ${i + 1}: 3 estrelas com folga de 40% sobre o robô`);
    ok(s.fuel[1] > s.fuel[0] && s.time[1] > s.time[0], `fase ${i + 1}: limites de 2 estrelas maiores que os de 3`);
  }
});
ok(starsFor(LEVELS[0], 1, 1, 0) === 3 && starsFor(LEVELS[0], 999, 1, 0) === 1 && starsFor(LEVELS[0], 1, 1, 60) === 2, 'estrelas por combustível, tempo e dano');

console.log(`\n${count - fails} de ${count} verificações passaram.`);
if (fails) { console.log(`${fails} falha(s).`); process.exit(1); }
console.log('Tudo certo');
