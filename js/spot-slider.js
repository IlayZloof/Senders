/**
 * Physical (LTR) touch carousel — swipe follows the finger, not RTL reading order.
 * The slider root is dir=ltr so Hebrew page direction cannot invert translateX.
 */
export function initSpotSlider(root) {
  if (!root) return;

  const track = root.querySelector('.spot-slider-track');
  const viewport = root.querySelector('.spot-slider-viewport');
  const prevBtn = root.querySelector('.spot-slider-prev');
  const nextBtn = root.querySelector('.spot-slider-next');
  const dots = [...root.querySelectorAll('.spot-slider-dot')];
  const slides = [...root.querySelectorAll('.spot-slider-slide')];
  const count = slides.length;
  const videos = [...root.querySelectorAll('video')];

  if (!track || !viewport || !count) return;

  let index = 0;
  let startX = 0;
  let dragging = false;
  let pointerId = null;

  function slideOffset(i) {
    return -i * 100;
  }

  function syncPlayback(i) {
    videos.forEach((video) => {
      video.muted = true;
      video.defaultMuted = true;
      const on = slides[i]?.contains(video);
      if (on) {
        video.play().catch(() => {});
      } else {
        video.pause();
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    });
  }

  function goTo(i, animate = true) {
    index = Math.max(0, Math.min(count - 1, i));
    track.style.transition = animate ? '' : 'none';
    track.style.transform = `translateX(${slideOffset(index)}%)`;
    dots.forEach((dot, di) => {
      const active = di === index;
      dot.classList.toggle('active', active);
      dot.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === count - 1;
    syncPlayback(index);
  }

  if (count <= 1) {
    syncPlayback(0);
    return;
  }

  prevBtn?.addEventListener('click', () => goTo(index - 1));
  nextBtn?.addEventListener('click', () => goTo(index + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    pointerId = e.pointerId;
    startX = e.clientX;
    track.style.transition = 'none';
    viewport.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dragPct = (dx / viewport.offsetWidth) * 100;
    const offset = slideOffset(index) + dragPct;
    track.style.transform = `translateX(${offset}%)`;
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    viewport.releasePointerCapture?.(e.pointerId);
    const dx = e.clientX - startX;
    const threshold = Math.min(60, viewport.offsetWidth * 0.15);
    if (dx < -threshold) goTo(index + 1);
    else if (dx > threshold) goTo(index - 1);
    else goTo(index);
  }

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerUp);

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
    }
  });

  goTo(0, false);
}
