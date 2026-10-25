// Fotos vor dem Hochladen verkleinern (Feedback, Beschwerden, Logos im Kalender)

const MAX_SIDE = 1600;

/** Bild auf max. 1600 px verkleinern und als JPEG kodieren (Screenshots werden so ~10× kleiner) */
export async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(file, url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(file: File, url: string) {
  return loadUrl(url, `„${file.name}“ ist kein lesbares Bild`);
}

function loadUrl(src: string, error = 'Das Bild ist nicht lesbar') {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(error));
    el.src = src;
  });
}

/** Bild quadratisch einpassen (SVGs ohne eigene Größe füllen das Feld) */
function fitIcon(img: HTMLImageElement, size: number) {
  const natW = img.naturalWidth || size;
  const natH = img.naturalHeight || size;
  const scale = size / Math.max(natW, natH);
  const [w, h] = [natW * scale, natH * scale];
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}

/** Logo quadratisch auf 96 px einpassen; PNG, damit ein durchsichtiger Hintergrund bleibt */
export async function iconImage(file: File, size = 96): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    return fitIcon(await loadImage(file, url), size);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Wie iconImage, aber für ein vom Server geladenes Bild (data:-URL, z. B. aus der Logo-Suche) */
export async function iconFromDataUrl(dataUrl: string, size = 96): Promise<string> {
  return fitIcon(await loadUrl(dataUrl), size);
}
