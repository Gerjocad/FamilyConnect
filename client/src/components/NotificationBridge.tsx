import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { isNativeApp } from '../api';
import { listenForTaps, registerPush, syncReminders } from '../notifications';
import { useFamily } from '../session';
import type { CalendarEvent, Task } from '../types';
import { useResource } from '../useResource';

/** Hält Erinnerungen und Push-Anmeldung der Android-App aktuell (rendert nichts) */
export function NotificationBridge() {
  if (!isNativeApp) return null;
  return <NativeNotifications />;
}

function NativeNotifications() {
  const navigate = useNavigate();
  const { user } = useFamily();
  const events = useResource<CalendarEvent>('events');
  const tasks = useResource<Task>('tasks');

  useEffect(() => {
    listenForTaps(navigate);
    void registerPush();
  }, [navigate, user.id]);

  useEffect(() => {
    if (events.loading || tasks.loading) return;
    syncReminders(events.items, tasks.items, user.id);
  }, [events.items, tasks.items, events.loading, tasks.loading, user.id]);

  return null;
}
