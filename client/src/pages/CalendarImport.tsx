import { useMemo, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAsync } from '../components/useAsync';
import { REMINDER_LABELS, formatShortDay, formatTime, parseLocal, toDateKey } from '../dates';
import { parseIcsEvents, type IcsCalendar } from '../ics';
import { useFamily } from '../session';
import type { CalendarEvent } from '../types';

interface Props {
  events: CalendarEvent[];
  onDone(): void;
  onClose(): void;
}

/** Kalenderdatei (.ics) übernehmen, z. B. Spielplan des Lieblingsvereins */
export function CalendarImport({ events, onDone, onClose }: Props) {
  const { family } = useFamily();
  const [calendar, setCalendar] = useState<IcsCalendar | null>(null);
  const [name, setName] = useState('');
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [reminder, setReminder] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { busy, error, run, setError } = useAsync();
  const base = `/families/${family.id}/events/import`;
  const today = toDateKey(new Date());

  // Schon importierte Kalender mit Anzahl der Termine
  const imported = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) if (e.source) counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
    return [...counts];
  }, [events]);

  const chosen = calendar ? calendar.events.filter((e) => !onlyUpcoming || e.end.slice(0, 10) >= today || e.recurrence !== 'none') : [];
  const known = new Set(events.map((e) => e.source_uid).filter(Boolean));
  const updates = chosen.filter((e) => known.has(e.uid)).length;

  const read = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const parsed = parseIcsEvents(await file.text());
      if (parsed.events.length === 0) return setError('In der Datei wurden keine Termine gefunden');
      setCalendar(parsed);
      setName(parsed.name || file.name.replace(/\.ics$/i, ''));
    });
  };

  const save = () =>
    void run(async () => {
      const source = name.trim() || 'Importiert';
      const items = chosen.map((e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
        all_day: e.all_day,
        location: e.location,
        description: e.description,
        recurrence: e.recurrence,
        until: e.until,
        member_ids: memberIds,
        reminder_minutes: reminder,
        source,
        source_uid: `${source}|${e.uid}`.slice(0, 500),
      }));
      const { created, updated } = await api<{ created: number; updated: number }>(base, { method: 'POST', body: { items } });
      onDone();
      setResult(`${created} ${created === 1 ? 'Termin' : 'Termine'} neu${updated ? `, ${updated} aktualisiert` : ''}.`);
    });

  const remove = (source: string) => {
    if (!confirm(`Alle Termine aus „${source}“ löschen?`)) return;
    void run(async () => {
      await api(`${base}?source=${encodeURIComponent(source)}`, { method: 'DELETE' });
      onDone();
    });
  };

  return (
    <Modal title="Kalender importieren" onClose={onClose}>
      <div className="form">
        {result ? (
          <p className="import-result"><Icon name="check" size={18} /> {result}</p>
        ) : !calendar ? (
          <>
            <p className="muted">
              Wähle eine Kalenderdatei (.ics), z. B. den Spielplan deines Vereins, Schul- oder Trainingstermine.
              Importierst du später eine neuere Datei mit gleichem Namen, werden verschobene Termine aktualisiert.
            </p>
            <label className="button primary file-button">
              <Icon name="download" size={18} /> Datei auswählen
              <input type="file" accept=".ics,text/calendar" hidden onChange={(e) => read(e.target.files?.[0])} />
            </label>
            {imported.length > 0 && (
              <div className="field">
                <span>Bereits importiert</span>
                <ul className="imported-calendars">
                  {imported.map(([source, count]) => (
                    <li key={source}>
                      <span><strong>{source}</strong> <small className="muted">· {count} {count === 1 ? 'Termin' : 'Termine'}</small></span>
                      <button type="button" className="link-button danger-link" disabled={busy} onClick={() => remove(source)}>Entfernen</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <label>
              Name des Kalenders
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="z. B. Fenerbahçe" />
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={onlyUpcoming} onChange={(e) => setOnlyUpcoming(e.target.checked)} />
              Nur kommende Termine
            </label>
            <div className="field">
              <span>
                {chosen.length} {chosen.length === 1 ? 'Termin' : 'Termine'}
                {updates > 0 && <small className="muted"> · davon {updates} schon vorhanden (werden aktualisiert)</small>}
              </span>
              <ul className="import-preview">
                {chosen.slice(0, 5).map((e) => (
                  <li key={e.uid}>
                    <span className="muted">
                      {formatShortDay(parseLocal(e.start))}{!e.all_day && ` · ${formatTime(parseLocal(e.start))}`}
                    </span>{' '}
                    {e.title}
                  </li>
                ))}
                {chosen.length > 5 && <li className="muted">… und {chosen.length - 5} weitere</li>}
              </ul>
            </div>
            <div className="field">
              <span>Für wen? <small className="hint">(bestimmt die Farbe im Kalender; leer = alle)</small></span>
              <MemberPicker value={memberIds} onChange={setMemberIds} />
            </div>
            <label>
              Erinnerung
              <select value={reminder ?? ''} onChange={(e) => setReminder(e.target.value === '' ? null : Number(e.target.value))}>
                {REMINDER_LABELS.map(([value, label]) => <option key={label} value={value ?? ''}>{label}</option>)}
              </select>
            </label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>{result ? 'Fertig' : 'Abbrechen'}</button>
          {calendar && !result && (
            <button className="button primary" disabled={busy || chosen.length === 0} onClick={save}>
              {chosen.length} übernehmen
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
