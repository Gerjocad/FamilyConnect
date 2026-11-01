import { useState, type FormEvent } from 'react';
import { addDays, parseLocal, startOfDay, toDateKey } from '../dates';
import { SLOT_NAMES, type MealSlot, type NewPollPlan } from '../pages/BoardPage';
import type { Recipe } from '../types';
import { useResource } from '../useResource';
import { Modal } from './Modal';
import { useAsync } from './useAsync';

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
const SHORT = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });

/** Heute, morgen und das nächste Wochenende zum schnellen Antippen */
function quickDays(today: Date) {
  const days = [{ key: toDateKey(today), label: 'Heute' }, { key: toDateKey(addDays(today, 1)), label: 'Morgen' }];
  for (let i = 2; i < 8; i++) {
    const d = addDays(today, i);
    if (d.getDay() === 6 || d.getDay() === 0) days.push({ key: toDateKey(d), label: WEEKDAY.format(d) });
  }
  return days;
}

/** Familien-Umfrage: Tag wählen, Antworten sammeln – das Ergebnis landet im Essensplan bzw. im Kalender */
export function PlanPollDialog({ onCreate, onClose }: {
  onCreate(text: string, options: string[], plan: NewPollPlan): Promise<unknown>;
  onClose(): void;
}) {
  const today = startOfDay(new Date());
  const recipes = useResource<Recipe>('recipes');
  const [kind, setKind] = useState<'meal' | 'trip'>('meal');
  const [date, setDate] = useState(toDateKey(addDays(today, 1)));
  const [slot, setSlot] = useState<MealSlot>('dinner');
  const [withTime, setWithTime] = useState(false);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('16:00');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const { busy, error, run } = useAsync();
  const filled = options.map((o) => o.trim()).filter(Boolean);

  const day = parseLocal(date);
  const dayText = date === toDateKey(today) ? 'heute' : date === toDateKey(addDays(today, 1)) ? 'morgen' : `am ${WEEKDAY.format(day)}`;
  const suggested = kind === 'meal'
    ? `Was gibt es ${dayText} ${{ breakfast: 'zum Frühstück', lunch: 'zu Mittag', dinner: 'zum Abendessen' }[slot]}?`
    : `Wohin machen wir ${dayText} einen Ausflug?`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const plan: NewPollPlan = kind === 'meal'
      ? { kind, date, slot }
      : { kind, date, start_time: withTime ? start : null, end_time: withTime ? end : null };
    void run(async () => {
      await onCreate(question.trim() || suggested, filled, plan);
      onClose();
    });
  };

  return (
    <Modal title="Familien-Umfrage" onClose={onClose}>
      <form className="form plan-poll" onSubmit={submit}>
        <div className="segmented" role="tablist">
          <button type="button" className={kind === 'meal' ? 'active' : ''} onClick={() => setKind('meal')}>🍽️ Essen</button>
          <button type="button" className={kind === 'trip' ? 'active' : ''} onClick={() => setKind('trip')}>🚗 Ausflug</button>
        </div>
        <p className="hint">
          Alle stimmen ab – das Ergebnis kommt automatisch {kind === 'meal' ? 'in den Essensplan' : 'als Termin in den Kalender'}.
        </p>

        <fieldset className="plain-fieldset">
          <legend>Tag</legend>
          <div className="chips">
            {quickDays(today).map((d) => (
              <button key={d.key} type="button" className={`chip ${date === d.key ? 'chip-active' : ''}`} onClick={() => setDate(d.key)}>{d.label}</button>
            ))}
            <input type="date" value={date} min={toDateKey(today)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Anderer Tag" />
          </div>
          <small className="muted">{SHORT.format(day)}</small>
        </fieldset>

        {kind === 'meal' ? (
          <label>
            Mahlzeit
            <select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
              {Object.entries(SLOT_NAMES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label className="checkbox">
              <input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} /> Mit Uhrzeit (sonst ganztägig)
            </label>
            {withTime && (
              <div className="row">
                <label>Von<input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
                <label>Bis<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
              </div>
            )}
          </>
        )}

        <label>
          Frage
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={suggested} maxLength={500} />
        </label>

        <fieldset className="plain-fieldset">
          <legend>{kind === 'meal' ? 'Gerichte zur Auswahl' : 'Ziele zur Auswahl'}</legend>
          <div className="poll-editor">
            {options.map((o, i) => (
              <input
                key={i}
                value={o}
                list={kind === 'meal' ? 'plan-poll-recipes' : undefined}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={kind === 'meal' ? ['z. B. Pizza', 'z. B. Lahmacun', 'z. B. Nudelauflauf'][i % 3] : ['z. B. Zoo', 'z. B. Schwimmbad', 'z. B. Spielplatz am See'][i % 3]}
                aria-label={`Antwort ${i + 1}`}
                maxLength={100}
              />
            ))}
            {options.length < 6 && (
              <button type="button" className="link-button" onClick={() => setOptions([...options, ''])}>+ Weitere Antwort</button>
            )}
          </div>
          {kind === 'meal' && (
            <datalist id="plan-poll-recipes">
              {recipes.items.map((r) => <option key={r.id} value={r.title} />)}
            </datalist>
          )}
        </fieldset>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy || filled.length < 2}>Umfrage starten</button>
        </div>
      </form>
    </Modal>
  );
}
