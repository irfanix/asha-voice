// ------------------------------------------------------------------
// Live check of the deployed AI pipeline.
//
// Usage (after deploying to Vercel with the LLM env vars set):
//   node scripts/check-live.mjs https://your-app.vercel.app
//
// Sends every demo transcript to /api/extract on the live site and
// prints the symptoms and vitals the LLM extracted, so you can check
// the real AI before recording the demo video.
// ------------------------------------------------------------------
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('Usage: node scripts/check-live.mjs https://your-app.vercel.app');
  process.exit(1);
}

const cases = [
  { language: 'te', visit_type: 'anc', expect: ['severe_headache', 'blurred_vision', 'swelling_face_hands'],
    transcript: 'లక్ష్మి దేవి, ముప్ఫై రెండు వారాల గర్భవతి. నిన్నటి నుంచి తల బాగా నొప్పి, కళ్ళు మసకగా కనిపిస్తున్నాయి. ముఖం, చేతులు వాచాయి. బీపీ 150/100.' },
  { language: 'hi', visit_type: 'child', expect: ['vomits_everything', 'unable_to_drink', 'severe_dehydration'],
    transcript: 'रवि, नौ महीने का बच्चा है। कल से सब कुछ उल्टी कर रहा है, कुछ पी नहीं पा रहा। आँखें धँसी हुई हैं।' },
  { language: 'hi', visit_type: 'postnatal', expect: ['fever', 'breast_pain'],
    transcript: 'पद्मा को तीन दिन से हल्का बुखार है, स्तन में दर्द और लालिमा है।' },
  { language: 'en', visit_type: 'newborn', expect: ['not_feeding', 'fast_breathing'],
    transcript: 'Seven day old baby is not feeding well and is breathing 65 times per minute.' },
  { language: 'en', visit_type: 'anc', expect: [],
    transcript: 'Sita is 24 weeks pregnant, eating well, BP 110/70, weight 55 kg, no complaints.' },
];

let pass = 0;
for (const c of cases) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: c.transcript, visit_type: c.visit_type, language: c.language, context: {} }),
    });
    const data = await res.json();
    const got = data?.extraction?.symptoms ?? [];
    const ok = res.ok && c.expect.every((s) => got.includes(s)) && (c.expect.length > 0 || got.length === 0);
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'CHECK'}  [${c.language}/${c.visit_type}]  ${Date.now() - t0} ms`);
    console.log('   symptoms:', got.join(', ') || '(none)', '| vitals:', JSON.stringify(data?.extraction?.vitals ?? {}));
    if (!res.ok) console.log('   error:', data?.error, data?.details ?? '');
  } catch (err) {
    console.log(`FAIL  [${c.language}/${c.visit_type}]  ${err.message}`);
  }
}
console.log(`\n${pass}/${cases.length} cases matched the expected symptoms.`);
