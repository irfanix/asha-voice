// ------------------------------------------------------------------
// POST /api/ask
//
// "Ask ASHA Didi" — a Q&A endpoint that answers ONLY from a small
// curated knowledge base of guideline snippets stored in
// src/knowledge/*.md. Retrieval is a simple BM25-lite keyword score
// (no embedding service required, works with any LLM provider).
//
// Behaviour:
//   - Refuses to answer questions about doses, medicines, antibiotics.
//   - If the knowledge base has nothing relevant, says so honestly
//     and ends with "If in doubt, refer to the PHC."
//   - If the LLM is not configured, returns the top snippet as-is.
//
// The knowledge base files are read at request time from the repo,
// so editing a .md file and redeploying is enough to update answers.
// ------------------------------------------------------------------

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// -------------------- Request validation --------------------
const RequestSchema = z.object({
  question: z.string().min(1).max(500),
  language: z.enum(['en', 'hi', 'te']).default('en'),
});

// -------------------- Refusal patterns --------------------
// We refuse anything that looks like it is asking for a dose,
// medicine name, antibiotic or prescription. This is a hard safety
// rule — we do not want ASHA Voice to be interpreted as a
// prescribing tool.
const REFUSE_PATTERNS = [
  /\bdose\b/i,
  /\bmg\b/i,
  /\bml\b/i,
  /\btablet\b/i,
  /\bcapsule\b/i,
  /\bmedicine\b/i,
  /\bmedicin/i,
  /\bantibiotic/i,
  /\bparacetamol/i,
  /\bibuprofen/i,
  /\bamoxicillin/i,
  /\bprescrib/i,
  /\bhow many (mg|ml|tablets?|capsules?)/i,
  // Hindi / Telugu approximations
  /खुराक/,
  /दवा/,
  /गोली/,
  /మోతాదు/,
  /మందు/,
  /టాబ్లెట్/,
];

function isRefused(question) {
  return REFUSE_PATTERNS.some((re) => re.test(question));
}

function refusalAnswer(language) {
  if (language === 'te') {
    return 'క్షమించండి, మందుల మోతాదు లేదా మందుల పేర్ల గురించి నేను సలహా ఇవ్వలేను. దయచేసి PHC వైద్యుడిని సంప్రదించండి. సందేహం ఉంటే PHC కి రెఫర్ చేయండి.';
  }
  if (language === 'hi') {
    return 'क्षमा करें, दवा की खुराक या दवा के नाम पर मैं सलाह नहीं दे सकती। कृपया PHC डॉक्टर से मिलें। संदेह हो तो PHC को रेफर करें।';
  }
  return 'Sorry, I cannot advise on medicine doses or medicine names. Please consult the PHC doctor. If in doubt, refer to the PHC.';
}

// -------------------- Knowledge base loader --------------------
let cachedDocs = null;

function loadDocs() {
  if (cachedDocs) return cachedDocs;

  // Look for the knowledge folder in a few possible locations so
  // this works both locally and on Vercel.
  const candidates = [
    join(process.cwd(), 'src', 'knowledge'),
    join(process.cwd(), '..', 'src', 'knowledge'),
  ];

  let dir = null;
  for (const c of candidates) {
    if (existsSync(c)) {
      dir = c;
      break;
    }
  }
  if (!dir) {
    cachedDocs = [];
    return cachedDocs;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  cachedDocs = files.map((f) => ({
    source: f,
    text: readFileSync(join(dir, f), 'utf8'),
  }));
  return cachedDocs;
}

// -------------------- Retrieval (BM25-lite) --------------------
function tokenize(s) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreDoc(query, text) {
  const qTokens = new Set(tokenize(query));
  const tTokens = tokenize(text);
  const tCounts = new Map();
  for (const t of tTokens) tCounts.set(t, (tCounts.get(t) || 0) + 1);

  let score = 0;
  for (const q of qTokens) {
    if (tCounts.has(q)) {
      score += 1 + Math.log(1 + tCounts.get(q));
    }
    // small bonus for prefix matches (e.g. "feed" matches "feeding")
    if (!tCounts.has(q)) {
      for (const t of tCounts.keys()) {
        if (t.startsWith(q) || q.startsWith(t)) {
          score += 0.5;
          break;
        }
      }
    }
  }
  return score;
}

function retrieve(question, k = 3) {
  const docs = loadDocs();
  if (docs.length === 0) return [];
  const scored = docs
    .map((d) => ({ ...d, score: scoreDoc(question, d.text) }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored;
}

// -------------------- LLM call --------------------
async function callLLM(systemPrompt, userPrompt, env) {
  const url = `${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? '';
}

// -------------------- Handler --------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const { question, language } = parsed.data;

  // 1. Refuse any dosing / medicine question up front.
  if (isRefused(question)) {
    return res.status(200).json({
      answer: refusalAnswer(language),
      sources: [],
      refused: true,
    });
  }

  // 2. Retrieve relevant snippets from the curated knowledge base.
  const matches = retrieve(question, 3);

  if (matches.length === 0) {
    const noAnswer =
      language === 'te'
        ? 'ఈ ప్రశ్నకు సంబంధిత మార్గదర్శకాలు నా దగ్గర లేవు. సందేహం ఉంటే PHC కి రెఫర్ చేయండి.'
        : language === 'hi'
          ? 'इस सवाल के लिए मेरे पास मार्गदर्शन नहीं है। संदेह हो तो PHC को रेफर करें।'
          : 'I could not find this in my guidelines. If in doubt, refer to the PHC.';
    return res.status(200).json({ answer: noAnswer, sources: [] });
  }

  // 3. If LLM is not configured, return the top snippet directly.
  const env = {
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
  };
  if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) {
    return res.status(200).json({
      answer: matches[0].text.slice(0, 500),
      sources: matches.map((m) => m.source),
    });
  }

  // 4. Build the context and call the LLM.
  const context = matches
    .map((m) => `# ${m.source}\n${m.text}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are ASHA Didi, a careful, kind assistant for ASHA community health workers in India.

ABSOLUTE RULES:
1. Answer ONLY from the guideline snippets provided below. If the answer is not in the snippets, say so politely and end with "If in doubt, refer to the PHC."
2. Never diagnose.
3. Never prescribe. Never give a dose, a medicine name, or a treatment regimen.
4. Use simple, warm language a village health worker can act on.
5. Keep the answer under 90 words.
6. Reply in this language: ${language === 'te' ? 'Telugu' : language === 'hi' ? 'Hindi' : 'English'}.
7. End your answer with the sentence "If in doubt, refer to the PHC." (or its translation in the chosen language).

Return plain text only. No markdown headings. No bullet symbols.`;

  const userPrompt = `Guideline snippets:
${context}

ASHA's question: "${question}"

Answer now.`;

  try {
    const answer = await callLLM(systemPrompt, userPrompt, env);
    if (!answer || answer.length < 5) throw new Error('Empty answer');
    return res.status(200).json({
      answer,
      sources: matches.map((m) => m.source),
    });
  } catch {
    // Graceful degradation: return the top snippet verbatim.
    return res.status(200).json({
      answer: matches[0].text.slice(0, 500),
      sources: matches.map((m) => m.source),
    });
  }
}