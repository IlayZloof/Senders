import {
  initNav,
  showGuestBanner,
  requireAuth,
  formatDate,
  formatDateTime,
  escapeHtml,
  safePhotoSrc,
} from './ui.js';
import {
  getSession,
  getAllSpots,
  getCommunityUpdates,
  getUpcomingMeetups,
  addMeetup,
} from './store.js';
import { t } from './i18n.js';
import { displaySpotName } from './spot-locale.js';

initNav();
showGuestBanner();

const params = new URLSearchParams(window.location.search);
const requestedTab = params.get('tab') === 'meetups' ? 'meetups' : 'updates';
const preselectedSpot = params.get('spot') || '';

function setTab(tab) {
  const isMeetups = tab === 'meetups';
  document.getElementById('tabUpdates')?.classList.toggle('active', !isMeetups);
  document.getElementById('tabMeetups')?.classList.toggle('active', isMeetups);
  document.getElementById('tabUpdates')?.setAttribute('aria-selected', String(!isMeetups));
  document.getElementById('tabMeetups')?.setAttribute('aria-selected', String(isMeetups));
  document.getElementById('panelUpdates').hidden = isMeetups;
  document.getElementById('panelMeetups').hidden = !isMeetups;
}

document.querySelectorAll('.community-tab').forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

function feedEmpty(message) {
  return `<p class="muted">${escapeHtml(message)}</p>`;
}

function updateCard(item) {
  const spotHref = item.spotId ? `spot.html?id=${encodeURIComponent(item.spotId)}` : 'map.html';
  const photo = safePhotoSrc(item.photo);
  let badge = t('community.badge.field');
  let body = item.text ? `<p class="community-card-text">${escapeHtml(item.text)}</p>` : '';

  if (item.type === 'meetup') {
    badge = t('community.badge.meetup');
    body = `
      <p class="community-card-when">${escapeHtml(formatDateTime(item.when))}</p>
      ${item.text ? `<p class="community-card-text">${escapeHtml(item.text)}</p>` : ''}
    `;
  } else if (item.type === 'jump') {
    badge = t('community.badge.jump');
    body = `<p class="community-card-text">${escapeHtml(t('community.jumped', { name: item.displayName, h: item.height || '' }))}</p>`;
  }

  return `
    <article class="community-card">
      <div class="community-card-top">
        <span class="community-badge community-badge--${escapeHtml(item.type)}">${badge}</span>
        <time class="community-card-date">${escapeHtml(formatDate(item.createdAt))}</time>
      </div>
      <h3 class="community-card-title">
        <a href="${spotHref}">${escapeHtml(displaySpotName({ id: item.spotId, name: item.spotName }, t('common.spot')))}</a>
      </h3>
      <p class="community-card-meta">${escapeHtml(item.displayName || t('common.user'))}</p>
      ${body}
      ${photo ? `<img class="community-card-photo" src="${photo}" alt="${escapeHtml(t('community.photoAlt', { name: displaySpotName({ id: item.spotId, name: item.spotName }, t('common.spot')) }))}" />` : ''}
    </article>
  `;
}

function meetupCard(meetup) {
  const spotHref = meetup.spotId ? `spot.html?id=${encodeURIComponent(meetup.spotId)}` : 'map.html';
  return `
    <article class="community-card">
      <div class="community-card-top">
        <span class="community-badge community-badge--meetup">${t('community.badge.meetup')}</span>
        <time class="community-card-date">${escapeHtml(formatDateTime(meetup.when))}</time>
      </div>
      <h3 class="community-card-title">
        <a href="${spotHref}">${escapeHtml(displaySpotName({ id: meetup.spotId, name: meetup.spotName }, t('common.spot')))}</a>
      </h3>
      <p class="community-card-meta">${escapeHtml(t('community.setBy', { name: meetup.displayName || t('common.user') }))}</p>
      ${meetup.note ? `<p class="community-card-text">${escapeHtml(meetup.note)}</p>` : ''}
    </article>
  `;
}

async function renderUpdates() {
  const el = document.getElementById('updatesFeed');
  try {
    const items = await getCommunityUpdates(40);
    el.innerHTML = items.length
      ? items.map(updateCard).join('')
      : feedEmpty(t('community.emptyUpdates'));
  } catch {
    el.innerHTML = feedEmpty(t('community.failUpdates'));
  }
}

async function renderMeetupForm(spots, session) {
  const el = document.getElementById('meetupFormArea');
  if (!session) {
    el.innerHTML = `
      <div class="login-locked">
        <p>${t('community.loginMeet')}</p>
        <a href="login.html?redirect=${encodeURIComponent('community.html?tab=meetups')}">${t('community.loginToPost')}</a>${t('community.loginToPostAfter')}
      </div>
    `;
    return;
  }

  const options = spots
    .map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === preselectedSpot ? 'selected' : ''}>${escapeHtml(displaySpotName(s))}</option>`)
    .join('');

  el.innerHTML = `
    <form class="experience-form meetup-form" id="meetupForm">
      <h3>${t('community.setMeetup')}</h3>
      <p class="form-hint">${t('community.meetupHint')}</p>
      <div id="meetupFormMsg"></div>
      <div class="form-group">
        <label for="meetupSpot">${t('common.spot')}</label>
        <select name="spotId" id="meetupSpot" required>
          <option value="">${t('home.upload.chooseSpot')}</option>
          ${options}
        </select>
      </div>
      <div class="form-group">
        <label for="meetupWhen">${t('community.when')}</label>
        <input type="datetime-local" name="when" id="meetupWhen" required />
      </div>
      <div class="form-group">
        <label for="meetupNote">${t('community.note')}</label>
        <input type="text" name="note" id="meetupNote" maxlength="140" placeholder="${t('community.notePh')}" />
      </div>
      <button type="submit" class="btn btn-primary btn-full">${t('community.postMeetup')}</button>
    </form>
  `;

  const whenInput = document.getElementById('meetupWhen');
  if (whenInput) {
    const local = new Date();
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    whenInput.min = local.toISOString().slice(0, 16);
  }

  document.getElementById('meetupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('meetupFormMsg');
    const s = await requireAuth();
    if (!s) return;
    const fd = new FormData(e.target);
    const spotId = String(fd.get('spotId') || '');
    const spot = spots.find((item) => item.id === spotId);
    const when = fd.get('when');
    try {
      await addMeetup({
        spotId,
        spotName: spot?.name || '',
        when,
        note: fd.get('note') || '',
      });
      e.target.reset();
      if (msg) msg.innerHTML = `<p class="form-success-msg">${t('community.posted')}</p>`;
      await renderMeetupsList();
      await renderUpdates();
    } catch (err) {
      if (msg) {
        msg.innerHTML = `<p class="form-error">${escapeHtml(err.message || t('community.postFail'))}</p>`;
      }
    }
  });
}

async function renderMeetupsList() {
  const el = document.getElementById('meetupsList');
  try {
    const meetups = await getUpcomingMeetups();
    el.innerHTML = meetups.length
      ? meetups.map(meetupCard).join('')
      : feedEmpty(t('community.emptyMeet'));
  } catch {
    el.innerHTML = feedEmpty(t('community.failMeet'));
  }
}

async function init() {
  setTab(requestedTab);
  const [spots, session] = await Promise.all([getAllSpots(), getSession()]);
  await Promise.all([
    renderUpdates(),
    renderMeetupForm(spots, session),
    renderMeetupsList(),
  ]);
}

init();
