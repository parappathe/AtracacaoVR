// Núcleo do jogo (sem navegador, sem Three.js): nave como corpo rígido de 6 eixos, propulsores
// (RCS) com empuxo fixo e combustível, estações e satélite, asteroides, detritos, astronautas,
// argolas, encaixe, dano e a missão de cada fase.
import { add, sub, scale, addS, dot, cross, len, norm, clamp, qmul, qrot, qinv, qconj, qnorm, qexp, qaxis, qeuler, angleBetween, deg, rng } from './math.js';
import { SHIP, SAT, TYPES, contact } from './bodies.js';

export const DT = 1 / 60;
export const LIM = {
  dockV: 0.3,            // velocidade relativa máxima no encaixe (m/s)
  dockAng: 5 * deg,      // desvio máximo do eixo
  dockRoll: 8 * deg,     // desvio máximo da rolagem (cruz alinhada)
  dockLat: 0.3,          // desvio lateral máximo (m)
  dockSpin: 3 * deg,     // diferença máxima de giro (rad/s)
  ring: 0.5,             // raio da boca do encaixe: fora disso a sonda passa pela borda
  catchV: 0.5,           // velocidade relativa máxima para pegar o astronauta
  catchR: 1.0,           // alcance do braço (PC e robô)
  catchHand: 0.55,       // alcance da mão no VR
  deliverV: 0.3,
  deliverR: 1.0,
  bumpSafe: 0.3,         // batida mais lenta que isso não amassa
  wMax: 20 * deg,        // giro máximo por eixo (o computador de bordo corta acima disso)
};
export const FUEL = { t: 0.3, r: 0.16, stab: 0.4 };   // % do tanque por segundo, por eixo, no máximo
export const STAB_GAIN = 1.5;

// ---------- Nave ----------
export class Ship {
  constructor(p = [0, 0, 0], q = [0, 0, 0, 1], v = [0, 0, 0], w = [0, 0, 0]) {
    this.p = [...p]; this.q = qnorm(q); this.v = [...v]; this.w = [...w];
    this.mass = SHIP.mass; this.I = [...SHIP.I];
    this.fuel = 100; this.spheres = SHIP.spheres.map(s => ({ ...s }));
    this.out = { t: [0, 0, 0], r: [0, 0, 0], stab: false };   // o que os propulsores fizeram neste passo
  }
  // cmd: { t: [x, y, z] translação, r: [x, y, z] rotação (arfagem, guinada, rolagem), stab }
  step(dt, cmd) {
    const t = [0, 0, 0], tq = [0, 0, 0];
    let use = 0;
    const stab = !!cmd?.stab;
    if (this.fuel > 0) {
      for (let i = 0; i < 3; i++) {
        const u = clamp(cmd?.t?.[i] || 0, -1, 1);
        t[i] = u; use += Math.abs(u) * FUEL.t;
        if (stab) {
          const c = clamp(-this.w[i] * this.I[i] / (SHIP.torque * STAB_GAIN * dt), -1, 1);
          tq[i] = c * STAB_GAIN; use += Math.abs(c) * FUEL.stab;
        } else {
          let c = clamp(cmd?.r?.[i] || 0, -1, 1);
          if (c * this.w[i] > 0 && Math.abs(this.w[i]) >= LIM.wMax) c = 0;   // giro limitado
          tq[i] = c; use += Math.abs(c) * FUEL.r;
        }
      }
      this.fuel = Math.max(0, this.fuel - use * dt);
    }
    this.out = { t, r: tq, stab };
    // translação: empuxo no referencial da nave, girado para o mundo
    const f = qrot(this.q, scale(t, SHIP.thrust));
    this.v = addS(this.v, f, dt / this.mass);
    this.p = addS(this.p, this.v, dt);
    // rotação: equações de Euler (com o termo giroscópico) no referencial da nave
    const w = this.w, I = this.I;
    const Iw = [I[0] * w[0], I[1] * w[1], I[2] * w[2]];
    const g = cross(w, Iw);
    for (let i = 0; i < 3; i++) w[i] += (tq[i] * SHIP.torque - g[i]) / I[i] * dt;
    this.q = qnorm(qmul(this.q, qexp(scale(w, dt))));
    return use;
  }
  toWorld(local) { return add(this.p, qrot(this.q, local)); }
  // velocidade de um ponto preso na nave (local)
  pointVel(local) { return add(this.v, qrot(this.q, cross(this.w, local))); }
  get wWorld() { return qrot(this.q, this.w); }
  get fwd() { return qrot(this.q, [0, 0, -1]); }
  get up() { return qrot(this.q, [0, 1, 0]); }
  // momento angular no mundo (para o teste de conservação)
  get L() { return qrot(this.q, [this.I[0] * this.w[0], this.I[1] * this.w[1], this.I[2] * this.w[2]]); }
  attachSat() {
    const d = -SHIP.probe[2] + SAT.holdOffset, m = SAT.mass;
    this.mass += m;
    this.I = [this.I[0] + SAT.I[0] + m * d * d, this.I[1] + SAT.I[1] + m * d * d, this.I[2] + SAT.I[2]];
    this.spheres.push({ c: [0, 0, -d], r: 1.25, sat: true }, { c: [2.9, 0, -d], r: 0.65, sat: true }, { c: [-2.9, 0, -d], r: 0.65, sat: true });
  }
  detachSat() {
    const d = -SHIP.probe[2] + SAT.holdOffset, m = SAT.mass;
    this.mass -= m;
    this.I = [this.I[0] - SAT.I[0] - m * d * d, this.I[1] - SAT.I[1] - m * d * d, this.I[2] - SAT.I[2]];
    this.spheres = this.spheres.filter(s => !s.sat);
  }
}

// ---------- Corpo que se move sozinho (estação, satélite): velocidade e giro constantes ----------
export class Body {
  constructor(type, { p = [0, 0, 0], q = [0, 0, 0, 1], v = [0, 0, 0], spin = 0 } = {}) {
    this.type = type; this.def = TYPES[type];
    this.p = [...p]; this.q = qnorm(q); this.v = [...v];
    this.spin = spin;                         // rad/s em volta do próprio eixo z (o do encaixe)
    this.q0 = [...this.q];                    // orientação sem o giro (para os detritos em órbita)
  }
  get w() { return qrot(this.q, [0, 0, this.spin]); }
  step(dt) {
    this.p = addS(this.p, this.v, dt);
    if (this.spin) this.q = qnorm(qmul(this.q, qaxis([0, 0, 1], this.spin * dt)));
  }
  toWorld(l) { return add(this.p, qrot(this.q, l)); }
  toLocal(w) { return qinv(this.q, sub(w, this.p)); }
  pointVel(world) { return add(this.v, cross(this.w, sub(world, this.p))); }
  port() {
    const P = this.def.port;
    return { p: this.toWorld(P.p), n: qrot(this.q, P.n), up: qrot(this.q, P.up) };
  }
}

// ---------- Asteroides do cinturão (derivam em linha reta) e detritos em órbita da estação ----------
export function makeAsteroids(spec, avoid = []) {
  const R = rng(spec.seed || 1), list = [];
  const [x0, x1, y0, y1, z0, z1] = spec.box;
  let guard = 0;
  while (list.length < spec.count && guard++ < 5000) {
    const r = spec.rMin + (spec.rMax - spec.rMin) * Math.pow(R(), 1.8);
    const p = [x0 + (x1 - x0) * R(), y0 + (y1 - y0) * R(), z0 + (z1 - z0) * R()];
    if (avoid.some(a => len(sub(a.p, p)) < a.r + r + 2)) continue;
    if (list.some(a => len(sub(a.p, p)) < a.r + r + 1.5)) continue;
    const v = [spec.drift[0] * (0.6 + 0.8 * R()), spec.drift[1] * (R() * 2 - 1), spec.drift[2] * (R() * 2 - 1)];
    list.push({ p, v, r, spinAxis: norm([R() - 0.5, R() - 0.5, R() - 0.5]), spinRate: 0.05 + R() * 0.25, shape: Math.floor(R() * 4), seed: R() });
  }
  return { list, wrap: [x0, x1] };
}

export function makeDebris(spec) {
  const R = rng(spec.seed || 7), list = [];
  for (let i = 0; i < spec.count; i++) {
    list.push({
      R: spec.rMin + (spec.rMax - spec.rMin) * R(), z: spec.z0 + (spec.z1 - spec.z0) * R(),
      th0: R() * Math.PI * 2, rate: (spec.rate || 0.08) * (0.6 + 0.8 * R()) * (R() < 0.5 ? -1 : 1),
      r: 0.35 + R() * 0.9, spinAxis: norm([R() - 0.5, R() - 0.5, R() - 0.5]), spinRate: 0.3 + R(), shape: Math.floor(R() * 4), seed: R(),
      p: [0, 0, 0], v: [0, 0, 0],
    });
  }
  return list;
}
function placeDebris(list, body, t) {
  for (const d of list) {
    const th = d.th0 + d.rate * t;
    const loc = [Math.cos(th) * d.R, Math.sin(th) * d.R, d.z];
    const vloc = [-Math.sin(th) * d.R * d.rate, Math.cos(th) * d.R * d.rate, 0];
    d.p = add(body.p, qrot(body.q0, loc));
    d.v = add(body.v, qrot(body.q0, vloc));
  }
}

// ---------- Fase em andamento ----------
export class Game {
  constructor(level) {
    this.level = level;
    const L = level;
    this.ship = new Ship(L.ship.p, L.ship.q ? qeuler(...L.ship.q) : [0, 0, 0, 1], L.ship.v || [0, 0, 0], (L.ship.w || [0, 0, 0]).map(x => x * deg));
    this.ship.fuel = L.fuel ?? 100;
    const st = L.station;
    this.station = new Body(st.type, { p: st.p || [0, 0, 0], q: st.q ? qeuler(...st.q) : [0, 0, 0, 1], v: st.v || [0, 0, 0], spin: (st.spin || 0) * deg });
    this.sat = L.sat ? new Body('satelite', { p: L.sat.p, q: L.sat.q ? qeuler(...L.sat.q) : [0, 0, 0, 1], v: L.sat.v || [0, 0, 0], spin: (L.sat.spin || 0) * deg }) : null;
    this.carrying = false;
    this.docked = null;
    this.delivered = null;      // satélite deixado no berço: { local p, q }
    this.rings = (L.rings || []).map(r => ({ c: r.c, n: norm(r.n || [0, 0, -1]), R: r.R || 4, passed: false }));
    this.astros = (L.astros || []).map((a, i) => ({ p: [...a.p], v: a.v || [0, 0, 0], r: 0.3, spinAxis: norm(a.spinAxis || [0.3, 1, 0.2]), spinRate: (a.spin ?? 12) * deg, caught: false, i }));
    const avoid = [{ p: this.ship.p, r: 6 }, ...this.rings.map(r => ({ p: r.c, r: r.R + 2 })), ...this.astros.map(a => ({ p: a.p, r: 4 }))];
    this.field = L.asteroids ? makeAsteroids(L.asteroids, avoid) : { list: [], wrap: null };
    this.debris = (L.debris || []).flatMap(d => makeDebris(d));
    placeDebris(this.debris, this.station, 0);
    this.tasks = L.tasks.map(s => { const [type, i] = s.split(':'); return { type, i: i == null ? 0 : +i, done: false }; });
    this.task = 0;
    this.t = 0;
    this.damage = 0;
    this.state = 'flying';      // 'flying' | 'done' | 'failed'
    this.failReason = '';
    this.events = [];
    this.dockCool = 0;
    this.prevAx = null;         // distância axial da sonda ao encaixe no passo anterior
    this.fuel0 = this.ship.fuel;
    this.lowWarned = false;
    this.result = null;
  }
  get cur() { return this.tasks[this.task] || null; }
  get fuelUsed() { return this.fuel0 - this.ship.fuel; }

  // Alvo da tarefa atual: ponto que a nave tem que levar até ele, velocidade dele, e qual ponto
  // da nave conta (sonda, braço, satélite carregado, centro).
  target() {
    const c = this.cur, S = this.ship;
    if (!c) return null;
    if (c.type === 'dock' || c.type === 'capture') {
      const b = c.type === 'dock' ? this.station : this.sat;
      const P = b.port();
      return { kind: c.type, body: b, p: P.p, n: P.n, up: P.up, v: b.pointVel(P.p), w: b.w, local: SHIP.probe, name: c.type === 'dock' ? 'Encaixe' : 'Satélite' };
    }
    if (c.type === 'deliver') {
      const b = this.station, p = b.toWorld(b.def.cradle);
      return { kind: 'deliver', body: b, p, v: b.pointVel(p), local: [0, 0, SHIP.probe[2] - SAT.holdOffset], name: 'Berço do satélite' };
    }
    if (c.type === 'ring') {
      const r = this.rings[c.i];
      return { kind: 'ring', p: r.c, n: r.n, v: [0, 0, 0], local: [0, 0, 0], R: r.R, name: `Argola ${c.i + 1}` };
    }
    if (c.type === 'rescue') {
      const a = this.astros[c.i];
      return { kind: 'rescue', p: a.p, v: a.v, local: SHIP.reach, name: 'Astronauta' };
    }
    return null;
  }

  // Números do painel: distância, taxa de aproximação, velocidade relativa (no referencial da
  // nave) e alinhamento com o encaixe.
  readout() {
    const T = this.target();
    if (!T) return null;
    const S = this.ship;
    const C = S.toWorld(T.local), vC = S.pointVel(T.local);
    const r = sub(T.p, C), vr = sub(vC, T.v), dist = len(r);
    const closing = dist > 1e-6 ? dot(vr, r) / dist : 0;
    const o = { name: T.name, kind: T.kind, dist, closing, relV: len(vr), relVb: qinv(S.q, vr), dirB: qinv(S.q, r) };
    if (T.n && T.up) {
      const fwd = S.fwd;
      o.ang = angleBetween(fwd, scale(T.n, -1));
      // erro de alinhamento no referencial da nave: para onde o eixo do encaixe aponta
      const nb = qinv(S.q, scale(T.n, -1));
      o.alignB = nb;
      if (T.up) {
        const ub = qinv(S.q, T.up);
        o.roll = Math.atan2(-ub[0], ub[1]);
        o.spin = len(sub(S.wWorld, T.w));
      }
      const ax = dot(sub(C, T.p), T.n);
      o.axial = ax;
      o.latB = qinv(S.q, sub(sub(C, T.p), scale(T.n, ax)));
      o.lat = len(o.latB);
    }
    return o;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // um passo fixo de DT; reach: pontos de alcance no mundo [{ p, r }] (mãos no VR)
  step(cmd, reach = null) {
    this.events = [];
    if (this.state !== 'flying') { this.moveWorld(DT); return; }
    const S = this.ship;
    const hadFuel = S.fuel > 0;
    S.step(DT, cmd);
    this.t += DT;
    this.moveWorld(DT);
    if (hadFuel && S.fuel <= 0) this.emit('fuelOut');
    if (!this.lowWarned && S.fuel < 15) { this.lowWarned = true; this.emit('fuelLow'); }
    this.collide();
    this.tasksStep(reach);
    if (this.damage >= 100 && this.state === 'flying') this.fail('A nave ficou amassada demais.');
    if (len(S.p) > 900 && this.state === 'flying') this.fail('Você se perdeu no espaço.');
  }

  moveWorld(dt) {
    this.station.step(dt);
    if (this.sat && !this.carrying && !this.delivered) this.sat.step(dt);
    for (const a of this.field.list) {
      a.p = addS(a.p, a.v, dt);
      const w = this.field.wrap;
      if (w) { const span = w[1] - w[0]; if (a.p[0] > w[1]) a.p[0] -= span; if (a.p[0] < w[0]) a.p[0] += span; }
    }
    placeDebris(this.debris, this.station, this.t);
    for (const a of this.astros) if (!a.caught) a.p = addS(a.p, a.v, dt);
    this.syncCarried();
  }
  // satélite carregado e astronautas resgatados acompanham a nave; satélite entregue fica no berço
  syncCarried() {
    const S = this.ship;
    if (this.sat && this.carrying) {
      this.sat.p = S.toWorld([0, 0, SHIP.probe[2] - SAT.holdOffset]);
      this.sat.q = [...S.q];
      this.sat.v = S.pointVel([0, 0, SHIP.probe[2] - SAT.holdOffset]);
    } else if (this.sat && this.delivered) {
      this.sat.p = this.station.toWorld(this.delivered.p);
      this.sat.q = qmul(this.station.q, this.delivered.q);
      this.sat.v = this.station.pointVel(this.sat.p);
    }
    if (this.docked) {
      S.p = this.station.toWorld(this.docked.p);
      S.q = qmul(this.station.q, this.docked.q);
      S.v = this.station.pointVel(S.p);
      S.w = qinv(S.q, this.station.w);
    }
    for (const a of this.astros) if (a.caught) { a.p = S.toWorld([1.05 - 0.5 * a.slot, -0.55, 0.3]); a.v = S.v; }
  }

  // batida da nave (esferas) contra corpos e pedras
  collide() {
    const S = this.ship;
    const bodies = [this.station];
    if (this.sat && !this.carrying) bodies.push(this.sat);
    for (const sp of S.spheres) {
      const c = S.toWorld(sp.c);
      for (const b of bodies) {
        const lc = b.toLocal(c);
        for (const sh of b.def.shapes) {
          const k = contact(sh, lc);
          if (k.d < sp.r) this.impact(sp, c, qrot(b.q, k.n), sp.r - k.d, b.pointVel(c), b === this.sat ? 'satélite' : 'estação');
        }
      }
      for (const a of this.field.list) this.hitSphere(sp, c, a, 'asteroide');
      for (const d of this.debris) this.hitSphere(sp, c, d, 'detrito');
      for (const a of this.astros) {
        if (a.caught) continue;
        const v = sub(a.p, c), l = len(v);
        if (l < sp.r + a.r && l > 1e-6) {
          // o astronauta é bem mais leve: leva o empurrão, a nave quase não sente
          const n = scale(v, 1 / l), vn = dot(sub(S.pointVel(sp.c), a.v), n);
          a.p = addS(a.p, n, sp.r + a.r - l);
          if (vn > 0) {
            const mA = 120, mS = S.mass;
            a.v = addS(a.v, n, vn * (1 + 0.4) * mS / (mS + mA));
            S.v = addS(S.v, n, -vn * (1 + 0.4) * mA / (mS + mA));
            this.emit('bump', { v: vn });
          }
        }
      }
    }
  }
  hitSphere(sp, c, o, what) {
    const v = sub(c, o.p), l = len(v);
    if (l < sp.r + o.r && l > 1e-6) this.impact(sp, c, scale(v, 1 / l), sp.r + o.r - l, o.v, what);
  }
  impact(sp, c, n, pen, vObs, what) {
    const S = this.ship;
    S.p = addS(S.p, n, pen);
    const vn = dot(sub(S.pointVel(sp.c), vObs), n);
    if (vn >= 0) return;
    const s = -vn;
    S.v = addS(S.v, n, s * 1.3);              // quica (restituição 0,3)
    let dmg = 0;
    if (s > LIM.bumpSafe) { dmg = Math.round(Math.max(5, s * 30)); this.damage = Math.min(100, this.damage + dmg); }
    this.emit('hit', { v: s, dmg, what });
  }

  tasksStep(reach) {
    const c = this.cur;
    if (!c) return;
    const S = this.ship;
    if (this.dockCool > 0) this.dockCool -= DT;
    if (c.type === 'dock' || c.type === 'capture') this.portContact(c);
    else if (c.type === 'deliver') {
      const T = this.target(), C = S.toWorld(T.local), rv = len(sub(S.pointVel(T.local), T.v));
      if (len(sub(C, T.p)) < LIM.deliverR && rv < LIM.deliverV) {
        this.carrying = false;
        S.detachSat();
        this.delivered = { p: this.station.toLocal(C), q: qmul(qconj(this.station.q), S.q) };
        this.syncCarried();
        this.emit('deliver');
        this.next();
      }
    } else if (c.type === 'ring') {
      const r = this.rings[c.i], d = sub(S.p, r.c), a = dot(d, r.n);
      if (r.prevA != null && r.prevA < 0 && a >= 0) {
        const lat = len(sub(d, scale(r.n, a)));
        if (lat < r.R) { r.passed = true; this.emit('ring', { i: c.i }); this.next(); }
        else this.emit('ringMiss', { i: c.i });
      }
      r.prevA = a;
    } else if (c.type === 'rescue') {
      const a = this.astros[c.i];
      const pts = reach || [{ p: S.toWorld(SHIP.reach), r: LIM.catchR }];
      const rv = len(sub(S.v, a.v));
      for (const h of pts) {
        if (len(sub(h.p, a.p)) < h.r) {
          if (rv < LIM.catchV) {
            a.caught = true; a.slot = this.astros.filter(x => x.caught).length - 1;
            this.emit('rescue', { i: c.i });
            this.next();
          } else if (!a.fastWarned) { a.fastWarned = true; this.emit('tooFast', { v: rv }); }
          break;
        }
      }
      if (a.fastWarned && rv < LIM.catchV) a.fastWarned = false;
    }
  }

  // Sonda tocando o encaixe: confere velocidade, alinhamento, rolagem e giro.
  portContact(c) {
    const S = this.ship, T = this.target();
    const tip = S.toWorld(SHIP.probe);
    const ax = dot(sub(tip, T.p), T.n);
    const prev = this.prevAx;
    this.prevAx = ax;
    if (prev == null || !(prev > 0 && ax <= 0) || this.dockCool > 0) return;
    const latV = sub(sub(tip, T.p), scale(T.n, ax)), lat = len(latV);
    if (lat > LIM.ring) return;   // passou fora da boca: quem bate é o casco
    const vr = sub(S.pointVel(SHIP.probe), T.v), sp = len(vr);
    const ang = angleBetween(S.fwd, scale(T.n, -1));
    const ub = qinv(S.q, T.up), roll = Math.abs(Math.atan2(-ub[0], ub[1]));
    const spin = len(sub(S.wWorld, T.w));
    let why = null;
    if (sp > LIM.dockV) why = 'fast';
    else if (ang > LIM.dockAng) why = 'ang';
    else if (spin > LIM.dockSpin) why = 'spin';
    else if (roll > LIM.dockRoll) why = 'roll';
    else if (lat > LIM.dockLat) why = 'lat';
    if (!why) {
      if (c.type === 'capture') {
        this.carrying = true;
        S.attachSat();
        // o satélite passa a girar e andar junto: a nave herda o movimento dele (choque inelástico)
        const mS = SHIP.mass, mT = SAT.mass;
        S.v = scale(add(scale(S.v, mS), scale(this.sat.v, mT)), 1 / (mS + mT));
        this.syncCarried();
        this.emit('capture', { v: sp });
        this.prevAx = null;
        this.next();
      } else {
        // presa na estação: daqui em diante a nave anda e gira junto com ela
        this.docked = { p: this.station.toLocal(S.p), q: qmul(qconj(this.station.q), S.q) };
        this.emit('dock', { v: sp });
        this.next();
      }
      return;
    }
    // não encaixou: quica para trás; rápido demais amassa
    const vn = dot(vr, T.n);
    S.v = addS(S.v, T.n, -vn * 1.4);
    S.p = addS(S.p, T.n, -ax + 0.02);
    this.prevAx = 0.02;
    this.dockCool = 0.6;
    let dmg = 0;
    if (why === 'fast') { dmg = Math.round(10 + sp * 30); this.damage = Math.min(100, this.damage + dmg); }
    this.emit('dockFail', { why, v: sp, dmg, ang, roll, lat, spin });
  }

  next() {
    this.cur.done = true;
    this.task++;
    this.prevAx = null;
    if (this.task >= this.tasks.length) this.finish();
    else this.emit('task', { i: this.task });
  }
  finish() {
    this.state = 'done';
    const fuel = this.fuelUsed, time = this.t;
    this.result = { time, fuel, damage: this.damage, stars: starsFor(this.level, fuel, time, this.damage) };
    this.emit('done', this.result);
  }
  fail(reason) {
    this.state = 'failed';
    this.failReason = reason;
    this.emit('fail', { reason });
  }
}

// 1 estrela por terminar; 2 e 3 pelo combustível e pelo tempo (os dois limites); muito dano tira uma
export function starsFor(level, fuel, time, damage = 0) {
  const s = level.stars;
  let n = 1;
  if (fuel <= s.fuel[1] && time <= s.time[1]) n = 2;
  if (fuel <= s.fuel[0] && time <= s.time[0]) n = 3;
  if (damage >= 50) n = Math.max(1, n - 1);
  return n;
}
