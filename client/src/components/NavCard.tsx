import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router';

/** Karte auf der Übersicht, die als Ganzes zur passenden Seite führt */
export function NavCard({ to, className = '', children }: { to: string; className?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, label, .check-button, .poll, a')) return;
    navigate(to);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) navigate(to);
  };
  return (
    <section className={`card nav-card ${className}`} onClick={onClick} onKeyDown={onKeyDown} role="link" tabIndex={0}>
      {children}
    </section>
  );
}

