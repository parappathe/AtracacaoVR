// Robô piloto (sem navegador): olha o mesmo que o painel mostra e mexe só nas mesmas alavancas
// do jogador (translação e rotação de -1 a 1, e o botão estabilizar). Usado pelos testes e pelo
// dev.autoplay.
import { add, sub, scale, addS, dot, len, norm, clamp, qmul, qconj, qinv, qlog, qlook, cross } from './math.js';
import { SHIP } from './bodies.js';

const VMAX = 2.0;         // velocidade máxima de cruzeiro (m/s)
const DEAD_T = 0.06;      // zona morta das alavancas (economiza combustível)

export class Robot {
  constructor() { this.reset(); }
  reset() { this.aimTask = -1; this.aimQ = null; this.stabbing = false; }

  step(g) {
    const S = g.ship, T = g.target();
    const cmd = { t: [0, 0, 0], r: [0, 0, 0], stab: false };
    if (!T || g.state !== 'flying') return cmd;

    // ---- atitude ----
    let qDes = null, wT = [0, 0, 0];
    if (T.kind === 'dock' || T.kind === 'capture') { qDes = qlook(scale(T.n, -1), T.up); wT = T.w || [0, 0, 0]; }
    else if (T.kind === 'ring') qDes = qlook(T.n, S.up);   // nariz no sentido da passagem
    else if (T.kind === 'rescue') {
      // vira o nariz para o astronauta uma vez por tarefa (o braço fica à direita da janela)
      if (this.aimTask !== g.task) { this.aimTask = g.task; this.aimQ = qlook(norm(sub(T.p, S.p)), S.up); }
      qDes = this.aimQ;
    }
    const wNow = len(S.w);
    if (wNow > 0.05 && T.kind !== 'dock' && T.kind !== 'capture') this.stabbing = true;
    if (this.stabbing) {
      cmd.stab = true;
      if (wNow < 0.004) this.stabbing = false;
    } else {
      const eB = qDes ? qinv(S.q, qlog(qmul(qDes, qconj(S.q)))) : [0, 0, 0];
      const wTb = qinv(S.q, wT);
      for (let i = 0; i < 3; i++) {
        const alpha = SHIP.torque / S.I[i];
        const e = eB[i], ae = Math.abs(e);
        const wd = wTb[i] + Math.sign(e) * Math.min(0.12, Math.sqrt(2 * alpha * 0.4 * ae), ae * 0.6);
        const err = wd - S.w[i];
        let u = err / (alpha * 0.35);
        if (Math.abs(err) < 0.0015) u = 0;
        cmd.r[i] = clamp(u, -1, 1);
      }
    }

    // ---- translação ----
    const C = S.toWorld(T.local), vC = S.pointVel(T.local);
    const r = sub(C, T.p);
    const acc = 0.5 * SHIP.thrust / S.mass;
    const prof = (d, vmax, vEnd) => Math.min(vmax, vEnd + Math.sqrt(2 * acc * Math.max(0, d)), d * 0.15 + vEnd);
    let vDes;
    if (T.kind === 'dock' || T.kind === 'capture') {
      const n = T.n, a = dot(r, n), l = sub(r, scale(n, a)), ll = len(l);
      const angOk = qDes && len(qlog(qmul(qDes, qconj(S.q)))) < 1.5 * Math.PI / 180;
      const spinOk = len(sub(S.wWorld, wT)) < 0.012;
      const hold = g.level.hold || 10;
      let va;
      if (ll > 0.25 || !angOk || !spinOk) {
        const aT = Math.max(hold, Math.min(a, hold * 1.5));
        va = -Math.sign(a - aT) * prof(Math.abs(a - aT), VMAX, 0);
      } else va = -prof(a, VMAX, 0.12);
      const vl = ll > 1e-6 ? scale(l, -prof(ll, 1.0, 0) / ll) : [0, 0, 0];
      vDes = add(add(T.v, scale(n, va)), vl);
    } else if (T.kind === 'ring') {
      const n = T.n, a = dot(r, n), l = sub(r, scale(n, a)), ll = len(l);
      const cruise = ll > 2.5 && a > -14 ? 0.4 : 1.6;
      const vl = ll > 1e-6 ? scale(l, -Math.min(1.2, ll * 0.25) / ll) : [0, 0, 0];
      vDes = add(scale(n, cruise), vl);
    } else {
      const d = len(r), vEnd = T.kind === 'deliver' ? 0.12 : 0.15;
      vDes = add(T.v, d > 1e-6 ? scale(r, -prof(d, VMAX, vEnd) / d) : [0, 0, 0]);
    }

    // ---- desvio de pedras e detritos ----
    const shipR = g.carrying ? 4 : 1.4;
    const obs = [...g.field.list, ...g.debris];
    for (let it = 0; it < 2; it++) {
      let push = [0, 0, 0];
      for (const o of obs) {
        const dp = sub(o.p, S.p);
        if (len(dp) > 70) continue;
        const rv = sub(o.v, vDes), rv2 = dot(rv, rv);
        const tca = rv2 > 1e-6 ? clamp(-dot(dp, rv) / rv2, 0, 14) : 0;
        const cl = addS(dp, rv, tca), miss = len(cl), R = o.r + shipR + 2.2;
        if (miss < R) {
          let away = miss > 1e-3 ? scale(cl, -1 / miss) : norm(cross(rv, [0, 1, 0]));
          push = addS(push, away, (R - miss) / Math.max(tca, 2) * 1.4);
        }
        const dl = len(dp);
        if (dl < R) push = addS(push, dp, -0.6 / dl);
      }
      if (len(push) < 1e-4) break;
      vDes = add(vDes, push);
    }

    const aW = scale(sub(vDes, vC), 1.3);
    const aB = qinv(S.q, aW);
    for (let i = 0; i < 3; i++) {
      let u = aB[i] * S.mass / SHIP.thrust;
      if (Math.abs(u) < DEAD_T) u = 0;
      cmd.t[i] = clamp(u, -1, 1);
    }
    return cmd;
  }
}
