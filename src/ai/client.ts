// ------------------------------------------------------------------
// Client for all serverless AI endpoints. Responsibilities:
//   1. Redact names/phones before ANY request leaves the browser.
//   2. Call /api/extract, /api/message, /api/ask.
//   3. On failure or when offline, queue the task in IndexedDB and
//      return a safe fallback so the ASHA can still work.
//   4. Drain the queue automatically when the browser comes online.
//
// The API key NEVER lives here — it is only on the server (Vercel
// env vars). This file only talks to our own /api/* routes.
// ------------------------------------------------------------------

import { redact, restoreDeep, type RedactMap } from './redact';
import { ExtractionSchema, type Extraction } from './schemas';
import { offlineExtract } from '../rules/offlineExtract';
import { put, all, remove, uid, getSettings, type QueueItem } from '../db';
import type { AppLanguage } from '../i18n';

// -------------------- Types --------------------

export type ExtractInput = {
  transcript: string;
  visit_type: 'anc' | 'postnatal' | 'newborn' | 'child' | 'other';
  language: AppLanguage;
  context: {
    category?: string;
    gestational_weeks?: number;
    age_days?: number;
    birth_weight_g?: number;
  };
  knownNames: string[];
  offline: boolean;
};

export type ExtractResult = {
  extraction: Extraction;
  redacted: string;
  usedFallback: boolean;
  redactionMap: RedactMap;
};

export type MessageInput = {
  person_name: string;
  visit_type: string;
  alert_level: 'red' | 'amber' | 'green';
  reasons: string[];
  language: AppLanguage;
};

export type AskInput = {
  question: string;
  language: AppLanguage;
};

export type AskResult = {
  answer: string;
  sources: string[];
};

// -------------------- Extract --------------------

export async function extractVisit(input: ExtractInput): Promise<ExtractResult> {
  // 1. Redact local PII from the transcript.
  const { redacted, map } = redact(input.transcript, input.knownNames);

  // 2. If we know we're offline, skip the network and queue.
  const offline = input.offline || !navigator.onLine;
  if (offline) {
    await enqueue('extract', {
      transcript: redacted,
      visit_type: input.visit_type,
      language: input.language,
      context: input.context,
    });
    return {
      extraction: offlineExtract(input.transcript, input.visit_type),
      redacted,
      usedFallback: true,
      redactionMap: map,
    };
  }

  // 3. Try the API. On any failure (network, 4xx, 5xx), queue and
  //    fall back rather than losing the visit.
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: redacted,
        visit_type: input.visit_type,
        language: input.language,
        context: input.context,
      }),
    });

    if (!res.ok) throw new Error(`extract HTTP ${res.status}`);

    const json = await res.json();
    if (!json?.ok) throw new Error('extract not ok');

    // Validate again on the client so the review card always gets a
    // well-shaped object.
    const parsed = ExtractionSchema.parse(json.extraction);

    // Restore any redacted tokens that the LLM echoed back (e.g.
    // inside summary_en). Names come back to the ASHA locally.
    const restored = restoreDeep(parsed, map);

    return {
      extraction: restored,
      redacted,
      usedFallback: false,
      redactionMap: map,
    };
  } catch (err) {
    // Queue for later, return an empty extraction so the review card
    // still renders with amber "please fill in" prompts.
    await enqueue('extract', {
      transcript: redacted,
      visit_type: input.visit_type,
      language: input.language,
      context: input.context,
    });
    return {
      extraction: offlineExtract(input.transcript, input.visit_type),
      redacted,
      usedFallback: true,
      redactionMap: map,
    };
  }
}

// -------------------- Family message --------------------

export async function familyMessage(input: MessageInput): Promise<string> {
  const fallback = messageFallback(input);

  if (!navigator.onLine) {
    await enqueue('message', input);
    return fallback;
  }

  try {
    const res = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`message HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.message || typeof data.message !== 'string') throw new Error('bad message');
    return data.message;
  } catch {
    await enqueue('message', input);
    return fallback;
  }
}

function messageFallback(input: MessageInput): string {
  const name = input.person_name || '';
  if (input.language === 'te') {
    return input.alert_level === 'red'
      ? `${name} గారు, దయచేసి ఈ రోజే దగ్గరి PHC కి వెళ్లండి.`
      : `${name} గారు, తదుపరి సందర్శన లేదా టీకా గుర్తు చేస్తున్నాము.`;
  }
  if (input.language === 'hi') {
    return input.alert_level === 'red'
      ? `${name} जी, कृपया आज ही नज़दीकी PHC जाएँ।`
      : `${name} जी, अगली विज़िट या टीके की याद दिला रहे हैं।`;
  }
  return input.alert_level === 'red'
    ? `${name}, please visit the nearest PHC today.`
    : `${name}, a reminder about the next visit or vaccine.`;
}

// -------------------- Ask Didi --------------------

export async function askDidi(input: AskInput): Promise<AskResult> {
  if (!navigator.onLine) {
    return {
      answer:
        input.language === 'te'
          ? 'ఇంటర్నెట్ లేదు. ఆన్‌లైన్‌లో మళ్లీ ప్రయత్నించండి.'
          : input.language === 'hi'
            ? 'इंटरनेट नहीं है। ऑनलाइन होकर दोबारा कोशिश करें।'
            : 'No internet. Please try again when you are back online.',
      sources: [],
    };
  }

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`ask HTTP ${res.status}`);
    const data = await res.json();
    return {
      answer: String(data?.answer ?? ''),
      sources: Array.isArray(data?.sources) ? data.sources : [],
    };
  } catch {
    return {
      answer:
        input.language === 'te'
          ? 'సమాధానం ఇవ్వలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి లేదా PHC ని సంప్రదించండి.'
          : input.language === 'hi'
            ? 'उत्तर नहीं दे पाए। दोबारा कोशिश करें या PHC से संपर्क करें।'
            : 'Could not get an answer. Please retry, or contact the PHC.',
      sources: [],
    };
  }
}

// -------------------- Offline queue --------------------

async function enqueue(kind: QueueItem['kind'], payload: any): Promise<void> {
  await put('queue', {
    id: uid(),
    kind,
    payload,
    created_at: Date.now(),
  });
}

export async function queueSize(): Promise<number> {
  const items = await all<QueueItem>('queue');
  return items.length;
}

/**
 * Drain the offline queue. Called by the OfflineBadge whenever the
 * browser fires 'online'. Safe to call multiple times — it just
 * retries whatever is queued.
 */
export async function drainQueue(): Promise<{ ok: number; failed: number }> {
  if (!navigator.onLine) return { ok: 0, failed: 0 };

  const items = await all<QueueItem>('queue');
  let ok = 0;
  let failed = 0;

  for (const item of items) {
    try {
      if (item.kind === 'extract') {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (!res.ok) throw new Error('extract failed');
      } else if (item.kind === 'message') {
        const res = await fetch('/api/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (!res.ok) throw new Error('message failed');
      }
      await remove('queue', item.id);
      ok += 1;
    } catch {
      // Leave it in the queue and try again later.
      failed += 1;
    }
  }

  return { ok, failed };
}

// -------------------- Debug helper --------------------
// Small helper the Settings screen can use to sanity-check the
// current connection + queue state.
export async function aiStatus(): Promise<{ online: boolean; queued: number; language: AppLanguage }> {
  const s = await getSettings();
  const queued = await queueSize();
  return {
    online: navigator.onLine,
    queued,
    language: (s?.language as AppLanguage) ?? 'en',
  };
}