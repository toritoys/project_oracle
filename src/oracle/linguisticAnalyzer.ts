import type { RootFamily } from './types';

export interface LinguisticProfile {
  avgSyllables: number;
  totalSyllables: number;
  dominantRoot: RootFamily | null;
  rootDistribution: Record<RootFamily, number>;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 2) return 1;
  const stripped = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const m = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

// High-signal word lists per root family
const GERMANIC = new Set([
  'dark','death','dream','blood','bone','fire','earth','night','fear','hate',
  'love','heart','home','soul','ghost','breath','flesh','burn','wake','fell',
  'dread','bold','grief','want','hold','break','cold','deep','free','lost',
  'still','stand','true','hard','hurt','feel','fall','know','help','speak',
  'think','find','keep','say','let','give','live','die','see','ask','run',
  'call','told','gone','left','came','felt','made','took','knew','went',
  'old','young','wide','long','loud','low','high','thick','thin','back',
  'head','hand','eye','ear','mouth','foot','rock','wood','water','sun',
  'moon','star','wind','rain','snow','ice','leaf','seed','root','thorn',
]);

const LATIN = new Set([
  'illuminate','dissolve','absence','presence','memory','condition','decision',
  'resolution','transformation','perception','expression','information','motivation',
  'inspiration','separation','intention','attention','reflection','perfection',
  'protection','connection','direction','creation','emotion','sensation','tension',
  'vision','mission','passion','reason','nature','culture','future','feature',
  'measure','pleasure','desire','define','contain','explain','obtain','remain',
  'retain','sustain','exist','persist','resist','assist','insist','consist',
  'moment','motion','nation','station','fiction','action','fraction','function',
  'justice','violence','silence','science','distance','patience','absence','substance',
  'image','language','courage','damage','manage','passage','message','village',
  'accept','affect','collect','connect','correct','detect','direct','effect',
  'inject','object','protect','reject','select','subject','expect','respect',
]);

const GREEK = new Set([
  'chaos','cosmos','psyche','phantom','myth','logos','ether','abyss','chasm',
  'therapy','crisis','phase','basis','axis','thesis','analysis','synthesis',
  'paradox','mystery','theory','echo','euphoria','melancholy','apathy','catharsis',
  'stigma','trauma','genesis','epoch','alpha','omega','chrysalis','phoenix',
  'labyrinth','enigma','pathos','ethos','logos','cosmos','eros','thanatos',
  'phobia','mania','trophy','trophy','rhythm','rhyme','lyric','epic','drama',
  'logic','magic','music','physics','ethics','aesthetics','sympathy','empathy',
  'telepathy','philosophy','psychology','biology','theology','mythology','ecology',
  'democracy','hierarchy','monarchy','anarchy','oligarchy','bureaucracy',
]);

const ARABIC_SANSKRIT = new Set([
  'alchemy','algebra','cipher','zero','zenith','nadir','karma','nirvana',
  'mantra','chakra','yoga','avatar','guru','mandala','dharma','samsara',
  'ahimsa','maya','prana','atman','sufi','elixir','azure','safari','admiral',
  'hazard','tariff','alcohol','almanac','candy','lemon','sugar','jasmine',
  'lilac','orange','crimson','azure','cotton','magazine','sofa','coffee',
  'monsoon','typhoon','saffron','musk','amber','scarlet','crimson','indigo',
  'infinity','nirvana','samadhi','moksha','brahman','kundalini','mudra',
  'tantra','shakti','shiva','vishnu','buddha','dharma','karma','maya',
]);

function classifyByHeuristic(word: string): RootFamily | null {
  const w = word.toLowerCase();

  // Latin suffixes
  if (/(?:tion|sion|ment|ance|ence|ity|ous|ive|ible|able|ate|ify|ize)$/.test(w)) return 'latin';

  // Greek markers
  if (/(?:ology|ism|ist|ical|oid|graph|gram|phone|scope|phobia|philia)$/.test(w)) return 'greek';
  if (/ph|ps|rh|yn/.test(w) && w.length > 4) return 'greek';

  // Germanic markers
  if (/(?:ness|ful|less|ward|some|ling|ship|hood|dom)$/.test(w)) return 'germanic';
  if (w.length <= 4 && /[aeiou]/.test(w)) return 'germanic';

  return null;
}

function classifyWord(word: string): RootFamily | null {
  const w = word.toLowerCase();
  if (GERMANIC.has(w)) return 'germanic';
  if (LATIN.has(w)) return 'latin';
  if (GREEK.has(w)) return 'greek';
  if (ARABIC_SANSKRIT.has(w)) return 'arabic_sanskrit';
  return classifyByHeuristic(w);
}

export function analyzeLinguistics(question: string): LinguisticProfile {
  const words = question
    .toLowerCase()
    .split(/[\s,!?.;:'"()\-]+/)
    .filter(w => w.length > 2);

  const syllableCounts = words.map(countSyllables);
  const totalSyllables = syllableCounts.reduce((s, n) => s + n, 0);
  const avgSyllables = words.length > 0 ? totalSyllables / words.length : 1.5;

  const dist: Record<RootFamily, number> = {
    latin: 0, greek: 0, germanic: 0, arabic_sanskrit: 0,
  };

  let classified = 0;
  for (const word of words) {
    const family = classifyWord(word);
    if (family) {
      dist[family]++;
      classified++;
    }
  }

  let dominantRoot: RootFamily | null = null;
  if (classified > 0) {
    const best = (Object.keys(dist) as RootFamily[])
      .sort((a, b) => dist[b] - dist[a])[0];
    // Require >30% of classified words to claim dominance
    if (dist[best] / classified > 0.30) {
      dominantRoot = best;
    }
  }

  return { avgSyllables, totalSyllables, dominantRoot, rootDistribution: dist };
}
