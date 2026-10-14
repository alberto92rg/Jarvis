// L'ologramma di Jarvis: un nucleo che fluttua sopra un proiettore,
// con anelli, giroscopio, satelliti per le sezioni e icona centrale.
const TAU = Math.PI * 2;
const HOLO = [65, 220, 255];
const ICE = [214, 247, 255];
const AMBER = [255, 181, 71];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export const SECTIONS = ['email', 'youtube', 'agenda', 'meteo'];
const SAT_ICON = { email: 'mail', youtube: 'play', agenda: 'calendar', meteo: 'sun' };
const SAT_ANGLE = { email: -150, youtube: -110, agenda: -70, meteo: -30 };

// --- Icone (disegnate in un riquadro di lato s, centrato) -----------------

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function cloud(c, s, oy = 0) {
  c.beginPath();
  c.moveTo(-0.3 * s, (0.2 + oy) * s);
  c.arc(-0.24 * s, (0.06 + oy) * s, 0.15 * s, Math.PI * 0.62, Math.PI * 1.45);
  c.arc(0.0 * s, (-0.06 + oy) * s, 0.21 * s, Math.PI * 1.1, Math.PI * 1.9);
  c.arc(0.25 * s, (0.07 + oy) * s, 0.14 * s, Math.PI * 1.5, Math.PI * 0.5);
  c.closePath();
  c.stroke();
}

const ICONS = {
  core(c, s) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 6;
      const x = Math.cos(a) * 0.38 * s;
      const y = Math.sin(a) * 0.38 * s;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 0.1 * s, 0, TAU);
    c.fill();
    c.beginPath();
    for (const deg of [-90, 30, 150]) {
      const a = (deg * Math.PI) / 180;
      c.moveTo(Math.cos(a) * 0.17 * s, Math.sin(a) * 0.17 * s);
      c.lineTo(Math.cos(a) * 0.3 * s, Math.sin(a) * 0.3 * s);
    }
    c.stroke();
  },
  mail(c, s) {
    rrect(c, -0.48 * s, -0.33 * s, 0.96 * s, 0.66 * s, 0.07 * s);
    c.stroke();
    c.beginPath();
    c.moveTo(-0.44 * s, -0.27 * s);
    c.lineTo(0, 0.07 * s);
    c.lineTo(0.44 * s, -0.27 * s);
    c.stroke();
  },
  play(c, s) {
    rrect(c, -0.48 * s, -0.34 * s, 0.96 * s, 0.68 * s, 0.17 * s);
    c.stroke();
    c.beginPath();
    c.moveTo(-0.11 * s, -0.17 * s);
    c.lineTo(0.2 * s, 0);
    c.lineTo(-0.11 * s, 0.17 * s);
    c.closePath();
    c.fill();
  },
  calendar(c, s) {
    rrect(c, -0.42 * s, -0.32 * s, 0.84 * s, 0.76 * s, 0.07 * s);
    c.stroke();
    c.beginPath();
    c.moveTo(-0.42 * s, -0.12 * s);
    c.lineTo(0.42 * s, -0.12 * s);
    c.moveTo(-0.2 * s, -0.44 * s);
    c.lineTo(-0.2 * s, -0.24 * s);
    c.moveTo(0.2 * s, -0.44 * s);
    c.lineTo(0.2 * s, -0.24 * s);
    c.stroke();
    const d = 0.07 * s;
    for (const y of [0.06, 0.25]) {
      for (const x of [-0.22, 0, 0.22]) c.fillRect(x * s - d / 2, y * s - d / 2, d, d);
    }
  },
  sun(c, s) {
    c.beginPath();
    c.arc(0, 0, 0.19 * s, 0, TAU);
    c.stroke();
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      c.moveTo(Math.cos(a) * 0.3 * s, Math.sin(a) * 0.3 * s);
      c.lineTo(Math.cos(a) * 0.43 * s, Math.sin(a) * 0.43 * s);
    }
    c.stroke();
  },
  cloud(c, s) {
    cloud(c, s, 0.04);
  },
  rain(c, s) {
    cloud(c, s, -0.1);
    c.beginPath();
    for (const x of [-0.18, 0, 0.18]) {
      c.moveTo((x + 0.04) * s, 0.24 * s);
      c.lineTo((x - 0.04) * s, 0.42 * s);
    }
    c.stroke();
  },
  storm(c, s) {
    cloud(c, s, -0.12);
    c.beginPath();
    c.moveTo(0.04 * s, 0.14 * s);
    c.lineTo(-0.1 * s, 0.32 * s);
    c.lineTo(0.02 * s, 0.32 * s);
    c.lineTo(-0.06 * s, 0.48 * s);
    c.lineTo(0.14 * s, 0.26 * s);
    c.lineTo(0.02 * s, 0.26 * s);
    c.closePath();
    c.fill();
  },
  snow(c, s) {
    cloud(c, s, -0.1);
    const d = 0.06 * s;
    for (const [x, y] of [[-0.18, 0.3], [0, 0.4], [0.18, 0.3]]) {
      c.beginPath();
      c.arc(x * s, y * s, d, 0, TAU);
      c.fill();
    }
  },
  mic(c, s) {
    rrect(c, -0.13 * s, -0.44 * s, 0.26 * s, 0.52 * s, 0.13 * s);
    c.stroke();
    c.beginPath();
    c.arc(0, -0.04 * s, 0.27 * s, 0.08 * Math.PI, 0.92 * Math.PI);
    c.moveTo(0, 0.23 * s);
    c.lineTo(0, 0.42 * s);
    c.moveTo(-0.16 * s, 0.42 * s);
    c.lineTo(0.16 * s, 0.42 * s);
    c.stroke();
  },
  start(c, s) {
    c.beginPath();
    c.arc(0, 0, 0.42 * s, 0, TAU);
    c.stroke();
    c.beginPath();
    c.moveTo(-0.12 * s, -0.2 * s);
    c.lineTo(0.22 * s, 0);
    c.lineTo(-0.12 * s, 0.2 * s);
    c.closePath();
    c.fill();
  },
  wave(c, s) {
    c.beginPath();
    [0.16, 0.34, 0.5, 0.3, 0.18].forEach((h, i) => {
      const x = (-0.32 + i * 0.16) * s;
      c.moveTo(x, -h * s * 0.5);
      c.lineTo(x, h * s * 0.5);
    });
    c.stroke();
  },
};

export const ICON_NAMES = Object.keys(ICONS);

function drawIcon(c, name, s, color, glow, alpha, lw) {
  const fn = ICONS[name] || ICONS.core;
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = rgba(color, 1);
  c.fillStyle = rgba(color, 1);
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.shadowColor = rgba(glow, 0.95);
  c.shadowBlur = s * 0.35;
  fn(c, s);
  c.restore();
}

// --- Ologramma --------------------------------------------------------------

export function createHolo(canvas, audio = {}) {
  const c = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const spec = new Uint8Array(64);
  let W = 0;
  let H = 0;
  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let R = 0;
  let baseY = 0;
  let grid = null;
  let raf = 0;
  let last = 0;
  let time = 0;

  const st = {
    mode: 'idle',
    energy: 0.35,
    icon: 'core',
    prev: null,
    iconT: 1,
    metric: '',
    prevMetric: '',
    metricT: 1,
    alert: false,
    alertMix: 0,
    sats: Object.fromEntries(SECTIONS.map((k) => [k, 'off'])),
    satGlow: Object.fromEntries(SECTIONS.map((k) => [k, 0])),
    satIcon: { ...SAT_ICON },
    progress: -1,
    prog: 0,
    ripples: [],
    rippleClock: 0,
    burst: 0,
    burstColor: HOLO,
    level: 0,
    rot: { ticks: 0, seg: 0, arc: 0, dash: 0, sweep: 0, g1: 0.6, g2: 2.1 },
  };

  const parts = Array.from({ length: 46 }, () => ({
    a: Math.random() * TAU,
    r: 0.72 + Math.random() * 0.75,
    v: (Math.random() - 0.5) * 0.3,
    z: Math.random(),
    tw: Math.random() * TAU,
  }));

  function makeGrid() {
    const g = document.createElement('canvas');
    const step = Math.round(24 * dpr);
    g.width = g.height = step;
    const gc = g.getContext('2d');
    gc.fillStyle = rgba(HOLO, 0.09);
    gc.fillRect(0, 0, Math.max(1, dpr), Math.max(1, dpr));
    return c.createPattern(g, 'repeat');
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width * dpr));
    H = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = W;
    canvas.height = H;
    R = Math.min(W * 0.32, H * 0.205);
    cx = W / 2;
    cy = H * 0.42;
    baseY = Math.min(H * 0.86, cy + R * 2.3);
    grid = makeGrid();
  }

  // --- Disegno ---------------------------------------------------------------

  function background(oy) {
    const g = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#08243a');
    g.addColorStop(0.45, '#041628');
    g.addColorStop(1, '#010810');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.save();
    c.translate(0, (time * 6 * dpr) % (24 * dpr));
    c.fillStyle = grid;
    c.globalAlpha = 0.9;
    c.fillRect(0, -24 * dpr, W, H + 48 * dpr);
    c.restore();

    c.lineWidth = Math.max(1, dpr * 0.75);
    for (const [k, a] of [[1.7, 0.07], [2.35, 0.05], [3.2, 0.035]]) {
      c.strokeStyle = rgba(HOLO, a);
      c.beginPath();
      c.arc(cx, cy + oy * 0.4, R * k, 0, TAU);
      c.stroke();
    }
    // mirino tenue
    c.strokeStyle = rgba(HOLO, 0.05);
    c.beginPath();
    c.moveTo(cx - R * 3.4, cy);
    c.lineTo(cx - R * 1.5, cy);
    c.moveTo(cx + R * 1.5, cy);
    c.lineTo(cx + R * 3.4, cy);
    c.stroke();
  }

  function projector(oy) {
    const flick = 0.85 + 0.15 * Math.sin(time * 13) * Math.sin(time * 3.1);
    const top = cy + oy + R * 0.95;
    const wTop = R * 0.95;
    const wBot = R * 0.42;
    const g = c.createLinearGradient(0, baseY, 0, top);
    g.addColorStop(0, rgba(HOLO, 0.16 * flick * (0.6 + st.energy)));
    g.addColorStop(1, rgba(HOLO, 0));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx - wBot, baseY);
    c.lineTo(cx - wTop, top);
    c.lineTo(cx + wTop, top);
    c.lineTo(cx + wBot, baseY);
    c.closePath();
    c.fill();

    c.save();
    c.translate(cx, baseY);
    c.scale(1, 0.22);
    const bg = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.62);
    bg.addColorStop(0, rgba(ICE, 0.35 * flick));
    bg.addColorStop(0.45, rgba(HOLO, 0.16));
    bg.addColorStop(1, rgba(HOLO, 0));
    c.fillStyle = bg;
    c.beginPath();
    c.arc(0, 0, R * 0.62, 0, TAU);
    c.fill();
    c.lineWidth = 2 * dpr;
    c.strokeStyle = rgba(HOLO, 0.55);
    c.beginPath();
    c.arc(0, 0, R * 0.45, 0, TAU);
    c.stroke();
    c.lineWidth = 1.2 * dpr;
    for (let i = 0; i < 48; i++) {
      const a = (i * TAU) / 48 + st.rot.ticks * 2;
      c.strokeStyle = rgba(HOLO, 0.12 + 0.3 * ((i % 6) === 0));
      c.beginPath();
      c.moveTo(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52);
      c.lineTo(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6);
      c.stroke();
    }
    c.restore();
  }

  function gyro(oy, front) {
    const ring = (rot, tilt, rx, alpha, speedPhase) => {
      c.save();
      c.translate(cx, cy + oy);
      c.rotate(tilt);
      c.scale(1, 0.3);
      c.lineWidth = (front ? 1.6 : 1.1) * dpr;
      c.strokeStyle = rgba(HOLO, front ? alpha : alpha * 0.4);
      c.beginPath();
      if (front) c.arc(0, 0, rx, 0, Math.PI);
      else c.arc(0, 0, rx, Math.PI, TAU);
      c.stroke();
      const a = (rot + speedPhase) % TAU;
      const inFront = Math.sin(a) > 0;
      if (inFront === front) {
        c.fillStyle = rgba(ICE, front ? 0.95 : 0.4);
        c.shadowColor = rgba(HOLO, 1);
        c.shadowBlur = 10 * dpr;
        c.beginPath();
        c.arc(Math.cos(a) * rx, Math.sin(a) * rx, 3.2 * dpr / 0.3 * 0.3, 0, TAU);
        c.fill();
      }
      c.restore();
    };
    ring(st.rot.g1, -0.42, R * 1.12, 0.5, 0);
    ring(st.rot.g2, 0.58, R * 1.02, 0.42, 1.3);
  }

  function orb(oy, ringColor) {
    const x = cx;
    const y = cy + oy;
    const lvl = st.level;
    const e = st.energy;

    // alone
    const halo = c.createRadialGradient(x, y, R * 0.2, x, y, R * 1.45);
    halo.addColorStop(0, rgba(ringColor, 0.16 + 0.12 * lvl));
    halo.addColorStop(0.6, rgba(ringColor, 0.05));
    halo.addColorStop(1, rgba(ringColor, 0));
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, R * 1.45, 0, TAU);
    c.fill();

    // anello graduato esterno
    c.save();
    c.translate(x, y);
    c.rotate(st.rot.ticks);
    for (let i = 0; i < 120; i++) {
      const a = (i * TAU) / 120;
      const long = i % 10 === 0;
      const r0 = R * (long ? 0.93 : 0.96);
      c.strokeStyle = rgba(ringColor, long ? 0.75 : 0.32);
      c.lineWidth = (long ? 1.6 : 1) * dpr;
      c.beginPath();
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      c.stroke();
    }
    c.restore();

    // anello a segmenti
    c.save();
    c.translate(x, y);
    c.rotate(st.rot.seg);
    c.lineWidth = R * 0.035;
    c.lineCap = 'butt';
    for (let i = 0; i < 6; i++) {
      const a0 = (i * TAU) / 6 + 0.12;
      c.strokeStyle = rgba(ringColor, 0.28 + 0.5 * e + 0.2 * lvl);
      c.beginPath();
      c.arc(0, 0, R * 0.86, a0, a0 + TAU / 6 - 0.24);
      c.stroke();
    }
    c.restore();

    // arco luminoso
    c.save();
    c.translate(x, y);
    c.rotate(st.rot.arc);
    c.lineWidth = R * 0.05;
    c.lineCap = 'round';
    c.strokeStyle = rgba(ICE, 0.85);
    c.shadowColor = rgba(ringColor, 1);
    c.shadowBlur = R * 0.12;
    c.beginPath();
    c.arc(0, 0, R * 0.77, 0, TAU * (0.16 + 0.12 * e));
    c.stroke();
    c.restore();

    // anello tratteggiato
    c.save();
    c.translate(x, y);
    c.rotate(st.rot.dash);
    c.setLineDash([R * 0.04, R * 0.05]);
    c.lineWidth = 1.4 * dpr;
    c.strokeStyle = rgba(ringColor, 0.55);
    c.beginPath();
    c.arc(0, 0, R * 0.69, 0, TAU);
    c.stroke();
    c.restore();

    // spettro vocale
    if (st.mode === 'speaking' || st.mode === 'listening') {
      const n = 64;
      if (audio.spectrum) audio.spectrum(spec);
      c.save();
      c.translate(x, y);
      c.lineWidth = Math.max(1.5, R * 0.018);
      c.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const k = i < n / 2 ? i : n - 1 - i;
        let v = spec[Math.min(spec.length - 1, 2 + k * 1.2) | 0] / 255;
        if (!audio.spectrum || st.mode === 'listening') v = lvl * (0.4 + 0.6 * Math.abs(Math.sin(time * 7 + i * 0.7)));
        const a = (i * TAU) / n - Math.PI / 2;
        const r0 = R * 0.6;
        const r1 = r0 + R * (0.03 + 0.2 * v);
        c.strokeStyle = rgba(ringColor, 0.35 + 0.6 * v);
        c.beginPath();
        c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        c.stroke();
      }
      c.restore();
    }

    // sfera interna
    const pr = R * 0.56 * (1 + 0.07 * lvl + 0.02 * Math.sin(time * 2));
    const sg = c.createRadialGradient(x - pr * 0.25, y - pr * 0.3, pr * 0.05, x, y, pr);
    sg.addColorStop(0, rgba(ICE, 0.22 + 0.15 * lvl));
    sg.addColorStop(0.5, rgba(ringColor, 0.1 + 0.08 * e));
    sg.addColorStop(1, rgba(ringColor, 0.02));
    c.fillStyle = sg;
    c.beginPath();
    c.arc(x, y, pr, 0, TAU);
    c.fill();
    c.lineWidth = 1.2 * dpr;
    c.strokeStyle = rgba(ringColor, 0.5);
    c.stroke();

    // raggi interni
    c.save();
    c.translate(x, y);
    c.rotate(-st.rot.dash * 0.5);
    c.strokeStyle = rgba(ringColor, 0.12);
    c.lineWidth = dpr;
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12;
      c.beginPath();
      c.moveTo(Math.cos(a) * pr * 0.72, Math.sin(a) * pr * 0.72);
      c.lineTo(Math.cos(a) * pr * 0.95, Math.sin(a) * pr * 0.95);
      c.stroke();
    }
    c.restore();

    // radar mentre pensa
    if (st.mode === 'thinking') {
      c.save();
      c.translate(x, y);
      c.rotate(st.rot.sweep);
      if (c.createConicGradient) {
        const cg = c.createConicGradient(0, 0, 0);
        cg.addColorStop(0, rgba(ringColor, 0));
        cg.addColorStop(0.12, rgba(ringColor, 0.38));
        cg.addColorStop(0.1201, rgba(ringColor, 0));
        cg.addColorStop(1, rgba(ringColor, 0));
        c.fillStyle = cg;
      } else c.fillStyle = rgba(ringColor, 0.12);
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, R * 0.93, 0, TAU * 0.12);
      c.closePath();
      c.fill();
      c.restore();
    }

    // avanzamento del briefing
    if (st.progress >= 0) {
      c.save();
      c.lineWidth = 2.2 * dpr;
      c.lineCap = 'round';
      c.strokeStyle = rgba(ICE, 0.9);
      c.shadowColor = rgba(ringColor, 1);
      c.shadowBlur = 8 * dpr;
      c.beginPath();
      c.arc(x, y, R * 1.05, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.002, st.prog));
      c.stroke();
      c.restore();
    }

    // onde d'ascolto e impulsi
    for (const rp of st.ripples) {
      const k = rp.t;
      c.strokeStyle = rgba(ringColor, 0.5 * (1 - k));
      c.lineWidth = 2 * dpr * (1 - k) + dpr * 0.5;
      c.beginPath();
      c.arc(x, y, R * (0.62 + 0.8 * easeOut(k)), 0, TAU);
      c.stroke();
    }
    if (st.burst > 0) {
      const k = 1 - st.burst;
      c.strokeStyle = rgba(st.burstColor, 0.8 * st.burst);
      c.lineWidth = 3 * dpr * st.burst;
      c.beginPath();
      c.arc(x, y, R * (0.58 + 0.75 * easeOut(k)), 0, TAU);
      c.stroke();
    }

    // icona centrale con dissolvenza
    const iconColor = mixc(ICE, AMBER, st.alertMix);
    const glow = mixc(HOLO, AMBER, st.alertMix);
    const s = R * 0.5;
    c.save();
    c.translate(x, y);
    if (st.prev && st.iconT < 1) {
      const k = easeOut(st.iconT);
      c.save();
      c.scale(1 - 0.4 * k, 1 - 0.4 * k);
      drawIcon(c, st.prev, s, iconColor, glow, 1 - k, s * 0.06);
      c.restore();
      c.save();
      const sc = 1.35 - 0.35 * k;
      c.scale(sc, sc);
      drawIcon(c, st.icon, s, iconColor, glow, k, s * 0.06);
      c.restore();
    } else {
      const pulse = st.mode === 'ready' ? 1 + 0.06 * Math.sin(time * 4) : 1 + 0.03 * lvl;
      c.scale(pulse, pulse);
      drawIcon(c, st.icon, s, iconColor, glow, 1, s * 0.06);
    }
    c.restore();
  }

  function particles(oy, ringColor) {
    for (const p of parts) {
      const r = R * p.r;
      const x = cx + Math.cos(p.a) * r;
      const y = cy + oy + Math.sin(p.a) * r * 0.92;
      const a = (0.15 + 0.5 * p.z) * (0.6 + 0.4 * Math.sin(time * 2 + p.tw));
      c.fillStyle = rgba(ringColor, a);
      c.fillRect(x, y, (1 + p.z * 1.6) * dpr, (1 + p.z * 1.6) * dpr);
    }
  }

  function satellites(oy, ringColor) {
    const rr = R * 1.34;
    for (const k of SECTIONS) {
      const ang = (SAT_ANGLE[k] * Math.PI) / 180;
      const bob = reduce.matches ? 0 : Math.sin(time * 1.3 + ang * 3) * R * 0.03;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + oy + Math.sin(ang) * rr + bob;
      const state = st.sats[k];
      const g = st.satGlow[k];
      const err = state === 'error';
      const col = err ? AMBER : ringColor;
      const base = state === 'off' ? 0.22 : state === 'pending' ? 0.32 : state === 'done' ? 0.5 : 0.62;
      const a = Math.min(1, base + 0.45 * g);
      const sr = R * (0.16 + 0.03 * g);

      if (g > 0.05) {
        c.strokeStyle = rgba(col, 0.55 * g);
        c.lineWidth = 1.2 * dpr;
        c.setLineDash([4 * dpr, 4 * dpr]);
        c.beginPath();
        c.moveTo(x - Math.cos(ang) * sr, y - Math.sin(ang) * sr);
        c.lineTo(cx + Math.cos(ang) * R * 1.06, cy + oy + Math.sin(ang) * R * 1.06);
        c.stroke();
        c.setLineDash([]);
      }
      c.fillStyle = rgba([3, 20, 36], 0.75);
      c.beginPath();
      c.arc(x, y, sr, 0, TAU);
      c.fill();
      c.strokeStyle = rgba(col, a);
      c.lineWidth = (1.2 + g) * dpr;
      c.stroke();
      if (g > 0.05) {
        c.save();
        c.translate(x, y);
        c.rotate(time * 1.5);
        c.strokeStyle = rgba(col, 0.6 * g);
        c.lineWidth = 1.5 * dpr;
        c.beginPath();
        c.arc(0, 0, sr * 1.3, 0, TAU * 0.3);
        c.stroke();
        c.restore();
      }
      c.save();
      c.translate(x, y);
      drawIcon(c, st.satIcon[k], sr * 1.05, err ? AMBER : ICE, col, a, Math.max(1.2 * dpr, sr * 0.07));
      c.restore();
      if (state === 'done' || state === 'ok') {
        c.fillStyle = rgba(col, 0.9);
        c.beginPath();
        c.arc(x + sr * 0.75, y - sr * 0.75, 2.4 * dpr, 0, TAU);
        c.fill();
      }
    }
  }

  function metric(oy) {
    const col = mixc(ICE, AMBER, st.alertMix);
    const glow = mixc(HOLO, AMBER, st.alertMix);
    const y = cy + oy + R * 1.5;
    const size = Math.round(R * 0.36);
    const draw = (text, alpha, dy) => {
      if (!text || alpha <= 0.01) return;
      c.save();
      c.globalAlpha = alpha;
      c.font = `300 ${size}px Rajdhani, "Chakra Petch", "Segoe UI", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = rgba(col, 1);
      c.shadowColor = rgba(glow, 0.9);
      c.shadowBlur = size * 0.35;
      c.fillText(text, cx, y + dy);
      const tw = c.measureText(text).width / 2 + size * 0.35;
      c.shadowBlur = 0;
      c.strokeStyle = rgba(glow, 0.7);
      c.lineWidth = 1.4 * dpr;
      const h = size * 0.42;
      c.beginPath();
      c.moveTo(cx - tw + size * 0.12, y + dy - h);
      c.lineTo(cx - tw, y + dy - h);
      c.lineTo(cx - tw, y + dy + h);
      c.lineTo(cx - tw + size * 0.12, y + dy + h);
      c.moveTo(cx + tw - size * 0.12, y + dy - h);
      c.lineTo(cx + tw, y + dy - h);
      c.lineTo(cx + tw, y + dy + h);
      c.lineTo(cx + tw - size * 0.12, y + dy + h);
      c.stroke();
      c.restore();
    };
    const k = easeOut(st.metricT);
    draw(st.prevMetric, 1 - k, -size * 0.3 * k);
    draw(st.metric, k, size * 0.3 * (1 - k));
  }

  function scanlines() {
    c.fillStyle = rgba(HOLO, 0.035);
    const step = 3 * dpr;
    const y0 = (time * 30 * dpr) % (step * 2);
    for (let y = y0; y < H; y += step * 2) c.fillRect(0, y, W, dpr * 0.6);
    const band = 140 * dpr;
    const sweep = ((time * 0.12) % 1.4) * (H + band) - band;
    const g = c.createLinearGradient(0, sweep, 0, sweep + band);
    g.addColorStop(0, rgba(HOLO, 0));
    g.addColorStop(0.5, rgba(HOLO, 0.04));
    g.addColorStop(1, rgba(HOLO, 0));
    c.fillStyle = g;
    c.fillRect(0, sweep, W, band);
  }

  // --- Ciclo -----------------------------------------------------------------

  const TARGET_ENERGY = { idle: 0.3, listening: 0.75, thinking: 0.85, speaking: 0.6, ready: 0.65 };
  const SPEED = { idle: 1, listening: 1.6, thinking: 3.2, speaking: 1.4, ready: 1.2 };

  function step(dt) {
    const slow = reduce.matches ? 0.15 : 1;
    const sp = (SPEED[st.mode] || 1) * slow;
    st.rot.ticks += dt * 0.03 * sp;
    st.rot.seg -= dt * 0.16 * sp;
    st.rot.arc += dt * 0.55 * sp;
    st.rot.dash += dt * 0.22 * sp;
    st.rot.sweep += dt * 2.6 * slow;
    st.rot.g1 += dt * 0.7 * slow;
    st.rot.g2 -= dt * 0.55 * slow;
    for (const p of parts) p.a += dt * p.v * slow * (st.mode === 'thinking' ? 2.5 : 1);

    const raw = audio.level ? audio.level() : 0;
    const target = st.mode === 'speaking' ? raw : st.mode === 'listening' ? 0.35 + 0.25 * Math.sin(time * 5) : 0;
    st.level = lerp(st.level, target, Math.min(1, dt * 14));
    st.energy = lerp(st.energy, (TARGET_ENERGY[st.mode] || 0.3) + 0.3 * st.level, Math.min(1, dt * 3));
    st.alertMix = lerp(st.alertMix, st.alert ? 1 : 0, Math.min(1, dt * 4));
    st.iconT = Math.min(1, st.iconT + dt / 0.45);
    st.metricT = Math.min(1, st.metricT + dt / 0.5);
    st.burst = Math.max(0, st.burst - dt / 0.7);
    if (st.progress >= 0) st.prog = lerp(st.prog, st.progress, Math.min(1, dt * 3));

    for (const k of SECTIONS) {
      const want = st.sats[k] === 'active' ? 1 : st.sats[k] === 'ok' ? 0.35 : 0;
      const pulse = st.sats[k] === 'active' ? 0.15 * Math.sin(time * 5) : 0;
      st.satGlow[k] = lerp(st.satGlow[k], want + pulse, Math.min(1, dt * 6));
    }

    if (st.mode === 'listening' && !reduce.matches) {
      st.rippleClock -= dt;
      if (st.rippleClock <= 0) {
        st.ripples.push({ t: 0 });
        st.rippleClock = 0.85;
      }
    }
    st.ripples.forEach((r) => (r.t += dt / 1.6));
    st.ripples = st.ripples.filter((r) => r.t < 1);
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    time += dt;
    step(dt);
    const oy = reduce.matches ? 0 : Math.sin(time * 0.9) * R * 0.04;
    const ringColor = HOLO;
    c.setTransform(1, 0, 0, 1, 0, 0);
    background(oy);
    projector(oy);
    gyro(oy, false);
    particles(oy, ringColor);
    orb(oy, ringColor);
    gyro(oy, true);
    satellites(oy, ringColor);
    metric(oy);
    scanlines();
  }

  function start() {
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();

  return {
    setMode(mode) {
      st.mode = mode;
      if (mode !== 'listening') st.ripples = [];
    },
    setIcon(name, { alert = false } = {}) {
      const n = ICONS[name] ? name : 'core';
      st.alert = alert;
      if (n === st.icon) return;
      st.prev = st.icon;
      st.icon = n;
      st.iconT = 0;
      st.burst = 1;
      st.burstColor = alert ? AMBER : HOLO;
    },
    setMetric(text = '') {
      const t = String(text || '');
      if (t === st.metric) return;
      st.prevMetric = st.metric;
      st.metric = t;
      st.metricT = 0;
    },
    setSatellite(name, state, icon) {
      if (!(name in st.sats)) return;
      st.sats[name] = state;
      if (icon && ICONS[icon]) st.satIcon[name] = icon;
    },
    resetSatellites(state = 'off') {
      for (const k of SECTIONS) {
        st.sats[k] = state;
        st.satIcon[k] = SAT_ICON[k];
      }
    },
    setProgress(p) {
      if (p < 0) {
        st.progress = -1;
        st.prog = 0;
      } else st.progress = Math.max(0, Math.min(1, p));
    },
    flash(alert = true) {
      st.burst = 1;
      st.burstColor = alert ? AMBER : HOLO;
    },
    geometry() {
      return { x: cx / dpr, y: cy / dpr, r: R / dpr };
    },
    _state: st,
  };
}
