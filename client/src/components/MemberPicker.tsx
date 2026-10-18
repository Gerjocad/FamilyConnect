import { useFamily } from '../session';
import { Avatar } from './Avatar';

interface Props {
  value: number[];
  onChange(ids: number[]): void;
  single?: boolean;
  /** diese Personen nicht anbieten (z. B. sich selbst) */
  exclude?: number[];
}

/** Auswahl von Familienmitgliedern als antippbare Chips */
export function MemberPicker({ value, onChange, single, exclude = [] }: Props) {
  const { family } = useFamily();
  const toggle = (id: number) => {
    if (single) onChange(value.includes(id) ? [] : [id]);
    else onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div className="member-picker" role="group">
      {family.members.filter((m) => !exclude.includes(m.id)).map((m) => (
        <button
          type="button"
          key={m.id}
          className={`chip ${value.includes(m.id) ? 'chip-active' : ''}`}
          style={value.includes(m.id) ? { borderColor: m.color, background: `${m.color}22` } : undefined}
          aria-pressed={value.includes(m.id)}
          onClick={() => toggle(m.id)}
        >
          <Avatar member={m} size={20} />
          {m.name}
        </button>
      ))}
    </div>
  );
}
