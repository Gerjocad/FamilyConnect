import { useMemo, useState } from 'react';
import { AvatarStack } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import {
  WEEKDAYS_SHORT, addDays, formatDay, formatMonth, formatTime, monthGrid, occurrencesInRange,
  sameDay, startOfDay, toDateKey, type Occurrence,
} from '../dates';
import { useFamily } from '../session';
import type { CalendarEvent } from '../types';
import { useResource } from '../useResource';
import { EventForm } from './EventForm';

export function eventColor(event: CalendarEvent, member: ReturnType<typeof useFamily>['member']) {
  return member(event.member_ids[0])?.color ?? 'var(--accent)';
}

export function OccurrenceRow({ occ, onClick }: { occ: Occurrence; onClick?(): void }) {
  const { member } = useFamily();
  const { event } = occ;
  const members = event.member_ids.map((id) => member(id)).filter((m) => m !== undefined);
  const multiDay = !sameDay(occ.start, occ.end);
  return (
    <button type="button" className="event-row" onClick={onClick} style={{ borderLeftColor: eventColor(event, member) }}>
      <span className="event-time">
        {event.all_day ? 'Ganztägig' : formatTime(occ.start)}
        {!event.all_day && <small>{multiDay ? 'mehrtägig' : formatTime(occ.end)}</small>}
      </span>
      <span className="event-main">
        <strong>{event.title}</strong>
        {(event.location || event.recurrence !== 'none') && (
          <small className="muted">
            {event.recurrence !== 'none' && <Icon name="repeat" size={12} />} {event.location}
          </small>
        )}
      </span>
      <AvatarStack members={members} size={22} />
    </button>
  );
}

export function CalendarPage() {
  const { family, member } = useFamily();
  const events = useResource<CalendarEvent>('events');
  const today = startOfDay(new Date());
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const [filter, setFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);

  const days = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const visible = useMemo(
    () => (filter === null ? events.items : events.items.filter((e) => e.member_ids.includes(filter))),
    [events.items, filter]
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const day of days) map.set(toDateKey(day), occurrencesInRange(visible, day, addDays(day, 1)));
    return map;
  }, [days, visible]);
  const selectedOccurrences = occurrencesInRange(visible, selected, addDays(selected, 1));

  const moveMonth = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="page">
      <header className="page-header">
        <h1>Kalender</h1>
        <button className="button primary" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Termin
        </button>
      </header>

      <div className="filter-bar" role="group" aria-label="Nach Person filtern">
        <button className={`chip ${filter === null ? 'chip-active' : ''}`} onClick={() => setFilter(null)}>Alle</button>
        {family.members.map((m) => (
          <button
            key={m.id}
            className={`chip ${filter === m.id ? 'chip-active' : ''}`}
            onClick={() => setFilter(filter === m.id ? null : m.id)}
          >
            <span className="dot" style={{ background: m.color }} /> {m.name}
          </button>
        ))}
      </div>

      <div className="calendar-layout">
        <section className="card calendar">
          <div className="calendar-nav">
            <button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat"><Icon name="left" /></button>
            <h2>{formatMonth(cursor)}</h2>
            <button className="icon-button" onClick={() => moveMonth(1)} aria-label="Nächster Monat"><Icon name="right" /></button>
            <button
              className="button small"
              onClick={() => {
                setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelected(today);
              }}
            >
              Heute
            </button>
          </div>
          <div className="month-grid">
            {WEEKDAYS_SHORT.map((d) => <div key={d} className="weekday">{d}</div>)}
            {days.map((day) => {
              const occs = byDay.get(toDateKey(day)) ?? [];
              return (
                <button
                  key={toDateKey(day)}
                  className={[
                    'day',
                    day.getMonth() !== cursor.getMonth() && 'other-month',
                    sameDay(day, today) && 'today',
                    sameDay(day, selected) && 'selected',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelected(day)}
                  onDoubleClick={() => setEditing('new')}
                >
                  <span className="day-number">{day.getDate()}</span>
                  <span className="day-events">
                    {occs.slice(0, 3).map((o, i) => (
                      <span key={i} className="day-event" style={{ background: eventColor(o.event, member) }}>
                        {o.event.title}
                      </span>
                    ))}
                    {occs.length > 3 && <span className="more">+{occs.length - 3}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card agenda">
          <h2>{formatDay(selected)}</h2>
          {selectedOccurrences.length === 0 ? (
            <EmptyState icon="calendar" title="Keine Termine">Doppelklick auf einen Tag oder „Termin“ zum Anlegen.</EmptyState>
          ) : (
            <div className="stack">
              {selectedOccurrences.map((o, i) => (
                <OccurrenceRow key={`${o.event.id}-${i}`} occ={o} onClick={() => setEditing(o.event)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {editing && (
        <EventForm
          event={editing === 'new' ? undefined : editing}
          defaultDay={selected}
          onClose={() => setEditing(null)}
          onSave={(data) => (editing === 'new' ? events.create(data) : events.update(editing.id, data))}
          onDelete={editing === 'new' ? undefined : () => events.remove(editing.id)}
        />
      )}
    </div>
  );
}

