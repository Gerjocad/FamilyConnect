import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { isNativeApp } from '../api';
import { onDeepLink } from '../deepLinks';
import { listenForTaps, registerPush, syncReminders } from '../notifications';
import { useFamily } from '../session';
import type { CalendarEvent, Habit, Task } from '../types';
import { useCheckins } from '../useCheckins';
import { useResource } from '../useResource';

/** Hält Erinnerungen, Push-Anmeldung und NFC-Links der Android-App aktuell (rendert nichts) */
export function NotificationBridge() {
  if (!isNativeApp) return null;
  return <NativeNotifications />;
}

function NativeNotifications() {
  const navigate = useNavigate();
  const { user } = useFamily();
  const events = useResource<CalendarEvent>('events');
  const tasks = useResource<Task>('tasks');
  const habits = useResource<Habit>('habits');
  const checkins = useCheckins();

  useEffect(() => {
    listenForTaps(navigate);
    void registerPush();
    return onDeepLink((path) => navigate(path));
  }, [navigate, user.id]);

  const loading = events.loading || tasks.loading || habits.loading || checkins.loading;
  useEffect(() => {
    if (loading) return;
    syncReminders(events.items, tasks.items, user.id, { habits: habits.items, checkins: checkins.items });
  }, [loading, events.items, tasks.items, habits.items, checkins.items, user.id]);

  return null;
}
