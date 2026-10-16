import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { AuthPage } from './pages/AuthPage';
import { BoardPage } from './pages/BoardPage';
import { CalendarPage } from './pages/CalendarPage';
import { ContactsPage } from './pages/ContactsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ListsPage } from './pages/ListsPage';
import { MealsPage } from './pages/MealsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { useSession } from './session';

export function App() {
  const { status, user, family } = useSession();

  if (status === 'loading' || (user && user.families.length > 0 && !family)) {
    return <div className="splash"><img src="/icon.svg" alt="" width={56} height={56} /></div>;
  }
  if (!user) return <AuthPage />;
  if (!family) return <OnboardingPage />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="kalender" element={<CalendarPage />} />
          <Route path="listen" element={<ListsPage />} />
          <Route path="listen/:listId" element={<ListsPage />} />
          <Route path="aufgaben" element={<TasksPage />} />
          <Route path="pinnwand" element={<BoardPage />} />
          <Route path="essen" element={<MealsPage />} />
          <Route path="kontakte" element={<ContactsPage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
