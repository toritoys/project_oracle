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

export function selectShape(response: OracleResponse): ShapeType {
  const p = AFFECT_SHAPE[response.primary_affect];
  if (p) return p;
  const s = AFFECT_SHAPE[response.secondary_affect];
  if (s) return s;
  return 'interference';
}

// ─── Fibonacci Spiral (double helix with oscillating growth) ─────────────────
function drawFibonacci(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const opacity = Math.min(1, t * 0.8);
  const seed = Math.round(response.arousal * 8191 + response.certainty * 5003 + 17) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  const phi = 1.618;
  const bVal = Math.log(phi) / (Math.PI / 2);
  // Oscillation: the growth rate itself oscillates
  const oscAmp = rng() * 0.18;
  const oscFreq = 2 + rng() * 4;
  const rotOffset = t * 0.08;
  const nArms = 1 + Math.floor(rng() * 2); // 1-2 arms
  const vertices: Array<{ x: number; y: number }> = [];

  for (let arm = 0; arm < nArms; arm++) {
    const armOffset = arm * (Math.PI / nArms) * (1.618);
    ctx.beginPath();
    let first = true;
    for (let theta = 0; theta <= Math.PI * 10 + t * 0.4; theta += 0.035) {
      // Modulated growth: r = a·exp(b·(θ + oscAmp·sin(oscFreq·θ)))
      const modTheta = theta + oscAmp * Math.sin(oscFreq * theta);
      const r_val = 0.015 * Math.exp(bVal * modTheta);
      if (r_val > 1.08) break;
      const x = cx + Math.cos(theta + rotOffset + armOffset) * r_val * radius;
      const y = cy + Math.sin(theta + rotOffset + armOffset) * r_val * radius;
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
      if (theta % 0.7 < 0.035) vertices.push({ x, y });
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * (arm === 0 ? 0.85 : 0.4)})`;
    ctx.lineWidth = arm === 0 ? 1.5 : 0.9;
    ctx.stroke();
  }

  // Dashed echo spiral offset by golden ratio
  if (t > 1) {
    ctx.save();
    ctx.setLineDash([3, 9]);
    ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(0.22, (t - 1) * 0.11)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let theta = 0; theta <= Math.PI * 6; theta += 0.06) {
      const r_val = 0.009 * Math.exp(bVal * theta);
      const x = cx + Math.cos(theta + rotOffset + Math.PI * phi) * r_val * radius;
      const y = cy + Math.sin(theta + rotOffset + Math.PI * phi) * r_val * radius;
      if (theta === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const traceTh = (t * 0.55) % 14.0;
  const modTr = traceTh + oscAmp * Math.sin(oscFreq * traceTh);
  const traceR = Math.min(0.015 * Math.exp(bVal * modTr), 1.0);
  return { vertices, traceHead: { x: cx + Math.cos(traceTh + rotOffset) * traceR * radius, y: cy + Math.sin(traceTh + rotOffset) * traceR * radius } };
}

// ─── Lissajous (multi-harmonic with phase modulation) ────────────────────────
function drawLissajous(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const opacity = Math.min(1, t * 1.2);
  const seed = Math.round(response.arousal * 9431 + response.certainty * 6173 + Math.abs(response.valence) * 3847 + 11) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  // Small-integer frequency ratios → beautiful closed/near-closed curves
  const PAIRS: Array<[number, number]> = [[3,2],[5,4],[5,3],[7,4],[7,5],[4,3],[6,5],[7,6],[8,5]];
  const [fa, fb] = PAIRS[Math.floor(rng() * PAIRS.length)];
  const fc = 1 + Math.floor(rng() * 3);
  const fd = 1 + Math.floor(rng() * 3);

  // Primary & additive amplitudes
  const A1 = 0.50 + rng() * 0.20, A2 = 0.08 + rng() * 0.20;
  const B1 = 0.50 + rng() * 0.20, B2 = 0.08 + rng() * 0.20;

  // Phase modulation: angle → angle + depth·sin(modFreq·angle)
  const pmDX = rng() * 0.75, pmFX = 1 + rng() * 5;
  const pmDY = rng() * 0.75, pmFY = 1 + rng() * 5;

  const delta = t * 0.30;
  const nSteps = 1000;
  const RANGE = Math.PI * 4; // integration range
  const vertices: Array<{ x: number; y: number }> = [];

  const evalPt = (theta: number): [number, number] => {
    const px = A1 * Math.sin(fa * theta + pmDX * Math.sin(pmFX * theta) + delta) + A2 * Math.sin(fc * theta);
    const py = B1 * Math.cos(fb * theta + pmDY * Math.cos(pmFY * theta)) + B2 * Math.cos(fd * theta);
    return [cx + px * radius * 0.72, cy + py * radius * 0.72];
  };

  // Soft glow pass
  ctx.save();
  ctx.globalAlpha = opacity * 0.12;
  ctx.beginPath();
  for (let i = 0; i <= nSteps; i++) {
    const [x, y] = evalPt((i / nSteps) * RANGE);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();

  // Main curve
  ctx.beginPath();
  for (let i = 0; i <= nSteps; i++) {
    const [x, y] = evalPt((i / nSteps) * RANGE);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 100 === 0) vertices.push({ x, y });
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.92})`;
  ctx.lineWidth = 1.4 + response.arousal * 1.6;
  ctx.stroke();

  const tth = (t * 0.65) % RANGE;
  const [tx, ty] = evalPt(tth);
  return { vertices, traceHead: { x: tx, y: ty } };
}

// ─── Rose Curve (nested trig modulation) ─────────────────────────────────────
function drawRose(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const [pr, pg, pb] = hexToRgb(colors.primary);
  const seed = Math.round(response.arousal * 7919 + response.certainty * 4337 + Math.abs(response.valence) * 2311 + 77) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  // Primary rose integer
  const k = 2 + Math.floor(rng() * 8);
  // Phase modulation: θ_eff = θ + modDepth·sin(modFreq·θ) → irregular petals
  const modDepth = rng() * 0.55;
  const modFreq = 2 + Math.floor(rng() * 6);
  // Additive harmonic: r = cos(k·θ_eff) + addAmp·cos(addFreq·θ)
  const addAmp = rng() * 0.42;
  const addFreq = 1 + Math.floor(rng() * 8);
  // Amplitude modulation: r *= (1 + amDepth·sin(amFreq·θ))
  const amDepth = rng() * 0.38;
  const amFreq = 1 + Math.floor(rng() * 6);

  const thetaMax = Math.PI * (k % 2 === 0 ? 4 : 2);
  const bloomProgress = clamp(t * 0.6, 0, 1);
  const vertices: Array<{ x: number; y: number }> = [];

  const evalRose = (raw: number): [number, number] => {
    const tmod = raw + modDepth * Math.sin(modFreq * raw);
    const rv = (Math.cos(k * tmod) + addAmp * Math.cos(addFreq * raw))
              * (1 + amDepth * Math.sin(amFreq * raw))
              * radius * 0.82 * bloomProgress;
    return [cx + Math.cos(raw) * rv, cy + Math.sin(raw) * rv];
  };

  // Glow
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.beginPath();
  for (let i = 0; i <= 600; i++) {
    const [x, y] = evalRose((i / 600) * thetaMax);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgb(${r},${g},${b})`; ctx.lineWidth = 7; ctx.stroke();
  ctx.restore();

  // Fill
  ctx.beginPath();
  for (let i = 0; i <= 600; i++) {
    const [x, y] = evalRose((i / 600) * thetaMax);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.fillStyle = `rgba(${pr},${pg},${pb},0.05)`; ctx.fill();

  // Outline
  ctx.beginPath();
  for (let i = 0; i <= 600; i++) {
    const theta = (i / 600) * thetaMax;
    const [x, y] = evalRose(theta);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 60 === 0) vertices.push({ x, y });
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},0.88)`; ctx.lineWidth = 1.5; ctx.stroke();

  const tthLoop = (t * 0.55) % thetaMax;
  const [tx, ty] = evalRose(tthLoop);
  return { vertices, traceHead: { x: tx, y: ty } };
}

// ─── Hypocycloid (non-integer ratio with phase-modulated cusps) ───────────────
function drawHypocycloid(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const seed = Math.round(response.certainty * 9001 + response.arousal * 6007 + 33) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  // Non-integer ratio gives open spirograph that never repeats (or repeats slowly)
  const nInt = 3 + Math.floor(rng() * 4); // integer part
  const nFrac = rng() < 0.4 ? 0 : (rng() < 0.5 ? 0.5 : (rng() < 0.5 ? 0.333 : 0.25)); // fractional part
  const n = nInt + nFrac;
  const a = radius * 0.88;
  const bVal = a / n;
  const rotSpeed = t * 0.15;
  const pulse = 1 + Math.sin(t * 3.5) * 0.04;

  // Phase modulation of inner roll: adds wavy cusps
  const pmDepth = rng() * 0.35;
  const pmFreq = 2 + Math.floor(rng() * 4);

  // Number of loops needed to close (for non-int ratios, use a fixed large range)
  const loops = nFrac === 0 ? 1 : (nFrac === 0.5 ? 2 : (nFrac === 0.333 ? 3 : 4));
  const nSteps = 600;
  const vertices: Array<{ x: number; y: number }> = [];

  const evalHypo = (theta: number): [number, number] => {
    const innerPhase = (a - bVal) * theta / bVal + pmDepth * Math.sin(pmFreq * theta);
    const x = cx + ((a - bVal) * Math.cos(theta) + bVal * Math.cos(innerPhase)) * pulse;
    const y = cy + ((a - bVal) * Math.sin(theta) - bVal * Math.sin(innerPhase)) * pulse;
    return [x, y];
  };

  ctx.beginPath();
  for (let i = 0; i <= nSteps; i++) {
    const theta = (i / nSteps) * Math.PI * 2 * loops + rotSpeed;
    const [x, y] = evalHypo(theta);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (i % 60 === 0) vertices.push({ x, y });
  }
  if (nFrac === 0) ctx.closePath();
  ctx.strokeStyle = `rgba(${r},${g},${b},0.88)`; ctx.lineWidth = 1.5; ctx.stroke();

  const traceTheta = rotSpeed;
  const [tx, ty] = evalHypo(traceTheta);
  return { vertices, traceHead: { x: tx, y: ty } };
}

// ─── Interference (3 moving sources, nonlinear combination) ──────────────────
function drawInterference(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const opacity = Math.min(1, t * 0.7);
  const seed = Math.round(response.valence * 5039 + response.arousal * 3571 + 99) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  const drift = radius * 0.38;
  // Three sources with independent drift speeds
  const sources = Array.from({ length: 3 }, (_, i) => ({
    angle: t * (0.12 + i * 0.06 + rng() * 0.04) + rng() * Math.PI * 2,
    freq: 0.045 + rng() * 0.03,
    phase: rng() * Math.PI * 2,
  }));

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

      let z = 0;
      for (const src of sources) {
        const sx = cx + Math.cos(src.angle) * drift;
        const sy = cy + Math.sin(src.angle) * drift;
        const d = Math.sqrt((wx - sx) ** 2 + (wy - sy) ** 2);
        z += Math.sin(d * src.freq + t + src.phase);
      }
      // Nonlinear: use product of two pairs as extra term
      const d01 = Math.sqrt((wx - cx - Math.cos(sources[0].angle) * drift) ** 2 + (wy - cy - Math.sin(sources[0].angle) * drift) ** 2);
      const d12 = Math.sqrt((wx - cx - Math.cos(sources[1].angle) * drift) ** 2 + (wy - cy - Math.sin(sources[1].angle) * drift) ** 2);
      z += 0.35 * Math.sin(d01 * sources[0].freq + t) * Math.cos(d12 * sources[1].freq + t * 0.7);

      if (z > 1.2) {
        const intensity = Math.min((z - 1.2) / 1.5 * opacity, 0.8);
        const alpha = Math.round(intensity * 210);
        for (let dr = 0; dr < stride; dr++) for (let dc = 0; dc < stride; dc++) {
          const idx = ((row + dr) * w + (col + dc)) * 4;
          if (idx + 3 < data.length) {
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = alpha;
          }
        }
        if (intensity > 0.5 && Math.random() < 0.003) vertices.push({ x: wx, y: wy });
      }
    }
  }
  ctx.putImageData(img, x0, y0);
  const s0 = sources[0];
  return { vertices, traceHead: { x: cx + Math.cos(s0.angle) * drift, y: cy + Math.sin(s0.angle) * drift } };
}

// ─── Epitrochoid (double arm with phase-modulated lengths) ────────────────────
function drawEpitrochoid(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const seed = Math.round(response.arousal * 8677 + response.certainty * 5431 + Math.abs(response.valence) * 2999 + 55) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  const R = radius * (0.42 + rng() * 0.15);
  const rVals = [R * (0.18 + rng() * 0.20), R * (0.08 + rng() * 0.14)]; // two rolling radii
  const dVals = rVals.map(rv => rv * (0.6 + rng() * 0.8));
  // Phase modulation depths for each arm
  const pmDepths = [rng() * 0.55, rng() * 0.40];
  const pmFreqs = [2 + Math.floor(rng() * 5), 3 + Math.floor(rng() * 4)];
  const speed = 1.4 + response.arousal * 2.2;
  const vertices: Array<{ x: number; y: number }> = [];

  const evalEpi = (arm: number, theta: number): [number, number] => {
    const rv = rVals[arm], d = dVals[arm];
    const ratio = (R + rv) / rv;
    const phase = ratio * theta + t * speed + pmDepths[arm] * Math.sin(pmFreqs[arm] * theta);
    return [
      cx + (R + rv) * Math.cos(theta) - d * Math.cos(phase),
      cy + (R + rv) * Math.sin(theta) - d * Math.sin(phase),
    ];
  };

  // Draw both arms
  for (let arm = 0; arm < 2; arm++) {
    const opacityArm = arm === 0 ? 0.75 : 0.38;
    ctx.beginPath();
    for (let i = 0; i <= 900; i++) {
      const theta = (i / 900) * Math.PI * 6;
      const [x, y] = evalEpi(arm, theta);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      if (arm === 0 && i % 90 === 0) vertices.push({ x, y });
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${opacityArm})`;
    ctx.lineWidth = arm === 0 ? 1.4 : 0.8;
    ctx.stroke();
  }

  const traceTheta = ((t * speed * 0.22) % (Math.PI * 6));
  const [tx, ty] = evalEpi(0, traceTheta);
  return { vertices, traceHead: { x: tx, y: ty } };
}

// ─── Strange Attractor (Dadras system for more complex shape than Lorenz) ─────
function drawAttractor(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const vertices: Array<{ x: number; y: number }> = [];
  const seed = Math.round(response.arousal * 6143 + response.certainty * 4093 + 7) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  // Dadras system: dx = y - a*x + b*y*z, dy = c*y - x*z + z, dz = d*x*y - e*z
  const a = 3.0, b_d = 2.7 + rng() * 0.6, c_d = 1.7, d_d = 2.0, e_d = 9.0;
  const dt = 0.006;
  const steps = Math.floor(2200 + t * 350);
  const scale = radius / 16;

  let lx = 0.1, ly = 0, lz = 0;
  const warmup = Math.floor(t * 55) + 180;
  for (let i = 0; i < warmup; i++) {
    const dx = ly - a * lx + b_d * ly * lz;
    const dy = c_d * ly - lx * lz + lz;
    const dz = d_d * lx * ly - e_d * lz;
    lx += dx * dt; ly += dy * dt; lz += dz * dt;
  }

  ctx.beginPath();
  let lastPx = cx, lastPy = cy, first = true;
  for (let i = 0; i < steps; i++) {
    const dx = ly - a * lx + b_d * ly * lz;
    const dy = c_d * ly - lx * lz + lz;
    const dz = d_d * lx * ly - e_d * lz;
    lx += dx * dt; ly += dy * dt; lz += dz * dt;
    lastPx = cx + lx * scale; lastPy = cy + ly * scale;
    if (first) { ctx.moveTo(lastPx, lastPy); first = false; }
    else ctx.lineTo(lastPx, lastPy);
    if (i % 220 === 0) vertices.push({ x: lastPx, y: lastPy });
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(1, t * 0.5) * 0.65})`; ctx.lineWidth = 0.8; ctx.stroke();
  return { vertices, traceHead: { x: lastPx, y: lastPy } };
}

// ─── Phyllotaxis (golden angle with radial oscillation) ──────────────────────
function drawPhyllotaxis(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r1, g1, b1] = hexToRgb(colors.secondary);
  const [r2, g2, b2] = hexToRgb(colors.primary);
  const seed = Math.round(response.arousal * 7523 + response.certainty * 3761 + 29) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const nMax = Math.floor(100 + response.arousal * 130);
  const c = radius * 0.052;
  const rotOffset = t * 0.08;
  // Radial oscillation: rr = c·sqrt(i) + oscAmp·sin(oscFreq·i)
  const oscAmp = rng() * 0.28 * radius;
  const oscFreq = rng() * 0.15 + 0.05;
  // Angle jitter: angle = i·goldenAngle + jitterAmp·sin(jitterFreq·i)
  const jAmp = rng() * 0.4;
  const jFreq = rng() * 0.2 + 0.05;
  const vertices: Array<{ x: number; y: number }> = [];
  let lastX = cx, lastY = cy;

  for (let i = 1; i <= nMax; i++) {
    const revealProg = clamp(t * 0.7 - i * 0.004, 0, 1);
    if (revealProg <= 0) break;
    const angle = i * goldenAngle + jAmp * Math.sin(jFreq * i) + rotOffset;
    const rr = c * Math.sqrt(i) + oscAmp * Math.sin(oscFreq * i);
    if (rr > radius * 0.94 || rr < 0) break;
    lastX = cx + Math.cos(angle) * rr; lastY = cy + Math.sin(angle) * rr;
    const frac = rr / (radius * 0.94);
    const dotR = (1.4 + Math.sin(i * 0.27 + t * 1.8) * 0.8);
    ctx.beginPath();
    ctx.arc(lastX, lastY, Math.max(dotR, 0.3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.round(r1*(1-frac)+r2*frac)},${Math.round(g1*(1-frac)+g2*frac)},${Math.round(b1*(1-frac)+b2*frac)},${revealProg*0.88})`;
    ctx.fill();
    if (i % 25 === 0) vertices.push({ x: lastX, y: lastY });
  }
  return { vertices, traceHead: { x: lastX, y: lastY } };
}

// ─── Superformula (dual-layer Gielis) ────────────────────────────────────────
function drawSuperformula(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const opacity = Math.min(1, t * 0.8);
  const seed = Math.round(response.arousal * 7919 + response.valence * 3167 + response.certainty * 1009 + 42) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  const sf = (m: number, n1: number, n2: number, n3: number, theta: number) => {
    const mt4 = m * theta / 4;
    const val = Math.pow(Math.abs(Math.cos(mt4)), n2) + Math.pow(Math.abs(Math.sin(mt4)), n3);
    return val === 0 ? 0 : Math.min(Math.pow(val, -1 / n1), 2.8);
  };

  // Layer 1
  const m1 = 3 + Math.floor(rng() * 8);
  const n11 = 0.25 + rng() * 3.2, n12 = 0.25 + rng() * 3.2, n13 = 0.25 + rng() * 3.2;
  // Layer 2 — different symmetry
  const m2 = m1 + 1 + Math.floor(rng() * 5);
  const n21 = 0.25 + rng() * 3.2, n22 = 0.25 + rng() * 3.2, n23 = 0.25 + rng() * 3.2;
  const blend = 0.15 + rng() * 0.40; // layer 2 contribution

  const rotOffset = t * 0.10;
  const scale = radius * 0.40;
  const vertices: Array<{ x: number; y: number }> = [];

  const evalSf = (theta: number): [number, number] => {
    const rr = sf(m1, n11, n12, n13, theta) * scale + blend * sf(m2, n21, n22, n23, theta + Math.PI / m2) * scale;
    return [cx + Math.cos(theta) * rr, cy + Math.sin(theta) * rr];
  };

  // Glow
  ctx.save(); ctx.globalAlpha = opacity * 0.10;
  ctx.beginPath();
  for (let i = 0; i <= 700; i++) {
    const [x, y] = evalSf((i / 700) * Math.PI * 2 + rotOffset);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.strokeStyle = `rgb(${r},${g},${b})`; ctx.lineWidth = 7; ctx.stroke();
  ctx.restore();

  // Fill
  ctx.beginPath();
  for (let i = 0; i <= 700; i++) {
    const [x, y] = evalSf((i / 700) * Math.PI * 2 + rotOffset);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.globalAlpha = opacity * 0.07; ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.90})`; ctx.lineWidth = 1.5; ctx.stroke();

  for (let i = 0; i <= 700; i += 70) {
    const [x, y] = evalSf((i / 700) * Math.PI * 2 + rotOffset);
    vertices.push({ x, y });
  }

  const traceTheta = ((t * 1.2) % (Math.PI * 2)) + rotOffset;
  const [tx, ty] = evalSf(traceTheta);
  return { vertices, traceHead: { x: tx, y: ty } };
}

// ─── Modular Circle (two layered chord systems) ──────────────────────────────
function drawModularCircle(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse, t: number
): ShapeResult {
  const [r, g, b] = hexToRgb(colors.secondary);
  const opacity = Math.min(1, t * 0.65);
  const seed = Math.round(response.certainty * 8887 + response.arousal * 5309 + 13) + Math.round((response.syllableTotal ?? 0) * 73);
  const rng = mulberry32(seed);

  const nOptions = [55, 89, 144];
  const n = nOptions[Math.floor(rng() * nOptions.length)];
  // Two different multipliers — creates two overlapping chord systems
  const k1 = 2 + Math.floor(rng() * 5);
  const k2 = k1 + 1 + Math.floor(rng() * 4);
  const circleR = radius * 0.78;
  const rotOffset = t * 0.07;
  const revealFrac = clamp(t * 0.55, 0, 1);
  const revealCount = Math.floor(n * revealFrac);
  const vertices: Array<{ x: number; y: number }> = [];

  // System 1 — stronger
  ctx.beginPath();
  for (let i = 0; i < revealCount; i++) {
    const i2 = (i * k1) % n;
    const a1 = (i / n) * Math.PI * 2 + rotOffset;
    const a2 = (i2 / n) * Math.PI * 2 + rotOffset;
    ctx.moveTo(cx + Math.cos(a1) * circleR, cy + Math.sin(a1) * circleR);
    ctx.lineTo(cx + Math.cos(a2) * circleR, cy + Math.sin(a2) * circleR);
    if (i % 12 === 0) vertices.push({ x: cx + Math.cos(a1) * circleR, y: cy + Math.sin(a1) * circleR });
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.22})`; ctx.lineWidth = 0.6; ctx.stroke();

  // System 2 — subtler, offset rotation
  ctx.beginPath();
  for (let i = 0; i < revealCount; i++) {
    const i2 = (i * k2) % n;
    const a1 = (i / n) * Math.PI * 2 + rotOffset + t * 0.04;
    const a2 = (i2 / n) * Math.PI * 2 + rotOffset + t * 0.04;
    ctx.moveTo(cx + Math.cos(a1) * circleR * 0.92, cy + Math.sin(a1) * circleR * 0.92);
    ctx.lineTo(cx + Math.cos(a2) * circleR * 0.92, cy + Math.sin(a2) * circleR * 0.92);
  }
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.12})`; ctx.lineWidth = 0.5; ctx.stroke();

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * 0.38})`; ctx.lineWidth = 0.9; ctx.stroke();

  // Ring dots
  for (let i = 0; i < n; i += 2) {
    const angle = (i / n) * Math.PI * 2 + rotOffset;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * circleR, cy + Math.sin(angle) * circleR, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${opacity * 0.55})`; ctx.fill();
  }

  const loopI = Math.floor((t * 25) % n);
  const loopI2 = (loopI * k1) % n;
  const loopA2 = (loopI2 / n) * Math.PI * 2 + rotOffset;
  return { vertices, traceHead: { x: cx + Math.cos(loopA2) * circleR, y: cy + Math.sin(loopA2) * circleR } };
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function drawShape(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number,
  colors: ColorPair, response: OracleResponse,
  animTime: number, shapeType: ShapeType
): ShapeResult {
  switch (shapeType) {
    case 'fibonacci':      return drawFibonacci(ctx, cx, cy, radius, colors, response, animTime);
    case 'lissajous':      return drawLissajous(ctx, cx, cy, radius, colors, response, animTime);
    case 'rose':           return drawRose(ctx, cx, cy, radius, colors, response, animTime);
    case 'hypocycloid':    return drawHypocycloid(ctx, cx, cy, radius, colors, response, animTime);
    case 'interference':   return drawInterference(ctx, cx, cy, radius, colors, response, animTime);
    case 'epitrochoid':    return drawEpitrochoid(ctx, cx, cy, radius, colors, response, animTime);
    case 'attractor':      return drawAttractor(ctx, cx, cy, radius, colors, response, animTime);
    case 'phyllotaxis':    return drawPhyllotaxis(ctx, cx, cy, radius, colors, response, animTime);
    case 'superformula':   return drawSuperformula(ctx, cx, cy, radius, colors, response, animTime);
    case 'modular_circle': return drawModularCircle(ctx, cx, cy, radius, colors, response, animTime);
  }
}
