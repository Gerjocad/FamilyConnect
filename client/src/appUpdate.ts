import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { api, isNativeApp } from './api';

export interface AppVersion {
  versionCode: number;
  versionName: string;
}

export interface LatestApp extends AppVersion {
  apkUrl: string;
}

/** Installierte App-Version (nur in der Android-App) */
export async function installedVersion(): Promise<AppVersion | null> {
  if (!isNativeApp || !Capacitor.isPluginAvailable('App')) return null;
  const info = await App.getInfo();
  return { versionCode: Number(info.build), versionName: info.version };
}

/** Neuere App-Version, falls es eine gibt */
export async function availableUpdate(): Promise<LatestApp | null> {
  const installed = await installedVersion();
  if (!installed) return null;
  try {
    const latest = await api<LatestApp>('/app/latest');
    return latest.versionCode > installed.versionCode ? latest : null;
  } catch {
    return null;
  }
}

/** Öffnet den Download im Browser; Android fragt danach, ob die App aktualisiert werden soll */
export function installUpdate(update: LatestApp) {
  // Externe Adressen öffnet die App automatisch im Browser, der die APK herunterlädt
  window.location.href = update.apkUrl;
}
