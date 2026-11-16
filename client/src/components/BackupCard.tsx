import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatShortDay, formatTime } from '../dates';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { useAsync } from './useAsync';

interface Info {
  enabled: boolean;
  requested: boolean;
  status: { state: 'running' | 'ok' | 'failed' | 'off'; message: string; at: string; last_ok: string; size: number } | null;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${formatShortDay(d)}, ${formatTime(d)}`;
};
const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Familie & Profil → App & Server: Sicherung in Google Drive (nur Admins) */
export function BackupCard() {
  const { family } = useFamily();
  const path = `/families/${family.id}/server-backup`;
  const [info, setInfo] = useState<Info | null>(null);
  const { busy, error, run } = useAsync();
  const load = useCallback(async () => setInfo(await api<Info>(path)), [path]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  // Während einer Sicherung alle 3 s nachsehen
  const running = Boolean(info?.requested || info?.status?.state === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void load().catch(() => undefined), 3000);
    return () => window.clearInterval(timer);
  }, [running, load]);

  if (!info) return <p className="muted">Lade …</p>;
  const s = info.status;
  return (
    <div className="server-update">
      {!info.enabled && <p className="muted">Die Sicherung aus der App ist auf diesem Server nicht eingerichtet.</p>}
      {info.enabled && !s && <p className="muted">Noch keine Sicherung gelaufen – sie startet jede Nacht um ca. 3 Uhr.</p>}
      {s?.state === 'off' && (
        <p className="muted">
          Gesichert wird jede Nacht nur auf dem Server selbst. Für eine Kopie in <b>Google Drive</b> einmal die Anleitung
          <code> deploy/BACKUP.md</code> durchgehen.
        </p>
      )}
      {s?.last_ok && (
        <p className="server-update-ok"><Icon name="check" size={16} /> Letzte Sicherung in Google Drive: {when(s.last_ok)}{s.size > 0 && <span className="muted"> · {kb(s.size)}</span>}</p>
      )}
      {s?.state === 'failed' && <p className="error">✗ {s.message} ({when(s.at)})</p>}
      {running && <p className="server-update-running"><span className="spinner" aria-hidden /> Sicherung läuft …</p>}
      {info.enabled && (
        <button type="button" className="button" disabled={busy || running} onClick={() => void run(async () => {
          await api(path, { method: 'POST' });
          await load();
        })}>
          <Icon name="download" size={18} /> Jetzt sichern
        </button>
      )}
      {error && <p className="error">{error}</p>}
      <small className="hint">Gesichert werden alle Daten der App und die hochgeladenen Fotos. In Google Drive bleiben die Sicherungen der letzten 30 Tage.</small>
    </div>
  );
}
