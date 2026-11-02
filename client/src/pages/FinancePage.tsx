import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import {
  INTERVAL_LABELS, euro, monthName, parseEuro, perMonth, shiftMonth, thisMonth, useFinance,
  type FinanceEntry, type FinanceInterval, type FinanceKind, type FinanceMode, type FinanceState,
} from '../finance';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';

const MODE_LABELS: Record<FinanceMode, string> = { income: 'Nach Einkommen', remaining: 'Nach Rest', custom: 'Eigene %' };
const MODE_HINTS: Record<FinanceMode, string> = {
  income: 'Jeder zahlt im Verhältnis seines Einkommens.',
  remaining: 'Im Verhältnis zu dem, was nach den eigenen Ausgaben übrig bleibt.',
  custom: 'Feste Prozente – passen sie nicht auf 100 %, wird anteilig gerechnet.',
};
const KIND_TITLES: Record<FinanceKind, string> = { income: 'Einnahme', expense: 'Ausgabe', adjustment: 'Manueller Betrag' };
const SUGGESTIONS: Record<string, string[]> = {
  shared_expense: ['Miete', 'Nebenkosten', 'Strom', 'Internet & Handy', 'Lebensmittel', 'Versicherungen', 'Auto', 'Kita / Schule', 'Rundfunkbeitrag', 'Streaming', 'Sparen'],
  shared_income: ['Kindergeld', 'Elterngeld', 'Mieteinnahmen'],
  income: ['Gehalt', 'Nebenjob', 'Elterngeld'],
  expense: ['Handy', 'Fitnessstudio', 'Kredit', 'Auto', 'Hobby', 'Sparen'],
  adjustment: ['Tankgeld', 'Ausgleich', 'Zahlt Miete direkt', 'Extra fürs Sparen'],
};

type Draft = { entry?: FinanceEntry; owner_id: number | null; kind: FinanceKind };

/** Finanzen: persönliche und gemeinsame Einnahmen/Ausgaben → wer überweist wie viel aufs gemeinsame Konto */
export function FinancePage() {
  const { isManager } = usePermissions();
  const [month, setMonth] = useState(thisMonth);
  const finance = useFinance(month);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (!isManager) {
    return <div className="page narrow"><header className="page-header"><h1>Finanzen</h1></header><p className="muted">Die Finanzen sehen nur Eltern und Admins.</p></div>;
  }
  const { state } = finance;
  return (
    <div className="page narrow finance-page">
      <header className="page-header"><h1>Finanzen</h1></header>
      {finance.error && <p className="error">{finance.error}</p>}
      {state && (
        <>
          <TransferCard state={state} month={month} onMonth={setMonth} onSettings={finance.setSettings} />
          <EntryGroupCard
            title="Gemeinsames Konto"
            icon="🏦"
            state={state}
            owner={null}
            groups={[
              { kind: 'expense', label: 'Ausgaben vom gemeinsamen Konto' },
              { kind: 'income', label: 'Einnahmen aufs gemeinsame Konto (z. B. Kindergeld)' },
            ]}
            month={month}
            footer={<>Muss im {monthName(month).split(' ')[0]} drauf: <strong>{euro(state.summary.needed)}</strong></>}
            onEdit={setDraft}
          />
          {state.people.map((p) => {
            const s = state.summary.people.find((x) => x.user_id === p.id);
            return (
              <EntryGroupCard
                key={p.id}
                title={p.name}
                personId={p.id}
                state={state}
                owner={p.id}
                month={month}
                groups={[
                  { kind: 'income', label: 'Einkommen (netto)' },
                  { kind: 'expense', label: 'Eigene Ausgaben' },
                  { kind: 'adjustment', label: 'Manuell aufs gemeinsame Konto (+ mehr / − weniger)' },
                ]}
                footer={s && <>Bleibt im {monthName(month).split(' ')[0]} nach Ausgaben und Überweisung: <strong className={s.left < 0 ? 'negative' : ''}>{euro(s.left)}</strong></>}
                onEdit={setDraft}
              />
            );
          })}
        </>
      )}
      {draft && state && (
        <EntryForm
          draft={draft}
          state={state}
          onClose={() => setDraft(null)}
          month={month}
          onSave={(data) => finance.save(data, draft.entry?.id)}
          onDelete={draft.entry ? () => finance.remove(draft.entry!.id) : undefined}
        />
      )}
    </div>
  );
}

function TransferCard({ state, month, onMonth, onSettings }: {
  state: FinanceState;
  month: string;
  onMonth(month: string): void;
  onSettings(s: FinanceState['settings']): Promise<unknown>;
}) {
  const { member } = useFamily();
  const { summary, settings } = state;
  const { run, error } = useAsync();
  const [shares, setShares] = useState<Record<string, string>>({});
  useEffect(() => {
    setShares(Object.fromEntries(state.people.map((p) => [p.id, String(settings.shares[p.id] ?? Math.round(100 / state.people.length))])));
  }, [state.people, settings.shares]);
  const setMode = (mode: FinanceMode) => void run(() => onSettings({
    mode,
    shares: mode === 'custom' ? Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, Number(v) || 0])) : settings.shares,
  }));
  const saveShares = () => void run(() => onSettings({ mode: 'custom', shares: Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, Number(v.replace(',', '.')) || 0])) }));
  const shareSum = Object.values(shares).reduce((a, v) => a + (Number(v.replace(',', '.')) || 0), 0);

  return (
    <section className="card transfer-card">
      <h2>Aufs gemeinsame Konto</h2>
      <div className="month-switch">
        <button type="button" className="icon-button" aria-label="Voriger Monat" onClick={() => onMonth(shiftMonth(month, -1))}><Icon name="left" size={18} /></button>
        <strong>{monthName(month)}</strong>
        <button type="button" className="icon-button" aria-label="Nächster Monat" onClick={() => onMonth(shiftMonth(month, 1))}><Icon name="right" size={18} /></button>
        {month !== thisMonth() && <button type="button" className="link-button" onClick={() => onMonth(thisMonth())}>Heute</button>}
      </div>
      <p className="muted transfer-needed">
        {euro(summary.shared_expenses)} Ausgaben{summary.shared_income > 0 && <> − {euro(summary.shared_income)} Einnahmen</>} = <strong>{euro(summary.needed)}</strong>
      </p>
      <div className="segmented">
        {(Object.keys(MODE_LABELS) as FinanceMode[]).map((m) => (
          <button key={m} type="button" className={settings.mode === m ? 'active' : ''} onClick={() => setMode(m)}>{MODE_LABELS[m]}</button>
        ))}
      </div>
      <p className="hint">{MODE_HINTS[settings.mode]}</p>
      {state.people.length === 0 && <p className="muted">Noch keine Eltern oder Admins in der Familie.</p>}
      <ul className="transfer-list">
        {summary.people.map((p) => {
          const m = member(p.user_id);
          return (
            <li key={p.user_id}>
              {m && <Avatar member={m} size={40} />}
              <div className="transfer-main">
                <strong>{m?.name.split(' ')[0]}</strong>
                <small className="muted">
                  {Math.round(p.share * 1000) / 10} % = {euro(p.part)}
                  {p.adjustments !== 0 && <> {p.adjustments > 0 ? '+' : '−'} {euro(Math.abs(p.adjustments))} manuell</>}
                </small>
                {settings.mode === 'custom' && (
                  <label className="share-input">
                    <input inputMode="decimal" value={shares[p.user_id] ?? ''} onChange={(e) => setShares({ ...shares, [p.user_id]: e.target.value })} onBlur={saveShares} aria-label={`Anteil ${m?.name}`} /> %
                  </label>
                )}
              </div>
              <span className="transfer-amount">{euro(p.transfer)}</span>
            </li>
          );
        })}
      </ul>
      {summary.people.length > 0 && (() => {
        const sum = summary.people.reduce((acc, p) => acc + p.transfer, 0);
        const diff = sum - summary.needed;
        return (
          <p className={`transfer-sum ${diff < 0 ? 'short' : ''}`}>
            Zusammen {euro(sum)}
            {diff < 0 && <> · <strong>{euro(-diff)} fehlen</strong> auf dem Konto (manuelle Abzüge)</>}
            {diff > 0 && <> · {euro(diff)} mehr als nötig – bleibt als Puffer</>}
          </p>
        );
      })()}
      {settings.mode === 'custom' && Math.abs(shareSum - 100) > 0.01 && <p className="hint">Zusammen {shareSum} % – es wird anteilig gerechnet.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function EntryGroupCard({ title, icon, personId, state, owner, month, groups, footer, onEdit }: {
  title: string;
  /** angezeigter Monat (JJJJ-MM) */
  month: string;
  icon?: string;
  personId?: number;
  state: FinanceState;
  owner: number | null;
  groups: { kind: FinanceKind; label: string }[];
  footer?: ReactNode;
  onEdit(d: Draft): void;
}) {
  const { member } = useFamily();
  const m = personId ? member(personId) : undefined;
  return (
    <section className="card finance-card">
      <header className="section-header">
        {m ? <Avatar member={m} size={28} /> : <span className="finance-icon" aria-hidden>{icon}</span>}
        <h2>{title}</h2>
      </header>
      {groups.map((g) => {
        // einmalige Zahlungen nur in ihrem Monat
        const items = state.entries.filter((e) => e.owner_id === owner && e.kind === g.kind && (e.interval !== 'once' || e.month === month));
        const total = items.reduce((a, e) => a + perMonth(e, month), 0);
        const later = state.entries.filter((e) => e.owner_id === owner && e.kind === g.kind && e.interval === 'once' && e.month! > month);
        return (
          <div key={g.kind} className="finance-group">
            <h3>
              <span>{g.label}</span>
              {items.length > 0 && <span className="finance-total">{euro(total)}</span>}
            </h3>
            <ul className="finance-list">
              {items.map((e) => (
                <li key={e.id}>
                  <button type="button" className="finance-row" onClick={() => onEdit({ entry: e, owner_id: owner, kind: g.kind })}>
                    <span className="finance-title">
                      {e.title}{e.private && <span className="badge private-badge">🔒 privat</span>}
                      {e.interval === 'once' && <small className="muted">einmalig im {monthName(e.month!)}</small>}
                      {e.interval !== 'monthly' && e.interval !== 'once' && <small className="muted">{euro(e.amount)} {INTERVAL_LABELS[e.interval]}</small>}
                    </span>
                    <span className={`finance-amount ${e.amount < 0 ? 'negative' : ''}`}>{euro(perMonth(e, month))}</span>
                  </button>
                </li>
              ))}
            </ul>
            {later.length > 0 && (
              <p className="hint finance-later">
                Später einmalig: {later.sort((a, b) => a.month!.localeCompare(b.month!)).map((e) => `${e.title} (${monthName(e.month!)}, ${euro(e.amount)})`).join(' · ')}
              </p>
            )}
            <button type="button" className="link-button" onClick={() => onEdit({ owner_id: owner, kind: g.kind })}>
              <Icon name="plus" size={14} /> {KIND_TITLES[g.kind]}
            </button>
          </div>
        );
      })}
      {footer && <p className="finance-footer">{footer}</p>}
    </section>
  );
}

function EntryForm({ draft, state, month: shownMonth, onSave, onDelete, onClose }: {
  draft: Draft;
  state: FinanceState;
  /** gerade angezeigter Monat – Vorschlag für einmalige Zahlungen */
  month: string;
  onSave(data: Partial<FinanceEntry>): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const { user } = useFamily();
  const { entry, owner_id: owner, kind } = draft;
  const [title, setTitle] = useState(entry?.title ?? '');
  const [amount, setAmount] = useState(entry ? (Math.abs(entry.amount) / 100).toFixed(2).replace('.', ',') : '');
  const [minus, setMinus] = useState(Boolean(entry && entry.amount < 0));
  const [interval, setFrequency] = useState<FinanceInterval>(entry?.interval ?? 'monthly');
  const [payMonth, setPayMonth] = useState(entry?.month ?? shownMonth);
  const [priv, setPriv] = useState(entry?.private ?? false);
  const { busy, error, run } = useAsync();
  const cents = parseEuro(amount);
  const whose = owner === null ? 'gemeinsames Konto' : state.people.find((p) => p.id === owner)?.name.split(' ')[0];
  const suggestions = SUGGESTIONS[owner === null ? `shared_${kind}` : kind] ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (cents === null) return;
    void run(async () => {
      await onSave({ owner_id: owner, kind, title, amount: (minus ? -1 : 1) * Math.abs(cents), interval, month: interval === 'once' ? payMonth : null, private: priv });
      onClose();
    });
  };

  return (
    <Modal title={`${KIND_TITLES[kind]} · ${whose}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Bezeichnung
          <input value={title} onChange={(e) => setTitle(e.target.value)} list="finance-suggestions" required maxLength={100} autoFocus={!entry} />
          <datalist id="finance-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        {kind === 'adjustment' && (
          <div className="segmented">
            <button type="button" className={!minus ? 'active' : ''} onClick={() => setMinus(false)}>+ zahlt mehr</button>
            <button type="button" className={minus ? 'active' : ''} onClick={() => setMinus(true)}>− zahlt weniger</button>
          </div>
        )}
        <div className="row">
          <label>
            Betrag in €
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" required />
          </label>
          <label>
            Wie oft
            <select value={interval} onChange={(e) => setFrequency(e.target.value as FinanceInterval)}>
              {(Object.keys(INTERVAL_LABELS) as FinanceInterval[]).map((i) => <option key={i} value={i}>{INTERVAL_LABELS[i]}</option>)}
            </select>
          </label>
        </div>
        {amount && cents === null && <p className="error">Bitte einen Betrag wie 12,50 eingeben</p>}
        {interval === 'once' && (
          <label>
            In welchem Monat?
            <input type="month" value={payMonth} onChange={(e) => e.target.value && setPayMonth(e.target.value)} required />
          </label>
        )}
        {cents !== null && (interval === 'quarterly' || interval === 'yearly') && <p className="hint">= {euro(Math.round(Math.abs(cents) / (interval === 'yearly' ? 12 : 3)))} im Monat</p>}
        {kind === 'expense' && owner === user.id && (
          <label className="checkbox">
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Privat – nur ich sehe diese Ausgabe (zählt trotzdem bei „Nach Rest“)
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" disabled={busy}
              onClick={() => confirm('Eintrag löschen?') && void run(async () => { await onDelete(); onClose(); })}>Löschen</button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy || cents === null}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}
