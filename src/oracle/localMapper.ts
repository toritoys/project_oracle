import type { OracleResponse, AffectFamily, Elemental, Archetypal } from './types';

// Keyword affect scoring
const KEYWORD_WEIGHTS: Record<AffectFamily, [string[], number]> = {
  grief:       [['loss','gone','dead','miss','left','never','goodbye','end','over','died','passed','without'], 1.4],
  fear:        [['afraid','scared','wrong','fail','late','mistake','lose','cant','cannot','worried','panic','terror'], 1.3],
  longing:     [['want','wish','still','remember','used','anymore','someday','miss','far','distance','once'], 1.2],
  anger:       [['why','unfair','always','hate','enough','tired','sick','rage','again','keep','stop'], 1.3],
  clarity:     [['know','understand','see','realize','finally','truth','clear','certain','sure','found'], 1.2],
  wonder:      [['how','possible','imagine','could','strange','maybe','what','mysterious','wonder'], 1.1],
  dissolution: [['nothing','pointless','empty','matter','care','numb','hollow','void','meaningless'], 1.4],
  joy:         [['love','happy','grateful','excited','yes','wonderful','beautiful','thankful','glad'], 1.3],
  tension:     [['should','have','trying','keep','hold','between','both','must','need','torn'], 1.1],
  peace:       [['okay','enough','accept','let','ready','done','rest','calm','still','quiet'], 1.2],
  desire:      [['want','need','crave','ache','hunger','pull','drawn','drawn'], 1.1],
  defiance:    [['refuse','wont','never','fight','no','resist','defy','against'], 1.2],
  hunger:      [['need','more','never','enough','starving','ache','craving'], 1.1],
  dread:       [['dread','doom','inevitable','coming','closing','dark','shadows'], 1.3],
  shame:       [['shame','wrong','bad','fault','worthless','deserve','failed','broken'], 1.3],
  pride:       [['proud','strength','made','built','overcame','earned','rose'], 1.1],
  yearning:    [['yearning','longing','ache','far','return','home','back','before'], 1.2],
  fury:        [['fury','rage','burn','destroy','scream','explode','hate'], 1.4],
  stillness:   [['still','quiet','silent','pause','breath','wait','holding'], 1.1],
  vertigo:     [['lost','spinning','falling','unstable','ground','floor','where'], 1.2],
  surrender:   [['give','let','accept','release','letting','surrender','go'], 1.1],
  awe:         [['awe','vast','infinite','universe','cosmic','overwhelm','wonder'], 1.2],
};

// Arousal modifiers from question structure
function detectArousal(q: string): number {
  let arousal = 0.5;
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.length < 6) arousal += 0.3;
  if (q.includes('!')) arousal += 0.4;
  if (q === q.toLowerCase() && !/[.!?]/.test(q)) arousal -= 0.2;
  if ((q.match(/\?/g) || []).length > 1) arousal += 0.3;
  if (words.length === 1) arousal = 0.2;
  return Math.max(0.05, Math.min(1.0, arousal));
}

// Valence from affect family
const VALENCE_MAP: Partial<Record<AffectFamily, number>> = {
  joy: 0.65, clarity: 0.55, wonder: 0.45, peace: 0.4, pride: 0.5, awe: 0.6,
  grief: -0.7, fear: -0.65, dissolution: -0.8, dread: -0.75, shame: -0.7,
  anger: -0.3, tension: -0.25, fury: -0.5, defiance: -0.2,
  longing: -0.3, yearning: -0.3, desire: -0.1,
  hunger: -0.15, stillness: 0.1, vertigo: -0.4, surrender: 0.15,
};

// Elemental mapping from primary affect
const ELEMENTAL_MAP: Partial<Record<AffectFamily, Elemental>> = {
  grief: 'water', dissolution: 'water', surrender: 'water', stillness: 'water',
  anger: 'fire', fury: 'fire', defiance: 'fire',
  fear: 'void', dread: 'void', shame: 'void',
  clarity: 'light', wonder: 'light', pride: 'light', awe: 'earth',
  longing: 'air', yearning: 'air', peace: 'air',
  tension: 'metal', hunger: 'metal', desire: 'metal',
  joy: 'earth', vertigo: 'shadow',
};

// Archetypal mapping from elemental + certainty
function selectArchetypal(elemental: Elemental, certainty: number, primary: AffectFamily): Archetypal {
  const map: Record<Elemental, Archetypal[]> = {
    water:  ['the_tide', 'the_mirror', 'the_descent'],
    fire:   ['the_fire', 'the_wound', 'the_threshold'],
    void:   ['the_void', 'the_tower', 'the_descent'],
    light:  ['the_garden', 'the_return', 'the_mirror'],
    air:    ['the_threshold', 'the_return', 'the_tide'],
    metal:  ['the_wound', 'the_mask', 'the_threshold'],
    earth:  ['the_garden', 'the_return', 'the_tower'],
    shadow: ['the_mask', 'the_void', 'the_descent'],
  };
  const choices = map[elemental] || ['the_threshold'];
  if (certainty > 0.65) return choices[0];
  if (certainty > 0.35) return choices[1];
  return choices[2] || choices[0];
}

// Fragment library — ~8 per family, multilingual shards
const FRAGMENTS: Record<AffectFamily, string[]> = {
  grief: [
    '나는 아직도 여기 있어',
    'it did not wait',
    'الغياب ثقيل',
    'noch immer',
    'something left before you did',
    'le manque a une forme',
    'it was real',
    'a presença do que foi',
  ],
  fear: [
    'the door was always open',
    'zu spät zu früh',
    'يأتي ما تخشاه',
    'you already knew this',
    'the fall was slow',
    'ça va venir',
    'still there when you look away',
    '恐怖は静かに来る',
  ],
  longing: [
    'somewhere you still exist',
    'encore une fois',
    'هناك مكان ما',
    'you were almost there',
    'der Weg zurück',
    'いつかまた',
    'it remembers you',
    'remains unreachable',
  ],
  anger: [
    'enough',
    'warum immer du',
    'لا يكفي أبدًا',
    'es reicht',
    'the wound that keeps speaking',
    'ainda não acabou',
    'not again',
    '火はまだ消えていない',
  ],
  clarity: [
    'you already knew',
    'الآن تفهم',
    'es war immer so',
    'tu savais déjà',
    'it was there the whole time',
    'ずっとそこにあった',
    'now you see',
    'sempre foi assim',
  ],
  wonder: [
    'what if it is true',
    'まだ始まっていない',
    'ماذا لو كان حقيقياً',
    'et si tout était possible',
    'the edge of the known',
    'was wäre wenn',
    'something is becoming',
    '이제 시작이야',
  ],
  dissolution: [
    'nothing requires your attention',
    'ça n a pas de nom',
    'لا شيء يحتاج منك',
    'es hat keinen Namen mehr',
    'the shape has no center',
    'nem começo nem fim',
    'already dissolving',
    '何も残らない',
  ],
  joy: [
    '이미 충분해',
    'it was always here',
    'كان هنا دائماً',
    'das war immer da',
    'c était là depuis le début',
    'já estava aqui',
    'full and complete',
    '今この瞬間に',
  ],
  tension: [
    'both things are true',
    'zwischen allem',
    'كلاهما صحيح',
    'les deux à la fois',
    'holding two truths',
    'ainda nos dois lados',
    'neither and both',
    'どちらでもある',
  ],
  peace: [
    'you can stop now',
    'va bene così',
    'يمكنك أن تتوقف',
    'c est assez maintenant',
    'es ist genug',
    'está bem assim',
    'let it rest',
    'もういい',
  ],
  desire: [
    'it pulls without asking',
    'le désir n a pas de nom',
    'الشوق بلا اسم',
    'die Sehnsucht kennt keinen Grund',
    'toward without knowing',
    'sem saber por quê',
    'the ache has a direction',
    '引力がある',
  ],
  defiance: [
    'still here',
    'ich weiche nicht',
    'ما زلت هنا',
    'je ne cède pas',
    'the no that holds',
    'não recuo',
    'refusing the ending',
    'まだ倒れていない',
  ],
  hunger: [
    'more is not the answer',
    'der Hunger kennt kein Ende',
    'الجوع لا يشبع',
    'jamais assez',
    'the wanting grows',
    'nunca é suficiente',
    'always one more',
    '渇望は続く',
  ],
  dread: [
    'it is coming slowly',
    'das Kommende wirft Schatten',
    'ما يأتي يُلقي ظلاً',
    'ce qui vient assombrit',
    'the shadow before the thing',
    'sombra antes do peso',
    'inevitable and near',
    '影がある',
  ],
  shame: [
    'you were not supposed to',
    'la honte n a pas de fond',
    'العار لا قرار له',
    'die Scham ohne Boden',
    'seen and not seen',
    'visto e não visto',
    'it keeps its shape',
    '見られてしまった',
  ],
  pride: [
    'you made this',
    'tu as survécu',
    'أنت صنعت هذا',
    'du hast es geschafft',
    'the cost was worth it',
    'sobreviveste',
    'it stands',
    'あなたが作った',
  ],
  yearning: [
    'the return never comes',
    'die Rückkehr gibt es nicht',
    'العودة لا تأتي',
    'le retour sans chemin',
    'backwards through time',
    'o caminho de volta fechou',
    'the before you cannot reach',
    '戻れない',
  ],
  fury: [
    'burn it all',
    'alles brennt',
    'كل شيء يحترق',
    'tout brûle',
    'the fire answers',
    'que tudo arda',
    'ash is honest',
    '燃やすしかない',
  ],
  stillness: [
    'under everything silence',
    'unter allem Stille',
    'تحت كل شيء صمت',
    'sous tout le silence',
    'the quiet that was always',
    'sob tudo o silêncio',
    'nothing moves here',
    'すべての下に静けさ',
  ],
  vertigo: [
    'the ground was never there',
    'der Boden fehlte immer',
    'الأرض لم تكن موجودة',
    'le sol n était pas là',
    'falling without falling',
    'sem chão desde sempre',
    'nothing to land on',
    '地面はなかった',
  ],
  surrender: [
    'let it have you',
    'lass es geschehen',
    'دعه يأخذك',
    'laisse-toi',
    'the holding costs more',
    'deixa ir',
    'release is not defeat',
    '手放していい',
  ],
  awe: [
    'too large to name',
    'zu groß für Worte',
    'أكبر من أن يُسمى',
    'trop grand pour un nom',
    'the vastness has no edge',
    'grande demais para nomear',
    'you are very small and that is good',
    '名前がない大きさ',
  ],
};

// Track recently used fragments to reduce repetition (module-level, per session)
const recentFragments: string[] = [];
const MAX_RECENT = 6;

function pickFragment(family: AffectFamily): string {
  const pool = FRAGMENTS[family] || FRAGMENTS['wonder'];
  const available = pool.filter(f => !recentFragments.includes(f));
  const candidates = available.length > 0 ? available : pool;
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  recentFragments.push(chosen);
  if (recentFragments.length > MAX_RECENT) recentFragments.shift();
  return chosen;
}

function truncateFragment(f: string): string {
  const words = f.split(/\s+/);
  return words.slice(0, 7).join(' ');
}

export function mapLocally(question: string): OracleResponse {
  const q = question.toLowerCase();
  const words = q.split(/[\s,!?.]+/).filter(Boolean);

  // Score each affect family
  const scores: Record<string, number> = {};
  for (const [family, [keywords, weight]] of Object.entries(KEYWORD_WEIGHTS)) {
    let score = 0;
    for (const word of words) {
      for (const kw of keywords) {
        if (word.includes(kw) || kw.includes(word)) {
          score += weight;
        }
      }
    }
    scores[family] = score;
  }

  // Add per-query noise so scores vary each run
  for (const key of Object.keys(scores)) {
    scores[key] = scores[key] * (0.6 + Math.random() * 0.8) + Math.random() * 0.4;
  }

  // Sort by noisy score, then do a weighted random draw from top 3
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  function weightedPickTop3(offset: number): AffectFamily {
    const top3 = sorted.slice(offset, offset + 3);
    const total = top3.reduce((s, [, v]) => s + Math.max(0.01, v), 0);
    let roll = Math.random() * total;
    for (const [fam, val] of top3) {
      roll -= Math.max(0.01, val);
      if (roll <= 0) return fam as AffectFamily;
    }
    return top3[0][0] as AffectFamily;
  }
  const primaryFamily = weightedPickTop3(0);
  let secondaryFamily = weightedPickTop3(1);
  if (secondaryFamily === primaryFamily) {
    secondaryFamily = (sorted[3]?.[0] || 'peace') as AffectFamily;
  }

  const arousal = detectArousal(question);

  // Valence from primary affect with arousal influence and noise
  const baseValence = VALENCE_MAP[primaryFamily] ?? 0;
  const valence = Math.max(-1, Math.min(1,
    baseValence + (arousal - 0.5) * 0.15 + (Math.random() - 0.5) * 0.38
  ));

  // Certainty with noise
  const doubtWords = ['maybe','perhaps','might','could','unsure','know','if','wonder'];
  const hasDoubt = doubtWords.some(w => q.includes(w));
  const certainty = Math.max(0.05, Math.min(0.95,
    0.6 - (words.length / 40) * 0.3 + (hasDoubt ? -0.15 : 0.1) + (Math.random() - 0.5) * 0.42
  ));

  // 30% chance of a fully random elemental to break predictability
  const allElementals: Elemental[] = ['fire', 'water', 'earth', 'air', 'void', 'metal', 'light', 'shadow'];
  const elemental: Elemental = Math.random() < 0.3
    ? allElementals[Math.floor(Math.random() * allElementals.length)]
    : (ELEMENTAL_MAP[primaryFamily] || 'void');
  const archetypal: Archetypal = selectArchetypal(elemental, certainty, primaryFamily);
  const fragment = truncateFragment(pickFragment(primaryFamily));

  return {
    primary_affect: primaryFamily,
    secondary_affect: secondaryFamily,
    valence,
    arousal,
    certainty,
    elemental,
    archetypal,
    fragment,
  };
}
