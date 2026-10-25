import { Suspense, lazy, useEffect, useState, type ComponentProps, type FormEvent } from 'react';
import { api } from '../api';
import { formatTimestamp } from '../dates';
import { Geofence, MIN_GEOFENCE_RADIUS, canUseGeofence, syncGeofences, type GeofenceState } from '../geofence';
import { DEFAULT_RADIUS, PLACE_ICONS, usePlaces, type Place, type PlacePref } from '../places';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { useAsync } from './useAsync';

type Places = ReturnType<typeof usePlaces>;

// Karte (Leaflet) erst laden, wenn sie gebraucht wird
const LazyMap = lazy(() => import('./PlaceMap').then((m) => ({ default: m.PlaceMap })));
function PlaceMap(props: ComponentProps<typeof LazyMap>) {
  return (
    <Suspense fallback={<div className="place-map" style={{ height: props.height ?? 260 }} />}>
      <LazyMap {...props} />
    </Suspense>
  );
}

/** Ort anlegen/bearbeiten: Adresse suchen oder aktuellen Standort nehmen, Radius (Standard 50 m) */
function PlaceForm({ place, places, onClose }: { place?: Place; places: Places; onClose(): void }) {
  const [name, setName] = useState(place?.name ?? '');
  const [icon, setIcon] = useState(place?.icon ?? '📍');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ label: string; lat: number; lon: number }[] | null>(null);
  const [spot, setSpot] = useState(place ? { address: place.address, lat: place.lat, lon: place.lon } : null);
  const [radius, setRadius] = useState(place?.radius ?? DEFAULT_RADIUS);
  const { busy, error, run, setError } = useAsync();

  const search = () =>
    void run(async () => setResults(await api(`${places.base}/search?q=${encodeURIComponent(query.trim())}`)));
  const here = () => {
    if (!navigator.geolocation) return setError('Standort nicht verfügbar');
    navigator.geolocation.getCurrentPosition(
      (pos) => setSpot({ address: `Standort (± ${Math.round(pos.coords.accuracy)} m)`, lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lon: Math.round(pos.coords.longitude * 1e6) / 1e6 }),
      () => setError('Standort konnte nicht ermittelt werden – Berechtigung erlaubt?'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!spot) return setError('Bitte eine Adresse suchen oder den aktuellen Standort nehmen');
    void run(async () => {
      await places.save({ id: place?.id, name, icon, radius, ...spot });
      onClose();
    });
  };

  return (
    <Modal title={place ? 'Ort bearbeiten' : 'Neuer Ort'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Schule" maxLength={50} required autoFocus /></label>
        <div className="field">
          <span>Symbol</span>
          <div className="emoji-picker">
            {PLACE_ICONS.map((i) => (
              <button type="button" key={i} className={`emoji ${icon === i ? 'active' : ''}`} aria-pressed={icon === i} onClick={() => setIcon(i)}>{i}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Wo? <small className="hint">Adresse suchen, auf die Karte tippen oder das Symbol verschieben</small></span>
          <div className="row align-end">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Straße Nr., Ort" aria-label="Adresse suchen"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (query.trim().length >= 3) search(); } }} />
            <button type="button" className="button" disabled={busy || query.trim().length < 3} onClick={search}><Icon name="search" size={18} /> Suchen</button>
          </div>
          {results && (results.length === 0 ? <p className="muted">Nichts gefunden – mit Ort oder PLZ versuchen</p> : (
            <ul className="place-results">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button type="button" className="link-button" onClick={() => { setSpot({ address: r.label, lat: r.lat, lon: r.lon }); setResults(null); setQuery(''); }}>
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          ))}
          <div className="place-map-wrap">
            <PlaceMap
              places={(places.data?.places ?? []).filter((p) => p.id !== place?.id)}
              editing={spot ? { id: place?.id ?? -1, lat: spot.lat, lon: spot.lon, radius, icon } : null}
              center={spot ? [spot.lat, spot.lon] : places.data?.places[0] ? [places.data.places[0].lat, places.data.places[0].lon] : null}
              onPick={(lat, lon) => setSpot({ address: 'Punkt auf der Karte', lat, lon })}
            />
            {!spot && <span className="place-map-hint">Tippe auf die Karte, wo der Ort ist</span>}
          </div>
          <div className="place-spot-row">
            {spot && <span className="place-spot"><Icon name="pin" size={16} /> <span>{spot.address || `${spot.lat}, ${spot.lon}`}</span></span>}
            <button type="button" className="link-button place-here" onClick={here}><Icon name="pin" size={16} /> Ich bin gerade hier</button>
          </div>
        </div>
        <div className="field">
          <span>Radius – so groß ist der Kreis, in dem „angekommen“ gilt: <b>{radius} m</b></span>
          <input type="range" min={30} max={500} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Radius" />
          <div className="radius-chips">
            {[50, 100, 150, 250].map((r) => (
              <button type="button" key={r} className={`chip ${radius === r ? 'chip-active' : ''}`} onClick={() => setRadius(r)}>
                {r} m{r === 50 ? ' · Haus' : r === 150 ? ' · Schule' : r === 250 ? ' · Gelände' : ''}
              </button>
            ))}
          </div>
          {radius < MIN_GEOFENCE_RADIUS && (
            <small className="hint">
              Auf dem Handy gilt mindestens {MIN_GEOFENCE_RADIUS} m – darunter springt der Standort im Haus zu leicht aus dem Kreis
              und es käme „losgegangen“, obwohl niemand weg ist.
            </small>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {place && (
            <button type="button" className="button danger" disabled={busy}
              onClick={() => confirm(`„${place.name}“ löschen?`) && void run(async () => { await places.remove(place.id); onClose(); })}>
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

/** Orte der Familie (anlegen: Eltern) mit „wer ist gerade wo“ */
export function PlacesManager({ places }: { places: Places }) {
  const { member } = useFamily();
  const { isManager } = usePermissions();
  const [editing, setEditing] = useState<Place | 'new' | null>(null);
  const data = places.data;
  if (!data) return <p className="muted">Lade …</p>;

  return (
    <div className="places">
      {data.places.length > 0 && (
        <PlaceMap places={data.places} onSelect={isManager ? (p) => setEditing(data.places.find((x) => x.id === p.id) ?? null) : undefined} height={220} />
      )}
      {data.places.length === 0 && <p className="muted">Noch keine Orte. {isManager ? 'Leg z. B. Zuhause, Schule und Arbeit an.' : 'Orte legen die Eltern an.'}</p>}
      <ul className="place-list">
        {data.places.map((p) => {
          const here = data.presence.filter((x) => x.place_id === p.id);
          return (
            <li key={p.id} className="place-row">
              <span className="place-icon" aria-hidden>{p.icon}</span>
              <span className="place-info">
                <strong>{p.name}</strong>
                <small className="muted">{p.address || `${p.lat}, ${p.lon}`} · {p.radius} m</small>
                {here.map((x) => (
                  <small key={x.user_id} className="place-here-now">
                    {member(x.user_id)?.name.split(' ')[0]} ist hier · seit {formatTimestamp(x.changed_at)}
                  </small>
                ))}
              </span>
              {isManager && (
                <button className="icon-button subtle" aria-label={`${p.name} bearbeiten`} onClick={() => setEditing(p)}><Icon name="edit" size={18} /></button>
              )}
            </li>
          );
        })}
      </ul>
      {isManager && <button className="button" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Ort hinzufügen</button>}
      {editing && <PlaceForm place={editing === 'new' ? undefined : editing} places={places} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Eigene Ankunft/Abfahrt teilen – mit Berechtigungen der Android-App */
export function PlaceSharing({ places }: { places: Places }) {
  const { user, family } = useFamily();
  const [state, setState] = useState<GeofenceState | null>(null);
  const { busy, error, run, setError } = useAsync();
  const native = canUseGeofence();
  const sharing = Boolean(places.data?.sharing.includes(user.id));

  useEffect(() => {
    if (native) void Geofence.status().then(setState).catch(() => {});
  }, [native, sharing]);

  const enable = () => void run(async () => {
    let s = await Geofence.requestForeground();
    if (!s.foreground) return setError('Ohne Standort-Berechtigung geht es nicht');
    s = await Geofence.requestBackground();
    setState(s);
    await places.setSharing(true);
    if (places.data) await syncGeofences(family.id, places.data.places);
    setState(await Geofence.status());
  });

  const toggle = (on: boolean) => (on ? enable() : void run(async () => { await places.setSharing(false); if (native) await Geofence.stop(); }));
  const status = !sharing
    ? { cls: 'off', text: 'Aus – niemand bekommt Meldungen über dich.' }
    : !native
      ? { cls: 'warn', text: 'An – gemeldet wird vom Handy mit der Android-App (ab Version 2.5).' }
      : state && !state.available
        ? { cls: 'warn', text: 'Auf diesem Gerät fehlen die Google-Play-Dienste – hier funktioniert es nicht.' }
        : state && !state.background
          ? { cls: 'warn', text: 'Fast fertig: beim Standort „Immer erlauben“ wählen, sonst klappt es nur bei offener App.' }
          : { cls: 'on', text: 'Aktiv – Android meldet, wenn du an einem Ort ankommst oder losgehst.' };

  return (
    <div className={`share-card ${sharing ? 'on' : ''}`}>
      <label className="share-row">
        <span className="share-icon" aria-hidden>📡</span>
        <span className="share-text">
          <strong>Mein Ankommen und Losgehen teilen</strong>
          <small className="muted">Die Familie sieht nur „angekommen / losgegangen“ – nie deinen genauen Standort oder Weg.</small>
        </span>
        <input type="checkbox" className="switch" checked={sharing} disabled={busy || (!native && !sharing)} onChange={(e) => toggle(e.target.checked)} aria-label="Teilen" />
      </label>
      <p className={`share-status ${status.cls}`}>{status.text}</p>
      {!native && !sharing && <small className="hint">Einschalten geht in der Android-App. Was du über andere wissen möchtest, kannst du hier trotzdem einstellen.</small>}
      {native && sharing && state && !state.background && (
        <button className="button small" onClick={() => void run(async () => setState(await Geofence.requestBackground()))}>Berechtigung „Immer erlauben“ öffnen</button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

const EMPTY = { arrive: false, leave: false, weekdays_only: false, from_time: null, to_time: null };

/** „Mo–Fr · 7–9 Uhr“ bzw. „immer“ */
function scheduleLabel(p: PlacePref) {
  const days = p.weekdays_only ? 'Mo–Fr' : 'jeden Tag';
  const hours = p.from_time && p.to_time ? `${p.from_time.replace(/^0/, '')}–${p.to_time.replace(/^0/, '')} Uhr` : 'rund um die Uhr';
  return `${days} · ${hours}`;
}

/** Satz zur Kontrolle: „Du bekommst Bescheid, wenn Lea in der Schule ankommt und sie verlässt.“ */
function sentence(name: string, place: Place, p: PlacePref) {
  const what = [p.arrive && 'ankommt', p.leave && 'losgeht'].filter(Boolean).join(' oder ');
  return `${name} bei „${place.name}“ ${what}`;
}

/** Ein Ort für eine Person: zwei große Schalter (Ankommen / Losgehen) und das Zeitfenster */
function PrefCard({ name, place, pref, onChange }: { name: string; place: Place; pref: PlacePref; onChange(p: PlacePref): void }) {
  const [editingTime, setEditingTime] = useState(false);
  const on = pref.arrive || pref.leave;
  return (
    <div className={`pref-card ${on ? 'on' : ''}`}>
      <div className="pref-card-head">
        <span className="pref-card-icon" aria-hidden>{place.icon}</span>
        <strong>{place.name}</strong>
      </div>
      <div className="pref-toggles" role="group" aria-label={`${name} bei ${place.name}`}>
        <button type="button" className={`pref-toggle arrive ${pref.arrive ? 'active' : ''}`} aria-pressed={pref.arrive} onClick={() => onChange({ ...pref, arrive: !pref.arrive })}>
          <Icon name="arrive" size={18} />
          <span>Ankommen</span>
          <span className="pref-check" aria-hidden>{pref.arrive ? '✓' : ''}</span>
        </button>
        <button type="button" className={`pref-toggle leave ${pref.leave ? 'active' : ''}`} aria-pressed={pref.leave} onClick={() => onChange({ ...pref, leave: !pref.leave })}>
          <Icon name="leave" size={18} />
          <span>Losgehen</span>
          <span className="pref-check" aria-hidden>{pref.leave ? '✓' : ''}</span>
        </button>
      </div>
      {on && (
        <>
          <button type="button" className="pref-schedule" onClick={() => setEditingTime(!editingTime)} aria-expanded={editingTime}>
            ⏰ {scheduleLabel(pref)} <span className="muted">· ändern</span>
          </button>
          {editingTime && (
            <div className="pref-time">
              <div className="segmented" role="group" aria-label="Tage">
                <button type="button" className={!pref.weekdays_only ? 'active' : ''} onClick={() => onChange({ ...pref, weekdays_only: false })}>Jeden Tag</button>
                <button type="button" className={pref.weekdays_only ? 'active' : ''} onClick={() => onChange({ ...pref, weekdays_only: true })}>Nur Mo–Fr</button>
              </div>
              <div className="segmented" role="group" aria-label="Uhrzeit">
                <button type="button" className={!pref.from_time ? 'active' : ''} onClick={() => onChange({ ...pref, from_time: null, to_time: null })}>Rund um die Uhr</button>
                <button type="button" className={pref.from_time ? 'active' : ''} onClick={() => onChange({ ...pref, from_time: pref.from_time ?? '07:00', to_time: pref.to_time ?? '09:00' })}>Nur von … bis …</button>
              </div>
              {pref.from_time && (
                <div className="pref-hours">
                  <input type="time" value={pref.from_time} onChange={(e) => e.target.value && onChange({ ...pref, from_time: e.target.value })} aria-label="von" />
                  <span>bis</span>
                  <input type="time" value={pref.to_time ?? ''} onChange={(e) => e.target.value && onChange({ ...pref, to_time: e.target.value })} aria-label="bis" />
                </div>
              )}
            </div>
          )}
          <p className="pref-sentence">🔔 Du bekommst Bescheid, wenn {sentence(name, place, pref)} – {scheduleLabel(pref)}.</p>
        </>
      )}
    </div>
  );
}

/** Wann möchte ICH Bescheid bekommen? Je Person und Ort: Ankommen / Losgehen, optional Zeitfenster – speichert von selbst */
export function PlaceNotifications({ places }: { places: Places }) {
  const { user, family } = useFamily();
  const data = places.data;
  const [prefs, setPrefs] = useState<PlacePref[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [person, setPerson] = useState<number | null>(null);
  useEffect(() => {
    if (data && prefs === null) setPrefs(data.prefs);
  }, [data, prefs]);

  // kurz nach der letzten Änderung speichern
  const [dirty, setDirty] = useState(0);
  useEffect(() => {
    if (!dirty || !prefs) return;
    setStatus('saving');
    const t = setTimeout(() => {
      places.savePrefs(prefs.filter((p) => p.arrive || p.leave)).then(() => setStatus('saved'), () => setStatus('error'));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  if (!data || !prefs) return null;
  const others = family.members.filter((m) => m.id !== user.id && !m.managed);
  if (data.places.length === 0) return <p className="muted">Sobald Orte angelegt sind, kannst du hier auswählen, worüber du Bescheid bekommst.</p>;
  if (others.length === 0) return <p className="muted">Noch niemand sonst in der Familie hat die App.</p>;

  const selected = others.find((m) => m.id === person) ?? others[0];
  const get = (memberId: number, placeId: number): PlacePref =>
    prefs.find((p) => p.member_id === memberId && p.place_id === placeId) ?? { member_id: memberId, place_id: placeId, ...EMPTY };
  const set = (pref: PlacePref) => {
    setPrefs([...prefs.filter((p) => !(p.member_id === pref.member_id && p.place_id === pref.place_id)), pref]);
    setDirty((n) => n + 1);
  };
  const countFor = (id: number) => prefs.filter((p) => p.member_id === id && (p.arrive || p.leave)).length;
  const shares = data.sharing.includes(selected.id);
  const first = selected.name.split(' ')[0];

  return (
    <div className="place-prefs">
      <div className="pref-people" role="tablist" aria-label="Person">
        {others.map((m) => (
          <button key={m.id} role="tab" aria-selected={m.id === selected.id} className={`pref-person ${m.id === selected.id ? 'active' : ''}`}
            style={m.id === selected.id ? { borderColor: m.color } : undefined} onClick={() => setPerson(m.id)}>
            <Avatar member={m} size={30} />
            <span>{m.name.split(' ')[0]}</span>
            {countFor(m.id) > 0 && <span className="pref-count">{countFor(m.id)}</span>}
          </button>
        ))}
      </div>
      <p className={`pref-share-state ${shares ? 'yes' : 'no'}`}>
        {shares ? `✓ ${first} teilt Ankommen und Losgehen` : `${first} teilt noch nicht – Benachrichtigungen kommen, sobald ${first} es in der App einschaltet.`}
      </p>
      <div className="pref-cards">
        {data.places.map((pl) => (
          <PrefCard key={`${selected.id}-${pl.id}`} name={first} place={pl} pref={get(selected.id, pl.id)} onChange={set} />
        ))}
      </div>
      <small className={`pref-save ${status}`}>
        {status === 'saving' ? 'Speichere …' : status === 'saved' ? '✓ Gespeichert' : status === 'error' ? 'Konnte nicht speichern – bitte nochmal versuchen' : 'Änderungen werden automatisch gespeichert'}
      </small>
    </div>
  );
}
