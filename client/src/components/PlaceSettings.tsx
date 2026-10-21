import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { formatTimestamp } from '../dates';
import { Geofence, canUseGeofence, syncGeofences, type GeofenceState } from '../geofence';
import { DEFAULT_RADIUS, PLACE_ICONS, usePlaces, type Place, type PlacePref } from '../places';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { useAsync } from './useAsync';

type Places = ReturnType<typeof usePlaces>;
const mapsLink = (p: Pick<Place, 'lat' | 'lon'>) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

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
          <span>Adresse</span>
          {spot && (
            <p className="place-spot">
              <Icon name="pin" size={16} /> <span>{spot.address || `${spot.lat}, ${spot.lon}`}</span>
              <a href={mapsLink(spot)} target="_blank" rel="noopener noreferrer" className="link-button">Karte</a>
            </p>
          )}
          <div className="row align-end">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={spot ? 'Andere Adresse suchen …' : 'Straße Nr., Ort'} aria-label="Adresse suchen"
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
          <button type="button" className="link-button place-here" onClick={here}><Icon name="pin" size={16} /> Ich bin gerade hier</button>
        </div>
        <label>
          Radius: {radius} m
          <input type="range" min={30} max={500} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
          {radius < 100 && <small className="hint">Klein = genau, aber Android meldet erst ab ca. 100 m wirklich zuverlässig. Bleibt eine Meldung aus, den Radius etwas vergrößern.</small>}
        </label>
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

  if (!native) {
    return (
      <p className="hint">
        {sharing ? 'Du teilst deine Ankunft – das Handy mit der Android-App meldet sie. ' : ''}
        Ankommen und Losgehen meldet die <b>Android-App</b> (ab Version 2.5). Benachrichtigungen über andere kannst du hier trotzdem einstellen.
        {sharing && <button className="link-button" onClick={() => void run(() => places.setSharing(false))}> Teilen ausschalten</button>}
      </p>
    );
  }
  return (
    <div className="place-sharing">
      <label className="checkbox">
        <input type="checkbox" checked={sharing} disabled={busy}
          onChange={(e) => (e.target.checked ? enable() : void run(async () => { await places.setSharing(false); await Geofence.stop(); }))} />
        <span>
          <strong>Meine Ankunft und Abfahrt an diesen Orten teilen</strong>
          <small className="muted"> Andere sehen dann „angekommen / losgegangen“ – nie deinen genauen Standort oder Weg.</small>
        </span>
      </label>
      {sharing && state && !state.background && (
        <p className="warning-line">
          ⚠️ Damit es auch bei geschlossener App klappt, braucht die App „<b>Immer erlauben</b>“ beim Standort.
          <button className="button small" onClick={() => void run(async () => setState(await Geofence.requestBackground()))}>Berechtigung ändern</button>
        </p>
      )}
      {sharing && state && !state.available && <p className="error">Auf diesem Gerät fehlen die Google-Play-Dienste – Orte funktionieren hier nicht.</p>}
      {sharing && state?.background && <p className="success">✓ Aktiv – Android meldet Ankommen und Losgehen.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Wann möchte ICH Bescheid bekommen? Je Person und Ort: Ankommen / Losgehen, optional Zeitfenster */
export function PlaceNotifications({ places }: { places: Places }) {
  const { user, family } = useFamily();
  const data = places.data;
  const [prefs, setPrefs] = useState<PlacePref[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [openWindow, setOpenWindow] = useState<string | null>(null);
  const { busy, error, run } = useAsync();
  useEffect(() => {
    if (data && prefs === null) setPrefs(data.prefs);
  }, [data, prefs]);
  if (!data || !prefs) return null;
  if (data.places.length === 0) return <p className="muted">Sobald Orte angelegt sind, kannst du hier auswählen, worüber du Bescheid bekommst.</p>;

  const others = family.members.filter((m) => m.id !== user.id && !m.managed);
  const get = (memberId: number, placeId: number) =>
    prefs.find((p) => p.member_id === memberId && p.place_id === placeId)
    ?? { member_id: memberId, place_id: placeId, arrive: false, leave: false, weekdays_only: false, from_time: null, to_time: null };
  const set = (pref: PlacePref) => {
    setSaved(false);
    setPrefs([...prefs.filter((p) => !(p.member_id === pref.member_id && p.place_id === pref.place_id)), pref]);
  };

  return (
    <div className="place-prefs">
      {others.map((m) => (
        <div key={m.id} className="place-pref-person">
          <h4><Avatar member={m} size={24} /> {m.name.split(' ')[0]} {!data.sharing.includes(m.id) && <small className="muted">· teilt noch nicht</small>}</h4>
          {data.places.map((pl) => {
            const p = get(m.id, pl.id);
            const key = `${m.id}-${pl.id}`;
            return (
              <div key={pl.id} className="place-pref-row">
                <span className="place-pref-name">{pl.icon} {pl.name}</span>
                <span className="place-pref-toggles">
                  <button type="button" className={`chip ${p.arrive ? 'chip-active' : ''}`} aria-pressed={p.arrive} onClick={() => set({ ...p, arrive: !p.arrive })}>Ankommen</button>
                  <button type="button" className={`chip ${p.leave ? 'chip-active' : ''}`} aria-pressed={p.leave} onClick={() => set({ ...p, leave: !p.leave })}>Losgehen</button>
                  {(p.arrive || p.leave) && (
                    <button type="button" className={`icon-button subtle ${p.from_time || p.weekdays_only ? 'is-set' : ''}`} aria-label="Zeitfenster" title="Zeitfenster"
                      onClick={() => setOpenWindow(openWindow === key ? null : key)}>⏰</button>
                  )}
                </span>
                {openWindow === key && (p.arrive || p.leave) && (
                  <div className="place-pref-window">
                    <label className="checkbox">
                      <input type="checkbox" checked={p.weekdays_only} onChange={(e) => set({ ...p, weekdays_only: e.target.checked })} /> nur Mo–Fr
                    </label>
                    <label className="checkbox">
                      <input type="checkbox" checked={Boolean(p.from_time)} onChange={(e) => set({ ...p, from_time: e.target.checked ? '07:00' : null, to_time: e.target.checked ? '09:00' : null })} /> nur von
                    </label>
                    {p.from_time && (
                      <>
                        <input type="time" value={p.from_time} onChange={(e) => set({ ...p, from_time: e.target.value })} aria-label="von" />
                        bis
                        <input type="time" value={p.to_time ?? ''} onChange={(e) => set({ ...p, to_time: e.target.value })} aria-label="bis" />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">Gespeichert</p>}
      <button className="button primary" disabled={busy} onClick={() => void run(async () => {
        await places.savePrefs(prefs.filter((p) => p.arrive || p.leave));
        setSaved(true);
      })}>
        <Icon name="check" size={18} /> Benachrichtigungen speichern
      </button>
    </div>
  );
}
