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
  let badge = 'מהשטח';
  let body = item.text ? `<p class="community-card-text">${escapeHtml(item.text)}</p>` : '';

  if (item.type === 'meetup') {
    badge = 'מפגש';
    body = `
      <p class="community-card-when">${escapeHtml(formatDateTime(item.when))}</p>
      ${item.text ? `<p class="community-card-text">${escapeHtml(item.text)}</p>` : ''}
    `;
  } else if (item.type === 'jump') {
    badge = 'קפיצה';
    body = `<p class="community-card-text">${escapeHtml(item.displayName)} קפץ/ה ${escapeHtml(String(item.height || ''))}מ׳</p>`;
  }

  return `
    <article class="community-card">
      <div class="community-card-top">
        <span class="community-badge community-badge--${escapeHtml(item.type)}">${badge}</span>
        <time class="community-card-date">${escapeHtml(formatDate(item.createdAt))}</time>
      </div>
      <h3 class="community-card-title">
        <a href="${spotHref}">${escapeHtml(item.spotName || 'ספוט')}</a>
      </h3>
      <p class="community-card-meta">${escapeHtml(item.displayName || 'משתמש')}</p>
      ${body}
      ${photo ? `<img class="community-card-photo" src="${photo}" alt="תמונה מ${escapeHtml(item.spotName || 'הספוט')}" />` : ''}
    </article>
  `;
}

function meetupCard(meetup) {
  const spotHref = meetup.spotId ? `spot.html?id=${encodeURIComponent(meetup.spotId)}` : 'map.html';
  return `
    <article class="community-card">
      <div class="community-card-top">
        <span class="community-badge community-badge--meetup">מפגש</span>
        <time class="community-card-date">${escapeHtml(formatDateTime(meetup.when))}</time>
      </div>
      <h3 class="community-card-title">
        <a href="${spotHref}">${escapeHtml(meetup.spotName || 'ספוט')}</a>
      </h3>
      <p class="community-card-meta">קבע/ה ${escapeHtml(meetup.displayName || 'משתמש')}</p>
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
      : feedEmpty('עדיין אין עדכונים. שתפו תמונה מספוט או קבעו מפגש.');
  } catch {
    el.innerHTML = feedEmpty('לא הצלחנו לטעון עדכונים. נסו לרענן.');
  }
}

async function renderMeetupForm(spots, session) {
  const el = document.getElementById('meetupFormArea');
  if (!session) {
    el.innerHTML = `
      <div class="login-locked">
        <p>רוצים לקבוע מפגש?</p>
        <a href="login.html?redirect=${encodeURIComponent('community.html?tab=meetups')}">התחברו</a> כדי לפרסם.
      </div>
    `;
    return;
  }

  const options = spots
    .map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === preselectedSpot ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  el.innerHTML = `
    <form class="experience-form meetup-form" id="meetupForm">
      <h3>קבעו מפגש</h3>
      <p class="form-hint">ספוט, תאריך קצר, ומילה או שתיים — כדי שאחרים יוכלו להצטרף.</p>
      <div id="meetupFormMsg"></div>
      <div class="form-group">
        <label for="meetupSpot">ספוט</label>
        <select name="spotId" id="meetupSpot" required>
          <option value="">בחרו ספוט</option>
          ${options}
        </select>
      </div>
      <div class="form-group">
        <label for="meetupWhen">מתי</label>
        <input type="datetime-local" name="when" id="meetupWhen" required />
      </div>
      <div class="form-group">
        <label for="meetupNote">הערה קצרה (אופציונלי)</label>
        <input type="text" name="note" id="meetupNote" maxlength="140" placeholder="למשל: בוקר, מביאים חבל" />
      </div>
      <button type="submit" class="btn btn-primary btn-full">פרסום מפגש</button>
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
      if (msg) msg.innerHTML = '<p class="form-success-msg">המפגש פורסם.</p>';
      await renderMeetupsList();
      await renderUpdates();
    } catch (err) {
      if (msg) {
        msg.innerHTML = `<p class="form-error">${escapeHtml(err.message || 'פרסום המפגש נכשל')}</p>`;
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
      : feedEmpty('אין מפגשים קרובים. קבעו את הראשון.');
  } catch {
    el.innerHTML = feedEmpty('לא הצלחנו לטעון מפגשים.');
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
