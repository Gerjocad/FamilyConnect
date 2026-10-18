import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { availableUpdate, installUpdate, type LatestApp } from '../appUpdate';
import { isNativeApp } from '../api';
import { Icon } from './Icon';

const DISMISS_KEY = 'familyconnect.updateDismissed';

/** Hinweis „Neue App-Version verfügbar“ (nur in der Android-App) */
export function UpdateBanner() {
  const [update, setUpdate] = useState<LatestApp | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem(DISMISS_KEY)) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!isNativeApp) return;
    const check = () => void availableUpdate().then(setUpdate);
    check();
    // Beim Zurückkehren in die App erneut prüfen
    if (!Capacitor.isPluginAvailable('App')) return;
    const handle = App.addListener('resume', check);
    return () => void handle.then((h) => h.remove());
  }, []);

  if (!update || dismissed === update.versionCode) return null;

  return (
    <div className="update-banner" role="status">
      <Icon name="download" size={20} />
      <span>
        <strong>Neue App-Version {update.versionName}</strong>
        <small>Tippe auf „Installieren“ und bestätige danach das Update.</small>
      </span>
      <button className="button primary small" onClick={() => installUpdate(update)}>Installieren</button>
      <button
        className="icon-button subtle"
        aria-label="Später"
        onClick={() => {
          setDismissed(update.versionCode);
          try {
            localStorage.setItem(DISMISS_KEY, String(update.versionCode));
          } catch {
            // egal
          }
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
