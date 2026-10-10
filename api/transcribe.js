// ------------------------------------------------------------------
// POST /api/transcribe
//
// Turns a short voice recording into text with Whisper (speech AI),
// using the same OpenAI-compatible provider as the other endpoints
// (Groq hosts whisper-large-v3 at /audio/transcriptions).
//
// Why: the browser's built-in speech recognition is weak for Telugu
// and Hindi and does not work in every browser. Whisper is much more
// accurate for Indian languages and works on any phone that can
// record audio.
//
// Body: { audio: base64 string, mime: 'audio/webm' | ..., language: 'te'|'hi'|'en' }
// Returns: { ok: true, text }
//
// Privacy note: the audio is sent to the speech provider only to be
// turned into text. Names and phone numbers are removed from the TEXT
// before it is sent to the language model (/api/extract).
// ------------------------------------------------------------------

const EXT = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

// A short hint helps Whisper spell medical words correctly.
const PROMPT = {
  en: 'ASHA home visit notes: weeks pregnant, BP 120/80, fever, bleeding, swelling, headache, breastfeeding, newborn, breathing.',
  hi: 'आशा गृह भ्रमण: गर्भवती, बीपी, बुखार, खून आना, सूजन, सिरदर्द, स्तनपान, नवजात, सांस।',
  te: 'ఆశా గృహ సందర్శన: గర్భవతి, బీపీ, జ్వరం, రక్తస్రావం, వాపు, తలనొప్పి, పాలు, శిశువు, శ్వాస.',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.STT_MODEL || 'whisper-large-v3';
  if (!base || !key) {
    return res.status(500).json({ ok: false, error: 'Speech AI not configured (LLM_BASE_URL / LLM_API_KEY).' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const audio = typeof body?.audio === 'string' ? body.audio : '';
  const mime = String(body?.mime || 'audio/webm').split(';')[0];
  const language = ['te', 'hi', 'en'].includes(body?.language) ? body.language : 'en';
  if (!audio || audio.length < 100) {
    return res.status(400).json({ ok: false, error: 'No audio received' });
  }
  if (audio.length > 4_000_000) {
    return res.status(413).json({ ok: false, error: 'Recording too long. Please keep it under about 2 minutes.' });
  }

  try {
    const buf = Buffer.from(audio, 'base64');
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), `visit.${EXT[mime] || 'webm'}`);
    form.append('model', model);
    form.append('language', language);
    form.append('prompt', PROMPT[language]);
    form.append('response_format', 'json');
    form.append('temperature', '0');

    const r = await fetch(`${base.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(502).json({ ok: false, error: `Speech AI HTTP ${r.status}: ${text.slice(0, 200)}` });
    }
    const data = await r.json();
    return res.status(200).json({ ok: true, text: String(data?.text || '').trim() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
