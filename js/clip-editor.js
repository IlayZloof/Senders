/**
 * Shared jump-video clip editor (trim, reorder, multi-clip).
 *
 * Encoding: canvas/MediaRecorder is NOT used as the default. We prefer
 * `HTMLVideoElement.captureStream()` + MediaRecorder so trimmed ranges are
 * written before upload. Audio is mixed in via Web Audio
 * (`MediaElementSource` → `MediaStreamDestination`) at full gain — never
 * from a muted/near-silent video element, and never from canvas-only
 * `captureStream()` (that path is video-only).
 * ffmpeg.wasm is not in this app (~20MB+ wasm) and would bloat the PWA.
 * A single untrimmed clip uploads the original file. If we cannot attach
 * an audio track, a single clip also uploads the original (skip re-encode).
 */
import { MAX_JUMP_VIDEO_BYTES } from './store.js';
import { t } from './i18n.js';

const MAX_CLIPS = 8;
/** Larger sources are only accepted when this device can trim/re-encode them. */
const MAX_TRIM_SOURCE_BYTES = 120 * 1024 * 1024;

function canTrimOnDevice() {
  if (typeof MediaRecorder === 'undefined') return false;
  const v = typeof document !== 'undefined' ? document.createElement('video') : null;
  const hasCapture = Boolean(v && (typeof v.captureStream === 'function' || typeof v.mozCaptureStream === 'function'));
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  return hasCapture || Boolean(canvas && typeof canvas.captureStream === 'function');
}

/** Picker limit: 40MB (bucket limit) unless the device can trim, then up to 120MB per source clip. */
function maxSourceBytes() {
  return canTrimOnDevice() ? MAX_TRIM_SOURCE_BYTES : MAX_JUMP_VIDEO_BYTES;
}
const MIN_KEEP = 0.25;
const SRC_EPSILON = 0.3;

function uid() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if (m <= 0) return `${r.toFixed(1)}s`;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}

function keptDuration(clip) {
  return Math.max(0, clip.end - clip.start);
}

function isFullRange(clip) {
  return clip.start <= SRC_EPSILON && clip.end >= clip.duration - SRC_EPSILON;
}

function pickRecorderMime() {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,vorbis',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm',
    'video/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function attachElementAudio(video) {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(video);
    const dest = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(dest);
    return {
      ctx,
      dest,
      stop() {
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
        try {
          gain.disconnect();
        } catch {
          /* ignore */
        }
        try {
          ctx.close();
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return null;
  }
}

function composeRecordStream(videoStream, audioStream) {
  const out = new MediaStream();
  (videoStream?.getVideoTracks() || []).forEach((track) => out.addTrack(track));
  const tapped = (audioStream?.getAudioTracks() || []).filter((track) => track.readyState !== 'ended');
  if (tapped.length) {
    tapped.forEach((track) => out.addTrack(track));
    return out;
  }
  (videoStream?.getAudioTracks() || [])
    .filter((track) => track.readyState !== 'ended')
    .forEach((track) => out.addTrack(track));
  return out;
}

function waitEvent(el, name, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      el.removeEventListener(name, onOk);
      el.removeEventListener('error', onErr);
      reject(new Error('timeout'));
    }, timeoutMs);
    const onOk = () => {
      window.clearTimeout(timer);
      el.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      window.clearTimeout(timer);
      el.removeEventListener(name, onOk);
      reject(new Error('media'));
    };
    el.addEventListener(name, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

const VIDEO_NAME = /\.(mp4|m4v|mov|qt|webm|3gp|3gpp|mkv)$/i;

function isLikelyVideo(file) {
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('video/')) return true;
  if (type.startsWith('image/') || type.startsWith('audio/')) return false;
  if (VIDEO_NAME.test(file.name || '')) return true;
  /* iOS Photos often leaves type empty on multi-select. */
  return !type;
}

function readDuration(video) {
  const duration = Number(video.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function loadMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        /* ignore */
      }
      reject(new Error(t('clip.encodeFail')));
    };
    const ok = (duration) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({ url, duration });
    };
    const timer = window.setTimeout(fail, 18000);
    const tryDuration = () => {
      const duration = readDuration(video);
      if (duration) ok(duration);
      return Boolean(duration);
    };
    video.addEventListener('loadedmetadata', () => {
      if (tryDuration()) return;
      try {
        video.currentTime = 1e9;
      } catch {
        /* iOS reports Infinity until a far seek */
      }
    });
    video.addEventListener('durationchange', tryDuration);
    video.addEventListener('seeked', tryDuration);
    video.addEventListener('loadeddata', tryDuration);
    video.onerror = fail;
    video.src = url;
    try {
      video.load();
    } catch {
      /* ignore */
    }
  });
}

function captureThumb(url, time) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    let done = false;
    const finish = (src) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve(src || '');
    };
    const timer = window.setTimeout(() => finish(''), 6000);
    video.onloadeddata = () => {
      const seekTo = Math.min(Math.max(0.05, time || 0.2), Math.max(0, (video.duration || 1) - 0.05));
      const grab = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = video.videoWidth || 360;
          const h = video.videoHeight || 640;
          const scale = 160 / Math.max(w, 1);
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL('image/jpeg', 0.72));
        } catch {
          finish('');
        }
      };
      video.onseeked = grab;
      try {
        video.currentTime = seekTo;
      } catch {
        grab();
      }
    };
    video.onerror = () => finish('');
    video.src = url;
  });
}

function makeHiddenVideo() {
  const video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.controls = false;
  video.style.cssText = 'position:fixed;inset:auto auto -200px -200px;width:160px;height:90px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);
  return video;
}

async function prepareVideo(video, clip) {
  if (video.src !== clip.url) {
    video.src = clip.url;
    await waitEvent(video, 'loadedmetadata');
  }
  if (video.readyState < 1) await waitEvent(video, 'loadedmetadata');
  const start = Math.min(clip.start, Math.max(0, (video.duration || clip.duration) - MIN_KEEP));
  video.currentTime = start;
  await waitEvent(video, 'seeked', 12000).catch(() => {});
}

function playUntil(video, end) {
  return new Promise((resolve, reject) => {
    const stop = () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onErr);
      video.pause();
      resolve();
    };
    const onTime = () => {
      if (video.currentTime >= end - 0.03) stop();
    };
    const onEnded = () => stop();
    const onErr = () => reject(new Error(t('clip.encodeFail')));
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onErr);
    const play = video.play();
    if (play && typeof play.catch === 'function') {
      play.catch(() => reject(new Error(t('clip.encodeFail'))));
    }
  });
}

function startCanvasFallback(video) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const sizeToVideo = () => {
    canvas.width = Math.max(16, video.videoWidth || 720);
    canvas.height = Math.max(16, video.videoHeight || 1280);
  };
  sizeToVideo();
  let running = true;
  const draw = () => {
    if (!running) return;
    if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      sizeToVideo();
    }
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(draw);
  };
  draw();
  return {
    stream: canvas.captureStream(30),
    stop() {
      running = false;
    },
  };
}

async function encodeClips(clips, onStatus) {
  const list = clips.filter((c) => keptDuration(c) >= MIN_KEEP);
  if (!list.length) throw new Error(t('clip.needVideo'));

  if (list.length === 1 && isFullRange(list[0])) {
    if (list[0].file.size > MAX_JUMP_VIDEO_BYTES) throw new Error(t('clip.tooBigOut'));
    return list[0].file;
  }

  if (typeof MediaRecorder === 'undefined') throw new Error(t('clip.encodeFail'));
  onStatus?.(t('clip.encoding'));

  const video = makeHiddenVideo();
  video.muted = false;
  video.volume = 1;
  video.defaultMuted = false;
  let fallback = null;
  let audioTap = null;

  try {
    await prepareVideo(video, list[0]);
    audioTap = attachElementAudio(video);
    if (audioTap?.ctx?.state === 'suspended') {
      await audioTap.ctx.resume().catch(() => {});
    }
    try {
      await video.play();
      video.pause();
    } catch {
      /* captureStream still works on many browsers without a play() */
    }
    let captured = null;
    if (typeof video.captureStream === 'function') captured = video.captureStream();
    else if (typeof video.mozCaptureStream === 'function') captured = video.mozCaptureStream();
    if (!captured || !captured.getVideoTracks().length) {
      fallback = startCanvasFallback(video);
      captured = fallback.stream;
    }

    const stream = composeRecordStream(captured, audioTap?.dest?.stream);
    if (!stream.getAudioTracks().length && list.length === 1) {
      if (list[0].file.size > MAX_JUMP_VIDEO_BYTES) throw new Error(t('clip.tooBigOut'));
      return list[0].file;
    }

    const mime = pickRecorderMime();
    let rec;
    try {
      rec = new MediaRecorder(stream, mime
        ? { mimeType: mime, audioBitsPerSecond: 128000, videoBitsPerSecond: 2500000 }
        : { audioBitsPerSecond: 128000, videoBitsPerSecond: 2500000 });
    } catch {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    }
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise((resolve, reject) => {
      rec.onstop = resolve;
      rec.onerror = () => reject(new Error(t('clip.encodeFail')));
    });
    rec.start(250);

    for (let i = 0; i < list.length; i += 1) {
      onStatus?.(t('clip.encoding'));
      if (i > 0) await prepareVideo(video, list[i]);
      else {
        video.currentTime = list[i].start;
        await waitEvent(video, 'seeked', 12000).catch(() => {});
      }
      await playUntil(video, list[i].end);
    }

    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    fallback?.stop();

    // MediaRecorder reports e.g. "video/webm;codecs=vp9,opus"; storage only allows the base MIME.
    const rawType = rec.mimeType || mime || 'video/webm';
    const type = String(rawType).split(';')[0].trim().toLowerCase().includes('mp4') ? 'video/mp4' : 'video/webm';
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error(t('clip.encodeFail'));
    if (blob.size > MAX_JUMP_VIDEO_BYTES) throw new Error(t('clip.tooBigOut'));
    const ext = type === 'video/mp4' ? 'mp4' : 'webm';
    return new File([blob], `jump-${Date.now()}.${ext}`, { type });
  } finally {
    fallback?.stop();
    audioTap?.stop();
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

function iconPlay() {
  return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
}
function iconPause() {
  return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3v14H7zm7 0h3v14h-3z"/></svg>';
}
function iconUp() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>';
}
function iconDown() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg>';
}
function iconTrash() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7"/></svg>';
}
function iconPlus() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
}

export function mountClipEditor(root, { maxBytes = MAX_JUMP_VIDEO_BYTES, onChange } = {}) {
  if (!root) return null;

  const state = {
    clips: [],
    sequencePlaying: false,
    seqIndex: 0,
    encoding: false,
  };

  root.classList.add('clip-editor');
  root.innerHTML = `
    <div class="clip-editor-empty">
      <div class="clip-editor-sources">
        <button type="button" class="clip-editor-pick" data-open-source aria-label="${t('clip.pick')}">
          ${iconPlus()}
        </button>
      </div>
    </div>
    <div class="clip-editor-body" hidden>
      <div class="clip-editor-stage">
        <video class="clip-editor-seq" playsinline webkit-playsinline></video>
        <button type="button" class="clip-editor-seq-btn">${iconPlay()} ${t('clip.playAll')}</button>
      </div>
      <ul class="clip-editor-list"></ul>
      <div class="clip-editor-more">
        <button type="button" class="clip-editor-add" data-open-source aria-label="${t('clip.addMore')}">
          ${iconPlus()}
        </button>
      </div>
    </div>
    <p class="clip-editor-status" hidden></p>
    <input type="file" class="clip-editor-file clip-editor-gallery" accept="video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v,video/*" multiple tabindex="-1" />
  `;

  const empty = root.querySelector('.clip-editor-empty');
  const body = root.querySelector('.clip-editor-body');
  const listEl = root.querySelector('.clip-editor-list');
  const seqVideo = root.querySelector('.clip-editor-seq');
  const seqBtn = root.querySelector('.clip-editor-seq-btn');
  const statusEl = root.querySelector('.clip-editor-status');
  const galleryInput = root.querySelector('.clip-editor-gallery');
  let seqBound = false;

  function openGalleryPicker() {
    galleryInput?.click();
  }

  function setStatus(msg) {
    statusEl.hidden = !msg;
    statusEl.textContent = msg || '';
  }

  function notify() {
    onChange?.(state.clips.length > 0);
  }

  function stopSequence() {
    state.sequencePlaying = false;
    state.seqIndex = 0;
    seqVideo.pause();
    seqBtn.innerHTML = `${iconPlay()} ${t('clip.playAll')}`;
  }

  async function playSequenceFrom(index) {
    if (!state.clips.length) return;
    state.sequencePlaying = true;
    seqBtn.innerHTML = `${iconPause()} ${t('clip.pause')}`;
    for (let i = index; i < state.clips.length; i += 1) {
      if (!state.sequencePlaying) return;
      state.seqIndex = i;
      const clip = state.clips[i];
      seqVideo.src = clip.url;
      await waitEvent(seqVideo, 'loadedmetadata').catch(() => {});
      seqVideo.currentTime = clip.start;
      await waitEvent(seqVideo, 'seeked', 8000).catch(() => {});
      try {
        await seqVideo.play();
      } catch {
        stopSequence();
        return;
      }
      await new Promise((resolve) => {
        const done = () => {
          seqVideo.removeEventListener('timeupdate', onTime);
          seqVideo.removeEventListener('ended', done);
          resolve();
        };
        const onTime = () => {
          if (!state.sequencePlaying) {
            done();
            return;
          }
          if (seqVideo.currentTime >= clip.end - 0.04) {
            seqVideo.pause();
            done();
          }
        };
        seqVideo.addEventListener('timeupdate', onTime);
        seqVideo.addEventListener('ended', done);
      });
    }
    stopSequence();
  }

  if (!seqBound) {
    seqBound = true;
    seqVideo.addEventListener('click', () => {
      if (state.sequencePlaying) {
        stopSequence();
      } else {
        playSequenceFrom(0);
      }
    });
  }

  function render() {
    const has = state.clips.length > 0;
    empty.hidden = has;
    body.hidden = !has;
    if (!has) {
      stopSequence();
      seqVideo.removeAttribute('src');
      listEl.innerHTML = '';
      notify();
      return;
    }

    if (!seqVideo.getAttribute('src') && state.clips[0]) {
      seqVideo.src = state.clips[0].url;
    }

    listEl.innerHTML = state.clips.map((clip, index) => {
      const pctStart = clip.duration ? (clip.start / clip.duration) * 100 : 0;
      const pctEnd = clip.duration ? (clip.end / clip.duration) * 100 : 100;
      return `
        <li class="clip-card" data-id="${clip.id}">
          <div class="clip-card-top">
            <span class="clip-card-index">${index + 1}</span>
            <span class="clip-card-meta">${formatTime(clip.start)} – ${formatTime(clip.end)}</span>
            <div class="clip-card-actions">
              <button type="button" data-act="up" ${index === 0 ? 'disabled' : ''} aria-label="${t('clip.up')}">${iconUp()}</button>
              <button type="button" data-act="down" ${index === state.clips.length - 1 ? 'disabled' : ''} aria-label="${t('clip.down')}">${iconDown()}</button>
              <button type="button" data-act="remove" aria-label="${t('clip.remove')}">${iconTrash()}</button>
            </div>
          </div>
          <div class="clip-trim" dir="ltr">
            <div class="clip-trim-track" aria-hidden="true">
              <div class="clip-trim-keep" style="left:${pctStart}%;width:${Math.max(1, pctEnd - pctStart)}%"></div>
            </div>
            <label class="clip-trim-row">
              <span>${t('clip.start')}</span>
              <input data-act="start" type="range" min="0" max="${clip.duration}" step="0.05" value="${clip.start}" />
            </label>
            <label class="clip-trim-row">
              <span>${t('clip.end')}</span>
              <input data-act="end" type="range" min="0" max="${clip.duration}" step="0.05" value="${clip.end}" />
            </label>
          </div>
        </li>
      `;
    }).join('');
    notify();
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setStatus(t('clip.loading'));
    let added = 0;
    for (const file of files) {
      if (state.clips.length >= MAX_CLIPS) {
        setStatus(t('clip.maxClips'));
        break;
      }
      if (!isLikelyVideo(file)) {
        setStatus(t('clip.notVideo'));
        continue;
      }
      if (file.size > maxSourceBytes()) {
        setStatus(canTrimOnDevice() ? t('clip.tooBigSrc') : t('clip.tooBigUpload'));
        continue;
      }
      try {
        const { url, duration } = await loadMeta(file);
        const clip = {
          id: uid(),
          file,
          url,
          duration,
          start: 0,
          end: duration,
          thumb: '',
        };
        state.clips.push(clip);
        added += 1;
        render();
        captureThumb(url, Math.min(0.4, duration * 0.15)).then((thumb) => {
          clip.thumb = thumb;
        });
      } catch (err) {
        setStatus(err.message || t('clip.encodeFail'));
      }
    }
    if (added) setStatus('');
    render();
  }

  function bindPicker(input) {
    if (!input) return;
    let inflight = false;
    const handle = () => {
      if (inflight) return;
      const picked = Array.from(input.files || []);
      if (!picked.length) return;
      inflight = true;
      input.value = '';
      addFiles(picked)
        .catch((err) => {
          setStatus(err.message || t('clip.encodeFail'));
        })
        .finally(() => {
          inflight = false;
        });
    };
    input.addEventListener('change', handle);
    input.addEventListener('input', handle);
  }

  root.querySelectorAll('.clip-editor-file').forEach(bindPicker);
  root.querySelectorAll('[data-open-source]').forEach((btn) => {
    btn.addEventListener('click', openGalleryPicker);
  });
  seqBtn.addEventListener('click', () => {
    if (state.sequencePlaying) stopSequence();
    else playSequenceFrom(0);
  });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.clip-card');
    const id = card?.getAttribute('data-id');
    const index = state.clips.findIndex((c) => c.id === id);
    if (index < 0) return;
    const act = btn.getAttribute('data-act');
    if (act === 'remove') {
      const [removed] = state.clips.splice(index, 1);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      render();
      return;
    }
    if (act === 'up' && index > 0) {
      [state.clips[index - 1], state.clips[index]] = [state.clips[index], state.clips[index - 1]];
      render();
      return;
    }
    if (act === 'down' && index < state.clips.length - 1) {
      [state.clips[index + 1], state.clips[index]] = [state.clips[index], state.clips[index + 1]];
      render();
    }
  });

  listEl.addEventListener('input', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    const act = input.getAttribute('data-act');
    if (act !== 'start' && act !== 'end') return;
    const card = input.closest('.clip-card');
    const clip = state.clips.find((c) => c.id === card?.getAttribute('data-id'));
    if (!clip) return;
    const value = Number(input.value);
    if (act === 'start') {
      clip.start = Math.min(value, clip.end - MIN_KEEP);
      if (clip.start < 0) clip.start = 0;
      input.value = String(clip.start);
    } else {
      clip.end = Math.max(value, clip.start + MIN_KEEP);
      if (clip.end > clip.duration) clip.end = clip.duration;
      input.value = String(clip.end);
    }
    const range = card.querySelector('.clip-card-meta');
    if (range) range.textContent = `${formatTime(clip.start)} – ${formatTime(clip.end)}`;
    const bar = card.querySelector('.clip-trim-keep');
    if (bar && clip.duration) {
      const pctStart = (clip.start / clip.duration) * 100;
      const pctEnd = (clip.end / clip.duration) * 100;
      bar.style.left = `${pctStart}%`;
      bar.style.width = `${Math.max(1, pctEnd - pctStart)}%`;
    }
    stopSequence();
    seqVideo.src = clip.url;
    seqVideo.currentTime = act === 'start' ? clip.start : Math.max(clip.start, clip.end - 0.15);
  });

  return {
    hasClips() {
      return state.clips.length > 0;
    },
    closePickers() {},
    openPickers() {
      openGalleryPicker();
    },
    reset() {
      state.clips.forEach((c) => {
        if (c.url) URL.revokeObjectURL(c.url);
      });
      state.clips = [];
      stopSequence();
      setStatus('');
      root.querySelectorAll('.clip-editor-file').forEach((input) => {
        input.value = '';
      });
      render();
    },
    async exportFile() {
      if (!state.clips.length) throw new Error(t('clip.needVideo'));
      if (state.encoding) throw new Error(t('clip.encoding'));
      state.encoding = true;
      stopSequence();
      try {
        const file = await encodeClips(state.clips, () => {});
        if (file.size > maxBytes) throw new Error(t('clip.tooBigOut'));
        setStatus('');
        return file;
      } finally {
        state.encoding = false;
      }
    },
  };
}
