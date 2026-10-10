// ------------------------------------------------------------------
// The danger sign engine. A PURE function that runs entirely in the
// browser, offline, without any LLM. It takes an Extraction object
// (produced either by the LLM or by the fallback path) plus a small
// PersonContext, and returns:
//
//   {
//     level: 'red' | 'amber' | 'green',
//     triggers: [ { id, level, label, reason, source } ]
//   }
//
// The engine never diagnoses. It only matches the extraction against
// the rules defined in dangerSigns.ts, and if any red rule fires,
// the overall level becomes red.
//
// A separate keywordFallback() scans the raw transcript for danger
// words in en/hi/te and raises an AMBER alert when the LLM is off.
// ------------------------------------------------------------------

import {
  RULES,
  KEYWORDS,
  type Level,
  type Lang,
  type Localised,
  type PersonContext,
} from './dangerSigns';
import type { Extraction } from '../ai/schemas';

// -------------------- Public types --------------------

export type Trigger = {
  id: string;
  level: Level;
  label: Localised;
  reason: Localised;
  source: string;
};

export type Result = {
  level: Level;
  triggers: Trigger[];
};

// -------------------- Main entry point --------------------

/**
 * Evaluate a record against every danger sign rule.
 * Never throws: a broken rule is silently skipped so that the
 * safety check as a whole still runs.
 */
export function evaluate(record: Extraction, ctx: PersonContext = {}): Result {
  const triggers: Trigger[] = [];

  for (const rule of RULES) {
    // Only apply rules whose visit type matches this record.
    if (!rule.visitTypes.includes(record.visit_type)) continue;

    let fired = false;
    try {
      fired = rule.test(record, ctx);
    } catch {
      fired = false; // never let a bad rule break the whole check
    }

    if (fired) {
      triggers.push({
        id: rule.id,
        level: rule.level,
        label: rule.label,
        reason: rule.reason,
        source: rule.source,
      });
    }
  }

  // Aggregate level: any red => red; else any amber => amber; else green.
  const level: Level = triggers.some((t) => t.level === 'red')
    ? 'red'
    : triggers.some((t) => t.level === 'amber')
      ? 'amber'
      : 'green';

  return { level, triggers };
}

// -------------------- Keyword fallback --------------------

/**
 * Offline safety net: scans the raw transcript for danger words in
 * the requested language and raises an AMBER alert if any are found.
 * This runs when the LLM is off, unavailable, or has returned an
 * empty extraction. It intentionally over-alerts rather than
 * under-alerts.
 */
export function keywordFallback(transcript: string, _lang?: Lang): Result {
  // Scan every language, not only the UI language: the ASHA may use
  // an English screen but speak Telugu or Hindi.
  const words = [...KEYWORDS.en, ...KEYWORDS.hi, ...KEYWORDS.te];
  const lower = transcript.toLowerCase();

  const hits = words.filter((w) => lower.includes(w.toLowerCase()));
  if (hits.length === 0) return { level: 'green', triggers: [] };

  const label: Localised = {
    en: 'Possible danger sign',
    hi: 'संभावित खतरे का संकेत',
    te: 'సంభావ్య ప్రమాద సూచన',
  };

  const reason: Localised = {
    en: `Heard the words: ${hits.join(', ')}. Please re-check the patient before saving.`,
    hi: `सुने गए शब्द: ${hits.join(', ')}. सेव करने से पहले मरीज़ को दोबारा जांचें।`,
    te: `వినిపించిన పదాలు: ${hits.join(', ')}. సేవ్ చేయడానికి ముందు మళ్లీ పరిశీలించండి.`,
  };

  return {
    level: 'amber',
    triggers: [
      {
        id: 'keyword_fallback',
        level: 'amber',
        label,
        reason,
        source: 'ASHA Voice keyword fallback (offline safety net)',
      },
    ],
  };
}

/**
 * Shown whenever the AI could not read the visit. It guarantees the
 * screen never says "GREEN: no danger signs" when the record was only
 * read by the offline pattern matcher.
 */
export function aiUnavailableNotice(): Result {
  return {
    level: 'amber',
    triggers: [
      {
        id: 'ai_unavailable',
        level: 'amber',
        label: { en: 'AI could not read this visit', hi: 'AI यह विज़िट नहीं पढ़ पाया', te: 'AI ఈ సందర్శనను చదవలేకపోయింది' },
        reason: {
          en: 'The record was filled by the offline reader. Please check every field and danger sign yourself before saving.',
          hi: 'रिकॉर्ड ऑफ़लाइन रीडर से भरा गया है। सेव करने से पहले हर जानकारी और खतरे के संकेत खुद जांचें।',
          te: 'రికార్డు ఆఫ్‌లైన్ రీడర్ ద్వారా నింపబడింది. సేవ్ చేయడానికి ముందు ప్రతి వివరం, ప్రమాద సూచనలను మీరే తనిఖీ చేయండి.',
        },
        source: 'ASHA Voice offline safety net',
      },
    ],
  };
}

// -------------------- Merging helpers --------------------

/**
 * Merge two results (e.g. rule engine + keyword fallback) into one,
 * keeping the most severe level and deduplicating by trigger id.
 */
export function mergeResults(...results: Result[]): Result {
  const byId = new Map<string, Trigger>();
  for (const r of results) {
    for (const t of r.triggers) {
      if (!byId.has(t.id)) byId.set(t.id, t);
    }
  }
  const triggers = Array.from(byId.values());
  const level: Level = triggers.some((t) => t.level === 'red')
    ? 'red'
    : triggers.some((t) => t.level === 'amber')
      ? 'amber'
      : 'green';
  return { level, triggers };
}

// -------------------- Small helpers for the UI --------------------

export function levelColour(level: Level): {
  bg: string;
  border: string;
  text: string;
  icon: string;
} {
  switch (level) {
    case 'red':
      return {
        bg: 'bg-danger/10',
        border: 'border-danger',
        text: 'text-danger',
        icon: '🚨',
      };
    case 'amber':
      return {
        bg: 'bg-watch/10',
        border: 'border-watch',
        text: 'text-watch',
        icon: '⚠️',
      };
    default:
      return {
        bg: 'bg-safe/10',
        border: 'border-safe',
        text: 'text-safe',
        icon: '✅',
      };
  }
}

export function levelTitle(level: Level, lang: Lang): string {
  const titles: Record<Level, Localised> = {
    red: {
      en: 'RED: Refer today',
      hi: 'लाल: आज रेफर करें',
      te: 'ఎరుపు: ఈ రోజే రెఫర్',
    },
    amber: {
      en: 'AMBER: Watch closely',
      hi: 'पीला: ध्यान से देखें',
      te: 'పసుపు: గమనించండి',
    },
    green: {
      en: 'GREEN: No danger signs found',
      hi: 'हरा: कोई खतरा नहीं मिला',
      te: 'ఆకుపచ్చ: ప్రమాద సూచనలు లేవు',
    },
  };
  return titles[level][lang];
}