// ------------------------------------------------------------------
// Today
//
// The home screen. Shows:
//   - a greeting with the ASHA's name
//   - three stat tiles (visits this month, danger signs caught,
//     pending referrals)
//   - the prioritised "Today's plan" list of PersonCards, each with
//     a plain-language "why is this first?" reason
//   - a friendly empty state when nothing is due
//
// Data comes straight from IndexedDB. No network call is required,
// so this screen works fully offline.
// ------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import PersonCard from '../components/PersonCard';
import { all, getSettings, type Person, type Visit, type Referral, type Immunisation, type Settings } from '../db';
import { buildPlan, computeStats, type PlanItem, type TodayStats } from '../planner/planner';

export default function Today() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [stats, setStats] = useState<TodayStats>({
    visitsThisMonth: 0,
    dangerSignsCaught: 0,
    pendingReferrals: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, persons, visits, referrals, imms] = await Promise.all([
        getSettings(),
        all<Person>('persons'),
        all<Visit>('visits'),
        all<Referral>('referrals'),
        all<Immunisation>('immunisations'),
      ]);

      setSettings(s);

      const today = new Date();
      setPlan(buildPlan(today, persons, visits, referrals, imms));
      setStats(computeStats(today, visits, referrals));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Refresh whenever the tab regains focus — the ASHA may have
    // saved a visit in another tab (or the app was backgrounded).
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const startVisit = (item: PlanItem) => {
    const params = new URLSearchParams({
      person_id: item.person_id,
      action: item.action,
    });
    navigate(`/record?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      {/* -------------------- Greeting -------------------- */}
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('greeting', { name: settings?.asha_name || '' })}
        </h1>
        {settings?.village && (
          <p className="text-sm text-gray-500 mt-0.5">
            {t('village_label')}: {settings.village}
          </p>
        )}
      </header>

      {/* -------------------- Stats -------------------- */}
      <section className="grid grid-cols-3 gap-2">
        <StatTile
          icon="📋"
          value={stats.visitsThisMonth}
          label={t('today_stats_visits')}
        />
        <StatTile
          icon="🚨"
          value={stats.dangerSignsCaught}
          label={t('today_stats_danger')}
          tone="danger"
        />
        <StatTile
          icon="🏥"
          value={stats.pendingReferrals}
          label={t('today_stats_referrals')}
          tone="watch"
        />
      </section>

      {/* -------------------- Plan header -------------------- */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">
            {t('today_plan')}
          </h2>
          {plan.length > 0 && (
            <span className="text-xs text-gray-500">
              {plan.length} {plan.length === 1 ? 'visit' : 'visits'}
            </span>
          )}
        </div>

        {/* -------------------- Loading -------------------- */}
        {loading && (
          <div className="text-center py-8 text-gray-400 text-sm">
            {t('common_loading')}
          </div>
        )}

        {/* -------------------- Empty state -------------------- */}
        {!loading && plan.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <div className="text-5xl mb-3" aria-hidden="true">
              🌤️
            </div>
            <p className="font-semibold text-gray-800">
              {t('no_visits_today')}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {t('no_visits_today_hint')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/record')}
              className="mt-5 px-5 py-3 rounded-2xl bg-primary text-white
                         font-semibold active:scale-95 transition-transform"
            >
              🎤 {t('record_visit')}
            </button>
          </div>
        )}

        {/* -------------------- Plan list -------------------- */}
        {!loading && plan.length > 0 && (
          <div className="space-y-3">
            {plan.map((item) => (
              <PersonCard
                key={item.id}
                item={item}
                onStart={() => startVisit(item)}
              />
            ))}
          </div>
        )}
      </section>

      {/* -------------------- Safety reminder -------------------- */}
      <p className="text-center text-[11px] text-gray-400 pt-2 pb-4">
        {t('settings_notice')}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------
// Small stat tile
// ------------------------------------------------------------------
function StatTile({
  icon,
  value,
  label,
  tone,
}: {
  icon: string;
  value: number | string;
  label: string;
  tone?: 'danger' | 'watch';
}) {
  const colour =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'watch'
        ? 'text-watch'
        : 'text-primary';

  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm">
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      <p className={`text-2xl font-bold leading-tight mt-1 ${colour}`}>
        {value}
      </p>
      <p className="text-[11px] text-gray-500 leading-tight mt-0.5">
        {label}
      </p>
    </div>
  );
}