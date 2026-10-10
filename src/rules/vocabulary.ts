// ------------------------------------------------------------------
// Fixed symptom vocabulary shared by the LLM extraction and the rules
// engine. The LLM is instructed (in /api/extract) to only use these
// codes. Anything outside this list is stored in `other_symptoms`
// as free text and does not trigger a rule automatically.
// ------------------------------------------------------------------

export const SYMPTOMS = [
  // ---------- Pregnancy (ANC) ----------
  'vaginal_bleeding',
  'convulsions',
  'severe_headache',
  'blurred_vision',
  'high_fever',
  'fever',
  'severe_abdominal_pain',
  'swelling_face_hands',
  'difficulty_breathing',
  'reduced_fetal_movement',
  'leaking_water',

  // ---------- Postnatal mother ----------
  'heavy_bleeding',
  'foul_discharge',
  'breast_pain',

  // ---------- Newborn ----------
  'not_feeding',
  'fast_breathing',
  'chest_indrawing',
  'lethargic',
  'yellow_palms_soles',
  'umbilical_redness',
  'low_birth_weight',

  // ---------- Child under 5 ----------
  'unable_to_drink',
  'vomits_everything',
  'severe_dehydration',
] as const;

export type Symptom = (typeof SYMPTOMS)[number];

// Human-readable labels in the three supported languages.
// Used by the review card and anywhere a symptom needs to be shown
// to the ASHA.
export const SYMPTOM_LABELS: Record<Symptom, { en: string; hi: string; te: string }> = {
  vaginal_bleeding: {
    en: 'Vaginal bleeding',
    hi: 'योनि से खून',
    te: 'యోని నుండి రక్తస్రావం',
  },
  convulsions: { en: 'Convulsions / fits', hi: 'दौरे', te: 'మూర్ఛలు' },
  severe_headache: { en: 'Severe headache', hi: 'तेज़ सिरदर्द', te: 'తీవ్ర తలనొప్పి' },
  blurred_vision: { en: 'Blurred vision', hi: 'धुंधली दृष्टि', te: 'మసక చూపు' },
  high_fever: { en: 'High fever', hi: 'तेज़ बुखार', te: 'అధిక జ్వరం' },
  fever: { en: 'Fever', hi: 'बुखार', te: 'జ్వరం' },
  severe_abdominal_pain: {
    en: 'Severe abdominal pain',
    hi: 'तेज़ पेट दर्द',
    te: 'తీవ్ర కడుపు నొప్పి',
  },
  swelling_face_hands: {
    en: 'Swelling of face or hands',
    hi: 'चेहरे या हाथों में सूजन',
    te: 'ముఖం / చేతుల్లో వాపు',
  },
  difficulty_breathing: {
    en: 'Difficulty breathing',
    hi: 'सांस लेने में तकलीफ',
    te: 'శ్వాస తీసుకోవడంలో ఇబ్బంది',
  },
  reduced_fetal_movement: {
    en: 'Reduced baby movements',
    hi: 'बच्चे की हलचल कम',
    te: 'పిండం కదలికలు తగ్గాయి',
  },
  leaking_water: {
    en: 'Leaking of water',
    hi: 'पानी की थैली फटना',
    te: 'నీళ్లు కారడం',
  },
  heavy_bleeding: {
    en: 'Heavy bleeding after delivery',
    hi: 'प्रसव के बाद भारी रक्तस्राव',
    te: 'ప్రసవం తర్వాత భారీ రక్తస్రావం',
  },
  foul_discharge: {
    en: 'Foul-smelling discharge',
    hi: 'बदबूदार स्राव',
    te: 'దుర్వాసన కారడం',
  },
  breast_pain: {
    en: 'Breast pain or redness',
    hi: 'स्तन में दर्द या लालिमा',
    te: 'స్తనంలో నొప్పి / ఎరుపు',
  },
  not_feeding: {
    en: 'Not feeding well',
    hi: 'ठीक से दूध नहीं पी रहा',
    te: 'సరిగా పాలు తాగడం లేదు',
  },
  fast_breathing: {
    en: 'Fast breathing',
    hi: 'तेज़ सांस',
    te: 'వేగంగా శ్వాస',
  },
  chest_indrawing: {
    en: 'Severe chest indrawing',
    hi: 'छाती गहरी धंसना',
    te: 'ఛాతీ లోతుగా పోవడం',
  },
  lethargic: {
    en: 'Lethargic or unconscious',
    hi: 'सुस्त या बेहोश',
    te: 'నిద్రగా లేదా అపస్మారకం',
  },
  yellow_palms_soles: {
    en: 'Yellow palms or soles',
    hi: 'हथेलियों या तलवों का पीला होना',
    te: 'అరచేతులు / పాదాలు పసుపు',
  },
  umbilical_redness: {
    en: 'Umbilical redness or pus',
    hi: 'नाभि में लालिमा या मवाद',
    te: 'బొడ్డు ఎరుపు / చీము',
  },
  low_birth_weight: {
    en: 'Low birth weight (< 2.5 kg)',
    hi: 'कम जन्म वजन (< 2.5 kg)',
    te: 'తక్కువ జనన బరువు (< 2.5 kg)',
  },
  unable_to_drink: {
    en: 'Unable to drink or breastfeed',
    hi: 'पीने या दूध पीने में असमर्थ',
    te: 'తాగలేకపోవడం',
  },
  vomits_everything: {
    en: 'Vomits everything',
    hi: 'सब कुछ उल्टी',
    te: 'అన్నీ వాంతి',
  },
  severe_dehydration: {
    en: 'Signs of severe dehydration',
    hi: 'गंभीर निर्जलीकरण के संकेत',
    te: 'తీవ్ర నిర్జలీకరణ సూచనలు',
  },
};

// Visit types the app understands.
export const VISIT_TYPES = ['anc', 'postnatal', 'newborn', 'child', 'other'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_TYPE_LABELS: Record<VisitType, { en: string; hi: string; te: string; icon: string }> = {
  anc: { en: 'Pregnancy (ANC)', hi: 'गर्भावस्था (ANC)', te: 'గర్భధారణ (ANC)', icon: '🤰' },
  postnatal: { en: 'After delivery (mother)', hi: 'प्रसव के बाद (माँ)', te: 'ప్రసవం తర్వాత (తల్లి)', icon: '👩' },
  newborn: { en: 'Newborn', hi: 'नवजात', te: 'నవజాత శిశువు', icon: '👶' },
  child: { en: 'Child under 5', hi: '5 वर्ष से कम बच्चा', te: '5 ఏళ్ల లోపు పిల్లలు', icon: '🧒' },
  other: { en: 'Other', hi: 'अन्य', te: 'ఇతర', icon: '📝' },
};