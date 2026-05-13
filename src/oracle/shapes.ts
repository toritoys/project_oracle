import { hexToRgb, clamp, mulberry32 } from '../utils';
import type { OracleResponse, ColorPair, ShapeType, ShapeResult } from './types';

const AFFECT_SHAPE: Partial<Record<string, ShapeType>> = {
  longing: 'fibonacci', surrender: 'fibonacci', awe: 'fibonacci',
  desire: 'lissajous', defiance: 'lissajous', hunger: 'lissajous',
  pride: 'rose',
  fear: 'hypocycloid', dread: 'hypocycloid', vertigo: 'hypocycloid', shame: 'hypocycloid',
  grief: 'interference', stillness: 'interference', peace: 'interference',
  anger: 'epitrochoid', fury: 'epitrochoid',
  wonder: 'phyllotaxis', joy: 'phyllotaxis',
  clarity: 'superformula', tension: 'superformula',
  dissolution: 'modular_circle', yearning: 'modular_circle',
};

const ATTRACTOR_SECONDARY: string[] = ['vertigo', 'dissolution'];

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
  const thetaMax = Math.PI * 10 + t * 0.4;
  const rotOffset = t * 0.08;
  const vertices: Array<{ x: number; y: number }> = [];
  let lastX = cx, lastY = cy;

  ctx.beginPath();
  let first = true;
  for (let theta = 0; theta <= thetaMax; theta += 0.04) {
    const r_val = 0.015 * Math.exp(bVal * theta);
    if (r_val > 1.1) break;
    lastX = cx + Math.cos(theta + rotOffset) * r_val * radius;
    lastY = cy + Math.sin(theta + rotOffset) * r_val * radius;
    if (first) { ctx.moveTo(lastX, lastY); first = false; }
    else ctx.lineTo(lastX, lastY);
    if (theta % 0.8 < 0.04) vertices.push({ x: lastX, y: lastY });
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.85})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

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

  return { vertices, traceHead: { x: lastX, y: lastY } };
}

// ─── Lissajous Figure ────────────────────────────────────────────────────────
function drawLissajous(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 1.2);

  const delta = t * 0.35;
  const scaleX = dissolveT > 0 ? (1 - dissolveT * 0.5) : 1;
  const vertices: Array<{ x: number; y: number }> = [];

  ctx.beginPath();
  for (let i = 0; i <= 400; i++) {
    const theta = (i / 400) * Math.PI * 2;
    const x = cx + Math.sin(3 * theta + delta) * radius * 0.72 * scaleX;
    const y = cy + Math.sin(2 * theta) * radius * 0.72;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 40 === 0) vertices.push({ x, y });
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.9})`;
  ctx.lineWidth = 1.5 + response.arousal * 1.5;
  ctx.stroke();

  if (dissolveT > 0.5) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${r},${g},${b},${(dissolveT - 0.5) * 1.5 * 0.7})`;
    ctx.lineWidth = 1;
    ctx.moveTo(cx - radius * 0.7, cy); ctx.lineTo(cx + radius * 0.7, cy);
    ctx.stroke();
  }

  // Trace head orbits the figure
  const tth = (t * 0.7) % (Math.PI * 2);
  const traceHead = {
    x: cx + Math.sin(3 * tth + delta) * radius * 0.72 * scaleX,
    y: cy + Math.sin(2 * tth) * radius * 0.72,
  };
  return { vertices, traceHead };
}

// ─── Rose Curve (Rhodonea) ───────────────────────────────────────────────────
function drawRose(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const [pr, pg, pb] = hexToRgb(colors.primary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const k = Math.floor(3 + response.arousal * 5);
  const bloomProgress = dissolveT > 0 ? 1 : clamp(t * 0.6, 0, 1);
  const vertices: Array<{ x: number; y: number }> = [];

  ctx.beginPath();
  for (let i = 0; i <= 600; i++) {
    const theta = (i / 600) * Math.PI * (k % 2 === 0 ? 4 : 2);
    const petal = Math.floor((theta / Math.PI) * (k / 2));
    const pp = clamp(bloomProgress * k - petal, 0, 1);
    const r_val = Math.cos(k * theta) * radius * 0.8 * pp * (1 - dissolveT * 0.6);
    const x = cx + Math.cos(theta) * r_val;
    const y = cy + Math.sin(theta) * r_val;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 60 === 0 && r_val > 20) vertices.push({ x, y });
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.85 * (1 - dissolveT)})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (dissolveT < 0.5) {
    ctx.beginPath();
    for (let i = 0; i <= 600; i++) {
      const theta = (i / 600) * Math.PI * (k % 2 === 0 ? 4 : 2);
      const r_val = Math.cos(k * theta) * radius * 0.8 * bloomProgress * (1 - dissolveT);
      if (i === 0) ctx.moveTo(cx + Math.cos(theta) * r_val, cy + Math.sin(theta) * r_val);
      else ctx.lineTo(cx + Math.cos(theta) * r_val, cy + Math.sin(theta) * r_val);
    }
    ctx.fillStyle = `rgba(${pr},${pg},${pb},${0.06 * (1 - dissolveT * 2)})`;
    ctx.fill();
  }

  // Trace head: tip of current petal
  const tth = bloomProgress * Math.PI * (k % 2 === 0 ? 4 : 2);
  const tr_val = Math.cos(k * tth) * radius * 0.8 * (1 - dissolveT * 0.6);
  const traceHead = { x: cx + Math.cos(tth) * tr_val, y: cy + Math.sin(tth) * tr_val };
  return { vertices, traceHead };
}

// ─── Hypocycloid / Astroid ────────────────────────────────────────────────────
function drawHypocycloid(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const n = Math.floor(3 + response.certainty * 2);
  const a = radius * 0.85;
  const bVal = a / n;
  const rotSpeed = t * 0.15;
  const pulse = 1 + Math.sin(t * 3.5) * 0.04 * (1 - dissolveT);
  const vertices: Array<{ x: number; y: number }> = [];

  ctx.beginPath();
  for (let i = 0; i <= 500; i++) {
    const theta = (i / 500) * Math.PI * 2 + rotSpeed;
    const x = cx + ((a - bVal) * Math.cos(theta) + bVal * Math.cos((a - bVal) * theta / bVal)) * pulse * (1 - dissolveT * 0.4);
    const y = cy + ((a - bVal) * Math.sin(theta) - bVal * Math.sin((a - bVal) * theta / bVal)) * pulse * (1 - dissolveT * 0.4);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 50 === 0) vertices.push({ x, y });
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.85 * (1 - dissolveT)})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (dissolveT < 0.7 && Math.sin(t * 7) > 0.85) {
    const sparkTheta = (Math.floor(t * 3) % n) * ((Math.PI * 2) / n) + rotSpeed;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(sparkTheta) * a * 0.9, cy + Math.sin(sparkTheta) * a * 0.9, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
    ctx.fill();
  }

  // Trace head orbits at rotSpeed
  const traceTheta = rotSpeed;
  const traceHead = {
    x: cx + ((a - bVal) * Math.cos(traceTheta) + bVal * Math.cos((a - bVal) * traceTheta / bVal)) * pulse * (1 - dissolveT * 0.4),
    y: cy + ((a - bVal) * Math.sin(traceTheta) - bVal * Math.sin((a - bVal) * traceTheta / bVal)) * pulse * (1 - dissolveT * 0.4),
  };
  return { vertices, traceHead };
}

// ─── Interference Pattern (smooth — ImageData pixel fill) ────────────────────
function drawInterference(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, _resp: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 0.7);

  const angle1 = t * 0.18, angle2 = t * 0.11 + Math.PI * 0.7;
  const drift = radius * 0.35;
  const s1x = cx + Math.cos(angle1) * drift;
  const s1y = cy + Math.sin(angle1) * drift;
  const s2x = cx + Math.cos(angle2) * drift;
  const s2y = cy + Math.sin(angle2) * drift;
  const f1 = 0.06, f2 = 0.055, phi = t * 0.8;

  const x0 = Math.floor(cx - radius), y0 = Math.floor(cy - radius);
  const w = Math.ceil(radius * 2), h = Math.ceil(radius * 2);
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const vertices: Array<{ x: number; y: number }> = [];

  const stride = 2;
  for (let row = 0; row < h; row += stride) {
    const wy = y0 + row;
    for (let col = 0; col < w; col += stride) {
      const wx = x0 + col;
      const dx = wx - cx, dy = wy - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      const d1 = Math.sqrt((wx - s1x) * (wx - s1x) + (wy - s1y) * (wy - s1y));
      const d2 = Math.sqrt((wx - s2x) * (wx - s2x) + (wy - s2y) * (wy - s2y));
      const z = Math.sin(d1 * f1 + t) + Math.sin(d2 * f2 + t + phi);
      if (z > 1.1) {
        const intensity = Math.min((z - 1.1) / 0.9 * opacity, 0.75);
        const alpha = Math.round(intensity * 200);
        for (let dr = 0; dr < stride; dr++) for (let dc = 0; dc < stride; dc++) {
          const idx = ((row + dr) * w + (col + dc)) * 4;
          if (idx + 3 < data.length) {
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = alpha;
          }
        }
        if (intensity > 0.5 && Math.random() < 0.004) vertices.push({ x: wx, y: wy });
      }
    }
  }
  ctx.putImageData(img, x0, y0);
  // Trace head: follows source 1's drifting position
  return { vertices, traceHead: { x: s1x, y: s1y } };
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

  const passes = dissolveT > 0 ? Math.floor(3 * (1 - dissolveT)) + 1 : 3;
  for (let pass = 0; pass < passes; pass++) {
    const timeOffset = t * speed - pass * 0.4;
    ctx.beginPath();
    for (let i = 0; i <= 800; i++) {
      const theta = (i / 800) * Math.PI * 6;
      const x = cx + (R + rVal) * Math.cos(theta) - d * Math.cos(((R + rVal) / rVal) * theta + timeOffset);
      const y = cy + (R + rVal) * Math.sin(theta) - d * Math.sin(((R + rVal) / rVal) * theta + timeOffset);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      if (pass === 0 && i % 80 === 0) vertices.push({ x, y });
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - pass / 3) * (1 - dissolveT) * 0.7})`;
    ctx.lineWidth = 1 + pass * 0.3;
    ctx.stroke();
  }

  // Trace head: arm tip at current time
  const traceTheta = ((t * speed * 0.25) % (Math.PI * 6));
  const traceHead = {
    x: cx + (R + rVal) * Math.cos(traceTheta) - d * Math.cos(((R + rVal) / rVal) * traceTheta + t * speed),
    y: cy + (R + rVal) * Math.sin(traceTheta) - d * Math.sin(((R + rVal) / rVal) * traceTheta + t * speed),
  };
  return { vertices, traceHead };
}

// ─── Strange Attractor (Lorenz projected) ────────────────────────────────────
function drawAttractor(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, _r: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const vertices: Array<{ x: number; y: number }> = [];

  const sigma = 10, rho = 28, beta = 8 / 3;
  const dt = 0.008;
  const steps = Math.floor(2000 + t * 300);
  const scale = radius / 28;

  let lx = 0.1, ly = 0, lz = 0;
  const warmup = Math.floor(t * 60) + 200;
  for (let i = 0; i < warmup; i++) {
    const dx = sigma * (ly - lx), dy = lx * (rho - lz) - ly, dz = lx * ly - beta * lz;
    lx += dx * dt; ly += dy * dt; lz += dz * dt;
  }

  ctx.beginPath();
  let lastPx = cx, lastPy = cy;
  let first = true;
  for (let i = 0; i < steps; i++) {
    const dx = sigma * (ly - lx), dy = lx * (rho - lz) - ly, dz = lx * ly - beta * lz;
    lx += dx * dt; ly += dy * dt; lz += dz * dt;
    lastPx = cx + lx * scale;
    lastPy = cy + (lz - rho * 0.7) * scale;
    if (first) { ctx.moveTo(lastPx, lastPy); first = false; }
    else ctx.lineTo(lastPx, lastPy);
    if (i % 200 === 0) vertices.push({ x: lastPx, y: lastPy });
  }
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 0.5);
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.6})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  return { vertices, traceHead: { x: lastPx, y: lastPy } };
}

// ─── Phyllotaxis (golden-angle sunflower) ────────────────────────────────────
function drawPhyllotaxis(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r1, g1, b1] = hexToRgb(colors.secondary);
  const [r2, g2, b2] = hexToRgb(colors.primary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const nMax = Math.floor(100 + response.arousal * 120);
  const c = radius * 0.052;
  const rotOffset = t * 0.08;
  const vertices: Array<{ x: number; y: number }> = [];
  let lastX = cx, lastY = cy;

  for (let i = 1; i <= nMax; i++) {
    const revealProg = clamp(t * 0.7 - i * 0.004, 0, 1);
    if (revealProg <= 0) break;
    const angle = i * goldenAngle + rotOffset;
    const rr = c * Math.sqrt(i);
    if (rr > radius * 0.92) break;
    lastX = cx + Math.cos(angle) * rr;
    lastY = cy + Math.sin(angle) * rr;
    const frac = rr / (radius * 0.92);
    const dotR = (1.5 + Math.sin(i * 0.27 + t * 1.8) * 0.7) * (1 - dissolveT * 0.8);
    ctx.beginPath();
    ctx.arc(lastX, lastY, Math.max(dotR, 0.3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.round(r1*(1-frac)+r2*frac)},${Math.round(g1*(1-frac)+g2*frac)},${Math.round(b1*(1-frac)+b2*frac)},${revealProg*(1-dissolveT)*0.85})`;
    ctx.fill();
    if (i % 25 === 0) vertices.push({ x: lastX, y: lastY });
  }

  return { vertices, traceHead: { x: lastX, y: lastY } };
}

// ─── Superformula (Gielis) ────────────────────────────────────────────────────
function drawSuperformula(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 0.8);

  const rng = mulberry32(Math.round(response.arousal * 7919 + response.valence * 3167 + 42));
  const m = 3 + Math.floor(rng() * 6);
  const n1 = 0.4 + rng() * 2.6, n2 = 0.4 + rng() * 2.6, n3 = 0.4 + rng() * 2.6;

  const rotOffset = t * 0.1;
  const scale = radius * 0.42 * (1 - dissolveT * 0.45);
  const vertices: Array<{ x: number; y: number }> = [];

  ctx.beginPath();
  for (let i = 0; i <= 500; i++) {
    const theta = (i / 500) * Math.PI * 2 + rotOffset;
    const mt4 = m * theta / 4;
    const rr = Math.min(Math.pow(Math.pow(Math.abs(Math.cos(mt4)), n2) + Math.pow(Math.abs(Math.sin(mt4)), n3), -1 / n1), 2.5);
    const x = cx + Math.cos(theta) * rr * scale, y = cy + Math.sin(theta) * rr * scale;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 50 === 0) vertices.push({ x, y });
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.88})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (dissolveT < 0.6) {
    ctx.globalAlpha = opacity * 0.06;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Trace head orbits the outline
  const traceTheta = ((t * 1.2) % (Math.PI * 2)) + rotOffset;
  const tmT4 = m * traceTheta / 4;
  const traceRr = Math.min(Math.pow(Math.pow(Math.abs(Math.cos(tmT4)), n2) + Math.pow(Math.abs(Math.sin(tmT4)), n3), -1 / n1), 2.5);
  const traceHead = { x: cx + Math.cos(traceTheta) * traceRr * scale, y: cy + Math.sin(traceTheta) * traceRr * scale };
  return { vertices, traceHead };
}

// ─── Modular Circle (number theory chord diagram) ────────────────────────────
function drawModularCircle(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const dissolveT = clamp((t - 2) / 2, 0, 1);
  const opacity = dissolveT > 0 ? 1 - dissolveT : Math.min(1, t * 0.65);

  const nOptions = [55, 89, 144];
  const n = nOptions[Math.floor(response.certainty * nOptions.length)] ?? 89;
  const k = 2 + Math.floor(response.arousal * 4);
  const circleR = radius * 0.77 * (1 - dissolveT * 0.3);
  const rotOffset = t * 0.07;
  const revealFrac = clamp(t * 0.55, 0, 1);
  const revealCount = Math.floor(n * revealFrac);
  const vertices: Array<{ x: number; y: number }> = [];

  ctx.beginPath();
  for (let i = 0; i < revealCount; i++) {
    const i2 = (i * k) % n;
    const a1 = (i / n) * Math.PI * 2 + rotOffset;
    const a2 = (i2 / n) * Math.PI * 2 + rotOffset;
    ctx.moveTo(cx + Math.cos(a1) * circleR, cy + Math.sin(a1) * circleR);
    ctx.lineTo(cx + Math.cos(a2) * circleR, cy + Math.sin(a2) * circleR);
    if (i % 12 === 0) vertices.push({ x: cx + Math.cos(a1) * circleR, y: cy + Math.sin(a1) * circleR });
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.22})`;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.35})`;
  ctx.lineWidth = 0.9;
  ctx.stroke();

  for (let i = 0; i < n; i += 2) {
    const angle = (i / n) * Math.PI * 2 + rotOffset;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * circleR, cy + Math.sin(angle) * circleR, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${opacity * 0.55})`;
    ctx.fill();
  }

  // Trace head: current chord endpoint
  const lastI = Math.max(0, revealCount - 1);
  const lastI2 = (lastI * k) % n;
  const lastA2 = (lastI2 / n) * Math.PI * 2 + rotOffset;
  const traceHead = { x: cx + Math.cos(lastA2) * circleR, y: cy + Math.sin(lastA2) * circleR };
  return { vertices, traceHead };
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function drawShape(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse,
  animTime: number, shapeType: ShapeType
): ShapeResult {
  switch (shapeType) {
    case 'fibonacci':     return drawFibonacci(ctx, cx, cy, radius, colors, response, animTime);
    case 'lissajous':     return drawLissajous(ctx, cx, cy, radius, colors, response, animTime);
    case 'rose':          return drawRose(ctx, cx, cy, radius, colors, response, animTime);
    case 'hypocycloid':   return drawHypocycloid(ctx, cx, cy, radius, colors, response, animTime);
    case 'interference':  return drawInterference(ctx, cx, cy, radius, colors, response, animTime);
    case 'epitrochoid':   return drawEpitrochoid(ctx, cx, cy, radius, colors, response, animTime);
    case 'attractor':     return drawAttractor(ctx, cx, cy, radius, colors, response, animTime);
    case 'phyllotaxis':   return drawPhyllotaxis(ctx, cx, cy, radius, colors, response, animTime);
    case 'superformula':  return drawSuperformula(ctx, cx, cy, radius, colors, response, animTime);
    case 'modular_circle':return drawModularCircle(ctx, cx, cy, radius, colors, response, animTime);
  }
}
