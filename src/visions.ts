import { mulberry32 } from './utils';

export type RandFn = () => number;
export type GeneratorFn = (ctx: CanvasRenderingContext2D, size: number, palette: string[], rand: RandFn) => void;

export interface Generator {
  id: string;
  name: string;
  fn: GeneratorFn;
}

export interface Vision {
  canvas: HTMLCanvasElement;
  generator: Generator;
  palette: string[];
  seed: number;
}

export const PALETTES: string[][] = [
  ['#0a0014', '#3a0066', '#a83cf7', '#ff5fd2', '#ffe8a0'],
  ['#001218', '#003844', '#0a8e9e', '#48cae4', '#caf0f8'],
  ['#160d05', '#5b1f0a', '#c75a1a', '#ffa653', '#fff1c1'],
  ['#02110a', '#073c1f', '#1f8d4f', '#9fe870', '#f0ffd6'],
  ['#0d0518', '#2b1457', '#6d3df5', '#3ddfff', '#fdd0ff'],
  ['#10040c', '#4a0830', '#c01661', '#ff7aa2', '#ffe1d0'],
  ['#070713', '#1a1f4b', '#3d6fff', '#7fc7ff', '#e0f0ff'],
  ['#0a0a0a', '#1a1a1a', '#7a6a48', '#c8a45c', '#f4d987'],
  ['#020014', '#0d0a3a', '#5a2eb8', '#ff3ab2', '#ffe8ff'],
  ['#0f0a05', '#3c1f0a', '#a05a14', '#e6a02e', '#ffe9b3'],
  ['#000814', '#001d3d', '#003566', '#ffc300', '#ffd60a'],
  ['#1b0a14', '#4f1a3a', '#a23f74', '#f06ba0', '#ffd9d9'],
];

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function rgba(rgb: [number, number, number], a: number) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }
function pick<T>(arr: T[], r: RandFn): T { return arr[Math.floor(r() * arr.length)]; }

function grain(ctx: CanvasRenderingContext2D, size: number, r: RandFn, amount = 0.06) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 255 * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function nebula(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);
  const blobs = 14 + Math.floor(r() * 10);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < blobs; i++) {
    const x = r() * size, y = r() * size;
    const rad = size * (0.18 + r() * 0.45);
    const c = hexToRgb(pick(palette.slice(1), r));
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(c, 0.55));
    g.addColorStop(0.4, rgba(c, 0.2));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  const stars = 200 + Math.floor(r() * 250);
  for (let i = 0; i < stars; i++) {
    const x = r() * size, y = r() * size;
    const rad = r() * 1.4 + 0.2;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  grain(ctx, size, r, 0.05);
}

function aurora(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);
  const bands = 5 + Math.floor(r() * 4);
  ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < bands; b++) {
    const c = hexToRgb(pick(palette.slice(1), r));
    const baseY = (b + 0.5) * (size / bands) + (r() - 0.5) * size * 0.18;
    const amp = size * (0.04 + r() * 0.12);
    const freq = (1 + r() * 3) * TAU / size;
    const phase = r() * TAU;
    const thickness = size * (0.05 + r() * 0.12);
    ctx.beginPath();
    ctx.moveTo(-10, baseY);
    for (let x = 0; x <= size; x += 4) ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp);
    ctx.lineTo(size, size + thickness);
    ctx.lineTo(-10, size + thickness);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - thickness, 0, baseY + thickness * 2);
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(0.5, rgba(c, 0.55));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  grain(ctx, size, r, 0.04);
}

function colorField(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);
  const n = 2 + Math.floor(r() * 3);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = (size / n) * (0.6 + r() * 0.8);
    const c = hexToRgb(pick(palette.slice(1), r));
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(0.5, rgba(c, 0.85));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-size * 0.1, y, size * 1.2, h);
    y += h * 0.8;
  }
  grain(ctx, size, r, 0.08);
}

function iridescence(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  const angle = r() * TAU;
  const cx = size / 2, cy = size / 2;
  const stops = palette.slice(1);
  const steps = 360;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  for (let i = 0; i < steps; i++) {
    const t = i / steps, t2 = (i + 1) / steps;
    const idx = t * stops.length;
    const a = stops[Math.floor(idx) % stops.length];
    const b = stops[(Math.floor(idx) + 1) % stops.length];
    const ft = idx - Math.floor(idx);
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const c: [number, number, number] = [lerp(ca[0], cb[0], ft), lerp(ca[1], cb[1], ft), lerp(ca[2], cb[2], ft)];
    ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, size, t * TAU, t2 * TAU + 0.01);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, r, 0.05);
}

function topo(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);
  const lineColor = hexToRgb(palette[palette.length - 2]);
  const accent = hexToRgb(palette[palette.length - 1]);
  const cx = size * (0.3 + r() * 0.4), cy = size * (0.3 + r() * 0.4);
  const cx2 = size * (0.3 + r() * 0.4), cy2 = size * (0.3 + r() * 0.4);
  const lines = 26 + Math.floor(r() * 14);
  for (let i = 0; i < lines; i++) {
    const t = i / lines;
    ctx.beginPath();
    for (let a = 0; a <= TAU + 0.05; a += 0.02) {
      const wob = Math.sin(a * 3 + t * 6) * 0.12 + Math.cos(a * 5 + t * 3) * 0.08;
      const rad = size * (0.05 + t * 0.6 + wob * 0.1);
      const ox = lerp(cx, cx2, t), oy = lerp(cy, cy2, t);
      const x = ox + Math.cos(a) * rad, y = oy + Math.sin(a) * rad;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineWidth = 1 + (t < 0.1 || t > 0.9 ? 1 : 0);
    ctx.strokeStyle = i % 5 === 0 ? rgba(accent, 0.85) : rgba(lineColor, 0.45);
    ctx.stroke();
  }
  grain(ctx, size, r, 0.04);
}

function voronoi(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  const sites: Array<{ x: number; y: number; c: [number, number, number] }> = [];
  const n = 18 + Math.floor(r() * 16);
  for (let i = 0; i < n; i++) sites.push({ x: r() * size, y: r() * size, c: hexToRgb(pick(palette.slice(1), r)) });
  const step = 4;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      let best = Infinity, bi = 0;
      for (let i = 0; i < sites.length; i++) {
        const dx = x - sites[i].x, dy = y - sites[i].y;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; bi = i; }
      }
      const c = sites[bi].c;
      const dist = Math.sqrt(best);
      const dim = Math.max(0.35, 1 - dist / (size * 0.4));
      ctx.fillStyle = `rgb(${c[0] * dim | 0},${c[1] * dim | 0},${c[2] * dim | 0})`;
      ctx.fillRect(x, y, step, step);
    }
  }
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = (y * size + x) * 4;
      const ir = (y * size + x + 1) * 4;
      const ib = ((y + 1) * size + x) * 4;
      if (Math.abs(d[i] - d[ir]) + Math.abs(d[i] - d[ib]) > 50) d[i] = d[i + 1] = d[i + 2] = 8;
    }
  }
  ctx.putImageData(img, 0, 0);
  grain(ctx, size, r, 0.04);
}

function starfield(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  const cx = size / 2, cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
  g.addColorStop(0, rgba(hexToRgb(palette[1]), 0.55));
  g.addColorStop(1, rgba(hexToRgb(palette[0]), 1));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = r() * size, y = r() * size;
    const rad = size * (0.2 + r() * 0.3);
    const c = hexToRgb(pick(palette.slice(2), r));
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, rgba(c, 0.4)); gg.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  const stars = 600 + Math.floor(r() * 400);
  for (let i = 0; i < stars; i++) {
    const x = r() * size, y = r() * size;
    const rad = Math.pow(r(), 4) * 4 + 0.3;
    const a = 0.4 + r() * 0.6;
    ctx.fillStyle = `rgba(255,${230 + (r() * 25) | 0},${200 + (r() * 55) | 0},${a})`;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    if (rad > 2) {
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.4})`; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x - rad * 3, y); ctx.lineTo(x + rad * 3, y);
      ctx.moveTo(x, y - rad * 3); ctx.lineTo(x, y + rad * 3);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function liquid(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, rgba(hexToRgb(palette[1]), 1));
  g.addColorStop(1, rgba(hexToRgb(palette[0]), 1));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const blobs: Array<{ x: number; y: number; rad: number; c: [number, number, number] }> = [];
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) blobs.push({ x: r() * size, y: r() * size, rad: size * (0.12 + r() * 0.22), c: hexToRgb(pick(palette.slice(2), r)) });
  ctx.globalCompositeOperation = 'lighter';
  for (const b of blobs) {
    const gg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rad);
    gg.addColorStop(0, rgba(b.c, 0.95)); gg.addColorStop(0.45, rgba(b.c, 0.55)); gg.addColorStop(1, rgba(b.c, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(b.x, b.y, b.rad, 0, TAU); ctx.fill();
  }
  for (const b of blobs) {
    const hx = b.x - b.rad * 0.3, hy = b.y - b.rad * 0.4;
    const gg = ctx.createRadialGradient(hx, hy, 0, hx, hy, b.rad * 0.35);
    gg.addColorStop(0, 'rgba(255,255,255,0.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hx, hy, b.rad * 0.35, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  grain(ctx, size, r, 0.04);
}

function ribbons(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, size, size);
  const n = 6 + Math.floor(r() * 5);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const c = hexToRgb(pick(palette.slice(1), r));
    const phase = r() * TAU, freq = 0.5 + r() * 2;
    const amp = size * (0.1 + r() * 0.25);
    const yBase = r() * size, w = size * (0.02 + r() * 0.06);
    ctx.beginPath();
    for (let x = -20; x <= size + 20; x += 6) {
      const y = yBase + Math.sin(x / size * TAU * freq + phase) * amp + Math.cos(x / size * TAU * freq * 0.5) * amp * 0.4;
      if (x === -20) ctx.moveTo(x, y - w); else ctx.lineTo(x, y - w);
    }
    for (let x = size + 20; x >= -20; x -= 6) {
      const y = yBase + Math.sin(x / size * TAU * freq + phase) * amp + Math.cos(x / size * TAU * freq * 0.5) * amp * 0.4;
      ctx.lineTo(x, y + w);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, yBase - amp, 0, yBase + amp);
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.5, rgba(c, 0.95)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  grain(ctx, size, r, 0.04);
}

function smoke(ctx: CanvasRenderingContext2D, size: number, palette: string[], r: RandFn) {
  ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, size, size);
  const plumes = 35 + Math.floor(r() * 20);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < plumes; i++) {
    const x = size * (0.2 + r() * 0.6), y = size * (0.3 + r() * 0.5);
    const rad = size * (0.08 + r() * 0.18);
    const c = hexToRgb(pick(palette.slice(1), r));
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, rgba(c, 0.25)); gg.addColorStop(0.5, rgba(c, 0.12)); gg.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  grain(ctx, size, r, 0.05);
}

export const GENERATORS: Generator[] = [
  { id: 'nebula', name: 'Nebula', fn: nebula },
  { id: 'aurora', name: 'Aurora', fn: aurora },
  { id: 'colorField', name: 'Color field', fn: colorField },
  { id: 'iridescence', name: 'Iridescence', fn: iridescence },
  { id: 'topo', name: 'Topography', fn: topo },
  { id: 'voronoi', name: 'Voronoi', fn: voronoi },
  { id: 'starfield', name: 'Starfield', fn: starfield },
  { id: 'liquid', name: 'Liquid', fn: liquid },
  { id: 'ribbons', name: 'Ribbons', fn: ribbons },
  { id: 'smoke', name: 'Smoke', fn: smoke },
];

export function generateVision({
  size = 1024,
  generatorId = null as string | null,
  paletteIndex = null as number | null,
  seed = null as number | null,
} = {}): Vision {
  const s = seed ?? ((Math.random() * 1e9) | 0);
  const r = mulberry32(s);
  const gen = generatorId
    ? (GENERATORS.find(g => g.id === generatorId) || pick(GENERATORS, r))
    : pick(GENERATORS, r);
  const palette = paletteIndex != null ? PALETTES[paletteIndex % PALETTES.length] : pick(PALETTES, r);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  gen.fn(ctx, size, palette, r);
  return { canvas, generator: gen, palette, seed: s };
}
