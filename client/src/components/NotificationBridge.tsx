import { useEffect } from 'react';
import { CLOSE_DRAWER_EVENT } from './drawer';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router';
import { isNativeApp } from '../api';
import { onDeepLink } from '../deepLinks';
import { listenForTaps, registerPush, syncReminders } from '../notifications';
import { useFamily } from '../session';
import type { CalendarEvent, Contact, Habit, Task } from '../types';
import { useChores } from '../chores';
import { useCheckins } from '../useCheckins';
import { useResource } from '../useResource';

/** Hält Erinnerungen, Push-Anmeldung und NFC-Links der Android-App aktuell (rendert nichts) */
export function NotificationBridge() {
  if (!isNativeApp) return null;
  return <NativeNotifications />;
}

function NativeNotifications() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, family } = useFamily();
  const events = useResource<CalendarEvent>('events');
  const tasks = useResource<Task>('tasks');
  const habits = useResource<Habit>('habits');
  const checkins = useCheckins();
  const { chores, days: choreDays } = useChores();
  const contacts = useResource<Contact>('contacts');

  useEffect(() => {
    listenForTaps(navigate);
    void registerPush();
    return onDeepLink((path) => navigate(path));
  }, [navigate, user.id]);

  // Android-Zurück-Taste: offenes Fenster bzw. Menü schließen, sonst zur Übersicht, auf der Übersicht App minimieren
  useEffect(() => {
    if (!Capacitor.isPluginAvailable('App')) return;
    const handle = App.addListener('backButton', () => {
      const dialog = document.querySelector('dialog[open]');
      if (dialog) dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      else if (document.querySelector('.drawer-open')) window.dispatchEvent(new Event(CLOSE_DRAWER_EVENT));
      else if (pathname !== '/') navigate('/', { replace: true });
      else void App.minimizeApp();
    });
    return () => void handle.then((h) => h.remove());
  }, [navigate, pathname]);

  const loading = events.loading || tasks.loading || habits.loading || checkins.loading || chores.loading;
  useEffect(() => {
    if (loading) return;
    syncReminders(events.items, tasks.items, user.id, { habits: habits.items, checkins: checkins.items, chores: chores.items, choreDays, members: family.members, contacts: contacts.items });
  }, [loading, events.items, tasks.items, habits.items, checkins.items, chores.items, choreDays, family.members, contacts.items, user.id]);

  return null;
}
