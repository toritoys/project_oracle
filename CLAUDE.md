# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

No build step. Open `orcale_visual/The Oracle.html` directly in a browser. React 18, ReactDOM, and Babel are loaded from CDN (unpkg); JSX is transpiled in-browser at runtime.

## What this project is

The Oracle is a web experience where a user asks a question and receives an abstract visual answer — composed of at most 2 colors, 1 mathematical shape, 1 pattern/texture, and 1 word mesh rendered as smoke particles. The goal: **the user should feel the answer, not understand it.**

## Existing codebase

The prototype in `orcale_visual/` has three files:

**`The Oracle.html`** — entry point + main React app (`OracleApp`) inline as a `type="text/babel"` block. Loads two sibling scripts, manages the three-phase state machine (`idle → dragging → settling`), and runs the particle physics loop in `requestAnimationFrame`.

**`visions.jsx`** — procedural canvas generators. Exposes `window.Visions = { GENERATORS, PALETTES, generateVision }`. Each generator: `(ctx, size, palette, rand) => void`. 10 generators: nebula, aurora, colorField, iridescence, topo, voronoi, starfield, liquid, ribbons, smoke. `generateVision({ size, generatorId, paletteIndex, seed })` returns `{ canvas, generator, palette, seed }`. All randomness uses `mulberry32(seed)` for reproducibility.

**`tweaks-panel.jsx`** — floating dev-controls shell. Exposes `useTweaks`, `TweaksPanel`, and all `Tweak*` controls via `window.*`. Tweak defaults in the HTML are bracketed by `/*EDITMODE-BEGIN*/.../*EDITMODE-END*/`; the host rewrites that block on disk when tweaks change. The `useTweaks(defaults)` hook posts `__edit_mode_set_keys` to `window.parent`.

`orcale_visual/App.tsx` and `orcale_visual/extracted/` are earlier design iterations (image-based, not canvas-based) — reference only.

### Interaction flow

Ball has 3 phases. Mouse/touch down over ball → `dragging`: smoke particles emit from the ball edge toward the cursor, coloured from the current vision's palette. Release → `releaseSmoke()`: burst of particles floods the screen, ball vision fades, new vision generates at 1 s, returns to `idle` at 2.2 s. The particle system writes directly to DOM refs each frame; React state only tracks phase, current vision, and tweak values.

### Glow system

CSS custom properties `--glow-mid/soft/strong/faint` are computed from `t.glowColor` (hex) and set on `document.documentElement`. All visual elements reference these vars.

## What still needs to be built

The full Oracle intelligence described in `CLAUDE.md.md` — do **not** replace the existing smoke/physics system; extend it. Key modules to add:

- `src/oracle/api.ts` — `queryOracle(question)` → structured emotional signature JSON via Anthropic API (model: `claude-sonnet-4-20250514`). Schema: `{ primary_affect, secondary_affect, valence, arousal, certainty, elemental, archetypal, fragment }`.
- `src/oracle/colorEngine.ts` — deterministic color derivation from emotional signature (valence → hue domain, arousal → saturation/value, certainty → color relationship, elemental modifier). Returns `{ primary, secondary }` hex.
- `src/oracle/shapes.ts` — 6 mathematical shape generators (Fibonacci spiral, Lissajous, rose curve, hypocycloid, interference pattern, epitrochoid, strange attractor), each with a `dissolve(t)` that emits particles from the shape's vertices.
- `src/oracle/patterns.ts` — 5 overlay patterns (Voronoi cells, flow field, Fibonacci tiling, interference rings, fractal dust) rendered at 10–25% opacity.
- Word particle type — extend the existing particle schema with `type: 'word'`, `text`, `font`, `lang`; render via `ctx.fillText` instead of radial gradient; implement optional solidification into archetypal forms.
- `src/components/QuestionInput.tsx` — monospace underline-only input, locks during API call, fades while Oracle response is active.
- Extended state machine: `idle → questioning → rendering → dissolving → settling → idle`.

### Hard constraints (from spec)

- Max 2 colors, 1 shape, 1 pattern per response.
- All content procedurally generated — no stored images or SVG assets.
- No text on screen except word particles + question input during an Oracle response.
- No loading spinners; the ball's breathing pulse is the loading state.
- Fragment max 7 words; truncate server-side if model returns more.
- On API failure: dim ball to 30%, emit sparse gray interference pattern, fragment "the oracle does not speak".
