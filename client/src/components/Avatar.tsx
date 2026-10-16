import type { Member } from '../types';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function Avatar({ member, size = 32 }: { member: Pick<Member, 'name' | 'color'>; size?: number }) {
  return (
    <span
      className="avatar"
      title={member.name}
      style={{ background: member.color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(member.name)}
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
