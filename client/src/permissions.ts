// Was darf die angemeldete Person in dieser Familie? Gleiche Regeln wie auf dem Server
// (server/src/resources.js – childRule); hier nur, um Knöpfe auszublenden, die nicht erlaubt sind.
import { useFamily } from './session';
import type { Role } from './types';

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', parent: 'Eltern', child: 'Kind' };

interface Owned {
  created_by: number | null;
}

export function usePermissions() {
  const { user, family } = useFamily();
  const role: Role = family.members.find((m) => m.id === user.id)?.role ?? 'child';
  const isAdmin = role === 'admin';
  const isChild = role === 'child';
  const own = (item: Owned) => item.created_by === user.id;
  return {
    role,
    isAdmin,
    isChild,
    /** Eltern und Admins: Inhalte anderer ändern, für andere abhaken */
    isManager: !isChild,
    /** Termine, Listen, Aufgaben: Kinder nur ihre eigenen */
    canEdit: (item: Owned) => !isChild || own(item),
    /** Aufgabe abhaken: Kinder nur eigene, ihnen zugewiesene oder für alle */
    canToggleTask: (task: Owned & { assignee_id: number | null }) =>
      !isChild || own(task) || task.assignee_id === null || task.assignee_id === user.id,
  };
}
