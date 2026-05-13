import { mapLocally } from './localMapper';
import type { OracleResponse } from './types';

const GROQ_KEY_STORAGE = 'oracle_groq_key';

const ORACLE_SYSTEM_PROMPT = `You are the Oracle. You perceive the emotional and archetypal truth beneath any question. You do not answer questions. You name what the question actually is.

Respond ONLY in valid JSON. No prose. No markdown. No explanation.

Extract the emotional signature of this question. Be specific and disagreeable — resist the first obvious answer. Ask: what is this person actually afraid of? What do they already know but won't say?

Return this exact schema:
{
  "primary_affect": string,
  "secondary_affect": string,
  "valence": number,
  "arousal": number,
  "certainty": number,
  "elemental": string,
  "archetypal": string,
  "fragment": string
}

primary_affect and secondary_affect must be different. Both must be one of: longing grief fear clarity desire anger wonder dread joy dissolution tension peace defiance surrender hunger awe shame pride yearning fury stillness vertigo
valence: -1.0 to 1.0
arousal: 0.0 to 1.0
certainty: 0.0 to 1.0
elemental: one of: fire water earth air void metal light shadow
archetypal: one of: the_threshold the_wound the_mirror the_descent the_return the_tower the_garden the_fire the_tide the_mask the_void
fragment: max 7 words, may use any human language, may mix languages. Must feel like a shard — not a sentence, not an answer.`;

function truncateFragment(f: string): string {
  return f.split(/\s+/).slice(0, 7).join(' ');
}

async function queryGroq(question: string, key: string): Promise<OracleResponse> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        { role: 'system', content: ORACLE_SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      temperature: 0.85,
      max_tokens: 300,
    }),
  });

  if (!response.ok) throw new Error('Groq request failed');

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty Groq response');

  // Extract JSON from response (model may wrap it in text)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Groq response');

  const parsed = JSON.parse(jsonMatch[0]) as OracleResponse;
  if (!parsed.primary_affect || !parsed.fragment) throw new Error('Invalid schema');

  parsed.fragment = truncateFragment(parsed.fragment);
  parsed.valence = Math.max(-1, Math.min(1, parsed.valence ?? 0));
  parsed.arousal = Math.max(0, Math.min(1, parsed.arousal ?? 0.5));
  parsed.certainty = Math.max(0, Math.min(1, parsed.certainty ?? 0.5));

  return parsed;
}

export function getGroqKey(): string {
  try { return localStorage.getItem(GROQ_KEY_STORAGE) || ''; }
  catch { return ''; }
}

export function setGroqKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(GROQ_KEY_STORAGE, key.trim());
    else localStorage.removeItem(GROQ_KEY_STORAGE);
  } catch { /* noop */ }
}

export async function queryOracle(question: string): Promise<OracleResponse> {
  const key = getGroqKey();

  if (key) {
    try {
      return await queryGroq(question, key);
    } catch {
      // Silently fall back to local mapper
    }
  }

  return mapLocally(question);
}
