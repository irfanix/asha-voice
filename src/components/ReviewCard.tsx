// ------------------------------------------------------------------
// ReviewCard
//
// Shows the AI-extracted record so the ASHA can confirm or correct
// every field BEFORE saving. Design rules from the prompt:
//   - Confirmed / filled fields: normal style
//   - Missing or uncertain fields: highlighted amber, tap to fix
//   - Missing critical items shown as a gentle prompt
//     ("Please also check: BP, weight")
//   - Numbers use a numeric keypad; empty stays empty (never guessed)
//
// The parent owns the Extraction object and re-renders this card on
// every edit via onChange(next).
// ------------------------------------------------------------------

import { useTranslation } from 'react-i18next';
import type { Extraction } from '../ai/schemas';
import { SYMPTOM_LABELS, type Symptom } from '../rules/vocabulary';
import type { Lang } from '../rules/dangerSigns';

type Props = {
  extraction: Extraction;
  lang: Lang;
  onChange: (next: Extraction) => void;
};

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------

function isSymptom(code: string): code is Symptom {
  return Object.prototype.hasOwnProperty.call(SYMPTOM_LABELS, code);
}

function symptomLabel(code: string, lang: Lang): string {
  if (isSymptom(code)) return SYMPTOM_LABELS[code][lang];
  return code; // free-text "other symptom"
}

// ------------------------------------------------------------------
// Field component: label + numeric input + amber highlight if empty
// ------------------------------------------------------------------
type NumberFieldProps = {
  label: string;
  value: number | null | undefined;
  unit?: string;
  keyName: keyof Extraction['vitals'];
  onChange: (patch: Partial<Extraction['vitals']>) => void;
  step?: string;
};

function NumberField({
  label,
  value,
  unit,
  keyName,
  onChange,
  step = 'any',
}: NumberFieldProps) {
  const missing = value === null || value === undefined;
  return (
    <label className="block">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="flex items-center gap-1 mt-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({ [keyName]: raw === '' ? null : Number(raw) });
          }}
          className={[
            'w-full border rounded-xl px-3 py-2 text-base',
            'focus:border-primary focus:outline-none',
            missing ? 'border-watch bg-watch/5' : 'border-gray-300 bg-white',
          ].join(' ')}
        />
        {unit && <span className="text-xs text-gray-500 whitespace-nowrap">{unit}</span>}
      </div>
    </label>
  );
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------
export default function ReviewCard({ extraction, lang, onChange }: Props) {
  const { t } = useTranslation();

  const updateVitals = (patch: Partial<Extraction['vitals']>) => {
    onChange({ ...extraction, vitals: { ...extraction.vitals, ...patch } });
  };

  const removeSymptom = (code: string) => {
    onChange({
      ...extraction,
      symptoms: extraction.symptoms.filter((s) => s !== code),
    });
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-lg">{t('review_title')}</h3>
          <p className="text-xs text-gray-500">{t('review_hint')}</p>
        </div>
        <span className="text-[11px] text-gray-400 italic">
          {t('settings_notice')}
        </span>
      </div>

      {/* Vitals grid */}
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t('field_bp_systolic')}
          value={extraction.vitals.bp_systolic}
          unit="mmHg"
          keyName="bp_systolic"
          onChange={updateVitals}
          step="1"
        />
        <NumberField
          label={t('field_bp_diastolic')}
          value={extraction.vitals.bp_diastolic}
          unit="mmHg"
          keyName="bp_diastolic"
          onChange={updateVitals}
          step="1"
        />
        <NumberField
          label={t('field_weight')}
          value={extraction.vitals.weight_kg}
          unit="kg"
          keyName="weight_kg"
          onChange={updateVitals}
          step="0.1"
        />
        <NumberField
          label={t('field_temp')}
          value={extraction.vitals.temperature_c}
          unit="°C"
          keyName="temperature_c"
          onChange={updateVitals}
          step="0.1"
        />
        <NumberField
          label={t('field_pulse')}
          value={extraction.vitals.pulse}
          unit="/min"
          keyName="pulse"
          onChange={updateVitals}
          step="1"
        />
        <NumberField
          label={t('field_respiratory_rate')}
          value={extraction.vitals.respiratory_rate}
          unit="/min"
          keyName="respiratory_rate"
          onChange={updateVitals}
          step="1"
        />
      </div>

      {/* Symptoms */}
      <div>
        <p className="text-xs text-gray-600 mb-1">{t('field_symptoms')}</p>
        {extraction.symptoms.length === 0 ? (
          <p className="text-sm text-watch">{t('field_no_symptoms')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {extraction.symptoms.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => removeSymptom(code)}
                className="px-3 py-1.5 rounded-full bg-danger/10 text-danger text-sm
                           flex items-center gap-2 active:scale-95 transition-transform"
                title="Tap to remove"
              >
                <span>{symptomLabel(code, lang)}</span>
                <span aria-hidden="true" className="text-xs opacity-70">
                  ✕
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Other (free-text) symptoms from the LLM */}
      {extraction.other_symptoms.length > 0 && (
        <div>
          <p className="text-xs text-gray-600 mb-1">{t('field_other_symptoms')}</p>
          <ul className="text-sm text-gray-800 list-disc list-inside space-y-0.5">
            {extraction.other_symptoms.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing checks — gentle prompt */}
      {extraction.missing_checks.length > 0 && (
        <div className="p-3 rounded-xl bg-watch/10 border border-watch/30 text-watch text-sm">
          <p className="font-semibold">💡 {t('field_missing_checks', {
            list: extraction.missing_checks.join(', '),
          })}</p>
        </div>
      )}

      {/* English AI summary */}
      {extraction.summary_en && (
        <div className="pt-2 border-t">
          <p className="text-xs text-gray-500 mb-1">{t('field_summary')}</p>
          <p className="text-sm text-gray-800 italic">{extraction.summary_en}</p>
        </div>
      )}
    </div>
  );
}