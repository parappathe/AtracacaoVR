// Formas físicas das estações, do satélite e da nave (sem navegador). O desenho em scene.js usa
// estas mesmas medidas, então o que se vê é o que bate.
//
// Espaço local de cada corpo: o eixo de atracação é +z (o encaixe olha para +z), +y para cima.
// Formas: sphere {c, r}, capsule {a, b, r}, box {c, h (meias medidas)}, cyl {c:[x,y], r, z0, z1}
// (cilindro ao longo de z).

export const SHIP = {
  mass: 900,                 // kg
  I: [620, 680, 420],        // momento de inércia (kg·m²) em x (arfagem), y (guinada), z (rolagem)
  thrust: 360,               // N por eixo (propulsores de translação)
  torque: 70,                // N·m por eixo (propulsores de rotação)
  probe: [0, 0, -1.9],       // ponta da sonda de atracação (na frente da nave)
  eye: [0, 0.45, -0.55],     // olhos do piloto sentado
  reach: [0.9, 0.3, -1.25],  // onde o braço alcança do lado de fora da janela (PC e robô)
  spheres: [{ c: [0, 0, 0], r: 1.0 }, { c: [0, 0, -1.2], r: 0.35 }],
};

export const SAT = { mass: 600, I: [380, 380, 300], holdOffset: 1.35 };

export const TYPES = {
  // Estação modular da órbita baixa: módulo comprido, nó central, treliça e painéis solares.
  estacao: {
    port: { p: [0, 0, 8.2], n: [0, 0, 1], up: [0, 1, 0] },
    cradle: [0, -5.6, 0],
    shapes: [
      { s: 'capsule', a: [0, 0, -12], b: [0, 0, 4.5], r: 2.2 },
      { s: 'sphere', c: [0, 0, -3], r: 3 },
      { s: 'capsule', a: [0, 0, 4.5], b: [0, 0, 7.6], r: 0.6 },
      { s: 'capsule', a: [-17, 0, -3], b: [17, 0, -3], r: 0.6 },
      { s: 'box', c: [11.5, 0, -3], h: [5.5, 0.12, 2.4] },
      { s: 'box', c: [-11.5, 0, -3], h: [5.5, 0.12, 2.4] },
      { s: 'capsule', a: [0, 3, -9], b: [0, 6.5, -9], r: 0.5 },
      { s: 'box', c: [0, 0, -9], h: [0.1, 3.4, 1.6] },
    ],
  },
  // Satélite pequeno com dois painéis e o pino de captura em +z.
  satelite: {
    port: { p: [0, 0, 1.35], n: [0, 0, 1], up: [0, 1, 0] },
    shapes: [
      { s: 'box', c: [0, 0, 0], h: [0.8, 0.8, 1.0] },
      { s: 'box', c: [2.9, 0, 0], h: [1.9, 0.04, 0.6] },
      { s: 'box', c: [-2.9, 0, 0], h: [1.9, 0.04, 0.6] },
    ],
  },
  // Posto de mineração preso num asteroide grande, no cinturão.
  posto: {
    port: { p: [0, 0, 13.2], n: [0, 0, 1], up: [0, 1, 0] },
    shapes: [
      { s: 'sphere', c: [0, 0, -4], r: 9 },
      { s: 'capsule', a: [0, 0, 3], b: [0, 0, 10.6], r: 1.8 },
      { s: 'capsule', a: [0, 0, 10.6], b: [0, 0, 12.6], r: 0.6 },
      { s: 'sphere', c: [6, 5, 1], r: 2.4 },
    ],
  },
  // Estação em roda: cubo central no eixo (o encaixe fica nele), 4 raios e o aro.
  roda: {
    port: { p: [0, 0, 6.2], n: [0, 0, 1], up: [0, 1, 0] },
    shapes: (() => {
      const s = [
        { s: 'cyl', c: [0, 0], r: 2.5, z0: -6, z1: 4 },
        { s: 'capsule', a: [0, 0, 4], b: [0, 0, 5.6], r: 0.6 },
        { s: 'capsule', a: [-16, 0, -1], b: [16, 0, -1], r: 0.8 },
        { s: 'capsule', a: [0, -16, -1], b: [0, 16, -1], r: 0.8 },
      ];
      for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; s.push({ s: 'sphere', c: [Math.cos(a) * 18, Math.sin(a) * 18, -1], r: 2.6 }); }
      return s;
    })(),
  },
  // Cilindro grande girando (habitat), com aletas e o cubo de atracação na frente.
  cilindro: {
    port: { p: [0, 0, 1.0], n: [0, 0, 1], up: [0, 1, 0] },
    shapes: [
      { s: 'cyl', c: [0, 0], r: 9, z0: -42, z1: -9 },
      { s: 'cyl', c: [0, 0], r: 2.4, z0: -9, z1: -1.2 },
      { s: 'capsule', a: [0, 0, -1.2], b: [0, 0, 0.4], r: 0.6 },
      { s: 'box', c: [11, 0, -26], h: [2, 0.2, 14] },
      { s: 'box', c: [-11, 0, -26], h: [2, 0.2, 14] },
      { s: 'box', c: [0, 11, -26], h: [0.2, 2, 14] },
      { s: 'box', c: [0, -11, -26], h: [0.2, 2, 14] },
    ],
  },
};

// Distância com sinal do ponto p (local) à forma (negativa = dentro) e a normal para fora.
export function contact(sh, p) {
  if (sh.s === 'sphere') {
    const v = [p[0] - sh.c[0], p[1] - sh.c[1], p[2] - sh.c[2]], l = Math.hypot(...v) || 1e-9;
    return { d: l - sh.r, n: [v[0] / l, v[1] / l, v[2] / l] };
  }
  if (sh.s === 'capsule') {
    const ab = [sh.b[0] - sh.a[0], sh.b[1] - sh.a[1], sh.b[2] - sh.a[2]];
    const ap = [p[0] - sh.a[0], p[1] - sh.a[1], p[2] - sh.a[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-9;
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2));
    const v = [ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t], l = Math.hypot(...v) || 1e-9;
    return { d: l - sh.r, n: [v[0] / l, v[1] / l, v[2] / l] };
  }
  if (sh.s === 'box') {
    const q = [p[0] - sh.c[0], p[1] - sh.c[1], p[2] - sh.c[2]];
    const o = q.map((v, i) => Math.abs(v) - sh.h[i]);
    if (o[0] > 0 || o[1] > 0 || o[2] > 0) {
      const v = q.map((x, i) => x - Math.max(-sh.h[i], Math.min(sh.h[i], x))), l = Math.hypot(...v) || 1e-9;
      return { d: l, n: v.map(x => x / l) };
    }
    const i = o[0] > o[1] ? (o[0] > o[2] ? 0 : 2) : (o[1] > o[2] ? 1 : 2);
    const n = [0, 0, 0]; n[i] = Math.sign(q[i]) || 1;
    return { d: o[i], n };
  }
  // cilindro ao longo de z
  const dx = p[0] - sh.c[0], dy = p[1] - sh.c[1], rho = Math.hypot(dx, dy) || 1e-9;
  const dr = rho - sh.r, dz = Math.max(sh.z0 - p[2], p[2] - sh.z1);
  if (dr > 0 || dz > 0) {
    const rr = Math.min(rho, sh.r), cz = Math.max(sh.z0, Math.min(sh.z1, p[2]));
    const v = [dx - dx / rho * rr, dy - dy / rho * rr, p[2] - cz], l = Math.hypot(...v) || 1e-9;
    return { d: l, n: v.map(x => x / l) };
  }
  if (dr > dz) return { d: dr, n: [dx / rho, dy / rho, 0] };
  return { d: dz, n: [0, 0, p[2] > (sh.z0 + sh.z1) / 2 ? 1 : -1] };
}
