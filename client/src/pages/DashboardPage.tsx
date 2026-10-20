import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { WeatherCard } from '../components/WeatherCard';
import { addDays, formatDay, occurrencesInRange, parseLocal, sameDay, startOfDay, toDateKey } from '../dates';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import { habitStatus, nfcOnlyFor, statusLabel } from '../habitStatus';
import type { CalendarEvent, Contact, Habit, Meal, Post, Task } from '../types';
import { useCheckins } from '../useCheckins';
import { useResource } from '../useResource';
import { PostCard, usePolls } from './BoardPage';
import { untilLabel, upcomingBirthdays } from '../birthdays';
import { useHolidays } from '../holidays';
import { allOccurrences, useChores } from '../chores';
import { WARNING_LABELS, formatNumber, useClimate } from '../climate';
import { OccurrenceRow as ChoreRow } from './ChoresPage';
import { useComplaints } from './ComplaintsPage';
import { useRequests } from './RequestsPage';
import { OccurrenceRow } from './CalendarPage';
import { useEventIcons } from '../eventIcons';
import { commentKey, useEventComments } from '../eventComments';
import { TaskRow, useTaskToggle } from './TasksPage';

/** Ganze Karte antippbar; Häkchen und Abhak-Knöpfe darin funktionieren weiter für sich */
function NavCard({ to, className = '', children }: { to: string; className?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, label, .check-button, .poll, a')) return;
    navigate(to);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) navigate(to);
  };
  return (
    <section className={`card nav-card ${className}`} onClick={onClick} onKeyDown={onKeyDown} role="link" tabIndex={0}>
      {children}
    </section>
  );
}

const More = () => (
  <span className="nav-card-chevron" aria-hidden="true">
    <Icon name="right" size={18} />
  </span>
);

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}

const SLOT_LABEL = { breakfast: 'Frühstück', lunch: 'Mittag', dinner: 'Abend' } as const;

export function DashboardPage() {
  const today = startOfDay(new Date());
  const { user, family } = useFamily();
  const events = useResource<CalendarEvent>('events');
  const icons = useEventIcons();
  const comments = useEventComments();
  const tasks = useResource<Task>('tasks');
  const posts = useResource<Post>('posts');
  const meals = useResource<Meal>('meals');
  const { toggle, toast } = useTaskToggle(tasks);
  const habits = useResource<Habit>('habits');
  const checkins = useCheckins();
  const { isChild } = usePermissions();
  const complaints = useComplaints();
  const requests = useRequests();
  const chores = useChores();
  const polls = usePolls();
  const climate = useClimate();
  const contacts = useResource<Contact>('contacts');
  const holidays = useHolidays([today.getFullYear(), today.getFullYear() + 1]);
  const todayKey = toDateKey(today);
  const holidayLine = (() => {
    const pub = holidays.publicHoliday(todayKey);
    if (pub) return `🎉 Heute ist ${pub}`;
    const school = holidays.schoolHoliday(todayKey);
    if (school) {
      const left = Math.round((parseLocal(school.end).getTime() - today.getTime()) / 86_400_000);
      return `🏖️ ${school.name} – ${left === 0 ? 'letzter Tag' : `noch ${left} ${left === 1 ? 'Tag' : 'Tage'}`}`;
    }
    const next = holidays.nextSchoolHoliday(todayKey);
    if (!next) return null;
    const days = Math.round((parseLocal(next.start).getTime() - today.getTime()) / 86_400_000);
    return days <= 30 ? `🏖️ ${next.name} in ${days} ${days === 1 ? 'Tag' : 'Tagen'}` : null;
  })();
  const birthdaysSoon = upcomingBirthdays(family.members, contacts.items).filter((b) => b.daysUntil <= 14).slice(0, 4);
  const openComplaints = complaints.items.filter((c) => c.recipient_id === user.id && c.status === 'open');
  // Eigene Gewohnheiten, die heute dran sind oder heute erledigt wurden
  const myHabits = habits.items
    .filter((h) => h.member_ids.length === 0 || h.member_ids.includes(user.id))
    .map((h) => ({ habit: h, status: habitStatus(h, user.id, checkins.items) }))
    .filter(({ status }) => status.doneToday || status.dueIn <= 0);

  const choresSoon = allOccurrences(chores.chores.items, toDateKey(today), toDateKey(addDays(today, 1)), chores.days);
  const upcoming = occurrencesInRange(events.items, today, addDays(today, 7));
  const myTasks = tasks.items.filter((t) => !t.done && (t.assignee_id === user.id || t.assignee_id === null)).slice(0, 6);
  const latestPosts = [...posts.items].sort((a, b) => b.id - a.id).slice(0, 3);
  const todaysMeals = meals.items.filter((m) => m.date === toDateKey(today));

  // Termine nach Tag gruppieren
  const groups: { day: Date; items: typeof upcoming }[] = [];
  for (const occ of upcoming) {
    const day = occ.start < today ? today : startOfDay(occ.start);
    const last = groups.at(-1);
    if (last && sameDay(last.day, day)) last.items.push(occ);
    else groups.push({ day, items: [occ] });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{greeting()}, {user.name.split(' ')[0]}!</h1>
          <p className="muted">{formatDay(today)} · {family.name}</p>
          {holidayLine && <p className="holiday-line">{holidayLine}</p>}
        </div>
      </header>

      <div className="dashboard">
        {requests.needsMe.length > 0 && (
          <NavCard to="/anfragen" className="span-2 request-alert">
            <header className="section-header">
              <h2><Icon name="request" size={18} /> {requests.needsMe.length === 1 ? 'Eine Anfrage wartet' : `${requests.needsMe.length} Anfragen warten`} auf dich</h2>
              <span className="spacer" />
              <More />
            </header>
            <p className="muted">{requests.needsMe[0].title}</p>
          </NavCard>
        )}
        {openComplaints.length > 0 && (
          <NavCard to="/beschwerden" className="span-2 complaint-alert">
            <header className="section-header">
              <h2><Icon name="complaint" size={18} /> {openComplaints.length === 1 ? 'Eine Beschwerde' : `${openComplaints.length} Beschwerden`} an dich</h2>
              <span className="spacer" />
              <More />
            </header>
            <p className="muted">{openComplaints[0].text}</p>
          </NavCard>
        )}
        <WeatherCard events={events.items} />

        <NavCard to="/kalender" className="span-2">
          <header className="section-header">
            <h2><Icon name="calendar" size={18} /> Die nächsten 7 Tage</h2>
            <span className="spacer" />
            <More />
          </header>
          {groups.length === 0 ? (
            <EmptyState icon="calendar" title="Keine Termine in dieser Woche" />
          ) : (
            groups.map((g) => (
              <div key={toDateKey(g.day)} className="agenda-group">
                <h3>{sameDay(g.day, today) ? 'Heute' : formatDay(g.day)}</h3>
                <div className="stack">
                  {g.items.map((o, i) => <OccurrenceRow key={`${o.event.id}-${i}`} occ={o} icon={icons.iconFor(o.event.title)} comments={comments.counts.get(commentKey(o.event.id, toDateKey(o.start))) ?? 0} />)}
                </div>
              </div>
            ))
          )}
        </NavCard>

        <NavCard to="/aufgaben">
          <header className="section-header">
            <h2><Icon name="task" size={18} /> Für dich zu tun</h2>
            <span className="spacer" />
            <More />
          </header>
          {myTasks.length === 0 ? (
            <EmptyState icon="check" title="Nichts offen" />
          ) : (
            <ul className="check-list">
              {myTasks.map((t) => <TaskRow key={t.id} task={t} onToggle={() => void toggle(t)} />)}
            </ul>
          )}
        </NavCard>

        {myHabits.length > 0 && (
          <NavCard to="/gewohnheiten">
            <header className="section-header">
              <h2><Icon name="habit" size={18} /> Gewohnheiten</h2>
              <span className="spacer" />
              <More />
            </header>
            <ul className="check-list">
              {myHabits.map(({ habit, status }) => (
                <li key={habit.id} className={`check-row ${status.doneToday ? 'done' : ''}`}>
                  <span className="habit-emoji small">{habit.emoji || '✔️'}</span>
                  <span className="task-main">
                    <span className="check-text">{habit.title}</span>
                    <small className={status.doneToday ? 'muted' : 'overdue'}>{statusLabel(status)}</small>
                  </span>
                  {nfcOnlyFor(habit, isChild) ? (
                    <span className={`check-button ${status.doneToday ? 'done' : 'nfc-only'}`} title="Mit dem NFC-Aufkleber abhaken" aria-label={`${habit.title}: mit dem NFC-Aufkleber abhaken`}>
                      <Icon name={status.doneToday ? 'check' : 'nfc'} size={20} />
                    </span>
                  ) : (
                    <button
                      className={`check-button ${status.doneToday ? 'done' : ''}`}
                      onClick={() => void checkins.toggle(habit.id, user.id, toDateKey(today), status.doneToday)}
                      aria-label={`${habit.title} ${status.doneToday ? 'zurücknehmen' : 'erledigt'}`}
                    >
                      <Icon name="check" size={20} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </NavCard>
        )}

        {climate.sensors.length > 0 && (
          <section className="card climate-card">
            <header className="section-header">
              <h2><Icon name="thermometer" size={18} /> Raumklima</h2>
            </header>
            <ul className="climate-list">
              {climate.sensors.map((s) => (
                <li key={s.device_id} className={`climate-row ${s.warnings.length ? 'warn' : ''}`}>
                  <span className="climate-label">
                    <strong>{s.label || 'Thermometer'}</strong>
                    {s.error ? <small className="error">{s.error}</small> : s.warnings.length > 0 && (
                      <small className="climate-warning">{s.warnings.map((w) => WARNING_LABELS[w]).join(' · ')}</small>
                    )}
                  </span>
                  {s.temperature !== null && <span className={`climate-value ${s.warnings.some((w) => w.endsWith('temp')) ? 'bad' : ''}`}>{formatNumber(s.temperature)} °C</span>}
                  {s.humidity !== null && <span className={`climate-value humidity ${s.warnings.some((w) => w.endsWith('humidity')) ? 'bad' : ''}`}>💧 {formatNumber(s.humidity)} %</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {birthdaysSoon.length > 0 && (
          <NavCard to="/geburtstage" className="birthday-alert">
            <header className="section-header">
              <h2><Icon name="cake" size={18} /> Geburtstage</h2>
              <span className="spacer" />
              <More />
            </header>
            <ul className="plain-list">
              {birthdaysSoon.map((b) => (
                <li key={b.key} className="birthday-line">
                  <strong>{b.name.split(' ')[0]}</strong> wird {b.age}
                  <span className={`birthday-until ${b.daysUntil <= 7 ? 'soon' : ''}`}>{untilLabel(b.daysUntil)}</span>
                </li>
              ))}
            </ul>
          </NavCard>
        )}

        {choresSoon.length > 0 && (
          <NavCard to="/dienste">
            <header className="section-header">
              <h2><Icon name="chore" size={18} /> Dienste heute & morgen</h2>
              <span className="spacer" />
              <More />
            </header>
            <ul className="chore-list">
              {choresSoon.map((o) => (
                <ChoreRow key={`${o.chore.id}-${o.date}`} occ={o} showTitle onDone={(d) => void chores.setDone(o, d)} />
              ))}
            </ul>
          </NavCard>
        )}

        <NavCard to="/essen">
          <header className="section-header">
            <h2><Icon name="meal" size={18} /> Heute auf dem Tisch</h2>
            <span className="spacer" />
            <More />
          </header>
          {todaysMeals.length === 0 ? (
            <EmptyState icon="meal" title="Noch nichts geplant" />
          ) : (
            <ul className="plain-list">
              {(['breakfast', 'lunch', 'dinner'] as const).map((slot) => {
                const meal = todaysMeals.find((m) => m.slot === slot);
                return meal && <li key={slot}><small className="muted">{SLOT_LABEL[slot]}</small> {meal.title}</li>;
              })}
            </ul>
          )}
        </NavCard>

        <NavCard to="/pinnwand" className="span-2">
          <header className="section-header">
            <h2><Icon name="chat" size={18} /> Pinnwand</h2>
            <span className="spacer" />
            <More />
          </header>
          {latestPosts.length === 0 ? (
            <EmptyState icon="chat" title="Noch keine Beiträge" />
          ) : (
            latestPosts.map((p) => (
              <PostCard key={p.id} post={p} poll={polls.forPost(p.id)} onVote={(optionId) => {
                const poll = polls.forPost(p.id);
                if (poll) void polls.vote(poll, optionId);
              }} />
            ))
          )}
        </NavCard>
      </div>
      {toast}
    </div>
  );
}
