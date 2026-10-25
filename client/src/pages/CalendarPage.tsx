import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { birthdaysInRange } from '../birthdays';
import { AvatarStack } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import {
  WEEKDAYS_SHORT, addDays, formatDay, formatMonth, formatShortDay, formatTime, monthGrid, occurrencesInRange, parseLocal,
  sameDay, startOfDay, toDateKey, type Occurrence,
} from '../dates';
import { useFamily } from '../session';
import { useHolidays } from '../holidays';
import type { CalendarEvent, Contact, Loan, Vacation } from '../types';
import { useResource } from '../useResource';
import { usePermissions } from '../permissions';
import { EventForm } from './EventForm';
import { deleteEvent, saveEvent } from '../eventSeries';
import { SCHOOL_HOLIDAY_COLOR, markBackground, vacationColor, vacationsOn } from '../vacations';
import { VacationForm } from './VacationForm';
import { LoanForm } from '../components/LoanForm';
import { loansDueOn } from '../loans';
import { useLenders } from './LoansPage';
import { CalendarImport } from './CalendarImport';
import { EventIconsDialog } from './EventIconsDialog';
import { useEventIcons } from '../eventIcons';
import { commentKey, useEventComments } from '../eventComments';
import { PlusMenu, TopbarActions, type PlusMenuItem } from '../components/TopbarActions';

export function eventColor(event: CalendarEvent, member: ReturnType<typeof useFamily>['member']) {
  return member(event.member_ids[0])?.color ?? 'var(--accent)';
}

export function OccurrenceRow({ occ, onClick, icons = [], comments = 0 }: {
  occ: Occurrence;
  onClick?(): void;
  /** Logos (eventIcons.ts), z. B. beide Wappen eines Spiels */
  icons?: string[];
  /** Anzahl Kommentare an diesem Tag */
  comments?: number;
}) {
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
        <strong>
          {icons.length > 0 && (
            <span className="event-logos">{icons.map((src, i) => <img key={i} src={src} alt="" className="event-logo" />)}</span>
          )}
          {event.title}
        </strong>
        {(event.location || event.recurrence !== 'none') && (
          <small className="muted">
            {event.recurrence !== 'none' && <Icon name="repeat" size={12} />} {event.location}
          </small>
        )}
      </span>
      {comments > 0 && (
        <span className="comment-count" aria-label={`${comments} ${comments === 1 ? 'Kommentar' : 'Kommentare'}`}>
          <Icon name="chat" size={14} /> {comments}
        </span>
      )}
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
  // Die Tagesliste erscheint erst, wenn ein Tag angetippt wurde
  const [showDay, setShowDay] = useState(false);
  const agendaRef = useRef<HTMLElement>(null);
  const pickDay = (day: Date) => {
    const again = showDay && sameDay(day, selected);
    setSelected(day);
    setShowDay(!again);
  };
  useEffect(() => {
    if (showDay) agendaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [showDay, selected]);

  // Aus den Neuigkeiten: /kalender?tag=JJJJ-MM-TT&termin=ID → Tag zeigen und den Termin öffnen
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const tag = params.get('tag');
    if (!tag || !/^\d{4}-\d{2}-\d{2}$/.test(tag)) return;
    const termin = Number(params.get('termin'));
    if (termin && events.loading) return;
    const day = parseLocal(tag);
    setCursor(new Date(day.getFullYear(), day.getMonth(), 1));
    setSelected(day);
    setShowDay(true);
    const occurrence = termin ? occurrencesInRange(events.items, day, addDays(day, 1)).find((o) => o.event.id === termin) : undefined;
    if (occurrence) setEditing({ event: occurrence.event, occurrence });
    setParams({}, { replace: true });
  }, [params, setParams, events.loading, events.items]);
  const [filter, setFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ event: CalendarEvent; occurrence: Occurrence } | 'new' | null>(null);
  const [editingVacation, setEditingVacation] = useState<Vacation | 'new' | null>(null);
  const [editingLoan, setEditingLoan] = useState<Loan | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingIcons, setEditingIcons] = useState(false);
  const icons = useEventIcons();
  const comments = useEventComments();
  const commentsOn = (o: Occurrence) => comments.counts.get(commentKey(o.event.id, toDateKey(o.start))) ?? 0;
  const { canEdit, isAdmin, isManager } = usePermissions();

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

  // Feiertage, Schulferien und Geburtstage als Zusatz zu den Terminen
  const holidays = useHolidays([...new Set([days[0].getFullYear(), days[days.length - 1].getFullYear(), today.getFullYear()])]);
  const contacts = useResource<Contact>('contacts');
  const vacations = useResource<Vacation>('vacations');
  const loans = useResource<Loan>('loans');
  const lenders = useLenders(loans.items);
  const visibleLoans = useMemo(
    () => (filter === null ? loans.items : loans.items.filter((l) => l.member_id === filter)),
    [loans.items, filter]
  );
  const visibleVacations = useMemo(
    () => (filter === null ? vacations.items : vacations.items.filter((v) => !v.member_ids.length || v.member_ids.includes(filter))),
    [vacations.items, filter]
  );
  const birthdays = useMemo(
    () => birthdaysInRange(family.members, contacts.items, days[0], days[days.length - 1]),
    [family.members, contacts.items, days]
  );
  const extrasFor = (date: string) => ({
    publicHoliday: holidays.publicHoliday(date),
    school: holidays.schoolHoliday(date),
    birthdays: birthdays.filter((b) => b.date === date).map((b) => b.label),
    vacations: vacationsOn(visibleVacations, date),
    loans: loansDueOn(visibleLoans, date),
  });
  // Ferien und Urlaube färben das Feld leicht ein; bei Überschneidung teilt es sich auf
  const marks = (extras: ReturnType<typeof extrasFor>) => [
    ...(extras.school ? [SCHOOL_HOLIDAY_COLOR] : []),
    ...extras.vacations.map((v) => vacationColor(v, member)),
  ];
  const selectedKey = toDateKey(selected);
  const selectedExtras = extrasFor(selectedKey);
  const hasExtras = Boolean(
    selectedExtras.publicHoliday || selectedExtras.school || selectedExtras.birthdays.length || selectedExtras.vacations.length
    || selectedExtras.loans.length
  );

  const addItems: PlusMenuItem[] = [
    { label: 'Termin', icon: 'calendar', onSelect: () => setEditing('new') },
    { label: 'Urlaub', icon: 'sun', onSelect: () => setEditingVacation('new') },
    { label: 'Ausleihe (Rückgabe)', icon: 'book', onSelect: () => setEditingLoan('new') },
    { label: 'Kalender importieren (.ics)', icon: 'download', onSelect: () => setImporting(true) },
    { label: 'Logos', icon: 'sparkle', onSelect: () => setEditingIcons(true) },
  ];

  const moveMonth = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="page">
      {/* Handy: „+“ oben in der Leiste; größere Bildschirme: neben der Überschrift */}
      <TopbarActions><PlusMenu items={addItems} /></TopbarActions>
      <header className="page-header calendar-header">
        <h1>Kalender</h1>
        <PlusMenu items={addItems} />
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
              const extras = extrasFor(toDateKey(day));
              const commented = occs.some((o) => sameDay(o.start, day) && commentsOn(o) > 0);
              return (
                <button
                  key={toDateKey(day)}
                  className={[
                    'day',
                    day.getMonth() !== cursor.getMonth() && 'other-month',
                    sameDay(day, today) && 'today',
                    showDay && sameDay(day, selected) && 'selected',
                    extras.publicHoliday && 'public-holiday',
                  ].filter(Boolean).join(' ')}
                  style={{ backgroundImage: markBackground(marks(extras)) }}
                  title={[extras.publicHoliday, extras.school?.name, ...extras.vacations.map((v) => v.title)].filter(Boolean).join(' · ') || undefined}
                  onClick={() => pickDay(day)}
                  onDoubleClick={() => setEditing('new')}
                >
                  <span className="day-number">{day.getDate()}</span>
                  {commented && <span className="day-comment" title="Mit Kommentar" aria-label="Mit Kommentar"><Icon name="chat" size={10} /></span>}
                  <span className="day-events">
                    {extras.publicHoliday && <span className="day-event holiday-pill">{extras.publicHoliday}</span>}
                    {extras.birthdays.map((b) => <span key={b} className="day-event birthday-pill">{b}</span>)}
                    {extras.loans.map((l) => (
                      <span key={`l${l.id}`} className="day-event loan-pill" title={`Rückgabe: ${l.title}`}>
                        <span className="loan-emoji" aria-hidden>📚</span><span className="day-event-title">{l.title}</span>
                      </span>
                    ))}
                    {occs.slice(0, 3).map((o, i) => {
                      const logos = icons.iconsFor(o.event.title);
                      return (
                        <span key={i} className={`day-event ${logos.length ? 'has-logo' : ''}`} style={{ background: eventColor(o.event, member) }}>
                          {logos.map((src, j) => <img key={j} src={src} alt="" className="day-logo" />)}
                          <span className="day-event-title">{o.event.title}</span>
                        </span>
                      );
                    })}
                    {occs.length > 3 && <span className="more">+{occs.length - 3}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {showDay && (
          <section className="card agenda" ref={agendaRef}>
            <h2>{formatDay(selected)}</h2>
            {hasExtras && (
              <ul className="day-extras">
                {selectedExtras.publicHoliday && <li>🎉 {selectedExtras.publicHoliday} <span className="muted">· Feiertag</span></li>}
                {selectedExtras.school && <li>🏖️ {selectedExtras.school.name} <span className="muted">· bis {formatShortDay(parseLocal(selectedExtras.school.end))}</span></li>}
                {selectedExtras.vacations.map((v) => (
                  <li key={`v${v.id}`}>
                    <button type="button" className="vacation-line" onClick={() => setEditingVacation(v)}>
                      <span className="dot" style={{ background: vacationColor(v, member) }} /> ✈️ {v.title}
                      <span className="muted">
                        · bis {formatShortDay(parseLocal(v.end_date))}
                        {v.member_ids.length > 0 && ` · ${v.member_ids.map((id) => member(id)?.name).filter(Boolean).join(', ')}`}
                      </span>
                    </button>
                  </li>
                ))}
                {selectedExtras.birthdays.map((b) => <li key={b}>{b.replace('🎂 ', '🎂 Geburtstag: ')}</li>)}
                {selectedExtras.loans.map((l) => (
                  <li key={`l${l.id}`}>
                    <button type="button" className="vacation-line" onClick={() => setEditingLoan(l)}>
                      📚 Rückgabe: {l.title}
                      <span className="muted"> {[l.member_id ? member(l.member_id)?.name.split(' ')[0] : '', l.lender].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!holidays.state && isAdmin && (
              <p className="hint"><Link to="/einstellungen">Bundesland wählen</Link>, dann erscheinen Ferien und Feiertage.</p>
            )}
            {selectedOccurrences.length === 0 ? (
              hasExtras ? <p className="muted">Keine Termine.</p> :
              <EmptyState icon="calendar" title="Keine Termine">Doppelklick auf einen Tag oder „Termin“ zum Anlegen.</EmptyState>
            ) : (
              <div className="stack">
                {selectedOccurrences.map((o, i) => (
                  <OccurrenceRow key={`${o.event.id}-${i}`} occ={o} icons={icons.iconsFor(o.event.title)} comments={commentsOn(o)} onClick={() => setEditing({ event: o.event, occurrence: o })} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {editingLoan && (
        <LoanForm
          loan={editingLoan === 'new' ? undefined : editingLoan}
          lenders={lenders}
          onSave={(data) => (editingLoan === 'new' ? loans.create(data) : loans.update(editingLoan.id, data))}
          onDelete={editingLoan === 'new' ? undefined : () => loans.remove(editingLoan.id)}
          onClose={() => setEditingLoan(null)}
        />
      )}
      {editingIcons && (
        <EventIconsDialog
          icons={icons.items}
          canEdit={isManager}
          onCreate={icons.create}
          onUpdate={icons.update}
          onDelete={icons.remove}
          onClose={() => setEditingIcons(false)}
        />
      )}

      {importing && <CalendarImport events={events.items} onDone={() => void events.reload()} onClose={() => setImporting(false)} />}

      {editingVacation && (
        <VacationForm
          vacation={editingVacation === 'new' ? undefined : editingVacation}
          defaultDay={selected}
          onClose={() => setEditingVacation(null)}
          readOnly={editingVacation !== 'new' && !canEdit(editingVacation)}
          onSave={(data) => (editingVacation === 'new' ? vacations.create(data) : vacations.update(editingVacation.id, data))}
          onDelete={editingVacation === 'new' ? undefined : () => vacations.remove(editingVacation.id)}
        />
      )}

      {editing && (
        <EventForm
          event={editing === 'new' ? undefined : editing.event}
          occurrence={editing === 'new' ? undefined : editing.occurrence}
          defaultDay={selected}
          onClose={() => setEditing(null)}
          readOnly={editing !== 'new' && !canEdit(editing.event)}
          onSave={(data, scope) =>
            editing === 'new' ? saveEvent(events, data) : saveEvent(events, data, editing.event, editing.occurrence, scope)}
          onDelete={editing === 'new' ? undefined : (scope) => deleteEvent(events, editing.event, editing.occurrence, scope)}
        />
      )}
    </div>
  );
}

