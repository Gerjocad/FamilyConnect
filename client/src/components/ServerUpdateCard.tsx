import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { formatShortDay, formatTime } from '../dates';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

interface Info {
  enabled: boolean;
  installed: { commit: string; date: string } | null;
  latest: { commit: string; date: string | null; message: string } | null;
  requested: boolean;
  status: { state: 'running' | 'done' | 'unchanged' | 'failed'; message: string; at: string; commit: string } | null;
}

const POLL_MS = 4000;
const short = (commit: string) => commit.slice(0, 7);
const when = (iso: string) => {
  const d = new Date(iso);
  return `${formatShortDay(d)}, ${formatTime(d)}`;
};

/** Familie & Profil → Server: Stand anzeigen und Update anstoßen (nur Admins) */
export function ServerUpdateCard() {
  const { family } = useFamily();
  const [info, setInfo] = useState<Info | null>(null);
  // Während des Updates startet der Server neu und ist kurz nicht erreichbar
  const [unreachable, setUnreachable] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const loadedCommit = useRef<string | null>(null);
  // Zeitstempel des letzten Laufs vor der Anforderung – ein neuer Lauf hat einen anderen
  const statusBefore = useRef<string | null>(null);
  const { busy, error, run } = useAsync();
  const path = `/families/${family.id}/server-update`;

  const load = useCallback(async () => {
    try {
      const data = await api<Info>(path);
      loadedCommit.current ??= data.installed?.commit ?? null;
      setInfo(data);
      setUnreachable(false);
      return data;
    } catch {
      setUnreachable(true);
      return null;
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = waiting || Boolean(info && (info.requested || info.status?.state === 'running'));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void load().then((data) => {
        // fertig, sobald update.sh einen neuen Lauf abgeschlossen hat
        const finished = data?.status && data.status.at !== statusBefore.current && data.status.state !== 'running';
        if (data && !data.requested && finished) setWaiting(false);
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  if (!info) return <p className="muted">{unreachable ? 'Server nicht erreichbar' : 'Lade …'}</p>;

  const upToDate = info.installed && info.latest ? info.installed.commit === info.latest.commit : null;
  const updatedNow = loadedCommit.current && info.installed && info.installed.commit !== loadedCommit.current;
  const status = info.status;

  return (
    <div className="server-update">
      {info.installed ? (
        <p>
          Installiert: <code>{short(info.installed.commit)}</code> <span className="muted">vom {when(info.installed.date)}</span>
        </p>
      ) : (
        <p className="muted">Installierter Stand unbekannt</p>
      )}
      {info.latest && (
        upToDate ? (
          <p className="server-update-ok"><Icon name="check" size={16} /> Auf dem neuesten Stand</p>
        ) : (
          <p>
            <span className="badge">Neu</span> <code>{short(info.latest.commit)}</code> {info.latest.message}
            {info.latest.date && <span className="muted"> · {when(info.latest.date)}</span>}
          </p>
        )
      )}

      {running ? (
        <p className="server-update-running">
          <span className="spinner" aria-hidden />
          {unreachable ? 'Server startet neu …' : status?.state === 'running' ? 'Update läuft – baut und testet die neue Version (ein paar Minuten) …' : 'Update wird gestartet …'}
        </p>
      ) : updatedNow ? (
        <div className="server-update-done">
          <p><Icon name="check" size={16} /> Aktualisiert auf <code>{short(info.installed!.commit)}</code></p>
          <button className="button primary" onClick={() => location.reload()}>App neu laden</button>
        </div>
      ) : status && (
        <p className={status.state === 'failed' ? 'error' : 'muted'}>
          Letztes Update: {status.message} · {when(status.at)}
        </p>
      )}

      {info.enabled ? (
        !running && !updatedNow && (
          <button
            className={`button ${upToDate === false ? 'primary' : ''}`}
            disabled={busy}
            onClick={() => void run(async () => {
              statusBefore.current = info.status?.at ?? null;
              await api(path, { method: 'POST' });
              setWaiting(true);
              await load();
            })}
          >
            <Icon name="download" size={18} /> Server jetzt aktualisieren
          </button>
        )
      ) : (
        <p className="hint">
          Das Update per Knopfdruck wird beim nächsten Server-Update eingerichtet (nachts automatisch oder einmal
          „FamilyConnect-Update.bat“ ausführen).
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <small className="hint">Schlägt der Bau oder ein Test fehl, läuft die bisherige Version einfach weiter.</small>
    </div>
  );
}
