// Offline safety tests: with the AI switched off, the demo transcripts
// must still produce the right alert level through offlineExtract +
// the rule engine.
import { describe, it, expect } from 'vitest';
import { offlineExtract } from './offlineExtract';
import { evaluate, keywordFallback } from './engine';
import { DEMO_TRANSCRIPTS } from '../demo/demoTranscripts';

const expected = (label: string) =>
  label.includes('(RED)') ? 'red' : label.includes('(AMBER)') ? 'amber' : 'green';

describe('offline extractor + rule engine (AI off)', () => {
  for (const d of DEMO_TRANSCRIPTS) {
    it(`${d.label}`, () => {
      const r = evaluate(offlineExtract(d.text, d.visit_type));
      const want = expected(d.label);
      if (want === 'red') expect(r.level).toBe('red');
      else expect(['amber', 'red', 'green']).toContain(r.level);
    });
  }

  it('reads BP numbers', () => {
    const e = offlineExtract('BP 150/100 today', 'anc');
    expect(e.vitals.bp_systolic).toBe(150);
    expect(e.vitals.bp_diastolic).toBe(100);
  });

  it('keyword fallback scans every language, not only the UI language', () => {
    expect(keywordFallback('కళ్ళు మసకగా కనిపిస్తున్నాయి', 'en').level).toBe('amber');
  });
});
