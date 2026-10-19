import { Router } from 'express';
import { isManager } from './permissions.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

class ValidationError extends Error {}

function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

function emptyValue(spec) {
  switch (spec.type) {
    case 'text': return '';
    case 'bool': return 0;
    case 'enum': return spec.default ?? null;
    case 'members': return '[]';
    case 'dates': return '[]';
    default: return null;
  }
}

// Wandelt einen Eingabewert in den Datenbankwert um oder wirft ValidationError.
function coerce(name, spec, value, ctx) {
  if (value === undefined || value === null || value === '') {
    if (spec.required) throw new ValidationError(`Feld "${name}" fehlt`);
    return emptyValue(spec);
  }
  switch (spec.type) {
    case 'text': {
      if (typeof value !== 'string') throw new ValidationError(`Feld "${name}" muss Text sein`);
      const trimmed = value.trim();
      if (spec.required && !trimmed) throw new ValidationError(`Feld "${name}" fehlt`);
      if (spec.max && trimmed.length > spec.max) throw new ValidationError(`Feld "${name}" ist zu lang`);
      return trimmed;
    }
    case 'bool':
      if (typeof value !== 'boolean') throw new ValidationError(`Feld "${name}" muss wahr/falsch sein`);
      return value ? 1 : 0;
    case 'enum':
      if (!spec.values.includes(value)) throw new ValidationError(`Ungültiger Wert für "${name}"`);
      return value;
    case 'date':
      if (typeof value !== 'string' || !isValidDate(value)) throw new ValidationError(`Feld "${name}" muss ein Datum (JJJJ-MM-TT) sein`);
      return value;
    case 'datetime':
      if (typeof value !== 'string' || !DATETIME_RE.test(value) || !isValidDate(value.slice(0, 10)))
        throw new ValidationError(`Feld "${name}" muss Datum und Uhrzeit (JJJJ-MM-TTTHH:MM) sein`);
      return value;
    case 'int':
      if (!Number.isInteger(value) || value < spec.min || value > spec.max)
        throw new ValidationError(`Feld "${name}" muss eine Zahl von ${spec.min} bis ${spec.max} sein`);
      return value;
    case 'time':
      if (typeof value !== 'string' || !TIME_RE.test(value)) throw new ValidationError(`Feld "${name}" muss eine Uhrzeit (HH:MM) sein`);
      return value;
    case 'member':
      if (!ctx.isMember(value)) throw new ValidationError(`"${name}" ist kein Familienmitglied`);
      return value;
    case 'members': {
      if (!Array.isArray(value) || !value.every((id) => ctx.isMember(id)))
        throw new ValidationError(`"${name}" enthält Personen, die nicht zur Familie gehören`);
      return JSON.stringify([...new Set(value)]);
    }
    case 'dates': {
      if (!Array.isArray(value) || value.length > 1000 || !value.every((d) => typeof d === 'string' && isValidDate(d)))
        throw new ValidationError(`Feld "${name}" muss eine Liste von Daten sein`);
      return JSON.stringify([...new Set(value)].sort());
    }
    case 'list':
      if (!ctx.isList(value)) throw new ValidationError(`Liste "${value}" existiert nicht`);
      return value;
    case 'recipe':
      if (!ctx.isRecipe(value)) throw new ValidationError(`Rezept "${value}" existiert nicht`);
      return value;
    default:
      throw new Error(`Unbekannter Feldtyp ${spec.type}`);
  }
}

export { ValidationError, isValidDate };

export function serialize(resource, row) {
  if (!row) return row;
  const out = { ...row };
  for (const [name, spec] of Object.entries(resource.fields)) {
    if (spec.type === 'bool') out[name] = Boolean(out[name]);
    if (spec.type === 'members' || spec.type === 'dates') out[name] = JSON.parse(out[name]);
  }
  for (const name of resource.readOnlyBools ?? []) out[name] = Boolean(out[name]);
  delete out.family_id;
  return out;
}

/**
 * @param publish   Live-Update an alle Clients der Familie
 * @param onChange  optional, z. B. für Push-Benachrichtigungen: ({ action, path, row, before, user, familyId })
 */
export function crudRouter(db, resource, publish, onChange) {
  const router = Router({ mergeParams: true });
  const { table, fields } = resource;
  const names = Object.keys(fields);

  const context = (familyId) => ({
    isMember: (id) =>
      Number.isInteger(id) &&
      Boolean(db.prepare('SELECT 1 FROM memberships WHERE family_id = ? AND user_id = ?').get(familyId, id)),
    isList: (id) =>
      Number.isInteger(id) &&
      Boolean(db.prepare('SELECT 1 FROM lists WHERE family_id = ? AND id = ?').get(familyId, id)),
    isRecipe: (id) =>
      Number.isInteger(id) &&
      Boolean(db.prepare('SELECT 1 FROM recipes WHERE family_id = ? AND id = ?').get(familyId, id)),
  });

  const findOne = (familyId, id) =>
    db.prepare(`SELECT * FROM ${table} WHERE family_id = ? AND id = ?`).get(familyId, Number(id));

  const notify = (familyId) => {
    publish(familyId, resource.path);
    for (const other of resource.alsoChanges ?? []) publish(familyId, other);
  };

  const handle = (fn) => (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      if (err?.code === 'ERR_SQLITE_ERROR' && /UNIQUE/.test(err.message))
        return res.status(409).json({ error: resource.conflictMessage ?? 'Eintrag existiert bereits' });
      throw err;
    }
  };

  // Ergebnis der Validierung gegen den bisherigen Stand (bei PATCH) zusammenführen
  const validate = (body, existing, familyId) => {
    if (typeof body !== 'object' || body === null) throw new ValidationError('Ungültige Anfrage');
    const ctx = context(familyId);
    const row = {};
    for (const name of names) {
      if (existing && !(name in body)) row[name] = existing[name];
      else row[name] = coerce(name, fields[name], body[name], ctx);
    }
    const problem = resource.check?.(row);
    if (problem) throw new ValidationError(problem);
    resource.transform?.(row, existing);
    return row;
  };

  const ensureOwner = (req, res, row) => {
    if (resource.ownerOnly && row.created_by !== req.user.id && !isManager(req.role)) {
      res.status(403).json({ error: 'Nur der Ersteller darf das ändern' });
      return false;
    }
    return true;
  };

  /** Feste Regeln für alle Rollen (z. B. feste Einkaufsliste nicht löschen) */
  const guardAllowed = (res, action, existing, row) => {
    const problem = resource.guard?.({ action, existing, row });
    if (problem) res.status(403).json({ error: problem });
    return !problem;
  };

  /** Was Kinder dürfen, regelt `childRule` der Ressource; liefert true, wenn erlaubt */
  const childAllowed = (req, res, action, existing, row) => {
    if (req.role !== 'child' || !resource.childRule) return true;
    const problem = resource.childRule({ action, userId: req.user.id, body: req.body ?? {}, existing, row });
    if (problem) res.status(403).json({ error: problem });
    return !problem;
  };

  router.get('/', (req, res) => {
    const limit = resource.limit ? ` LIMIT ${resource.limit}` : '';
    const rows = db
      .prepare(`SELECT * FROM ${table} WHERE family_id = ? ORDER BY ${resource.order}${limit}`)
      .all(req.familyId);
    res.json(rows.map((r) => serialize(resource, r)));
  });

  router.post('/', handle((req, res) => {
    const row = validate(req.body, null, req.familyId);
    if (!childAllowed(req, res, 'create', null, row)) return;
    const cols = ['family_id', 'created_by', ...names];
    const result = db
      .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(req.familyId, req.user.id, ...names.map((n) => row[n]));
    notify(req.familyId);
    const created = serialize(resource, findOne(req.familyId, result.lastInsertRowid));
    onChange?.({ action: 'create', path: resource.path, row: created, before: null, user: req.user, familyId: req.familyId });
    res.status(201).json(created);
  }));

  router.patch('/:id', handle((req, res) => {
    const existing = findOne(req.familyId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!ensureOwner(req, res, existing)) return;
    const row = validate(req.body, existing, req.familyId);
    if (!guardAllowed(res, 'update', existing, row) || !childAllowed(req, res, 'update', existing, row)) return;
    db.prepare(`UPDATE ${table} SET ${names.map((n) => `${n} = ?`).join(', ')} WHERE id = ?`)
      .run(...names.map((n) => row[n]), existing.id);
    notify(req.familyId);
    const updated = serialize(resource, findOne(req.familyId, existing.id));
    onChange?.({ action: 'update', path: resource.path, row: updated, before: serialize(resource, existing), user: req.user, familyId: req.familyId });
    res.json(updated);
  }));

  router.delete('/:id', (req, res) => {
    const existing = findOne(req.familyId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!ensureOwner(req, res, existing)) return;
    if (!guardAllowed(res, 'delete', existing, null) || !childAllowed(req, res, 'delete', existing, null)) return;
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(existing.id);
    notify(req.familyId);
    res.status(204).end();
  });

  return router;
}
