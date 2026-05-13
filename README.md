# The Oracle

A generative visual experience — ask a question, receive an abstract answer. The Oracle does not explain; it reflects.

---

## How it works

When you type a question and press Enter, the Oracle runs it through several analysis layers and maps the result onto colors, a mathematical shape, and a particle system. Nothing is stored or predetermined — every response is generated fresh from the words you used.

---

## The pipeline: from question to visual

### 1. Linguistic analysis

Before anything else, the Oracle reads the raw phonology and etymology of your words.

**Syllable weight**
Each word is counted for syllables using a simplified pronunciation model (vowel-group detection with silent-e stripping). Short, punchy words (average below 1.4 syllables) increase *arousal* — the system reads urgency in brevity. Polysyllabic words (above 2.2 average) pull arousal down toward contemplation. The total syllable count also adjusts *certainty*: a terse three-word question registers as uncertain; a long, considered one as more deliberate.

**Etymological root**
Every word is matched against curated lists of ~50 high-signal words per root family, then fallback suffix/prefix heuristics:

| Root family | Examples | Elemental it evokes |
|-------------|----------|---------------------|
| Germanic / Old English | dark, blood, bone, burn, fear, dream | Fire (high arousal) or Earth (low) |
| Latin / Romance | dissolve, absence, condition, vision | Metal (high arousal) or Light (low) |
| Greek | chaos, psyche, labyrinth, catharsis | Void (high arousal) or Air (low) |
| Arabic / Sanskrit | alchemy, karma, nirvana, mandala | Shadow (high arousal) or Water (low) |

When one root family is dominant (>30% of classifiable words), it overrides the elemental ~65% of the time. A question heavy with Germanic words will tend to conjure fire or earth. Greek abstraction tends toward void or air.

---

### 2. Affect scoring

The question text is matched against 22 emotional families (grief, wonder, fury, dissolution, awe, etc.) using keyword weights. Each family has a curated vocabulary. Scores are randomized per query so the same words never guarantee the same result — the Oracle resists being gamed.

The dominant affect family determines:
- **Primary affect** — the emotional signature (used to select the shape type)
- **Valence** — negative (−1) to positive (+1), derived from the affect with noise
- **Arousal** — further modified by the syllable layer
- **Certainty** — how clearly the emotion is named, modified by question structure

---

### 3. Color derivation

Three colors are generated from `valence`, `arousal`, `certainty`, and `syllableTotal`.

Half the time the system uses **nibble-randomized hex colors** — each of the six hex digits is independently assigned to a vivid (high), medium, or low range and then shuffled across R/G/B channels. This produces maximally unexpected color combinations while preventing near-whites and near-blacks.

The other half uses **semantic HSL mapping**:
- Valence controls the hue domain (negative → purple/blue, neutral → scattered, positive → yellow/green)
- Arousal controls saturation and lightness
- Elemental type shifts the hue and desaturates or brightens it

The total syllable count of your question is folded into the color seed — the same emotional content phrased differently will produce a different color.

---

### 4. Shape selection and geometry

The primary affect maps to one of ten mathematical shape types:

| Affect(s) | Shape |
|-----------|-------|
| longing, surrender, awe | Fibonacci spiral |
| desire, defiance, hunger | Lissajous curve |
| pride | Rose curve |
| fear, dread, vertigo, shame | Hypocycloid |
| grief, stillness, peace | Interference pattern |
| anger, fury | Epitrochoid |
| wonder, joy | Phyllotaxis |
| clarity, tension | Superformula (Gielis) |
| dissolution, yearning | Modular circle |

Every shape is drawn using a seeded random number generator (mulberry32). The seed is derived from `arousal`, `certainty`, `valence`, and — crucially — the syllable total. This means "why?" and "why does everything dissolve?" share an emotional signature but produce geometrically distinct curves. The coefficients control oscillation frequency, amplitude, phase modulation depth, arm count, and harmonic composition — all derived deterministically from the seed, but the seed changes with how you worded the question.

**Shape complexity:** Each function uses phase modulation (`sin(a·θ + depth·sin(freq·θ))`), multi-harmonic composition, or dual-layer superformulas to prevent simple, predictable geometry.

---

### 5. Fragment

A short shard of language — max seven words, drawn from a multilingual pool matching the primary affect. These are not answers. They are mirrors.

---

## Interaction

The Oracle has three draggable states:

**Step 0 — Comet** Pull out a ball of fire. On release it floods the screen as smoke.

**Step 1 — Words** Pull out the sentence the Oracle generated — words trail behind the cursor like a string from a jar, each one springing toward the one ahead. Release and they scatter.

**Step 2 — Shape** The cursor leaves stamps of the Oracle's mathematical shape as you drag. They expand and dissolve.

---

## API key (optional)

Without a key the Oracle uses a local affect-mapping engine. With a [Groq API key](https://console.groq.com) (stored only in your browser's localStorage, never in code), it uses an LLM to derive the emotional signature — producing more nuanced, surprising results. The visual generation is identical either way.

---

## Technical notes

- Built with React 18 + TypeScript + Vite
- All visuals are procedurally generated on `<canvas>` — no images, no SVGs
- Physics loop runs in `requestAnimationFrame` with direct DOM mutation; React manages state only
- All randomness in shape and color generation is seeded and deterministic once the oracle response is fixed
- The linguistic analysis layer (syllables + etymology) runs entirely client-side with no external calls
