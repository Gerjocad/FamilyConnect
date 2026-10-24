import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { NfcWriteButton } from '../components/NfcWriteButton';
import { useAsync } from '../components/useAsync';
import { MusicBoxes } from '../components/MusicBoxes';
import { musicUrl, useMusic, type MusicCard, type PlaylistHit, type Player, type SpotifyDevice } from '../music';
import { canWriteNfc } from '../nfcWriter';
import { usePermissions } from '../permissions';
import { useFamily } from '../session';

type Music = ReturnType<typeof useMusic>;
const EMOJIS = ['🎵', '🧸', '🎸', '🎹', '🛏️', '🚗', '🎉', '⚽', '🌙', '💃'];

/** Was läuft gerade – mit Pause/Weiter und Lautstärke */
function PlayerBar({ music }: { music: Music }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const { busy, error, run } = useAsync();
  const load = useCallback(() => music.player().then(setPlayer).catch(() => {}), [music]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const act = (action: Parameters<Music['control']>[0], value?: number) =>
    void run(async () => {
      await music.control(action, value);
      setTimeout(() => void load(), 600);
    });

  if (!player?.track) return null;
  return (
    <section className="card player-bar">
      {player.track.image ? <img src={player.track.image} alt="" className="player-cover" /> : <span className="player-cover">🎵</span>}
      <span className="player-info">
        <strong>{player.track.name}</strong>
        <small className="muted">{player.track.artists}</small>
        {player.device && <small className="muted">🔊 {player.device}{player.volume !== null && ` · ${player.volume} %`}</small>}
      </span>
      <span className="player-controls">
        <button className="icon-button" aria-label="Zurück" disabled={busy} onClick={() => act('previous')}>⏮</button>
        <button className="icon-button player-main" aria-label={player.playing ? 'Pause' : 'Weiter'} disabled={busy} onClick={() => act(player.playing ? 'pause' : 'resume')}>
          {player.playing ? '⏸' : '▶'}
        </button>
        <button className="icon-button" aria-label="Weiter" disabled={busy} onClick={() => act('next')}>⏭</button>
        {player.volume !== null && (
          <>
            <button className="icon-button" aria-label="Leiser" disabled={busy} onClick={() => act('volume', Math.max(0, (player.volume ?? 0) - 10))}>🔉</button>
            <button className="icon-button" aria-label="Lauter" disabled={busy} onClick={() => act('volume', Math.min(100, (player.volume ?? 0) + 10))}>🔊</button>
          </>
        )}
      </span>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** Lautsprecher wählen: automatisch (der gerade aktive) oder fest, z. B. der Google Home im Wohnzimmer */
function DeviceDialog({ music, onClose }: { music: Music; onClose(): void }) {
  const [devices, setDevices] = useState<SpotifyDevice[] | null>(null);
  const { busy, error, run } = useAsync();
  useEffect(() => {
    void run(async () => setDevices(await music.devices()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const current = music.status?.device?.id ?? null;
  const choose = (d: { id: string; name: string } | null) => void run(async () => { await music.setDevice(d); onClose(); });
  return (
    <Modal title="Lautsprecher" onClose={onClose}>
      <div className="form">
        <p className="muted">
          Spotify zeigt hier alle Geräte, die es gerade kennt. Fehlt dein Google Home, spiel einmal kurz über die Spotify-App darauf ab
          und tippe dann auf „Neu suchen“.
        </p>
        <ul className="device-list">
          <li>
            <button type="button" className={`device ${current === null ? 'active' : ''}`} disabled={busy} onClick={() => choose(null)}>
              <span>✨</span><span><strong>Automatisch</strong><small className="muted">das Gerät, das zuletzt Spotify gespielt hat</small></span>
            </button>
          </li>
          {devices?.map((d) => (
            <li key={d.id}>
              <button type="button" className={`device ${current === d.id ? 'active' : ''}`} disabled={busy} onClick={() => choose({ id: d.id, name: d.name })}>
                <span>{d.type === 'Smartphone' ? '📱' : d.type === 'Computer' ? '💻' : '🔊'}</span>
                <span><strong>{d.name}</strong><small className="muted">{d.type}{d.active ? ' · spielt gerade' : ''}</small></span>
              </button>
            </li>
          ))}
          {devices && devices.length === 0 && <li className="muted">Spotify kennt gerade kein Gerät.</li>}
        </ul>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button" disabled={busy} onClick={() => void run(async () => setDevices(await music.devices()))}>
            <Icon name="repeat" size={16} /> Neu suchen
          </button>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </Modal>
  );
}

/** Karte anlegen/bearbeiten: Playlist suchen oder Link einfügen; NFC-Aufkleber beschreiben */
function CardForm({ card, music, onClose }: { card?: MusicCard; music: Music; onClose(): void }) {
  const [name, setName] = useState(card?.name ?? '');
  const [emoji, setEmoji] = useState(card?.emoji ?? '🎵');
  const [shuffle, setShuffle] = useState(card?.shuffle ?? false);
  const [pick, setPick] = useState<PlaylistHit | null>(card ? { uri: card.uri, name: card.name, image: card.image, owner: '' } : null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaylistHit[] | null>(null);
  const { busy, error, run } = useAsync();
  const search = useAsync();
  const first = useRef(true);

  // eigene Playlists gleich zeigen, danach beim Tippen suchen
  useEffect(() => {
    const t = setTimeout(() => void search.run(async () => setHits(await music.search(query.trim()))), first.current ? 0 : 450);
    first.current = false;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pick) return;
    void run(async () => {
      await music.save({ id: card?.id, name: name.trim() || pick.name, uri: pick.uri, image: pick.image, emoji, shuffle });
      onClose();
    });
  };

  return (
    <Modal title={card ? 'Musik-Karte bearbeiten' : 'Neue Musik-Karte'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <span>Playlist</span>
          {pick && (
            <div className="playlist-pick">
              {pick.image ? <img src={pick.image} alt="" /> : <span className="playlist-noimg">{emoji}</span>}
              <span><strong>{pick.name}</strong>{pick.owner && <small className="muted">von {pick.owner}</small>}</span>
            </div>
          )}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Playlist suchen oder Spotify-Link einfügen" aria-label="Playlist suchen" />
          {search.error && <p className="error">{search.error}</p>}
          {hits && (
            <ul className="playlist-hits">
              {hits.map((h) => (
                <li key={h.uri}>
                  <button type="button" className={pick?.uri === h.uri ? 'active' : ''} onClick={() => { setPick(h); if (!name.trim() || name === pick?.name) setName(h.name); }}>
                    {h.image ? <img src={h.image} alt="" /> : <span className="playlist-noimg">🎵</span>}
                    <span><strong>{h.name}</strong>{h.owner && <small className="muted">{h.owner}</small>}</span>
                  </button>
                </li>
              ))}
              {hits.length === 0 && <li className="muted">Nichts gefunden – oder den Link aus Spotify einfügen (Teilen → Link kopieren)</li>}
            </ul>
          )}
        </div>
        <label>Name auf der Karte<input value={name} onChange={(e) => setName(e.target.value)} placeholder={pick?.name ?? 'z. B. Einschlafmusik'} maxLength={80} /></label>
        <div className="field">
          <span>Symbol</span>
          <div className="emoji-picker">
            {EMOJIS.map((e) => (
              <button type="button" key={e} className={`emoji ${emoji === e ? 'active' : ''}`} aria-pressed={emoji === e} onClick={() => setEmoji(e)}>{e}</button>
            ))}
          </div>
        </div>
        <label className="checkbox"><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> Zufällige Reihenfolge</label>
        {card && (
          <div className="nfc-box">
            <strong><Icon name="nfc" size={18} /> NFC-Aufkleber / Karte</strong>
            <p className="muted">Handy an den Aufkleber halten → die Playlist startet auf dem Lautsprecher.</p>
            {canWriteNfc() ? <NfcWriteButton uri={musicUrl(card)} /> : <code className="nfc-url">{musicUrl(card)}</code>}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {card && (
            <button type="button" className="button danger" disabled={busy} onClick={() => confirm(`„${card.name}“ löschen?`) && void run(async () => { await music.remove(card.id); onClose(); })}>
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button className="button primary" disabled={busy || !pick}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

/** Einrichtung: Spotify-Zugang auf dem Server fehlt bzw. Konto noch nicht verbunden */
function Setup({ music }: { music: Music }) {
  const { family, user } = useFamily();
  const isAdmin = family.members.find((m) => m.id === user.id)?.role === 'admin';
  const { busy, error, run } = useAsync();
  const [copied, setCopied] = useState(false);
  const status = music.status!;
  if (!isAdmin) return <EmptyState icon="music" title="Musik ist noch nicht eingerichtet"><p className="muted">Ein Admin muss Spotify einmal verbinden.</p></EmptyState>;
  if (!status.configured) {
    return (
      <section className="card music-setup">
        <h2>🎵 Spotify einrichten</h2>
        <p>Auf dem Server fehlt noch der Spotify-Zugang. Die Schritte stehen in <b>deploy/SPOTIFY.md</b> – in Kürze:</p>
        <ol>
          <li>Auf <b>developer.spotify.com</b> mit deinem Spotify-Konto anmelden → <b>Create app</b>.</li>
          <li>Als <b>Redirect URI</b> genau diese Adresse eintragen: <code>{status.redirect_uri}</code></li>
          <li>Haken bei <b>Web API</b>, speichern. <b>Client ID</b> und <b>Client secret</b> direkt auf dem Server in <code>/etc/familyconnect/spotify.json</code> ablegen.</li>
        </ol>
      </section>
    );
  }
  return (
    <section className="card music-setup">
      <h2>🎵 Mit Spotify verbinden</h2>
      <p className="muted">Steht im Spotify-Dashboard unter „Redirect URIs“ genau diese Adresse?</p>
      <p className="music-redirect">
        <code>{status.redirect_uri}</code>
        <button type="button" className="button small" onClick={() => void navigator.clipboard?.writeText(status.redirect_uri).then(() => setCopied(true))}>
          <Icon name="copy" size={16} /> {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </p>
      <button className="button primary" disabled={busy} onClick={() => void run(async () => { location.href = await music.connect(); })}>
        Mit Spotify verbinden
      </button>
      <small className="hint">Dafür braucht es Spotify Premium. Die Anmeldung öffnet sich im Browser – danach zurück in die App.</small>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function MusicPage() {
  const music = useMusic();
  const { family, user } = useFamily();
  const { isManager } = usePermissions();
  const isAdmin = family.members.find((m) => m.id === user.id)?.role === 'admin';
  const [editing, setEditing] = useState<MusicCard | 'new' | null>(null);
  const [devices, setDevices] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);

  const play = async (card: MusicCard) => {
    setPlaying(card.id);
    setMessage(null);
    try {
      const res = await music.play(card.id);
      setMessage({ ok: true, text: `▶ „${card.name}“ läuft auf ${res.device}` });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setPlaying(null);
    }
  };

  const status = music.status;
  return (
    <div className="page">
      <header className="page-header">
        <h1>Musik</h1>
        {status?.connected && isManager && <button className="button primary" onClick={() => setEditing('new')}><Icon name="plus" /> Karte</button>}
      </header>

      {!status ? <p className="muted">Lade …</p> : !status.connected ? <Setup music={music} /> : (
        <>
          <div className="music-status">
            <button type="button" className="link-button" onClick={() => setDevices(true)}>
              🔊 Lautsprecher: <b>{status.device?.name ?? 'automatisch'}</b> · ändern
            </button>
            <small className="muted">Spotify: {status.account?.name}{status.account && !status.account.premium && ' – ohne Premium geht keine Fernsteuerung'}</small>
          </div>
          {message && <p className={message.ok ? 'success music-message' : 'error music-message'}>{message.text}</p>}
          <PlayerBar music={music} />

          {music.cards.length === 0 ? (
            <EmptyState icon="music" title="Noch keine Musik-Karten">
              <p className="muted">Lege für eure Lieblings-Playlists Karten an. Mit einem NFC-Aufkleber startet die Musik dann per Handy auf dem Lautsprecher.</p>
            </EmptyState>
          ) : (
            <ul className="music-grid">
              {music.cards.map((c) => (
                <li key={c.id} className="music-card">
                  <button type="button" className="music-cover" onClick={() => void play(c)} disabled={playing !== null} aria-label={`${c.name} abspielen`}>
                    {c.image ? <img src={c.image} alt="" /> : <span className="music-emoji">{c.emoji}</span>}
                    <span className="music-play">{playing === c.id ? '…' : '▶'}</span>
                  </button>
                  <span className="music-name">
                    <span>{c.emoji} {c.name}</span>
                    {isManager && <button className="icon-button subtle" aria-label={`${c.name} bearbeiten`} onClick={() => setEditing(c)}><Icon name="edit" size={16} /></button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {music.cards.length > 0 && (
            <Link to="/musik/cover" className="link-button music-covers-link">🖨 Cover für die Karten ausdrucken</Link>
          )}
          {isAdmin && <MusicBoxes />}
          {isAdmin && (
            <button className="link-button danger-link music-disconnect" onClick={() => confirm('Spotify-Verbindung trennen? Die Karten bleiben erhalten.') && void music.disconnect()}>
              Spotify-Verbindung trennen
            </button>
          )}
        </>
      )}

      {editing && <CardForm card={editing === 'new' ? undefined : editing} music={music} onClose={() => setEditing(null)} />}
      {devices && <DeviceDialog music={music} onClose={() => setDevices(false)} />}
    </div>
  );
}
