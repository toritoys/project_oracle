import { useState, useEffect, useRef, useCallback } from 'react';
import { useTweaks, TweaksPanel, TweakSection, TweakSelect, TweakToggle, TweakSlider, TweakColor } from './tweaks-panel';
import { GENERATORS, generateVision, Vision } from './visions';
import { queryOracle, getGroqKey } from './oracle/api';
import { deriveThreeColors } from './oracle/colorEngine';
import { drawShape, selectShape } from './oracle/shapes';
import { drawPattern, selectPattern } from './oracle/patterns';
import { QuestionInput } from './components/QuestionInput';
import { GroqSettings } from './components/GroqSettings';
import { hexToRgb, hexToHsl, hslToHex, withAlpha, clamp } from './utils';
import type { PhaseState, Particle, OracleResponse, ShapeType, PatternType } from './oracle/types';

const TWEAK_DEFAULTS = {
  glowColor: '#48CAE4',
  generator: 'smoke',
  barrelDistortion: true,
  showCaption: true,
  smokeDensity: 1.0,
  trailLength: 0.6,
};

// step 0=color, 1=words, 2=shape — user drags each out before the next appears
interface OracleSeqState {
  step: number;
  colors: [string, string, string];
  response: OracleResponse;
  shapeType: ShapeType;
  patternType: PatternType;
  seed: number;
  shapeStartTime: number;
}

// Deep tinted dark background — never pure black, always carries the color
function generateStepBackground(color: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const [r, g, b] = hexToRgb(color);
  // Very dark but tinted base
  const dr = Math.max(Math.round(r * 0.07), 5);
  const dg = Math.max(Math.round(g * 0.07), 5);
  const db = Math.max(Math.round(b * 0.07), 5);
  ctx.fillStyle = `rgb(${dr},${dg},${db})`;
  ctx.fillRect(0, 0, size, size);
  // Rich radial atmosphere
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0,    `rgba(${r},${g},${b},0.62)`);
  grad.addColorStop(0.38, `rgba(${r},${g},${b},0.24)`);
  grad.addColorStop(0.72, `rgba(${r},${g},${b},0.07)`);
  grad.addColorStop(1,    `rgba(${dr},${dg},${db},0.94)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
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

  const oracleSeqRef = useRef<OracleSeqState | null>(null);
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
      // Between oracle steps — ignore input during transition
      if (curr === 'settling') return;
      // Oracle sequence active: ball drag advances the step, click outside collapses
      if (curr === 'rendering') {
        if (oracleSeqRef.current && pointInBall(e.clientX, e.clientY)) {
          stateRef.current.mx = e.clientX; stateRef.current.my = e.clientY;
          stateRef.current.pressing = true;
          setPhase('dragging'); phaseRef.current = 'dragging';
          setHasInteracted(true);
        } else {
          collapseOracle();
        }
        return;
      }
      if (curr === 'dissolving') { collapseOracle(); return; }
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
      if (curr === 'settling') return;
      if (curr === 'rendering') {
        if (oracleSeqRef.current && pointInBall(t0.clientX, t0.clientY)) {
          stateRef.current.pressing = true;
          setPhase('dragging'); phaseRef.current = 'dragging';
          setHasInteracted(true);
          e.preventDefault();
        } else {
          collapseOracle();
        }
        return;
      }
      if (curr === 'dissolving') { collapseOracle(); return; }
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

  // ── Release smoke ─────────────────────────────────────────────────────────
  const releaseSmoke = useCallback(() => {
    const s = stateRef.current;
    const cfg = tRef.current;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('settling'); phaseRef.current = 'settling';

    const oracle = oracleSeqRef.current;

    // Compute ball center at release time
    const ballEl = ballWrapRef.current;
    let bx = window.innerWidth / 2, by = window.innerHeight / 2, br = 200;
    if (ballEl) {
      const rect = ballEl.getBoundingClientRect();
      bx = rect.left + rect.width / 2; by = rect.top + rect.height / 2; br = rect.width / 2;
    }

    if (oracle) {
      // ── Oracle sequence: emit burst for this step, then advance ────────────
      const stepColor = oracle.colors[oracle.step];
      const [sr, sg, sb] = hexToRgb(stepColor);

      if (oracle.step === 0) {
        // Step 0 (color): large vivid blobs flood screen
        const burst = Math.floor(110 * cfg.smokeDensity);
        for (let i = 0; i < burst; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 5.5;
          s.particles.push({
            x: bx + (Math.random() - 0.5) * 50, y: by + (Math.random() - 0.5) * 50,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.5,
            size: 32 + Math.random() * 58, growth: 1.5 + Math.random() * 1.5,
            life: 1.0, decay: 0.0035 + Math.random() * 0.004,
            r: sr, g: sg, b: sb, curl: (Math.random() - 0.5) * 0.06, type: 'color',
          });
        }
        s.fillColor = [sr, sg, sb];
        const startFill = performance.now();
        const rampFill = (now: number) => {
          const k = Math.min(1, (now - startFill) / 700);
          s.fillOpacity = Math.max(s.fillOpacity, 0.55 * k);
          if (k < 1) requestAnimationFrame(rampFill);
        };
        requestAnimationFrame(rampFill);

      } else if (oracle.step === 1) {
        // Step 1 (words): burst of varied-font word particles
        const words = oracle.response.fragment.split(/\s+/).filter(Boolean);
        const fontSizes = [11, 14, 17, 20, 24];
        const fontFamilies = ['ui-monospace, monospace', 'Georgia, serif', 'Palatino, serif'];
        for (let i = 0; i < words.length * 5; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 2.5 + Math.random() * 5;
          const [wr, wg, wb] = wordColor(stepColor, i);
          s.particles.push({
            x: bx + (Math.random() - 0.5) * br * 0.7,
            y: by + (Math.random() - 0.5) * br * 0.7,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.4,
            size: 0, growth: 0, life: 1.0,
            decay: 0.0035 + Math.random() * 0.005,
            r: wr, g: wg, b: wb,
            curl: (Math.random() - 0.5) * 0.28,
            type: 'word',
            text: words[i % words.length],
            font: `${fontSizes[Math.floor(Math.random() * fontSizes.length)]}px ${fontFamilies[Math.floor(Math.random() * fontFamilies.length)]}`,
          });
        }
        s.fillColor = [sr, sg, sb];
        const startFill = performance.now();
        const rampFill = (now: number) => {
          const k = Math.min(1, (now - startFill) / 700);
          s.fillOpacity = Math.max(s.fillOpacity, 0.38 * k);
          if (k < 1) requestAnimationFrame(rampFill);
        };
        requestAnimationFrame(rampFill);

      } else if (oracle.step === 2) {
        // Step 2 (shape): smoke particles scatter from ball
        const burst = Math.floor(80 * cfg.smokeDensity);
        for (let i = 0; i < burst; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 1.5 + Math.random() * 4.5;
          s.particles.push({
            x: bx + (Math.random() - 0.5) * br * 0.8,
            y: by + (Math.random() - 0.5) * br * 0.8,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.4,
            size: 6 + Math.random() * 20, growth: 0.7, life: 1.0,
            decay: 0.007 + Math.random() * 0.007,
            r: sr, g: sg, b: sb, curl: (Math.random() - 0.5) * 0.08, type: 'smoke',
          });
        }
        s.fillColor = [sr, sg, sb];
        const startFill = performance.now();
        const rampFill = (now: number) => {
          const k = Math.min(1, (now - startFill) / 700);
          s.fillOpacity = Math.max(s.fillOpacity, 0.28 * k);
          if (k < 1) requestAnimationFrame(rampFill);
        };
        requestAnimationFrame(rampFill);
      }

      setBallOpacity(0);
      const nextStep = oracle.step + 1;

      if (nextStep > 2) {
        // All three steps complete — return to idle
        oracleSeqRef.current = null;
        setTweak('glowColor', defaultGlowRef.current);
        const t1 = setTimeout(() => {
          const gid = tRef.current.generator === 'random' ? null : tRef.current.generator;
          setCurrentVision(generateVision({ size: 900, generatorId: gid }));
          setBallOpacity(1);
        }, 800);
        const t2 = setTimeout(() => { setPhase('idle'); phaseRef.current = 'idle'; }, 1700);
        timersRef.current = [t1, t2];
      } else {
        // Advance to next oracle step
        oracle.step = nextStep;
        const nextColor = oracle.colors[nextStep];
        setTweak('glowColor', nextColor);

        const t1 = setTimeout(() => {
          oracle.shapeStartTime = performance.now();
          const bg = generateStepBackground(nextColor, 900);
          setCurrentVision({
            canvas: bg,
            generator: { id: 'oracle', name: 'Oracle', fn: () => {} },
            palette: [...oracle.colors],
            seed: oracle.seed,
          });
          setBallOpacity(0.7);
          setPhase('rendering'); phaseRef.current = 'rendering';

          // Step 1: seed preview words drifting inside the ball
          if (nextStep === 1) {
            const el = ballWrapRef.current;
            let bx2 = window.innerWidth / 2, by2 = window.innerHeight / 2, br2 = 200;
            if (el) {
              const rect = el.getBoundingClientRect();
              bx2 = rect.left + rect.width / 2; by2 = rect.top + rect.height / 2; br2 = rect.width / 2;
            }
            emitPreviewWords(oracle.response.fragment, nextColor, stateRef.current.particles, bx2, by2, br2);
          }
        }, 900);
        timersRef.current = [t1];
      }

      return;
    }

    // ── Free-play drag (no oracle active) ────────────────────────────────────
    const palette = currentVision ? currentVision.palette.slice(1) : ['#888', '#aaa'];
    const colors = palette.map(hexToRgb);
    s.fillColor = (colors[Math.floor(colors.length / 2)] as [number, number, number]) ?? s.fillColor;
    const burst = Math.floor(120 * cfg.smokeDensity);
    for (let i = 0; i < burst; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4.5;
      const c = colors[Math.floor(Math.random() * colors.length)];
      s.particles.push({
        x: s.cx + (Math.random() - 0.5) * 30, y: s.cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.4,
        size: 28 + Math.random() * 38, growth: 1.4 + Math.random() * 1.5,
        life: 1.0, decay: 0.0045 + Math.random() * 0.006,
        r: c[0], g: c[1], b: c[2], curl: (Math.random() - 0.5) * 0.06,
      });
    }
    const startFill = performance.now();
    const rampFill = (now: number) => {
      const k = Math.min(1, (now - startFill) / 700);
      s.fillOpacity = Math.max(s.fillOpacity, 0.55 * k);
      if (k < 1 && stateRef.current.particles.length) requestAnimationFrame(rampFill);
    };
    requestAnimationFrame(rampFill);
    setBallOpacity(0);
    const t1 = setTimeout(() => {
      const gid = tRef.current.generator === 'random' ? null : tRef.current.generator;
      setCurrentVision(generateVision({ size: 900, generatorId: gid }));
      setBallOpacity(1);
    }, 1000);
    const t2 = setTimeout(() => { setPhase('idle'); phaseRef.current = 'idle'; }, 2200);
    timersRef.current = [t1, t2];
  }, [currentVision]);

  useEffect(() => { releaseSmokeRef.current = releaseSmoke; }, [releaseSmoke]);

  // ── Collapse oracle early ─────────────────────────────────────────────────
  const collapseOracle = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    oracleSeqRef.current = null;
    const s = stateRef.current;
    for (const p of s.particles) p.decay = 0.08;
    setTweak('glowColor', defaultGlowRef.current);
    setBallOpacity(0);
    const t1 = setTimeout(() => {
      const gid = tRef.current.generator === 'random' ? null : tRef.current.generator;
      setCurrentVision(generateVision({ size: 900, generatorId: gid }));
      setBallOpacity(1);
    }, 600);
    const t2 = setTimeout(() => { setPhase('idle'); phaseRef.current = 'idle'; }, 1400);
    timersRef.current = [t1, t2];
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
      const [c0, c1, c2] = deriveThreeColors(response);
      const shapeType = selectShape(response);
      const patternType = selectPattern(response);
      const seed = (Math.random() * 1e9) | 0;

      setTweak('glowColor', c0);

      const bg = generateStepBackground(c0, 900);
      setCurrentVision({
        canvas: bg,
        generator: { id: 'oracle', name: 'Oracle', fn: () => {} },
        palette: [c0, c1, c2],
        seed,
      });

      oracleSeqRef.current = {
        step: 0,
        colors: [c0, c1, c2],
        response, shapeType, patternType, seed,
        shapeStartTime: performance.now(),
      };

      setBallOpacity(0.7);
      setPhase('rendering'); phaseRef.current = 'rendering';
      // No auto-advance timers — user interaction drives each step
    } catch {
      handleOracleError();
    }
  }, []);

  const handleOracleError = useCallback(() => {
    setBallOpacity(0.3);
    const s = stateRef.current;
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
    s.particles.push({
      x: window.innerWidth / 2 - 90, y: window.innerHeight / 2 - 30,
      vx: 0, vy: -0.25, size: 0, growth: 0, life: 1.0, decay: 0.003,
      r: 130, g: 130, b: 148, curl: 0.02,
      type: 'word', text: 'the oracle does not speak',
      font: '12px ui-monospace, monospace',
    });
    const t1 = setTimeout(() => {
      setBallOpacity(1); setPhase('idle'); phaseRef.current = 'idle';
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

      s.cx += (s.mx - s.cx) * 0.42;
      s.cy += (s.my - s.cy) * 0.42;

      const ballEl = ballWrapRef.current;
      let bx = window.innerWidth / 2, by = window.innerHeight / 2, br = 200;
      if (ballEl) {
        const rect = ballEl.getBoundingClientRect();
        bx = rect.left + rect.width / 2;
        by = rect.top + rect.height / 2;
        br = rect.width / 2;
      }

      if (cursorRef.current) {
        cursorRef.current.style.setProperty('--cx', s.cx + 'px');
        cursorRef.current.style.setProperty('--cy', s.cy + 'px');
        cursorRef.current.classList.toggle('over-ball', s.overBall && (currPhase === 'idle' || currPhase === 'rendering'));
        cursorRef.current.classList.toggle('grabbing', currPhase === 'dragging');
        cursorRef.current.classList.toggle('over-input', s.overInput);
      }

      // ── Emission during drag ────────────────────────────────────────────
      if (currPhase === 'dragging') {
        const oracle = oracleSeqRef.current;
        const dx = s.cx - bx, dy = s.cy - by;
        const distFromBall = Math.hypot(dx, dy);
        const norm = Math.max(distFromBall, 1);
        const ox = bx + (dx / norm) * br * 0.85;
        const oy = by + (dy / norm) * br * 0.85;
        const beyond = Math.max(0, distFromBall - br);
        emitAccum += (1.5 + beyond * 0.03) * cfg.smokeDensity * (dt / 16);

        if (oracle) {
          // Oracle step-specific emission
          const stepColor = oracle.colors[oracle.step];
          const [sr, sg, sb] = hexToRgb(stepColor);

          while (emitAccum > 1) {
            emitAccum -= 1;
            const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.55;
            const sp = 1.5 + Math.random() * 2.8 + beyond * 0.015;

            if (oracle.step === 0) {
              // Color: large vivid blobs toward cursor
              s.particles.push({
                x: ox + (Math.random() - 0.5) * br * 0.22,
                y: oy + (Math.random() - 0.5) * br * 0.22,
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                size: 18 + Math.random() * 30, growth: 1.1 + Math.random() * 0.8,
                life: 1.0, decay: 0.01 + Math.random() * 0.01,
                r: sr, g: sg, b: sb, curl: (Math.random() - 0.5) * 0.06, type: 'color',
              });
            } else if (oracle.step === 1) {
              // Words: varied font sizes and families stream toward cursor
              const words = oracle.response.fragment.split(/\s+/).filter(Boolean);
              const fontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
              const fontFamily = FONT_FAMILIES[Math.floor(Math.random() * FONT_FAMILIES.length)];
              const [wr, wg, wb] = wordColor(stepColor, Math.floor(Math.random() * words.length));
              s.particles.push({
                x: ox, y: oy,
                vx: Math.cos(ang) * sp * 0.85, vy: Math.sin(ang) * sp * 0.85 - 0.25,
                size: 0, growth: 0, life: 1.0,
                decay: 0.008 + Math.random() * 0.008,
                r: wr, g: wg, b: wb,
                curl: (Math.random() - 0.5) * 0.32,
                type: 'word',
                text: words[Math.floor(Math.random() * words.length)],
                font: `${fontSize}px ${fontFamily}`,
              });
            } else {
              // Shape: smoke in shape color
              s.particles.push({
                x: ox + (Math.random() - 0.5) * br * 0.2,
                y: oy + (Math.random() - 0.5) * br * 0.2,
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                size: 8 + Math.random() * 16, growth: 0.6 + Math.random() * 0.6,
                life: 1.0, decay: 0.01 + Math.random() * 0.01,
                r: sr, g: sg, b: sb, curl: (Math.random() - 0.5) * 0.08,
              });
            }
          }

          const targetOpacity = Math.max(0.22, 1 - beyond / (br * 1.5));
          if (currentVision?.canvas) currentVision.canvas.style.opacity = String(targetOpacity);

        } else if (currentVision) {
          // Free-play drag: original smoke emission from vision palette
          const palette = currentVision.palette.slice(1);
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
          if (currentVision.canvas) currentVision.canvas.style.opacity = String(targetOpacity);
        }
      } else {
        emitAccum = 0;
      }

      // ── Oracle shape canvas (step 2 only) ──────────────────────────────
      const oracle = oracleSeqRef.current;
      const sc = shapeCanvasRef.current;
      if (sc) {
        const sctx = sc.getContext('2d');
        if (sctx) {
          if (oracle && oracle.step === 2 && currPhase === 'rendering') {
            sctx.clearRect(0, 0, sc.width, sc.height);
            const shapeTime = (now - oracle.shapeStartTime) / 1000;
            const scCx = sc.width / 2, scCy = sc.height / 2;
            const scR = sc.width * 0.4;
            // Shape and pattern both use step 2 color
            const shapeColors = { primary: oracle.colors[2], secondary: oracle.colors[2] };
            drawShape(sctx, scCx, scCy, scR, shapeColors, oracle.response, shapeTime, oracle.shapeType);
            sctx.save();
            sctx.globalAlpha = 0.12;
            drawPattern(sctx, sc.width, shapeColors, oracle.response, oracle.seed, oracle.patternType);
            sctx.restore();
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

        // Word particles — varied font/size/hue
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

// ── Constants ─────────────────────────────────────────────────────────────────
const FONT_SIZES = [11, 13, 14, 16, 18, 20, 22];
const FONT_FAMILIES = ['ui-monospace, monospace', 'Georgia, serif', 'Palatino, serif', 'Garamond, serif'];

// Slight hue shift per word index for variety within a step
function wordColor(baseHex: string, wordIdx: number): [number, number, number] {
  const [h, s, l] = hexToHsl(baseHex);
  const shifted = hslToHex(h + ((wordIdx * 23) % 50) - 25, clamp(s, 30, 98), clamp(l, 35, 98));
  return hexToRgb(shifted);
}

// Slow-drifting preview words seeded inside the ball at step 1 start
function emitPreviewWords(
  fragment: string, color: string, particles: Particle[],
  bx: number, by: number, br: number
) {
  const words = fragment.split(/\s+/).filter(Boolean);
  words.forEach((word, i) => {
    const angle = (i / words.length) * Math.PI * 2 + (Math.random() - 0.5) * 1.4;
    const dist = (0.08 + Math.random() * 0.32) * br;
    const [r, g, b] = wordColor(color, i);
    const fontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
    const fontFamily = FONT_FAMILIES[Math.floor(Math.random() * FONT_FAMILIES.length)];
    particles.push({
      x: bx + Math.cos(angle) * dist,
      y: by + Math.sin(angle) * dist,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -0.18 - Math.random() * 0.22,
      size: 0, growth: 0,
      life: 1.0,
      decay: 0.0012 + Math.random() * 0.0007,
      r, g, b,
      curl: (Math.random() - 0.5) * 0.05,
      type: 'word', text: word,
      font: `${fontSize}px ${fontFamily}`,
    });
  });
}
