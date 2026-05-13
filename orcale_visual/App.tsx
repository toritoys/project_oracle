// src/app/App.tsx
// Drop-in replacement: no image-folder dependency.
// Visions are generated procedurally onto a <canvas>.
//
// You can safely delete /src/imports/image*.jpg after pasting this in.

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── palettes ────────────────────────────────────────────────────────────────
const PALETTES: string[][] = [
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
];

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hexToRgb = (h: string): [number, number, number] => {
  const m = h.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};
const rgba = (rgb: number[], a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grain(ctx: CanvasRenderingContext2D, size: number, r: () => number, amount = 0.05) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 255 * amount;
    d[i]     = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

// ─── generators ──────────────────────────────────────────────────────────────
type Gen = (ctx: CanvasRenderingContext2D, size: number, palette: string[], r: () => number) => void;

const nebula: Gen = (ctx, size, palette, r) => {
  ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const blobs = 14 + Math.floor(r() * 10);
  for (let i = 0; i < blobs; i++) {
    const x = r() * size, y = r() * size, rad = size * (0.18 + r() * 0.45);
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
    ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
    ctx.beginPath();
    ctx.arc(r() * size, r() * size, r() * 1.4 + 0.2, 0, TAU);
    ctx.fill();
  }
  grain(ctx, size, r, 0.05);
};

const aurora: Gen = (ctx, size, palette, r) => {
  ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const bands = 5 + Math.floor(r() * 4);
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
    ctx.lineTo(size, size + thickness); ctx.lineTo(-10, size + thickness); ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - thickness, 0, baseY + thickness * 2);
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.5, rgba(c, 0.55)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  grain(ctx, size, r, 0.04);
};

const iridescence: Gen = (ctx, size, palette, r) => {
  const angle = r() * TAU;
  const cx = size / 2, cy = size / 2;
  const stops = palette.slice(1);
  const steps = 360;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
  for (let i = 0; i < steps; i++) {
    const t = i / steps, t2 = (i + 1) / steps;
    const idx = t * stops.length;
    const a = stops[Math.floor(idx) % stops.length];
    const b = stops[(Math.floor(idx) + 1) % stops.length];
    const ft = idx - Math.floor(idx);
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const c = [lerp(ca[0], cb[0], ft), lerp(ca[1], cb[1], ft), lerp(ca[2], cb[2], ft)];
    ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, size, t * TAU, t2 * TAU + 0.01); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  grain(ctx, size, r, 0.05);
};

const starfield: Gen = (ctx, size, palette, r) => {
  const cx = size / 2, cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
  g.addColorStop(0, rgba(hexToRgb(palette[1]), 0.55));
  g.addColorStop(1, rgba(hexToRgb(palette[0]), 1));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = r() * size, y = r() * size, rad = size * (0.2 + r() * 0.3);
    const c = hexToRgb(pick(palette.slice(2), r));
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, rgba(c, 0.4)); gg.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  const stars = 600 + Math.floor(r() * 400);
  for (let i = 0; i < stars; i++) {
    const x = r() * size, y = r() * size, rad = Math.pow(r(), 4) * 4 + 0.3;
    const a = 0.4 + r() * 0.6;
    ctx.fillStyle = `rgba(255,${230 + (r() * 25) | 0},${200 + (r() * 55) | 0},${a})`;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
};

const liquid: Gen = (ctx, size, palette, r) => {
  const c0 = hexToRgb(palette[0]), c1 = hexToRgb(palette[1]);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, rgba(c1, 1)); g.addColorStop(1, rgba(c0, 1));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const n = 5 + Math.floor(r() * 4);
  const blobs = Array.from({ length: n }, () => ({
    x: r() * size, y: r() * size,
    rad: size * (0.12 + r() * 0.22),
    c: hexToRgb(pick(palette.slice(2), r)),
  }));
  for (const b of blobs) {
    const gg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rad);
    gg.addColorStop(0, rgba(b.c, 0.95));
    gg.addColorStop(0.45, rgba(b.c, 0.55));
    gg.addColorStop(1, rgba(b.c, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(b.x, b.y, b.rad, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  grain(ctx, size, r, 0.04);
};

const GENERATORS: Gen[] = [nebula, aurora, iridescence, starfield, liquid];

function generateVision(size = 1024): HTMLCanvasElement {
  const seed = (Math.random() * 1e9) | 0;
  const r = mulberry32(seed);
  const gen = pick(GENERATORS, r);
  const palette = pick(PALETTES, r);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  gen(ctx, size, palette, r);
  return canvas;
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tick, setTick] = useState(0);
  const [canvas, setCanvas] = useState<HTMLCanvasElement>(() => generateVision());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setCanvas(generateVision());
  }, [tick]);

  // Mount the canvas into the DOM (motion.div wraps it)
  const dataUrl = useCallback(() => canvas.toDataURL('image/png'), [canvas])();

  return (
    <div
      className="size-full flex items-center justify-center overflow-hidden"
      style={{ background: '#000000' }}
    >
      <div className="relative w-[70vmin] h-[70vmin]" ref={containerRef}>
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ border: '2px solid rgba(72, 202, 228, 0.35)' }}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={tick}
              src={dataUrl}
              alt="Oracle vision"
              className="size-full object-cover"
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 2.5, ease: 'easeInOut' }}
            />
          </AnimatePresence>
        </div>

        {/* Glass highlight overlay */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.4) 100%)',
          }}
        />

        {/* Animated #48CAE4 cyan glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={{
            boxShadow: [
              '0 0 60px rgba(72,202,228,0.55), inset 0 0 60px rgba(72,202,228,0.25)',
              '0 0 90px rgba(72,202,228,0.85), inset 0 0 90px rgba(72,202,228,0.45)',
              '0 0 60px rgba(72,202,228,0.55), inset 0 0 60px rgba(72,202,228,0.25)',
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}
