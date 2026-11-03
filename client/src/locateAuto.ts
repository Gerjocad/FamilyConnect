// „Wo bist du?“ automatisch beantworten – Android-Plugin LocateAuto (client/android/…/LocatePlugin.java,
// LocateMessagingService.java). Fragt ein Admin (bei allen) oder fragen Eltern ein Kind, antwortet das Handy still.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getServerUrl } from './api';
import type { Member, Role } from './types';

interface LocateAutoPlugin {
  setup(options: { server: string }): Promise<{ foreground: boolean; background: boolean }>;
  status(): Promise<{ foreground: boolean; background: boolean }>;
}

export const LocateAuto = registerPlugin<LocateAutoPlugin>('LocateAuto');

/** Nur in der Android-App ab der Version mit automatischer Antwort */
export const canAnswerAutomatically = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocateAuto');

/** gleiche Regel wie auf dem Server (server/src/locate.js) */
export const answersAutomatically = (fromRole: Role, toRole: Role) => fromRole === 'admin' || (fromRole === 'parent' && toRole === 'child');

/** Wer bekommt meinen Standort automatisch? */
export const autoAskers = (me: Member, members: Member[]) =>
  members.filter((m) => m.id !== me.id && answersAutomatically(m.role, me.role));

/** Beim App-Start: Server-Adresse für die stille Antwort hinterlegen */
export function setupLocateAuto() {
  if (!canAnswerAutomatically()) return;
  void LocateAuto.setup({ server: getServerUrl() || location.origin }).catch(() => undefined);
}
