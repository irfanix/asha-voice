// ------------------------------------------------------------------
// POST /api/message
//
// Generates a short, warm family message in the family's language.
// This is the "message" endpoint that powers:
//   - the family message card after saving a visit
//   - the "why the referral matters" note on a red alert
//   - vaccine reminders
//
// Rules for the LLM:
//   - Under 60 words
//   - Simple words, warm tone
//   - Never alarming
//   - Always one clear action + a date when relevant
//
// If the LLM is unavailable, we return a locally-written fallback so
// the ASHA is never blocked.
// ------------------------------------------------------------------

import { z } from 'zod';

const RequestSchema = z.object({
  person_name: z.string().max(120).optional().default(''),
  visit_type: z.string().max(40).optional().default('other'),
  alert_level: z.enum(['red', 'amber', 'green']),
  reasons: z.array(z.string().max(400)).max(10).optional().default([]),
  language: z.enum(['en', 'hi', 'te']),
});

// -------------------- Fallback messages (no LLM needed) --------------------
function fallbackMessage({ person_name, alert_level, language }) {
  const name = person_name || '';
  if (language === 'te') {
    if (alert_level === 'red') {
      return `${name} గారు, మీ ఆరోగ్యం ముఖ్యం. దయచేసి ఈ రోజే దగ్గరి PHC కి వెళ్లి పరీక్ష చేయించుకోండి. ఆశా వచ్చి సహాయం చేస్తుంది.`;
    }
    if (alert_level === 'amber') {
      return `${name} గారు, మీ ఆరోగ్యం గమనిస్తున్నాం. 1-3 రోజుల్లో మళ్లీ చూస్తాము. ఏదైనా ఇబ్బంది ఉంటే PHC కి వెళ్లండి.`;
    }
    return `${name} గారు, ఈ రోజు ఆరోగ్యం బాగానే ఉంది. తదుపరి సందర్శన లేదా టీకా మర్చిపోవద్దు.`;
  }
  if (language === 'hi') {
    if (alert_level === 'red') {
      return `${name} जी, आपकी सेहत ज़रूरी है। कृपया आज ही नज़दीकी PHC जाकर जाँच कराएँ। आशा मदद के लिए आएगी।`;
    }
    if (alert_level === 'amber') {
      return `${name} जी, हम आपकी सेहत पर नज़र रख रहे हैं। 1-3 दिन में फिर मिलेंगे। कोई तकलीफ हो तो PHC जाएँ।`;
    }
    return `${name} जी, आज सब ठीक है। अगली विज़िट या टीके की तारीख याद रखें।`;
  }
  if (alert_level === 'red') {
    return `${name || 'Namaste'}, your health is important. Please visit the nearest PHC today for a check-up. Your ASHA will help you.`;
  }
  if (alert_level === 'amber') {
    return `${name || 'Namaste'}, we are keeping an eye on your health. We will visit again in 1-3 days. If you feel unwell, please go to the PHC.`;
  }
  return `${name || 'Namaste'}, today everything looks fine. Please remember the next visit or vaccine date.`;
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
      temperature: 0.5,
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

  const { person_name, visit_type, alert_level, reasons, language } = parsed.data;

  // If the LLM is not configured, return the fallback immediately.
  const env = {
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
  };
  if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) {
    return res.status(200).json({
      message: fallbackMessage({ person_name, alert_level, language }),
      source: 'fallback',
    });
  }

  const systemPrompt = `You write short, warm, simple family health messages on behalf of an ASHA (community health worker) in India.

STRICT RULES:
1. Under 60 words.
2. Use simple words a family in a village can understand, in the requested language.
3. Never alarming. Never diagnostic. Do not name any disease.
4. Always include ONE clear action and, when relevant, a date or timeframe.
5. Warm and respectful tone. Address the family, not the ASHA.
6. No emojis. No markdown. No bullet points. Just a short message.
7. Language to reply in: ${language === 'te' ? 'Telugu' : language === 'hi' ? 'Hindi' : 'English'}.`;

  const userPrompt = `Visit type: ${visit_type}
Alert level: ${alert_level}
Family member name: ${person_name || '(not given)'}
Reasons (from the danger-sign engine):
${reasons.length ? '- ' + reasons.join('\n- ') : '(none)'}

Write the family message now.`;

  try {
    const message = await callLLM(systemPrompt, userPrompt, env);
    if (!message || message.length < 5) throw new Error('Empty message');
    return res.status(200).json({ message, source: 'llm' });
  } catch {
    // Never fail this endpoint — always fall back gracefully.
    return res.status(200).json({
      message: fallbackMessage({ person_name, alert_level, language }),
      source: 'fallback',
    });
  }
}