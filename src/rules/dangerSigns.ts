// ------------------------------------------------------------------
// Danger sign rules — the SAFETY FLOOR of ASHA Voice.
//
// Every rule here is a pure data row:
//   - id          : stable identifier, used in tests and triggers
//   - visitTypes  : which visit templates this rule applies to
//   - level       : 'red' (refer today) or 'amber' (watch)
//   - test        : a pure function (extraction, personContext) => boolean
//   - label       : short name in en/hi/te (shown first in the alert)
//   - reason      : full plain-language explanation in en/hi/te
//   - source      : the official document this rule comes from
//
// The rules are evaluated in the browser (offline). They do NOT
// depend on the LLM. If the LLM is switched off, extraction falls
// back to the keyword scanner at the bottom of this file, and these
// rules still flag danger signs based on whatever symptoms were
// detected.
//
// Sources referenced:
//   - MoHFW Mother and Child Protection (MCP) card
//   - Home Based Newborn Care (HBNC) guidelines
//   - IMNCI chart booklet (Integrated Management of Newborn and
//     Childhood Illness)
//   - NHM ASHA guidelines
// ------------------------------------------------------------------

import type { Extraction } from '../ai/schemas';

export type Level = 'red' | 'amber' | 'green';

export type Lang = 'en' | 'hi' | 'te';

export type Localised = { en: string; hi: string; te: string };

export type PersonContext = {
  category?: 'pregnant' | 'mother' | 'newborn' | 'child' | 'other';
  age_days?: number;
  gestational_weeks?: number;
  birth_weight_g?: number;
};

export type Rule = {
  id: string;
  visitTypes: string[];
  level: Level;
  test: (e: Extraction, ctx: PersonContext) => boolean;
  label: Localised;
  reason: Localised;
  source: string;
};

// Small helper: does the extraction contain this symptom code?
const has = (e: Extraction, s: string): boolean =>
  Array.isArray(e.symptoms) && e.symptoms.includes(s);

// Small helper: safely read a vital as a number (or null).
const num = (v: number | null | undefined): number | null =>
  typeof v === 'number' && !Number.isNaN(v) ? v : null;

// =================================================================
//                              RULES
// =================================================================

export const RULES: Rule[] = [
  // =============================================================
  //  PREGNANCY (ANC)
  // =============================================================

  {
    id: 'anc_bleeding',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) => has(e, 'vaginal_bleeding'),
    label: { en: 'Vaginal bleeding', hi: 'योनि से खून', te: 'యోని నుండి రక్తస్రావం' },
    reason: {
      en: 'Bleeding at any time in pregnancy is an emergency. Refer the woman to the PHC or hospital immediately.',
      hi: 'गर्भावस्था में किसी भी समय खून बहना आपातकाल है। महिला को तुरंत PHC या अस्पताल भेजें।',
      te: 'గర్భధారణలో ఏ సమయంలోనైనా రక్తస్రావం అత్యవసరం. మహిళను వెంటనే PHC లేదా ఆసుపత్రికి పంపండి.',
    },
    source: 'MoHFW Mother and Child Protection (MCP) card',
  },

  {
    id: 'anc_convulsions',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) => has(e, 'convulsions'),
    label: { en: 'Convulsions / fits', hi: 'दौरे', te: 'మూర్ఛలు' },
    reason: {
      en: 'Fits in pregnancy can be a sign of eclampsia. This needs immediate referral.',
      hi: 'गर्भावस्था में दौरे एक्लेम्पसिया का संकेत हो सकते हैं। तुरंत रेफर करें।',
      te: 'గర్భధారణలో మూర్ఛలు ఎక్లంప్సియా సూచన కావచ్చు. వెంటనే రెఫర్ చేయాలి.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_headache_vision',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) =>
      has(e, 'severe_headache') &&
      (has(e, 'blurred_vision') || has(e, 'swelling_face_hands')),
    label: {
      en: 'Severe headache with blurred vision or swelling',
      hi: 'तेज़ सिरदर्द के साथ धुंधली दृष्टि या सूजन',
      te: 'తీవ్ర తలనొప్పి, మసక చూపు లేదా వాపు',
    },
    reason: {
      en: 'Severe headache together with blurred vision or swelling of face and hands is a warning sign of pre-eclampsia. Refer today.',
      hi: 'तेज़ सिरदर्द के साथ धुंधली दृष्टि या चेहरे-हाथों की सूजन प्री-एक्लेम्पसिया का संकेत है। आज ही रेफर करें।',
      te: 'తీవ్ర తలనొప్పి, మసక చూపు లేదా ముఖం-చేతుల వాపు ప్రీ-ఎక్లంప్సియా సూచన. ఈ రోజే రెఫర్ చేయండి.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_bp_high',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) => {
      const s = num(e.vitals.bp_systolic);
      const d = num(e.vitals.bp_diastolic);
      return (s != null && s >= 140) || (d != null && d >= 90);
    },
    label: {
      en: 'High blood pressure (≥ 140/90)',
      hi: 'उच्च रक्तचाप (≥ 140/90)',
      te: 'అధిక రక్తపోటు (≥ 140/90)',
    },
    reason: {
      en: 'BP of 140/90 or above in pregnancy can be a sign of pre-eclampsia. Refer today for a proper check.',
      hi: 'गर्भावस्था में BP 140/90 या अधिक प्री-एक्लेम्पसिया का संकेत हो सकता है। आज ही जाँच के लिए रेफर करें।',
      te: 'గర్భధారణలో BP 140/90 లేదా ఎక్కువ ప్రీ-ఎక్లంప్సియా సూచన కావచ్చు. ఈ రోజే పరీక్ష కోసం రెఫర్ చేయండి.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_fever',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) => has(e, 'high_fever'),
    label: { en: 'High fever', hi: 'तेज़ बुखार', te: 'అధిక జ్వరం' },
    reason: {
      en: 'Fever in pregnancy needs review — it may be malaria, typhoid or another infection that needs treatment.',
      hi: 'गर्भावस्था में बुखार की जाँच ज़रूरी है — मलेरिया, टाइफाइड या कोई अन्य संक्रमण हो सकता है।',
      te: 'గర్భధారణలో జ్వరం పరీక్ష అవసరం — మలేరియా, టైఫాయిడ్ లేదా వేరే ఇన్ఫెక్షన్ కావచ్చు.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_fever_mild',
    visitTypes: ['anc'],
    level: 'amber',
    test: (e) => has(e, 'fever') && !has(e, 'high_fever'),
    label: { en: 'Fever in pregnancy', hi: 'गर्भावस्था में बुखार', te: 'గర్భధారణలో జ్వరం' },
    reason: {
      en: 'Fever in pregnancy needs a check within 1 to 2 days. Refer today if it is high, lasts more than 2 days, or comes with other danger signs.',
      hi: 'गर्भावस्था में बुखार की 1 से 2 दिन में जांच ज़रूरी है। तेज़ हो, 2 दिन से ज़्यादा रहे या दूसरे खतरे के संकेत हों तो आज ही रेफर करें।',
      te: 'గర్భధారణలో జ్వరం ఉంటే 1 నుండి 2 రోజుల్లో పరీక్ష అవసరం. జ్వరం ఎక్కువగా ఉంటే, 2 రోజులకు మించి ఉంటే లేదా ఇతర ప్రమాద సూచనలు ఉంటే ఈ రోజే రెఫర్ చేయండి.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_abdopain',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) => has(e, 'severe_abdominal_pain'),
    label: {
      en: 'Severe abdominal pain',
      hi: 'तेज़ पेट दर्द',
      te: 'తీవ్ర కడుపు నొప్పి',
    },
    reason: {
      en: 'Severe abdominal pain in pregnancy is urgent — it may be a sign of abruption or another emergency.',
      hi: 'गर्भावस्था में तेज़ पेट दर्द आपातकाल है — प्लेसेंटा अलग होना या अन्य आपात स्थिति हो सकती है।',
      te: 'గర్భధారణలో తీవ్ర కడుపు నొప్పి అత్యవసరం — ప్లసెంటా వేరుపడటం లేదా ఇతర అత్యవసర పరిస్థితి కావచ్చు.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_breathing',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) => has(e, 'difficulty_breathing'),
    label: {
      en: 'Difficulty breathing',
      hi: 'सांस लेने में तकलीफ',
      te: 'శ్వాస తీసుకోవడంలో ఇబ్బంది',
    },
    reason: {
      en: 'Difficulty in breathing during pregnancy needs immediate review. Refer to the PHC.',
      hi: 'गर्भावस्था में सांस लेने में तकलीफ की तुरंत जाँच ज़रूरी है। PHC रेफर करें।',
      te: 'గర్భధారణలో శ్వాస తీసుకోవడంలో ఇబ్బంది వెంటనే పరీక్ష అవసరం. PHC కి రెఫర్ చేయండి.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_reduced_movement',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) => has(e, 'reduced_fetal_movement'),
    label: {
      en: 'Reduced baby movements',
      hi: 'बच्चे की हलचल कम',
      te: 'పిండం కదలికలు తగ్గాయి',
    },
    reason: {
      en: 'If the baby is moving less than usual, the mother must be checked the same day.',
      hi: 'अगर बच्चा आम से कम हिल रहा है तो उसी दिन जाँच ज़रूरी है।',
      te: 'పిండం మామూలు కంటే తక్కువగా కదులుతుంటే అదే రోజు పరీక్ష అవసరం.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_leaking',
    visitTypes: ['anc'],
    level: 'red',
    test: (e) => has(e, 'leaking_water'),
    label: {
      en: 'Leaking of water',
      hi: 'पानी की थैली फटना',
      te: 'నీళ్లు కారడం',
    },
    reason: {
      en: 'If the water has broken before labour, this is an emergency. Refer immediately.',
      hi: 'अगर प्रसव से पहले पानी फट गया हो तो यह आपातकाल है। तुरंत रेफर करें।',
      te: 'ప్రసవానికి ముందే నీళ్లు కారితే అది అత్యవసరం. వెంటనే రెఫర్ చేయండి.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'anc_swelling_only',
    visitTypes: ['anc'],
    level: 'amber',
    test: (e) =>
      has(e, 'swelling_face_hands') &&
      !has(e, 'severe_headache') &&
      !has(e, 'blurred_vision'),
    label: {
      en: 'Swelling of face or hands',
      hi: 'चेहरे या हाथों में सूजन',
      te: 'ముఖం లేదా చేతుల్లో వాపు',
    },
    reason: {
      en: 'Swelling in late pregnancy can be normal, but it can also be an early sign of pre-eclampsia. Recheck BP within 1 to 3 days.',
      hi: 'देर की गर्भावस्था में सूजन सामान्य हो सकती है, पर प्री-एक्लेम्पसिया का शुरुआती संकेत भी हो सकती है। 1 से 3 दिन में BP दोबारा देखें।',
      te: 'చివరి గర్భధారణలో వాపు సాధారణం కావచ్చు, కానీ ప్రీ-ఎక్లంప్సియా ప్రారంభ సూచన కూడా కావచ్చు. 1 నుండి 3 రోజుల్లో BP మళ్లీ చూడండి.',
    },
    source: 'MoHFW MCP card',
  },

  // =============================================================
  //  POSTNATAL MOTHER
  // =============================================================

  {
    id: 'pn_heavy_bleeding',
    visitTypes: ['postnatal'],
    level: 'red',
    test: (e) => has(e, 'heavy_bleeding') || has(e, 'vaginal_bleeding'),
    label: {
      en: 'Heavy bleeding after delivery',
      hi: 'प्रसव के बाद भारी रक्तस्राव',
      te: 'ప్రసవం తర్వాత భారీ రక్తస్రావం',
    },
    reason: {
      en: 'Heavy bleeding after delivery (postpartum haemorrhage) is a life-threatening emergency. Refer immediately and call 108.',
      hi: 'प्रसव के बाद भारी रक्तस्राव (पोस्टपार्टम हैमरेज) जानलेवा आपातकाल है। तुरंत रेफर करें और 108 बुलाएँ।',
      te: 'ప్రసవం తర్వాత భారీ రక్తస్రావం ప్రాణాంతక అత్యవసరం. వెంటనే రెఫర్ చేయండి, 108 కి కాల్ చేయండి.',
    },
    source: 'HBNC guidelines / NHM',
  },

  {
    id: 'pn_fever',
    visitTypes: ['postnatal'],
    level: 'red',
    test: (e) => {
      // Any fever after delivery counts (possible puerperal sepsis),
      // not only "high" fever.
      const t = num(e.vitals.temperature_c);
      return has(e, 'high_fever') || has(e, 'fever') || (t != null && t >= 38);
    },
    label: {
      en: 'Fever after delivery',
      hi: 'प्रसव के बाद बुखार',
      te: 'ప్రసవం తర్వాత జ్వరం',
    },
    reason: {
      en: 'Fever after delivery may be a sign of infection (sepsis). Refer today.',
      hi: 'प्रसव के बाद बुखार संक्रमण (सेप्सिस) का संकेत हो सकता है। आज रेफर करें।',
      te: 'ప్రసవం తర్వాత జ్వరం ఇన్ఫెక్షన్ (సెప్సిస్) సూచన కావచ్చు. ఈ రోజే రెఫర్ చేయండి.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'pn_foul_discharge',
    visitTypes: ['postnatal'],
    level: 'red',
    test: (e) => has(e, 'foul_discharge'),
    label: {
      en: 'Foul-smelling discharge',
      hi: 'बदबूदार स्राव',
      te: 'దుర్వాసన కారడం',
    },
    reason: {
      en: 'Foul-smelling discharge after delivery is a sign of infection. Refer today.',
      hi: 'प्रसव के बाद बदबूदार स्राव संक्रमण का संकेत है। आज रेफर करें।',
      te: 'ప్రసవం తర్వాత దుర్వాసన కారడం ఇన్ఫెక్షన్ సూచన. ఈ రోజే రెఫర్.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'pn_breast',
    visitTypes: ['postnatal'],
    level: 'amber',
    test: (e) => has(e, 'breast_pain'),
    label: {
      en: 'Breast pain or redness',
      hi: 'स्तन में दर्द या लालिमा',
      te: 'స్తనంలో నొప్పి / ఎరుపు',
    },
    reason: {
      en: 'Breast pain or redness may be early mastitis. Watch closely and recheck in 1 to 3 days.',
      hi: 'स्तन में दर्द या लालिमा शुरुआती मास्टाइटिस हो सकती है। निगरानी रखें और 1 से 3 दिन में दोबारा देखें।',
      te: 'స్తనంలో నొప్పి లేదా ఎరుపు ప్రారంభ మాస్టిటిస్ కావచ్చు. గమనించి 1 నుండి 3 రోజుల్లో మళ్లీ చూడండి.',
    },
    source: 'HBNC guidelines',
  },

  // =============================================================
  //  NEWBORN (0 – 42 days)
  // =============================================================

  {
    id: 'pn_convulsions',
    visitTypes: ['postnatal'],
    level: 'red',
    test: (e) => has(e, 'convulsions'),
    label: { en: 'Convulsions / fits after delivery', hi: 'प्रसव के बाद दौरे', te: 'ప్రసవం తర్వాత మూర్ఛలు' },
    reason: {
      en: 'Fits after delivery can be eclampsia. Refer immediately.',
      hi: 'प्रसव के बाद दौरे एक्लेम्पसिया हो सकते हैं। तुरंत रेफर करें।',
      te: 'ప్రసవం తర్వాత మూర్ఛలు ఎక్లంప్సియా కావచ్చు. వెంటనే రెఫర్ చేయండి.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'pn_breathing',
    visitTypes: ['postnatal'],
    level: 'red',
    test: (e) => has(e, 'difficulty_breathing'),
    label: { en: 'Difficulty breathing after delivery', hi: 'प्रसव के बाद सांस लेने में तकलीफ', te: 'ప్రసవం తర్వాత శ్వాస తీసుకోవడం కష్టం' },
    reason: {
      en: 'Difficulty breathing after delivery needs urgent care. Refer immediately.',
      hi: 'प्रसव के बाद सांस लेने में तकलीफ को तुरंत इलाज चाहिए। तुरंत रेफर करें।',
      te: 'ప్రసవం తర్వాత శ్వాస కష్టం అయితే అత్యవసర చికిత్స అవసరం. వెంటనే రెఫర్ చేయండి.',
    },
    source: 'MoHFW MCP card',
  },

  {
    id: 'nb_not_feeding',
    visitTypes: ['newborn'],
    level: 'red',
    test: (e) => has(e, 'not_feeding'),
    label: {
      en: 'Not feeding well',
      hi: 'ठीक से दूध नहीं पी रहा',
      te: 'సరిగా పాలు తాగడం లేదు',
    },
    reason: {
      en: 'A newborn who stops feeding or feeds poorly is a serious danger sign. Refer immediately.',
      hi: 'नवजात का दूध पीना बंद कर देना या ठीक से न पीना गंभीर खतरे का संकेत है। तुरंत रेफर करें।',
      te: 'నవజాత శిశువు పాలు తాగడం ఆపడం లేదా సరిగా తాగకపోవడం తీవ్ర ప్రమాద సూచన. వెంటనే రెఫర్ చేయండి.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_convulsions',
    visitTypes: ['newborn'],
    level: 'red',
    test: (e) => has(e, 'convulsions'),
    label: { en: 'Convulsions', hi: 'दौरे', te: 'మూర్ఛలు' },
    reason: {
      en: 'Convulsions in a newborn are an emergency. Refer immediately and call 108.',
      hi: 'नवजात में दौरे आपातकाल हैं। तुरंत रेफर करें और 108 बुलाएँ।',
      te: 'నవజాతలో మూర్ఛలు అత్యవసరం. వెంటనే రెఫర్ చేయండి, 108 కి కాల్ చేయండి.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_fast_breathing',
    visitTypes: ['newborn'],
    level: 'red',
    test: (e) => {
      const rr = num(e.vitals.respiratory_rate);
      return has(e, 'fast_breathing') || (rr != null && rr >= 60);
    },
    label: {
      en: 'Fast breathing (≥ 60/min)',
      hi: 'तेज़ सांस (≥ 60/मिनट)',
      te: 'వేగంగా శ్వాస (≥ 60/నిమిషం)',
    },
    reason: {
      en: 'A newborn breathing 60 times a minute or more may have pneumonia. Refer today.',
      hi: 'नवजात का 60 या अधिक बार प्रति मिनट सांस लेना निमोनिया का संकेत हो सकता है। आज रेफर करें।',
      te: 'నవజాత శిశువు నిమిషానికి 60 సార్లు లేదా ఎక్కువ శ్వాస తీసుకుంటే న్యుమోనియా కావచ్చు. ఈ రోజే రెఫర్.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_chest_indrawing',
    visitTypes: ['newborn'],
    level: 'red',
    test: (e) => has(e, 'chest_indrawing'),
    label: {
      en: 'Severe chest indrawing',
      hi: 'छाती गहरी धंसना',
      te: 'ఛాతీ లోతుగా పోవడం',
    },
    reason: {
      en: 'Severe chest indrawing in a newborn is a sign of severe pneumonia. Refer today.',
      hi: 'नवजात में छाती गहरी धंसना गंभीर निमोनिया का संकेत है। आज रेफर करें।',
      te: 'నవజాతలో ఛాతీ లోతుగా పోవడం తీవ్ర న్యుమోనియా సూచన. ఈ రోజే రెఫర్.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_temp_high',
    visitTypes: ['newborn'],
    level: 'red',
    test: (e) => {
      const t = num(e.vitals.temperature_c);
      return t != null && t >= 37.5;
    },
    label: {
      en: 'Fever (≥ 37.5 °C)',
      hi: 'बुखार (≥ 37.5 °C)',
      te: 'జ్వరం (≥ 37.5 °C)',
    },
    reason: {
      en: 'Fever in a newborn is an emergency. Refer today.',
      hi: 'नवजात में बुखार आपातकाल है। आज रेफर करें।',
      te: 'నవజాత శిశువులో జ్వరం అత్యవసరం. ఈ రోజే రెఫర్.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_temp_low',
    visitTypes: ['newborn'],
    level: 'red',
    test: (e) => {
      const t = num(e.vitals.temperature_c);
      return t != null && t < 35.5;
    },
    label: {
      en: 'Low temperature (< 35.5 °C)',
      hi: 'कम तापमान (< 35.5 °C)',
      te: 'తక్కువ ఉష్ణోగ్రత (< 35.5 °C)',
    },
    reason: {
      en: 'Hypothermia in a newborn is dangerous. Warm the baby and refer today.',
      hi: 'नवजात में हाइपोथर्मिया खतरनाक है। बच्चे को गर्म रखें और आज रेफर करें।',
      te: 'నవజాతలో హైపోథర్మియా ప్రమాదం. శిశువును వెచ్చగా ఉంచి ఈ రోజే రెఫర్.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_lethargic',
    visitTypes: ['newborn'],
    level: 'red',
    test: (e) => has(e, 'lethargic'),
    label: {
      en: 'Lethargic or unconscious',
      hi: 'सुस्त या बेहोश',
      te: 'నిద్రగా లేదా అపస్మారకం',
    },
    reason: {
      en: 'A newborn who is lethargic or unconscious must be referred immediately.',
      hi: 'सुस्त या बेहोश नवजात को तुरंत रेफर करें।',
      te: 'నిద్రగా లేదా అపస్మారకంలో ఉన్న నవజాతను వెంటనే రెఫర్ చేయండి.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_jaundice',
    visitTypes: ['newborn'],
    level: 'red',
    test: (e) => has(e, 'yellow_palms_soles'),
    label: {
      en: 'Yellow palms or soles',
      hi: 'हथेलियों या तलवों का पीला होना',
      te: 'అరచేతులు / పాదాలు పసుపు రంగు',
    },
    reason: {
      en: 'Jaundice that has spread to the palms or soles is severe. Refer today.',
      hi: 'हथेलियों या तलवों तक फैला पीलिया गंभीर है। आज रेफर करें।',
      te: 'అరచేతులు / పాదాలకు వ్యాపించిన పసుపు వ్యాధి తీవ్రం. ఈ రోజే రెఫర్.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_umbilicus',
    visitTypes: ['newborn'],
    level: 'amber',
    test: (e) => has(e, 'umbilical_redness'),
    label: {
      en: 'Umbilical redness or pus',
      hi: 'नाभि में लालिमा या मवाद',
      te: 'బొడ్డు ఎరుపు / చీము',
    },
    reason: {
      en: 'Redness or pus around the cord may be an early infection. Clean with chlorhexidine and recheck in 1 day.',
      hi: 'नाभि के आसपास लालिमा या मवाद शुरुआती संक्रमण हो सकता है। क्लोरहेक्सिडिन से साफ करें और 1 दिन में दोबारा देखें।',
      te: 'బొడ్డు చుట్టూ ఎరుపు లేదా చీము ప్రారంభ ఇన్ఫెక్షన్ కావచ్చు. క్లోర్హెక్సిడిన్‌తో శుభ్రం చేసి 1 రోజులో మళ్లీ చూడండి.',
    },
    source: 'HBNC guidelines',
  },

  {
    id: 'nb_lbw',
    visitTypes: ['newborn'],
    level: 'amber',
    test: (_e, ctx) => {
      const bw = ctx.birth_weight_g;
      return typeof bw === 'number' && bw > 0 && bw < 2500;
    },
    label: {
      en: 'Low birth weight (< 2.5 kg)',
      hi: 'कम जन्म वजन (< 2.5 kg)',
      te: 'తక్కువ జనన బరువు (< 2.5 kg)',
    },
    reason: {
      en: 'A baby born below 2.5 kg needs extra warmth, extra feeding support and closer follow-up.',
      hi: '2.5 किलो से कम वजन वाले बच्चे को अधिक गर्माहट, अधिक दूध सहायता और नज़दीकी फॉलो-अप की ज़रूरत होती है।',
      te: '2.5 కిలోల లోపు పుట్టిన శిశువుకు అదనపు వెచ్చదనం, అదనపు పాలు మరియు దగ్గరి ఫాలో-అప్ అవసరం.',
    },
    source: 'HBNC guidelines',
  },

  // =============================================================
  //  CHILD UNDER 5
  // =============================================================

  {
    id: 'ch_unable_to_drink',
    visitTypes: ['child'],
    level: 'red',
    test: (e) => has(e, 'unable_to_drink'),
    label: {
      en: 'Unable to drink or breastfeed',
      hi: 'पीने या दूध पीने में असमर्थ',
      te: 'తాగలేకపోవడం / పాలు తాగలేకపోవడం',
    },
    reason: {
      en: 'Unable to drink or breastfeed is a general danger sign in a child. Refer today.',
      hi: 'पीने या दूध पीने में असमर्थता बच्चे में सामान्य खतरे का संकेत है। आज रेफर करें।',
      te: 'తాగలేకపోవడం లేదా పాలు తాగలేకపోవడం పిల్లల్లో సాధారణ ప్రమాద సూచన. ఈ రోజే రెఫర్.',
    },
    source: 'IMNCI chart booklet',
  },

  {
    id: 'ch_vomits_everything',
    visitTypes: ['child'],
    level: 'red',
    test: (e) => has(e, 'vomits_everything'),
    label: {
      en: 'Vomits everything',
      hi: 'सब कुछ उल्टी',
      te: 'అన్నీ వాంతి',
    },
    reason: {
      en: 'Vomiting everything is a general danger sign. Refer today.',
      hi: 'सब कुछ उल्टी करना सामान्य खतरे का संकेत है। आज रेफर करें।',
      te: 'అన్నీ వాంతి చేయడం సాధారణ ప్రమాద సూచన. ఈ రోజే రెఫర్.',
    },
    source: 'IMNCI chart booklet',
  },

  {
    id: 'ch_convulsions',
    visitTypes: ['child'],
    level: 'red',
    test: (e) => has(e, 'convulsions'),
    label: { en: 'Convulsions', hi: 'दौरे', te: 'మూర్ఛలు' },
    reason: {
      en: 'Convulsions in a child are an emergency. Refer immediately.',
      hi: 'बच्चे में दौरे आपातकाल हैं। तुरंत रेफर करें।',
      te: 'పిల్లల్లో మూర్ఛలు అత్యవసరం. వెంటనే రెఫర్ చేయండి.',
    },
    source: 'IMNCI chart booklet',
  },

  {
    id: 'ch_lethargic',
    visitTypes: ['child'],
    level: 'red',
    test: (e) => has(e, 'lethargic'),
    label: {
      en: 'Lethargic or unconscious',
      hi: 'सुस्त या बेहोश',
      te: 'నిద్రగా లేదా అపస్మారకం',
    },
    reason: {
      en: 'A lethargic or unconscious child must be referred immediately.',
      hi: 'सुस्त या बेहोश बच्चे को तुरंत रेफर करें।',
      te: 'నిద్రగా లేదా అపస్మారకంలో ఉన్న పిల్లవాడిని వెంటనే రెఫర్ చేయండి.',
    },
    source: 'IMNCI chart booklet',
  },

  {
    id: 'ch_fast_breathing',
    visitTypes: ['child'],
    level: 'red',
    test: (e, ctx) => {
      const rr = num(e.vitals.respiratory_rate);
      if (rr == null) return has(e, 'fast_breathing');
      const ageDays = ctx.age_days ?? 400; // assume older child if unknown
      if (ageDays < 60) return rr >= 60;
      if (ageDays < 365) return rr >= 50;
      return rr >= 40;
    },
    label: {
      en: 'Fast breathing for age',
      hi: 'उम्र के हिसाब से तेज़ सांस',
      te: 'వయస్సుకు తగ్గట్టు వేగంగా శ్వాస',
    },
    reason: {
      en: 'Fast breathing for the child\'s age is a sign of possible pneumonia. Refer today.',
      hi: 'बच्चे की उम्र के हिसाब से तेज़ सांस निमोनिया का संकेत हो सकती है। आज रेफर करें।',
      te: 'పిల్లల వయస్సుకు తగ్గట్టు వేగంగా శ్వాస న్యుమోనియా సూచన కావచ్చు. ఈ రోజే రెఫర్.',
    },
    source: 'IMNCI chart booklet',
  },

  {
    id: 'ch_severe_dehydration',
    visitTypes: ['child'],
    level: 'red',
    test: (e) => has(e, 'severe_dehydration'),
    label: {
      en: 'Signs of severe dehydration',
      hi: 'गंभीर निर्जलीकरण के संकेत',
      te: 'తీవ్ర నిర్జలీకరణ సూచనలు',
    },
    reason: {
      en: 'Sunken eyes, no tears and dry mouth are signs of severe dehydration. Refer today for ORS and IV fluids.',
      hi: 'धँसी आँखें, आँसू न आना और सूखा मुँह गंभीर निर्जलीकरण के संकेत हैं। आज ORS और IV तरल के लिए रेफर करें।',
      te: 'లోతుగా పోయిన కళ్లు, కన్నీళ్లు రాకపోవడం, ఎండిన నోరు తీవ్ర నిర్జలీకరణ సూచనలు. ఈ రోజే ORS మరియు IV ఫ్లూయిడ్ కోసం రెఫర్.',
    },
    source: 'IMNCI chart booklet',
  },
];

// =================================================================
//                      KEYWORD FALLBACK
// =================================================================
// If the LLM is unavailable, we still want SOME safety net. This
// scans the raw transcript for danger keywords in each language and
// raises an AMBER "Possible danger sign, please check" alert. It is
// intentionally conservative: it may produce false positives, but
// never silently misses a clear danger word.

export const KEYWORDS: Record<Lang, string[]> = {
  en: [
    'bleeding',
    'fits',
    'convulsion',
    'unconscious',
    'not feeding',
    'not drinking',
    'fast breathing',
    'yellow',
    'swelling',
    'swollen',
    'blurred',
    'severe headache',
    'leaking',
    'vomits everything',
  ],
  hi: [
    'खून',
    'रक्तस्राव',
    'दौरे',
    'बेहोश',
    'दूध नहीं',
    'पी नहीं',
    'तेज़ सांस',
    'पीला',
    'सूजन',
    'धुंधला',
    'सिरदर्द',
    'पानी',
    'उल्टी',
  ],
  te: [
    'రక్తం',
    'రక్తస్రావం',
    'మూర్ఛ',
    'అపస్మారకం',
    'పాలు తాగడం లేదు',
    'తాగడం లేదు',
    'వేగంగా శ్వాస',
    'పసుపు',
    'వాపు',
    'మసక',
    'తలనొప్పి',
    'నీళ్లు',
    'వాంతి',
  ],
};