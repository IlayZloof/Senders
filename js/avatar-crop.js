import { t } from './i18n.js';
import { exportCircleCrop, loadImageFromFile } from './media.js';

const MIN_USER_SCALE = 1;
const MAX_USER_SCALE = 4;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function imageSize(img) {
  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

export function bindAvatarCrop(root) {
  const overlay = root.querySelector('#avatarCrop');
  const stage = root.querySelector('#avatarCropStage');
  const circle = root.querySelector('#avatarCropCircle');
  const imgEl = root.querySelector('#avatarCropImg');
  const statusEl = root.querySelector('#avatarCropStatus');
  const saveBtn = root.querySelector('#avatarCropSave');
  const cancelBtn = root.querySelector('#avatarCropCancel');
  if (!overlay || !stage || !circle || !imgEl) return { open() {}, close() {}, isOpen() { return false; } };

  let img = null;
  let objectUrl = '';
  let viewSize = 320;
  let coverScale = 1;
  let userScale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pointers = new Map();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let busy = false;
  let onDone = null;

  function displayScale() {
    return coverScale * userScale;
  }

  function limits() {
    const { width, height } = imageSize(img || {});
    const scale = displayScale();
    const maxX = Math.max(0, (width * scale - viewSize) / 2);
    const maxY = Math.max(0, (height * scale - viewSize) / 2);
    return { maxX, maxY };
  }

  function constrain() {
    const { maxX, maxY } = limits();
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
  }

  function applyTransform() {
    if (!imgEl) return;
    imgEl.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${displayScale()})`;
  }

  function measureView() {
    const rect = circle.getBoundingClientRect();
    viewSize = Math.round(rect.width) || 320;
  }

  function resetFit() {
    if (!img) return;
    measureView();
    const { width, height } = imageSize(img);
    coverScale = Math.max(viewSize / width, viewSize / height);
    imgEl.style.width = `${width}px`;
    imgEl.style.height = `${height}px`;
    userScale = 1;
    tx = 0;
    ty = 0;
    constrain();
    applyTransform();
  }

  function setStatus(text, isErr = false) {
    if (!statusEl) return;
    if (!text) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.classList.remove('is-err');
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.classList.toggle('is-err', isErr);
  }

  function close() {
    overlay.hidden = true;
    busy = false;
    if (saveBtn) saveBtn.disabled = false;
    pointers.clear();
    dragging = false;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    img = null;
    imgEl.removeAttribute('src');
    setStatus('');
    onDone = null;
  }

  function isOpen() {
    return !overlay.hidden;
  }

  function sourceToPreview(source) {
    return new Promise((resolve, reject) => {
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      if (!width || !height) {
        reject(new Error('לא הצלחנו לקרוא את התמונה'));
        return;
      }
      const maxEdge = 1600;
      const shrink = Math.min(1, maxEdge / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * shrink));
      canvas.height = Math.max(1, Math.round(height * shrink));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('הדפדפן לא תומך בדחיסת תמונה'));
        return;
      }
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      if (typeof source.close === 'function') {
        try { source.close(); } catch { /* ImageBitmap */ }
      }
      const finish = () => resolve(imgEl);
      imgEl.addEventListener('load', finish, { once: true });
      imgEl.addEventListener('error', () => {
        reject(new Error('לא הצלחנו לקרוא את התמונה'));
      }, { once: true });
      imgEl.src = canvas.toDataURL('image/jpeg', 0.92);
    });
  }

  async function open(file, done) {
    onDone = done;
    setStatus('');
    overlay.hidden = false;
    try {
      const source = await loadImageFromFile(file);
      img = await sourceToPreview(source);
      resetFit();
    } catch (err) {
      overlay.hidden = true;
      throw err;
    }
  }

  function setScale(next, aroundX, aroundY) {
    const prev = userScale;
    userScale = clamp(next, MIN_USER_SCALE, MAX_USER_SCALE);
    if (userScale === prev) return;
    if (Number.isFinite(aroundX) && Number.isFinite(aroundY)) {
      const factor = userScale / prev;
      tx = aroundX + (tx - aroundX) * factor;
      ty = aroundY + (ty - aroundY) * factor;
    }
    constrain();
    applyTransform();
  }

  function pointerPos(event) {
    const rect = circle.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  }

  stage.addEventListener('pointerdown', (event) => {
    if (busy) return;
    stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    } else if (pointers.size === 2) {
      dragging = false;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartScale = userScale;
    }
    event.preventDefault();
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDist > 0) {
        setScale(pinchStartScale * (dist / pinchStartDist));
      }
      return;
    }
    if (!dragging) return;
    tx += event.clientX - lastX;
    ty += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    constrain();
    applyTransform();
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) {
      pinchStartDist = 0;
    }
    if (pointers.size === 0) dragging = false;
  }

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('lostpointercapture', endPointer);

  stage.addEventListener('wheel', (event) => {
    if (busy) return;
    event.preventDefault();
    const pos = pointerPos(event);
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    setScale(userScale * factor, pos.x, pos.y);
  }, { passive: false });

  cancelBtn?.addEventListener('click', () => {
    if (busy) return;
    close();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay && !busy) close();
  });

  saveBtn?.addEventListener('click', async () => {
    if (busy || !img) return;
    busy = true;
    if (saveBtn) saveBtn.disabled = true;
    setStatus(t('profile.photoUploading'), false);
    try {
      measureView();
      const dataUrl = exportCircleCrop(img, {
        tx,
        ty,
        scale: displayScale(),
        viewSize,
      });
      const done = onDone;
      close();
      if (done) await done(dataUrl);
    } catch (err) {
      busy = false;
      if (saveBtn) saveBtn.disabled = false;
      setStatus(err?.message || t('profile.photoErr'), true);
    }
  });

  return { open, close, isOpen };
}
