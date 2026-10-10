// ------------------------------------------------------------------
// AlertPanel
//
// The safety check panel on the Review screen. Shows:
//   - the overall level (RED / AMBER / GREEN) with a big title
//   - one row per triggered danger sign, with:
//       * the plain-language label in the ASHA's language
//       * the reason (why this matters)
//       * the source of the rule
//   - on RED: three action buttons — Call 108, Call PHC, Create referral
//
// Colour is never used alone: every level also shows an icon and a
// title, so the panel is still usable by someone who cannot
// distinguish red from green.
// ------------------------------------------------------------------

import { useTranslation } from 'react-i18next';
import type { Result } from '../rules/engine';
import { levelColour, levelTitle } from '../rules/engine';
import type { Lang } from '../rules/dangerSigns';

type Props = {
  result: Result;
  lang: Lang;
  /** Called when the ASHA taps "Create referral slip". */
  onReferral?: () => void;
  /** Optional PHC phone number; if absent, "Call PHC" is hidden. */
  phcPhone?: string;
  /** Optional ambulance number; defaults to 108. */
  ambulancePhone?: string;
};

export default function AlertPanel({
  result,
  lang,
  onReferral,
  phcPhone,
  ambulancePhone = '108',
}: Props) {
  const { t } = useTranslation();
  const colours = levelColour(result.level);
  const title = levelTitle(result.level, lang);

  const hintKey =
    result.level === 'red'
      ? 'alert_red_hint'
      : result.level === 'amber'
        ? 'alert_amber_hint'
        : 'alert_green_hint';

  return (
    <section
      className={`border-2 rounded-2xl p-4 ${colours.bg} ${colours.border}`}
      aria-live="polite"
    >
      {/* Header: icon + title + hint */}
      <div className={`flex items-start gap-3 ${colours.text}`}>
        <span className="text-3xl leading-none" aria-hidden="true">
          {colours.icon}
        </span>
        <div className="flex-1">
          <h2 className="font-bold text-lg leading-tight">{title}</h2>
          <p className="text-sm text-gray-700 mt-0.5">{t(hintKey)}</p>
        </div>
      </div>

      {/* Trigger list */}
      {result.triggers.length > 0 && (
        <ul className="mt-4 space-y-3">
          {result.triggers.map((trg, idx) => (
            <li
              key={`${trg.id}_${idx}`}
              className="bg-white/70 rounded-xl p-3 border border-gray-200"
            >
              <p className="font-semibold text-gray-900">
                {trg.level === 'red' ? '🚨 ' : trg.level === 'amber' ? '⚠️ ' : ''}
                {trg.label[lang]}
              </p>
              <p className="text-sm text-gray-700 mt-1">{trg.reason[lang]}</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {t('source_label')}: {trg.source}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Action buttons — only for RED */}
      {result.level === 'red' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`tel:${ambulancePhone}`}
            className="px-4 py-3 rounded-xl bg-danger text-white font-semibold
                       active:scale-95 transition-transform flex items-center gap-2"
          >
            <span aria-hidden="true">🚑</span>
            {t('call_108')}
          </a>

          {phcPhone && (
            <a
              href={`tel:${phcPhone}`}
              className="px-4 py-3 rounded-xl bg-primary text-white font-semibold
                         active:scale-95 transition-transform flex items-center gap-2"
            >
              <span aria-hidden="true">📞</span>
              {t('call_phc')}
            </a>
          )}

          {onReferral && (
            <button
              type="button"
              onClick={onReferral}
              className="px-4 py-3 rounded-xl border-2 border-danger text-danger
                         font-semibold active:scale-95 transition-transform
                         flex items-center gap-2"
            >
              <span aria-hidden="true">📝</span>
              {t('create_referral')}
            </button>
          )}
        </div>
      )}

      {/* Safety reminder — always visible, three languages */}
      <p className="mt-3 text-[11px] text-gray-500 italic">
        {t('settings_notice')}
      </p>
    </section>
  );
}