// Vetores [x, y, z] e quatérnios [x, y, z, w] próprios (sem Three.js, roda no Node).
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addS = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clampLen = (a, m) => { const l = len(a); return l > m ? scale(a, m / l) : a; };
export const deg = Math.PI / 180;

export const qid = () => [0, 0, 0, 1];
export function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
// gira o vetor v pelo quatérnio q (local -> mundo)
export function qrot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export const qinv = (q, v) => qrot(qconj(q), v);
export function qaxis(axis, ang) {
  const a = norm(axis), s = Math.sin(ang / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)];
}
// vetor de rotação (eixo × ângulo) -> quatérnio
export function qexp(r) {
  const a = len(r);
  if (a < 1e-12) return qnorm([r[0] / 2, r[1] / 2, r[2] / 2, 1]);
  const s = Math.sin(a / 2) / a;
  return [r[0] * s, r[1] * s, r[2] * s, Math.cos(a / 2)];
}
// quatérnio -> vetor de rotação pelo caminho mais curto
export function qlog(q) {
  let [x, y, z, w] = q;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z);
  if (s < 1e-12) return [2 * x, 2 * y, 2 * z];
  const a = 2 * Math.atan2(s, w);
  return [x / s * a, y / s * a, z / s * a];
}
// Euler em graus, ordem Y (guinada), X (arfagem), Z (rolagem)
export function qeuler(yawD, pitchD, rollD = 0) {
  return qmul(qmul(qaxis([0, 1, 0], yawD * deg), qaxis([1, 0, 0], pitchD * deg)), qaxis([0, 0, 1], rollD * deg));
}
// orientação cujo -z local aponta para `fwd` e +y local fica o mais perto possível de `up`
export function qlook(fwd, up) {
  const zb = norm(scale(fwd, -1));
  let xb = cross(up, zb);
  if (len(xb) < 1e-6) xb = cross([1, 0, 0], zb);
  xb = norm(xb);
  const yb = cross(zb, xb);
  return qfromBasis(xb, yb, zb);
}
export function qfromBasis(x, y, z) {
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
  return qnorm(q);
}
export const angleBetween = (a, b) => Math.acos(clamp(dot(norm(a), norm(b)), -1, 1));

// números aleatórios repetíveis (as fases são iguais toda vez)
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
