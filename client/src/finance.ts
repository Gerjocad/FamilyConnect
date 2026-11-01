// Haushaltskasse (Server: server/src/finance.js). Beträge immer in Cent; nur für Erwachsene.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export type FinanceKind = 'income' | 'expense';
export type SplitMethod = 'income' | 'available' | 'same_rest' | 'equal';

export interface FinanceEntry {
  id: number;
  /** null = gemeinsam */
  owner_id: number | null;
  kind: FinanceKind;
  title: string;
  amount: number;
  interval_months: 1 | 3 | 6 | 12;
  category: string;
  notes: string;
  created_by: number | null;
  created_at: string;
}

export type FinanceFields = Pick<FinanceEntry, 'owner_id' | 'kind' | 'title' | 'amount' | 'interval_months' | 'category' | 'notes'>;

export interface FinanceSettings {
  method: SplitMethod;
  member_ids: number[];
  round_to: number;
  buffer_percent: number;
  participants: number[];
}

export interface SplitResult {
  method: SplitMethod;
  need: number;
  total: number;
  balance: number;
  people: { member_id: number; income: number; expenses: number; transfer: number; share: number; remaining: number }[];
}

export interface FinanceOverview {
  entries: FinanceEntry[];
  settings: FinanceSettings;
  shared: { income: number; expenses: number };
  results: Record<SplitMethod, SplitResult>;
}

export const METHODS: { method: SplitMethod; label: string; explain: string }[] = [
  { method: 'income', label: 'Nach Einkommen', explain: 'Wer mehr verdient, zahlt im gleichen Verhältnis mehr ein.' },
  { method: 'available', label: 'Nach Verfügbarem', explain: 'Aufgeteilt nach dem, was nach den eigenen Ausgaben übrig bleibt.' },
  { method: 'same_rest', label: 'Gleicher Rest', explain: 'Danach bleibt allen gleich viel Geld zum Leben übrig.' },
  { method: 'equal', label: 'Halbe-halbe', explain: 'Alle zahlen den gleichen Betrag ein.' },
];

export const INTERVALS: { months: FinanceEntry['interval_months']; label: string; short: string }[] = [
  { months: 1, label: 'monatlich', short: 'mtl.' },
  { months: 3, label: 'vierteljährlich', short: 'vj.' },
  { months: 6, label: 'halbjährlich', short: 'hj.' },
  { months: 12, label: 'jährlich', short: 'jährl.' },
];

export const CATEGORY_SUGGESTIONS = [
  'Wohnen', 'Nebenkosten', 'Lebensmittel', 'Versicherung', 'Auto', 'Mobilität', 'Kinder', 'Kita/Schule',
  'Handy & Internet', 'Abos', 'Freizeit', 'Sparen', 'Gehalt', 'Kindergeld', 'Sonstiges',
];

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const euroRound = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** 123456 → „1.234,56 €“; ganze Euro ohne Nachkommastellen */
export const formatEuro = (cents: number) =>
  (Math.round(cents) % 100 === 0 ? euroRound : euro).format(Math.round(cents) / 100);

/** „1.234,56“, „1234.5“ oder „12 €“ → Cent; null, wenn es keine Zahl ist */
export function parseEuro(input: string): number | null {
  let s = input.replace(/[€\s]/g, '');
  if (!s) return null;
  // Komma als Dezimaltrenner; Punkte davor sind Tausender
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Cent → Eingabetext „1234,56“ */
export const centsToInput = (cents: number) =>
  cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');

export const monthly = (e: Pick<FinanceEntry, 'amount' | 'interval_months'>) => e.amount / e.interval_months;

export function useFinance() {
  const { family } = useFamily();
  const base = `/families/${family.id}/finance`;
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await api<FinanceOverview>(base));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'finance' && void reload());
  }, [reload]);
  const call = async (path: string, init: Parameters<typeof api>[1]) => {
    await api(base + path, init);
    await reload();
  };
  return {
    data,
    error,
    add: (body: FinanceFields) => call('/entries', { method: 'POST', body }),
    update: (id: number, body: Partial<FinanceFields>) => call(`/entries/${id}`, { method: 'PATCH', body }),
    remove: (id: number) => call(`/entries/${id}`, { method: 'DELETE' }),
    saveSettings: async (body: Partial<Omit<FinanceSettings, 'participants'>>) => {
      setData(await api<FinanceOverview>(`${base}/settings`, { method: 'PUT', body }));
    },
  };
}
