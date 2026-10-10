// ------------------------------------------------------------------
// POST /api/extract
//
// Serverless function (Vercel Node runtime). Receives a REDACTED
// transcript from the client and returns a structured extraction
// validated by Zod. The API key lives only here, never in the browser.
//
// Flow:
//   1. Validate the request body.
//   2. Call the configured OpenAI-compatible chat completions API.
//   3. Parse the JSON response.
//   4. Validate with Zod.
//   5. If parsing or validation fails, retry ONCE with a "fix your
//      JSON" instruction.
//   6. If that also fails, return 422 — the client then falls back
//      to the keyword engine and lets the ASHA fill the record by
//      hand. Safety is NEVER dependent on this endpoint.
// ------------------------------------------------------------------

import { z } from 'zod';

// -------------------- Request validation --------------------
const RequestSchema = z.object({
  transcript: z.string().min(1).max(4000),
  visit_type: z.enum(['anc', 'postnatal', 'newborn', 'child', 'other']),
  language: z.enum(['en', 'hi', 'te']),
  context: z
    .object({
      category: z.string().optional(),
      gestational_weeks: z.number().optional(),
      age_days: z.number().optional(),
      birth_weight_g: z.number().optional(),
    })
    .optional()
    .default({}),
});

// -------------------- Response schema (must match src/ai/schemas.ts) --------------------
const VitalsSchema = z.object({
  bp_systolic: z.number().nullable().optional(),
  bp_diastolic: z.number().nullable().optional(),
  weight_kg: z.number().nullable().optional(),
  temperature_c: z.number().nullable().optional(),
  pulse: z.number().nullable().optional(),
  respiratory_rate: z.number().nullable().optional(),
});

const ExtractionSchema = z.object({
  visit_type: z.enum(['anc', 'postnatal', 'newborn', 'child', 'other']),
  vitals: VitalsSchema.default({}),
  symptoms: z.array(z.string()).default([]),
  other_symptoms: z.array(z.string()).default([]),
  observations: z.record(z.string(), z.any()).default({}),
  services: z.record(z.string(), z.any()).default({}),
  missing_checks: z.array(z.string()).default([]),
  confidence: z.record(z.string(), z.number()).default({}),
  summary_en: z.string().default(''),
});

// -------------------- System prompt --------------------
const SYSTEM_PROMPT = `You are a medical record extractor for ASHA community health workers in India.

Your ONLY job is to convert a spoken home-visit transcript into a strict JSON object. You do not diagnose and you do not prescribe.

ABSOLUTE RULES:
1. Extract ONLY what was explicitly said in the transcript. Never guess a number, a symptom or a service that was not mentioned.
2. If a value was not mentioned, use null for numbers and empty arrays for lists.
3. Symptoms must be mapped to this fixed vocabulary whenever possible:
   vaginal_bleeding, convulsions, severe_headache, blurred_vision, high_fever,
   fever (any fever that is not described as high),
   severe_abdominal_pain, swelling_face_hands, difficulty_breathing,
   reduced_fetal_movement, leaking_water, heavy_bleeding, foul_discharge,
   breast_pain, not_feeding, fast_breathing, chest_indrawing, lethargic,
   yellow_palms_soles, umbilical_redness, low_birth_weight, unable_to_drink,
   vomits_everything, severe_dehydration.
   Anything that does not fit goes into other_symptoms as short English text.
4. Blood pressure may be spoken as "150 over 100", "150/100" or in the local
   language. Extract both numbers into bp_systolic and bp_diastolic.
5. Temperature is always in Celsius. If the transcript says "37.5 degrees",
   store 37.5. If it uses Fahrenheit, convert to Celsius.
6. missing_checks: list the routine checks that were NOT mentioned and are
   expected for this visit type. For example, for ANC: "bp", "weight", "hb",
   "fetal_heart_rate". For newborn: "temperature", "weight", "breathing_rate".
7. confidence: a 0..1 number per extracted field, based on how clearly it was
   stated. If nothing was said about BP, do not include a bp entry.
8. summary_en: one short English sentence a supervisor would understand.
9. Return STRICT JSON only. No markdown fences. No prose.

Response shape:
{
  "visit_type": "anc" | "postnatal" | "newborn" | "child" | "other",
  "vitals": {
    "bp_systolic": number | null,
    "bp_diastolic": number | null,
    "weight_kg": number | null,
    "temperature_c": number | null,
    "pulse": number | null,
    "respiratory_rate": number | null
  },
  "symptoms": string[],
  "other_symptoms": string[],
  "observations": object,
  "services": object,
  "missing_checks": string[],
  "confidence": object,
  "summary_en": string
}`;

// -------------------- LLM call --------------------
async function callLLM(messages, env) {
  const url = `${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? '';
  return raw;
}

// -------------------- JSON parsing helper --------------------
// LLMs sometimes wrap JSON in ```json ... ```. Strip fences and any
// leading prose before the first {.
function parseJsonLoose(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Empty LLM response');
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('No JSON object found in LLM response');
  }
  const jsonText = s.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonText);
}

// -------------------- Handler --------------------
export default async function handler(req, res) {
  // Only POST.
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Env check.
  const env = {
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
  };
  if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) {
    return res.status(500).json({
      ok: false,
      error:
        'LLM not configured. Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in the server environment.',
    });
  }

  // Body validation.
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request',
      details: parsed.error.flatten(),
    });
  }
  const { transcript, visit_type, language, context } = parsed.data;

  // Build the messages for the LLM.
  const userMessage = `Visit type: ${visit_type}
Language of transcript: ${language}
Patient context (from the ASHA's registry): ${JSON.stringify(context || {})}

Transcript (names and phone numbers have already been redacted as [NAME_1], [PHONE_1] etc. Do NOT try to guess the real values):

"${transcript}"

Return STRICT JSON matching the required shape.`;

  const baseMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  // Two attempts: original, then a "fix your JSON" retry.
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const messages =
        attempt === 1
          ? baseMessages
          : [
              ...baseMessages,
              {
                role: 'user',
                content:
                  'Your previous reply was not valid JSON or did not match the required shape. Reply AGAIN with STRICT JSON only. No markdown. No explanation. Same shape as before.',
              },
            ];

      const raw = await callLLM(messages, env);
      const json = parseJsonLoose(raw);

      // Ensure visit_type is the one the client asked for, unless the
      // model strongly disagrees (it should not).
      // Always keep the visit type the ASHA chose: the rule engine
      // selects its rules by visit type, so the model must not change it.
      json.visit_type = visit_type;

      const validated = ExtractionSchema.parse(json);
      return res.status(200).json({ ok: true, extraction: validated });
    } catch (err) {
      lastError = err;
      // continue to retry
    }
  }

  // Both attempts failed — return 422 so the client knows to use the
  // keyword fallback and let the ASHA fill in the record manually.
  return res.status(422).json({
    ok: false,
    error: 'Extraction failed after retry',
    details: String(lastError && lastError.message ? lastError.message : lastError),
  });
}