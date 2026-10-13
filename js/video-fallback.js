import { cannotPlayVideoUrl } from './data-guards.js';

/**
 * Every <video> that autoplays must also work when autoplay is refused or the
 * format can't be decoded (iOS + WebM). See docs/LESSONS.md #3.
 * - play() rejected  -> "tap to play" overlay (tap plays with a user gesture)
 * - decode error / unsupported container -> clear Hebrew notice
 */
const STYLE_ID = 'video-fallback-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
.vf-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:4;
  background:rgba(0,0,0,.35);color:#fff;text-align:center;padding:1rem;font:600 .95rem/1.4 inherit;cursor:pointer}
.vf-overlay[hidden]{display:none}
.vf-overlay span{background:rgba(0,0,0,.6);padding:.6rem 1rem;border-radius:12px;max-width:85%}`;
  document.head.appendChild(st);
}

export const VF_MSG = {
  tap: '▶ הקישו לניגון',
  unsupported: 'המכשיר הזה לא מצליח לנגן את פורמט הסרטון (WebM). נסו מדפדפן אחר או ממחשב.',
  error: 'לא הצלחנו לטעון את הסרטון. בדקו את החיבור ונסו שוב.',
};

export function guardVideo(video, host = video?.parentElement) {
  if (!video || !host || video.dataset.vfBound) return;
  video.dataset.vfBound = '1';
  ensureStyle();
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const overlay = document.createElement('div');
  overlay.className = 'vf-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<span></span>';
  host.appendChild(overlay);
  const show = (msg, tappable) => {
    overlay.firstChild.textContent = msg;
    overlay.dataset.tap = tappable ? '1' : '';
    overlay.hidden = false;
  };
  overlay.addEventListener('click', (e) => {
    if (overlay.dataset.tap !== '1') return;
    e.stopPropagation();
    video.play().then(() => { overlay.hidden = true; }).catch(() => {});
  });
  video.addEventListener('playing', () => { overlay.hidden = true; });
  video.addEventListener('error', () => {
    const src = video.currentSrc || video.src || video.dataset.videoUrl;
    show(cannotPlayVideoUrl(src, (m) => video.canPlayType(m)) ? VF_MSG.unsupported : VF_MSG.error, false);
  });
  const src = video.getAttribute('src') || video.dataset.videoUrl;
  if (cannotPlayVideoUrl(src, (m) => video.canPlayType(m))) show(VF_MSG.unsupported, false);
  // Wrap play() so any refusal (autoplay policy) surfaces the tap overlay.
  const nativePlay = video.play.bind(video);
  video.play = () => {
    const p = nativePlay();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        if (err?.name === 'NotAllowedError') show(VF_MSG.tap, true);
      });
    }
    return p;
  };
}

export function guardVideos(root) {
  (root || document).querySelectorAll('video').forEach((v) => guardVideo(v));
}
