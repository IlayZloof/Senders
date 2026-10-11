import {
  escapeHtml,
  googleMapsNavUrl,
  heightLabel,
  profileAvatarSrc,
  safePhotoSrc,
  spotBriefHtml,
  wazeNavUrl,
} from './ui.js';
import {
  addJumpVideo,
  addJumpVideoComment,
  buildLoginUrl,
  isUploadCancelled,
  canManageJumpVideo,
  decorateReelsVideos,
  deleteJumpVideo,
  getAllSpots,
  getJumpVideoComments,
  getJumpVideoById,
  getJumpVideos,
  getSession,
  isCloudSignedIn,
  normalizeInstagramUrl,
  toggleJumpVideoLike,
  toggleJumpVideoSave,
  updateJumpVideo,
} from './store.js';
import { mountClipEditor } from './clip-editor.js';
import { bindUploadSpotPicker, emptySpotMediaHtml, getSpotImage } from './spots-util.js';
import { dateLocale, regionLabel, t } from './i18n.js';
import { displaySpotDescription, displaySpotName, displaySpotWarnings, spotNameEquals } from './spot-locale.js';
import {
  cacheReelMedia,
  getCachedReelObjectUrl,
  hasCachedReelMedia,
  readCachedReelsPlaylist,
  writeCachedReelsPlaylist,
} from './reels-prefetch.js';

const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const DEFAULT_AVATAR = '/icons/avatar-default.svg';
const ICON_CMT_HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-8.2C1.2 8.6 3.1 5 6.6 5c2 0 3.3 1.1 4.2 2.3C11.7 6.1 13 5 15.1 5c3.5 0 5.4 3.6 3.8 6.8C19 15.6 12 20 12 20z"/></svg>';
const ICON_LIKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-8.2C1.2 8.6 3.1 5 6.6 5c2 0 3.3 1.1 4.2 2.3C11.7 6.1 13 5 15.1 5c3.5 0 5.4 3.6 3.8 6.8C19 15.6 12 20 12 20z"/></svg>';
const ICON_COMMENT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8.2 8.2 0 0 1-8.2 8.2H8l-5 3 1.4-4.2A8.2 8.2 0 1 1 21 12z"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="m8.2 13.1 7.6 4.1M15.8 6.8 8.3 10.8"/></svg>';
const ICON_SAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10a1.2 1.2 0 0 1 1.2 1.2v15.2L12 16.6 5.8 20.4V5.2A1.2 1.2 0 0 1 7 4z"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const ICON_SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.2 6a8 8 0 0 1 0 12"/></svg>';
const ICON_SPEAKER_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m16 9.5 6 6M22 9.5l-6 6"/></svg>';
const ICON_PLAY_STICKER = '<svg viewBox="0 0 72 72" aria-hidden="true"><path d="M27 16.5v39L58 36 27 16.5z"/></svg>';
const CUSTOM_SPOT_PREFIX = 'custom:';

function muteButtonHtml(soundOn) {
  const label = soundOn ? t('reels.sound') : t('reels.muted');
  return `<button type="button" class="reels-mute" data-mute-badge aria-label="${escapeHtml(label)}">${soundOn ? ICON_SPEAKER : ICON_SPEAKER_OFF}</button>`;
}

function formatCount(n) {
  const value = Number(n) || 0;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function loginRedirect(extra = '') {
  const next = extra || `reels.html${window.location.search || ''}`;
  return buildLoginUrl(next);
}

function reelShareUrl(videoId) {
  return new URL(`reels.html?v=${encodeURIComponent(videoId)}`, window.location.origin).href;
}

function profileUrlForUser(userId) {
  const id = String(userId || '').trim();
  return id ? `profile.html?user=${encodeURIComponent(id)}` : 'profile.html';
}

function reelAuthorAvatarSrc(video, session) {
  const ownId = session?.user?.id;
  const isOwn = Boolean(ownId && video?.userId && ownId === video.userId);
  const ownSrc = isOwn
    ? profileAvatarSrc(session.profile) ||
      profileAvatarSrc(session?.user?.user_metadata) ||
      ''
    : '';
  return (
    ownSrc ||
    profileAvatarSrc({
      avatar_url: video?.avatarUrl,
      photo_url: video?.photoUrl,
      avatar: video?.avatar,
      photo: video?.photo,
      image: video?.image,
    }) ||
    DEFAULT_AVATAR
  );
}

function formatRelativeHe(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 45) return t('reels.now');
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w`;
  return new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}

function sessionAvatarSrc(session) {
  const profile = session?.profile || {};
  const meta = session?.user?.user_metadata || {};
  return (
    safePhotoSrc(
      profile.avatar_url ||
      profile.avatar ||
      profile.photo ||
      profile.image ||
      meta.avatar_url ||
      meta.picture ||
      ''
    ) || DEFAULT_AVATAR
  );
}

function commentAvatarHtml(comment) {
  const src = safePhotoSrc(comment?.avatarUrl);
  if (src) {
    return `<img class="reels-cmt-avatar" src="${escapeHtml(src)}" alt="" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">`;
  }
  const initial = String(comment?.displayName || 'מ').trim().charAt(0) || 'מ';
  return `<span class="reels-cmt-avatar-fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

export function initReels() {
  const feed = document.getElementById('reelsFeed');
  const plus = document.getElementById('reelsPlus');
  if (!feed || !plus) return;

  plus.innerHTML = PLUS_SVG;

  const loadingEl = document.getElementById('reelsLoading');
  let firstBlobUrl = '';

  function hideReelsLoading() {
    if (loadingEl) loadingEl.hidden = true;
    document.documentElement.classList.add('reels-cached');
  }

  function showTinyLoader() {
    if (!feed.querySelector('.reels-slide')) {
      if (loadingEl) loadingEl.hidden = false;
    }
  }

  function setSlideBuffering(videoEl, buffering) {
    videoEl?.closest('.reels-slide')?.classList.toggle('is-buffering', Boolean(buffering));
  }

  function firstSlideVideo() {
    const slide = focusId
      ? feed.querySelector(`[data-video-id="${CSS.escape(focusId)}"]`)
      : feed.querySelector('.reels-slide');
    return slide?.querySelector('video') || feed.querySelector('video');
  }

  async function bindCachedFirstVideo() {
    const video = firstSlideVideo();
    if (!video) {
      hideReelsLoading();
      return;
    }
    hideReelsLoading();
    const src = video.dataset.videoUrl || video.getAttribute('src') || '';
    if (src && video.dataset.blobBound !== '1') {
      const cached = await hasCachedReelMedia(src);
      if (cached) {
        const blobUrl = await getCachedReelObjectUrl(src);
        if (blobUrl) {
          if (firstBlobUrl && firstBlobUrl !== blobUrl) URL.revokeObjectURL(firstBlobUrl);
          firstBlobUrl = blobUrl;
          video.src = blobUrl;
          video.dataset.blobBound = '1';
        }
      }
    }
    const ready = video.readyState >= 2;
    setSlideBuffering(video, !ready);
    if (ready) return;
    const clear = () => setSlideBuffering(video, false);
    video.addEventListener('playing', clear, { once: true });
    video.addEventListener('loadeddata', clear, { once: true });
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => clear());
    }
  }

  const qs = new URLSearchParams(window.location.search);
  const openUploadOnLoad = qs.get('upload') === '1';
  const focusId = qs.get('v') || '';
  const editIdOnLoad = qs.get('edit') || '';

  const state = {
    spots: [],
    session: null,
    videos: [],
    activeVideoId: '',
    soundOn: false,
    observer: null,
    editingVideoId: '',
    menuVideoId: '',
  };

  const clipEditor = mountClipEditor(document.getElementById('clipEditorMount'));
  let spotPicker = { reset() {}, pick() {}, getValue() { return { id: '', name: '' }; } };
  let uploadBusy = false;
  const uploadEtaSamples = [];
  const UPLOAD_CANCEL_LOCK_PCT = 90;
  let uploadAbort = null;
  let uploadCancelLocked = false;
  let lastUploadPct = 0;

  plus.addEventListener('click', () => {
    openUpload();
  });
  document.getElementById('reelMenuClose')?.addEventListener('click', closeReelOverlays);
  document.getElementById('reelMenuOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeReelOverlays();
  });
  document.getElementById('reelMenuEdit')?.addEventListener('click', () => {
    const id = state.menuVideoId;
    closeReelOverlays();
    if (id) openEdit(id);
  });
  document.getElementById('reelMenuDelete')?.addEventListener('click', () => {
    openDeleteConfirm();
  });
  document.getElementById('reelDeleteCancel')?.addEventListener('click', () => {
    document.getElementById('reelDeleteOverlay').hidden = true;
  });
  document.getElementById('reelDeleteOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('reelDeleteOverlay').hidden = true;
    }
  });
  document.getElementById('reelDeleteConfirm')?.addEventListener('click', onConfirmDelete);
  document.getElementById('sheetBackdrop')?.addEventListener('click', closeSheets);
  document.getElementById('spotSheetClose')?.addEventListener('click', closeSheets);
  document.getElementById('commentsSheetClose')?.addEventListener('click', closeSheets);
  document.getElementById('uploadSheetClose')?.addEventListener('click', closeSheets);
  document.getElementById('uploadForm')?.addEventListener('submit', onUpload);
  document.getElementById('uploadCancel')?.addEventListener('click', onCancelUpload);
  document.getElementById('commentsForm')?.addEventListener('submit', onComment);
  document.getElementById('commentText')?.addEventListener('input', syncCommentSend);
  document.getElementById('commentText')?.addEventListener('focus', () => {
    if (!isCloudSignedIn(state.session)) {
      window.location.href = loginRedirect(`reels.html?v=${encodeURIComponent(state.activeVideoId || '')}`);
    }
  });
  document.getElementById('commentsList')?.addEventListener('click', (e) => {
    const heart = e.target.closest('.reels-cmt-heart');
    if (heart) heart.classList.toggle('is-on');
  });
  bindCommentsSwipe();
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('reelDeleteOverlay')?.hidden) {
      document.getElementById('reelDeleteOverlay').hidden = true;
      return;
    }
    if (!document.getElementById('reelMenuOverlay')?.hidden) {
      closeReelOverlays();
      return;
    }
    closeSheets();
  });

  feed.addEventListener('click', onFeedClick);

  paintFromCache();
  bootstrap();

  function orderVideos(list) {
    const videos = [...(list || [])];
    if (!focusId) return videos;
    const idx = videos.findIndex((v) => String(v.id) === String(focusId));
    if (idx <= 0) return videos;
    const [hit] = videos.splice(idx, 1);
    return [hit, ...videos];
  }

  function paintFromCache() {
    const cached = orderVideos(readCachedReelsPlaylist());
    if (!cached.length) {
      showTinyLoader();
      return;
    }
    state.videos = cached;
    renderFeed({ keepPlaying: false });
  }

  async function bootstrap() {
    try {
      const videosP = getJumpVideos(16);
      const spotsP = getAllSpots();
      const sessionP = getSession().catch(() => null);

      const rawVideos = await videosP;
      let feedVideos = rawVideos;
      if (focusId && !feedVideos.some((v) => v.id === focusId)) {
        const extra = await getJumpVideoById(focusId);
        if (extra) feedVideos = [extra, ...feedVideos];
      }
      feedVideos = orderVideos(feedVideos);
      const cachedById = Object.fromEntries(
        readCachedReelsPlaylist().map((item) => [String(item.id), item])
      );
      feedVideos = feedVideos.map((video) => ({
        ...video,
        avatarUrl: video.avatarUrl || cachedById[String(video.id)]?.avatarUrl || '',
      }));
      if (!state.videos.length && feedVideos.length) {
        state.videos = feedVideos;
        renderFeed({ keepPlaying: false });
        bindCachedFirstVideo();
      }
      const firstUrl = feedVideos[0]?.videoUrl;
      if (firstUrl) cacheReelMedia(firstUrl).then(() => bindCachedFirstVideo());

      const spots = await spotsP;
      state.spots = spots;
      spotPicker = bindUploadSpotPicker(spots) || spotPicker;

      const session = await sessionP;
      state.session = session;

      mergeLiveFeed(feedVideos);
      decorateReelsVideos(feedVideos, session?.user?.id)
        .then((decorated) => {
          writeCachedReelsPlaylist(decorated);
          mergeLiveFeed(decorated, { patchMetaOnly: true });
        })
        .catch(() => {});

      if (editIdOnLoad) {
        await openEdit(editIdOnLoad);
      } else if (openUploadOnLoad) {
        await openUpload();
      }
    } catch {
      if (state.videos.length) return;
      hideReelsLoading();
      feed.innerHTML = `
        <div class="reels-error">
          <h2>${t('reels.loadFail')}</h2>
          <p>${t('reels.loadFailBody')}</p>
        </div>`;
    }
  }

  function patchSlideMetas() {
    state.videos.forEach((video) => {
      const slide = feed.querySelector(`[data-video-id="${CSS.escape(video.id)}"]`);
      if (!slide) return;
      const likeCount = slide.querySelector('[data-like-count]');
      if (likeCount) likeCount.textContent = formatCount(video.likeCount);
      const likeBtn = slide.querySelector('[data-like]');
      likeBtn?.classList.toggle('is-liked', Boolean(video.liked));
      const saveBtn = slide.querySelector('[data-save]');
      saveBtn?.classList.toggle('is-saved', Boolean(video.saved));
      if (saveBtn) {
        saveBtn.setAttribute('aria-label', video.saved ? t('reels.saved') : t('reels.save'));
      }
      const avatarImg = slide.querySelector('.reels-avatar');
      if (avatarImg) {
        const src = reelAuthorAvatarSrc(video, state.session);
        if (avatarImg.getAttribute('src') !== src) avatarImg.src = src;
      }
      const nameEl = slide.querySelector('.reels-name');
      if (nameEl && video.displayName) nameEl.textContent = video.displayName;
    });
  }

  function mergeLiveFeed(nextVideos, { patchMetaOnly = false } = {}) {
    const incoming = orderVideos(nextVideos).map((video) => {
      const prev = state.videos.find((item) => String(item.id) === String(video.id));
      if (!prev) return video;
      return {
        ...video,
        avatarUrl: video.avatarUrl || prev.avatarUrl || '',
        displayName:
          video.displayName && video.displayName !== t('common.user')
            ? video.displayName
            : prev.displayName || video.displayName,
      };
    });
    if (!incoming.length) return;
    const prevFirst = state.videos[0]?.id;
    const playing = firstSlideVideo();
    const keepFirst =
      Boolean(playing) && prevFirst && String(prevFirst) === String(incoming[0]?.id);
    state.videos = incoming;
    if (keepFirst) {
      if (patchMetaOnly || feed.querySelector('.reels-slide')) {
        patchSlideMetas();
        const existing = new Set(
          [...feed.querySelectorAll('[data-video-id]')].map((el) => el.getAttribute('data-video-id'))
        );
        incoming.forEach((video, index) => {
          if (existing.has(String(video.id))) return;
          feed.insertAdjacentHTML('beforeend', renderSlide(video, index));
        });
        observeVideos();
        return;
      }
    }
    renderFeed({ keepPlaying: false });
    bindCachedFirstVideo();
  }

  function renderFeed({ keepPlaying = false } = {}) {
    if (!state.videos.length) {
      hideReelsLoading();
      feed.innerHTML = `
        <div class="reels-empty">
          <h2>${t('reels.empty')}</h2>
          <p>${t('reels.emptyBody')}</p>
        </div>`;
      return;
    }

    if (!keepPlaying) {
      feed.innerHTML = state.videos.map((video, index) => renderSlide(video, index)).join('');
    }
    observeVideos();
    if (focusId) {
      const target = feed.querySelector(`[data-video-id="${CSS.escape(focusId)}"]`);
      target?.scrollIntoView({ block: 'start' });
    }
    hideReelsLoading();
    bindCachedFirstVideo();
  }

  function renderSlide(video, index = 0) {
    const spot = state.spots.find((s) => String(s.id) === String(video.spotId));
    const spotName = displaySpotName(spot, video.spotName || t('common.spot'));
    const spotChip = spot
      ? `<button type="button" class="reels-spot" data-open-spot="${escapeHtml(video.spotId)}">${escapeHtml(spotName)}</button>`
      : `<span class="reels-spot reels-spot--plain">${escapeHtml(spotName)}</span>`;
    const avatar = reelAuthorAvatarSrc(video, state.session);
    const likedClass = video.liked ? ' is-liked' : '';
    const savedClass = video.saved ? ' is-saved' : '';
    const name = video.displayName || t('common.user');
    const profileHref = profileUrlForUser(video.userId);
    const profileLabel = `${t('nav.profile')}: ${name}`;
    const preload = index < 2 ? 'auto' : 'metadata';
    return `
      <article class="reels-slide" data-video-id="${escapeHtml(video.id)}">
        <video src="${escapeHtml(video.videoUrl)}" data-video-url="${escapeHtml(video.videoUrl)}" playsinline webkit-playsinline muted loop preload="${preload}"></video>
        <div class="reels-gradient"></div>
        ${muteButtonHtml(false)}
        <div class="reels-meta">
          ${spotChip}
          ${video.caption ? `<p class="reels-caption">${escapeHtml(video.caption)}</p>` : ''}
        </div>
        <div class="reels-actions">
          <button type="button" class="reels-action${likedClass}" data-like="${escapeHtml(video.id)}" aria-label="${t('reels.like')}">
            ${ICON_LIKE}
            <span data-like-count>${formatCount(video.likeCount)}</span>
          </button>
          <button type="button" class="reels-action" data-open-comments="${escapeHtml(video.id)}" aria-label="${t('home.sheet.comments')}">
            ${ICON_COMMENT}
            <span>${formatCount(video.commentCount)}</span>
          </button>
          <button type="button" class="reels-action" data-share="${escapeHtml(video.id)}" aria-label="${t('reels.share')}">
            ${ICON_SHARE}
          </button>
          <button type="button" class="reels-action${savedClass}" data-save="${escapeHtml(video.id)}" aria-label="${video.saved ? t('reels.saved') : t('reels.save')}">
            ${ICON_SAVE}
          </button>
          ${
            canManageJumpVideo(video, state.session)
              ? `<button type="button" class="reels-action reels-more" data-more="${escapeHtml(video.id)}" aria-label="${t('reels.more')}">${ICON_MORE}</button>`
              : ''
          }
          <a class="reels-author" data-open-profile="${escapeHtml(video.userId || '')}" href="${escapeHtml(profileHref)}" aria-label="${escapeHtml(profileLabel)}">
            <img class="reels-avatar" src="${escapeHtml(avatar)}" alt="" width="40" height="40" decoding="async" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'">
            <span class="reels-name">${escapeHtml(name)}</span>
          </a>
        </div>
      </article>
    `;
  }

  function applySound(videoEl) {
    if (!videoEl) return;
    videoEl.volume = 1;
    videoEl.muted = !state.soundOn;
    videoEl.defaultMuted = !state.soundOn;
  }

  function syncMuteBadges() {
    feed.querySelectorAll('[data-mute-badge]').forEach((el) => {
      const label = state.soundOn ? t('reels.sound') : t('reels.muted');
      el.innerHTML = state.soundOn ? ICON_SPEAKER : ICON_SPEAKER_OFF;
      el.setAttribute('aria-label', label);
    });
  }

  function observeVideos() {
    state.observer?.disconnect();
    const videos = [...feed.querySelectorAll('video')];
    if (!videos.length) return;
    videos.forEach((video) => applySound(video));
    syncMuteBadges();
    state.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          videos.forEach((other) => {
            if (other !== video) other.pause();
          });
          if (video.dataset.userPaused === '1') {
            video.pause();
            return;
          }
          applySound(video);
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, { threshold: [0.65, 0.9] });
    videos.forEach((video) => state.observer.observe(video));
  }

  function onFeedClick(e) {
    const author = e.target.closest('[data-open-profile]');
    if (author) {
      e.stopPropagation();
      return;
    }
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) {
      onLike(likeBtn);
      return;
    }
    const commentsBtn = e.target.closest('[data-open-comments]');
    if (commentsBtn) {
      openComments(commentsBtn.getAttribute('data-open-comments'));
      return;
    }
    const shareBtn = e.target.closest('[data-share]');
    if (shareBtn) {
      onShare(shareBtn.getAttribute('data-share'));
      return;
    }
    const saveBtn = e.target.closest('[data-save]');
    if (saveBtn) {
      onSave(saveBtn);
      return;
    }
    const moreBtn = e.target.closest('[data-more]');
    if (moreBtn) {
      e.stopPropagation();
      openReelMenu(moreBtn.getAttribute('data-more'));
      return;
    }
    const chip = e.target.closest('[data-open-spot]');
    if (chip) {
      openSpotSheet(chip.getAttribute('data-open-spot'));
      return;
    }
    if (e.target.closest('.reels-mute')) {
      state.soundOn = !state.soundOn;
      feed.querySelectorAll('video').forEach((video) => applySound(video));
      syncMuteBadges();
      return;
    }
    if (
      e.target.closest('.reels-actions') ||
      e.target.closest('.reels-spot') ||
      e.target.closest('.reels-author')
    ) {
      return;
    }
    if (e.target.closest('video') || e.target.closest('.reels-gradient') || e.target.closest('.reels-slide')) {
      const slide = e.target.closest('.reels-slide');
      const videoEl = slide?.querySelector('video');
      if (!videoEl) return;
      if (videoEl.paused) {
        videoEl.dataset.userPaused = '';
        applySound(videoEl);
        videoEl.play().catch(() => {});
        flashPlaySticker(slide, 'resume');
      } else {
        videoEl.dataset.userPaused = '1';
        videoEl.pause();
        flashPlaySticker(slide, 'pause');
      }
    }
  }

  function flashPlaySticker(slide, kind) {
    if (!slide) return;
    let el = slide.querySelector('.reels-play-sticker');
    if (!el) {
      el = document.createElement('div');
      el.className = 'reels-play-sticker';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `<span class="reels-play-sticker-glyph">${ICON_PLAY_STICKER}</span>`;
      slide.appendChild(el);
    }
    window.clearTimeout(el._hideTimer);
    el.classList.remove('is-show', 'is-pause', 'is-resume');
    void el.offsetWidth;
    el.classList.add('is-show', kind === 'pause' ? 'is-pause' : 'is-resume');
    el._hideTimer = window.setTimeout(() => {
      el.classList.remove('is-show', 'is-pause', 'is-resume');
    }, 900);
  }

  function resolveUploadSpot() {
    const value = spotPicker.getValue?.() || { id: '', name: '' };
    const typed = String(value.name || '').trim().slice(0, 80);
    if (!typed) return null;
    const catalog = state.spots.find((s) => String(s.id) === String(value.id));
    if (catalog) return { spotId: String(catalog.id), spotName: catalog.name || typed };
    const exact = state.spots.filter((s) => spotNameEquals(s, typed));
    if (exact.length === 1) {
      return { spotId: String(exact[0].id), spotName: exact[0].name || typed };
    }
    return { spotId: `${CUSTOM_SPOT_PREFIX}${typed}`, spotName: typed };
  }

  async function onLike(btn) {
    const id = btn.getAttribute('data-like');
    const video = state.videos.find((v) => v.id === id);
    if (!video) return;
    if (!isCloudSignedIn(state.session)) {
      window.location.href = loginRedirect(`reels.html?v=${encodeURIComponent(id)}`);
      return;
    }

    const nextLiked = !video.liked;
    video.liked = nextLiked;
    video.likeCount = Math.max(0, (video.likeCount || 0) + (nextLiked ? 1 : -1));
    btn.classList.toggle('is-liked', nextLiked);
    btn.classList.add('is-pop');
    const countEl = btn.querySelector('[data-like-count]');
    if (countEl) countEl.textContent = formatCount(video.likeCount);

    try {
      const result = await toggleJumpVideoLike(id);
      video.liked = result.liked;
      if (video.liked !== nextLiked) {
        video.likeCount = Math.max(0, (video.likeCount || 0) + (result.liked ? 1 : -1));
      }
      btn.classList.toggle('is-liked', video.liked);
      if (countEl) countEl.textContent = formatCount(video.likeCount);
    } catch (err) {
      video.liked = !nextLiked;
      video.likeCount = Math.max(0, (video.likeCount || 0) + (nextLiked ? -1 : 1));
      btn.classList.toggle('is-liked', video.liked);
      if (countEl) countEl.textContent = formatCount(video.likeCount);
      if (String(err?.message || '').includes('צריך להתחבר') || String(err?.message || '').toLowerCase().includes('sign in')) {
        window.location.href = loginRedirect(`reels.html?v=${encodeURIComponent(id)}`);
        return;
      }
      toast(err.message || t('home.feed.sendFail'));
    } finally {
      window.setTimeout(() => btn.classList.remove('is-pop'), 180);
    }
  }

  function syncSaveBtn(btn, saved) {
    btn.classList.toggle('is-saved', saved);
    const label = saved ? t('reels.saved') : t('reels.save');
    btn.setAttribute('aria-label', label);
  }

  async function onSave(btn) {
    const id = btn.getAttribute('data-save');
    const video = state.videos.find((v) => v.id === id);
    if (!video) return;
    if (!isCloudSignedIn(state.session)) {
      window.location.href = loginRedirect(`reels.html?v=${encodeURIComponent(id)}`);
      return;
    }
    if (video.savesAvailable === false) {
      toast(t('reels.savesOff'));
      return;
    }

    const nextSaved = !video.saved;
    video.saved = nextSaved;
    syncSaveBtn(btn, nextSaved);
    btn.classList.add('is-pop');

    try {
      const result = await toggleJumpVideoSave(id);
      video.saved = result.saved;
      syncSaveBtn(btn, video.saved);
      toast(video.saved ? t('reels.savedToast') : t('reels.unsavedToast'));
    } catch (err) {
      video.saved = !nextSaved;
      syncSaveBtn(btn, video.saved);
      if (String(err?.message || '').includes('צריך להתחבר') || String(err?.message || '').toLowerCase().includes('sign in')) {
        window.location.href = loginRedirect(`reels.html?v=${encodeURIComponent(id)}`);
        return;
      }
      toast(err.message || t('reels.saveFail'));
    } finally {
      window.setTimeout(() => btn.classList.remove('is-pop'), 180);
    }
  }

  async function onShare(videoId) {
    const video = state.videos.find((v) => v.id === videoId);
    const url = reelShareUrl(videoId);
    const title = t('reels.shareTitle');
    const shareSpot = state.spots.find((s) => String(s.id) === String(video?.spotId));
    const shareName = displaySpotName(shareSpot, video?.spotName);
    const text = shareName ? t('reels.shareText', { name: shareName }) : t('reels.shareGeneric');
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(t('reels.copied'));
    } catch {
      toast(url);
    }
  }

  function closeReelOverlays() {
    const menu = document.getElementById('reelMenuOverlay');
    const del = document.getElementById('reelDeleteOverlay');
    if (menu) menu.hidden = true;
    if (del) del.hidden = true;
    if (!state.editingVideoId) state.menuVideoId = '';
  }

  function openReelMenu(videoId) {
    const video = state.videos.find((v) => v.id === videoId);
    if (!video || !canManageJumpVideo(video, state.session)) return;
    state.menuVideoId = videoId;
    const overlay = document.getElementById('reelMenuOverlay');
    const del = document.getElementById('reelDeleteOverlay');
    if (del) del.hidden = true;
    if (overlay) overlay.hidden = false;
  }

  function openDeleteConfirm() {
    const video = state.videos.find((v) => v.id === state.menuVideoId);
    if (!video || !canManageJumpVideo(video, state.session)) return;
    const overlay = document.getElementById('reelDeleteOverlay');
    if (overlay) overlay.hidden = false;
  }

  function replaceReelsQuery(params) {
    const next = new URL(window.location.href);
    next.search = params.toString();
    window.history.replaceState({}, '', next);
  }

  async function onConfirmDelete() {
    const id = state.menuVideoId;
    const video = state.videos.find((v) => v.id === id);
    if (!video || !canManageJumpVideo(video, state.session)) return;
    const btn = document.getElementById('reelDeleteConfirm');
    if (btn) btn.disabled = true;
    try {
      await deleteJumpVideo(id);
      closeReelOverlays();
      state.videos = state.videos.filter((v) => v.id !== id);
      if (state.editingVideoId === id) exitComposeEdit();
      renderFeed();
      toast(t('reels.deleted'));
    } catch (err) {
      toast(err.message || t('reels.deleteFail'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function setComposeMode(editing) {
    const title = document.getElementById('uploadSheetTitle');
    const note = document.getElementById('uploadEditNote');
    const clip = document.getElementById('uploadClipGroup');
    const submit = document.getElementById('uploadSubmit');
    if (title) title.textContent = editing ? t('reels.editTitle') : t('home.upload.title');
    if (note) {
      note.hidden = !editing;
      note.textContent = editing ? t('reels.editNote') : '';
    }
    if (clip) clip.hidden = editing;
    if (submit) submit.textContent = editing ? t('reels.saveEdit') : t('common.publish');
  }

  function exitComposeEdit() {
    state.editingVideoId = '';
    setComposeMode(false);
    hideUploadProgress();
    document.getElementById('uploadCaption').value = '';
    spotPicker.reset?.();
    clipEditor?.closePickers?.();
  }

  async function openEdit(videoId) {
    if (!isCloudSignedIn(state.session)) {
      window.location.href = loginRedirect(`reels.html?edit=${encodeURIComponent(videoId)}`);
      return;
    }
    let video = state.videos.find((v) => v.id === videoId);
    if (!video) {
      const extra = await getJumpVideoById(videoId);
      if (extra) video = extra;
    }
    if (!video || !canManageJumpVideo(video, state.session)) {
      toast(t('reels.editFail'));
      return;
    }
    closeReelOverlays();
    state.editingVideoId = video.id;
    state.menuVideoId = video.id;
    const msg = document.getElementById('uploadMsg');
    if (msg) msg.textContent = '';
    hideUploadProgress();
    setComposeMode(true);
    const caption = document.getElementById('uploadCaption');
    if (caption) caption.value = video.caption || '';
    spotPicker.pick?.(video.spotId, video.spotName);
    replaceReelsQuery(new URLSearchParams({ edit: video.id }));
    openSheet('uploadSheet');
  }

  function toast(message) {
    const el = document.getElementById('reelsToast');
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
      el.hidden = true;
    }, 2400);
  }

  function openSheet(id) {
    closeSheets();
    document.getElementById('sheetBackdrop').hidden = false;
    document.getElementById(id).hidden = false;
    document.body.classList.add('sheet-open');
  }

  function closeSheets() {
    if (uploadBusy) return;
    const uploadWasOpen = !document.getElementById('uploadSheet')?.hidden;
    const editId = state.editingVideoId;
    document.getElementById('sheetBackdrop').hidden = true;
    document.getElementById('spotSheet').hidden = true;
    document.getElementById('commentsSheet').hidden = true;
    document.getElementById('uploadSheet').hidden = true;
    clipEditor?.closePickers?.();
    document.body.classList.remove('sheet-open');
    if (uploadWasOpen && editId) {
      exitComposeEdit();
      replaceReelsQuery(new URLSearchParams({ v: editId }));
    }
  }

  function setUploadBusy(busy) {
    uploadBusy = busy;
    const btn = document.getElementById('uploadSubmit');
    const closeBtn = document.getElementById('uploadSheetClose');
    const form = document.getElementById('uploadForm');
    document.getElementById('uploadSheet')?.classList.toggle('is-uploading', busy);
    if (btn) btn.disabled = busy;
    if (closeBtn) closeBtn.disabled = busy;
    form?.querySelectorAll('input, textarea, select, button').forEach((el) => {
      if (el.id === 'uploadSheetClose') return;
      if (el.id === 'uploadCancel') return;
      if (el.id === 'uploadSubmit' || el.type === 'submit') {
        el.disabled = busy;
        return;
      }
      if (el.type === 'hidden') return;
      el.disabled = busy;
    });
  }

  function hideUploadProgress() {
    uploadEtaSamples.length = 0;
    const wrap = document.getElementById('uploadProgress');
    const fill = wrap?.querySelector('.upload-progress-fill');
    const bar = wrap?.querySelector('[role="progressbar"]');
    const label = document.getElementById('uploadProgressLabel');
    if (wrap) {
      wrap.hidden = true;
      wrap.classList.remove('is-indeterminate');
    }
    if (fill) fill.style.width = '0%';
    if (bar) {
      bar.setAttribute('aria-valuenow', '0');
      bar.removeAttribute('aria-valuetext');
    }
    if (label) label.textContent = '';
    const cancel = document.getElementById('uploadCancel');
    if (cancel) {
      cancel.hidden = true;
      cancel.disabled = false;
    }
  }

  function estimateUploadEta(loaded, total) {
    const now = Date.now();
    uploadEtaSamples.push({ loaded, now });
    if (uploadEtaSamples.length > 8) uploadEtaSamples.shift();
    if (uploadEtaSamples.length < 3) return null;
    const first = uploadEtaSamples[0];
    const last = uploadEtaSamples[uploadEtaSamples.length - 1];
    const dt = (last.now - first.now) / 1000;
    const db = last.loaded - first.loaded;
    if (dt < 0.8 || db <= 0) return null;
    const remain = (total - loaded) / (db / dt);
    if (!Number.isFinite(remain) || remain < 2 || remain > 600) return null;
    return Math.round(remain);
  }

  function showUploadProgress({ mode, pct, text }) {
    const wrap = document.getElementById('uploadProgress');
    const fill = wrap?.querySelector('.upload-progress-fill');
    const bar = wrap?.querySelector('[role="progressbar"]');
    const label = document.getElementById('uploadProgressLabel');
    if (!wrap) return;
    wrap.hidden = false;
    wrap.classList.toggle('is-indeterminate', mode === 'indeterminate');
    const cancel = document.getElementById('uploadCancel');
    if (cancel) {
      cancel.hidden = false;
      cancel.disabled = uploadCancelLocked;
    }
    if (mode === 'determinate' && Number.isFinite(pct)) {
      const clamped = Math.max(0, Math.min(100, pct));
      if (fill) fill.style.width = `${clamped}%`;
      if (bar) {
        bar.setAttribute('aria-valuenow', String(Math.round(clamped)));
        bar.setAttribute('aria-valuetext', text || `${Math.round(clamped)}%`);
      }
    } else if (bar) {
      bar.removeAttribute('aria-valuenow');
      if (text) bar.setAttribute('aria-valuetext', text);
    }
    if (label) label.textContent = text || '';
  }

  function lockUploadCancel() {
    uploadCancelLocked = true;
    const cancel = document.getElementById('uploadCancel');
    if (cancel) cancel.disabled = true;
  }

  function onCancelUpload() {
    if (!uploadBusy) return;
    if (uploadCancelLocked || lastUploadPct >= UPLOAD_CANCEL_LOCK_PCT) {
      lockUploadCancel();
      const msg = document.getElementById('uploadMsg');
      if (msg) msg.textContent = t('reels.uploadCancelTooLate');
      return;
    }
    uploadAbort?.abort();
  }

  function spotDescBlock(spot, bodyClass) {
    const reelUrl = normalizeInstagramUrl(spot?.instagram_url || spot?.instagram_video);
    const brief = spotBriefHtml(spot, reelUrl, { headingTag: 'h3', bodyClass });
    if (brief) return brief;
    const fallback = displaySpotDescription(spot) || '';
    return fallback ? `<p class="${bodyClass}">${escapeHtml(fallback)}</p>` : '';
  }

  function openSpotSheet(spotId) {
    const spot = state.spots.find((s) => String(s.id) === String(spotId));
    const el = document.getElementById('spotSheetBody');
    if (!spot || !el) return;
    const img = getSpotImage(spot);
    const region = regionLabel(spot.region) || '';
    const photo = img
      ? `<div class="sheet-spot-photo" style="background-image: url('${escapeHtml(img)}')"></div>`
      : emptySpotMediaHtml({ className: 'sheet-spot-photo', compact: true });
    el.innerHTML = `
      ${photo}
      <h2>${escapeHtml(displaySpotName(spot))}</h2>
      <p class="sheet-meta">${escapeHtml([region, heightLabel(spot)].filter(Boolean).join(' · '))}</p>
      ${spotDescBlock(spot, 'sheet-desc')}
      ${displaySpotWarnings(spot) ? `<p class="sheet-warn">${escapeHtml(displaySpotWarnings(spot)).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="sheet-actions">
        <a class="btn btn-primary btn-full" href="spot.html?id=${encodeURIComponent(spot.id)}">${t('home.feed.toSpot')}</a>
        <div class="sheet-nav-row">
          <a class="btn btn-ghost" href="${wazeNavUrl(spot.lat, spot.lng, spot.waze_query)}" target="_blank" rel="noopener">Waze</a>
          <a class="btn btn-ghost" href="${googleMapsNavUrl(spot.lat, spot.lng)}" target="_blank" rel="noopener">Google Maps</a>
        </div>
      </div>
    `;
    openSheet('spotSheet');
  }

  function setCommentsCount(n) {
    const el = document.getElementById('commentsCount');
    if (el) el.textContent = n ? String(n) : '';
  }

  function syncCommentSend() {
    const input = document.getElementById('commentText');
    const send = document.getElementById('commentsSend');
    if (send) send.hidden = !String(input?.value || '').trim();
  }

  function syncComposerAvatar() {
    const img = document.getElementById('commentsComposerAvatar');
    if (img) img.src = sessionAvatarSrc(state.session);
  }

  function withViewerAvatar(comments) {
    const mine = sessionAvatarSrc(state.session);
    const myId = state.session?.user?.id;
    if (!myId || mine === DEFAULT_AVATAR) return comments;
    return comments.map((c) => (c.userId === myId && !safePhotoSrc(c.avatarUrl) ? { ...c, avatarUrl: mine } : c));
  }

  function renderComment(c) {
    return `
      <article class="reels-cmt">
        ${commentAvatarHtml(c)}
        <div class="reels-cmt-body">
          <p class="reels-cmt-meta">
            <span class="reels-cmt-name">${escapeHtml(c.displayName || t('common.user'))}</span>
            <time class="reels-cmt-time">${escapeHtml(formatRelativeHe(c.createdAt))}</time>
          </p>
          <p class="reels-cmt-text">${escapeHtml(c.text)}</p>
        </div>
        <button type="button" class="reels-cmt-heart" aria-label="${t('reels.cmtLike')}">${ICON_CMT_HEART}</button>
      </article>
    `;
  }

  function bindCommentsSwipe() {
    const grab = document.getElementById('commentsSheetGrab');
    if (!grab) return;
    let startY = 0;
    grab.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
    });
    grab.addEventListener('pointerup', (e) => {
      if (e.clientY - startY > 72) closeSheets();
    });
  }

  async function openComments(videoId) {
    state.activeVideoId = videoId;
    const loginLink = document.getElementById('commentsLoginLink');
    if (loginLink) loginLink.href = loginRedirect(`reels.html?v=${encodeURIComponent(videoId)}`);
    syncComposerAvatar();
    syncCommentSend();
    const video = state.videos.find((v) => v.id === videoId);
    setCommentsCount(video?.commentCount || '');
    openSheet('commentsSheet');
    const list = document.getElementById('commentsList');
    const msg = document.getElementById('commentsMsg');
    if (msg) {
      msg.hidden = true;
      msg.textContent = '';
    }
    list.innerHTML = `<p class="reels-comments-status">${t('home.feed.loadComments')}</p>`;
    try {
      const comments = withViewerAvatar(await getJumpVideoComments(videoId));
      setCommentsCount(comments.length);
      list.innerHTML = comments.length
        ? comments.map(renderComment).join('')
        : `<p class="reels-comments-empty">${t('reels.noCmt')}</p>`;
    } catch {
      list.innerHTML = `<p class="reels-comments-status">${t('home.feed.failComments')}</p>`;
    }
  }

  async function onComment(e) {
    e.preventDefault();
    if (!isCloudSignedIn(state.session)) {
      window.location.href = loginRedirect(`reels.html?v=${encodeURIComponent(state.activeVideoId || '')}`);
      return;
    }
    const input = document.getElementById('commentText');
    const msg = document.getElementById('commentsMsg');
    try {
      if (msg) {
        msg.hidden = true;
        msg.textContent = '';
      }
      await addJumpVideoComment(state.activeVideoId, input?.value || '');
      if (input) input.value = '';
      syncCommentSend();
      const video = state.videos.find((v) => v.id === state.activeVideoId);
      if (video) video.commentCount = (video.commentCount || 0) + 1;
      const btn = feed.querySelector(`[data-open-comments="${CSS.escape(state.activeVideoId)}"] span`);
      if (btn && video) btn.textContent = formatCount(video.commentCount);
      await openComments(state.activeVideoId);
    } catch (err) {
      if (msg) {
        msg.hidden = false;
        msg.textContent = err.message || t('home.feed.sendFail');
      }
    }
  }

  async function refreshCloudSession() {
    const session = await getSession();
    state.session = session;
    return session;
  }

  async function openUpload() {
    const session = await refreshCloudSession();
    if (!isCloudSignedIn(session)) {
      window.location.href = loginRedirect('reels.html?upload=1');
      return;
    }
    exitComposeEdit();
    const msg = document.getElementById('uploadMsg');
    if (msg) msg.textContent = '';
    hideUploadProgress();
    openSheet('uploadSheet');
    if (!clipEditor?.hasClips()) clipEditor?.openPickers?.();
  }

  async function onUpload(e) {
    e.preventDefault();
    if (uploadBusy) return;
    const msg = document.getElementById('uploadMsg');
    const fd = new FormData(e.target);
    const resolved = resolveUploadSpot();
    if (!resolved) {
      if (msg) msg.textContent = t('home.upload.chooseSpot');
      return;
    }
    const { spotId, spotName } = resolved;
    if (msg) msg.textContent = '';
    if (state.editingVideoId) {
      setUploadBusy(true);
      try {
        const updated = await updateJumpVideo(state.editingVideoId, {
          spotId,
          spotName,
          caption: fd.get('caption') || '',
        });
        const idx = state.videos.findIndex((v) => v.id === updated.id);
        if (idx >= 0) state.videos[idx] = { ...state.videos[idx], ...updated };
        const editId = updated.id;
        uploadBusy = false;
        closeSheets();
        renderFeed();
        const target = feed.querySelector(`[data-video-id="${CSS.escape(editId)}"]`);
        target?.scrollIntoView({ block: 'start' });
        replaceReelsQuery(new URLSearchParams({ v: editId }));
        toast(t('reels.edited'));
      } catch (err) {
        if (msg) msg.textContent = err.message || t('reels.editFail');
      } finally {
        setUploadBusy(false);
      }
      return;
    }
    setUploadBusy(true);
    uploadEtaSamples.length = 0;
    uploadCancelLocked = false;
    lastUploadPct = 0;
    uploadAbort = new AbortController();
    showUploadProgress({ mode: 'indeterminate', text: t('reels.uploading') });
    try {
      const session = await refreshCloudSession();
      if (!isCloudSignedIn(session)) {
        window.location.href = loginRedirect('reels.html?upload=1');
        return;
      }
      if (!clipEditor?.hasClips()) throw new Error(t('clip.needVideo'));
      const file = await clipEditor.exportFile();
      if (uploadAbort?.signal.aborted) {
        const cancelled = new Error('UPLOAD_CANCELLED');
        cancelled.code = 'UPLOAD_CANCELLED';
        throw cancelled;
      }
      const live = await refreshCloudSession();
      if (!isCloudSignedIn(live)) {
        window.location.href = loginRedirect('reels.html?upload=1');
        return;
      }
      showUploadProgress({ mode: 'indeterminate', text: t('reels.uploading') });
      const created = await addJumpVideo({
        spotId,
        spotName,
        caption: fd.get('caption') || '',
        file,
        signal: uploadAbort.signal,
        onProgress: (info) => {
          if (info?.cancelLocked) lockUploadCancel();
          if (info?.phase === 'save') {
            lastUploadPct = 100;
            lockUploadCancel();
            showUploadProgress({ mode: 'determinate', pct: 100, text: t('reels.saving') });
            return;
          }
          if (info?.indeterminate) {
            showUploadProgress({ mode: 'indeterminate', text: t('reels.uploading') });
            return;
          }
          const total = Number(info?.total) || 0;
          const loaded = Number(info?.loaded) || 0;
          if (!total) {
            showUploadProgress({ mode: 'indeterminate', text: t('reels.uploading') });
            return;
          }
          const pct = Math.round((loaded / total) * 100);
          lastUploadPct = pct;
          if (pct >= UPLOAD_CANCEL_LOCK_PCT) lockUploadCancel();
          const eta = estimateUploadEta(loaded, total);
          const base = t('reels.uploadingPct', { pct });
          const text = eta ? `${base} · ${t('reels.uploadEta', { sec: eta })}` : base;
          showUploadProgress({ mode: 'determinate', pct, text });
        },
      });
      if (!created?.id || !created.videoUrl) {
        throw new Error(t('reels.publishFail'));
      }
      state.session = (await refreshCloudSession()) || state.session;
      let shown = created;
      try {
        const [decorated] = await decorateReelsVideos([created], state.session?.user?.id);
        if (decorated?.id) shown = decorated;
      } catch {
        /* feed still shows the inserted row */
      }
      state.videos = [shown, ...state.videos.filter((v) => v.id !== created.id)];
      writeCachedReelsPlaylist(state.videos);
      if (shown.videoUrl) cacheReelMedia(shown.videoUrl);
      hideUploadProgress();
      e.target.reset();
      clipEditor.reset();
      exitComposeEdit();
      uploadBusy = false;
      closeSheets();
      renderFeed();
      const target = feed.querySelector(`[data-video-id="${CSS.escape(created.id)}"]`);
      target?.scrollIntoView({ block: 'start' });
      replaceReelsQuery(new URLSearchParams({ v: created.id }));
      toast(t('reels.published'));
    } catch (err) {
      hideUploadProgress();
      if (isUploadCancelled(err)) {
        if (msg) msg.textContent = t('reels.uploadCancelled');
        return;
      }
      console.warn('[reels-publish]', { step: 'ui-fail', message: String(err?.message || '').slice(0, 180) });
      const text = String(err?.message || '');
      const sessionGone = !isCloudSignedIn(state.session);
      if (sessionGone && (text.includes('צריך להתחבר') || text.toLowerCase().includes('sign in'))) {
        window.location.href = loginRedirect('reels.html?upload=1');
        return;
      }
      if (msg) msg.textContent = err.message || t('reels.uploadFail');
    } finally {
      uploadAbort = null;
      setUploadBusy(false);
    }
  }
}
