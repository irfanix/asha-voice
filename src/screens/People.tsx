// ------------------------------------------------------------------
// People
//
// Household registry. Shows a list of every person on the device
// with a filter bar:
//   All · Pregnant · Newborns · Under 5 · Overdue
//
// Tapping a person navigates to PersonDetail, which shows their
// timeline, referrals and immunisations.
//
// All data comes from IndexedDB — this screen works fully offline.
// ------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import PersonForm from '../components/PersonForm';
import {
  all,
  put,
  type Person,
  type Visit,
  type Referral,
} from '../db';
import { daysBetween, fromIsoDate } from '../planner/schedules';

type Filter = 'all' | 'pregnant' | 'newborn' | 'child' | 'overdue';

export default function People() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [persons, setPersons] = useState<Person[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, v, r] = await Promise.all([
        all<Person>('persons'),
        all<Visit>('visits'),
        all<Referral>('referrals'),
      ]);
      p.sort((a, b) => a.name.localeCompare(b.name));
      setPersons(p);
      setVisits(v);
      setReferrals(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Quick lookup: person_id -> has open referral.
  const openReferrals = useMemo(() => {
    const set = new Set<string>();
    for (const r of referrals) {
      if (r.status === 'Pending') set.add(r.person_id);
    }
    return set;
  }, [referrals]);

  // Quick lookup: person_id -> age in days.
  const ageInDays = useMemo(() => {
    const map = new Map<string, number>();
    const today = new Date();
    for (const p of persons) {
      if (p.dob) map.set(p.id, daysBetween(today, fromIsoDate(p.dob)));
      else if (p.delivery_date)
        map.set(p.id, daysBetween(today, fromIsoDate(p.delivery_date)));
    }
    return map;
  }, [persons]);

  // Quick lookup: person_id -> was red on their last visit.
  const redLastVisit = useMemo(() => {
    const lastByPerson = new Map<string, Visit>();
    for (const v of visits) {
      const prev = lastByPerson.get(v.person_id);
      if (!prev || v.date > prev.date) lastByPerson.set(v.person_id, v);
    }
    const set = new Set<string>();
    for (const [pid, v] of lastByPerson) {
      if (v.alert_level === 'red') set.add(pid);
    }
    return set;
  }, [visits]);

  // Apply filters + search.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return persons.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;

      switch (filter) {
        case 'pregnant':
          return p.category === 'pregnant';
        case 'newborn': {
          const age = ageInDays.get(p.id);
          return p.category === 'newborn' && age != null && age <= 42;
        }
        case 'child': {
          const age = ageInDays.get(p.id);
          return p.category === 'child' && age != null && age < 365 * 5;
        }
        case 'overdue':
          return openReferrals.has(p.id) || redLastVisit.has(p.id);
        case 'all':
        default:
          return true;
      }
    });
  }, [persons, filter, query, ageInDays, openReferrals, redLastVisit]);

  const FILTERS: { id: Filter; labelKey: string }[] = [
    { id: 'all', labelKey: 'people_filter_all' },
    { id: 'pregnant', labelKey: 'people_filter_pregnant' },
    { id: 'newborn', labelKey: 'people_filter_newborn' },
    { id: 'child', labelKey: 'people_filter_child' },
    { id: 'overdue', labelKey: 'people_filter_overdue' },
  ];

  // Helper to render a subtitle for a person card.
  const subtitleFor = (p: Person): string => {
    if (p.category === 'pregnant' && p.edd) {
      const weeks = p.lmp
        ? Math.floor(daysBetween(new Date(), fromIsoDate(p.lmp)) / 7)
        : null;
      return weeks != null
        ? `${weeks} weeks pregnant · EDD ${p.edd}`
        : `Pregnant · EDD ${p.edd}`;
    }
    if (p.category === 'newborn' && p.dob) {
      const days = ageInDays.get(p.id) ?? 0;
      return `Newborn · ${days} day${days === 1 ? '' : 's'} old`;
    }
    if (p.category === 'child' && p.dob) {
      const months = Math.floor((ageInDays.get(p.id) ?? 0) / 30);
      return `Child · ${months} month${months === 1 ? '' : 's'} old`;
    }
    if (p.category === 'mother') return 'Mother (postnatal)';
    return p.category;
  };

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-end justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('people')}</h1>
        <span className="text-xs text-gray-500">
          {shown.length} / {persons.length}
        </span>
      </header>

      {/* Add a new person (name, DOB, phone, address, G P A for pregnant women) */}
      <button
        type="button"
        onClick={() => setAdding((v) => !v)}
        className="w-full py-3 rounded-2xl bg-primary text-white font-semibold active:scale-95 transition-transform"
      >
        ➕ {t('add_person')}
      </button>
      {adding && (
        <PersonForm
          defaultCategory="pregnant"
          onCancel={() => setAdding(false)}
          onSave={async (np) => {
            await put('persons', np);
            setAdding(false);
            await load();
          }}
        />
      )}

      <Link
        to="/supervisor"
        className="block w-full py-3 rounded-2xl border-2 border-primary text-primary text-center font-semibold text-sm"
      >
        🧑‍⚕️ {t('sup_open')}
      </Link>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search_person')}
          className="w-full border border-gray-300 rounded-2xl pl-10 pr-3 py-3
                     bg-white text-base focus:border-primary focus:outline-none"
        />
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        >
          🔍
        </span>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={[
                'shrink-0 px-4 py-2 rounded-full border text-sm font-medium',
                'transition-colors',
                active
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-700 border-gray-300',
              ].join(' ')}
            >
              {t(f.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <p className="text-center py-8 text-gray-400 text-sm">
          {t('common_loading')}
        </p>
      )}

      {/* Empty state */}
      {!loading && shown.length === 0 && (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
          <div className="text-5xl mb-3" aria-hidden="true">
            👥
          </div>
          <p className="font-semibold text-gray-800">{t('no_people')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('no_people_hint')}</p>
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

      {/* List */}
      {!loading && shown.length > 0 && (
        <ul className="space-y-2">
          {shown.map((p) => {
            const overdue =
              openReferrals.has(p.id) || redLastVisit.has(p.id);
            const borderColour = overdue
              ? 'border-l-danger'
              : p.category === 'pregnant' || p.category === 'newborn'
                ? 'border-l-watch'
                : 'border-l-safe';

            return (
              <li key={p.id}>
                <Link
                  to={`/person/${p.id}`}
                  className={`block bg-white rounded-2xl p-4 shadow-sm
                              border-l-4 ${borderColour}
                              active:scale-[0.99] transition-transform`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {subtitleFor(p)}
                      </p>
                    </div>
                    {overdue && (
                      <span className="shrink-0 text-[10px] font-bold
                                       bg-danger/10 text-danger px-2 py-1 rounded-full">
                        🚨 OVERDUE
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}