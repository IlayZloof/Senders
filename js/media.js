const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.8;
const MAX_DATA_URL_CHARS = 350000;
const AVATAR_OUT = 512;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('לא הצלחנו לקרוא את התמונה'));
    };
    img.src = url;
  });
}

function imageSize(img) {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  return { width, height };
}

export async function loadImageFromFile(file) {
  if (!file) throw new Error('נא לבחור קובץ תמונה');
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('נא לבחור קובץ תמונה');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('התמונה גדולה מדי. נסו קובץ קטן יותר (עד 12MB).');
  }
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to Image */
    }
  }
  return loadImage(file);
}

/**
 * Export the visible square of a circular crop (cover + pan/zoom) as JPEG.
 * tx/ty are CSS pixels of image translation inside a viewSize circle.
 * scale is the display scale (CSS px per image px).
 */
export function exportCircleCrop(img, { tx = 0, ty = 0, scale, viewSize, outSize = AVATAR_OUT } = {}) {
  const { width, height } = imageSize(img);
  if (!width || !height) throw new Error('לא הצלחנו לקרוא את התמונה');
  const view = Math.max(1, Number(viewSize) || 86);
  const displayScale = Number(scale);
  if (!displayScale || displayScale <= 0) throw new Error('לא הצלחנו לקרוא את התמונה');

  const ox = view / 2 + Number(tx || 0) - (width * displayScale) / 2;
  const oy = view / 2 + Number(ty || 0) - (height * displayScale) / 2;
  const sx = (0 - ox) / displayScale;
  const sy = (0 - oy) / displayScale;
  const sw = view / displayScale;
  const sh = view / displayScale;

  const canvas = document.createElement('canvas');
  const edge = Math.max(64, Math.min(outSize, 720));
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('הדפדפן לא תומך בדחיסת תמונה');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, edge, edge);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, edge, edge);

  let quality = JPEG_QUALITY;
  let dataUrl = canvasToJpeg(canvas, quality);
  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.45) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    dataUrl = canvasToJpeg(canvas, quality);
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS && edge > 320) {
    canvas.width = 320;
    canvas.height = 320;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 320, 320);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 320, 320);
    dataUrl = canvasToJpeg(canvas, 0.7);
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('התמונה גדולה מדי גם אחרי דחיסה. נסו תמונה אחרת, או פרסמו בלי תמונה.');
  }
  return dataUrl;
}

function canvasToJpeg(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Compress a user photo to a JPEG data URL (max ~1200px, quality 0.8).
 * Throws a Hebrew warning if the result is still too large for localStorage.
 */
export async function compressImageFile(file) {
  if (!file) return '';
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('נא לבחור קובץ תמונה');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('התמונה גדולה מדי. נסו קובץ קטן יותר (עד 12MB).');
  }

  const img = await loadImage(file);
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error('לא הצלחנו לקרוא את התמונה');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('הדפדפן לא תומך בדחיסת תמונה');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let dataUrl = canvasToJpeg(canvas, quality);
  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.45) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    dataUrl = canvasToJpeg(canvas, quality);
  }

  if (dataUrl.length > MAX_DATA_URL_CHARS && Math.max(width, height) > 720) {
    const shrink = 720 / Math.max(width, height);
    canvas.width = Math.max(1, Math.round(width * shrink));
    canvas.height = Math.max(1, Math.round(height * shrink));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = canvasToJpeg(canvas, 0.7);
  }

  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('התמונה גדולה מדי גם אחרי דחיסה. נסו תמונה אחרת, או פרסמו בלי תמונה.');
  }

  return dataUrl;
}
