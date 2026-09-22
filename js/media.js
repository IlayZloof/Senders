const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.8;
const MAX_DATA_URL_CHARS = 350000;

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
