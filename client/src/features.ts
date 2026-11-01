// Welche Bereiche sieht die angemeldete Person? Neue Bereiche können hier zuerst nur für Testerinnen und Tester
// (user.beta, „Familie & Profil → Testfunktionen“) eingeschaltet werden.
import { usePermissions } from './permissions';
import { useFamily } from './session';

export function useFeatures() {
  const { family } = useFamily();
  const { isManager } = usePermissions();
  return {
    /** Punkte & Belohnungen: Eltern immer (zum Einschalten), Kinder sobald eingeschaltet */
    points: isManager || family.points_enabled,
    /** „Wo bist du?“ fragen */
    locate: true,
  };
}
