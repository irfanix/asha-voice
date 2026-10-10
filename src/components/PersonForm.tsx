// ------------------------------------------------------------------
// PersonForm
//
// One form used to register a new person and to edit an existing one.
// Fields: name, type, date of birth, phone, address. For pregnant
// women it also asks for LMP (EDD is calculated as LMP + 280 days)
// and obstetric history G P A. For mothers it asks for delivery date.
//
// Everything is saved only in IndexedDB on this phone. None of these
// fields are sent to the AI (only the redacted visit transcript is).
// ------------------------------------------------------------------

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uid, type Person } from '../db';

const CATEGORIES: Person['category'][] = ['pregnant', 'mother', 'newborn', 'child', 'other'];

export function eddFromLmp(lmp: string): string {
  const d = new Date(lmp + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + 280);
  return d.toISOString().slice(0, 10);
}

export function ageInYears(dob?: string): number | null {
  if (!dob) return null;
  const d = new Date(dob + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function gpaText(p: Person): string {
  if (p.gravida == null && p.para == null && p.abortus == null) return '';
  return `G${p.gravida ?? '-'} P${p.para ?? '-'} A${p.abortus ?? '-'}`;
}

const toNum = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Math.max(0, Math.min(20, Math.floor(Number(v))));
  return Number.isFinite(n) ? n : undefined;
};

type Props = {
  initial?: Person;
  defaultCategory?: Person['category'];
  onSave: (p: Person) => void | Promise<void>;
  onCancel: () => void;
};

export default function PersonForm({ initial, defaultCategory, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<Person['category']>(
    initial?.category ?? defaultCategory ?? 'pregnant',
  );
  const [dob, setDob] = useState(initial?.dob ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [lmp, setLmp] = useState(initial?.lmp ?? '');
  const [deliveryDate, setDeliveryDate] = useState(initial?.delivery_date ?? '');
  const [g, setG] = useState(initial?.gravida != null ? String(initial.gravida) : '');
  const [p, setP] = useState(initial?.para != null ? String(initial.para) : '');
  const [a, setA] = useState(initial?.abortus != null ? String(initial.abortus) : '');
  const [error, setError] = useState<string | null>(null);

  const edd = lmp ? eddFromLmp(lmp) : '';
  const today = new Date().toISOString().slice(0, 10);

  const submit = async () => {
    if (!name.trim()) {
      setError(t('pf_required'));
      return;
    }
    const id = initial?.id ?? uid();
    const person: Person = {
      ...(initial ?? {}),
      id,
      household_id: initial?.household_id ?? 'H_' + id.slice(0, 6),
      name: name.trim(),
      sex: category === 'pregnant' || category === 'mother' ? 'F' : initial?.sex ?? 'F',
      category,
      dob: dob || undefined,
      phone: phone.replace(/[^\d+]/g, '') || undefined,
      address: address.trim() || undefined,
      lmp: category === 'pregnant' ? lmp || undefined : initial?.lmp,
      edd: category === 'pregnant' ? edd || undefined : initial?.edd,
      delivery_date:
        category === 'mother' || category === 'newborn'
          ? deliveryDate || (category === 'newborn' ? dob : '') || undefined
          : initial?.delivery_date,
      gravida: category === 'pregnant' || category === 'mother' ? toNum(g) : initial?.gravida,
      para: category === 'pregnant' || category === 'mother' ? toNum(p) : initial?.para,
      abortus: category === 'pregnant' || category === 'mother' ? toNum(a) : initial?.abortus,
    };
    await onSave(person);
  };

  const input =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-primary focus:outline-none';
  const label = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
      <p className="font-semibold text-gray-900 text-sm">
        {initial ? t('pf_title_edit') : t('pf_title_new')}
      </p>

      <label className="block">
        <span className={label}>{t('pf_name')} *</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          autoFocus
          className={input}
        />
      </label>

      <label className="block">
        <span className={label}>{t('pf_category')}</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Person['category'])}
          className={input}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t('cat_' + c)}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={label}>{t('pf_dob')}</span>
          <input type="date" value={dob} max={today} onChange={(e) => setDob(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>{t('pf_phone')}</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98XXXXXXXX"
            className={input}
          />
        </label>
      </div>

      <label className="block">
        <span className={label}>{t('pf_address')}</span>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={input} />
      </label>

      {category === 'pregnant' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={label}>{t('pf_lmp')}</span>
            <input type="date" value={lmp} max={today} onChange={(e) => setLmp(e.target.value)} className={input} />
          </label>
          <div>
            <span className={label}>{t('pf_edd')}</span>
            <p className="px-3 py-2 text-sm rounded-lg bg-white border border-dashed border-gray-300 text-gray-700 min-h-[38px]">
              {edd || '—'}
            </p>
          </div>
        </div>
      )}

      {(category === 'mother' || category === 'newborn') && (
        <label className="block">
          <span className={label}>{t('pf_delivery')}</span>
          <input
            type="date"
            value={deliveryDate}
            max={today}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className={input}
          />
        </label>
      )}

      {(category === 'pregnant' || category === 'mother') && (
        <fieldset>
          <legend className={label}>{t('pf_gpa')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {[
              [t('pf_gravida'), g, setG],
              [t('pf_para'), p, setP],
              [t('pf_abortus'), a, setA],
            ].map(([lbl, val, set], i) => (
              <label key={i} className="block">
                <span className="block text-[11px] text-gray-500 mb-1">{lbl as string}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={20}
                  value={val as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  className={input}
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm">
          {t('common_cancel')}
        </button>
        <button type="button" onClick={submit} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold">
          {t('common_save')}
        </button>
      </div>
    </div>
  );
}
