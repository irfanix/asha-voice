// ------------------------------------------------------------------
// Privacy layer. Before ANY text is sent to the LLM, names, phone
// numbers and ID-like numbers are replaced with tokens like
// [NAME_1], [PHONE_1], [ID_1]. After the LLM responds, the same
// tokens are swapped back locally so the ASHA sees the real names.
//
// The map of token -> real value NEVER leaves the browser. Show the
// "🔒 Names removed before AI" badge whenever a request is in flight.
// ------------------------------------------------------------------

export type RedactMap = Record<string, string>;

// Indian mobile numbers: 10 digits starting with 6-9, optional +91,
// optional space or dash separators.
const PHONE_RE = /\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g;

// Any 8-12 digit run that survived the phone regex (IDs, Aadhaar last
// digits, MCP numbers, etc.). Conservative on purpose.
const ID_RE = /\b\d{8,12}\b/g;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redact(
  text: string,
  knownNames: string[] = [],
): { redacted: string; map: RedactMap } {
  const map: RedactMap = {};
  let out = text;

  // 1) Replace every known name (longest first, so "Lakshmi Devi"
  //    wins over "Lakshmi" if both are in the list).
  const names = [...new Set(knownNames)]
    .filter((n) => n && n.trim().length >= 2)
    .sort((a, b) => b.length - a.length);

  names.forEach((name, i) => {
    const token = `[NAME_${i + 1}]`;
    const re = new RegExp(`\\b${escapeRegex(name.trim())}\\b`, 'gi');
    if (re.test(out)) {
      map[token] = name.trim();
      out = out.replace(re, token);
    }
  });

  // 2) Replace phone numbers.
  out = out.replace(PHONE_RE, (match) => {
    const token = `[PHONE_${Object.keys(map).length + 1}]`;
    map[token] = match;
    return token;
  });

  // 3) Replace ID-like numbers.
  out = out.replace(ID_RE, (match) => {
    const token = `[ID_${Object.keys(map).length + 1}]`;
    map[token] = match;
    return token;
  });

  return { redacted: out, map };
}

/**
 * Swap tokens back to their original values after the LLM responds.
 * Safe to call even if some tokens were never used.
 */
export function restore(text: string, map: RedactMap): string {
  let out = text;
  // Replace longest tokens first (e.g. [NAME_10] before [NAME_1]).
  const tokens = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    out = out.split(token).join(map[token]);
  }
  return out;
}

/**
 * Deeply restore a JSON-serialisable value. Handles strings, arrays
 * and plain objects — used after parsing an Extraction.
 */
export function restoreDeep<T>(value: T, map: RedactMap): T {
  if (typeof value === 'string') {
    return restore(value, map) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => restoreDeep(v, map)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = restoreDeep(v, map);
    }
    return out as T;
  }
  return value;
}