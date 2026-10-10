// ------------------------------------------------------------------
// Demo village loader. Populates IndexedDB with a FICTIONAL village
// in Andhra Pradesh so the app can be demonstrated immediately.
//
// Contents match the demo script in the video plan:
//   - ~12 households
//   - 3 pregnant women (one with pre-eclampsia symptoms)
//   - 2 newborns (one flagged as day-7 danger sign)
//   - 4 children with vaccines due
//   - 1 overdue referral (so the planner shows a red follow-up card)
//
// NO real patient data is used anywhere. All names and numbers are
// invented.
// ------------------------------------------------------------------

import { put, uid, type Household, type Person, type Visit, type Referral } from '../db';

const VILLAGE = 'Rampur (demo)';

// Fixed IDs so the demo loader can safely run twice without
// duplicating the "danger" newborn in the plan.
export const DEMO_HOUSEHOLD_IDS = Array.from({ length: 12 }, (_, i) => `H${i + 1}`);

type SeedPerson = {
  seedId: string;
  hh: string;
  name: string;
  category: 'pregnant' | 'mother' | 'newborn' | 'child' | 'other';
  weeksPregnant?: number; // for pregnant
  ageDays?: number; // for newborn
  ageMonths?: number; // for child / mother
  birthWeightG?: number;
  ageYears?: number; // for adults: gives a date of birth
  phone?: string; // fictional numbers only
  address?: string;
  gpa?: [number, number, number]; // gravida, para, abortus
};

const SEED_PERSONS: SeedPerson[] = [
  // ---------- Pregnant ----------
  // Lakshmi has pre-eclampsia symptoms -> planner shows her first,
  // and the demo transcript produces a RED alert on her visit.
  { seedId: 'P_lakshmi', hh: 'H1', name: 'Lakshmi Devi', category: 'pregnant', weeksPregnant: 32, ageYears: 24,
    phone: '9000000101', address: 'House 1-24, Ward 1, near Hanuman temple, Rampur', gpa: [2, 1, 0] },
  { seedId: 'P_sita', hh: 'H2', name: 'Sita Kumari', category: 'pregnant', weeksPregnant: 24, ageYears: 21,
    phone: '9000000102', address: 'House 2-07, Ward 2, school road, Rampur', gpa: [1, 0, 0] },
  { seedId: 'P_anitha', hh: 'H3', name: 'Anitha', category: 'pregnant', weeksPregnant: 12, ageYears: 29,
    phone: '9000000103', address: 'House 3-15, Ward 2, beside water tank, Rampur', gpa: [3, 1, 1] },

  // ---------- Newborns ----------
  // Baby of Lakshmi is exactly 7 days old -> HBNC day 7 due today.
  { seedId: 'N_lakshmi', hh: 'H1', name: 'Baby of Lakshmi', category: 'newborn', ageDays: 7, birthWeightG: 2900,
    phone: '9000000101', address: 'House 1-24, Ward 1, near Hanuman temple, Rampur' },
  { seedId: 'N_sita', hh: 'H2', name: 'Baby of Sita', category: 'newborn', ageDays: 20, birthWeightG: 2600,
    phone: '9000000102', address: 'House 2-07, Ward 2, school road, Rampur' },

  // ---------- Children ----------
  { seedId: 'C_ravi', hh: 'H4', name: 'Ravi', category: 'child', ageMonths: 9,
    phone: '9000000104', address: 'House 4-03, Ward 3, market street, Rampur' },
  { seedId: 'C_priya', hh: 'H4', name: 'Priya', category: 'child', ageMonths: 18,
    phone: '9000000104', address: 'House 4-03, Ward 3, market street, Rampur' },
  { seedId: 'C_kiran', hh: 'H5', name: 'Kiran', category: 'child', ageMonths: 30,
    phone: '9000000105', address: 'House 5-11, Ward 3, panchayat office lane, Rampur' },
  { seedId: 'C_manoj', hh: 'H5', name: 'Manoj', category: 'child', ageMonths: 48,
    phone: '9000000105', address: 'House 5-11, Ward 3, panchayat office lane, Rampur' },

  // ---------- Postnatal mother + other adults ----------
  { seedId: 'M_padma', hh: 'H6', name: 'Padma', category: 'mother', ageMonths: 3, ageYears: 26,
    phone: '9000000106', address: 'House 6-02, Ward 4, canal road, Rampur', gpa: [2, 2, 0] },
  { seedId: 'O_raju', hh: 'H6', name: 'Raju', category: 'other', ageYears: 40,
    phone: '9000000107', address: 'House 6-02, Ward 4, canal road, Rampur' },
  { seedId: 'O_saroja', hh: 'H7', name: 'Saroja', category: 'other', ageYears: 60,
    phone: '9000000108', address: 'House 7-19, Ward 4, near ration shop, Rampur' },
];

// Convert "weeks ago" / "days ago" / "months ago" to ISO yyyy-mm-dd.
function isoOffset({ days = 0, weeks = 0, months = 0 }: { days?: number; weeks?: number; months?: number }) {
  const d = new Date();
  d.setDate(d.getDate() - (days + weeks * 7 + months * 30));
  return d.toISOString().slice(0, 10);
}

function buildPerson(seed: SeedPerson): Person {
  const id = `demo_${seed.seedId}`;
  const base: Person = {
    id,
    household_id: seed.hh,
    name: seed.name,
    sex: ['Raju', 'Ravi', 'Kiran', 'Manoj'].includes(seed.name) ? 'M' : 'F',
    category: seed.category,
    phone: seed.phone,
    address: seed.address,
  };

  // Adults: date of birth from age in years (fictional).
  if (seed.ageYears != null) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - seed.ageYears);
    d.setMonth(2, 15);
    base.dob = d.toISOString().slice(0, 10);
  }

  // Obstetric history G P A for pregnant women and mothers.
  if (seed.gpa) {
    [base.gravida, base.para, base.abortus] = seed.gpa;
  }

  if (seed.category === 'pregnant' && seed.weeksPregnant != null) {
    const lmpDate = new Date();
    lmpDate.setDate(lmpDate.getDate() - seed.weeksPregnant * 7);
    const eddDate = new Date(lmpDate);
    eddDate.setDate(eddDate.getDate() + 280);
    base.lmp = lmpDate.toISOString().slice(0, 10);
    base.edd = eddDate.toISOString().slice(0, 10);
  }

  if (seed.category === 'newborn' && seed.ageDays != null) {
    base.dob = isoOffset({ days: seed.ageDays });
    base.delivery_date = base.dob;
    base.birth_weight_g = seed.birthWeightG;
  }

  if (seed.category === 'mother' && seed.ageMonths != null) {
    // Padma delivered ~3 months ago; she is a postnatal mother.
    base.delivery_date = isoOffset({ months: seed.ageMonths });
  }

  if (seed.category === 'child' && seed.ageMonths != null) {
    base.dob = isoOffset({ months: seed.ageMonths });
  }

  return base;
}

export async function loadDemoVillage(): Promise<void> {
  // 1) Households
  for (let i = 0; i < DEMO_HOUSEHOLD_IDS.length; i++) {
    const hh: Household = {
      id: DEMO_HOUSEHOLD_IDS[i],
      village: VILLAGE,
      head_name: `Head ${i + 1}`,
      created_at: Date.now(),
    };
    await put('households', hh);
  }

  // 2) Persons
  const persons: Person[] = SEED_PERSONS.map(buildPerson);
  for (const p of persons) await put('persons', p);

  // 3) One historical visit for Lakshmi so the "danger sign caught"
  //    stat on the home screen isn't zero on first load.
  const lakshmi = persons.find((p) => p.id === 'demo_P_lakshmi')!;
  const historical: Visit = {
    id: `demo_visit_${uid()}`,
    person_id: lakshmi.id,
    type: 'anc',
    date: isoOffset({ days: 5 }),
    transcript: 'ముఖం కొద్దిగా వాచింది, బీపీ 138/86.',
    extraction: {
      visit_type: 'anc',
      vitals: { bp_systolic: 138, bp_diastolic: 86 },
      symptoms: ['swelling_face_hands'],
      other_symptoms: [],
      observations: {},
      services: {},
      missing_checks: [],
      confidence: { bp: 0.9 },
      summary_en: '30 weeks pregnant, mild facial swelling, BP 138/86.',
    },
    alert_level: 'amber',
    triggers: [
      {
        id: 'anc_swelling_only',
        level: 'amber',
        label: {
          en: 'Swelling of face or hands',
          hi: 'चेहरे या हाथों में सूजन',
          te: 'ముఖం లేదా చేతుల్లో వాపు',
        },
        reason: {
          en: 'Watch for pre-eclampsia. Recheck BP in 1-3 days.',
          hi: 'प्री-एक्लेम्पसिया के लिए निगरानी रखें।',
          te: 'ప్రీ-ఎక్లంప్సియా కోసం గమనించండి.',
        },
        source: 'MoHFW MCP Card',
      },
    ],
    confirmed_by_asha: true,
    created_offline: false,
  };
  await put('visits', historical);

  // 4) One overdue referral so the planner shows a red follow-up card.
  const sita = persons.find((p) => p.id === 'demo_P_sita')!;
  const overdueRef: Referral = {
    id: `demo_ref_${uid()}`,
    person_id: sita.id,
    visit_id: historical.id,
    facility: 'PHC Rampur',
    reason: 'Referred for high BP 3 days ago, not yet confirmed at facility.',
    status: 'Pending',
    history: [{ at: Date.now() - 3 * 86400000, status: 'Pending' }],
  };
  await put('referrals', overdueRef);

  // 5) Immunisation records so the planner has something to compare
  //    against UIP schedule (no given_date => due).
  const ravi = persons.find((p) => p.id === 'demo_C_ravi')!;
  const priya = persons.find((p) => p.id === 'demo_C_priya')!;

  await put('immunisations', {
    id: `demo_imm_${uid()}`,
    person_id: ravi.id,
    vaccine: 'Measles-1 + PCV-Booster + Vit-A(1)',
    due_date: isoOffset({ days: -2 }), // overdue by 2 days
  });
  await put('immunisations', {
    id: `demo_imm_${uid()}`,
    person_id: priya.id,
    vaccine: 'DPT-Booster-1 + Measles-2 + Vit-A(2)',
    due_date: isoOffset({ days: 5 }), // upcoming
  });
}

// Optional: quick check used by the Settings screen.
export async function isDemoLoaded(): Promise<boolean> {
  const persons = await import('../db').then((m) => m.all<Person>('persons'));
  return persons.some((p) => p.id.startsWith('demo_'));
}