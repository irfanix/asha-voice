// ------------------------------------------------------------------
// Offline extractor: a simple pattern-based reader used when the LLM
// is unavailable (no internet, API error, invalid JSON).
//
// It runs locally on the ORIGINAL transcript (nothing leaves the
// phone), finds danger-sign words in English, Hindi and Telugu, and
// lifts BP, breathing rate and temperature numbers. The result feeds
// the same rule engine as the LLM extraction, so RED alerts still
// fire when the network is down.
//
// It is deliberately crude: it can over-flag, and the ASHA must
// always review the record. Keep these patterns in sync with
// eval/run-eval.mjs.
// ------------------------------------------------------------------

import { emptyExtraction, type Extraction } from '../ai/schemas';

const SYMPTOM_PATTERNS: [RegExp, string][] = [
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

export function offlineExtract(text: string, visitType: Extraction['visit_type']): Extraction {
  const e = emptyExtraction(visitType);
  // Drop simple English negations ("no headache, no blurred vision").
  // "not" is kept on purpose: "not feeding" is itself a danger sign.
  // so they are not read as symptoms. Numbers are read from the full text.
  const positive = text.replace(/\b(?:no|without|denies)\s+[^,.;]*?(?=[,.;]|\band\b|$)/gi, ' ');
  for (const [re, code] of SYMPTOM_PATTERNS) {
    if (re.test(positive) && !e.symptoms.includes(code)) e.symptoms.push(code);
  }
  const bp = text.match(/(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i);
  if (bp) {
    e.vitals.bp_systolic = Number(bp[1]);
    e.vitals.bp_diastolic = Number(bp[2]);
  }
  const rr = text.match(/(\d{2,3})\s*(?:times|per minute|\/\s*min|breaths|बार|సార్లు)/i);
  if (rr) e.vitals.respiratory_rate = Number(rr[1]);
  const temp = text.match(/(\d{2}(?:\.\d)?)\s*(?:degrees|°C|डिग्री|డిగ్రీ)/i);
  if (temp) e.vitals.temperature_c = Number(temp[1]);
  e.summary_en = 'Offline draft: read by pattern matching because AI was unavailable. Please check every field.';
  return e;
}
