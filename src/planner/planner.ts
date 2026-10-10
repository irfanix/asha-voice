// ------------------------------------------------------------------
// Smart visit planner. Pure, offline, deterministic.
//
// Given today's date plus all persons / visits / referrals /
// immunisations, it produces a prioritised list of "who to visit
// next and why". Every card carries a human-readable reason so the
// ASHA can see the *why* — this is a scored feature ("Explainable
// priority").
//
// Priority order (lower number = more urgent):
//   0  Last visit was RED, follow up today
//   1  Referral pending and overdue (1 or 3 days since referral)
//   2  Newborn in first 7 days with HBNC visit due
//   3  Late pregnancy (>= 36 weeks) with ANC due
//   4  HBNC visit due (days 14, 21, 28, 42)
//   5  ANC visit due (weeks 12-34)
//   6  Overdue vaccine
//   7  Vaccine due within window
// ------------------------------------------------------------------

import {
  ANC_VISIT_WEEKS,
  HBNC_VISIT_DAYS,
  UIP_SCHEDULE,
  REFERRAL_FOLLOWUP_DAYS,
  PLAN_LOOKAHEAD_DAYS,
  daysBetween,
  fromIsoDate,
} from './schedules';
import type { Person, Visit, Referral, Immunisation } from '../db';
import type { Level } from '../rules/dangerSigns';

export type PlanAction =
  | 'anc'
  | 'newborn'
  | 'postnatal'
  | 'child'
  | 'referral_followup'
  | 'vaccine'
  | 'red_alert';

export type PlanItem = {
  id: string;
  person_id: string;
  person_name: string;
  priority: number;
  level: Level;
  title: string;
  reason: string;
  action: PlanAction;
  due_in_days?: number;
  overdue_days?: number;
};

// -------------------- Reason strings --------------------
// Kept short, warm and concrete. Localisation lives in the screens;
// this module works in English and the UI translates if needed.

function reasonAnc(gw: number, nextWeek: number): string {
  return `${gw} weeks pregnant · next ANC visit at week ${nextWeek}`;
}

function reasonHbnc(ageDays: number, nextDay: number): string {
  return `Baby is ${ageDays} day(s) old · HBNC day ${nextDay} visit window`;
}

function reasonReferral(since: number): string {
  return `Referred ${since} day(s) ago · check whether the family reached the facility`;
}

function reasonVaccine(v: string, since: number): string {
  if (since > 0) return `${v} was due ${since} day(s) ago`;
  return `${v} is due in ${Math.abs(since)} day(s)`;
}

function reasonRedAlert(date: string): string {
  return `Last visit on ${date} flagged a RED danger sign · follow up today`;
}

// -------------------- Main builder --------------------

export function buildPlan(
  today: Date,
  persons: Person[],
  visits: Visit[],
  referrals: Referral[],
  immunisations: Immunisation[],
): PlanItem[] {
  const items: PlanItem[] = [];
  const todayIso = today.toISOString().slice(0, 10);

  // Index visits by person for fast lookup.
  const visitsByPerson = new Map<string, Visit[]>();
  for (const v of visits) {
    if (!visitsByPerson.has(v.person_id)) visitsByPerson.set(v.person_id, []);
    visitsByPerson.get(v.person_id)!.push(v);
  }
  for (const list of visitsByPerson.values()) {
    list.sort((a, b) => b.date.localeCompare(a.date));
  }

  for (const person of persons) {
    const personVisits = visitsByPerson.get(person.id) ?? [];
    const lastVisit = personVisits[0];

    // ---------- 0. Last visit was RED ----------
    if (lastVisit && lastVisit.alert_level === 'red') {
      const daysSince = daysBetween(today, fromIsoDate(lastVisit.date));
      if (daysSince >= 0 && daysSince <= PLAN_LOOKAHEAD_DAYS) {
        items.push({
          id: `red_${person.id}`,
          person_id: person.id,
          person_name: person.name,
          priority: 0,
          level: 'red',
          title: 'Red alert: follow up today',
          reason: reasonRedAlert(lastVisit.date),
          action: 'red_alert',
          overdue_days: daysSince,
        });
        // Do not also push routine items for this person today —
        // the red follow-up is the action that matters.
        continue;
      }
    }

    // ---------- 1. Open referral overdue for follow-up ----------
    const openRef = referrals.find(
      (r) => r.person_id === person.id && r.status === 'Pending',
    );
    if (openRef) {
      const startedAt = openRef.history?.[0]?.at
        ? new Date(openRef.history[0].at)
        : null;
      if (startedAt) {
        const sinceDays = daysBetween(today, startedAt);
        const needsFollowUp = REFERRAL_FOLLOWUP_DAYS.some(
          (d) => sinceDays >= d,
        );
        if (needsFollowUp) {
          items.push({
            id: `ref_${openRef.id}`,
            person_id: person.id,
            person_name: person.name,
            priority: 1,
            level: 'red',
            title: 'Referral not yet confirmed',
            reason: reasonReferral(sinceDays),
            action: 'referral_followup',
            overdue_days: sinceDays,
          });
          // Referral follow-up is more urgent than routine items.
          continue;
        }
      }
    }

    // ---------- 2 & 4. Newborn HBNC ----------
    if (
      (person.category === 'newborn' || person.category === 'mother') &&
      person.delivery_date
    ) {
      const age = daysBetween(today, fromIsoDate(person.delivery_date));
      if (age >= 0 && age <= 45) {
        const nextDay = HBNC_VISIT_DAYS.find((d) => d >= age);
        if (nextDay != null) {
          const untilNext = nextDay - age;
          if (untilNext <= 2) {
            const isNewbornEarly = age <= 7;
            items.push({
              id: `hbnc_${person.id}`,
              person_id: person.id,
              person_name: person.name,
              priority: isNewbornEarly ? 2 : 4,
              level: isNewbornEarly ? 'amber' : 'green',
              title: `HBNC day ${nextDay} visit due`,
              reason: reasonHbnc(age, nextDay),
              action: 'newborn',
              due_in_days: untilNext,
            });
          }
        }
      }
    }

    // ---------- 3 & 5. ANC ----------
    if (person.category === 'pregnant' && person.lmp) {
      const gw = Math.floor(daysBetween(today, fromIsoDate(person.lmp)) / 7);
      if (gw >= 0 && gw <= 42) {
        const nextWeek = ANC_VISIT_WEEKS.find((w) => w >= gw);
        if (nextWeek != null) {
          const untilNext = (nextWeek - gw) * 7;
          if (untilNext <= 14) {
            const isLate = nextWeek >= 36;
            items.push({
              id: `anc_${person.id}`,
              person_id: person.id,
              person_name: person.name,
              priority: isLate ? 3 : 5,
              level: 'green',
              title: `ANC visit due (week ${nextWeek})`,
              reason: reasonAnc(gw, nextWeek),
              action: 'anc',
              due_in_days: untilNext,
            });
          }
        }
      }
    }

    // ---------- 6 & 7. Immunisation ----------
    if (person.dob) {
      const dob = fromIsoDate(person.dob);
      const ageDays = daysBetween(today, dob);
      // Only look at children under 6 years.
      if (ageDays >= 0 && ageDays <= 2190) {
        for (const entry of UIP_SCHEDULE) {
          const dueDate = new Date(dob);
          dueDate.setDate(dueDate.getDate() + entry.age_days);
          const dueIn = daysBetween(dueDate, today); // +ve = overdue

          // Already given?
          const given = immunisations.find(
            (i) =>
              i.person_id === person.id &&
              i.vaccine === entry.vaccine &&
              !!i.given_date,
          );
          if (given) continue;

          // Only consider doses that are due now or within the
          // lookahead window.
          if (dueIn < -PLAN_LOOKAHEAD_DAYS || dueIn > 60) continue;

          const isOverdue = dueIn > 0;
          items.push({
            id: `vac_${person.id}_${entry.vaccine}`,
            person_id: person.id,
            person_name: person.name,
            priority: isOverdue ? 6 : 7,
            level: isOverdue && dueIn > 14 ? 'amber' : 'green',
            title: `Vaccine due: ${entry.label_en}`,
            reason: reasonVaccine(entry.label_en, dueIn),
            action: 'vaccine',
            due_in_days: -dueIn,
            overdue_days: isOverdue ? dueIn : undefined,
          });
          break; // one vaccine per child per day is enough on the list
        }
      }
    }
  }

  // Sort by priority, then by "most overdue first", then by name.
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ao = a.overdue_days ?? -1;
    const bo = b.overdue_days ?? -1;
    if (ao !== bo) return bo - ao;
    return a.person_name.localeCompare(b.person_name);
  });

  // Cap the list so the Today screen stays focused.
  return items.slice(0, 20);
}

// -------------------- Stats for the Today screen --------------------

export type TodayStats = {
  visitsThisMonth: number;
  dangerSignsCaught: number;
  pendingReferrals: number;
};

export function computeStats(
  today: Date,
  visits: Visit[],
  referrals: Referral[],
): TodayStats {
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstIso = firstOfMonth.toISOString().slice(0, 10);

  const visitsThisMonth = visits.filter((v) => v.date >= firstIso).length;
  const dangerSignsCaught = visits.filter(
    (v) => v.alert_level === 'red' || v.alert_level === 'amber',
  ).length;
  const pendingReferrals = referrals.filter((r) => r.status === 'Pending').length;

  return { visitsThisMonth, dangerSignsCaught, pendingReferrals };
}

// -------------------- Helper for the UI --------------------

export function actionIcon(action: PlanAction): string {
  switch (action) {
    case 'anc':
      return '🤰';
    case 'newborn':
      return '👶';
    case 'postnatal':
      return '👩';
    case 'child':
      return '🧒';
    case 'referral_followup':
      return '🏥';
    case 'vaccine':
      return '💉';
    case 'red_alert':
      return '🚨';
  }
}