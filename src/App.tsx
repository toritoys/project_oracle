import { useState, useEffect, useRef, useCallback } from 'react';
import { useTweaks, TweaksPanel, TweakSection, TweakSelect, TweakToggle, TweakSlider, TweakColor } from './tweaks-panel';
import { GENERATORS, generateVision, Vision } from './visions';
import { queryOracle, getGroqKey } from './oracle/api';
import { deriveColors } from './oracle/colorEngine';
import { drawShape, selectShape } from './oracle/shapes';
import { drawPattern, selectPattern } from './oracle/patterns';
import { QuestionInput } from './components/QuestionInput';
import { GroqSettings } from './components/GroqSettings';
import { hexToRgb, withAlpha } from './utils';
import type { PhaseState, Particle, OracleResponse, ColorPair, ShapeType, PatternType } from './oracle/types';

const TWEAK_DEFAULTS = {
  glowColor: '#48CAE4',
  generator: 'smoke',
  barrelDistortion: true,
  showCaption: true,
  smokeDensity: 1.0,
  trailLength: 0.6,
};

function generateOracleBackground(colors: ColorPair, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const [r, g, b] = hexToRgb(colors.primary);
  const [r2, g2, b2] = hexToRgb(colors.secondary);
  // Deep background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  // Primary color atmosphere
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.2)`);
  grad.addColorStop(0.8, `rgba(${r2},${g2},${b2},0.08)`);
  grad.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

interface OracleState {
  response: OracleResponse;
  colors: ColorPair;
  shapeType: ShapeType;
  patternType: PatternType;
  shapeStartTime: number;
  wordParticlesEmitted: boolean;
  dissolveParticlesEmitted: boolean;
  seed: number;
}

export default function OracleApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const [currentVision, setCurrentVision] = useState<Vision>(() =>
    generateVision({ size: 900, generatorId: TWEAK_DEFAULTS.generator !== 'random' ? TWEAK_DEFAULTS.generator : null })
  );
  const [ballOpacity, setBallOpacity] = useState(1);
  const [phase, setPhase] = useState<PhaseState>('idle');
  const phaseRef = useRef<PhaseState>('idle');
  const [hintFading, setHintFading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [groqKeyPresent, setGroqKeyPresent] = useState(() => !!getGroqKey());

  const ballClipRef = useRef<HTMLDivElement>(null);
  const ballWrapRef = useRef<HTMLDivElement>(null);
  const smokeRef = useRef<HTMLCanvasElement>(null);
  const shapeCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    mx: window.innerWidth / 2, my: window.innerHeight / 2,
    cx: window.innerWidth / 2, cy: window.innerHeight / 2,
    overBall: false, overInput: false,
    pressing: false,
    particles: [] as Particle[],
    fillOpacity: 0,
    fillColor: [120, 120, 140] as [number, number, number],
  });

  const oracleRef = useRef<OracleState | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const defaultGlowRef = useRef(TWEAK_DEFAULTS.glowColor);
  const releaseSmokeRef = useRef<() => void>(() => {});

  // ── Sync phase ref ────────────────────────────────────────────────────────
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Mount vision canvas into ball ─────────────────────────────────────────
  useEffect(() => {
    const clip = ballClipRef.current;
    if (!clip || !currentVision) return;
    const c = currentVision.canvas;
    if (c.parentNode !== clip) {
      clip.querySelectorAll('canvas.vision').forEach(n => n.remove());
      c.classList.add('vision', 'crystallize');
      if (!tRef.current.barrelDistortion) c.classList.add('no-distort');
      clip.appendChild(c);
      setTimeout(() => c.classList.remove('crystallize'), 1700);
    }
    c.classList.toggle('no-distort', !tRef.current.barrelDistortion);
  }, [currentVision]);

  // ── Ball opacity ──────────────────────────────────────────────────────────
  useEffect(() => {
    const c = currentVision?.canvas;
    if (!c) return;
    c.style.opacity = String(ballOpacity);
  }, [ballOpacity, currentVision]);

  // ── Distortion toggle ─────────────────────────────────────────────────────
  useEffect(() => {
    const c = currentVision?.canvas;
    if (!c) return;
    c.classList.toggle('no-distort', !t.barrelDistortion);
  }, [t.barrelDistortion, currentVision]);

  // ── Glow CSS vars ─────────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--glow-mid',    withAlpha(t.glowColor, 0.55));
    root.style.setProperty('--glow-soft',   withAlpha(t.glowColor, 0.25));
    root.style.setProperty('--glow-strong', withAlpha(t.glowColor, 0.85));
    root.style.setProperty('--glow-faint',  withAlpha(t.glowColor, 0.08));
  }, [t.glowColor]);

  // ── Resize smoke canvas ───────────────────────────────────────────────────
  useEffect(() => {
    function resize() {
      const c = smokeRef.current; if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      c.style.width = window.innerWidth + 'px';
      c.style.height = window.innerHeight + 'px';
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── Resize shape canvas to match ball ─────────────────────────────────────
  useEffect(() => {
    function resize() {
      const sc = shapeCanvasRef.current; if (!sc) return;
      const ballEl = ballWrapRef.current; if (!ballEl) return;
      const size = ballEl.offsetWidth;
      if (sc.width !== size) { sc.width = size; sc.height = size; }
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const pointInBall = useCallback((x: number, y: number): boolean => {
    const el = ballWrapRef.current; if (!el) return false;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return Math.hypot(x - cx, y - cy) <= r.width / 2;
  }, []);

  // ── Mouse & touch events ──────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      stateRef.current.mx = e.clientX;
      stateRef.current.my = e.clientY;
      stateRef.current.overBall = pointInBall(e.clientX, e.clientY);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      stateRef.current.overInput = !!(el?.closest('.question-input-wrap'));
    }
    function onDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest('.twk-panel')) return;
      if ((e.target as HTMLElement).closest('.groq-settings-btn')) return;
      if ((e.target as HTMLElement).closest('.groq-settings-drawer')) return;
      const curr = phaseRef.current;
      if (curr === 'rendering' || curr === 'dissolving' || curr === 'settling') {
        collapseOracle();
        return;
      }
      if (!pointInBall(e.clientX, e.clientY)) return;
      if (curr !== 'idle') return;
      stateRef.current.mx = e.clientX; stateRef.current.my = e.clientY;
      stateRef.current.pressing = true;
      setPhase('dragging'); phaseRef.current = 'dragging';
      setHasInteracted(true);
    }
    function onUp() {
      if (!stateRef.current.pressing) return;
      stateRef.current.pressing = false;
      if (phaseRef.current !== 'dragging') return;
      releaseSmokeRef.current();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pointInBall]);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      const t0 = e.touches[0]; if (!t0) return;
      stateRef.current.mx = t0.clientX; stateRef.current.my = t0.clientY;
      const curr = phaseRef.current;
      if (curr === 'rendering' || curr === 'dissolving' || curr === 'settling') { collapseOracle(); return; }
      if (!pointInBall(t0.clientX, t0.clientY) || curr !== 'idle') return;
      stateRef.current.pressing = true;
      setPhase('dragging'); phaseRef.current = 'dragging';
      setHasInteracted(true);
      e.preventDefault();
    }
    function onTouchMove(e: TouchEvent) {
      const t0 = e.touches[0]; if (!t0) return;
      stateRef.current.mx = t0.clientX; stateRef.current.my = t0.clientY;
      stateRef.current.overBall = pointInBall(t0.clientX, t0.clientY);
    }
    function onTouchEnd() {
      if (!stateRef.current.pressing) return;
      stateRef.current.pressing = false;
      if (phaseRef.current !== 'dragging') return;
      releaseSmokeRef.current();
    }
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [pointInBall]);

  // ── Release smoke (drag interaction) ─────────────────────────────────────
  const releaseSmoke = useCallback(() => {
    const s = stateRef.current;
    const cfg = tRef.current;
    setPhase('settling'); phaseRef.current = 'settling';
    const palette = currentVision ? currentVision.palette : ['#222', '#888', '#aaa'];
    const colors = palette.slice(1).map(hexToRgb);
    s.fillColor = colors[Math.floor(colors.length / 2)] as [number, number, number] || s.fillColor;
    const burst = Math.floor(120 * cfg.smokeDensity);
    for (let i = 0; i < burst; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4.5;
      const c = colors[Math.floor(Math.random() * colors.length)];
      s.particles.push({
        x: s.cx + (Math.random() - 0.5) * 30,
        y: s.cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.4,
        size: 28 + Math.random() * 38, growth: 1.4 + Math.random() * 1.5,
        life: 1.0, decay: 0.0045 + Math.random() * 0.006,
        r: c[0], g: c[1], b: c[2], curl: (Math.random() - 0.5) * 0.06,
      });
    }
    let start = performance.now();
    function rampFill(now: number) {
      const k = Math.min(1, (now - start) / 700);
      s.fillOpacity = Math.max(s.fillOpacity, 0.55 * k);
      if (k < 1 && stateRef.current.particles.length) requestAnimationFrame(rampFill);
    }
    requestAnimationFrame(rampFill);
    setBallOpacity(0);
    setTimeout(() => {
      const gid = tRef.current.generator === 'random' ? null : tRef.current.generator;
      setCurrentVision(generateVision({ size: 900, generatorId: gid }));
      setBallOpacity(1);
    }, 1000);
    setTimeout(() => { setPhase('idle'); phaseRef.current = 'idle'; }, 2200);
  }, [currentVision]);

  // Keep ref in sync so stale closures in event handlers always call the latest version
  useEffect(() => { releaseSmokeRef.current = releaseSmoke; }, [releaseSmoke]);

  // ── Collapse oracle early (click during response) ─────────────────────────
  const collapseOracle = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    const s = stateRef.current;
    for (const p of s.particles) p.decay = 0.08;
    setTweak('glowColor', defaultGlowRef.current);
    setBallOpacity(0);
    oracleRef.current = null;
    setTimeout(() => {
      const gid = tRef.current.generator === 'random' ? null : tRef.current.generator;
      setCurrentVision(generateVision({ size: 900, generatorId: gid }));
      setBallOpacity(1);
    }, 600);
    setTimeout(() => { setPhase('idle'); phaseRef.current = 'idle'; }, 1400);
  }, []);

  // ── Oracle question handling ───────────────────────────────────────────────
  const handleQuestion = useCallback(async (question: string) => {
    if (phaseRef.current !== 'idle') return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('questioning'); phaseRef.current = 'questioning';
    setHasInteracted(true);

    try {
      const response = await queryOracle(question);
      const colors = deriveColors(response);
      const shapeType = selectShape(response);
      const patternType = selectPattern(response);
      const seed = (Math.random() * 1e9) | 0;

      // Update glow to match Oracle's primary color
      setTweak('glowColor', colors.primary);

      // Oracle background replaces current vision
      const oracleBg = generateOracleBackground(colors, 900);
      setCurrentVision({
        canvas: oracleBg,
        generator: { id: 'oracle', name: 'Oracle', fn: () => {} },
        palette: [colors.primary, colors.secondary],
        seed,
      });

      oracleRef.current = {
        response, colors, shapeType, patternType,
        shapeStartTime: performance.now(),
        wordParticlesEmitted: false,
        dissolveParticlesEmitted: false,
        seed,
      };

      setBallOpacity(0.6);
      setPhase('rendering'); phaseRef.current = 'rendering';

      const t1 = setTimeout(() => { setPhase('dissolving'); phaseRef.current = 'dissolving'; }, 2000);
      const t2 = setTimeout(() => { setPhase('settling'); phaseRef.current = 'settling'; }, 4400);
      const t3 = setTimeout(() => {
        oracleRef.current = null;
        setTweak('glowColor', defaultGlowRef.current);
        setBallOpacity(0);
        const gid = tRef.current.generator === 'random' ? null : tRef.current.generator;
        setCurrentVision(generateVision({ size: 900, generatorId: gid }));
        setBallOpacity(1);
        setTimeout(() => { setPhase('idle'); phaseRef.current = 'idle'; }, 400);
      }, 6600);

      timersRef.current = [t1, t2, t3];
    } catch {
      handleOracleError();
    }
  }, []);

  const handleOracleError = useCallback(() => {
    setBallOpacity(0.3);
    const s = stateRef.current;
    // Sparse gray interference
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2;
      s.particles.push({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 160,
        y: window.innerHeight / 2 + (Math.random() - 0.5) * 160,
        vx: Math.cos(ang) * (0.5 + Math.random()), vy: Math.sin(ang) * 0.5 - 0.2,
        size: 12 + Math.random() * 22, growth: 0.3, life: 1.0, decay: 0.005,
        r: 95, g: 95, b: 110, curl: (Math.random() - 0.5) * 0.1,
      });
    }
    // Error fragment
    s.particles.push({
      x: window.innerWidth / 2 - 90, y: window.innerHeight / 2 - 30,
      vx: 0, vy: -0.25, size: 0, growth: 0, life: 1.0, decay: 0.003,
      r: 130, g: 130, b: 148, curl: 0.02,
      type: 'word', text: 'the oracle does not speak',
      font: '12px ui-monospace, monospace',
    });
    const t1 = setTimeout(() => {
      setBallOpacity(1);
      setPhase('idle'); phaseRef.current = 'idle';
    }, 4500);
    timersRef.current = [t1];
  }, []);

  // ── rAF loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let rafId: number;
    let lastT = performance.now();
    let emitAccum = 0;

    function tick(now: number) {
      const s = stateRef.current;
      const cfg = tRef.current;
      const dt = Math.min(48, now - lastT); lastT = now;
      const currPhase = phaseRef.current;

      // smooth cursor
      s.cx += (s.mx - s.cx) * 0.42;
      s.cy += (s.my - s.cy) * 0.42;

      // ball bounds
      const ballEl = ballWrapRef.current;
      let bx = window.innerWidth / 2, by = window.innerHeight / 2, br = 200;
      if (ballEl) {
        const rect = ballEl.getBoundingClientRect();
        bx = rect.left + rect.width / 2;
        by = rect.top + rect.height / 2;
        br = rect.width / 2;
      }

      // cursor
      if (cursorRef.current) {
        cursorRef.current.style.setProperty('--cx', s.cx + 'px');
        cursorRef.current.style.setProperty('--cy', s.cy + 'px');
        cursorRef.current.classList.toggle('over-ball', s.overBall && currPhase === 'idle');
        cursorRef.current.classList.toggle('grabbing', currPhase === 'dragging');
        cursorRef.current.classList.toggle('over-input', s.overInput);
      }

      // ── smoke emission (drag) ───────────────────────────────────────────
      if (currPhase === 'dragging' && currentVision) {
        const palette = currentVision.palette.slice(1);
        const dx = s.cx - bx, dy = s.cy - by;
        const distFromBall = Math.hypot(dx, dy);
        const norm = Math.max(distFromBall, 1);
        const ox = bx + (dx / norm) * br * 0.85;
        const oy = by + (dy / norm) * br * 0.85;
        const beyond = Math.max(0, distFromBall - br);
        emitAccum += (1.5 + beyond * 0.03) * cfg.smokeDensity * (dt / 16);
        while (emitAccum > 1) {
          emitAccum -= 1;
          const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.55;
          const targetDist = Math.max(beyond, 30) * cfg.trailLength;
          const sp = 1.5 + Math.random() * 2.8 + targetDist * 0.015;
          const c = hexToRgb(palette[Math.floor(Math.random() * palette.length)]);
          s.particles.push({
            x: ox + (Math.random() - 0.5) * br * 0.25,
            y: oy + (Math.random() - 0.5) * br * 0.25,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            size: 10 + Math.random() * 16, growth: 0.4 + Math.random() * 0.8,
            life: 1.0, decay: 0.011 + Math.random() * 0.012,
            r: c[0], g: c[1], b: c[2], curl: (Math.random() - 0.5) * 0.08,
          });
        }
        const targetOpacity = Math.max(0.25, 1 - beyond / (br * 1.5));
        const vc = currentVision.canvas;
        if (vc) vc.style.opacity = String(targetOpacity);
      }

      // ── Oracle shape canvas rendering ───────────────────────────────────
      const oracle = oracleRef.current;
      const sc = shapeCanvasRef.current;
      if (sc) {
        const sctx = sc.getContext('2d');
        if (sctx) {
          if (oracle && (currPhase === 'rendering' || currPhase === 'dissolving')) {
            sctx.clearRect(0, 0, sc.width, sc.height);
            const shapeTime = (now - oracle.shapeStartTime) / 1000;
            const scCx = sc.width / 2, scCy = sc.height / 2;
            const scR = sc.width * 0.4;

            // Draw shape
            const result = drawShape(sctx, scCx, scCy, scR, oracle.colors, oracle.response, shapeTime, oracle.shapeType);

            // Pattern overlay at low opacity
            sctx.save();
            sctx.globalAlpha = 0.14;
            drawPattern(sctx, sc.width, oracle.colors, oracle.response, oracle.seed, oracle.patternType);
            sctx.restore();

            // Emit word particles once, shortly after rendering starts
            if (!oracle.wordParticlesEmitted && shapeTime > 0.15) {
              oracle.wordParticlesEmitted = true;
              emitWordParticles(oracle.response.fragment, oracle.colors, s.particles, bx, by, br);
            }

            // Emit dissolve particles when dissolving phase starts
            if (currPhase === 'dissolving' && !oracle.dissolveParticlesEmitted) {
              oracle.dissolveParticlesEmitted = true;
              const sample = result.vertices.slice(0, 50);
              const [r2, g2, b2] = hexToRgb(oracle.colors.secondary);
              const [rp, gp, bp] = hexToRgb(oracle.colors.primary);
              for (const v of sample) {
                // Map from shape canvas coords to screen coords
                const sx = bx - br + (v.x / sc.width) * (br * 2);
                const sy = by - br + (v.y / sc.height) * (br * 2);
                const ang = Math.random() * Math.PI * 2;
                s.particles.push({
                  x: sx, y: sy,
                  vx: Math.cos(ang) * (1.2 + Math.random() * 2.5),
                  vy: Math.sin(ang) * (1.2 + Math.random() * 2.5) - 0.5,
                  size: 5 + Math.random() * 12, growth: 0.5 + Math.random() * 0.9,
                  life: 1.0, decay: 0.006 + Math.random() * 0.005,
                  r: r2, g: g2, b: b2, curl: (Math.random() - 0.5) * 0.08,
                  type: 'smoke',
                });
              }
              // Large primary color atmosphere blobs
              for (let i = 0; i < 20; i++) {
                const ang = Math.random() * Math.PI * 2;
                s.particles.push({
                  x: bx + (Math.random() - 0.5) * br * 0.8,
                  y: by + (Math.random() - 0.5) * br * 0.8,
                  vx: Math.cos(ang) * (0.8 + Math.random() * 1.5),
                  vy: Math.sin(ang) * 0.8 - 0.3,
                  size: 35 + Math.random() * 45, growth: 0.8,
                  life: 1.0, decay: 0.004 + Math.random() * 0.003,
                  r: rp, g: gp, b: bp, curl: (Math.random() - 0.5) * 0.05,
                  type: 'color',
                });
              }
            }
          } else {
            sctx.clearRect(0, 0, sc.width, sc.height);
          }
        }
      }

      // ── Particle physics ─────────────────────────────────────────────────
      const ps = s.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.vx += (Math.random() - 0.5) * 0.12 + p.curl * Math.sin(now * 0.001 + i);
        p.vy += (Math.random() - 0.5) * 0.12 - 0.04;
        p.vx *= 0.965; p.vy *= 0.965;
        p.x += p.vx; p.y += p.vy;
        if (p.type !== 'word') p.size += p.growth;
        p.life -= p.decay;
        if (p.life <= 0 || p.size > 380) { ps.splice(i, 1); continue; }
      }

      // ── Render ───────────────────────────────────────────────────────────
      const smokeCanvas = smokeRef.current;
      if (smokeCanvas) {
        const w = window.innerWidth, h = window.innerHeight;
        const ctx = smokeCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, w, h);

        if (s.fillOpacity > 0.001) {
          const fc = s.fillColor;
          const grad = ctx.createRadialGradient(bx, by, br * 0.4, bx, by, Math.max(w, h));
          grad.addColorStop(0, `rgba(${fc[0]},${fc[1]},${fc[2]},${s.fillOpacity * 0.45})`);
          grad.addColorStop(1, `rgba(${fc[0]},${fc[1]},${fc[2]},${s.fillOpacity})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }
        if (currPhase !== 'dragging') s.fillOpacity *= 0.985;

        // Screen-blended smoke + color particles
        ctx.globalCompositeOperation = 'screen';
        for (const p of ps) {
          if (p.type === 'word') continue;
          const a = Math.max(0, p.life);
          const rr = p.size;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          const alpha = p.type === 'color' ? a * 0.28 : a * 0.45;
          g.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${alpha})`);
          g.addColorStop(0.5, `rgba(${p.r},${p.g},${p.b},${alpha * 0.4})`);
          g.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';

        // Word particles
        for (const p of ps) {
          if (p.type !== 'word') continue;
          const a = Math.max(0, p.life);
          ctx.save();
          ctx.font = p.font || '13px ui-monospace, monospace';
          ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a * 0.88})`;
          ctx.shadowColor = `rgba(${p.r},${p.g},${p.b},${a * 0.35})`;
          ctx.shadowBlur = 10;
          ctx.fillText(p.text || '', p.x, p.y);
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, currentVision]);

  // ── Hint fade on interaction ───────────────────────────────────────────────
  useEffect(() => {
    if (hasInteracted && !hintFading) setHintFading(true);
  }, [hasInteracted, hintFading]);

  return (
    <div className="stage">
      {/* fisheye SVG filter */}
      <svg className="filter-svg" aria-hidden="true">
        <defs>
          <filter id="fisheye" x="0%" y="0%" width="100%" height="100%">
            <feImage xlinkHref="#displaceMap" result="map" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale="80" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <radialGradient id="dispR" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(128,128,128)" />
            <stop offset="50%" stopColor="rgb(160,160,128)" />
            <stop offset="100%" stopColor="rgb(220,220,128)" />
          </radialGradient>
          <symbol id="displaceMap" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect width="100" height="100" fill="url(#dispR)" />
          </symbol>
        </defs>
      </svg>

      <div className="outer-glow" />

      <div className="ball-wrap" ref={ballWrapRef}>
        <div className="ball-clip" ref={ballClipRef}>
          <canvas ref={shapeCanvasRef} className="ball-shape-canvas" />
        </div>
        <div className="glass" />
        <div className={`glow${phase === 'questioning' ? ' questioning' : ''}`} />
      </div>

      <canvas className="smoke" ref={smokeRef} />
      <div className="cursor" ref={cursorRef} />

      <div className="hud">
        <span className="dot" />
        <span>The Oracle</span>
      </div>

      {t.showCaption && currentVision && phase === 'idle' && currentVision.generator.id !== 'oracle' && (
        <div className="vision-name">
          <span>{currentVision.generator.name}</span>
          <span className="sep">·</span>
          <span>#{currentVision.seed.toString(16).slice(0, 6).padStart(6, '0')}</span>
        </div>
      )}

      {!hasInteracted && (
        <div className={`hint${hintFading ? ' fade' : ''}`}>
          ask the oracle anything
        </div>
      )}

      <QuestionInput
        phase={phase}
        onSubmit={handleQuestion}
        hasGroqKey={groqKeyPresent}
      />

      <GroqSettings onKeyChange={() => setGroqKeyPresent(!!getGroqKey())} />

      <TweaksPanel>
        <TweakSection label="Visions" />
        <TweakSelect
          label="Source"
          value={t.generator}
          options={['random', ...GENERATORS.map(g => g.id)]}
          onChange={(v) => setTweak('generator', v)}
        />
        <TweakToggle
          label="Fish-eye distortion"
          value={t.barrelDistortion}
          onChange={(v) => setTweak('barrelDistortion', v)}
        />
        <TweakToggle
          label="Show caption"
          value={t.showCaption}
          onChange={(v) => setTweak('showCaption', v)}
        />
        <TweakSection label="Smoke" />
        <TweakSlider
          label="Density"
          value={t.smokeDensity}
          min={0.3} max={2.5} step={0.1}
          onChange={(v) => setTweak('smokeDensity', v)}
        />
        <TweakSlider
          label="Trail length"
          value={t.trailLength}
          min={0.2} max={1.8} step={0.1}
          onChange={(v) => setTweak('trailLength', v)}
        />
        <TweakSection label="Glow" />
        <TweakColor
          label="Color"
          value={t.glowColor}
          options={['#48CAE4', '#FFFFFF', '#FFB347', '#FF4D9F', '#9F6DFF', '#62FF8A']}
          onChange={(v) => { setTweak('glowColor', v); defaultGlowRef.current = v as string; }}
        />
      </TweaksPanel>
    </div>
  );
}

// ── Word particle emitter ─────────────────────────────────────────────────────
function emitWordParticles(
  fragment: string,
  colors: ColorPair,
  particles: Particle[],
  bx: number, by: number, br: number
) {
  const words = fragment.split(/\s+/).filter(Boolean);
  const [r, g, b] = hexToRgb(colors.secondary);
  const fonts = [
    '13px ui-monospace, monospace',
    '12px Georgia, serif',
    '14px ui-monospace, monospace',
    '11px Georgia, serif',
    '13px Georgia, serif',
  ];

  words.forEach((word, i) => {
    const ang = (i / words.length) * Math.PI * 2 + Math.random() * 0.6;
    const sp = 2.2 + Math.random() * 2.8;
    // Start from slightly inside ball center
    const ox = bx + (Math.random() - 0.5) * br * 0.3;
    const oy = by + (Math.random() - 0.5) * br * 0.3;
    particles.push({
      x: ox, y: oy,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 0.4,
      size: 0, growth: 0,
      life: 1.0,
      decay: 0.0035 + Math.random() * 0.003,
      r, g, b,
      curl: (Math.random() - 0.5) * 0.28,
      type: 'word',
      text: word,
      font: fonts[i % fonts.length],
    });
  });
}
