import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export const TOPBAR_ACTIONS_ID = 'topbar-actions';

/** Knöpfe einer Seite oben in der Leiste (Handy); die Leiste liegt in Layout.tsx */
export function TopbarActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(TOPBAR_ACTIONS_ID)), []);
  return target ? createPortal(children, target) : null;
}

export interface PlusMenuItem {
  label: string;
  icon: IconName;
  onSelect(): void;
}

/** „+“ mit einer kleinen Auswahl (z. B. Termin, Urlaub, Import) */
export function PlusMenu({ items, label = 'Hinzufügen' }: { items: PlusMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="plus-menu" ref={ref}>
      <button className="icon-button plus-button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="plus" size={22} />
      </button>
      {open && (
        <div className="plus-menu-list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className="plus-menu-item"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <Icon name={item.icon} size={18} /> {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
