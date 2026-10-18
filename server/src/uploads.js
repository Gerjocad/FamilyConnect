// Hochgeladene Bilder (Feedback, Beschwerden): als Dateien mit zufälligem Namen im Upload-Ordner
import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const FILE_RE = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

/** data:image/…;base64,… → Dateiname im Upload-Ordner */
export function saveImage(uploadDir, dataUrl) {
  const match = typeof dataUrl === 'string' && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Nur JPEG-, PNG- oder WebP-Bilder sind erlaubt');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Ein Bild ist zu groß (max. 5 MB)');
  const name = `${randomBytes(16).toString('hex')}.${TYPES[match[1]]}`;
  writeFileSync(join(uploadDir, name), bytes);
  return name;
}

/** Mehrere Bilder speichern – schlägt eines fehl, werden die schon gespeicherten wieder gelöscht */
export function saveImages(uploadDir, dataUrls) {
  const saved = [];
  try {
    for (const dataUrl of dataUrls) saved.push(saveImage(uploadDir, dataUrl));
  } catch (err) {
    removeImages(uploadDir, saved);
    throw err;
  }
  return saved;
}

export function removeImages(uploadDir, names) {
  for (const name of names) if (FILE_RE.test(name)) rmSync(join(uploadDir, name), { force: true });
}
