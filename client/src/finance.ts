// Finanzen (Server: server/src/finance.js – gleiche Umrechnung)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

export type FinanceKind = 'income' | 'expense' | 'adjustment';
export type FinanceInterval = 'monthly' | 'quarterly' | 'yearly' | 'once';
export type FinanceMode = 'income' | 'remaining' | 'custom';

export interface FinanceEntry {
  id: number;
  /** null = gemeinsames Konto */
  owner_id: number | null;
  kind: FinanceKind;
  title: string;
  /** Cent; Zu-/Abschläge auch negativ */
  amount: number;
  interval: FinanceInterval;
  /** nur bei einmaligen Zahlungen: in diesem Monat (JJJJ-MM) */
  month: string | null;
  category: string;
  /** nur für mich sichtbar */
  private: boolean;
  created_by: number | null;
}

export interface FinanceSummary {
  /** berechneter Monat (JJJJ-MM) */
  month: string;
  shared_expenses: number;
  shared_income: number;
  /** was monatlich aufs gemeinsame Konto muss */
  needed: number;
  people: { user_id: number; income: number; expenses: number; adjustments: number; share: number; part: number; transfer: number; left: number }[];
}

export interface FinanceState {
  people: { id: number; name: string }[];
  settings: { mode: FinanceMode; shares: Record<string, number> };
  entries: FinanceEntry[];
  summary: FinanceSummary;
}

export const INTERVAL_LABELS: Record<FinanceInterval, string> = { monthly: 'monatlich', quarterly: 'vierteljährlich', yearly: 'jährlich', once: 'einmalig' };
const MONTHS: Record<Exclude<FinanceInterval, 'once'>, number> = { monthly: 1, quarterly: 3, yearly: 12 };
/** Betrag im Monat `month` (JJJJ-MM): einmalige Zahlungen voll in ihrem Monat, sonst umgerechnet */
export const perMonth = (e: Pick<FinanceEntry, 'amount' | 'interval' | 'month'>, month: string) =>
  e.interval === 'once' ? (e.month === month ? e.amount : 0) : Math.round(e.amount / MONTHS[e.interval]);

export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** „2026-11“ → „November 2026“ */
export const monthName = (month: string) =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
export const shiftMonth = (month: string, by: number) => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const euroFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
/** 123456 → „1.234,56 €“ */
export const euro = (cents: number) => euroFmt.format(cents / 100);

/** „1.234,5“, „12.50“, „-20“ → Cent; null, wenn es keine Zahl ist */
export function parseEuro(text: string): number | null {
  let t = text.replace(/[€\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Finanzen, berechnet für den Monat `month` (JJJJ-MM) */
export function useFinance(month: string) {
  const { family } = useFamily();
  const base = `/families/${family.id}/finance`;
  const [state, setState] = useState<FinanceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setState(await api<FinanceState>(`${base}?month=${month}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [base, month]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => resource === 'finance' && void reload());
  }, [reload]);
  const save = async (data: Partial<FinanceEntry>, id?: number) => {
    await api(id ? `${base}/entries/${id}` : `${base}/entries`, { method: id ? 'PATCH' : 'POST', body: data });
    await reload();
  };
  const remove = async (id: number) => {
    await api(`${base}/entries/${id}`, { method: 'DELETE' });
    await reload();
  };
  const setSettings = async (settings: FinanceState['settings']) => {
    await api(`${base}/settings`, { method: 'PUT', body: settings });
    await reload();
  };
  return { state, error, save, remove, setSettings };
}
