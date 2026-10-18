// Rollen in einer Familie:
//   admin  – darf alles, auch die Familie verwalten (Rollen, Mitglieder entfernen, Name, Einladungscode)
//   parent – darf alle Inhalte bearbeiten, auch die der Kinder
//   child  – darf alles sehen; was Kinder ändern dürfen, legt `childRule` je Ressource fest (resources.js)
export const ROLES = ['admin', 'parent', 'child'];

/** Eltern und Admins dürfen Inhalte anderer ändern, für andere abhaken usw. */
export const isManager = (role) => role === 'admin' || role === 'parent';
