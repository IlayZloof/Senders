import {
  escapeHtml,
  googleMapsNavUrl,
  heightLabel,
  spotBriefHtml,
  wazeNavUrl,
} from './ui.js';
import {
  getAllSpots,
  isAdminOnlySpot,
  normalizeInstagramUrl,
} from './store.js';
import { bindUploadSpotPicker, emptySpotMediaHtml, getSpotImage } from './spots-util.js';
import { regionLabel, t } from './i18n.js';
import { displaySpotDescription, displaySpotName, displaySpotWarnings } from './spot-locale.js';

/** Curated home carousel: 10 public spots, north/center/south mix. No reels. */
const HOME_REC_SPOT_IDS = [
  'akko-old-city',
  'zavitan-glasses',
  'tiberias-bridge',
  'alumot-dam',
  'migdal-reading',
  'tel-dor',
  'prat-canyon',
  'eilat-katza',
  'ein-akev',
  'tzafira',
];
const HOME_REC_EXCLUDE_IDS = new Set(['kishon-bridge']);
const HOME_REC_COUNT = 10;

function isEligibleHomeRec(spot) {
  if (!spot?.id || HOME_REC_EXCLUDE_IDS.has(String(spot.id))) return false;
  if (isAdminOnlySpot(spot) || spot.unverified) return false;
  if (!getSpotImage(spot)) return false;
  if (!(Number(spot.height_min) > 0 || Number(spot.height_max) > 0)) return false;
  const desc = String(spot.description || '').trim();
  if (desc.length < 40) return false;
  return true;
}

function pickHomeRecommendationSpots(spots) {
  const byId = new Map((spots || []).map((s) => [String(s.id), s]));
  const picked = [];
  const used = new Set();
  HOME_REC_SPOT_IDS.forEach((id) => {
    const spot = byId.get(id);
    if (spot && isEligibleHomeRec(spot)) {
      picked.push(spot);
      used.add(id);
    }
  });
  if (picked.length >= HOME_REC_COUNT) return picked.slice(0, HOME_REC_COUNT);

  const regionOrder = ['north', 'center', 'south'];
  const extras = (spots || []).filter((s) => isEligibleHomeRec(s) && !used.has(String(s.id)));
  extras.sort((a, b) => {
    const photosA = (a.images?.length || 0) + (a.image ? 1 : 0);
    const photosB = (b.images?.length || 0) + (b.image ? 1 : 0);
    const descA = String(a.description || '').length;
    const descB = String(b.description || '').length;
    const gpsA = a.location_approx === true ? 0 : 1;
    const gpsB = b.location_approx === true ? 0 : 1;
    return gpsB - gpsA || photosB - photosA || descB - descA;
  });
  for (const region of regionOrder) {
    if (picked.length >= HOME_REC_COUNT) break;
    const extra = extras.find((s) => s.region === region && !used.has(String(s.id)));
    if (extra) {
      picked.push(extra);
      used.add(String(extra.id));
    }
  }
  extras.forEach((spot) => {
    if (picked.length >= HOME_REC_COUNT) return;
    if (used.has(String(spot.id))) return;
    picked.push(spot);
    used.add(String(spot.id));
  });
  return picked.slice(0, HOME_REC_COUNT);
}

function spotSummary(spot) {
  if (!spot) return '';
  return displaySpotDescription(spot) || displaySpotWarnings(spot) || t('spot.noDesc');
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
  if (!feed) return;

  const state = {
    spots: [],
  };

  const qs = new URLSearchParams(window.location.search);
  if (qs.get('upload') === '1') {
    window.location.replace('reels.html?upload=1');
    return;
  }

  document.getElementById('sheetBackdrop')?.addEventListener('click', closeSheets);
  document.getElementById('spotSheetClose')?.addEventListener('click', closeSheets);
  document.getElementById('commentsSheetClose')?.addEventListener('click', closeSheets);
  document.getElementById('uploadSheetClose')?.addEventListener('click', closeSheets);

  feed.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-open-spot]');
    if (chip) {
      openSpotSheet(chip.getAttribute('data-open-spot'));
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheets();
  });

  bootstrap();

  async function bootstrap() {
    const spots = await getAllSpots();
    state.spots = spots;
    bindUploadSpotPicker(spots);
    const recs = pickHomeRecommendationSpots(spots);
    feed.innerHTML = recs.map(renderSpotSlide).join('')
      || `<p class="home-feed-empty">${t('home.feed.rec')}</p>`;
  }

  function renderSpotSlide(spot) {
    const img = getSpotImage(spot);
    const region = regionLabel(spot.region) || '';
    return `
      <article class="feed-slide feed-slide--spot" data-kind="spot">
        <div class="feed-spot-bg" style="background-image: url('${escapeHtml(img)}')"></div>
        <div class="feed-overlay">
          <span class="feed-rec-badge">${t('home.feed.rec')}</span>
          <h2 class="feed-spot-title">${escapeHtml(displaySpotName(spot))}</h2>
          <p class="feed-spot-meta">${escapeHtml([region, heightLabel(spot)].filter(Boolean).join(' · '))}</p>
          ${spotDescBlock(spot, 'feed-caption')}
          <button type="button" class="feed-spot-chip" data-open-spot="${escapeHtml(spot.id)}">${t('home.feed.details')}</button>
        </div>
      </article>
    `;
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
}
