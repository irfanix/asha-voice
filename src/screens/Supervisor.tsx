// ------------------------------------------------------------------
// Supervisor
//
// One screen where an ASHA supervisor (or the ASHA herself) can check
// everything recorded on this phone:
//   - Needs action: red / amber alerts, overdue visits, open
//     referrals, each with a "Remind" button that opens WhatsApp
//     with a ready reminder for that family
//   - Full register: every person with DOB / age, phone, address,
//     G P A, EDD, last visit and its alert level
//   - Export all data as one CSV file, or share a short summary on
//     WhatsApp with the supervisor
//
// Data stays on the phone (IndexedDB). Nothing is uploaded unless the
// ASHA chooses to export or share it.
// ------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  all,
  getSettings,
  type Person,
  type Visit,
  type Referral,
  type Immunisation,
  type Settings,
} from '../db';
import { buildPlan, type PlanItem } from '../planner/planner';
import { daysBetween, fromIsoDate } from '../planner/schedules';
import { ageInYears, gpaText } from '../components/PersonForm';

// Indian mobile numbers: add the 91 country code for WhatsApp links.
function waNumber(phone?: string): string | null {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
  return d.length >= 10 ? d : null;
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const LEVEL_STYLE: Record<string, string> = {
  red: 'bg-danger/10 text-danger',
  amber: 'bg-watch/10 text-watch',
  green: 'bg-safe/10 text-safe',
};

export default function Supervisor() {
  const { t } = useTranslation();
  const [persons, setPersons] = useState<Person[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [immunisations, setImmunisations] = useState<Immunisation[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, v, r, i, s] = await Promise.all([
        all<Person>('persons'),
        all<Visit>('visits'),
        all<Referral>('referrals'),
        all<Immunisation>('immunisations'),
        getSettings(),
      ]);
      p.sort((a, b) => a.name.localeCompare(b.name));
      setPersons(p);
      setVisits(v);
      setReferrals(r);
      setImmunisations(i);
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plan = useMemo(
    () => buildPlan(new Date(), persons, visits, referrals, immunisations),
    [persons, visits, referrals, immunisations],
  );

  const personById = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);

  const lastVisit = useMemo(() => {
    const m = new Map<string, Visit>();
    for (const v of visits) {
      const cur = m.get(v.person_id);
      if (!cur || v.date > cur.date) m.set(v.person_id, v);
    }
    return m;
  }, [visits]);

  // Items that need the supervisor's attention: today's urgent plan
  // items, plus anyone whose last visit was RED/AMBER, plus anyone in
  // a priority group not visited for more than 30 days.
  const needsAction: PlanItem[] = useMemo(() => {
    const out: PlanItem[] = plan.filter(
      (i) =>
        i.level === 'red' ||
        i.level === 'amber' ||
        (i.overdue_days ?? 0) > 0 ||
        i.action === 'referral_followup',
    );
    const seen = new Set(out.map((i) => i.person_id));
    const today = new Date();
    for (const p of persons) {
      if (seen.has(p.id)) continue;
      const lv = lastVisit.get(p.id);
      const since = lv ? daysBetween(today, fromIsoDate(lv.date)) : null;
      if (lv && lv.alert_level !== 'green') {
        out.push({
          id: `sup_${p.id}`,
          person_id: p.id,
          person_name: p.name,
          priority: lv.alert_level === 'red' ? 0 : 3,
          level: lv.alert_level,
          title: `Last visit ${lv.alert_level.toUpperCase()}: check follow-up`,
          reason: `Last visit ${lv.date}`,
          action: 'red_alert',
          overdue_days: since ?? undefined,
        });
      } else if (
        ['pregnant', 'mother', 'newborn', 'child'].includes(p.category) &&
        (since == null || since > 30)
      ) {
        out.push({
          id: `sup_${p.id}`,
          person_id: p.id,
          person_name: p.name,
          priority: 5,
          level: 'amber',
          title: since == null ? 'No visit recorded yet' : 'Routine visit overdue',
          reason: since == null ? 'Registered, not visited' : `Last visit ${lv!.date}`,
          action: p.category === 'pregnant' ? 'anc' : p.category === 'mother' ? 'postnatal' : p.category === 'newborn' ? 'newborn' : 'child',
          overdue_days: since == null ? undefined : since - 30,
        });
      }
    }
    return out.sort((a, b) => a.priority - b.priority || (b.overdue_days ?? 0) - (a.overdue_days ?? 0));
  }, [plan, persons, lastVisit]);

  const openRef = useMemo(() => {
    const m = new Map<string, Referral>();
    for (const r of referrals) if (r.status === 'Pending') m.set(r.person_id, r);
    return m;
  }, [referrals]);

  const counts = useMemo(() => {
    let red = 0,
      amber = 0;
    for (const p of persons) {
      const lv = lastVisit.get(p.id)?.alert_level;
      if (lv === 'red') red++;
      else if (lv === 'amber') amber++;
    }
    return { red, amber, overdue: needsAction.filter((i) => (i.overdue_days ?? 0) > 0).length };
  }, [persons, lastVisit, needsAction]);

  // -------------------- Actions --------------------
  const remind = (item: PlanItem) => {
    const p = personById.get(item.person_id);
    const num = waNumber(p?.phone);
    if (!num) return;
    const msg = t('sup_reminder_msg', { name: item.person_name, reason: item.title });
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const shareSummary = () => {
    const today = new Date().toISOString().slice(0, 10);
    const lines = [
      `ASHA Voice report ${today}`,
      `ASHA: ${settings?.asha_name || '-'} · Village: ${settings?.village || '-'}`,
      `People: ${persons.length} · Visits: ${visits.length}`,
      `RED: ${counts.red} · AMBER: ${counts.amber} · Overdue: ${counts.overdue} · Open referrals: ${openRef.size}`,
      '',
      `${t('sup_needs_action')}:`,
      ...needsAction.slice(0, 15).map((i) => `- ${i.person_name}: ${i.title} (${i.level.toUpperCase()})`),
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  };

  const exportAll = () => {
    const header = [
      'name', 'type', 'dob', 'age_years', 'phone', 'address', 'G', 'P', 'A', 'lmp', 'edd',
      'delivery_date', 'visits_total', 'last_visit_date', 'last_visit_type', 'last_alert',
      'last_summary', 'open_referral', 'next_action', 'next_action_level',
    ];
    const rows = persons.map((p) => {
      const lv = lastVisit.get(p.id);
      const next = plan.find((i) => i.person_id === p.id);
      return [
        p.name, p.category, p.dob, ageInYears(p.dob) ?? '', p.phone, p.address,
        p.gravida, p.para, p.abortus, p.lmp, p.edd, p.delivery_date,
        visits.filter((v) => v.person_id === p.id).length,
        lv?.date, lv?.type, lv?.alert_level, lv?.extraction?.summary_en,
        openRef.get(p.id)?.reason, next?.title, next?.level,
      ].map(csvCell).join(',');
    });
    const csv = '﻿' + [header.join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `asha-voice-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (loading) return <p className="text-center text-gray-500 py-10">Loading…</p>;

  return (
    <div className="space-y-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">🧑‍⚕️ {t('supervisor')}</h1>
        <p className="text-xs text-gray-500 mt-1">{t('sup_note')}</p>
      </header>

      {/* Quick numbers */}
      <section className="grid grid-cols-4 gap-2 text-center">
        {[
          [t('sup_people'), persons.length, 'text-primary'],
          ['RED', counts.red, 'text-danger'],
          ['AMBER', counts.amber, 'text-watch'],
          [t('sup_overdue'), counts.overdue, 'text-watch'],
        ].map(([label, n, cls]) => (
          <div key={String(label)} className="bg-white rounded-2xl p-2 shadow-sm">
            <p className={`text-xl font-bold ${cls}`}>{n as number}</p>
            <p className="text-[10px] text-gray-500 leading-tight">{label as string}</p>
          </div>
        ))}
      </section>

      {/* Export / share */}
      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={exportAll}
          className="py-3 rounded-2xl bg-primary text-white font-semibold text-sm active:scale-95 transition-transform"
        >
          ⬇️ {t('sup_export_all')}
        </button>
        <button
          type="button"
          onClick={shareSummary}
          className="py-3 rounded-2xl border-2 border-primary text-primary font-semibold text-sm active:scale-95 transition-transform"
        >
          💬 {t('sup_share')}
        </button>
      </section>

      {/* Needs action */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-2">
          🚨 {t('sup_needs_action')} ({needsAction.length})
        </h2>
        {needsAction.length === 0 ? (
          <p className="text-sm text-gray-500">{t('sup_nothing')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {needsAction.map((i) => {
              const hasPhone = !!waNumber(personById.get(i.person_id)?.phone);
              return (
                <li key={i.id} className="py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      <Link to={`/person/${i.person_id}`} className="underline-offset-2 hover:underline">
                        {i.person_name}
                      </Link>{' '}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${LEVEL_STYLE[i.level]}`}>
                        {i.level.toUpperCase()}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600">{i.title}</p>
                    <p className="text-[11px] text-gray-400">
                      {i.reason}
                      {(i.overdue_days ?? 0) > 0 ? ` · ${i.overdue_days} d ${t('sup_overdue')}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remind(i)}
                    disabled={!hasPhone}
                    className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold bg-safe text-white disabled:bg-gray-200 disabled:text-gray-500"
                  >
                    {hasPhone ? `📲 ${t('sup_remind')}` : t('sup_no_phone')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Full register */}
      <section>
        <h2 className="font-bold text-gray-900 mb-2">
          📒 {t('sup_register')} ({persons.length})
        </h2>
        <ul className="space-y-2">
          {persons.map((p) => {
            const lv = lastVisit.get(p.id);
            const age = ageInYears(p.dob);
            const gpa = gpaText(p);
            return (
              <li key={p.id} className="bg-white rounded-2xl p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/person/${p.id}`} className="font-semibold text-gray-900 truncate">
                    {p.name}
                  </Link>
                  {lv && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${LEVEL_STYLE[lv.alert_level]}`}>
                      {lv.alert_level.toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  {t('cat_' + p.category)}
                  {p.dob ? ` · ${t('pf_dob')}: ${p.dob}${age != null ? ` (${age} ${t('years')})` : ''}` : ''}
                  {gpa ? ` · ${gpa}` : ''}
                  {p.edd ? ` · EDD ${p.edd}` : ''}
                </p>
                <p className="text-xs text-gray-600">
                  {p.phone ? (
                    <a href={`tel:${p.phone}`} className="text-primary underline">
                      📞 {p.phone}
                    </a>
                  ) : (
                    `📞 ${t('sup_no_phone')}`
                  )}
                  {p.address ? ` · 🏠 ${p.address}` : ''}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {t('sup_last_visit')}: {lv ? `${lv.date} (${lv.type})` : t('sup_no_visit')}
                  {openRef.has(p.id) ? ` · ${t('sup_open_referral')}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
