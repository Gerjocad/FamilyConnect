import type { Member } from '../types';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Kürzel im runden Bild: selbst gewählt (Familie & Profil) oder aus dem Namen */
export const avatarText = (member: Pick<Member, 'name' | 'initials'>) => member.initials || initials(member.name);

export function Avatar({ member, size = 32 }: { member: Pick<Member, 'name' | 'color' | 'initials'>; size?: number }) {
  const text = avatarText(member);
  return (
    <span
      className="avatar"
      title={member.name}
      style={{ background: member.color, width: size, height: size, fontSize: size * (text.length > 2 ? 0.32 : 0.4) }}
    >
      {text}
    </span>
  );
}

export function AvatarStack({ members, size = 24 }: { members: Member[]; size?: number }) {
  return (
    <span className="avatar-stack">
      {members.map((m) => (
        <Avatar key={m.id} member={m} size={size} />
      ))}
    </span>
  );
}
