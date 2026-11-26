// Google Kalender (oder jeder andere Kalender mit iCal-Adresse) in FamilyConnect anzeigen.
// Jeder verbindet seine eigenen Kalender über die geheime iCal-Adresse; pro Kalender legt er fest, wer die Termine
// sieht: nur er selbst, die ganze Familie oder ausgewählte Personen. Der Server holt die Termine alle 15 Minuten
// und legt jedes Vorkommen als eigenen Termin an (events.feed_id) – in der App nur zum Ansehen, geändert wird im
// Google Kalender. Die geheime Adresse sieht nur der Besitzer.
import ICAL from 'ical.js';
import { Router } from 'express';

const VISIBILITY = ['private', 'family', 'custom'];
const PAST_DAYS = 60;
const FUTURE_DAYS = 400;
const MAX_OCCURRENCES = 3000;
const MAX_BYTES = 5 * 1024 * 1024;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateKey = (d) => stamp(d).slice(0, 10);
const json = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

/** Termine, die dieser Nutzer nicht sehen darf: Feed-IDs */
export function hiddenFeedIds(db, familyId, userId) {
  const feeds = db.prepare('SELECT id, owner_id, visibility, viewer_ids FROM calendar_feeds WHERE family_id = ?').all(familyId);
  return new Set(feeds.filter((f) => f.owner_id !== userId && (f.visibility === 'private' || (f.visibility === 'custom' && !json(f.viewer_ids, []).includes(userId)))).map((f) => f.id));
}

/** Für das Wanddisplay (sieht jeder): nur Kalender, die die ganze Familie sehen darf */
export function wallHiddenFeedIds(db, familyId) {
  return new Set(db.prepare("SELECT id FROM calendar_feeds WHERE family_id = ? AND visibility != 'family'").all(familyId).map((f) => f.id));
}

export function eventVisible(db, event, userId) {
  return !event?.feed_id || !hiddenFeedIds(db, event.family_id, userId).has(event.feed_id);
}

/**
 * iCal-Text → einzelne Vorkommen im Zeitraum [from, to]: { name, events: [{ uid, title, start, end, all_day, location, description }] }
 * Serien (auch „jeden 2. Dienstag“), Ausnahmen (verschobene Einzeltermine) und gelöschte Termine werden berücksichtigt.
 */
export function parseFeed(text, from, to) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // kaputte Zeitzone – Zeiten dann als Ortszeit
    }
  }
  const name = root.getFirstPropertyValue('x-wr-calname') ?? '';
  const masters = new Map();
  const singles = [];
  const exceptions = [];
  for (const comp of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(comp);
    if (!ev.startDate) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else if (ev.uid && !masters.has(ev.uid)) masters.set(ev.uid, ev);
    else singles.push(ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else singles.push(ex);
  }

  const out = [];
  const add = (uid, item, startTime, endTime) => {
    if (item.component.getFirstPropertyValue('status') === 'CANCELLED') return;
    const allDay = startTime.isDate;
    const start = startTime.toJSDate();
    let end = endTime ? endTime.toJSDate() : new Date(start.getTime() + (allDay ? 86_400_000 : 3_600_000));
    if (end < from || start > to) return;
    let startKey = stamp(start);
    let endKey = stamp(end);
    if (allDay) {
      // Ende ist bei ganztägigen Terminen der Folgetag
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      startKey = `${dateKey(start)}T00:00`;
      endKey = `${dateKey(last < start ? start : last)}T23:59`;
    }
    if (endKey < startKey) endKey = startKey;
    out.push({
      uid: `${uid}|${startKey}`.slice(0, 500),
      title: String(item.summary || '(ohne Titel)').slice(0, 200),
      start: startKey,
      end: endKey,
      all_day: allDay,
      location: String(item.location ?? '').slice(0, 300),
      description: String(item.description ?? '').slice(0, 5000),
    });
  };

  for (const ev of [...masters.values(), ...singles]) {
    if (!ev.isRecurring()) {
      add(ev.uid || `${ev.summary}`, ev, ev.startDate, ev.endDate);
      continue;
    }
    const it = ev.iterator();
    let next;
    let n = 0;
    while ((next = it.next()) && n++ < 2000) {
      if (next.toJSDate() > to) break;
      const d = ev.getOccurrenceDetails(next);
      add(ev.uid, d.item, d.startDate, d.endDate);
      if (out.length >= MAX_OCCURRENCES) break;
    }
    if (out.length >= MAX_OCCURRENCES) break;
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  return { name, events: out };
}

/** Einen Kalender abholen und die Termine abgleichen (gleiche UID → aktualisieren, neue anlegen, weggefallene löschen) */
export async function syncFeed(db, feed, { fetchImpl = fetch, now = new Date(), publish } = {}) {
  const from = new Date(now.getTime() - PAST_DAYS * 86_400_000);
  const to = new Date(now.getTime() + FUTURE_DAYS * 86_400_000);
  let parsed;
  try {
    const res = await fetchImpl(feed.url, { headers: { Accept: 'text/calendar' }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 404 || res.status === 403 || res.status === 401) throw new Error('Google kennt diese Adresse nicht (mehr) – neue „Privatadresse im iCal-Format“ eintragen');
    if (!res.ok) throw new Error(`Der Kalender antwortet mit Fehler ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Der Kalender ist zu groß');
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Unter dieser Adresse liegt kein Kalender (iCal-Format)');
    parsed = parseFeed(text, from, to);
  } catch (err) {
    const message = err.name === 'TimeoutError' ? 'Der Kalender antwortet nicht' : err.message;
    db.prepare("UPDATE calendar_feeds SET last_error = ?, last_sync_at = datetime('now') WHERE id = ?").run(message, feed.id);
    return { ok: false, error: message };
  }

  const memberIds = feed.member_ids || '[]';
  const existing = new Map(db.prepare('SELECT id, source_uid, title, start, end, all_day, location, description FROM events WHERE feed_id = ?').all(feed.id).map((e) => [e.source_uid, e]));
  const seen = new Set();
  const insert = db.prepare(`INSERT INTO events (family_id, created_by, title, description, location, start, end, all_day, recurrence, member_ids, source, source_uid, feed_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?)`);
  const update = db.prepare('UPDATE events SET title = ?, description = ?, location = ?, start = ?, end = ?, all_day = ?, member_ids = ?, source = ? WHERE id = ?');
  let changes = 0;
  db.exec('BEGIN');
  try {
    for (const e of parsed.events) {
      if (seen.has(e.uid)) continue;
      seen.add(e.uid);
      const old = existing.get(e.uid);
      if (!old) {
        insert.run(feed.family_id, feed.owner_id, e.title, e.description, e.location, e.start, e.end, e.all_day ? 1 : 0, memberIds, feed.name, e.uid, feed.id);
        changes++;
      } else if (old.title !== e.title || old.start !== e.start || old.end !== e.end || Boolean(old.all_day) !== e.all_day || old.location !== e.location || old.description !== e.description) {
        update.run(e.title, e.description, e.location, e.start, e.end, e.all_day ? 1 : 0, memberIds, feed.name, old.id);
        changes++;
      }
    }
    // weggefallene Termine löschen – aber nur im abgeglichenen Zeitraum (ältere bleiben als Verlauf)
    const fromKey = stamp(from);
    for (const [uid, old] of existing) {
      if (!seen.has(uid) && old.end >= fromKey) {
        db.prepare('DELETE FROM events WHERE id = ?').run(old.id);
        changes++;
      }
    }
    db.prepare("UPDATE calendar_feeds SET last_error = NULL, last_sync_at = datetime('now'), event_count = ? WHERE id = ?").run(seen.size, feed.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  if (changes) publish?.(feed.family_id, 'events');
  return { ok: true, count: seen.size, changes };
}

export async function syncAllFeeds(db, options) {
  for (const feed of db.prepare('SELECT * FROM calendar_feeds').all()) {
    try {
      await syncFeed(db, feed, options);
    } catch (err) {
      console.error(`Kalender ${feed.id}: ${err.message}`);
    }
  }
}

export function calendarFeedsRouter(db, { auth, member, publish, fetchImpl = fetch }) {
  const router = Router();
  const base = '/api/families/:familyId/calendar-feeds';
  const own = (req) => db.prepare('SELECT * FROM calendar_feeds WHERE family_id = ? AND id = ? AND owner_id = ?').get(req.familyId, Number(req.params.id), req.user.id);
  const view = (f) => ({
    id: f.id, name: f.name, url: f.url, visibility: f.visibility, viewer_ids: json(f.viewer_ids, []), member_ids: json(f.member_ids, []),
    last_sync_at: f.last_sync_at, last_error: f.last_error, event_count: f.event_count,
  });
  const members = (familyId, list) => {
    if (!Array.isArray(list) || list.length > 30) return null;
    const ok = list.every((id) => Number.isInteger(id) && db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(familyId, id));
    return ok ? JSON.stringify([...new Set(list)]) : null;
  };
  /** geprüfte Felder aus dem Body; existing für PATCH */
  const clean = (req, existing) => {
    const b = req.body ?? {};
    const out = {};
    if (b.name !== undefined || !existing) {
      if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'Bitte einen Namen angeben (z. B. „Familie“)' };
      out.name = b.name.trim().slice(0, 60);
    }
    if (b.url !== undefined || !existing) {
      const url = typeof b.url === 'string' ? b.url.trim().replace(/^webcal:\/\//i, 'https://') : '';
      if (!/^https:\/\/\S{8,1500}$/.test(url)) return { error: 'Bitte die iCal-Adresse einfügen (beginnt mit https:// und endet meist auf .ics)' };
      out.url = url;
    }
    if (b.visibility !== undefined || !existing) {
      if (!VISIBILITY.includes(b.visibility)) return { error: 'Bitte auswählen, wer die Termine sehen darf' };
      out.visibility = b.visibility;
    }
    for (const key of ['viewer_ids', 'member_ids']) {
      if (b[key] === undefined) continue;
      const value = members(req.familyId, b[key]);
      if (value === null) return { error: 'Unbekanntes Familienmitglied' };
      out[key] = value;
    }
    return { out };
  };

  router.get(base, auth, member, (req, res) => {
    res.json(db.prepare('SELECT * FROM calendar_feeds WHERE family_id = ? AND owner_id = ? ORDER BY id').all(req.familyId, req.user.id).map(view));
  });

  router.post(base, auth, member, async (req, res) => {
    const { out, error } = clean(req, null);
    if (error) return res.status(400).json({ error });
    if (db.prepare('SELECT COUNT(*) AS n FROM calendar_feeds WHERE family_id = ? AND owner_id = ?').get(req.familyId, req.user.id).n >= 10) {
      return res.status(400).json({ error: 'Höchstens 10 Kalender pro Person' });
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO calendar_feeds (family_id, owner_id, name, url, visibility, viewer_ids, member_ids) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.familyId, req.user.id, out.name, out.url, out.visibility, out.viewer_ids ?? '[]', out.member_ids ?? JSON.stringify([req.user.id]));
    const feed = db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(lastInsertRowid);
    const result = await syncFeed(db, feed, { fetchImpl, publish });
    res.status(201).json({ ...view(db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(feed.id)), sync: result });
  });

  router.patch(`${base}/:id`, auth, member, async (req, res) => {
    const feed = own(req);
    if (!feed) return res.status(404).json({ error: 'Kalender nicht gefunden' });
    const { out, error } = clean(req, feed);
    if (error) return res.status(400).json({ error });
    if (Object.keys(out).length) {
      db.prepare(`UPDATE calendar_feeds SET ${Object.keys(out).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(out), feed.id);
    }
    const updated = db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(feed.id);
    // Name und Personen auch an den Terminen ändern; neue Adresse → neu abgleichen
    db.prepare('UPDATE events SET source = ?, member_ids = ? WHERE feed_id = ?').run(updated.name, updated.member_ids, feed.id);
    if (out.url) await syncFeed(db, updated, { fetchImpl, publish });
    publish(req.familyId, 'events');
    res.json(view(db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(feed.id)));
  });

  router.post(`${base}/:id/sync`, auth, member, async (req, res) => {
    const feed = own(req);
    if (!feed) return res.status(404).json({ error: 'Kalender nicht gefunden' });
    const result = await syncFeed(db, feed, { fetchImpl, publish });
    res.json({ ...view(db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(feed.id)), sync: result });
  });

  router.delete(`${base}/:id`, auth, member, (req, res) => {
    const feed = own(req);
    if (!feed) return res.status(404).json({ error: 'Kalender nicht gefunden' });
    db.prepare('DELETE FROM events WHERE feed_id = ?').run(feed.id);
    db.prepare('DELETE FROM calendar_feeds WHERE id = ?').run(feed.id);
    publish(req.familyId, 'events');
    res.status(204).end();
  });

  return router;
}
