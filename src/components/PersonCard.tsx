// ------------------------------------------------------------------
// PersonCard
//
// A single card on the "Today" screen representing one due visit.
// Shows:
//   - the person's name
//   - a short subtitle (what kind of visit)
//   - the "why" reason (explainable priority)
//   - a coloured left border based on the alert level
//   - a big ▶ start button that opens the Record screen pre-filled
//
// Colour is never the only signal — the card also carries an icon
// and an explicit level tag so a colour-blind user can still use it.
// ------------------------------------------------------------------

import { useTranslation } from 'react-i18next';
import type { PlanItem } from '../planner/planner';
import { actionIcon } from '../planner/planner';

type Props = {
  item: PlanItem;
  onStart: () => void;
  onCall?: () => void;
  onNavigate?: () => void;
};

const LEVEL_COLOURS: Record<
  PlanItem['level'],
  { border: string; tag: string; tagText: string; icon: string }
> = {
  red: {
    border: 'border-l-danger',
    tag: 'bg-danger/10 text-danger',
    tagText: 'RED',
    icon: '🚨',
  },
  amber: {
    border: 'border-l-watch',
    tag: 'bg-watch/10 text-watch',
    tagText: 'AMBER',
    icon: '⚠️',
  },
  green: {
    border: 'border-l-safe',
    tag: 'bg-safe/10 text-safe',
    tagText: 'GREEN',
    icon: '✅',
  },
};

export default function PersonCard({ item, onStart, onCall, onNavigate }: Props) {
  const { t } = useTranslation();
  const colours = LEVEL_COLOURS[item.level];

  return (
    <article
      className={[
        'bg-white rounded-2xl shadow-sm border-l-4',
        colours.border,
        'p-4',
        'animate-[fadeIn_220ms_ease-out]',
      ].join(' ')}
    >
      {/* Top row: name + level tag */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl" aria-hidden="true">
              {actionIcon(item.action)}
            </span>
            <h3 className="font-bold text-base text-gray-900 truncate">
              {item.person_name}
            </h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colours.tag}`}
            >
              {colours.icon} {colours.tagText}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-800 mt-1">
            {item.title}
          </p>
          {/* Explainable priority: why is this first? */}
          <p className="text-xs text-gray-500 mt-0.5">
            {t('action_why')}: {item.reason}
          </p>
        </div>

        {/* Primary action button */}
        <button
          type="button"
          onClick={onStart}
          className="h-12 w-12 shrink-0 rounded-full bg-primary text-white
                     text-xl flex items-center justify-center
                     active:scale-95 transition-transform shadow"
          aria-label={t('action_start_visit')}
        >
          ▶
        </button>
      </div>

      {/* Secondary actions: Call + Navigate */}
      {(onCall || onNavigate) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onCall && (
            <button
              type="button"
              onClick={onCall}
              className="px-3 py-2 rounded-xl border border-gray-300 text-sm
                         flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <span aria-hidden="true">📞</span>
              {t('action_call')}
            </button>
          )}
          {onNavigate && (
            <button
              type="button"
              onClick={onNavigate}
              className="px-3 py-2 rounded-xl border border-gray-300 text-sm
                         flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <span aria-hidden="true">🧭</span>
              {t('action_navigate')}
            </button>
          )}
        </div>
      )}
    </article>
  );
}