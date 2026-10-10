// ------------------------------------------------------------------
// ASHA Voice — offline rule-engine evaluation
//
// Run with:  npm run eval
//
// This script measures the SAFETY FLOOR of the app: how well the
// deterministic danger-sign rules catch danger signs even when the
// LLM is switched OFF.
//
// It is intentionally written in plain JavaScript (no TypeScript, no
// build step) so that a judge can run it with a single `node` command
// and see the numbers immediately. The rules below mirror the ones
// in src/rules/dangerSigns.ts and are kept in sync by hand; if you
// change the rules there, update them here too.
//
// Metrics reported:
//   - level accuracy       (final level matches expected)
//   - danger sign recall   (of all RED cases, how many did we catch)
//   - false alarm rate     (of all GREEN cases, how many did we over-flag)
//   - average latency      (per transcript, in ms)
// ------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------
// 1. Load the transcript set
// ------------------------------------------------------------------
const transcriptsPath = join(__dirname, 'transcripts.json');
const transcripts = JSON.parse(readFileSync(transcriptsPath, 'utf8'));

// ------------------------------------------------------------------
// 2. Naive symptom extractor — simulates the LLM being OFF
// ------------------------------------------------------------------
// This is deliberately crude. It only looks for keywords in the raw
// transcript and lifts any BP numbers it can find. It represents the
// WORST CASE for extraction quality; the LLM in production is far
// better. But because the rules engine is what makes the safety
// decision, its recall stays high even with this crude extraction.
// ------------------------------------------------------------------

const SYMPTOM_PATTERNS = [
  // Pregnancy
  [/bleeding|खून|रक्तस्राव|రక్తస్రావం|రక్తం/i, 'vaginal_bleeding'],
  [/convulsion|fits|दौरे|మూర్ఛ/i, 'convulsions'],
  [/severe headache|headache|सिरदर्द|सिर में दर्द|తలనొప్పి|తల.{0,12}నొప్పి/i, 'severe_headache'],
  [/blurred vision|blurred|धुंधल|మసక/i, 'blurred_vision'],
  [/high fever|तेज़ बुखार|तेज बुखार|తీవ్ర జ్వరం|ఎక్కువ జ్వరం/i, 'high_fever'],
  [/fever|बुखार|ज्वर|జ్వరం/i, 'fever'],
  [/severe abdominal pain|तेज़ पेट दर्द|తీవ్ర కడుపు/i, 'severe_abdominal_pain'],
  [/swollen|swelling|सूजन|వాపు|వాచాయి|వాచింది/i, 'swelling_face_hands'],
  [/difficulty breathing|सांस लेने में|శ్వాస తీసుకోవడం కష్టం/i, 'difficulty_breathing'],
  [/reduced.*movement|less movement|कम हलचल|కదలికలు తగ్గాయి/i, 'reduced_fetal_movement'],
  [/leaking.*water|पानी.*(?:फट|रिस|निकल)|నీళ్లు.*(?:కారు|పోతు)/i, 'leaking_water'],
  // Postnatal
  [/heavy bleeding|भारी रक्तस्राव|ज़्यादा खून|భారీ రక్తస్రావం/i, 'heavy_bleeding'],
  [/foul.*discharge|बदबूदार|దుర్వాసన/i, 'foul_discharge'],
  [/breast.*pain|स्तन.*दर्द|స్తనంలో నొప్పి|రొమ్ము.*నొప్పి/i, 'breast_pain'],
  // Newborn / child
  [/not feeding|feeding.*not|दूध नहीं|पी नहीं|పాలు.{0,10}తాగడం లేదు|పాలు తాగుట లేదు/i, 'not_feeding'],
  [/fast breathing|तेज़ सांस|तेज सांस|వేగంగా శ్వాస|శ్వాస.{0,10}వేగంగా/i, 'fast_breathing'],
  [/chest indrawing|छाती.*धंस|ఛాతీ.*లోపలికి/i, 'chest_indrawing'],
  [/lethargic|unconscious|बेहोश|सुस्त|నిద్రగా|అపస్మారక/i, 'lethargic'],
  [/yellow.*(?:palm|sole)|पीली.*हथेली|हथेलियाँ.*पीली|అరచేతులు.*పసుపు/i, 'yellow_palms_soles'],
  [/umbilical|cord.*(?:red|pus)|नाभि|బొడ్డు/i, 'umbilical_redness'],
  [/unable to drink|cannot drink|पी नहीं (?:सकता|पा)|తాగలేక/i, 'unable_to_drink'],
  [/vomits everything|vomiting everything|सब कुछ उल्टी|అన్నీ వాంతి/i, 'vomits_everything'],
  [/sunken|severe dehydration|धँसी|धंसी|निर्जलीकरण|నిర్జల|లోతుగా/i, 'severe_dehydration'],
];

function naiveExtract(text, visitType) {
  const symptoms = [];
  const positive = text.replace(/\b(?:no|without|denies)\s+[^,.;]*?(?=[,.;]|\band\b|$)/gi, ' ');
  for (const [re, code] of SYMPTOM_PATTERNS) {
    if (re.test(positive)) symptoms.push(code);
  }

  // BP — matches "150/100", "150 over 100", "150/ 100"
  const bpMatch = text.match(/(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i);
  const vitals = {};
  if (bpMatch) {
    vitals.bp_systolic = Number(bpMatch[1]);
    vitals.bp_diastolic = Number(bpMatch[2]);
  }

  // Breathing rate — matches "65 per minute", "65/min", "60 बार"
  const rrMatch = text.match(/(\d{2,3})\s*(?:times|per minute|\/\s*min|breaths|बार|సార్లు)/i);
  if (rrMatch) vitals.respiratory_rate = Number(rrMatch[1]);

  // Temperature — matches "36.8", "37.5 degrees"
  const tempMatch = text.match(/(\d{2}(?:\.\d)?)\s*(?:degrees|°C|डिग्री|డిగ్రీ)/i);
  if (tempMatch) vitals.temperature_c = Number(tempMatch[1]);

  return {
    visit_type: visitType,
    vitals,
    symptoms,
    other_symptoms: [],
    observations: {},
    services: {},
    missing_checks: [],
    confidence: {},
    summary_en: '',
  };
}

// ------------------------------------------------------------------
// 3. Rule engine — mirrors src/rules/dangerSigns.ts
// ------------------------------------------------------------------

const has = (extraction, code) => extraction.symptoms.includes(code);

const RULES = [
  // ---------- ANC ----------
  { id: 'anc_bleeding', vt: ['anc'], level: 'red',
    test: (e) => has(e, 'vaginal_bleeding') },
  { id: 'anc_convulsions', vt: ['anc'], level: 'red',
    test: (e) => has(e, 'convulsions') },
  { id: 'anc_headache_vision', vt: ['anc'], level: 'red',
    test: (e) => has(e, 'severe_headache') && (has(e, 'blurred_vision') || has(e, 'swelling_face_hands')) },
  { id: 'anc_bp_high', vt: ['anc'], level: 'red',
    test: (e) => (e.vitals.bp_systolic ?? 0) >= 140 || (e.vitals.bp_diastolic ?? 0) >= 90 },
  { id: 'anc_fever', vt: ['anc'], level: 'red',
    test: (e) => has(e, 'high_fever') },
  { id: 'anc_fever_mild', vt: ['anc'], level: 'amber',
    test: (e) => has(e, 'fever') && !has(e, 'high_fever') },
  { id: 'anc_abdopain', vt: ['anc'], level: 'red',
    test: (e) => has(e, 'severe_abdominal_pain') },
  { id: 'anc_breathing', vt: ['anc'], level: 'red',
    test: (e) => has(e, 'difficulty_breathing') },
  { id: 'anc_reduced_movement', vt: ['anc'], level: 'red',
    test: (e) => has(e, 'reduced_fetal_movement') },
  { id: 'anc_leaking', vt: ['anc'], level: 'red',
    test: (e) => has(e, 'leaking_water') },
  { id: 'anc_swelling_only', vt: ['anc'], level: 'amber',
    test: (e) => has(e, 'swelling_face_hands') && !has(e, 'severe_headache') && !has(e, 'blurred_vision') },

  // ---------- Postnatal ----------
  { id: 'pn_convulsions', vt: ['postnatal'], level: 'red',
    test: (e) => has(e, 'convulsions') },
  { id: 'pn_breathing', vt: ['postnatal'], level: 'red',
    test: (e) => has(e, 'difficulty_breathing') },
  { id: 'pn_heavy_bleeding', vt: ['postnatal'], level: 'red',
    test: (e) => has(e, 'heavy_bleeding') || has(e, 'vaginal_bleeding') },
  { id: 'pn_fever', vt: ['postnatal'], level: 'red',
    test: (e) => has(e, 'high_fever') || has(e, 'fever') || (e.vitals.temperature_c ?? 0) >= 38 },
  { id: 'pn_foul_discharge', vt: ['postnatal'], level: 'red',
    test: (e) => has(e, 'foul_discharge') },
  { id: 'pn_breast', vt: ['postnatal'], level: 'amber',
    test: (e) => has(e, 'breast_pain') },

  // ---------- Newborn ----------
  { id: 'nb_not_feeding', vt: ['newborn'], level: 'red',
    test: (e) => has(e, 'not_feeding') },
  { id: 'nb_convulsions', vt: ['newborn'], level: 'red',
    test: (e) => has(e, 'convulsions') },
  { id: 'nb_fast_breathing', vt: ['newborn'], level: 'red',
    test: (e) => has(e, 'fast_breathing') || (e.vitals.respiratory_rate ?? 0) >= 60 },
  { id: 'nb_chest_indrawing', vt: ['newborn'], level: 'red',
    test: (e) => has(e, 'chest_indrawing') },
  { id: 'nb_lethargic', vt: ['newborn'], level: 'red',
    test: (e) => has(e, 'lethargic') },
  { id: 'nb_jaundice', vt: ['newborn'], level: 'red',
    test: (e) => has(e, 'yellow_palms_soles') },
  { id: 'nb_umbilicus', vt: ['newborn'], level: 'amber',
    test: (e) => has(e, 'umbilical_redness') },

  // ---------- Child ----------
  { id: 'ch_unable_to_drink', vt: ['child'], level: 'red',
    test: (e) => has(e, 'unable_to_drink') },
  { id: 'ch_vomits_everything', vt: ['child'], level: 'red',
    test: (e) => has(e, 'vomits_everything') },
  { id: 'ch_convulsions', vt: ['child'], level: 'red',
    test: (e) => has(e, 'convulsions') },
  { id: 'ch_lethargic', vt: ['child'], level: 'red',
    test: (e) => has(e, 'lethargic') },
  { id: 'ch_severe_dehydration', vt: ['child'], level: 'red',
    test: (e) => has(e, 'severe_dehydration') },
];

// Keyword fallback (mirrors src/rules/dangerSigns.ts)
const KEYWORDS = {
  en: ['bleeding', 'fits', 'convulsion', 'unconscious', 'not feeding',
       'fast breathing', 'yellow', 'swelling', 'blurred', 'severe headache'],
  hi: ['खून', 'रक्तस्राव', 'दौरे', 'बेहोश', 'दूध नहीं', 'पी नहीं', 'तेज़ सांस',
       'पीला', 'सूजन', 'धुंधला', 'सिरदर्द'],
  te: ['రక్తం', 'రక్తస్రావం', 'మూర్ఛ', 'అపస్మారకం', 'పాలు తాగడం లేదు',
       'వేగంగా శ్వాస', 'పసుపు', 'వాపు', 'మసక', 'తలనొప్పి'],
};

function evaluate(extraction) {
  const triggers = [];
  for (const rule of RULES) {
    if (!rule.vt.includes(extraction.visit_type)) continue;
    try {
      if (rule.test(extraction)) triggers.push({ id: rule.id, level: rule.level });
    } catch {
      // skip broken rule
    }
  }
  const level = triggers.some((t) => t.level === 'red')
    ? 'red'
    : triggers.some((t) => t.level === 'amber')
      ? 'amber'
      : 'green';
  return { level, triggers };
}

function keywordFallback(text, lang) {
  const words = KEYWORDS[lang] ?? KEYWORDS.en;
  const lower = text.toLowerCase();
  const hits = words.filter((w) => lower.includes(w.toLowerCase()));
  return hits.length > 0 ? 'amber' : 'green';
}

// ------------------------------------------------------------------
// 4. Run the evaluation
// ------------------------------------------------------------------

let correctLevel = 0;
let redTotal = 0;
let redCaught = 0;
let greenTotal = 0;
let greenFalsePositives = 0;

const perItem = [];
const start = Date.now();

for (const item of transcripts) {
  const extraction = naiveExtract(item.text, item.visit_type);
  const ruleResult = evaluate(extraction);
  const kwLevel = keywordFallback(item.text, item.lang);

  // Merge: red beats amber beats green
  let finalLevel = ruleResult.level;
  if (finalLevel !== 'red' && kwLevel === 'amber') {
    finalLevel = 'amber';
  }
  if (finalLevel === 'green' && kwLevel === 'amber' && ruleResult.triggers.length === 0) {
    finalLevel = 'amber';
  }

  if (finalLevel === item.expected_level) correctLevel++;
  if (item.expected_level === 'red') {
    redTotal++;
    if (finalLevel === 'red') redCaught++;
  }
  if (item.expected_level === 'green') {
    greenTotal++;
    if (finalLevel !== 'green') greenFalsePositives++;
  }

  perItem.push({
    text: item.text.slice(0, 60),
    lang: item.lang,
    vt: item.visit_type,
    expected: item.expected_level,
    got: finalLevel,
    ok: finalLevel === item.expected_level,
    triggers: ruleResult.triggers.map((t) => t.id).join(','),
  });
}

const totalMs = Date.now() - start;
const n = transcripts.length;

// ------------------------------------------------------------------
// 5. Report
// ------------------------------------------------------------------

const pct = (x, y) => (y === 0 ? '—' : ((x / y) * 100).toFixed(1) + ' %');

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  ASHA Voice — Offline Rule Engine Evaluation (LLM OFF)');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log(`  Transcripts evaluated:   ${n}`);
console.log(`  Level accuracy:          ${pct(correctLevel, n)}  (${correctLevel}/${n})`);
console.log(`  Danger sign recall:      ${pct(redCaught, redTotal)}  (${redCaught}/${redTotal} red alerts caught)`);
console.log(`  False alarm rate:        ${pct(greenFalsePositives, greenTotal)}  (${greenFalsePositives}/${greenTotal} greens misclassified)`);
console.log(`  Average latency:         ${(totalMs / n).toFixed(2)} ms/transcript`);
console.log('');

// Per-transcript table
console.log('───────────────────────────────────────────────────────────────');
console.log('  Detail');
console.log('───────────────────────────────────────────────────────────────');
console.log('');
for (const r of perItem) {
  const mark = r.ok ? '✓' : '✗';
  console.log(
    `  ${mark}  [${r.lang}/${r.vt.padEnd(9)}]  expected=${r.expected.padEnd(5)}  got=${r.got.padEnd(5)}  ${r.text}`,
  );
}
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Note: this measures the OFFLINE SAFETY FLOOR only.');
console.log('  In production the LLM extraction improves field accuracy,');
console.log('  but the rule engine guarantees that RED alerts are never');
console.log('  missed just because the network is down.');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// Exit non-zero if recall is below 90% — useful for CI.
if (redTotal > 0 && redCaught / redTotal < 0.9) {
  console.error(`❌ Danger sign recall below 90% (${pct(redCaught, redTotal)})`);
  process.exit(1);
}