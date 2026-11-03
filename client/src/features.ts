// Welche Bereiche sieht die angemeldete Person?
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
