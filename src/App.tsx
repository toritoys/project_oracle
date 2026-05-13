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
  smokeDensity: 1.0,
  trailLength: 0.6,
};

interface OracleSeqState {
  step: number; // 0=color/patronus, 1=words, 2=shape
  colors: [string, string, string];
  response: OracleResponse;
  shapeType: ShapeType;
  patternType: PatternType;
  seed: number;
  shapeStartTime: number;
}

// Deep tinted dark background — never pure black
function generateStepBackground(color: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const [r, g, b] = hexToRgb(color);
  const dr = Math.max(Math.round(r * 0.07), 5);
  const dg = Math.max(Math.round(g * 0.07), 5);
  const db = Math.max(Math.round(b * 0.07), 5);
  ctx.fillStyle = `rgb(${dr},${dg},${db})`;
  ctx.fillRect(0, 0, size, size);
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
  const traceHistoryRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const pingPongRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pingPongTrailRef = useRef<HTMLCanvasElement | null>(null);
  const shapeVerticesRef = useRef<Array<{ x: number; y: number }>>([]);
  const cometTrailRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const cursorTrainHistRef = useRef<Array<{ x: number; y: number }>>([]);
  const shapeStampRef = useRef<HTMLCanvasElement | null>(null);
  const shapeTrailHistRef = useRef<Array<{ x: number; y: number; t: number }>>([]);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

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

  useEffect(() => {
    const c = currentVision?.canvas;
    if (!c) return;
    c.style.opacity = String(ballOpacity);
  }, [ballOpacity, currentVision]);

  useEffect(() => {
    const c = currentVision?.canvas;
    if (!c) return;
    c.classList.toggle('no-distort', !t.barrelDistortion);
  }, [t.barrelDistortion, currentVision]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--glow-mid',    withAlpha(t.glowColor, 0.55));
    root.style.setProperty('--glow-soft',   withAlpha(t.glowColor, 0.25));
    root.style.setProperty('--glow-strong', withAlpha(t.glowColor, 0.85));
    root.style.setProperty('--glow-faint',  withAlpha(t.glowColor, 0.08));
  }, [t.glowColor]);

  useEffect(() => {
    function resize() {
      const c = smokeRef.current; if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      c.style.width = window.innerWidth + 'px';
      c.style.height = window.innerHeight + 'px';
      c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

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
    return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) <= r.width / 2;
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      stateRef.current.mx = e.clientX; stateRef.current.my = e.clientY;
      stateRef.current.overBall = pointInBall(e.clientX, e.clientY);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      stateRef.current.overInput = !!(el?.closest('.question-input-wrap'));
    }
    function onDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest('.twk-panel')) return;
      if ((e.target as HTMLElement).closest('.groq-settings-btn')) return;
      if ((e.target as HTMLElement).closest('.groq-settings-drawer')) return;
      const curr = phaseRef.current;
      if (curr === 'settling') return;
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
          setHasInteracted(true); e.preventDefault();
        } else { collapseOracle(); }
        return;
      }
      if (curr === 'dissolving') { collapseOracle(); return; }
      if (!pointInBall(t0.clientX, t0.clientY) || curr !== 'idle') return;
      stateRef.current.pressing = true;
      setPhase('dragging'); phaseRef.current = 'dragging';
      setHasInteracted(true); e.preventDefault();
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

  const releaseSmoke = useCallback(() => {
    const s = stateRef.current;
    const cfg = tRef.current;
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    setPhase('settling'); phaseRef.current = 'settling';

    const oracle = oracleSeqRef.current;
    const ballEl = ballWrapRef.current;
    let bx = window.innerWidth / 2, by = window.innerHeight / 2, br = 200;
    if (ballEl) {
      const rect = ballEl.getBoundingClientRect();
      bx = rect.left + rect.width / 2; by = rect.top + rect.height / 2; br = rect.width / 2;
    }

    if (oracle) {
      const stepColor = oracle.colors[oracle.step];
      const [sr, sg, sb] = hexToRgb(stepColor);

      if (oracle.step === 0) {
        // Fire comet burst from comet's last position
        const cometPos = pingPongRef.current || { x: bx, y: by };
        const burst = Math.floor(110 * cfg.smokeDensity);
        for (let i = 0; i < burst; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 2.5 + Math.random() * 5.5;
          const fRoll = Math.random();
          const fg3 = fRoll < 0.55 ? Math.floor(Math.random() * 110) : Math.floor(80 + Math.random() * 150);
          s.particles.push({
            x: cometPos.x + (Math.random() - 0.5) * 60, y: cometPos.y + (Math.random() - 0.5) * 60,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.5,
            size: 30 + Math.random() * 55, growth: 1.5 + Math.random() * 1.4,
            life: 1.0, decay: 0.0032 + Math.random() * 0.004,
            r: 255, g: fg3, b: 0, curl: (Math.random() - 0.5) * 0.08, type: 'color',
          });
        }
        s.fillColor = [255, 90, 0];
        const sf = performance.now();
        const rf = (n: number) => { const k = Math.min(1, (n-sf)/700); s.fillOpacity = Math.max(s.fillOpacity, 0.55*k); if (k<1) requestAnimationFrame(rf); };
        requestAnimationFrame(rf);

      } else if (oracle.step === 1) {
        // Words: burst of mixed-language word particles
        const words = oracle.response.fragment.split(/\s+/).filter(Boolean);
        const total = words.length * 5;
        for (let i = 0; i < total; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 2.5 + Math.random() * 5;
          const { text, font: wFont } = pickWordParticle(oracle.response.fragment);
          const [wr, wg, wb] = wordColor(stepColor, i);
          s.particles.push({
            x: bx + (Math.random() - 0.5) * br * 0.7, y: by + (Math.random() - 0.5) * br * 0.7,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.4,
            size: 0, growth: 0, life: 1.0, decay: 0.0032 + Math.random() * 0.005,
            r: wr, g: wg, b: wb, curl: (Math.random() - 0.5) * 0.28,
            type: 'word', text, font: wFont,
          });
        }
        s.fillColor = [sr, sg, sb];
        const sf = performance.now();
        const rf = (n: number) => { const k = Math.min(1, (n-sf)/700); s.fillOpacity = Math.max(s.fillOpacity, 0.38*k); if (k<1) requestAnimationFrame(rf); };
        requestAnimationFrame(rf);

      } else if (oracle.step === 2) {
        // Shape: spark burst emitted from shape vertices so particles trace the shape
        const burst = Math.floor(120 * cfg.smokeDensity);
        const sverts2 = shapeVerticesRef.current;
        const scEl2 = shapeCanvasRef.current;
        const scCxR = scEl2 ? scEl2.width / 2 : bx;
        const scCyR = scEl2 ? scEl2.height / 2 : by;
        for (let i = 0; i < burst; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 6;
          let px = bx + (Math.random() - 0.5) * br * 0.8;
          let py = by + (Math.random() - 0.5) * br * 0.8;
          if (sverts2.length > 0) {
            const v = sverts2[Math.floor(Math.random() * sverts2.length)];
            px = bx + (v.x - scCxR);
            py = by + (v.y - scCyR);
          }
          s.particles.push({
            x: px, y: py,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.35,
            size: 1.5 + Math.random() * 5, growth: 0, life: 1.0,
            decay: 0.007 + Math.random() * 0.01,
            r: sr, g: sg, b: sb, curl: (Math.random() - 0.5) * 0.28, type: 'spark',
          });
        }
        s.fillColor = [sr, sg, sb];
        const sf = performance.now();
        const rf = (n: number) => { const k = Math.min(1, (n-sf)/700); s.fillOpacity = Math.max(s.fillOpacity, 0.28*k); if (k<1) requestAnimationFrame(rf); };
        requestAnimationFrame(rf);
      }

      setBallOpacity(0);
      traceHistoryRef.current.length = 0;
      pingPongRef.current = null;
      pingPongTrailRef.current = null;
      shapeVerticesRef.current = [];
      cometTrailRef.current = [];
      cursorTrainHistRef.current = [];
      shapeStampRef.current = null;
      shapeTrailHistRef.current = [];
      const nextStep = oracle.step + 1;

      if (nextStep > 2) {
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

          if (nextStep === 1) {
            const el = ballWrapRef.current;
            let bx2 = window.innerWidth/2, by2 = window.innerHeight/2, br2 = 200;
            if (el) { const rc = el.getBoundingClientRect(); bx2 = rc.left+rc.width/2; by2 = rc.top+rc.height/2; br2 = rc.width/2; }
            emitPreviewWords(oracle.response.fragment, nextColor, stateRef.current.particles, bx2, by2, br2);
          }
        }, 900);
        timersRef.current = [t1];
      }
      return;
    }

    // Free-play drag
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
    const sf = performance.now();
    const rf = (n: number) => { const k = Math.min(1, (n-sf)/700); s.fillOpacity = Math.max(s.fillOpacity, 0.55*k); if (k<1&&stateRef.current.particles.length) requestAnimationFrame(rf); };
    requestAnimationFrame(rf);
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

  const collapseOracle = useCallback(() => {
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    oracleSeqRef.current = null;
    traceHistoryRef.current.length = 0;
    pingPongRef.current = null;
    pingPongTrailRef.current = null;
    shapeVerticesRef.current = [];
    cometTrailRef.current = [];
    cursorTrainHistRef.current = [];
    shapeStampRef.current = null;
    shapeTrailHistRef.current = [];
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

  const handleQuestion = useCallback(async (question: string) => {
    if (phaseRef.current !== 'idle') return;
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    traceHistoryRef.current.length = 0;
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
        palette: [c0, c1, c2], seed,
      });

      oracleSeqRef.current = {
        step: 0, colors: [c0, c1, c2],
        response, shapeType, patternType, seed,
        shapeStartTime: performance.now(),
      };

      setBallOpacity(0.7);
      setPhase('rendering'); phaseRef.current = 'rendering';
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
        x: window.innerWidth/2 + (Math.random()-0.5)*160, y: window.innerHeight/2 + (Math.random()-0.5)*160,
        vx: Math.cos(ang)*(0.5+Math.random()), vy: Math.sin(ang)*0.5-0.2,
        size: 12+Math.random()*22, growth: 0.3, life: 1.0, decay: 0.005,
        r: 95, g: 95, b: 110, curl: (Math.random()-0.5)*0.1,
      });
    }
    s.particles.push({
      x: window.innerWidth/2-90, y: window.innerHeight/2-30,
      vx: 0, vy: -0.25, size: 0, growth: 0, life: 1.0, decay: 0.003,
      r: 130, g: 130, b: 148, curl: 0.02,
      type: 'word', text: 'the oracle does not speak', font: '12px ui-monospace, monospace',
    });
    const t1 = setTimeout(() => { setBallOpacity(1); setPhase('idle'); phaseRef.current = 'idle'; }, 4500);
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
      const oracle = oracleSeqRef.current;

      s.cx += (s.mx - s.cx) * 0.42;
      s.cy += (s.my - s.cy) * 0.42;

      const ballEl = ballWrapRef.current;
      let bx = window.innerWidth/2, by = window.innerHeight/2, br = 200;
      if (ballEl) {
        const rect = ballEl.getBoundingClientRect();
        bx = rect.left + rect.width/2; by = rect.top + rect.height/2; br = rect.width/2;
      }

      if (cursorRef.current) {
        cursorRef.current.style.setProperty('--cx', s.cx + 'px');
        cursorRef.current.style.setProperty('--cy', s.cy + 'px');
        cursorRef.current.classList.toggle('over-ball', s.overBall && (currPhase === 'idle' || currPhase === 'rendering'));
        cursorRef.current.classList.toggle('grabbing', currPhase === 'dragging');
        cursorRef.current.classList.toggle('over-input', s.overInput);
      }

      // ── Step 0: Comet physics (screen coords) ────────────────────────────────
      if (oracle && oracle.step === 0) {
        if (!pingPongRef.current) {
          const ang0 = Math.random() * Math.PI * 2;
          const spd0 = 4.5 + Math.random() * 2.5;
          pingPongRef.current = {
            x: bx + (Math.random() - 0.5) * br * 0.5,
            y: by + (Math.random() - 0.5) * br * 0.5,
            vx: Math.cos(ang0) * spd0, vy: Math.sin(ang0) * spd0,
          };
        }
        const pp = pingPongRef.current;
        if (currPhase === 'rendering') {
          pp.vx += (Math.random() - 0.5) * 0.7;
          pp.vy += (Math.random() - 0.5) * 0.7 - 0.07;
          pp.x += pp.vx; pp.y += pp.vy;
          const ppDist = Math.hypot(pp.x - bx, pp.y - by);
          const ppLimit = br * 0.82;
          if (ppDist > ppLimit) {
            const nx = (pp.x-bx)/ppDist, ny = (pp.y-by)/ppDist;
            const dot = pp.vx*nx + pp.vy*ny;
            if (dot > 0) { pp.vx -= 2*dot*nx*0.87; pp.vy -= 2*dot*ny*0.87; }
            pp.x = bx + nx*(ppLimit-1); pp.y = by + ny*(ppLimit-1);
          }
          const ppSpd = Math.hypot(pp.vx, pp.vy);
          if (ppSpd < 4.0) { pp.vx *= 4.0/ppSpd; pp.vy *= 4.0/ppSpd; }
          if (ppSpd > 9.0) { pp.vx *= 9.0/ppSpd; pp.vy *= 9.0/ppSpd; }
        } else if (currPhase === 'dragging') {
          pp.x += (s.cx - pp.x) * 0.22;
          pp.y += (s.cy - pp.y) * 0.22;
        }
        const cTrail = cometTrailRef.current;
        cTrail.push({ x: pp.x, y: pp.y, t: now });
        while (cTrail.length > 0 && now - cTrail[0].t > 900) cTrail.shift();
        while (cTrail.length > 70) cTrail.shift();
      }

      // ── Step 1: Cursor history for word snake ───────────────────────────────
      if (oracle && oracle.step === 1 && currPhase === 'dragging') {
        cursorTrainHistRef.current.push({ x: s.cx, y: s.cy });
        if (cursorTrainHistRef.current.length > 400) cursorTrainHistRef.current.shift();
      }

      // ── Step 2: Cursor history for shape stamp trail ────────────────────────
      if (oracle && oracle.step === 2 && currPhase === 'dragging') {
        shapeTrailHistRef.current.push({ x: s.cx, y: s.cy, t: now });
        while (shapeTrailHistRef.current.length > 0 && now - shapeTrailHistRef.current[0].t > 1400)
          shapeTrailHistRef.current.shift();
      }

      // ── Drag emission ─────────────────────────────────────────────────────
      if (currPhase === 'dragging') {
        const dx = s.cx - bx, dy = s.cy - by;
        const distFromBall = Math.hypot(dx, dy);
        const norm = Math.max(distFromBall, 1);
        const ox = bx + (dx/norm) * br * 0.85;
        const oy = by + (dy/norm) * br * 0.85;
        const beyond = Math.max(0, distFromBall - br);
        emitAccum += (1.5 + beyond * 0.03) * cfg.smokeDensity * (dt / 16);

        if (oracle) {
          const stepColor = oracle.colors[oracle.step];
          const [sr, sg, sb] = hexToRgb(stepColor);

          while (emitAccum > 1) {
            emitAccum -= 1;
            const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.55;
            const sp = 1.5 + Math.random() * 2.8 + beyond * 0.015;

            if (oracle.step === 0 && pingPongRef.current) {
              // Fire comet drag: particles emit from comet position
              const pp = pingPongRef.current;
              const fRoll = Math.random();
              const fg2 = fRoll < 0.55 ? Math.floor(Math.random() * 110) : Math.floor(70 + Math.random() * 150);
              s.particles.push({
                x: pp.x + (Math.random()-0.5)*14, y: pp.y + (Math.random()-0.5)*14,
                vx: Math.cos(ang)*sp*0.75 + (Math.random()-0.5)*2,
                vy: Math.sin(ang)*sp*0.75 - 0.7 + (Math.random()-0.5)*2,
                size: 12 + Math.random()*24, growth: 0.9 + Math.random()*1.0,
                life: 1.0, decay: 0.010 + Math.random()*0.012,
                r: 255, g: fg2, b: 0, curl: (Math.random()-0.5)*0.14, type: 'color',
              });
            } else if (oracle.step === 1) {
              // Words drag: emit from cursor position (snake train handled separately)
              const { text, font: wFont } = pickWordParticle(oracle.response.fragment);
              const [wr, wg, wb] = wordColor(stepColor, Math.floor(Math.random() * 7));
              s.particles.push({
                x: s.cx + (Math.random()-0.5)*22, y: s.cy + (Math.random()-0.5)*22,
                vx: Math.cos(ang)*sp*0.55, vy: Math.sin(ang)*sp*0.55 - 0.3,
                size: 0, growth: 0, life: 0.9, decay: 0.008 + Math.random()*0.008,
                r: wr, g: wg, b: wb, curl: (Math.random()-0.5)*0.25,
                type: 'word', text, font: wFont,
              });
            } else {
              // Shape drag: sparks emitted from shape vertices so they follow the shape's contour
              const sverts = shapeVerticesRef.current;
              const scEl = shapeCanvasRef.current;
              const scCxD = scEl ? scEl.width / 2 : bx;
              const scCyD = scEl ? scEl.height / 2 : by;
              let px = ox, py = oy;
              if (sverts.length > 0) {
                const v = sverts[Math.floor(Math.random() * sverts.length)];
                px = bx + (v.x - scCxD);
                py = by + (v.y - scCyD);
              }
              s.particles.push({
                x: px, y: py,
                vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp - 0.2,
                size: 1.2 + Math.random() * 5.8, growth: 0, life: 1.0,
                decay: 0.009 + Math.random()*0.01,
                r: sr, g: sg, b: sb, curl: (Math.random()-0.5)*0.3, type: 'spark',
              });
            }
          }

          if (currentVision?.canvas)
            currentVision.canvas.style.opacity = String(Math.max(0.22, 1 - beyond/(br*1.5)));

        } else if (currentVision) {
          // Free-play drag
          const palette = currentVision.palette.slice(1);
          while (emitAccum > 1) {
            emitAccum -= 1;
            const ang = Math.atan2(dy, dx) + (Math.random()-0.5)*0.55;
            const targetDist = Math.max(beyond, 30) * cfg.trailLength;
            const sp = 1.5 + Math.random()*2.8 + targetDist*0.015;
            const c = hexToRgb(palette[Math.floor(Math.random()*palette.length)]);
            s.particles.push({
              x: ox + (Math.random()-0.5)*br*0.25, y: oy + (Math.random()-0.5)*br*0.25,
              vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp,
              size: 10+Math.random()*16, growth: 0.4+Math.random()*0.8,
              life: 1.0, decay: 0.011+Math.random()*0.012,
              r: c[0], g: c[1], b: c[2], curl: (Math.random()-0.5)*0.08,
            });
          }
          if (currentVision.canvas)
            currentVision.canvas.style.opacity = String(Math.max(0.25, 1-beyond/(br*1.5)));
        }
      } else {
        emitAccum = 0;
      }

      // ── Shape canvas ─────────────────────────────────────────────────────
      const sc = shapeCanvasRef.current;
      if (sc) {
        const sctx = sc.getContext('2d');
        if (sctx) {
          sctx.clearRect(0, 0, sc.width, sc.height);
          const scCx = sc.width/2, scCy = sc.height/2;

          if (oracle && oracle.step === 0 && currPhase === 'rendering') {
            // Fire comet trail inside the ball — drawn from screen-coord history
            const cTrail = cometTrailRef.current;
            if (cTrail.length > 1) {
              for (let i = 0; i < cTrail.length; i++) {
                const tp = cTrail[i];
                const frac = i / (cTrail.length - 1); // 0=tail, 1=head
                const cx = scCx + (tp.x - bx);
                const cy = scCy + (tp.y - by);
                let fr: number, fg: number, fb: number;
                if (frac > 0.75) {
                  const sub = (frac - 0.75) / 0.25;
                  fr = 255; fg = Math.floor(180 + sub * 75); fb = Math.floor(sub * 200);
                } else if (frac > 0.4) {
                  const sub = (frac - 0.4) / 0.35;
                  fr = 255; fg = Math.floor(45 + sub * 135); fb = 0;
                } else {
                  fr = Math.floor((frac / 0.4) * 190 + 40); fg = 0; fb = 0;
                }
                const sz = Math.max(1.5, frac * 14 + 2);
                const alpha = frac * 0.8 + 0.08;
                const grad = sctx.createRadialGradient(cx, cy, 0, cx, cy, sz * 2.2);
                grad.addColorStop(0, `rgba(${fr},${fg},${fb},${alpha})`);
                grad.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
                sctx.fillStyle = grad;
                sctx.beginPath(); sctx.arc(cx, cy, sz * 2.2, 0, Math.PI * 2); sctx.fill();
              }
              // White-hot head
              const head = cTrail[cTrail.length - 1];
              const hx = scCx + (head.x - bx), hy = scCy + (head.y - by);
              const hg = sctx.createRadialGradient(hx, hy, 0, hx, hy, 14);
              hg.addColorStop(0, 'rgba(255,255,255,1.0)');
              hg.addColorStop(0.2, 'rgba(255,240,80,0.95)');
              hg.addColorStop(0.55, 'rgba(255,110,0,0.65)');
              hg.addColorStop(1, 'rgba(255,30,0,0)');
              sctx.fillStyle = hg;
              sctx.beginPath(); sctx.arc(hx, hy, 14, 0, Math.PI * 2); sctx.fill();
            }

          } else if (oracle && oracle.step === 2 && currPhase === 'rendering') {
            // Mathematical shape + tracing light
            const shapeTime = (now - oracle.shapeStartTime) / 1000;
            const scR = sc.width * 0.4;
            const shapeColors = { primary: oracle.colors[2], secondary: oracle.colors[2] };
            const result = drawShape(sctx, scCx, scCy, scR, shapeColors, oracle.response, shapeTime, oracle.shapeType);
            shapeVerticesRef.current = result.vertices;

            sctx.save();
            sctx.globalAlpha = 0.12;
            drawPattern(sctx, sc.width, shapeColors, oracle.response, oracle.seed, oracle.patternType);
            sctx.restore();

            // Pre-render shape stamp for later drag trail
            if (!shapeStampRef.current) {
              const stamp = document.createElement('canvas');
              stamp.width = 100; stamp.height = 100;
              const stctx = stamp.getContext('2d')!;
              const stColors = { primary: oracle.colors[2], secondary: oracle.colors[2] };
              drawShape(stctx, 50, 50, 42, stColors, oracle.response, shapeTime, oracle.shapeType);
              shapeStampRef.current = stamp;
            }

            // Update trace history and draw comet-tail light
            if (result.traceHead) {
              const hist = traceHistoryRef.current;
              hist.push({ ...result.traceHead, t: now });
              while (hist.length > 0 && now - hist[0].t > 550) hist.shift();

              const [sr, sg, sb] = hexToRgb(oracle.colors[2]);
              hist.forEach((tp) => {
                const age = (now - tp.t) / 550;
                const tOpacity = Math.pow(1 - age, 1.4) * 0.9;
                const tSize = Math.max((1 - age) * 5.5 + 0.8, 0.5);
                sctx.beginPath();
                sctx.arc(tp.x, tp.y, tSize, 0, Math.PI * 2);
                sctx.fillStyle = `rgba(${sr},${sg},${sb},${tOpacity})`;
                sctx.fill();
              });

              if (hist.length > 0) {
                const head = hist[hist.length - 1];
                const hg = sctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14);
                hg.addColorStop(0, `rgba(${sr},${sg},${sb},0.95)`);
                hg.addColorStop(0.3, `rgba(${sr},${sg},${sb},0.5)`);
                hg.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
                sctx.fillStyle = hg;
                sctx.beginPath();
                sctx.arc(head.x, head.y, 14, 0, Math.PI * 2);
                sctx.fill();
              }
            }
          }
          // step 1: shape canvas stays clear (words on smoke canvas)
        }
      }

      // ── Particle physics ─────────────────────────────────────────────────
      const ps = s.particles;

      // Word snake train: reposition word particles along cursor history during step 1 drag
      if (oracle && oracle.step === 1 && currPhase === 'dragging') {
        const hist = cursorTrainHistRef.current;
        if (hist.length > 0) {
          const wordParticles = ps.filter(p => p.type === 'word').reverse(); // newest first
          wordParticles.forEach((p, wIdx) => {
            const histIdx = Math.max(0, hist.length - 1 - wIdx * 7);
            const target = hist[histIdx];
            p.x += (target.x - p.x) * 0.38;
            p.y += (target.y - p.y) * 0.38;
            p.vx = 0; p.vy = 0;
            p.life = Math.min(p.life + 0.02, 0.92); // keep alive while dragging
          });
        }
      }

      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];

        if (p.type === 'word' && oracle?.step === 1 && currPhase === 'rendering') {
          // Marble physics: gravity + elastic bounce off ball wall
          p.vy += 0.075;
          p.vx *= 0.97; p.vy *= 0.97;
          p.x += p.vx; p.y += p.vy;
          const pdx = p.x - bx, pdy = p.y - by;
          const pdist = Math.hypot(pdx, pdy);
          const limit = br * 0.80;
          if (pdist > limit) {
            const nx = pdx/pdist, ny = pdy/pdist;
            const dot = p.vx*nx + p.vy*ny;
            if (dot > 0) { p.vx -= 2*dot*nx*0.55; p.vy -= 2*dot*ny*0.55; }
            p.x = bx + nx * (limit - 1); p.y = by + ny * (limit - 1);
          }
        } else if (p.type === 'word' && oracle?.step === 1 && currPhase === 'dragging') {
          // Snake train positioning handled above; skip physics here
        } else {
          // Standard smoke/buoyancy physics
          p.vx += (Math.random()-0.5)*0.12 + p.curl*Math.sin(now*0.001+i);
          p.vy += (Math.random()-0.5)*0.12 - 0.04;
          p.vx *= 0.965; p.vy *= 0.965;
          p.x += p.vx; p.y += p.vy;
        }

        if (p.type !== 'word' && p.type !== 'spark') p.size += p.growth;
        p.life -= p.decay;
        if (p.life <= 0 || p.size > 380) { ps.splice(i, 1); continue; }
      }

      // ── Render smoke canvas ───────────────────────────────────────────────
      const smokeCanvas = smokeRef.current;
      if (smokeCanvas) {
        const w = window.innerWidth, h = window.innerHeight;
        const ctx = smokeCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, w, h);

        if (s.fillOpacity > 0.001) {
          const fc = s.fillColor;
          const grad = ctx.createRadialGradient(bx, by, br*0.4, bx, by, Math.max(w,h));
          grad.addColorStop(0, `rgba(${fc[0]},${fc[1]},${fc[2]},${s.fillOpacity*0.45})`);
          grad.addColorStop(1, `rgba(${fc[0]},${fc[1]},${fc[2]},${s.fillOpacity})`);
          ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        }
        if (currPhase !== 'dragging') s.fillOpacity *= 0.985;

        ctx.globalCompositeOperation = 'screen';
        for (const p of ps) {
          if (p.type === 'word') continue;
          const a = Math.max(0, p.life);

          if (p.type === 'spark') {
            // Small glowing dot — crisp, no large gradient
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a * 0.95})`;
            ctx.fill();
            // Small halo
            const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
            hg.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${a * 0.45})`);
            hg.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
            ctx.fillStyle = hg;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2); ctx.fill();
          } else {
            // Smoke / color blob
            const rr = p.size;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
            const alpha = p.type === 'color' ? a * 0.28 : a * 0.45;
            g.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${alpha})`);
            g.addColorStop(0.5, `rgba(${p.r},${p.g},${p.b},${alpha * 0.4})`);
            g.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';

        // Step 0 drag: fire comet trail on smoke canvas (comet may be outside ball)
        if (oracle && oracle.step === 0 && currPhase === 'dragging') {
          const cTrail = cometTrailRef.current;
          if (cTrail.length > 1) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            for (let i = 0; i < cTrail.length; i++) {
              const tp = cTrail[i];
              const frac = i / (cTrail.length - 1);
              let fr: number, fg: number, fb: number;
              if (frac > 0.75) {
                const sub = (frac - 0.75) / 0.25;
                fr = 255; fg = Math.floor(180 + sub * 75); fb = Math.floor(sub * 200);
              } else if (frac > 0.4) {
                const sub = (frac - 0.4) / 0.35;
                fr = 255; fg = Math.floor(45 + sub * 135); fb = 0;
              } else {
                fr = Math.floor((frac / 0.4) * 190 + 40); fg = 0; fb = 0;
              }
              const sz = Math.max(1.5, frac * 18 + 2.5);
              const alpha = frac * 0.75 + 0.06;
              const grad = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, sz * 2.5);
              grad.addColorStop(0, `rgba(${fr},${fg},${fb},${alpha})`);
              grad.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
              ctx.fillStyle = grad;
              ctx.beginPath(); ctx.arc(tp.x, tp.y, sz * 2.5, 0, Math.PI * 2); ctx.fill();
            }
            const head = cTrail[cTrail.length - 1];
            const hg2 = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 18);
            hg2.addColorStop(0, 'rgba(255,255,255,1.0)');
            hg2.addColorStop(0.2, 'rgba(255,240,80,0.95)');
            hg2.addColorStop(0.55, 'rgba(255,110,0,0.65)');
            hg2.addColorStop(1, 'rgba(255,30,0,0)');
            ctx.fillStyle = hg2;
            ctx.beginPath(); ctx.arc(head.x, head.y, 18, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }

        // Step 2 drag: shape stamp trail on smoke canvas
        if (oracle && oracle.step === 2 && currPhase === 'dragging' && shapeStampRef.current) {
          const stamp = shapeStampRef.current;
          const trail2 = shapeTrailHistRef.current;
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          for (const tp of trail2) {
            const age = (now - tp.t) / 1400;
            const alpha = Math.pow(1 - age, 1.5) * 0.55;
            const scale = 0.55 + (1 - age) * 0.55; // 0.55–1.1× stamp size
            const sw = stamp.width * scale, sh = stamp.height * scale;
            ctx.globalAlpha = alpha;
            ctx.drawImage(stamp, tp.x - sw / 2, tp.y - sh / 2, sw, sh);
          }
          ctx.globalAlpha = 1;
          ctx.restore();
        }

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

      {!hasInteracted && (
        <div className={`hint${hintFading ? ' fade' : ''}`}>
          ask the oracle anything
        </div>
      )}

      <QuestionInput phase={phase} onSubmit={handleQuestion} hasGroqKey={groqKeyPresent} />
      <GroqSettings onKeyChange={() => setGroqKeyPresent(!!getGroqKey())} />

      <TweaksPanel>
        <TweakSection label="Visions" />
        <TweakSelect
          label="Source" value={t.generator}
          options={['random', ...GENERATORS.map(g => g.id)]}
          onChange={(v) => setTweak('generator', v)}
        />
        <TweakToggle label="Fish-eye distortion" value={t.barrelDistortion} onChange={(v) => setTweak('barrelDistortion', v)} />
        <TweakSection label="Smoke" />
        <TweakSlider label="Density" value={t.smokeDensity} min={0.3} max={2.5} step={0.1} onChange={(v) => setTweak('smokeDensity', v)} />
        <TweakSlider label="Trail length" value={t.trailLength} min={0.2} max={1.8} step={0.1} onChange={(v) => setTweak('trailLength', v)} />
        <TweakSection label="Glow" />
        <TweakColor
          label="Color" value={t.glowColor}
          options={['#48CAE4', '#FFFFFF', '#FFB347', '#FF4D9F', '#9F6DFF', '#62FF8A']}
          onChange={(v) => { setTweak('glowColor', v); defaultGlowRef.current = v as string; }}
        />
      </TweaksPanel>
    </div>
  );
}

// ── English word pools ──────────────────────────────────────────────────────────
const FONT_SIZES = [11, 13, 14, 16, 18, 20, 22];
const FONT_FAMILIES = [
  'Cinzel, serif',
  "'Cormorant Garamond', serif",
  "'IM Fell English', serif",
  "'Playfair Display', serif",
  "'Libre Baskerville', serif",
  'Georgia, serif',
  'Palatino, serif',
];

const POSH_WORDS = [
  'ephemeral', 'luminous', 'ethereal', 'gossamer', 'iridescent', 'ineffable',
  'melancholy', 'languor', 'penumbra', 'reverie', 'phosphorescent', 'evanescent',
  'quintessence', 'nebulous', 'diaphanous', 'celestial', 'elysian', 'chiaroscuro',
  'incandescent', 'tenebrous', 'crepuscular', 'numinous', 'refulgent', 'scintilla',
  'lacuna', 'quiescent', 'susurrus', 'palimpsest', 'sempiternal', 'zephyr',
  'incarnadine', 'peregrine', 'vestige', 'halcyon', 'liminal', 'transcendent',
  'umbra', 'aether', 'phantasm', 'cerulean', 'viridian', 'amaranthine',
  'pellucid', 'lambent', 'welkin', 'firmament', 'empyrean', 'sidereal',
  'coruscate', 'aureate', 'eldritch', 'abyssal', 'sanctum', 'revenant',
  'labyrinthine', 'iridescence', 'luminescence', 'solstice', 'serendipity',
  'tenebrosity', 'adumbrate', 'caliginous', 'interstice', 'lucent', 'sublime',
  'resplendent', 'scintillate', 'noctilucent', 'crepuscle', 'wraith', 'astral',
];

function pickWordParticle(fragment: string): { text: string; font: string } {
  const sz = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
  const font = `${sz}px ${FONT_FAMILIES[Math.floor(Math.random() * FONT_FAMILIES.length)]}`;
  const fragmentWords = fragment.split(/\s+/).filter(Boolean);
  const pool = [...fragmentWords, ...POSH_WORDS];
  return { text: pool[Math.floor(Math.random() * pool.length)], font };
}

function wordColor(baseHex: string, idx: number): [number, number, number] {
  const [h, s, l] = hexToHsl(baseHex);
  return hexToRgb(hslToHex(h + ((idx * 23) % 50) - 25, clamp(s, 30, 98), clamp(l, 35, 98)));
}

// Preview words seeded inside the ball with marble-like velocities (all English)
function emitPreviewWords(
  fragment: string, color: string, particles: Particle[],
  bx: number, by: number, br: number
) {
  const fragmentWords = fragment.split(/\s+/).filter(Boolean);
  const pool = [...fragmentWords, ...POSH_WORDS];
  const n = Math.max(10, fragmentWords.length * 4);

  for (let i = 0; i < n; i++) {
    const text = pool[Math.floor(Math.random() * pool.length)];
    const sz = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
    const font = `${sz}px ${FONT_FAMILIES[Math.floor(Math.random() * FONT_FAMILIES.length)]}`;
    const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 1.8;
    const dist = (0.1 + Math.random() * 0.55) * br * 0.78;
    const [r, g, b] = wordColor(color, i);
    const spd = 0.7 + Math.random() * 1.5;
    const spAng = Math.random() * Math.PI * 2;
    particles.push({
      x: bx + Math.cos(angle) * dist,
      y: by + Math.sin(angle) * dist,
      vx: Math.cos(spAng) * spd, vy: Math.sin(spAng) * spd,
      size: 0, growth: 0,
      life: 1.0, decay: 0.0006,
      r, g, b, curl: 0,
      type: 'word', text, font,
    });
  }
}
