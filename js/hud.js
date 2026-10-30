// Painel de vidro da cabine (HUD): desenhado num canvas e mostrado num plano fixo na frente dos
// olhos do piloto, dentro da nave. Marcas conformes: o losango do alvo cai em cima do alvo de
// verdade. Mostra a cruz de alinhamento do encaixe, o vetor de velocidade relativa, distância,
// taxa de aproximação, combustível, dano e o objetivo.
import * as THREE from '../vendor/three/three.module.js';
import { LIM } from './sim.js';

const W = 1024, H = 640;
export const HUD_DIST = 0.8, HUD_W = 0.84, HUD_H = HUD_W * H / W;
const PX = W / HUD_W;          // pixels por metro no plano do HUD
const MINT = '#6ff5d0', AMBER = '#ffb340', RED = '#ff6a5a', DIM = 'rgba(150,235,215,0.75)';
const deg = 180 / Math.PI;
const f1 = (v) => v.toFixed(1).replace('.', ','), f2 = (v) => v.toFixed(2).replace('.', ',');

export class Hud {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(HUD_W, HUD_H), new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, depthTest: false, depthWrite: false,
    }));
    this.mesh.renderOrder = 30;
  }
  // ângulo do vetor no referencial da nave (x direita, y cima, -z frente) -> pixel no HUD
  project(v) {
    if (v[2] >= -1e-3) return null;
    const x = W / 2 + (v[0] / -v[2]) * HUD_DIST * PX, y = H / 2 - (v[1] / -v[2]) * HUD_DIST * PX;
    return [x, y];
  }
  draw(s) {
    const g = this.g;
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const ro = s.readout;
    // fundos escuros discretos para os números serem lidos em cima do planeta claro
    g.fillStyle = 'rgba(3,8,20,0.42)';
    roundRect(g, 18, 120, 268, ro?.lat != null ? 336 : 150, 14); g.fill();
    roundRect(g, W - 286, 120, 268, 290, 14); g.fill();
    roundRect(g, W / 2 - 260, 14, 520, 42, 12); g.fill();
    // mira fixa da nave (eixo da sonda)
    g.strokeStyle = DIM; g.lineWidth = 3;
    g.beginPath(); g.arc(W / 2, H / 2, 14, 0, Math.PI * 2); g.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(W / 2 + dx * 26, H / 2 + dy * 26); g.lineTo(W / 2 + dx * 54, H / 2 + dy * 54); g.stroke(); }

    if (ro) {
      const near = ro.dist < 25;
      // alvo: losango em cima dele, ou seta na borda se estiver fora do vidro
      const pt = this.project(ro.dirB);
      const inside = pt && pt[0] > 30 && pt[0] < W - 30 && pt[1] > 70 && pt[1] < H - 60;
      g.strokeStyle = MINT; g.lineWidth = 3;
      if (inside) {
        g.beginPath(); g.moveTo(pt[0], pt[1] - 18); g.lineTo(pt[0] + 18, pt[1]); g.lineTo(pt[0], pt[1] + 18); g.lineTo(pt[0] - 18, pt[1]); g.closePath(); g.stroke();
        g.fillStyle = MINT; g.font = 'bold 22px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(`${f1(ro.dist)} m`, pt[0] + 26, pt[1] - 14);
      } else {
        const a = Math.atan2(-ro.dirB[1], ro.dirB[0]);
        const cx = W / 2 + Math.cos(a) * 230, cy = H / 2 + Math.sin(a) * 200;
        g.save(); g.translate(cx, cy); g.rotate(a);
        g.fillStyle = MINT; g.beginPath(); g.moveTo(26, 0); g.lineTo(-8, -16); g.lineTo(-8, 16); g.closePath(); g.fill();
        g.restore();
        g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText(ro.dirB[2] > 0 ? 'ALVO ATRÁS' : 'ALVO', cx, cy + 34);
      }
      // vetor de velocidade relativa: para onde você está escorregando em relação ao alvo
      if (ro.relV > 0.02) {
        const vp = this.project(ro.relVb);
        if (vp && vp[0] > 0 && vp[0] < W && vp[1] > 0 && vp[1] < H) {
          g.strokeStyle = AMBER; g.lineWidth = 3;
          g.beginPath(); g.arc(vp[0], vp[1], 10, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.moveTo(vp[0] - 26, vp[1]); g.lineTo(vp[0] - 10, vp[1]); g.moveTo(vp[0] + 10, vp[1]); g.lineTo(vp[0] + 26, vp[1]); g.moveTo(vp[0], vp[1] - 10); g.lineTo(vp[0], vp[1] - 22); g.stroke();
        }
      }
      // seta da velocidade lateral (escala: 1 m/s = 120 px)
      const lx = ro.relVb[0] * 120, ly = -ro.relVb[1] * 120, ll = Math.hypot(lx, ly);
      if (ll > 4) {
        const k = Math.min(1, 150 / ll);
        g.strokeStyle = AMBER; g.lineWidth = 4;
        g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(W / 2 + lx * k, H / 2 + ly * k); g.stroke();
      }

      // cruz de alinhamento do encaixe (desvio lateral e de rolagem) e anel do ângulo
      if (ro.lat != null) {
        const okLat = ro.lat < LIM.dockLat, okAng = ro.ang < LIM.dockAng, okRoll = Math.abs(ro.roll ?? 0) < LIM.dockRoll, okSpin = (ro.spin ?? 0) < LIM.dockSpin;
        const allOk = okLat && okAng && okRoll && okSpin;
        const sc = near ? 220 : 60;                      // pixels por metro de desvio
        const cx = W / 2 + Math.max(-260, Math.min(260, ro.latB[0] * -sc)), cy = H / 2 - Math.max(-200, Math.min(200, ro.latB[1] * -sc));
        g.save(); g.translate(cx, cy); g.rotate(-(ro.roll ?? 0));
        g.strokeStyle = allOk ? MINT : (okLat ? MINT : AMBER); g.lineWidth = 4;
        g.beginPath(); g.moveTo(-70, 0); g.lineTo(-22, 0); g.moveTo(22, 0); g.lineTo(70, 0); g.moveTo(0, -70); g.lineTo(0, -22); g.moveTo(0, 22); g.lineTo(0, 46); g.stroke();
        g.restore();
        // ângulo: o círculo mostra para onde aponta o eixo do encaixe
        const ap = this.project(ro.alignB);
        if (ap) {
          const ax = W / 2 + (ap[0] - W / 2) * 3, ay = H / 2 + (ap[1] - H / 2) * 3;
          g.strokeStyle = okAng ? MINT : AMBER; g.lineWidth = 3;
          g.beginPath(); g.arc(Math.max(40, Math.min(W - 40, ax)), Math.max(80, Math.min(H - 80, ay)), 30, 0, Math.PI * 2); g.stroke();
        }
        if (allOk && near) { g.fillStyle = MINT; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('ALINHADO', W / 2, H / 2 + 100); }
      }

      // números à esquerda
      const rows = [
        ['DIST', `${f1(ro.dist)} m`, null],
        ['APROX', `${f2(ro.closing)} m/s`, near && ro.closing > LIM.dockV ? RED : null],
        ['VREL', `${f2(ro.relV)} m/s`, near && ro.relV > LIM.dockV ? AMBER : null],
      ];
      if (ro.lat != null) {
        rows.push(['LATERAL', `${f2(ro.lat)} m`, ro.lat < LIM.dockLat ? null : AMBER]);
        rows.push(['ÂNGULO', `${f1(ro.ang * deg)}°`, ro.ang < LIM.dockAng ? null : AMBER]);
        if (ro.roll != null) rows.push(['ROLAGEM', `${f1(ro.roll * deg)}°`, Math.abs(ro.roll) < LIM.dockRoll ? null : AMBER]);
        if (ro.spin != null) rows.push(['GIRO', `${f1(ro.spin * deg)}°/s`, ro.spin < LIM.dockSpin ? null : AMBER]);
      }
      g.textBaseline = 'middle';
      rows.forEach(([k, v, c], i) => {
        const y = 150 + i * 46;
        g.font = '20px sans-serif'; g.textAlign = 'left'; g.fillStyle = DIM; g.fillText(k, 34, y);
        g.font = 'bold 28px sans-serif'; g.textAlign = 'right'; g.fillStyle = c || MINT; g.fillText(v, 270, y);
      });
    }

    // combustível, dano, tempo à direita
    const bar = (label, v, y, color) => {
      g.font = '20px sans-serif'; g.textAlign = 'left'; g.fillStyle = DIM; g.fillText(label, W - 270, y);
      g.strokeStyle = DIM; g.lineWidth = 2; g.strokeRect(W - 270, y + 16, 236, 18);
      g.fillStyle = color; g.fillRect(W - 268, y + 18, 232 * Math.max(0, Math.min(1, v / 100)), 14);
      g.font = 'bold 22px sans-serif'; g.textAlign = 'right'; g.fillStyle = color; g.fillText(`${Math.round(v)}%`, W - 34, y);
    };
    bar('COMBUSTÍVEL', s.fuel, 150, s.fuel < 15 ? RED : s.fuel < 30 ? AMBER : MINT);
    bar('DANO', s.damage, 220, s.damage > 60 ? RED : s.damage > 0 ? AMBER : MINT);
    g.font = '20px sans-serif'; g.textAlign = 'left'; g.fillStyle = DIM; g.fillText('TEMPO', W - 270, 300);
    g.font = 'bold 28px sans-serif'; g.textAlign = 'right'; g.fillStyle = MINT; g.fillText(fmtTime(s.time), W - 34, 300);
    if (s.stab) { g.font = 'bold 24px sans-serif'; g.textAlign = 'right'; g.fillStyle = AMBER; g.fillText('ESTABILIZANDO', W - 34, 350); }
    if (s.wDeg > 0.3) { g.font = '20px sans-serif'; g.textAlign = 'right'; g.fillStyle = s.wDeg > 8 ? AMBER : DIM; g.fillText(`giro da nave ${f1(s.wDeg)}°/s`, W - 34, 390); }

    // objetivo em cima e aviso
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 26px sans-serif'; g.fillStyle = MINT; g.fillText(s.objective, W / 2, 34);
    if (s.msg) {
      // aviso em até 2 linhas
      g.font = 'bold 26px sans-serif';
      const maxW = W - 120, words = s.msg.text.split(' '), lines = [''];
      for (const w of words) {
        const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w;
        if (g.measureText(t).width > maxW && lines[lines.length - 1]) { if (lines.length === 2) { lines[1] = fit(g, lines[1] + ' ' + w, maxW); break; } lines.push(w); }
        else lines[lines.length - 1] = t;
      }
      const w = Math.min(W - 80, Math.max(...lines.map(l => g.measureText(l).width)) + 40);
      g.fillStyle = 'rgba(3,8,20,0.62)'; roundRect(g, W / 2 - w / 2, 62, w, 14 + lines.length * 34, 10); g.fill();
      g.fillStyle = s.msg.color;
      lines.forEach((l, i) => g.fillText(l, W / 2, 86 + i * 34));
    }
    this.tex.needsUpdate = true;
  }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function fit(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 3 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
