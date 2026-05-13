import { hslToHex, clamp, mulberry32 } from '../utils';
import type { OracleResponse, ColorPair } from './types';

// Randomize each nibble of R/G/B to produce vivid, non-white colors.
// Ensures at least one channel is high (vivid), one is low (saturated), no near-white.
function nibbleColor(seed: number): string {
  const rng = mulberry32(seed);
  // Generate 6 independent nibbles (0–15), then arrange for vividness:
  // One channel: high (10–15), one: medium (3–9), one: low (0–5)
  // Shuffle which channel gets which range
  const high = Math.floor(rng() * 6 + 10);  // 10–15
  const mid  = Math.floor(rng() * 7 + 3);   // 3–9
  const low  = Math.floor(rng() * 6);        // 0–5
  // Second nibble of each byte: fully random 0–15 for fine-grain variation
  const h2 = Math.floor(rng() * 16);
  const m2 = Math.floor(rng() * 16);
  const l2 = Math.floor(rng() * 16);
  // Shuffle channel order
  const order = Math.floor(rng() * 6);
  const channels: [[number,number],[number,number],[number,number]] =
    order === 0 ? [[high,h2],[mid,m2],[low,l2]] :
    order === 1 ? [[high,h2],[low,l2],[mid,m2]] :
    order === 2 ? [[mid,m2],[high,h2],[low,l2]] :
    order === 3 ? [[mid,m2],[low,l2],[high,h2]] :
    order === 4 ? [[low,l2],[high,h2],[mid,m2]] :
                  [[low,l2],[mid,m2],[high,h2]];
  const hex = (n1: number, n2: number) => (n1 * 16 + n2).toString(16).padStart(2, '0');
  return `#${hex(...channels[0])}${hex(...channels[1])}${hex(...channels[2])}`;
}

// Shared base hue derivation used by both export functions
function deriveBase(response: OracleResponse): { h: number; s: number; v: number } {
  const { valence, arousal, elemental } = response;

  // Valence → base hue (wider range, more variety)
  let baseHue: number;
  if      (valence < -0.65) baseHue = 250 + (Math.random() - 0.5) * 40;
  else if (valence < -0.25) baseHue = 195 + (Math.random() - 0.5) * 50;
  else if (valence <  0.25) baseHue = [280, 30, 320, 190, 60][Math.floor(Math.random() * 5)];
  else if (valence <  0.65) baseHue = 45  + (Math.random() - 0.5) * 50;
  else                      baseHue = 100 + (Math.random() - 0.5) * 50;

  // Arousal → saturation + value — keep saturation high to avoid muddy/white
  let sat: number, val: number;
  if      (arousal > 0.7) { sat = 72 + arousal * 18; val = 50 + arousal * 20; }
  else if (arousal > 0.3) { sat = 55 + arousal * 30; val = 38 + arousal * 32; }
  else                    { sat = 50 + arousal * 40;  val = 30 + arousal * 50; }

  let hShift = 0, satShift = 0, valShift = 0;
  switch (elemental) {
    case 'fire':   hShift = (20 - baseHue) * 0.5; satShift = +18; break;
    case 'water':  hShift = (210 - baseHue) * 0.4; satShift = -8; valShift = -5; break;
    case 'earth':  satShift = -15; valShift = -10; break;
    case 'air':    satShift = -15; valShift = +12; break; // reduced to avoid white
    case 'void':   satShift = -25; val = clamp(val - 20, 8, 32); break;
    case 'metal':  satShift = -18; val = arousal > 0.5 ? clamp(val + 15, 52, 80) : clamp(val - 15, 8, 38); break;
    case 'light':  satShift = -10; valShift = +10; break; // reduced from +30 to avoid white
    case 'shadow': satShift = -15; val = clamp(val - 18, 8, 32); hShift = -25; break;
  }

  return {
    h: baseHue + hShift,
    s: clamp(sat + satShift, 42, 95), // min 42 saturation → always vivid
    v: clamp(val + valShift, 22, 70), // max 70 → never near-white
  };
}

// Three perceptually distinct colors — one per oracle step
export function deriveThreeColors(response: OracleResponse): [string, string, string] {
  const syllTerm = Math.round((response.syllableTotal ?? 0) * 137);
  const seed = Math.round(response.arousal * 11117 + response.certainty * 7331 + Math.abs(response.valence) * 4909) + syllTerm;
  const rng  = mulberry32(seed);

  // 50% chance: use nibble-randomized colors for maximum variety
  if (rng() < 0.50) {
    const c0 = nibbleColor(seed);
    const c1 = nibbleColor(seed + 97);
    const c2 = nibbleColor(seed + 199);
    return [c0, c1, c2];
  }

  // Otherwise: oracle-semantic colors with extra randomization
  const { h, s, v } = deriveBase(response);

  // Wider hue spreads + randomized offsets prevent the 3 colors clustering
  let h1Off: number, h2Off: number;
  const roll = rng();
  if (roll < 0.33) {
    h1Off = 30 + rng() * 60;   // analogous-ish
    h2Off = 90 + rng() * 80;
  } else if (roll < 0.66) {
    h1Off = 130 + rng() * 50;  // split-complementary
    h2Off = 200 + rng() * 60;
  } else {
    h1Off = 110 + rng() * 20;  // triadic
    h2Off = 220 + rng() * 20;
  }

  // Keep lightness well below white-threshold
  const v0 = clamp(v, 28, 68);
  const v1 = clamp(v + rng() * 18 - 6, 28, 68);
  const v2 = clamp(v + rng() * 18 - 6, 28, 68);
  const s0 = clamp(s, 48, 95);
  const s1 = clamp(s * (0.85 + rng() * 0.3), 44, 95);
  const s2 = clamp(s * (0.80 + rng() * 0.3), 40, 95);

  return [
    hslToHex(h,           s0, v0),
    hslToHex(h + h1Off,   s1, v1),
    hslToHex(h + h2Off,   s2, v2),
  ];
}

export function deriveColors(response: OracleResponse): ColorPair {
  const { h, s, v } = deriveBase(response);
  const syllTerm = Math.round((response.syllableAvg ?? 0) * 1000 * 89);
  const seed = Math.round(response.certainty * 9871 + response.arousal * 6199) + syllTerm;
  const rng = mulberry32(seed);
  const hOff = rng() < 0.5 ? 140 + rng() * 40 : -(140 + rng() * 40);
  return {
    primary:   hslToHex(h,        clamp(s, 48, 95), clamp(v, 28, 68)),
    secondary: hslToHex(h + hOff, clamp(s * 0.88, 42, 92), clamp(v * 0.92 + 5, 28, 68)),
  };
}
