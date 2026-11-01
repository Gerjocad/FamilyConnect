import { useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import {
  CATEGORY_SUGGESTIONS, INTERVALS, METHODS, centsToInput, formatEuro, monthly, parseEuro, useFinance,
  type FinanceEntry, type FinanceFields, type FinanceKind, type FinanceOverview, type SplitMethod,
} from '../finance';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';

const firstName = (name?: string) => name?.split(' ')[0] ?? '';

function EntryForm({ entry, owner, kind, owners, onSave, onDelete, onClose }: {
  entry?: FinanceEntry;
  owner: number | null;
  kind: FinanceKind;
  owners: number[];
  onSave(data: FinanceFields): Promise<unknown>;
  onDelete?(): Promise<unknown>;
  onClose(): void;
}) {
  const { member } = useFamily();
  const [ownerId, setOwnerId] = useState(entry ? entry.owner_id : owner);
  const [type, setType] = useState<FinanceKind>(entry?.kind ?? kind);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [amount, setAmount] = useState(entry ? centsToInput(entry.amount) : '');
  const [interval, setInterval] = useState<FinanceEntry['interval_months']>(entry?.interval_months ?? 1);
  const [category, setCategory] = useState(entry?.category ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const { busy, error, run, setError } = useAsync();

  const cents = parseEuro(amount);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!cents) return setError('Bitte einen Betrag eingeben, z. B. 1.250,00');
    void run(async () => {
      await onSave({ owner_id: ownerId, kind: type, title, amount: cents, interval_months: interval, category, notes });
      onClose();
    });
  };

  return (
    <Modal title={entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <span>Wessen Geld?</span>
          <div className="member-picker" role="group">
            <button type="button" className={`chip ${ownerId === null ? 'chip-active' : ''}`} aria-pressed={ownerId === null} onClick={() => setOwnerId(null)}>
              🏠 Gemeinsam
            </button>
            {owners.map((id) => {
              const m = member(id);
              if (!m) return null;
              const active = ownerId === id;
              return (
                <button type="button" key={id} className={`chip ${active ? 'chip-active' : ''}`} aria-pressed={active}
                  style={active ? { borderColor: m.color, background: `${m.color}22` } : undefined} onClick={() => setOwnerId(id)}>
                  <Avatar member={m} size={20} /> {firstName(m.name)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={type === 'expense'} className={type === 'expense' ? 'active' : ''} onClick={() => setType('expense')}>
            Ausgabe
          </button>
          <button type="button" role="tab" aria-selected={type === 'income'} className={type === 'income' ? 'active' : ''} onClick={() => setType('income')}>
            Einnahme
          </button>
        </div>
        <label>
          Wofür?
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required autoFocus
            placeholder={type === 'income' ? 'z. B. Gehalt, Kindergeld' : 'z. B. Miete, Strom, Handyvertrag'} />
        </label>
        <div className="row">
          <label>
            Betrag in €
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" required />
          </label>
          <label>
            Wie oft?
            <select value={interval} onChange={(e) => setInterval(Number(e.target.value) as FinanceEntry['interval_months'])}>
              {INTERVALS.map((i) => <option key={i.months} value={i.months}>{i.label}</option>)}
            </select>
          </label>
        </div>
        {cents !== null && interval > 1 && (
          <p className="hint">Entspricht {formatEuro(cents / interval)} im Monat – so viel wird monatlich zurückgelegt.</p>
        )}
        <label>
          Kategorie <span className="hint">(optional)</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} list="finance-categories" maxLength={50} />
          <datalist id="finance-categories">
            {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label>
          Notizen <span className="hint">(optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="button danger" disabled={busy}
              onClick={() => confirm('Eintrag löschen?') && void run(async () => { await onDelete(); onClose(); })}>
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

/** Die Antwort auf die eigentliche Frage: wer überweist wie viel? */
function TransferCard({ data, onMethod }: { data: FinanceOverview; onMethod(m: SplitMethod): void }) {
  const { member } = useFamily();
  const { settings, shared } = data;
  const result = data.results[settings.method];
  const info = METHODS.find((m) => m.method === settings.method)!;
  const [compare, setCompare] = useState(false);

  return (
    <section className="card finance-transfer">
      <h2>Monatlich aufs Gemeinschaftskonto</h2>
      <div className="filter-bar" role="group" aria-label="Aufteilung">
        {METHODS.map((m) => (
          <button key={m.method} className={`chip ${settings.method === m.method ? 'chip-active' : ''}`} onClick={() => onMethod(m.method)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="hint">{info.explain}</p>

      {result.need === 0 ? (
        <p className="muted">
          {shared.expenses === 0
            ? 'Trag die gemeinsamen Ausgaben ein (Miete, Strom, Lebensmittel …), dann steht hier, wer wie viel überweist.'
            : 'Die gemeinsamen Einnahmen decken die gemeinsamen Ausgaben – niemand muss etwas überweisen.'}
        </p>
      ) : (
        <ul className="finance-people">
          {result.people.map((p) => {
            const m = member(p.member_id);
            return (
              <li key={p.member_id} style={{ borderColor: m?.color }}>
                <div className="finance-person">
                  {m && <Avatar member={m} size={28} />}
                  <strong>{firstName(m?.name)}</strong>
                  <small className="muted">{Math.round(p.share * 100)} %</small>
                </div>
                <div className="finance-amount">{formatEuro(p.transfer)}</div>
                <small className={p.remaining < 0 ? 'error' : 'muted'}>
                  {p.income === 0 ? 'Noch keine Einnahmen eingetragen' : `bleiben ${formatEuro(p.remaining)} für sich`}
                </small>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="finance-sums">
        <div><dt>Gemeinsame Ausgaben</dt><dd>{formatEuro(shared.expenses)}</dd></div>
        {shared.income > 0 && <div><dt>− Gemeinsame Einnahmen</dt><dd>{formatEuro(shared.income)}</dd></div>}
        {settings.buffer_percent > 0 && result.need > 0 && (
          <div><dt>+ Puffer {settings.buffer_percent} %</dt><dd>{formatEuro(result.need - Math.max(0, shared.expenses - shared.income))}</dd></div>
        )}
        <div className="total"><dt>Überweisungen zusammen</dt><dd>{formatEuro(result.total)}</dd></div>
        {result.balance !== 0 && (
          <div><dt>{result.balance > 0 ? 'Bleibt monatlich auf dem Konto' : 'Fehlt monatlich auf dem Konto'}</dt><dd className={result.balance < 0 ? 'error' : ''}>{formatEuro(result.balance)}</dd></div>
        )}
      </dl>

      {result.need > 0 && result.people.length > 1 && (
        <>
          <button className="link-button" onClick={() => setCompare(!compare)}>{compare ? '▾' : '▸'} Alle Aufteilungen vergleichen</button>
          {compare && (
            <div className="finance-compare">
              <table>
                <thead>
                  <tr>
                    <th />
                    {result.people.map((p) => <th key={p.member_id}>{firstName(member(p.member_id)?.name)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {METHODS.map((m) => (
                    <tr key={m.method} className={m.method === settings.method ? 'active' : ''} onClick={() => onMethod(m.method)}>
                      <th>{m.label}</th>
                      {data.results[m.method].people.map((p) => (
                        <td key={p.member_id}>{formatEuro(p.transfer)}<br /><small className="muted">bleibt {formatEuro(p.remaining)}</small></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SettingsCard({ data, adults, onSave }: { data: FinanceOverview; adults: number[]; onSave(body: Parameters<ReturnType<typeof useFinance>['saveSettings']>[0]): void }) {
  const { member } = useFamily();
  const { settings } = data;
  const toggle = (id: number) => {
    const current = settings.participants;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (next.length) onSave({ member_ids: next });
  };
  return (
    <section className="card finance-settings form">
      <div className="field">
        <span>Wer zahlt ein?</span>
        <div className="member-picker" role="group">
          {adults.map((id) => {
            const m = member(id);
            if (!m) return null;
            const on = settings.participants.includes(id);
            return (
              <button type="button" key={id} className={`chip ${on ? 'chip-active' : ''}`} aria-pressed={on}
                style={on ? { borderColor: m.color, background: `${m.color}22` } : undefined} onClick={() => toggle(id)}>
                <Avatar member={m} size={20} /> {m.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="row">
        <label>
          Aufrunden auf
          <select value={settings.round_to} onChange={(e) => onSave({ round_to: Number(e.target.value) })}>
            <option value={0}>centgenau</option>
            {[1, 5, 10, 50, 100].map((n) => <option key={n} value={n}>volle {n} €</option>)}
          </select>
        </label>
        <label>
          Puffer fürs Konto
          <select value={settings.buffer_percent} onChange={(e) => onSave({ buffer_percent: Number(e.target.value) })}>
            {[0, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n ? `+ ${n} %` : 'kein Puffer'}</option>)}
          </select>
        </label>
      </div>
      <p className="hint">Aufgerundet wird immer nach oben, damit das Gemeinschaftskonto nicht ins Minus rutscht. Ein Puffer fängt schwankende Kosten (Strom, Einkäufe) ab.</p>
    </section>
  );
}

function EntryList({ title, entries, onEdit, onAdd }: { title: string; entries: FinanceEntry[]; onEdit(e: FinanceEntry): void; onAdd(): void }) {
  const total = entries.reduce((a, e) => a + monthly(e), 0);
  return (
    <section className="finance-section">
      <header className="finance-section-header">
        <h3>{title}</h3>
        <span className="muted">{formatEuro(total)} / Monat</span>
      </header>
      {entries.length > 0 && (
        <ul className="finance-list card">
          {entries.map((e) => {
            const interval = INTERVALS.find((i) => i.months === e.interval_months)!;
            return (
              <li key={e.id}>
                <button className="finance-entry" onClick={() => onEdit(e)}>
                  <span className="finance-entry-main">
                    <strong>{e.title}</strong>
                    {(e.category || e.notes) && <small className="muted">{[e.category, e.notes].filter(Boolean).join(' · ')}</small>}
                  </span>
                  <span className="finance-entry-amount">
                    <span>{formatEuro(e.amount)} <small className="muted">{interval.short}</small></span>
                    {e.interval_months > 1 && <small className="muted">≈ {formatEuro(monthly(e))} / Monat</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="link-button" onClick={onAdd}><Icon name="plus" size={16} /> {title.replace(/^Gemeinsame |^Eigene /, '')} eintragen</button>
    </section>
  );
}

export function FinancePage() {
  const { user, family, member } = useFamily();
  const { isManager } = usePermissions();
  const finance = useFinance();
  const [tab, setTab] = useState<number | null>(null);
  const [editing, setEditing] = useState<FinanceEntry | { kind: FinanceKind } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { error, run } = useAsync();

  if (!isManager) {
    return (
      <div className="page">
        <EmptyState icon="wallet" title="Nur für Erwachsene">Die Finanzen sehen nur Eltern und Admins.</EmptyState>
      </div>
    );
  }

  const { data } = finance;
  const adults = family.members.filter((m) => m.role !== 'child').map((m) => m.id);
  // Reiter: Gemeinsam, dann die Einzahlenden (man selbst zuerst) und alle, die sonst noch Einträge haben
  const owners = data
    ? [...new Set([...data.settings.participants, ...data.entries.map((e) => e.owner_id).filter((id): id is number => id !== null)])]
        .filter((id) => member(id))
        .sort((a, b) => Number(b === user.id) - Number(a === user.id))
    : [];
  const entries = data?.entries.filter((e) => e.owner_id === tab) ?? [];
  const income = entries.filter((e) => e.kind === 'income');
  const expenses = entries.filter((e) => e.kind === 'expense');
  const person = tab === null ? null : data?.results[data.settings.method].people.find((p) => p.member_id === tab);
  const save = (body: Parameters<typeof finance.saveSettings>[0]) => void run(() => finance.saveSettings(body));

  return (
    <div className="page finance">
      <header className="page-header">
        <h1>Finanzen</h1>
        <div className="row">
          <button className="button" onClick={() => setShowSettings(!showSettings)} aria-pressed={showSettings}><Icon name="settings" /> Berechnung</button>
          <button className="button primary" onClick={() => setEditing({ kind: 'expense' })}><Icon name="plus" /> Eintrag</button>
        </div>
      </header>
      {(error || finance.error) && <p className="error">{error ?? finance.error}</p>}

      {data && (
        <>
          <TransferCard data={data} onMethod={(method) => save({ method })} />
          {showSettings && <SettingsCard data={data} adults={adults} onSave={save} />}

          <div className="member-picker finance-tabs" role="tablist">
            <button role="tab" aria-selected={tab === null} className={`chip ${tab === null ? 'chip-active' : ''}`} onClick={() => setTab(null)}>
              🏠 Gemeinsam
            </button>
            {owners.map((id) => {
              const m = member(id)!;
              const active = tab === id;
              return (
                <button key={id} role="tab" aria-selected={active} className={`chip ${active ? 'chip-active' : ''}`}
                  style={active ? { borderColor: m.color, background: `${m.color}22` } : undefined} onClick={() => setTab(id)}>
                  <Avatar member={m} size={20} /> {id === user.id ? 'Ich' : firstName(m.name)}
                </button>
              );
            })}
          </div>

          {person && (
            <dl className="card finance-sums finance-personal">
              <div><dt>Einnahmen</dt><dd>{formatEuro(person.income)}</dd></div>
              <div><dt>− eigene Ausgaben</dt><dd>{formatEuro(person.expenses)}</dd></div>
              <div><dt>− Überweisung aufs Gemeinschaftskonto</dt><dd>{formatEuro(person.transfer)}</dd></div>
              <div className="total"><dt>Bleibt zum Leben und Sparen</dt><dd className={person.remaining < 0 ? 'error' : ''}>{formatEuro(person.remaining)}</dd></div>
            </dl>
          )}
          {tab !== null && !person && <p className="hint">{firstName(member(tab)?.name)} zahlt gerade nicht aufs Gemeinschaftskonto ein (unter „Berechnung“ änderbar).</p>}

          {data.entries.length === 0 && tab === null ? (
            <>
              <EmptyState icon="wallet" title="Noch nichts eingetragen">
                Tragt hier die gemeinsamen Ausgaben ein (Miete, Strom, Lebensmittel …) und unter eurem Namen jeweils eure Einnahmen und eigenen Ausgaben.
                Dann rechnet FamilyConnect aus, wer wie viel aufs Gemeinschaftskonto überweist.
              </EmptyState>
              <button className="button primary finance-first" onClick={() => setEditing({ kind: 'expense' })}><Icon name="plus" /> Erste gemeinsame Ausgabe</button>
            </>
          ) : (
            <>
              <EntryList title={tab === null ? 'Gemeinsame Ausgaben' : 'Eigene Ausgaben'} entries={expenses} onEdit={setEditing} onAdd={() => setEditing({ kind: 'expense' })} />
              <EntryList title={tab === null ? 'Gemeinsame Einnahmen' : 'Einnahmen'} entries={income} onEdit={setEditing} onAdd={() => setEditing({ kind: 'income' })} />
              {tab === null && <p className="hint">Gemeinsame Einnahmen (z. B. Kindergeld) gehen direkt aufs Gemeinschaftskonto und senken, was ihr überweisen müsst.</p>}
            </>
          )}
        </>
      )}

      {editing && data && (
        <EntryForm
          entry={'id' in editing ? editing : undefined}
          owner={tab}
          kind={editing.kind}
          owners={[...new Set([...owners, ...adults])]}
          onSave={(body) => ('id' in editing ? finance.update(editing.id, body) : finance.add(body))}
          onDelete={'id' in editing ? () => finance.remove(editing.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
