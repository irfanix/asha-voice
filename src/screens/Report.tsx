// ------------------------------------------------------------------
// Report
//
// Monthly summary screen. One tap produces:
//   - counts of visits by type
//   - total red and amber alerts
//   - referrals made vs completed
//   - immunisations due vs given
//   - a simple incentive tracker using EXAMPLE values that vary by
//     state (clearly labelled as such)
//
// Export options:
//   - CSV of every visit this month (id, date, type, alert)
//   - Print / PDF via the browser's print dialog
//
// All computations run on IndexedDB, offline.
// ------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  all,
  type Visit,
  type Referral,
  type Immunisation,
} from '../db';

type MonthStats = {
  visits: number;
  red: number;
  amber: number;
  green: number;
  byType: Record<string, number>;
  referralsTotal: number;
  referralsDone: number;
  vaccinesDue: number;
  vaccinesGiven: number;
};

// Example incentive amounts. Clearly labelled in the UI as "varies
// by state" — do not treat these as authoritative.
const INCENTIVES = [
  { key: 'anc', label_en: 'ANC visit', amount: 50 },
  { key: 'newborn', label_en: 'Newborn HBNC visit', amount: 75 },
  { key: 'immunisation', label_en: 'Immunisation referral', amount: 100 },
  { key: 'institutional', label_en: 'Institutional delivery escort', amount: 300 },
];

export default function Report() {
  const { t } = useTranslation();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [immunisations, setImmunisations] = useState<Immunisation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, r, i] = await Promise.all([
        all<Visit>('visits'),
        all<Referral>('referrals'),
        all<Immunisation>('immunisations'),
      ]);
      setVisits(v);
      setReferrals(r);
      setImmunisations(i);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter to the current calendar month.
  const monthVisits = useMemo(() => {
    const firstIso = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )
      .toISOString()
      .slice(0, 10);
    return visits.filter((v) => v.date >= firstIso);
  }, [visits]);

  const monthReferrals = useMemo(() => {
    const firstAt = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).getTime();
    return referrals.filter(
      (r) => (r.history?.[0]?.at ?? 0) >= firstAt,
    );
  }, [referrals]);

  const stats: MonthStats = useMemo(() => {
    const byType: Record<string, number> = {
      anc: 0,
      newborn: 0,
      child: 0,
      postnatal: 0,
      other: 0,
    };
    let red = 0,
      amber = 0,
      green = 0;

    for (const v of monthVisits) {
      byType[v.type] = (byType[v.type] ?? 0) + 1;
      if (v.alert_level === 'red') red += 1;
      else if (v.alert_level === 'amber') amber += 1;
      else green += 1;
    }

    const referralsDone = monthReferrals.filter(
      (r) => r.status === 'Reached facility' || r.status === 'Treated',
    ).length;

    const vaccinesDue = immunisations.filter((i) => !i.given_date).length;
    const vaccinesGiven = immunisations.filter((i) => !!i.given_date).length;

    return {
      visits: monthVisits.length,
      red,
      amber,
      green,
      byType,
      referralsTotal: monthReferrals.length,
      referralsDone,
      vaccinesDue,
      vaccinesGiven,
    };
  }, [monthVisits, monthReferrals, immunisations]);

  // -------------------- Export helpers --------------------
  const exportCsv = () => {
    const rows: string[][] = [
      ['id', 'date', 'type', 'alert_level', 'person_id'],
    ];
    for (const v of monthVisits) {
      rows.push([v.id, v.date, v.type, v.alert_level, v.person_id]);
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asha-voice-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printPdf = () => {
    window.print();
  };

  // -------------------- Render --------------------
  if (loading) {
    return (
      <p className="text-center py-12 text-gray-400 text-sm">
        {t('common_loading')}
      </p>
    );
  }

  const monthLabel = new Date().toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            📊 {t('report_title')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{monthLabel}</p>
        </div>
      </header>

      {/* Primary stats */}
      <section className="grid grid-cols-2 gap-3">
        <StatTile
          icon="📋"
          label={t('report_visits')}
          value={stats.visits}
        />
        <StatTile
          icon="🚨"
          label={t('report_red')}
          value={stats.red}
          tone="danger"
        />
        <StatTile
          icon="⚠️"
          label={t('report_amber')}
          value={stats.amber}
          tone="watch"
        />
        <StatTile
          icon="✅"
          label="Green"
          value={stats.green}
          tone="safe"
        />
        <StatTile
          icon="🏥"
          label={t('report_referrals')}
          value={`${stats.referralsDone} / ${stats.referralsTotal}`}
        />
        <StatTile
          icon="💉"
          label={t('report_vaccines_done')}
          value={`${stats.vaccinesGiven} / ${stats.vaccinesGiven + stats.vaccinesDue}`}
        />
      </section>

      {/* Visits by type */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-3">
          {t('report_visits')} by type
        </h2>
        <ul className="space-y-2 text-sm">
          {Object.entries(stats.byType).map(([type, count]) => (
            <li key={type} className="flex items-center justify-between">
              <span className="text-gray-700 capitalize">{type}</span>
              <span className="font-semibold text-gray-900">{count}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Incentive tracker */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-bold text-gray-900">
            💰 {t('report_incentives')}
          </h2>
          <span className="text-[11px] text-watch">
            {t('report_incentives_hint')}
          </span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {INCENTIVES.map((row) => {
              const count =
                row.key === 'anc'
                  ? stats.byType.anc ?? 0
                  : row.key === 'newborn'
                    ? stats.byType.newborn ?? 0
                    : row.key === 'immunisation'
                      ? stats.vaccinesGiven
                      : 0;
              const total = count * row.amount;
              return (
                <tr key={row.key} className="border-t border-gray-100">
                  <td className="py-2 text-gray-700">{row.label_en}</td>
                  <td className="py-2 text-right text-gray-500 text-xs">
                    × ₹{row.amount}
                  </td>
                  <td className="py-2 text-right font-semibold text-gray-900">
                    ₹{total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-gray-400 italic">
          These are example amounts. Actual incentive rates are set by
          your state and may differ.
        </p>
      </section>

      {/* Export buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={exportCsv}
          className="py-3 rounded-2xl bg-primary text-white font-semibold
                     active:scale-95 transition-transform"
        >
          ⬇️ {t('report_export_csv')}
        </button>
        <button
          type="button"
          onClick={printPdf}
          className="py-3 rounded-2xl border-2 border-primary text-primary font-semibold
                     active:scale-95 transition-transform"
        >
          🖨️ {t('report_print')}
        </button>
      </div>

      <p className="text-center text-[11px] text-gray-400">
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
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: number | string;
  tone?: 'danger' | 'watch' | 'safe';
}) {
  const colour =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'watch'
        ? 'text-watch'
        : tone === 'safe'
          ? 'text-safe'
          : 'text-primary';

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
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