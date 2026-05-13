export type AffectFamily =
  | 'grief' | 'fear' | 'longing' | 'anger' | 'clarity'
  | 'wonder' | 'dissolution' | 'joy' | 'tension' | 'peace'
  | 'desire' | 'defiance' | 'hunger' | 'dread' | 'shame'
  | 'pride' | 'yearning' | 'fury' | 'stillness' | 'vertigo'
  | 'surrender' | 'awe';

export type Elemental = 'fire' | 'water' | 'earth' | 'air' | 'void' | 'metal' | 'light' | 'shadow';

export type Archetypal =
  | 'the_threshold' | 'the_wound' | 'the_mirror' | 'the_descent' | 'the_return'
  | 'the_tower' | 'the_garden' | 'the_fire' | 'the_tide' | 'the_mask' | 'the_void';

export type ShapeType = 'fibonacci' | 'lissajous' | 'rose' | 'hypocycloid' | 'interference' | 'epitrochoid' | 'attractor' | 'phyllotaxis' | 'superformula' | 'modular_circle';

export type PatternType = 'voronoi' | 'flow' | 'fibonacci_tiling' | 'interference_rings' | 'fractal_dust';

export type RootFamily = 'latin' | 'greek' | 'germanic' | 'arabic_sanskrit';

export interface OracleResponse {
  primary_affect: AffectFamily;
  secondary_affect: AffectFamily;
  valence: number;
  arousal: number;
  certainty: number;
  elemental: Elemental;
  archetypal: Archetypal;
  fragment: string;
  // Linguistic enrichment (filled by analyzeLinguistics on the raw question)
  syllableAvg?: number;
  syllableTotal?: number;
  dominantRoot?: RootFamily;
}

export interface ColorPair {
  primary: string;
  secondary: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  growth: number;
  life: number;
  decay: number;
  r: number;
  g: number;
  b: number;
  curl: number;
  type?: 'smoke' | 'word' | 'color' | 'spark';
  text?: string;
  font?: string;
  wordIdx?: number;
  charIdx?: number;
  fontSize?: number;
}

export type PhaseState = 'idle' | 'questioning' | 'rendering' | 'dissolving' | 'settling' | 'dragging';

export interface ShapeResult {
  vertices: Array<{ x: number; y: number }>;
  traceHead?: { x: number; y: number };
}
