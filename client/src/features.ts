// Testfunktionen: neue Bereiche sieht zuerst nur, wer sie unter „Familie & Profil → Testfunktionen“ für sich
// eingeschaltet hat (nur Admins). Freigegeben für die ganze Familie werden sie im jeweiligen Bereich.
import { useFamily } from './session';

export function useFeatures() {
  const { user, family } = useFamily();
  return {
    /** Punkte & Belohnungen */
    points: user.beta || family.points_released,
    /** „Wo bist du?“ fragen (antworten kann man immer) */
    locate: user.beta || family.locate_released,
  };
}
