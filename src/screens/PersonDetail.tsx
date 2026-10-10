// ------------------------------------------------------------------
// PersonDetail
//
// Shows everything about one person:
//   - header with key facts (e.g. "Pregnant · 32 weeks · EDD 14 Dec")
//   - due-list (next ANC / HBNC / vaccine from the planner)
//   - visit timeline (most recent first, colour-coded)
//   - referrals with status chips
//   - immunisation history
//   - primary actions: Record visit, Call (if phone), Message family
//
// All data comes from IndexedDB. No network needed.
// ------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  all,
  get,
  getSettings,
  type Person,
  type Visit,
  type Referral,
  type Immunisation,
  type Settings,
} from '../db';
import { daysBetween, fromIsoDate } from '../planner/schedules';
import { SPEECH_LOCALE, type AppLanguage } from '../i18n';
import type { Lang } from '../rules/dangerSigns';

export default function PersonDetail() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();

  const lang = ((i18n.language as AppLanguage) || 'en') as Lang;

  const [person, setPerson] = useState<Person | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [immunisations, setImmunisations] = useState<Immunisation[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, vs, rs, ims, s] = await Promise.all([
        get<Person>('persons', id),
        all<Visit>('visits'),
        all<Referral>('referrals'),
        all<Immunisation>('immunisations'),
        getSettings(),
      ]);
      setPerson(p ?? null);
      setVisits(
        vs.filter((v) => v.person_id === id).sort((a, b) => b.date.localeCompare(a.date)),
      );
      setReferrals(
        rs.filter((r) => r.person_id === id).sort((a, b) => {
          const aAt = a.history?.[0]?.at ?? 0;
          const bAt = b.history?.[0]?.at ?? 0;
          return bAt - aAt;
        }),
      );
      setImmunisations(
        ims.filter((i) => i.person_id === id).sort((a, b) => a.due_date.localeCompare(b.due_date)),
      );
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------- Header summary ----------------
  const header = useMemo(() => {
    if (!person) return { title: '', subtitle: '' };
    const today = new Date();

    if (person.category === 'pregnant' && person.lmp) {
      const weeks = Math.floor(daysBetween(today, fromIsoDate(person.lmp)) / 7);
      const edd = person.edd ? ` · EDD ${person.edd}` : '';
      return {
        title: person.name,
        subtitle: `Pregnant · ${weeks} weeks${edd}`,
      };
    }
    if (person.category === 'newborn' && person.dob) {
      const days = daysBetween(today, fromIsoDate(person.dob));
      return {
        title: person.name,
        subtitle: `Newborn · ${days} day${days === 1 ? '' : 's'} old`,
      };
    }
    if (person.category === 'child' && person.dob) {
      const months = Math.floor(daysBetween(today, fromIsoDate(person.dob)) / 30);
      return {
        title: person.name,
        subtitle: `Child · ${months} month${months === 1 ? '' : 's'} old`,
      };
    }
    if (person.category === 'mother' && person.delivery_date) {
      const days = daysBetween(today, fromIsoDate(person.delivery_date));
      return {
        title: person.name,
        subtitle: `Mother · ${days} day${days === 1 ? '' : 's'} after delivery`,
      };
    }
    return { title: person.name, subtitle: person.category };
  }, [person]);

  // ---------------- Due-list ----------------
  const dueItems = useMemo(() => {
    if (!person) return [];
    const items: { icon: string; label: string; detail: string }[] = [];

    // ANC
    if (person.category === 'pregnant' && person.lmp) {
      const weeks = Math.floor(
        daysBetween(new Date(), fromIsoDate(person.lmp)) / 7,
      );
      const schedule = [12, 20, 26, 30, 34, 36, 38, 40];
      const next = schedule.find((w) => w >= weeks);
      if (next != null) {
        items.push({
          icon: '🤰',
          label: t('due_next_anc'),
          detail: `Week ${next} (currently ${weeks} weeks)`,
        });
      }
    }

    // HBNC
    if (
      (person.category === 'newborn' || person.category === 'mother') &&
      person.delivery_date
    ) {
      const age = daysBetween(new Date(), fromIsoDate(person.delivery_date));
      const hbnc = [1, 3, 7, 14, 21, 28, 42];
      const next = hbnc.find((d) => d >= age);
      if (next != null) {
        items.push({
          icon: '👶',
          label: t('due_next_hbnc'),
          detail: `Day ${next} (currently day ${age})`,
        });
      }
    }

    // Next vaccine from the immunisation records
    const nextImm = immunisations.find((i) => !i.given_date);
    if (nextImm) {
      items.push({
        icon: '💉',
        label: t('due_next_vaccine'),
        detail: `${nextImm.vaccine} · ${nextImm.due_date}`,
      });
    }

    return items;
  }, [person, immunisations, t]);

  // ---------------- Helpers ----------------
  const speak = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LOCALE[(settings?.language as AppLanguage) || lang];
      u.rate = settings?.voice_rate ?? 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  };

  const levelBadge = (level: Visit['alert_level']) => {
    if (level === 'red')
      return (
        <span className="text-[10px] font-bold bg-danger/10 text-danger px-2 py-0.5 rounded-full">
          🚨 RED
        </span>
      );
    if (level === 'amber')
      return (
        <span className="text-[10px] font-bold bg-watch/10 text-watch px-2 py-0.5 rounded-full">
          ⚠️ AMBER
        </span>
      );
    return (
      <span className="text-[10px] font-bold bg-safe/10 text-safe px-2 py-0.5 rounded-full">
        ✅ GREEN
      </span>
    );
  };

  const statusLabel = (status: Referral['status']): string => {
    switch (status) {
      case 'Pending':
        return t('referral_status_pending');
      case 'Reached facility':
        return t('referral_status_reached');
      case 'Treated':
        return t('referral_status_treated');
      case 'Lost':
        return t('referral_status_lost');
    }
  };

  const statusColour = (status: Referral['status']): string => {
    switch (status) {
      case 'Pending':
        return 'text-watch bg-watch/10';
      case 'Reached facility':
        return 'text-primary bg-primary/10';
      case 'Treated':
        return 'text-safe bg-safe/10';
      case 'Lost':
        return 'text-gray-500 bg-gray-100';
    }
  };

  // ---------------- Render ----------------
  if (loading) {
    return (
      <p className="text-center py-12 text-gray-400 text-sm">
        {t('common_loading')}
      </p>
    );
  }

  if (!person) {
    return (
      <div className="space-y-4">
        <p className="text-center text-gray-500">Person not found.</p>
        <button
          type="button"
          onClick={() => navigate('/people')}
          className="w-full py-3 rounded-2xl border-2 border-primary text-primary"
        >
          ← {t('people')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <header>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-primary mb-1"
        >
          ← {t('onboarding_back')}
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{header.title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{header.subtitle}</p>
      </header>

      {/* Primary actions */}
      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => navigate(`/record?person_id=${person.id}`)}
          className="py-3 rounded-2xl bg-primary text-white font-semibold
                     flex items-center justify-center gap-2
                     active:scale-95 transition-transform"
        >
          🎤 {t('record_visit')}
        </button>
        <button
          type="button"
          onClick={() => speak(t('greeting', { name: person.name }))}
          className="py-3 rounded-2xl border-2 border-primary text-primary font-semibold
                     flex items-center justify-center gap-2
                     active:scale-95 transition-transform"
        >
          🔊 {t('play_aloud')}
        </button>
      </section>

      {/* Due-list */}
      {dueItems.length > 0 && (
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">📅 Due</h2>
          <ul className="space-y-2">
            {dueItems.map((d, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="text-xl" aria-hidden="true">
                  {d.icon}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{d.label}</p>
                  <p className="text-xs text-gray-500">{d.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Timeline */}
      <section>
        <h2 className="font-bold text-gray-900 mb-2">
          📋 {t('timeline')} ({visits.length})
        </h2>
        {visits.length === 0 ? (
          <p className="text-sm text-gray-500">{t('no_timeline')}</p>
        ) : (
          <ul className="space-y-2">
            {visits.map((v) => (
              <li
                key={v.id}
                className="bg-white rounded-2xl p-3 shadow-sm border-l-4"
                style={{
                  borderLeftColor:
                    v.alert_level === 'red'
                      ? '#B4233A'
                      : v.alert_level === 'amber'
                        ? '#B45309'
                        : '#1F7A3F',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    {v.date} · {v.type}
                  </span>
                  {levelBadge(v.alert_level)}
                </div>
                {v.extraction?.summary_en && (
                  <p className="text-xs text-gray-600 mt-1">
                    {v.extraction.summary_en}
                  </p>
                )}
                {v.triggers.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {v.triggers.slice(0, 3).map((trg: any, i: number) => (
                      <li key={i} className="text-xs text-danger">
                        • {trg.label?.[lang] ?? trg.id}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Referrals */}
      <section>
        <h2 className="font-bold text-gray-900 mb-2">
          🏥 {t('referrals')} ({referrals.length})
        </h2>
        {referrals.length === 0 ? (
          <p className="text-sm text-gray-500">{t('no_referrals')}</p>
        ) : (
          <ul className="space-y-2">
            {referrals.map((r) => (
              <li key={r.id} className="bg-white rounded-2xl p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    {r.facility}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColour(
                      r.status,
                    )}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">{r.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Immunisations */}
      {immunisations.length > 0 && (
        <section>
          <h2 className="font-bold text-gray-900 mb-2">
            💉 {t('immunisations')} ({immunisations.length})
          </h2>
          <ul className="space-y-2">
            {immunisations.map((i) => (
              <li key={i.id} className="bg-white rounded-2xl p-3 shadow-sm text-sm">
                <p className="font-medium text-gray-800">{i.vaccine}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Due {i.due_date}
                  {i.given_date ? ` · Given ${i.given_date}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}