// As 15 fases em 3 capítulos (sem navegador). Medidas em metros, ângulos em graus.
// ship: p posição, q [guinada, arfagem, rolagem], v velocidade, w giro (graus/s, no referencial da nave)
// station: type (ver bodies.js), p, q, v, spin (graus/s em volta do eixo do encaixe)
// tasks em ordem: 'dock' (encaixar na estação), 'capture' (pegar o satélite pelo pino),
// 'deliver' (deixar o satélite no berço), 'ring:i' (passar pela argola i), 'rescue:i' (astronauta i)
// stars: 3 estrelas com combustível <= fuel[0] e tempo <= time[0]; 2 com fuel[1] e time[1]

export const CHAPTERS = ['Órbita Baixa', 'Cinturão', 'Estação Giratória'];

const belt = (seed, count, rMax = 5, drift = 0.5) => ({ seed, count, box: [-90, 90, -32, 32, 26, 168], rMin: 1.2, rMax, drift: [drift, 0.08, 0.08] });

export const LEVELS = [
  // ---------- Capítulo 1: Órbita Baixa ----------
  {
    chapter: 0, name: 'Primeiro encaixe',
    hint: 'Empurre a alavanca esquerda para a frente e solte: a nave não para sozinha. Chegue no encaixe abaixo de 0,3 m/s.',
    station: { type: 'estacao' },
    ship: { p: [0, 0, 48] },
    tasks: ['dock'],
    stars: { fuel: [8, 15], time: [90, 160] },
  },
  {
    chapter: 0, name: 'Chegada torta',
    hint: 'A nave já chega girando. Aperte estabilizar (A ou Espaço), alinhe a cruz com a alavanca direita e só então se aproxime.',
    station: { type: 'estacao' },
    ship: { p: [16, 7, 62], q: [28, -8, 5], v: [0, 0, -0.15], w: [0.6, -0.8, 0.4] },
    tasks: ['dock'],
    stars: { fuel: [16, 28], time: [120, 210] },
  },
  {
    chapter: 0, name: 'Estação que gira',
    hint: 'A estação gira devagar em volta do encaixe. Gire junto (rolagem: torcer a alavanca direita) até a cruz parar.',
    station: { type: 'estacao', spin: 2 },
    ship: { p: [-8, -5, 55], q: [-10, 5, 0] },
    tasks: ['dock'],
    stars: { fuel: [15, 27], time: [110, 190] },
  },
  {
    chapter: 0, name: 'Satélite à deriva',
    hint: 'Encaixe a sonda no pino do satélite e leve-o até o berço embaixo da estação. Com ele a nave fica mais pesada.',
    station: { type: 'estacao' },
    sat: { p: [-26, 9, 60], v: [0.08, 0, -0.04] },
    ship: { p: [-24, 11, 96] },
    tasks: ['capture', 'deliver'],
    stars: { fuel: [23, 40], time: [170, 290] },
  },
  {
    chapter: 0, name: 'Entrega em movimento',
    hint: 'A estação está andando e o satélite gira. Pegue, entregue no berço e depois encaixe a nave na estação.',
    station: { type: 'estacao', v: [0.12, 0, 0.04] },
    sat: { p: [30, -8, 70], q: [-20, 10, 0], spin: 1.5 },
    ship: { p: [18, -2, 102], q: [-15, 0, 0] },
    tasks: ['capture', 'deliver', 'dock'],
    stars: { fuel: [37, 66], time: [260, 450] },
  },
  // ---------- Capítulo 2: Cinturão ----------
  {
    chapter: 1, name: 'Portões do cinturão',
    hint: 'Passe pelas argolas em ordem desviando das pedras e depois encaixe no posto de mineração.',
    station: { type: 'posto' },
    ship: { p: [0, 0, 178] },
    rings: [{ c: [6, 3, 140] }, { c: [-8, -4, 100] }, { c: [4, 6, 60] }],
    asteroids: belt(11, 26, 5, 0.4),
    tasks: ['ring:0', 'ring:1', 'ring:2', 'dock'],
    stars: { fuel: [31, 54], time: [260, 440] },
  },
  {
    chapter: 1, name: 'Astronauta à deriva',
    hint: 'Alcance o astronauta, iguale a velocidade dele e pegue com a mão pela janela (PC: chegue perto do lado direito). Depois volte ao posto.',
    station: { type: 'posto' },
    ship: { p: [0, 0, 172] },
    astros: [{ p: [22, 8, 112], v: [-0.15, 0.02, 0.05] }],
    asteroids: belt(23, 24, 5, 0.4),
    tasks: ['rescue:0', 'dock'],
    stars: { fuel: [28, 49], time: [220, 380] },
  },
  {
    chapter: 1, name: 'Corredor de pedras',
    hint: 'Cinco argolas no meio de um cinturão cheio. Devagar se chega mais longe.',
    station: { type: 'posto' },
    ship: { p: [0, 0, 180] },
    rings: [{ c: [0, 0, 150] }, { c: [10, -5, 125] }, { c: [-6, 8, 100] }, { c: [-12, -2, 75] }, { c: [0, 4, 48] }],
    asteroids: belt(37, 50, 5.5, 0.5),
    tasks: ['ring:0', 'ring:1', 'ring:2', 'ring:3', 'ring:4', 'dock'],
    stars: { fuel: [41, 73], time: [300, 500] },
  },
  {
    chapter: 1, name: 'Dois astronautas',
    hint: 'Dois astronautas soltos, cada um indo para um lado. O posto também está à deriva.',
    station: { type: 'posto', v: [0.1, 0, 0] },
    ship: { p: [0, 0, 172] },
    astros: [{ p: [-25, 5, 132], v: [0.2, 0, -0.05], spin: 20 }, { p: [18, -10, 82], v: [-0.1, 0.1, 0.1], spin: -15 }],
    asteroids: belt(41, 34, 5, 0.45),
    tasks: ['rescue:0', 'rescue:1', 'dock'],
    stars: { fuel: [54, 95], time: [240, 410] },
  },
  {
    chapter: 1, name: 'Resgate no cinturão',
    hint: 'Argolas, um astronauta girando rápido e pedras por todo lado.',
    station: { type: 'posto' },
    ship: { p: [0, 0, 176] },
    rings: [{ c: [0, 0, 146] }, { c: [8, 4, 116] }, { c: [0, -6, 56] }],
    astros: [{ p: [-15, -6, 90], v: [0.3, 0.05, 0], spin: 30 }],
    asteroids: belt(53, 48, 5.5, 0.5),
    tasks: ['ring:0', 'ring:1', 'rescue:0', 'ring:2', 'dock'],
    stars: { fuel: [55, 96], time: [270, 450] },
  },
  // ---------- Capítulo 3: Estação Giratória ----------
  {
    chapter: 2, name: 'No eixo',
    hint: 'A roda gira. O encaixe fica no eixo dela: alinhe, gire junto até a cruz parar e entre devagar.',
    station: { type: 'roda', spin: 4 },
    ship: { p: [4, 3, 62] },
    tasks: ['dock'],
    stars: { fuel: [11, 20], time: [110, 180] },
  },
  {
    chapter: 2, name: 'Roda rápida',
    hint: 'Gira mais que o dobro. Não chegue perto do aro: ele passa rápido.',
    station: { type: 'roda', spin: 9 },
    ship: { p: [30, -12, 76], q: [20, 8, 0] },
    tasks: ['dock'],
    stars: { fuel: [17, 29], time: [150, 260] },
  },
  {
    chapter: 2, name: 'Roda à deriva',
    hint: 'A roda gira e anda, e a nave começa rodopiando. Estabilize primeiro.',
    station: { type: 'roda', spin: 9, v: [0.15, 0.08, 0] },
    ship: { p: [-20, 15, 72], w: [1.0, -0.5, 1.5] },
    tasks: ['dock'],
    stars: { fuel: [16, 28], time: [140, 240] },
  },
  {
    chapter: 2, name: 'Detritos',
    hint: 'Pedaços soltos giram em volta do cilindro. Chegue pelo eixo, de longe.',
    station: { type: 'cilindro', spin: 8 },
    ship: { p: [25, 10, 82] },
    debris: [{ seed: 5, count: 30, rMin: 11, rMax: 18, z0: -38, z1: -4, rate: 0.08 }, { seed: 6, count: 10, rMin: 5, rMax: 10, z0: -6, z1: 8, rate: 0.12 }],
    hold: 30,
    tasks: ['dock'],
    stars: { fuel: [16, 28], time: [170, 290] },
  },
  {
    chapter: 2, name: 'O cilindro',
    hint: 'O último desafio: o cilindro gira rápido, cercado de detritos, e você chega rodando.',
    station: { type: 'cilindro', spin: 15 },
    ship: { p: [-30, -18, 92], q: [-25, 12, 10], w: [1, 1, -1] },
    debris: [{ seed: 9, count: 40, rMin: 11, rMax: 19, z0: -40, z1: -2, rate: 0.1 }, { seed: 10, count: 18, rMin: 5, rMax: 11, z0: -6, z1: 12, rate: 0.15 }],
    hold: 32,
    tasks: ['dock'],
    stars: { fuel: [17, 30], time: [190, 320] },
  },
];
