import { hexToRgb, clamp } from '../utils';
import type { OracleResponse, ColorPair, ShapeType, ShapeResult } from './types';

// Shape selection by affect + archetypal (scored)
const AFFECT_SHAPE: Partial<Record<string, ShapeType>> = {
  longing: 'fibonacci', yearning: 'fibonacci', surrender: 'fibonacci', awe: 'fibonacci',
  tension: 'lissajous', desire: 'lissajous', defiance: 'lissajous', hunger: 'lissajous',
  joy: 'rose', wonder: 'rose', pride: 'rose', clarity: 'rose',
  fear: 'hypocycloid', dread: 'hypocycloid', vertigo: 'hypocycloid', shame: 'hypocycloid',
  grief: 'interference', dissolution: 'interference', stillness: 'interference', peace: 'interference',
  anger: 'epitrochoid', fury: 'epitrochoid',
};

// Attractor takes over for secondary affects that carry chaos
const ATTRACTOR_SECONDARY: string[] = ['yearning', 'vertigo', 'dissolution'];

export function selectShape(response: OracleResponse): ShapeType {
  const p = AFFECT_SHAPE[response.primary_affect];
  if (p) return p;
  const s = AFFECT_SHAPE[response.secondary_affect];
  if (s) {
    if (ATTRACTOR_SECONDARY.includes(response.secondary_affect)) return 'attractor';
    return s;
  }
  return 'interference';
}

// ─── Fibonacci Spiral ───────────────────────────────────────────────────────
function drawFibonacci(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, _r: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 0.8);

  const phi = 1.618;
  const bVal = Math.log(phi) / (Math.PI / 2);
  const vertices: Array<{ x: number; y: number }> = [];

  ctx.beginPath();
  const thetaMax = Math.PI * 10 + t * 0.4; // slowly rotates
  const rotOffset = t * 0.08;
  let first = true;

  for (let theta = 0; theta <= thetaMax; theta += 0.04) {
    const r_val = 0.015 * Math.exp(bVal * theta);
    if (r_val > 1.1) break;
    const x = cx + Math.cos(theta + rotOffset) * r_val * radius;
    const y = cy + Math.sin(theta + rotOffset) * r_val * radius;
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
    if (theta % 0.8 < 0.04) vertices.push({ x, y });
  }

  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.85})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ghost golden ratio curve fading in
  if (t > 1) {
    ctx.beginPath();
    ctx.setLineDash([3, 8]);
    ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(0.25, (t - 1) * 0.12) * (1 - dissolveT)})`;
    ctx.lineWidth = 0.8;
    for (let theta = 0; theta <= Math.PI * 6; theta += 0.06) {
      const r_val = 0.009 * Math.exp(bVal * theta);
      const x = cx + Math.cos(theta + rotOffset + Math.PI) * r_val * radius;
      const y = cy + Math.sin(theta + rotOffset + Math.PI) * r_val * radius;
      if (theta === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  return { vertices };
}

// ─── Lissajous Figure ────────────────────────────────────────────────────────
function drawLissajous(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 1.2);

  // Phase shift breathes over time — figure-8 slowly inverts
  const delta = t * 0.35;
  const scaleX = dissolveT > 0 ? (1 - dissolveT * 0.5) : 1;
  const vertices: Array<{ x: number; y: number }> = [];

  ctx.beginPath();
  const steps = 400;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const x = cx + Math.sin(3 * theta + delta) * radius * 0.72 * scaleX;
    const y = cy + Math.sin(2 * theta) * radius * 0.72;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 40 === 0) vertices.push({ x, y });
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.9})`;
  ctx.lineWidth = 1.5 + response.arousal * 1.5;
  ctx.stroke();

  // Near-collapse: collapse to a line at high dissolve
  if (dissolveT > 0.5) {
    ctx.beginPath();
    const lineOpacity = (dissolveT - 0.5) * 1.5;
    ctx.strokeStyle = `rgba(${r},${g},${b},${lineOpacity * 0.7})`;
    ctx.lineWidth = 1;
    ctx.moveTo(cx - radius * 0.7, cy);
    ctx.lineTo(cx + radius * 0.7, cy);
    ctx.stroke();
  }

  return { vertices };
}

// ─── Rose Curve (Rhodonea) ───────────────────────────────────────────────────
function drawRose(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const [pr, pg, pb] = hexToRgb(colors.primary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const k = Math.floor(3 + response.arousal * 5); // 3–8 petals
  const vertices: Array<{ x: number; y: number }> = [];

  // Petals bloom sequentially
  const bloomProgress = dissolveT > 0 ? 1 : clamp(t * 0.6, 0, 1);

  ctx.beginPath();
  const steps = 600;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * (k % 2 === 0 ? 4 : 2);
    const petal = Math.floor((theta / Math.PI) * (k / 2));
    const petalProgress = clamp(bloomProgress * k - petal, 0, 1);
    const r_val = Math.cos(k * theta) * radius * 0.8 * petalProgress * (1 - dissolveT * 0.6);
    const x = cx + Math.cos(theta) * r_val;
    const y = cy + Math.sin(theta) * r_val;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 60 === 0 && r_val > 20) vertices.push({ x, y });
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.85 * (1 - dissolveT)})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Soft petal fill
  if (dissolveT < 0.5) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * (k % 2 === 0 ? 4 : 2);
      const r_val = Math.cos(k * theta) * radius * 0.8 * bloomProgress * (1 - dissolveT);
      const x = cx + Math.cos(theta) * r_val;
      const y = cy + Math.sin(theta) * r_val;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.fillStyle = `rgba(${pr},${pg},${pb},${0.06 * (1 - dissolveT * 2)})`;
    ctx.fill();
  }

  return { vertices };
}

// ─── Hypocycloid / Astroid ────────────────────────────────────────────────────
function drawHypocycloid(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const n = Math.floor(3 + response.certainty * 2); // 3–5 cusps
  const a = radius * 0.85;
  const bVal = a / n;
  const rotSpeed = t * 0.15;
  const vertices: Array<{ x: number; y: number }> = [];

  // Rhythmic cusp spike (held-breath pulse)
  const pulse = 1 + Math.sin(t * 3.5) * 0.04 * (1 - dissolveT);

  ctx.beginPath();
  const steps = 500;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2 + rotSpeed;
    const x = cx + ((a - bVal) * Math.cos(theta) + bVal * Math.cos((a - bVal) * theta / bVal)) * pulse * (1 - dissolveT * 0.4);
    const y = cy + ((a - bVal) * Math.sin(theta) - bVal * Math.sin((a - bVal) * theta / bVal)) * pulse * (1 - dissolveT * 0.4);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 50 === 0) vertices.push({ x, y });
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.85 * (1 - dissolveT)})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Occasional cusp sparks — tiny smoke-puff dots
  if (dissolveT < 0.7 && Math.sin(t * 7) > 0.85) {
    const sparkTheta = (Math.floor(t * 3) % n) * ((Math.PI * 2) / n) + rotSpeed;
    const sx = cx + Math.cos(sparkTheta) * a * 0.9;
    const sy = cy + Math.sin(sparkTheta) * a * 0.9;
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
    ctx.fill();
  }

  return { vertices };
}

// ─── Interference Pattern ────────────────────────────────────────────────────
function drawInterference(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, _r: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 0.7);

  // Two sources drift slowly
  const angle1 = t * 0.18;
  const angle2 = t * 0.11 + Math.PI * 0.7;
  const dist = radius * 0.35;
  const s1x = cx + Math.cos(angle1) * dist;
  const s1y = cy + Math.sin(angle1) * dist;
  const s2x = cx + Math.cos(angle2) * dist;
  const s2y = cy + Math.sin(angle2) * dist;

  const f1 = 0.06, f2 = 0.055, phi = t * 0.8;
  const step = 10;
  const vertices: Array<{ x: number; y: number }> = [];

  for (let py = cy - radius; py < cy + radius; py += step) {
    for (let px = cx - radius; px < cx + radius; px += step) {
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      const d1 = Math.hypot(px - s1x, py - s1y);
      const d2 = Math.hypot(px - s2x, py - s2y);
      const z = Math.sin(d1 * f1 + t) + Math.sin(d2 * f2 + t + phi);
      if (z > 1.2) {
        const intensity = (z - 1.2) / 0.8;
        ctx.fillStyle = `rgba(${r},${g},${b},${intensity * opacity * 0.5})`;
        ctx.fillRect(px - step / 2, py - step / 2, step, step);
        if (Math.random() < 0.08) vertices.push({ x: px, y: py });
      }
    }
  }

  return { vertices };
}

// ─── Epitrochoid (Spirograph) ─────────────────────────────────────────────────
function drawEpitrochoid(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);

  const R = radius * 0.55;
  const rVal = R / 3;
  const d = rVal * (0.9 + response.arousal * 0.2);
  const speed = 1.5 + response.arousal * 2;
  const vertices: Array<{ x: number; y: number }> = [];

  // Trail — draw multiple passes with decreasing opacity (dissolves outer edge first)
  const passes = dissolveT > 0 ? Math.floor(3 * (1 - dissolveT)) + 1 : 3;
  for (let pass = 0; pass < passes; pass++) {
    const timeOffset = t * speed - pass * 0.4;
    const passOpacity = (1 - pass / 3) * (1 - dissolveT);
    ctx.beginPath();
    const steps = 800;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 6;
      const x = cx + (R + rVal) * Math.cos(theta) - d * Math.cos(((R + rVal) / rVal) * theta + timeOffset);
      const y = cy + (R + rVal) * Math.sin(theta) - d * Math.sin(((R + rVal) / rVal) * theta + timeOffset);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      if (pass === 0 && i % 80 === 0) vertices.push({ x, y });
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${passOpacity * 0.7})`;
    ctx.lineWidth = 1 + pass * 0.3;
    ctx.stroke();
  }

  return { vertices };
}

// ─── Strange Attractor (Lorenz projected) ────────────────────────────────────
function drawAttractor(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, _r: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const vertices: Array<{ x: number; y: number }> = [];

  // Lorenz parameters
  const sigma = 10, rho = 28, beta = 8 / 3;
  const dt = 0.008;
  const steps = Math.floor(2000 + t * 300);
  const scale = radius / 28;

  let lx = 0.1, ly = 0, lz = 0;
  // Advance to t-dependent starting state for animation continuity
  const warmup = Math.floor(t * 60) + 200;
  for (let i = 0; i < warmup; i++) {
    const dx = sigma * (ly - lx);
    const dy = lx * (rho - lz) - ly;
    const dz = lx * ly - beta * lz;
    lx += dx * dt; ly += dy * dt; lz += dz * dt;
  }

  ctx.beginPath();
  let first = true;
  for (let i = 0; i < steps; i++) {
    const dx = sigma * (ly - lx);
    const dy = lx * (rho - lz) - ly;
    const dz = lx * ly - beta * lz;
    lx += dx * dt; ly += dy * dt; lz += dz * dt;

    const px = cx + lx * scale;
    const py = cy + (lz - rho * 0.7) * scale;

    if (first) { ctx.moveTo(px, py); first = false; }
    else ctx.lineTo(px, py);

    if (i % 200 === 0) vertices.push({ x: px, y: py });
  }
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 0.5);
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.6})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  return { vertices };
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function drawShape(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number,
  colors: ColorPair,
  response: OracleResponse,
  animTime: number,
  shapeType: ShapeType
): ShapeResult {
  switch (shapeType) {
    case 'fibonacci':    return drawFibonacci(ctx, cx, cy, radius, colors, response, animTime);
    case 'lissajous':    return drawLissajous(ctx, cx, cy, radius, colors, response, animTime);
    case 'rose':         return drawRose(ctx, cx, cy, radius, colors, response, animTime);
    case 'hypocycloid':  return drawHypocycloid(ctx, cx, cy, radius, colors, response, animTime);
    case 'interference': return drawInterference(ctx, cx, cy, radius, colors, response, animTime);
    case 'epitrochoid':  return drawEpitrochoid(ctx, cx, cy, radius, colors, response, animTime);
    case 'attractor':    return drawAttractor(ctx, cx, cy, radius, colors, response, animTime);
  }
}
