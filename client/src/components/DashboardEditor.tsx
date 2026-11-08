import { useState } from 'react';
import { api } from '../api';
import { CARDS, orderedCards, type CardId } from '../dashboardCards';
import { useFamily } from '../session';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { useAsync } from './useAsync';

const label = (id: CardId) => CARDS.find((c) => c.id === id)!;

/** „Übersicht anpassen“: Karten ein-/ausblenden und mit Pfeilen umsortieren – gilt nur für einen selbst */
export function DashboardEditor({ onClose }: { onClose(): void }) {
  const { user, refreshUser } = useFamily();
  const [order, setOrder] = useState<CardId[]>(() => orderedCards(user.dashboard));
  const [hidden, setHidden] = useState<string[]>(() => user.dashboard?.hidden ?? []);
  const { busy, error, run } = useAsync();

  const move = (index: number, by: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setOrder(next);
  };
  const save = (body: object) => void run(async () => {
    await api('/me/dashboard', { method: 'PUT', body });
    await refreshUser();
    onClose();
  });

  return (
    <Modal title="Übersicht anpassen" onClose={onClose}>
      <p className="muted">Wähle, welche Karten du auf deiner Übersicht siehst, und schiebe sie mit den Pfeilen an die richtige Stelle. Das gilt nur für dich.</p>
      <ul className="dash-edit">
        {order.map((id, i) => {
          const card = label(id);
          const shown = !hidden.includes(id);
          return (
            <li key={id} className={shown ? '' : 'off'}>
              <label className="dash-edit-toggle">
                <input type="checkbox" className="switch" checked={shown} onChange={() => setHidden(shown ? [...hidden, id] : hidden.filter((h) => h !== id))} />
                <span aria-hidden>{card.icon}</span> {card.label}
              </label>
              <button type="button" className="icon-button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${card.label} nach oben`}>
                <Icon name="up" size={18} />
              </button>
              <button type="button" className="icon-button" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`${card.label} nach unten`}>
                <Icon name="down" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      <small className="hint">Karten ohne Inhalt (z. B. keine Geburtstage in Sicht) erscheinen auch eingeschaltet erst, wenn es etwas zu zeigen gibt. Anfragen und Beschwerden an dich stehen immer ganz oben.</small>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="link-button" disabled={busy} onClick={() => save({ reset: true })}>Standard wiederherstellen</button>
        <span className="spacer" />
        <button type="button" className="button" onClick={onClose}>Abbrechen</button>
        <button type="button" className="button primary" disabled={busy} onClick={() => save({ order, hidden })}>
          <Icon name="check" size={18} /> Speichern
        </button>
      </div>
    </Modal>
  );
}
