// ------------------------------------------------------------------
// Scripted demo transcripts. These let the app be demonstrated even
// if the microphone is unavailable or the network is down during the
// video recording. Each entry includes:
//   - lang       : 'te' | 'hi' | 'en'
//   - label      : shown in the picker
//   - visit_type : which record template to use
//   - text       : the actual spoken transcript
//
// The first Telugu entry produces a RED pre-eclampsia alert when run
// through the rule engine — that is the hero moment of the demo.
// ------------------------------------------------------------------

export type DemoTranscript = {
  lang: 'te' | 'hi' | 'en';
  label: string;
  visit_type: 'anc' | 'postnatal' | 'newborn' | 'child' | 'other';
  text: string;
};

export const DEMO_TRANSCRIPTS: DemoTranscript[] = [
  // ---------------- TELUGU ----------------
  {
    lang: 'te',
    label: 'తెలుగు — Pre-eclampsia (RED)',
    visit_type: 'anc',
    text:
      'లక్ష్మి దేవి, ముప్ఫై రెండు వారాల గర్భవతి. నిన్నటి నుంచి తల బాగా నొప్పి, కళ్ళు మసకగా కనిపిస్తున్నాయి. ముఖం, చేతులు వాచాయి. బీపీ 150/100. పిండం కదలికలు బాగానే ఉన్నాయి.',
  },
  {
    lang: 'te',
    label: 'తెలుగు — Newborn danger signs (RED)',
    visit_type: 'newborn',
    text:
      'ఏడు రోజుల పాప పాలు సరిగా తాగడం లేదు, శ్వాస వేగంగా ఉంది, నిద్రగా ఉంది. ఒక నిమిషానికి అరవై రెట్లు శ్వాస తీసుకుంటోంది.',
  },
  {
    lang: 'te',
    label: 'తెలుగు — Normal ANC (GREEN)',
    visit_type: 'anc',
    text:
      'సీత, ఇరవై నాలుగు వారాల గర్భవతి. బాగా తింటోంది, బీపీ 110/70, బరువు యాభై ఐదు కిలోలు. ఎటువంటి ఇబ్బంది లేదు.',
  },

  // ---------------- HINDI ----------------
  {
    lang: 'hi',
    label: 'हिंदी — Normal ANC (GREEN)',
    visit_type: 'anc',
    text:
      'सीता, चौबीस सप्ताह की गर्भवती है। ठीक खाना खा रही है, बीपी 110/70, वजन 55 किलो। कोई तकलीफ नहीं है।',
  },
  {
    lang: 'hi',
    label: 'हिंदी — Postnatal fever (RED)',
    visit_type: 'postnatal',
    text:
      'पद्मा को तीन दिन से हल्का बुखार है, स्तन में दर्द और लालिमा है। खून का स्राव सामान्य है, बदबू नहीं है।',
  },
  {
    lang: 'hi',
    label: 'हिंदी — Child with dehydration (RED)',
    visit_type: 'child',
    text:
      'रवि, नौ महीने का बच्चा है। कल से सब कुछ उल्टी कर रहा है, कुछ पी नहीं पा रहा। आँखें धँसी हुई हैं, बहुत सुस्त है।',
  },

  // ---------------- ENGLISH ----------------
  {
    lang: 'en',
    label: 'English — Child dehydration (RED)',
    visit_type: 'child',
    text:
      'Ravi is nine months old. Since yesterday he has been vomiting everything and cannot drink. His eyes look sunken and he is very lethargic.',
  },
  {
    lang: 'en',
    label: 'English — Normal newborn (GREEN)',
    visit_type: 'newborn',
    text:
      'The baby is twenty days old, feeding well, no fast breathing, no chest indrawing, temperature 36.8 degrees, cord is dry and clean.',
  },
  {
    lang: 'en',
    label: 'English — Severe pre-eclampsia (RED)',
    visit_type: 'anc',
    text:
      'Lakshmi is thirty-two weeks pregnant. She has had a severe headache and blurred vision since yesterday, and her hands and face are swollen. Blood pressure is 150 over 100.',
  },
];