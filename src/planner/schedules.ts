// ------------------------------------------------------------------
// Schedules used by the visit planner. All data here comes from
// official Indian guidance. Before shipping to real ASHAs, verify
// each schedule against the current MoHFW / NHM / UIP documents.
//
// Sources:
//   - ANC visit schedule: MoHFW Mother and Child Protection (MCP) card
//   - HBNC visit days: Home Based Newborn Care (HBNC) guidelines
//   - Immunisation schedule: Universal Immunisation Programme (UIP)
// ------------------------------------------------------------------

// -------------------- ANC --------------------
// Recommended ANC visits by gestational week. The MCP card lists
// visits around these weeks. We use them to build the "next ANC due"
// reminder and the "why is this first?" reason on each card.
export const ANC_VISIT_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40] as const;

// Minimum recommended: 4 visits (weeks 12, 20, 26, 30 minimum, then
// fortnightly from 36). The list above follows the MCP card.

// -------------------- HBNC --------------------
// Home Based Newborn Care visit days (after birth). Day 1 only for
// home deliveries; the rest apply to all newborns.
export const HBNC_VISIT_DAYS = [1, 3, 7, 14, 21, 28, 42] as const;

// -------------------- Immunisation (UIP) --------------------
// Age is expressed in days from birth. Names match the UIP wording
// as closely as possible.
export type UIPEntry = {
  vaccine: string;
  age_days: number;
  label_en: string;
};

export const UIP_SCHEDULE: UIPEntry[] = [
  { vaccine: 'BCG', age_days: 0, label_en: 'BCG (at birth)' },
  { vaccine: 'OPV-0', age_days: 0, label_en: 'OPV-0 (at birth)' },
  { vaccine: 'Hep-B birth', age_days: 0, label_en: 'Hepatitis B (at birth)' },
  {
    vaccine: 'OPV-1 + Penta-1 + Rota-1 + PCV-1',
    age_days: 42,
    label_en: 'OPV-1, Penta-1, Rota-1, PCV-1 (6 weeks)',
  },
  {
    vaccine: 'OPV-2 + Penta-2 + Rota-2',
    age_days: 70,
    label_en: 'OPV-2, Penta-2, Rota-2 (10 weeks)',
  },
  {
    vaccine: 'OPV-3 + Penta-3 + Rota-3 + PCV-2',
    age_days: 98,
    label_en: 'OPV-3, Penta-3, Rota-3, PCV-2 (14 weeks)',
  },
  {
    vaccine: 'Measles-1 + PCV-Booster + Vit-A(1)',
    age_days: 270,
    label_en: 'Measles-1, PCV-Booster, Vitamin A (9 months)',
  },
  {
    vaccine: 'DPT-Booster-1 + Measles-2 + Vit-A(2)',
    age_days: 480,
    label_en: 'DPT-Booster-1, Measles-2, Vitamin A (16-24 months)',
  },
  {
    vaccine: 'DPT-Booster-2',
    age_days: 1825,
    label_en: 'DPT-Booster-2 (5 years)',
  },
];

// -------------------- Referral follow-up --------------------
// Days after a referral during which the ASHA should check whether
// the family actually reached the facility.
export const REFERRAL_FOLLOWUP_DAYS = [1, 3] as const;

// -------------------- Planning window --------------------
// The planner only surfaces items that are due within this many days
// in the future or overdue. Keeps the "Today" list focused.
export const PLAN_LOOKAHEAD_DAYS = 7;

// -------------------- Helpers --------------------
export function daysBetween(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 86400000);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}