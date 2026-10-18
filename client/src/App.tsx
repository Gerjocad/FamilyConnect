import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { AuthPage } from './pages/AuthPage';
import { BoardPage } from './pages/BoardPage';
import { CalendarPage } from './pages/CalendarPage';
import { ContactsPage } from './pages/ContactsPage';
import { DashboardPage } from './pages/DashboardPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { HabitCheckinPage } from './pages/HabitCheckinPage';
import { HabitsPage } from './pages/HabitsPage';
import { ListsPage } from './pages/ListsPage';
import { NewsPage } from './pages/NewsPage';
import { MealsPage } from './pages/MealsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { RecipesPage } from './pages/RecipesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { useSession } from './session';

export function App() {
  const { status, user, family, retry, signOut } = useSession();

  if (status === 'loading' || (user && user.families.length > 0 && !family)) {
    return <div className="splash"><img src="/icon.svg" alt="" width={56} height={56} /></div>;
  }
  if (status === 'offline') {
    return (
      <div className="auth">
        <div className="auth-card card">
          <img src="/icon.svg" alt="" width={56} height={56} />
          <h1>Keine Verbindung</h1>
          <p className="muted">Der FamilyConnect-Server ist gerade nicht erreichbar. Prüfe deine Internetverbindung.</p>
          <button className="button primary" onClick={() => void retry()}>Erneut versuchen</button>
          <button className="link-button" onClick={() => void signOut()}>Abmelden / Server ändern</button>
        </div>
      </div>
    );
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
          <Route path="rezepte" element={<RecipesPage />} />
          <Route path="rezepte/:recipeId" element={<RecipesPage />} />
          <Route path="kontakte" element={<ContactsPage />} />
          <Route path="gewohnheiten" element={<HabitsPage />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="neuigkeiten" element={<NewsPage />} />
          <Route path="h/:token" element={<HabitCheckinPage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
