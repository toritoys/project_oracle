import { hslToHex, clamp } from '../utils';
import type { OracleResponse, ColorPair } from './types';

// Shared base hue derivation used by both export functions
function deriveBase(r: OracleResponse): { h: number; s: number; v: number } {
  const { valence, arousal, elemental } = r;

  let baseHue: number;
  if (valence < -0.6) baseHue = 250;
  else if (valence < -0.2) baseHue = 205;
  else if (valence < 0.2) baseHue = Math.random() < 0.5 ? 280 : 30;
  else if (valence < 0.6) baseHue = 55;
  else baseHue = 110;

  let sat: number, val: number;
  if (arousal > 0.7) { sat = clamp(75 + arousal * 20, 75, 95); val = clamp(55 + arousal * 25, 55, 80); }
  else if (arousal > 0.3) { sat = clamp(45 + arousal * 50, 45, 70); val = clamp(35 + arousal * 43, 35, 65); }
  else { sat = clamp(15 + arousal * 83, 15, 40); val = clamp(15 + arousal * 100, 15, 45); }

  let hShift = 0, satShift = 0, valShift = 0;
  switch (elemental) {
    case 'fire':   hShift = 20 - baseHue; satShift = +15; break;
    case 'water':  hShift = 205 - baseHue; satShift = -10; valShift = -5; break;
    case 'earth':  satShift = -20; valShift = -8; break;
    case 'air':    satShift = -30; valShift = +30; break;
    case 'void':   satShift = -40; val = clamp(val - 30, 5, 25); break;
    case 'metal':  satShift = -25; val = arousal > 0.5 ? clamp(val + 25, 60, 95) : clamp(val - 20, 5, 30); break;
    case 'light':  satShift = -25; valShift = +30; break;
    case 'shadow': satShift = -20; val = clamp(val - 25, 5, 25); hShift = -20; break;
  }

  return {
    h: baseHue + hShift * 0.6,
    s: clamp(sat + satShift, 5, 98),
    v: clamp(val + valShift, 5, 98),
  };
}

// Three perceptually distinct colors — one per oracle step (color, words, shape)
export function deriveThreeColors(r: OracleResponse): [string, string, string] {
  const { h, s, v } = deriveBase(r);

  // Hue offsets based on certainty (color theory relationships)
  let h1Off: number, h2Off: number;
  if (r.certainty > 0.7) {
    h1Off = 40; h2Off = 80; // analogous trio — harmonious, clear
  } else if (r.certainty > 0.3) {
    h1Off = 150; h2Off = 210; // split-complementary — tension
  } else {
    h1Off = 120; h2Off = 240; // triadic — chaotic, uncertain
  }

  // Minimum lightness 35% to avoid black-adjacent muddy tones
  const v0 = Math.max(v, 35);
  const v1 = Math.max(clamp(v + 12, 38, 98), 38);
  const v2 = Math.max(clamp(v + 6, 36, 95), 36);

  return [
    hslToHex(h,           s,                      v0),
    hslToHex(h + h1Off,   clamp(s * 0.9, 30, 98), v1),
    hslToHex(h + h2Off,   clamp(s * 0.85, 25, 95), v2),
  ];
}

export function deriveColors(r: OracleResponse): ColorPair {
  const { valence, arousal, certainty, elemental } = r;

  // Stage 2: Valence → base hue
  let baseHue: number;
  if (valence < -0.6) baseHue = 250;
  else if (valence < -0.2) baseHue = 205;
  else if (valence < 0.2) baseHue = Math.random() < 0.5 ? 280 : 30;
  else if (valence < 0.6) baseHue = 55;
  else baseHue = 110;

  // Arousal → saturation + value
  let sat: number, val: number;
  if (arousal > 0.7) { sat = clamp(75 + arousal * 20, 75, 95); val = clamp(55 + arousal * 25, 55, 80); }
  else if (arousal > 0.3) { sat = clamp(45 + arousal * 50, 45, 70); val = clamp(35 + arousal * 43, 35, 65); }
  else { sat = clamp(15 + arousal * 83, 15, 40); val = clamp(15 + arousal * 100, 15, 45); }

  // Elemental color modifier (applied to hue/sat/val)
  let hShift = 0, satShift = 0, valShift = 0;
  switch (elemental) {
    case 'fire':   hShift = 20 - baseHue; satShift = +15; break;
    case 'water':  hShift = 205 - baseHue; satShift = -10; valShift = -5; break;
    case 'earth':  satShift = -20; valShift = -8; break;
    case 'air':    satShift = -30; valShift = +30; break;
    case 'void':   satShift = -40; val = clamp(val - 30, 5, 25); break;
    case 'metal':  satShift = -25; val = arousal > 0.5 ? clamp(val + 25, 60, 95) : clamp(val - 20, 5, 30); break;
    case 'light':  satShift = -25; valShift = +30; break;
    case 'shadow': satShift = -20; val = clamp(val - 25, 5, 25); hShift = -20; break;
  }

  // Lerp elemental shift in partially (not full override)
  const primaryHue = baseHue + hShift * 0.6;
  const primarySat = clamp(sat + satShift, 5, 98);
  const primaryVal = clamp(val + valShift, 5, 98);

  // Certainty → color relationship for secondary
  let secondaryHue: number;
  if (certainty > 0.7) {
    // analogous: within 30°
    secondaryHue = primaryHue + (Math.random() < 0.5 ? 20 : -20);
  } else if (certainty > 0.3) {
    // split-complementary: ~150° apart
    secondaryHue = primaryHue + (Math.random() < 0.5 ? 150 : -150);
  } else {
    // near-complement with reduced sat
    secondaryHue = primaryHue + 175 + (Math.random() - 0.5) * 20;
  }

  const secondarySat = certainty < 0.3
    ? clamp(primarySat - 20, 5, 60)
    : clamp(primarySat * 0.85, 5, 98);
  const secondaryVal = clamp(primaryVal * 0.9 + 8, 5, 95);

  return {
    primary: hslToHex(primaryHue, primarySat, primaryVal),
    secondary: hslToHex(secondaryHue, secondarySat, secondaryVal),
  };
}
