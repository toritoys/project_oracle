# CLAUDE.md — The Oracle

> This document is the intelligence layer for The Oracle project.
> It is not a style guide. It is a **reasoning framework**.
> Claude Code must internalize this logic and use it to generate
> visual responses that are felt, not read.

---

## What This Project Is

The Oracle is a web experience where a user asks a question and receives
an abstract visual answer — composed of at most:

- **2 colors** (primary + secondary, never more)
- **1 mathematical shape** (procedurally generated, not stored)
- **1 pattern or texture** (emergent from the shape's logic)
- **1 word mesh / poem fragment** (multi-language, typographically scattered)

These elements emerge from the crystal ball as smoke — following the
physics already built into the prototype — and dissolve back into it.
Words trail as smoke and may solidify briefly into a form (a tree, a
hand, a wave) before dissolving. Shapes follow their mathematical
nature as physics. Colors bleed and spread as smoke.

The user clicks anywhere to refill the ball and ask again.

The goal: **the user should feel the answer, not understand it.**

---

## Existing Codebase to Build On

The prototype (`The_Oracle.html`, `App.tsx`) has already built:

- Crystal ball (`ball-wrap`, `ball-clip`) with fisheye SVG filter
- Smoke particle system with buoyancy, curl, turbulence physics
- Five canvas generators: `nebula`, `aurora`, `iridescence`, `starfield`, `liquid`
- Seeded PRNG (`mulberry32`) for reproducibility
- Drag-to-pull-smoke interaction
- Glass highlight overlay and animated glow ring
- `TweaksPanel` for dev controls

**Do not replace this system.** Extend it. The Oracle response replaces
the random palette/generator loop with a semantically driven one.

---

## The Sensing Logic — How Answers Are Generated

This is the core intellectual framework. Claude Code must implement
this as a mapping pipeline, not a lookup table. The relationships
below are principled, not arbitrary.

### Stage 1 — Question → Emotional Signature

Send the user's question to the Anthropic API with a system prompt
that extracts an **emotional signature** as structured JSON:

```json
{
  "primary_affect": "longing",
  "secondary_affect": "clarity",
  "valence": -0.3,
  "arousal": 0.6,
  "certainty": 0.4,
  "elemental": "water",
  "archetypal": "the_threshold"
}
```

**Affect vocabulary** (primary and secondary must differ):
`longing · grief · fear · clarity · desire · anger · wonder · dread
 joy · dissolution · tension · peace · defiance · surrender · hunger
 awe · shame · pride · yearning · fury · stillness · vertigo`

**Valence**: -1.0 (dark/negative) → +1.0 (bright/positive)
**Arousal**: 0.0 (still, heavy) → 1.0 (electric, urgent)
**Certainty**: 0.0 (ambiguous, dissolving) → 1.0 (absolute, crystalline)

**Elemental** maps the answer's physical nature:
`fire · water · earth · air · void · metal · light · shadow`

**Archetypal** (Jungian): the symbolic frame the answer inhabits:
`the_threshold · the_wound · the_mirror · the_descent · the_return
 the_tower · the_garden · the_fire · the_tide · the_mask · the_void`

---

### Stage 2 — Emotional Signature → Color Pair

**Color theory framework (Itten + Goethe + Kandinsky synthesis):**

Do not use random palettes. Derive colors mathematically from the
emotional signature. The rules:

#### Valence → Hue domain
```
valence < -0.6  →  hue range 220–280 (deep violet, indigo, near-black blue)
valence -0.6–-0.2 → hue range 180–230 (cold teal, steel, slate)
valence -0.2–0.2 → hue range 260–300 OR 20–40 (purple tension OR amber ambiguity)
valence 0.2–0.6  → hue range 30–80 (amber, gold, warm green)
valence > 0.6   →  hue range 60–160 (gold, chartreuse, living green)
```

#### Arousal → Saturation + Value
```
high arousal (>0.7): saturation 75–95%, value 55–80% (vivid, electric)
mid arousal (0.3–0.7): saturation 45–70%, value 35–65% (resonant, present)
low arousal (<0.3): saturation 15–40%, value 15–45% (muted, submerged)
```

#### Certainty → Color relationship
```
certainty > 0.7: analogous pair (hues within 30° of each other) — coherent, resolved
certainty 0.3–0.7: split-complementary (base + two colors 150° apart) — held tension
certainty < 0.3: near-complement with low saturation — irresolvable, dissolving
```

#### Elemental color modifiers (apply after hue/sat/val calculation):
```
fire   → shift hue toward 10–30°, boost saturation +15%
water  → shift hue toward 195–215°, reduce saturation -10%, cool value
earth  → desaturate -20%, push value down, add warm brown undertone
air    → near-white tint, high value (80–95%), low saturation
void   → near-black, saturation 5–20%, allow any hue at low intensity
metal  → reduce saturation, push value to extremes (very dark or very bright)
light  → high value (85–100%), any hue, saturation 20–50%
shadow → value < 25%, saturation 10–30%, cool hue bias
```

**Output**: two HSL colors → convert to hex for canvas use.
Primary color = dominant (fills atmosphere, smoke, pattern ground).
Secondary = accent (shape strokes, word color, pattern detail).

---

### Stage 3 — Emotional Signature → Mathematical Shape

Each shape has **inherent mathematical physics** — the way it moves,
dissolves, and fragments must follow its own logic. These are not
decorations. They are the argument.

#### Shape selection by affect + archetypal:

```
FIBONACCI SPIRAL
  affects: longing, yearning, surrender, awe
  archetypes: the_descent, the_return, the_tide
  physics: rotates inward with decelerating angular velocity,
           outer arms dissolve first into smoke wisps,
           leaves a fading golden ratio ghost
  formula: r = a · e^(bθ), b = ln(φ)/( π/2), φ = 1.618

LISSAJOUS FIGURE
  affects: tension, desire, defiance, hunger
  archetypes: the_wound, the_mirror, the_mask
  physics: oscillates between its two frequency modes,
           phase shifts over time causing figure-8 to breathe and invert,
           at death collapses to a single line before smoke
  formula: x = A·sin(aθ + δ), y = B·sin(bθ), vary δ over time

ROSE CURVE (rhodonea)
  affects: joy, wonder, pride, clarity
  archetypes: the_garden, the_fire, the_light
  physics: petals bloom sequentially from center,
           each petal holds briefly then softens into smoke,
           n petals determined by arousal (low=3, high=8)
  formula: r = a·cos(kθ), k = floor(3 + arousal·5)

HYPOCYCLOID / ASTROID
  affects: fear, dread, vertigo, shame
  archetypes: the_tower, the_void, the_descent
  physics: cusps spike inward rhythmically like a held breath,
           rotates slowly, cusps occasionally shed sparks (tiny smoke puffs),
           n cusps determined by certainty (low=3, high=5)
  formula: x = (a-b)cosθ + b·cos((a-b)θ/b)
           y = (a-b)sinθ - b·sin((a-b)θ/b)

INTERFERENCE PATTERN (superimposed waves)
  affects: grief, dissolution, stillness, peace
  archetypes: the_tide, the_void, the_mirror
  physics: two wave sources at offset positions,
           constructive peaks glow, destructive nodes dim,
           entire pattern slowly drifts and shifts source positions
  formula: z(x,y) = sin(d1·f1 + t) + sin(d2·f2 + t + φ),
           where d1,d2 = distance from two source points

EPITROCHOID (spirograph family)
  affects: anger, fury, hunger, defiance
  archetypes: the_fire, the_wound, the_threshold
  physics: traces at high speed, trail fades but inner loops linger,
           at peak arousal the trace overshoots and self-intersects violently,
           dissolves from outer edge inward
  formula: x = (R+r)cosθ - d·cos((R+r)θ/r)
           y = (R+r)sinθ - d·sin((R+r)θ/r)

STRANGE ATTRACTOR (Lorenz projected to 2D)
  affects: yearning, vertigo, wonder, dissolution
  archetypes: the_threshold, the_descent, the_void
  physics: traces chaotically but is bounded — never escapes the ball,
           color intensity varies with z-velocity,
           cannot be predicted, cannot be stopped, eventually stills
  formula: dx/dt = σ(y-x), dy/dt = x(ρ-z)-y, dz/dt = xy-βz
           σ=10, ρ=28, β=8/3, project (x,y) scaled to canvas
```

If no affect maps cleanly, default to **interference pattern** — the
shape of ambiguity.

---

### Stage 4 — Pattern / Texture

One pattern overlays the shape at low opacity (10–25%), rendered
on the canvas. Pattern selection by elemental + certainty:

```
VORONOI CELLS (elemental: earth, metal; certainty > 0.5)
  Generate 12–20 seed points, draw cell boundaries only (no fill).
  Cell sizes vary inversely with arousal — high arousal = small cells,
  agitated. Low arousal = large slow cells, geological.

FLOW FIELD (elemental: water, air; any certainty)
  Perlin noise vector field rendered as short strokes following
  the field direction. Stroke length scales with arousal.
  Stroke color is secondary color at low opacity.

FIBONACCI TILING (elemental: light, void; certainty > 0.6)
  Sunflower seed arrangement, dots at golden-angle increments.
  Dot radius varies with radial distance. Very low opacity.

INTERFERENCE RINGS (elemental: fire, shadow; certainty < 0.4)
  Concentric rings from 2–3 offset centers. Ring spacing varies.
  Creates moiré at overlaps. Suggests something vibrating beneath.

FRACTAL DUST (elemental: void; certainty < 0.3)
  Random walk with branching — not quite a tree, not quite static.
  Opacity very low (8–15%). Suggests something that might have been.
```

---

### Stage 5 — Word Mesh / Poem Fragment

The Oracle speaks in fragments. Not sentences. Never helpful.

#### Generation prompt (second API call, can be combined with Stage 1):
```
System: You are the Oracle's voice. You speak in fragments only.
        Max 7 words total. You may use any human language.
        You may use more than one language in the same fragment.
        You never explain. You name what is felt, not what is thought.
        Return ONLY the fragment. No punctuation except line breaks.
        Prefer: Korean, Japanese, Arabic, English, Portuguese, German.
        The fragment should feel like a shard of something larger.

User: [the question]
```

#### Word physics — smoke behavior:
Words are individual particles in the smoke system, not static text.
Each word gets its own particle with:
- Initial velocity: outward from ball center along smoke trail
- `curl` value higher than shape particles (0.15–0.35) — words drift sideways
- `decay` slightly slower than shape particles — words linger
- Rendering: instead of radial gradient blob, render the word string
  in the particle's color at opacity = particle.life
- Font: mix of serif and monospace, randomized per word, 10–18px
- Size does NOT grow with time (unlike smoke blobs) — words stay sharp
  until they fade

#### Word solidification (optional, triggers at low arousal + high certainty):
If `arousal < 0.3 && certainty > 0.6`: after all words have drifted
out of the ball, at t=3s, they begin converging toward a simple form
in the background — a tree silhouette, a hand, a horizon line.
This is done by modifying their velocity vectors to attract toward
pre-computed form skeleton points. They hold the form for ~2s then
dissolve as normal smoke.

Form shapes for solidification:
```
archetypal: the_garden, the_return → tree
archetypal: the_wound, the_threshold → hand (open)
archetypal: the_tide, the_mirror → wave / horizon
archetypal: the_descent, the_void → spiral downward
archetypal: the_tower → vertical column of light
```

---

## Smoke Physics — Canonical Rules

The existing smoke system must be preserved. These rules extend it
for Oracle-driven content:

**Shape particles** (the mathematical shape dissolves into these):
- Emit from the shape's vertices/trace as it decays
- `curl` varies by shape type (spiral: 0.04, attractor: 0.15, lissajous: 0.08)
- Color = secondary color
- Decay 40% slower than standard smoke — shapes linger

**Color particles** (pure color bleed, no form):
- Large, low-opacity blobs (size 30–80px)
- Color = primary color
- Very slow decay (0.004–0.007)
- These are the "atmosphere" — they fill the background behind shapes
- Emit simultaneously with shape particles

**Word particles**: described in Stage 5 above.

**Click-to-refill behavior**:
- Click anywhere (not just ball) collapses all active particles
  by setting their `decay` to 0.08 (fast death)
- Ball vision cross-fades to the new Oracle state
- New question input activates

---

## API Architecture

### System Prompt — The Oracle Persona

```
You are the Oracle. You perceive the emotional and archetypal truth
beneath any question. You do not answer questions. You name what the
question actually is.

Respond ONLY in valid JSON. No prose. No markdown. No explanation.

Extract the emotional signature of this question. Be specific and
disagreeable — resist the first obvious answer. Ask: what is this
person actually afraid of? What do they already know but won't say?

Return this exact schema:
{
  "primary_affect": string,
  "secondary_affect": string,
  "valence": number (-1.0 to 1.0),
  "arousal": number (0.0 to 1.0),
  "certainty": number (0.0 to 1.0),
  "elemental": string,
  "archetypal": string,
  "fragment": string (max 7 words, may use any language, may mix languages)
}

primary_affect and secondary_affect must differ.
fragment must feel like a shard — not a sentence, not an answer.
```

### Model
`claude-sonnet-4-20250514`

### Error handling
If API fails or returns malformed JSON:
- Do not show error text
- Ball dims to 30% opacity and pulses slowly
- Emit a sparse interference pattern in cool gray
- Fragment: "the oracle does not speak" (whispered, single particle)

---

## Rendering Pipeline — Per Oracle Response

1. **Receive JSON** from API
2. **Compute colors** (Stage 2 algorithm → 2 hex values)
3. **Select shape** (Stage 3 logic → shape generator function)
4. **Select pattern** (Stage 4 logic → pattern overlay function)
5. **Begin canvas render** inside ball:
   - Background floods with primary color radial gradient
   - Pattern renders at low opacity
   - Shape begins animating at center
6. **At t=0**: shape is complete, animate
7. **At t=2s**: shape begins dissolving — vertices emit smoke particles
8. **At t=0** (simultaneous): word particles emit from ball along smoke trail
9. **At t=3s**: word solidification check (see Stage 5)
10. **Ball dims** to 60% while smoke is active — smoke is the answer, not the ball
11. **Click**: collapse all particles, refill ball with new state

---

## What Claude Code Must Build (Not Already in Prototype)

1. **Oracle API integration** — `src/oracle/api.ts`
   - Send question → receive emotional signature JSON
   - Parse and validate schema
   - Export `queryOracle(question: string): Promise<OracleResponse>`

2. **Color derivation engine** — `src/oracle/colorEngine.ts`
   - Implement Stage 2 algorithm exactly as specified
   - Input: `OracleResponse` → Output: `{ primary: string, secondary: string }` (hex)
   - Must be deterministic given same emotional signature

3. **Shape generator library** — `src/oracle/shapes.ts`
   - Implement all 6 shape generators as canvas draw functions
   - Each accepts: `ctx, cx, cy, radius, colors, r (PRNG), affect, time`
   - Each has its own `dissolve(t)` method that emits particles
   - Register in a map keyed by affect

4. **Pattern library** — `src/oracle/patterns.ts`
   - Implement all 5 patterns as canvas overlay functions
   - Render at 10–25% opacity above shape

5. **Word particle system** — extend existing `smokeRef` particle loop
   - Add `type: 'word'` to particle schema
   - Add `text: string`, `font: string`, `lang: string` fields
   - Render words in canvas draw loop (not as DOM elements)
   - Implement solidification behavior

6. **Question input** — `src/components/QuestionInput.tsx`
   - Single-line text input, fixed at bottom of viewport
   - Monospace font, no border except bottom underline
   - Placeholder: "ask the oracle"
   - Enter key submits; while Oracle is responding, input locks
   - Input fades to invisible while Oracle's response is active,
     returns after click-to-refill

7. **State machine** — extend existing `phase` state:
   - `idle` → `questioning` → `rendering` → `dissolving` → `settling` → `idle`
   - `questioning`: Oracle API call in progress, ball pulses
   - `rendering`: shape + pattern + words active
   - `dissolving`: particles fading
   - `settling`: particles gone, input fades back in

---

## Constraints — Do Not Violate

- **Max 2 colors per response.** Never more. The restraint is the point.
- **Max 1 shape per response.** Overlap is noise, not meaning.
- **Max 1 pattern per response.** Same reason.
- **All content is procedurally generated.** No stored images, no SVG assets.
- **No text on screen except**: word particles (in smoke) + question input.
  No labels, no names, no HUD text during Oracle response.
- **No loading spinners.** Ball breathes. That is the loading state.
- **Smoke physics are sacred.** The existing particle system is the medium.
  Shapes, colors, and words are content delivered through that medium.
- **The Oracle never explains itself.** No tooltips, no "here's what this means."
- **Fragment max 7 words.** If the model returns more, truncate server-side.

---

## Philosophical Contract

The Oracle's visual language is not illustration. It is not mood board.
It is translation — from language (the question) into sensation (the answer).

The shapes are chosen because their mathematics carry feeling.
A spiral is not like longing. A spiral IS longing — it approaches a center
it never reaches. A Lissajous figure is not like tension. It IS tension —
two frequencies that are almost but never quite commensurate.

The colors are not chosen to look nice. They are derived from the emotional
valence of the answer using established chromatic theory (Goethe's color
psychology, Itten's contrast theory, Kandinsky's form-color correspondences).
Warm hues with high saturation are not "warm." They are metabolically
activating. Cool desaturated hues are not "cold." They are cognitively
distancing. These are not metaphors. They are physiological facts.

When Claude Code makes implementation decisions not covered by this document,
the guiding question is: **does this make the answer more felt, or more seen?**
If more seen, find a different approach.
