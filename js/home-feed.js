import {
  escapeHtml,
  formatDate,
  googleMapsNavUrl,
  heightLabel,
  spotBriefHtml,
  wazeNavUrl,
} from './ui.js';
import {
  addJumpVideo,
  addJumpVideoComment,
  getAllSpots,
  getJumpVideoComments,
  getJumpVideos,
  getSession,
  normalizeInstagramUrl,
  REGION_LABELS,
} from './store.js';
import { emptySpotMediaHtml, getSpotImage } from './spots-util.js';

const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function dailyShuffle(items) {
  const day = new Date().toISOString().slice(0, 10);
  let seed = 0;
  for (let i = 0; i < day.length; i += 1) seed = (seed * 31 + day.charCodeAt(i)) >>> 0;
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mixFeed(videos, spots) {
  const recs = dailyShuffle(spots.filter((s) => s?.id));
  const items = [];
  let recIndex = 0;
  videos.forEach((video, i) => {
    items.push({ type: 'video', video });
    if ((i + 1) % 3 === 0 && recs[recIndex]) {
      items.push({ type: 'spot', spot: recs[recIndex] });
      recIndex += 1;
    }
  });
  const minSpots = videos.length ? Math.min(6, recs.length) : Math.min(10, recs.length);
  while (items.filter((item) => item.type === 'spot').length < minSpots && recs[recIndex]) {
    items.push({ type: 'spot', spot: recs[recIndex] });
    recIndex += 1;
  }
  return items;
}

function spotSummary(spot) {
  if (!spot) return '';
  return spot.description || spot.warnings || 'אין תיאור עדיין — היכנסו לדף הספוט לפרטים.';
}

function spotDescBlock(spot, bodyClass) {
  const reelUrl = normalizeInstagramUrl(spot?.instagram_url || spot?.instagram_video);
  const brief = spotBriefHtml(spot, reelUrl, { headingTag: 'h3', bodyClass });
  if (brief) return brief;
  const fallback = spotSummary(spot);
  return fallback && fallback !== String(spot?.warnings || '').trim()
    ? `<p class="${bodyClass}">${escapeHtml(fallback)}</p>`
    : '';
}

export function initHomeFeed() {
  const feed = document.getElementById('homeFeed');
  const plus = document.getElementById('homePlus');
  if (!feed || !plus) return;

  plus.innerHTML = PLUS_SVG;
  plus.setAttribute('aria-label', 'העלאת סרטון');

  const state = {
    spots: [],
    session: null,
    activeVideoId: '',
  };

  const qs = new URLSearchParams(window.location.search);
  const openUploadOnLoad = qs.get('upload') === '1';

  plus.addEventListener('click', () => openUpload());

  document.getElementById('sheetBackdrop')?.addEventListener('click', closeSheets);
  document.getElementById('spotSheetClose')?.addEventListener('click', closeSheets);
  document.getElementById('commentsSheetClose')?.addEventListener('click', closeSheets);
  document.getElementById('uploadSheetClose')?.addEventListener('click', closeSheets);

  document.getElementById('uploadForm')?.addEventListener('submit', onUpload);
  document.getElementById('commentsForm')?.addEventListener('submit', onComment);

  feed.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-open-spot]');
    if (chip) {
      openSpotSheet(chip.getAttribute('data-open-spot'));
      return;
    }
    const commentsBtn = e.target.closest('[data-open-comments]');
    if (commentsBtn) {
      openComments(commentsBtn.getAttribute('data-open-comments'));
      return;
    }
    const video = e.target.closest('video');
    if (video) {
      if (video.muted) {
        video.muted = false;
        video.play().catch(() => {});
      } else if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheets();
  });

  bootstrap();

  async function bootstrap() {
    const [spots, videos, session] = await Promise.all([
      getAllSpots(),
      getJumpVideos(40),
      getSession(),
    ]);
    state.spots = spots;
    state.session = session;
    fillSpotSelect(spots);
    feed.innerHTML = mixFeed(videos, spots).map(renderSlide).join('')
      || `<p class="home-feed-empty">עדיין אין סרטונים. לחצו על הפלוס והעלו את הראשון.</p>`;
    observeVideos();
    if (openUploadOnLoad) openUpload();
  }

  function fillSpotSelect(spots) {
    const select = document.getElementById('uploadSpot');
    if (!select) return;
    select.innerHTML = `<option value="">בחרו ספוט</option>${spots
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join('')}`;
  }

  function renderSlide(item) {
    if (item.type === 'video') return renderVideoSlide(item.video);
    return renderSpotSlide(item.spot);
  }

  function renderVideoSlide(video) {
    const spot = state.spots.find((s) => String(s.id) === String(video.spotId));
    const spotName = spot?.name || video.spotName || 'ספוט';
    return `
      <article class="feed-slide" data-kind="video">
        <video src="${escapeHtml(video.videoUrl)}" playsinline webkit-playsinline muted loop preload="metadata"></video>
        <div class="feed-overlay">
          <button type="button" class="feed-spot-chip" data-open-spot="${escapeHtml(video.spotId)}">📍 ${escapeHtml(spotName)}</button>
          <p class="feed-user">${escapeHtml(video.displayName || 'משתמש')}</p>
          ${video.caption ? `<p class="feed-caption">${escapeHtml(video.caption)}</p>` : ''}
          <button type="button" class="feed-comments-btn" data-open-comments="${escapeHtml(video.id)}">תגובות</button>
        </div>
      </article>
    `;
  }

  function renderSpotSlide(spot) {
    const img = getSpotImage(spot);
    const media = img
      ? `<div class="feed-spot-bg" style="background-image: url('${escapeHtml(img)}')"></div>`
      : emptySpotMediaHtml({ className: 'feed-spot-bg feed-spot-bg--empty' });
    const region = REGION_LABELS[spot.region] || '';
    return `
      <article class="feed-slide feed-slide--spot" data-kind="spot">
        ${media}
        <div class="feed-overlay">
          <span class="feed-rec-badge">ספוט מומלץ</span>
          <h2 class="feed-spot-title">${escapeHtml(spot.name)}</h2>
          <p class="feed-spot-meta">${escapeHtml([region, heightLabel(spot)].filter(Boolean).join(' · '))}</p>
          ${spotDescBlock(spot, 'feed-caption')}
          <button type="button" class="feed-spot-chip" data-open-spot="${escapeHtml(spot.id)}">לפרטים</button>
        </div>
      </article>
    `;
  }

  function observeVideos() {
    const videos = [...feed.querySelectorAll('video')];
    if (!videos.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          videos.forEach((other) => {
            if (other !== video) other.pause();
          });
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, { threshold: [0.6, 0.9] });
    videos.forEach((video) => io.observe(video));
  }

  function openSheet(id) {
    closeSheets();
    document.getElementById('sheetBackdrop').hidden = false;
    document.getElementById(id).hidden = false;
    document.body.classList.add('sheet-open');
  }

  function closeSheets() {
    document.getElementById('sheetBackdrop').hidden = true;
    document.getElementById('spotSheet').hidden = true;
    document.getElementById('commentsSheet').hidden = true;
    document.getElementById('uploadSheet').hidden = true;
    document.body.classList.remove('sheet-open');
  }

  function openSpotSheet(spotId) {
    const spot = state.spots.find((s) => String(s.id) === String(spotId));
    const el = document.getElementById('spotSheetBody');
    if (!spot || !el) return;
    const img = getSpotImage(spot);
    const region = REGION_LABELS[spot.region] || '';
    const photo = img
      ? `<div class="sheet-spot-photo" style="background-image: url('${escapeHtml(img)}')"></div>`
      : emptySpotMediaHtml({ className: 'sheet-spot-photo', compact: true });
    el.innerHTML = `
      ${photo}
      <h2>${escapeHtml(spot.name)}</h2>
      <p class="sheet-meta">${escapeHtml([region, heightLabel(spot)].filter(Boolean).join(' · '))}</p>
      ${spotDescBlock(spot, 'sheet-desc')}
      ${spot.warnings ? `<p class="sheet-warn">${escapeHtml(spot.warnings).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="sheet-actions">
        <a class="btn btn-primary btn-full" href="spot.html?id=${encodeURIComponent(spot.id)}">לדף הספוט</a>
        <div class="sheet-nav-row">
          <a class="btn btn-ghost" href="${wazeNavUrl(spot.lat, spot.lng, spot.waze_query)}" target="_blank" rel="noopener">Waze</a>
          <a class="btn btn-ghost" href="${googleMapsNavUrl(spot.lat, spot.lng)}" target="_blank" rel="noopener">Google Maps</a>
        </div>
      </div>
    `;
    openSheet('spotSheet');
  }

  async function openComments(videoId) {
    state.activeVideoId = videoId;
    openSheet('commentsSheet');
    const list = document.getElementById('commentsList');
    const formWrap = document.getElementById('commentsFormWrap');
    list.innerHTML = '<p class="muted">טוען תגובות...</p>';
    if (state.session) {
      formWrap.hidden = false;
    } else {
      formWrap.hidden = true;
    }
    const loginHint = document.getElementById('commentsLoginHint');
    if (loginHint) loginHint.hidden = Boolean(state.session);
    try {
      const comments = await getJumpVideoComments(videoId);
      list.innerHTML = comments.length
        ? comments.map((c) => `
            <article class="comment-item">
              <strong>${escapeHtml(c.displayName)}</strong>
              <time>${escapeHtml(formatDate(c.createdAt))}</time>
              <p>${escapeHtml(c.text)}</p>
            </article>
          `).join('')
        : '<p class="muted">עדיין אין תגובות. שאלו על הספוט או על הקפיצה.</p>';
    } catch {
      list.innerHTML = '<p class="muted">לא הצלחנו לטעון תגובות.</p>';
    }
  }

  async function onComment(e) {
    e.preventDefault();
    if (!state.session) {
      window.location.href = `login.html?redirect=${encodeURIComponent('index.html')}`;
      return;
    }
    const input = document.getElementById('commentText');
    const msg = document.getElementById('commentsMsg');
    const text = input?.value || '';
    try {
      await addJumpVideoComment(state.activeVideoId, text);
      if (input) input.value = '';
      if (msg) msg.textContent = '';
      await openComments(state.activeVideoId);
    } catch (err) {
      if (msg) msg.textContent = err.message || 'שליחה נכשלה';
    }
  }

  function openUpload() {
    if (!state.session) {
      window.location.href = `login.html?redirect=${encodeURIComponent('index.html?upload=1')}`;
      return;
    }
    const msg = document.getElementById('uploadMsg');
    if (msg) msg.textContent = '';
    openSheet('uploadSheet');
  }

  async function onUpload(e) {
    e.preventDefault();
    const msg = document.getElementById('uploadMsg');
    const btn = document.getElementById('uploadSubmit');
    const fd = new FormData(e.target);
    const spotId = String(fd.get('spotId') || '');
    const spot = state.spots.find((s) => s.id === spotId);
    const file = fd.get('video');
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = 'מעלה...';
    try {
      await addJumpVideo({
        spotId,
        spotName: spot?.name || '',
        caption: fd.get('caption') || '',
        file,
      });
      closeSheets();
      e.target.reset();
      const videos = await getJumpVideos(40);
      feed.innerHTML = mixFeed(videos, state.spots).map(renderSlide).join('');
      observeVideos();
      feed.querySelector('.feed-slide')?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      if (msg) msg.textContent = err.message || 'העלאה נכשלה';
    } finally {
      if (btn) btn.disabled = false;
    }
  }
}
