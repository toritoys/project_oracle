import { hexToRgb, mulberry32 } from '../utils';
import type { OracleResponse, ColorPair, PatternType } from './types';

export function selectPattern(response: OracleResponse): PatternType {
  const { elemental, certainty } = response;
  if ((elemental === 'earth' || elemental === 'metal') && certainty > 0.5) return 'voronoi';
  if (elemental === 'void' && certainty < 0.3) return 'fractal_dust';
  if ((elemental === 'light' || elemental === 'void') && certainty > 0.6) return 'fibonacci_tiling';
  if ((elemental === 'fire' || elemental === 'shadow') && certainty < 0.4) return 'interference_rings';
  if (elemental === 'water' || elemental === 'air') return 'flow';
  return 'flow';
}

// ─── Voronoi Cells (outline only) ────────────────────────────────────────────
function drawVoronoi(
  ctx: CanvasRenderingContext2D, size: number,
  colors: ColorPair, response: OracleResponse, seed: number
): void {
  const rand = mulberry32(seed);
  const [r, g, b] = hexToRgb(colors.secondary);
  const n = Math.floor(12 + response.arousal * 8); // high arousal = more cells
  const sites: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    sites.push({ x: rand() * size, y: rand() * size });
  }

  const step = 6;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      let d1 = Infinity, d2 = Infinity;
      for (const s of sites) {
        const d = (x - s.x) ** 2 + (y - s.y) ** 2;
        if (d < d1) { d2 = d1; d1 = d; }
        else if (d < d2) { d2 = d; }
      }
      // Draw edge pixels
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      if (edge < 5) {
        ctx.fillStyle = `rgba(${r},${g},${b},${0.4 * (1 - edge / 5)})`;
        ctx.fillRect(x, y, step, step);
      }
    }
  }
}

// ─── Flow Field ───────────────────────────────────────────────────────────────
function drawFlow(
  ctx: CanvasRenderingContext2D, size: number,
  colors: ColorPair, response: OracleResponse, seed: number
): void {
  const rand = mulberry32(seed + 1);
  const [r, g, b] = hexToRgb(colors.secondary);
  const strokeLen = 6 + response.arousal * 14;
  const density = Math.floor(size / 20);

  for (let gy = 0; gy <= density; gy++) {
    for (let gx = 0; gx <= density; gx++) {
      const x = (gx / density) * size;
      const y = (gy / density) * size;
      // Simple value-noise angle field
      const angle = (Math.sin(x * 0.012 + seed * 0.001) + Math.cos(y * 0.01 + seed * 0.002)) * Math.PI;
      const jitterX = (rand() - 0.5) * (size / density);
      const jitterY = (rand() - 0.5) * (size / density);
      const sx = x + jitterX, sy = y + jitterY;
      const ex = sx + Math.cos(angle) * strokeLen;
      const ey = sy + Math.sin(angle) * strokeLen;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}

// ─── Fibonacci Tiling (sunflower) ─────────────────────────────────────────────
function drawFibonacciTiling(
  ctx: CanvasRenderingContext2D, size: number,
  colors: ColorPair, _response: OracleResponse, _seed: number
): void {
  const [r, g, b] = hexToRgb(colors.secondary);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const n = 200;
  const cx = size / 2, cy = size / 2;

  for (let i = 0; i < n; i++) {
    const angle = i * goldenAngle;
    const dist = Math.sqrt(i / n) * size * 0.5;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const dotR = 1.5 + (dist / (size * 0.5)) * 2;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.5 - (dist / (size * 0.5)) * 0.3})`;
    ctx.fill();
  }
}

// ─── Interference Rings ────────────────────────────────────────────────────────
function drawInterferenceRings(
  ctx: CanvasRenderingContext2D, size: number,
  colors: ColorPair, response: OracleResponse, seed: number
): void {
  const rand = mulberry32(seed + 2);
  const [r, g, b] = hexToRgb(colors.secondary);
  const sources = 2 + Math.floor(rand() * 1); // 2-3 sources
  const centers: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < sources; i++) {
    centers.push({
      x: size * (0.25 + rand() * 0.5),
      y: size * (0.25 + rand() * 0.5),
    });
  }

  const rings = 15 + Math.floor(response.arousal * 10);
  for (const c of centers) {
    for (let i = 1; i <= rings; i++) {
      const rVal = (i / rings) * size * 0.7;
      const spacing = 0.6 + (i / rings) * 0.8;
      ctx.beginPath();
      ctx.arc(c.x, c.y, rVal * spacing, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 * (1 - i / rings)})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }
}

// ─── Fractal Dust ──────────────────────────────────────────────────────────────
function drawFractalDust(
  ctx: CanvasRenderingContext2D, size: number,
  colors: ColorPair, _response: OracleResponse, seed: number
): void {
  const rand = mulberry32(seed + 3);
  const [r, g, b] = hexToRgb(colors.secondary);

  function branch(x: number, y: number, angle: number, length: number, depth: number) {
    if (depth <= 0 || length < 2) return;
    const ex = x + Math.cos(angle) * length;
    const ey = y + Math.sin(angle) * length;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = `rgba(${r},${g},${b},${(depth / 6) * 0.25})`;
    ctx.lineWidth = depth * 0.4;
    ctx.stroke();
    if (rand() > 0.3) branch(ex, ey, angle + (rand() - 0.5) * 1.2, length * 0.68, depth - 1);
    if (rand() > 0.5) branch(ex, ey, angle + (rand() - 0.5) * 1.2, length * 0.62, depth - 1);
  }

  const starts = 3;
  for (let i = 0; i < starts; i++) {
    branch(
      rand() * size, rand() * size,
      rand() * Math.PI * 2,
      size * 0.12,
      5
    );
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function drawPattern(
  ctx: CanvasRenderingContext2D, size: number,
  colors: ColorPair, response: OracleResponse, seed: number,
  patternType: PatternType
): void {
  switch (patternType) {
    case 'voronoi':            drawVoronoi(ctx, size, colors, response, seed); break;
    case 'flow':               drawFlow(ctx, size, colors, response, seed); break;
    case 'fibonacci_tiling':   drawFibonacciTiling(ctx, size, colors, response, seed); break;
    case 'interference_rings': drawInterferenceRings(ctx, size, colors, response, seed); break;
    case 'fractal_dust':       drawFractalDust(ctx, size, colors, response, seed); break;
  }
}
