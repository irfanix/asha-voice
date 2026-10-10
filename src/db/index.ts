// ------------------------------------------------------------------
// IndexedDB layer. Everything the ASHA records lives on the device.
// Uses `idb` (a thin, promise-based wrapper around IndexedDB).
//
// Stores:
//   households, persons, visits, referrals, immunisations,
//   queue (offline AI tasks), settings (single row with key 'app')
// ------------------------------------------------------------------

import { openDB, type IDBPDatabase } from 'idb';
import type { Extraction } from '../ai/schemas';

// -------------------- Types --------------------
export type Household = {
  id: string;
  village: string;
  head_name: string;
  phone?: string;
  created_at: number;
};

export type Person = {
  id: string;
  household_id: string;
  name: string;
  sex: 'F' | 'M' | 'O';
  dob?: string; // ISO yyyy-mm-dd
  category: 'pregnant' | 'mother' | 'newborn' | 'child' | 'other';
  lmp?: string; // ISO
  edd?: string; // ISO
  delivery_date?: string; // ISO
  birth_weight_g?: number;
  phone?: string;
};

export type Visit = {
  id: string;
  person_id: string;
  type: string;
  date: string; // ISO yyyy-mm-dd
  transcript: string;
  extraction: Extraction;
  alert_level: 'red' | 'amber' | 'green';
  triggers: any[];
  confirmed_by_asha: boolean;
  created_offline: boolean;
};

export type Referral = {
  id: string;
  person_id: string;
  visit_id: string;
  facility: string;
  reason: string;
  status: 'Pending' | 'Reached facility' | 'Treated' | 'Lost';
  history: { at: number; status: string }[];
};

export type Immunisation = {
  id: string;
  person_id: string;
  vaccine: string;
  due_date: string;
  given_date?: string;
};

export type QueueItem = {
  id: string;
  kind: 'extract' | 'message';
  payload: any;
  created_at: number;
};

export type Settings = {
  language: 'en' | 'hi' | 'te';
  asha_name: string;
  village: string;
  demo_mode: boolean;
  voice_rate: number;
};

// Names of all object stores (used by backup/wipe screens).
export const STORES = [
  'households',
  'persons',
  'visits',
  'referrals',
  'immunisations',
  'queue',
  'settings',
] as const;

// -------------------- DB handle --------------------
let dbPromise: Promise<IDBPDatabase> | null = null;

export function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('asha-voice', 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('households'))
          d.createObjectStore('households', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('persons'))
          d.createObjectStore('persons', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('visits'))
          d.createObjectStore('visits', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('referrals'))
          d.createObjectStore('referrals', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('immunisations'))
          d.createObjectStore('immunisations', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('queue'))
          d.createObjectStore('queue', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('settings'))
          d.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

// -------------------- Helpers --------------------
export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function put(store: string, value: any): Promise<any> {
  const d = await db();
  return d.put(store as any, value);
}

export async function get<T = any>(store: string, key: string): Promise<T | undefined> {
  const d = await db();
  return d.get(store as any, key);
}

export async function all<T = any>(store: string): Promise<T[]> {
  const d = await db();
  return d.getAll(store as any);
}

export async function remove(store: string, key: string): Promise<void> {
  const d = await db();
  await d.delete(store as any, key);
}

export async function clearStore(store: string): Promise<void> {
  const d = await db();
  await d.clear(store as any);
}

// -------------------- Settings helpers --------------------
export async function saveSettings(s: Settings): Promise<void> {
  const d = await db();
  await d.put('settings', { key: 'app', ...s });
}

export async function getSettings(): Promise<Settings | null> {
  const d = await db();
  const row = await d.get('settings', 'app');
  if (!row) return null;
  const { key, ...rest } = row as any;
  return rest as Settings;
}

// -------------------- Query helpers used by screens --------------------
export async function getVisitsForPerson(person_id: string): Promise<Visit[]> {
  const visits = await all<Visit>('visits');
  return visits
    .filter((v) => v.person_id === person_id)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getLatestVisit(person_id: string): Promise<Visit | undefined> {
  const visits = await getVisitsForPerson(person_id);
  return visits[0];
}

export async function getReferralsForPerson(person_id: string): Promise<Referral[]> {
  const refs = await all<Referral>('referrals');
  return refs.filter((r) => r.person_id === person_id);
}

export async function getOpenReferral(person_id: string): Promise<Referral | undefined> {
  const refs = await getReferralsForPerson(person_id);
  return refs.find((r) => r.status === 'Pending');
}

export async function getQueue(): Promise<QueueItem[]> {
  return all<QueueItem>('queue');
}

export async function queueSize(): Promise<number> {
  const d = await db();
  return d.count('queue' as any);
}