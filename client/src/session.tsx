import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setToken, getToken } from './api';
import { connectLive, onLiveChange } from './live';
import { clearReminders, unregisterPush } from './notifications';
import { applyTheme } from './themes';
import type { Family, Member, User } from './types';

const FAMILY_KEY = 'familyconnect.family';

interface Session {
  status: 'loading' | 'offline' | 'anonymous' | 'ready';
  user: User | null;
  family: Family | null;
  signIn(token: string): Promise<void>;
  signOut(): Promise<void>;
  refreshUser(): Promise<User | null>;
  /** Nach einem Verbindungsfehler alles neu laden */
  retry(): Promise<void>;
  selectFamily(id: number | null): void;
  setFamily(family: Family): void;
  member(id: number | null | undefined): Member | undefined;
}

const SessionContext = createContext<Session | null>(null);

function storedFamilyId(): number | null {
  try {
    const value = Number(localStorage.getItem(FAMILY_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function storeFamilyId(id: number | null) {
  try {
    if (id) localStorage.setItem(FAMILY_KEY, String(id));
    else localStorage.removeItem(FAMILY_KEY);
  } catch {
    // egal
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [familyId, setFamilyId] = useState<number | null>(storedFamilyId);
  const [family, setFamilyState] = useState<Family | null>(null);

  const refreshUser = useCallback(async () => {
    setStatus((s) => (s === 'offline' ? 'loading' : s));
    if (!getToken()) {
      setUser(null);
      setStatus('anonymous');
      return null;
    }
    try {
      const me = await api<User>('/me');
      applyTheme(me.theme);
      setUser(me);
      setStatus('ready');
      return me;
    } catch (err) {
      // Nur bei abgelaufener Sitzung abmelden, nicht wenn das Netz kurz weg ist
      if (!(err instanceof ApiError) || err.status !== 401) {
        setStatus((s) => (s === 'loading' ? 'offline' : s));
        return null;
      }
      setToken(null);
      setUser(null);
      setStatus('anonymous');
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  // Aktive Familie bestimmen: gespeicherte Wahl, sonst die erste
  const activeId = useMemo(() => {
    if (!user) return null;
    if (familyId && user.families.some((f) => f.id === familyId)) return familyId;
    return user.families[0]?.id ?? null;
  }, [user, familyId]);

  const loadFamily = useCallback(async (id: number | null) => {
    if (id === null) return setFamilyState(null);
    try {
      setFamilyState(await api<Family>(`/families/${id}`));
    } catch (err) {
      setFamilyState(null);
      // Nicht mehr Mitglied → Familienliste neu laden; sonst ist der Server nicht erreichbar
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) void refreshUser();
      else setStatus('offline');
    }
  }, [refreshUser]);

  useEffect(() => {
    connectLive(activeId);
    void loadFamily(activeId);
  }, [activeId, loadFamily]);

  useEffect(
    () =>
      onLiveChange((resource) => {
        if (resource === 'family') {
          void loadFamily(activeId);
          void refreshUser();
        }
      }),
    [activeId, loadFamily, refreshUser]
  );

  const value: Session = {
    status,
    user,
    family: family && family.id === activeId ? family : null,
    async signIn(token) {
      setToken(token);
      await refreshUser();
    },
    async signOut() {
      // Nicht auf den Server warten – er ist evtl. gerade nicht erreichbar
      unregisterPush();
      clearReminders();
      void api('/auth/logout', { method: 'POST' }).catch(() => {});
      setToken(null);
      connectLive(null);
      setUser(null);
      setFamilyState(null);
      setStatus('anonymous');
    },
    refreshUser,
    async retry() {
      const me = await refreshUser();
      if (me) await loadFamily(activeId ?? me.families[0]?.id ?? null);
    },
    selectFamily(id) {
      storeFamilyId(id);
      setFamilyId(id);
    },
    setFamily(next) {
      storeFamilyId(next.id);
      setFamilyId(next.id);
      setFamilyState(next);
    },
    member(id) {
      return id == null ? undefined : family?.members.find((m) => m.id === id);
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession außerhalb des SessionProvider');
  return ctx;
}

/** Wie useSession, aber garantiert mit geladener Familie (innerhalb des App-Layouts). */
export function useFamily() {
  const session = useSession();
  if (!session.family || !session.user) throw new Error('Keine Familie geladen');
  return { ...session, family: session.family, user: session.user };
}
