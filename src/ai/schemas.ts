// ------------------------------------------------------------------
// Zod schemas for every AI response. The SAME schema is used on the
// server (/api/extract.js) and on the client, so the shape of an
// extraction can never drift between the two.
//
// If the LLM returns anything that fails this schema, the server
// retries once with a "fix your JSON" instruction, and if that also
// fails the API returns a 422 — the client then falls back to the
// keyword engine and lets the ASHA fill the record by hand.
// ------------------------------------------------------------------

import { z } from 'zod';
import { VISIT_TYPES } from '../rules/vocabulary';

export const VitalsSchema = z.object({
  bp_systolic: z.number().nullable().optional(),
  bp_diastolic: z.number().nullable().optional(),
  weight_kg: z.number().nullable().optional(),
  temperature_c: z.number().nullable().optional(),
  pulse: z.number().nullable().optional(),
  respiratory_rate: z.number().nullable().optional(),
});

export const ExtractionSchema = z.object({
  visit_type: z.enum(VISIT_TYPES),
  vitals: VitalsSchema.default({}),
  symptoms: z.array(z.string()).default([]),
  other_symptoms: z.array(z.string()).default([]),
  observations: z.record(z.string(), z.any()).default({}),
  services: z.record(z.string(), z.any()).default({}),
  missing_checks: z.array(z.string()).default([]),
  confidence: z.record(z.string(), z.number()).default({}),
  summary_en: z.string().default(''),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

// Message endpoint: the family message returned by /api/message
export const MessageResponseSchema = z.object({
  message: z.string(),
});

// Ask Didi endpoint: the Q&A response
export const AskResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string()).default([]),
});

// Helper used by the client when the LLM or network fails — returns
// an empty extraction of the correct type so the review card can
// still render, with everything highlighted amber for the ASHA to
// fill in by hand.
export function emptyExtraction(visit_type: Extraction['visit_type']): Extraction {
  return {
    visit_type,
    vitals: {},
    symptoms: [],
    other_symptoms: [],
    observations: {},
    services: {},
    missing_checks: [],
    confidence: {},
    summary_en: '',
  };
}