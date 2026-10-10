// ------------------------------------------------------------------
// Unit tests for the danger sign engine. These prove the safety
// floor works with the LLM switched off. Run with:
//
//   npm run test
//
// The most important test in the whole project is the first one:
// pre-eclampsia symptoms must trigger RED even when no LLM was used.
// ------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { evaluate, keywordFallback, mergeResults } from './engine';
import { emptyExtraction, type Extraction } from '../ai/schemas';

// Helper: build a minimal extraction and override any fields.
function makeExtraction(over: Partial<Extraction>): Extraction {
  return { ...emptyExtraction('anc'), ...over } as Extraction;
}

// =================================================================
//  RULE ENGINE
// =================================================================

describe('danger sign engine — pregnancy (ANC)', () => {
  it('flags pre-eclampsia as RED (headache + blurred vision + high BP)', () => {
    const r = evaluate(
      makeExtraction({
        symptoms: ['severe_headache', 'blurred_vision'],
        vitals: { bp_systolic: 150, bp_diastolic: 100 },
      }),
      { category: 'pregnant', gestational_weeks: 32 },
    );
    expect(r.level).toBe('red');
    const ids = r.triggers.map((t) => t.id);
    expect(ids).toContain('anc_headache_vision');
    expect(ids).toContain('anc_bp_high');
  });

  it('flags isolated severe headache + swelling as RED', () => {
    const r = evaluate(
      makeExtraction({ symptoms: ['severe_headache', 'swelling_face_hands'] }),
      {},
    );
    expect(r.level).toBe('red');
    expect(r.triggers.map((t) => t.id)).toContain('anc_headache_vision');
  });

  it('flags vaginal bleeding as RED', () => {
    const r = evaluate(makeExtraction({ symptoms: ['vaginal_bleeding'] }), {});
    expect(r.level).toBe('red');
    expect(r.triggers[0].id).toBe('anc_bleeding');
  });

  it('flags BP ≥ 140/90 as RED', () => {
    const r = evaluate(
      makeExtraction({ vitals: { bp_systolic: 140, bp_diastolic: 90 } }),
      {},
    );
    expect(r.level).toBe('red');
    expect(r.triggers.map((t) => t.id)).toContain('anc_bp_high');
  });

  it('flags isolated swelling (no headache) as AMBER, not RED', () => {
    const r = evaluate(makeExtraction({ symptoms: ['swelling_face_hands'] }), {});
    expect(r.level).toBe('amber');
    expect(r.triggers.map((t) => t.id)).toContain('anc_swelling_only');
    expect(r.triggers.map((t) => t.id)).not.toContain('anc_headache_vision');
  });

  it('returns GREEN for a normal ANC visit', () => {
    const r = evaluate(
      makeExtraction({ vitals: { bp_systolic: 110, bp_diastolic: 70 } }),
      {},
    );
    expect(r.level).toBe('green');
    expect(r.triggers).toHaveLength(0);
  });
});

describe('danger sign engine — newborn', () => {
  it('flags day-7 newborn "not feeding + fast breathing" as RED', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'newborn',
        symptoms: ['not_feeding', 'fast_breathing'],
      }),
      { category: 'newborn', age_days: 7 },
    );
    expect(r.level).toBe('red');
    const ids = r.triggers.map((t) => t.id);
    expect(ids).toContain('nb_not_feeding');
    expect(ids).toContain('nb_fast_breathing');
  });

  it('flags respiratory rate ≥ 60 as RED even without a symptom tag', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'newborn',
        vitals: { respiratory_rate: 62 },
      }),
      { category: 'newborn', age_days: 7 },
    );
    expect(r.level).toBe('red');
    expect(r.triggers.map((t) => t.id)).toContain('nb_fast_breathing');
  });

  it('flags yellow palms/soles as RED', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'newborn',
        symptoms: ['yellow_palms_soles'],
      }),
      { category: 'newborn', age_days: 7 },
    );
    expect(r.level).toBe('red');
  });

  it('flags low birth weight (< 2.5 kg) as AMBER', () => {
    const r = evaluate(
      makeExtraction({ visit_type: 'newborn', symptoms: [] }),
      { category: 'newborn', age_days: 3, birth_weight_g: 2200 },
    );
    expect(r.level).toBe('amber');
    expect(r.triggers.map((t) => t.id)).toContain('nb_lbw');
  });

  it('returns GREEN for a healthy newborn check', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'newborn',
        vitals: { temperature_c: 36.8, respiratory_rate: 44 },
      }),
      { category: 'newborn', age_days: 20, birth_weight_g: 2900 },
    );
    expect(r.level).toBe('green');
  });
});

describe('danger sign engine — postnatal mother', () => {
  it('flags heavy bleeding after delivery as RED', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'postnatal',
        symptoms: ['heavy_bleeding'],
      }),
      { category: 'mother' },
    );
    expect(r.level).toBe('red');
    expect(r.triggers.map((t) => t.id)).toContain('pn_heavy_bleeding');
  });

  it('flags isolated breast pain as AMBER', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'postnatal',
        symptoms: ['breast_pain'],
      }),
      { category: 'mother' },
    );
    expect(r.level).toBe('amber');
    expect(r.triggers.map((t) => t.id)).toContain('pn_breast');
  });
});

describe('danger sign engine — child under 5', () => {
  it('flags unable to drink as RED', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'child',
        symptoms: ['unable_to_drink'],
      }),
      { category: 'child', age_days: 270 },
    );
    expect(r.level).toBe('red');
  });

  it('uses age-appropriate fast breathing thresholds (infant < 12 mo: ≥ 50)', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'child',
        vitals: { respiratory_rate: 52 },
      }),
      { category: 'child', age_days: 200 },
    );
    expect(r.level).toBe('red');
    expect(r.triggers.map((t) => t.id)).toContain('ch_fast_breathing');
  });

  it('does NOT flag RR 45 for an infant < 12 months (below 50 threshold)', () => {
    const r = evaluate(
      makeExtraction({
        visit_type: 'child',
        vitals: { respiratory_rate: 45 },
      }),
      { category: 'child', age_days: 200 },
    );
    expect(r.level).toBe('green');
  });
});

// =================================================================
//  KEYWORD FALLBACK
// =================================================================

describe('keyword fallback (offline safety net)', () => {
  it('raises AMBER when English transcript contains "bleeding"', () => {
    const r = keywordFallback('She has some bleeding since morning', 'en');
    expect(r.level).toBe('amber');
    expect(r.triggers[0].id).toBe('keyword_fallback');
  });

  it('raises AMBER for Hindi "खून"', () => {
    const r = keywordFallback('मरीज़ को खून आ रहा है', 'hi');
    expect(r.level).toBe('amber');
  });

  it('raises AMBER for Telugu "రక్తస్రావం"', () => {
    const r = keywordFallback('రక్తస్రావం జరుగుతోంది', 'te');
    expect(r.level).toBe('amber');
  });

  it('returns GREEN when no danger keywords are present', () => {
    const r = keywordFallback('She is eating well, no complaints', 'en');
    expect(r.level).toBe('green');
    expect(r.triggers).toHaveLength(0);
  });
});

// =================================================================
//  MERGE
// =================================================================

describe('mergeResults', () => {
  it('keeps the more severe level and deduplicates by id', () => {
    const a = evaluate(
      makeExtraction({ symptoms: ['swelling_face_hands'] }),
      {},
    ); // amber
    const b = evaluate(
      makeExtraction({ symptoms: ['vaginal_bleeding'] }),
      {},
    ); // red
    const merged = mergeResults(a, b);
    expect(merged.level).toBe('red');
    // 2 unique triggers, no duplicates
    expect(merged.triggers.length).toBe(2);
  });

  it('deduplicates the same trigger id', () => {
    const a = evaluate(makeExtraction({ symptoms: ['vaginal_bleeding'] }), {});
    const b = evaluate(makeExtraction({ symptoms: ['vaginal_bleeding'] }), {});
    const merged = mergeResults(a, b);
    expect(merged.triggers).toHaveLength(1);
  });
});

// =================================================================
//  ROBUSTNESS
// =================================================================

describe('robustness', () => {
  it('does not throw on an empty extraction', () => {
    expect(() => evaluate(emptyExtraction('anc'), {})).not.toThrow();
  });

  it('does not throw when vitals are null', () => {
    expect(() =>
      evaluate(
        makeExtraction({
          vitals: {
            bp_systolic: null,
            bp_diastolic: null,
            temperature_c: null,
            respiratory_rate: null,
          },
        }),
        {},
      ),
    ).not.toThrow();
  });
});
describe('postnatal fever (any fever after delivery)', () => {
  it('mild fever after delivery is RED', () => {
    const r = evaluate({
      visit_type: 'postnatal', vitals: {}, symptoms: ['fever', 'breast_pain'], other_symptoms: [],
      observations: {}, services: {}, missing_checks: [], confidence: {}, summary_en: '',
    });
    expect(r.level).toBe('red');
    expect(r.triggers.map((x) => x.id)).toContain('pn_fever');
  });
  it('temperature of 38 C after delivery is RED', () => {
    const r = evaluate({
      visit_type: 'postnatal', vitals: { temperature_c: 38.2 }, symptoms: [], other_symptoms: [],
      observations: {}, services: {}, missing_checks: [], confidence: {}, summary_en: '',
    });
    expect(r.level).toBe('red');
  });
  it('mild fever in pregnancy is AMBER', () => {
    const r = evaluate({
      visit_type: 'anc', vitals: {}, symptoms: ['fever'], other_symptoms: [],
      observations: {}, services: {}, missing_checks: [], confidence: {}, summary_en: '',
    });
    expect(r.level).toBe('amber');
  });
});
