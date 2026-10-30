// Progresso e opções, salvos no navegador.
const KEY = 'atracacaovr.v1';
const DEFAULTS = {
  done: {},          // fases vencidas: { 0: { stars, time, fuel, damage }, ... }
  sound: true,
  fps: false,
  vignette: true,    // escurece a borda da visão quando a nave gira (conforto)
  height: 0,         // ajuste fino da altura no VR (m)
  cam: 'cockpit',    // PC: 'cockpit' (cabine) ou 'chase' (por fora)
};

export function loadSave() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (typeof s.done !== 'object' || !s.done) s.done = {};
    return s;
  } catch { return { ...DEFAULTS, done: {} }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}
