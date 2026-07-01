(() => {
  const API = window.UnpissedSupabase;

  const CRITERIA_LABELS = {
    cleanliness: 'Cleanliness',
    queueFactor: 'Queue Factor',
    paperQuality: 'Paper Quality',
    lockConfidence: 'Lock Confidence',
    vibe: 'Vibe',
    essentials: 'Essentials',
    soundSafety: 'Sound Safety'
  };

  const defaultState = {
    activeTab: 'map',
    selectedBathroomId: null,
    modal: null,
    anonymous: true,
    checkinBathroomId: null,
    searchQuery: '',
    routeBathroomId: null,
    authUser: null,
    authProfile: null,
    authMode: 'signin',
    authEmail: '',
    authDisplayName: '',
    authError: '',
    authNotice: '',
    authSubmitting: false,
    backendStatus: API?.isConfigured?.() ? 'ready' : 'missing',
    syncMessage: API?.isConfigured?.() ? 'Supabase is configured. Sign in to add and rate bathrooms.' : 'Supabase configuration is missing.',
    bathrooms: [],
    checkins: [],
    badges: [],
    userBadges: [],
    feed: [],
    reviewsByBathroom: {},
    loading: true,
    filters: {
      topRated: false,
      noCode: false,
      openNow: false,
      accessible: false
    },
    userLocation: null,
    geoStatus: 'idle',
    geoError: '',
    mapHasMoved: false
  };

  let state = { ...defaultState };
  let leafletMap = null;
  let markerLayer = null;
  let userMarker = null;
  let routeLine = null;
  let mapRenderTimer = null;

  function setState(patch) {
    state = { ...state, ...patch };
    render();
  }

  function hasCoordinates(bathroom) {
    const lat = Number(bathroom?.lat);
    const lng = Number(bathroom?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng);
  }

  function toRad(value) {
    return Number(value) * Math.PI / 180;
  }

  function distanceKmBetween(a, b) {
    if (!a || !b) return null;
    const lat1 = Number(a.lat);
    const lon1 = Number(a.lng);
    const lat2 = Number(b.lat);
    const lon2 = Number(b.lng);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
    const earthKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function walkingMinutes(distanceKm) {
    if (!Number.isFinite(distanceKm)) return null;
    return Math.max(1, Math.round((distanceKm / 4.8) * 60));
  }

  function applyDistance(bathroom) {
    if (!bathroom) return bathroom;
    if (!state.userLocation || !hasCoordinates(bathroom)) return bathroom;
    const km = distanceKmBetween(state.userLocation, bathroom);
    if (!Number.isFinite(km)) return bathroom;
    return {
      ...bathroom,
      distanceKm: km,
      distanceMinutes: walkingMinutes(km)
    };
  }

  function bathrooms() {
    const rows = Array.isArray(state.bathrooms) ? state.bathrooms : [];
    return rows.map(applyDistance);
  }

  function filteredBathrooms() {
    return bathrooms().filter((bathroom) => {
      const filters = state.filters || {};
      const query = String(state.searchQuery || '').trim().toLowerCase();
      if (query) {
        const haystack = [
          bathroom.name,
          bathroom.type,
          bathroom.access,
          ...(bathroom.tags || []),
          ...(bathroom.facilities || []),
          ...(bathroom.vibeTags || [])
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters.topRated && Number(bathroom.rating) < 4.5) return false;
      if (filters.noCode && bathroom.accessMode !== 'no-code' && !String(bathroom.access || '').toLowerCase().includes('no code')) return false;
      if (filters.openNow && bathroom.openNow === false) return false;
      if (filters.accessible && !(bathroom.facilities || []).some((item) => item.toLowerCase().includes('accessible'))) return false;
      return true;
    });
  }

  function selectedBathroom() {
    const all = bathrooms();
    const visible = filteredBathrooms();
    return all.find((b) => b.id === state.selectedBathroomId) || visible[0] || all[0] || null;
  }

  function icon(name) {
    const icons = {
      bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>',
      chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>',
      locate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>',
      map: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"></path><path d="M9 3v15M15 6v15"></path></svg>',
      feed: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"></path><path d="M3 6h.01M3 12h.01M3 18h.01"></path></svg>',
      plus: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
      badge: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="5"></circle><path d="m8.5 13-2 8 5.5-3 5.5 3-2-8"></path></svg>',
      user: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 1 0-16 0"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17 6-6 4 4 7-8"></path><path d="M14 7h6v6"></path></svg>',
      pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-7 4 14 2-7h6"></path></svg>',
      close: '<svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
      star: '<svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"></path></svg>',
      route: '<svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a3 3 0 1 1 0-6c3 0 5 3 8 3a4 4 0 0 0 0-8"></path><circle cx="18" cy="5" r="2"></circle><circle cx="6" cy="19" r="2"></circle></svg>',
      camera: '<svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-2.5h5Z"></path><circle cx="12" cy="13" r="3"></circle></svg>',
      filter: '<svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"></path></svg>',
      lock: '<svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>'
    };
    return icons[name] || '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function rounded(value, decimals = 1) {
    return Number(value || 0).toFixed(decimals);
  }

  function distanceLabel(bathroom) {
    if (!bathroom) return 'Distance unknown';
    if (Number.isFinite(Number(bathroom.distanceKm))) {
      const km = Number(bathroom.distanceKm);
      const distance = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
      return `${bathroom.distanceMinutes || walkingMinutes(km)} min walk · ${distance}`;
    }
    if (bathroom.distanceMinutes) return `${bathroom.distanceMinutes} min walk`;
    if (bathroom.distanceMiles) return `${bathroom.distanceMiles} mi away`;
    if (hasCoordinates(bathroom)) return state.userLocation ? 'Distance loading' : 'On the map';
    return 'Location missing';
  }

  function sortedByDistance(list) {
    return [...list].sort((a, b) => {
      const ad = Number.isFinite(Number(a.distanceKm)) ? Number(a.distanceKm) : 999999;
      const bd = Number.isFinite(Number(b.distanceKm)) ? Number(b.distanceKm) : 999999;
      if (ad !== bd) return ad - bd;
      return Number(b.rating || 0) - Number(a.rating || 0);
    });
  }

  function nearestBathroom() {
    const visible = filteredBathrooms().filter(hasCoordinates);
    return sortedByDistance(visible)[0] || sortedByDistance(filteredBathrooms())[0] || null;
  }

  function overallFromCriteria(criteria) {
    const values = Object.values(criteria || {}).map(Number).filter((n) => Number.isFinite(n));
    if (!values.length) return 0;
    return values.reduce((sum, n) => sum + n, 0) / values.length;
  }

  function currentDisplayName() {
    return state.authProfile?.display_name || state.authUser?.email?.split('@')[0] || 'Unpissed user';
  }

  function initialsFromName(name = '') {
    const parts = String(name || currentDisplayName()).trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'UP';
  }

  function timeAgo(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  function render() {
    const app = document.querySelector('#app');
    app.innerHTML = `
      <section class="screen">
        <div class="scroll-area">
          ${renderHeader()}
          ${renderBackendStrip()}
          ${renderRouteBanner()}
          ${renderActiveTab()}
        </div>
        ${renderBottomNav()}
        ${renderModal()}
      </section>
    `;
    bindEvents();
    queueMapRender();
  }

  function renderHeader() {
    const initials = state.authUser ? initialsFromName(currentDisplayName()) : 'UP';
    return `
      <header class="header">
        <div>
          <h1 class="logo">Unpissed<span>.</span></h1>
          <p class="tagline">Find the throne before it's too late</p>
        </div>
        <div class="header-actions">
          <button class="icon-button" data-action="open-notifications" aria-label="Notifications">
            ${icon('bell')}
            ${state.feed.length ? '<span class="notification-dot" aria-hidden="true"></span>' : ''}
          </button>
          <button class="avatar" data-action="open-auth" aria-label="Account">${escapeHtml(initials)}</button>
        </div>
      </header>
    `;
  }

  function renderBackendStrip() {
    const signedIn = Boolean(state.authUser);
    const missing = state.backendStatus === 'missing';
    const tone = signedIn ? 'live' : (missing ? 'missing' : 'ready');
    const label = signedIn ? 'Supabase live' : (missing ? 'Setup required' : 'Supabase ready');
    return `
      <section class="backend-strip backend-strip--${tone}">
        <div>
          <b>${escapeHtml(label)}</b>
          <span>${escapeHtml(state.syncMessage || '')}</span>
        </div>
        <button class="backend-strip__button" data-action="${signedIn ? 'sync-supabase' : 'open-auth'}">
          ${signedIn ? 'Sync' : 'Sign in'}
        </button>
      </section>
    `;
  }

  function renderActiveTab() {
    if (state.loading) return renderLoadingState();
    if (state.backendStatus === 'missing') return renderMissingConfigState();
    switch (state.activeTab) {
      case 'feed': return renderFeedPage();
      case 'checkin': return renderCheckinPage();
      case 'badges': return renderBadgesPage();
      case 'profile': return renderProfilePage();
      default: return renderMapPage();
    }
  }

  function renderLoadingState() {
    return `
      <article class="simple-card">
        <h3>Loading Unpissed</h3>
        <p>Connecting to Supabase.</p>
      </article>
    `;
  }

  function renderMissingConfigState() {
    return `
      <section class="content-page">
        <h2 class="page-title">Supabase required</h2>
        <p class="page-subtitle">This build uses Supabase only. Add your Supabase URL and anon key in <code>js/config.js</code>.</p>
        <article class="simple-card">
          <h3>No local fallback</h3>
          <p>All bathrooms, ratings, check-ins, badges and feed events now come from Supabase.</p>
        </article>
      </section>
    `;
  }

  function renderMapPage() {
    const bathroom = selectedBathroom();
    return `
      <button class="emergency-card" data-action="open-emergency">
        <div>
          <div class="emergency-kicker"><span class="pulse-dot"></span>Emergency mode</div>
          <h2>I need a bathroom. Now.</h2>
          <p>Uses your location to find the closest survivable throne.</p>
        </div>
        <span class="emergency-arrow">${icon('chevron')}</span>
      </button>

      ${renderSearchBar()}
      ${renderFilterBar()}
      ${renderLocationStrip()}
      <div class="section-row">
        <h2 class="section-title">Bathroom hotspots nearby</h2>
        <span class="section-meta">${filteredBathrooms().length} visible</span>
      </div>
      ${renderMap()}
      ${renderNearbyList()}
      ${bathroom ? renderBathroomCard(bathroom) : renderNoBathroomsCard()}
      ${renderTrustCard()}

      <div class="section-row">
        <h2 class="section-title">Tonight around you</h2>
        <button class="section-action" data-tab="feed">See all</button>
      </div>
      ${renderActivityCard(state.feed)}
      ${renderBadgeTeaser()}
    `;
  }

  function renderRouteBanner() {
    if (!state.routeBathroomId) return '';
    const bathroom = bathrooms().find((item) => item.id === state.routeBathroomId);
    if (!bathroom) return '';
    return `
      <button class="route-banner" data-action="open-details" data-bathroom-id="${bathroom.id}">
        <span>${icon('route')}</span>
        <div><b>Emergency route active</b><small>${escapeHtml(bathroom.name)} · ${escapeHtml(distanceLabel(bathroom))}</small></div>
        <em>Open</em>
      </button>
    `;
  }

  function renderSearchBar() {
    return `
      <form class="search-card" data-form="bathroom-search">
        <label class="sr-only" for="bathroom-search">Search bathrooms</label>
        <input id="bathroom-search" name="query" value="${escapeHtml(state.searchQuery || '')}" placeholder="Search by vibe, access or place" autocomplete="off" />
        ${state.searchQuery ? '<button class="search-clear" type="button" data-action="clear-search">Clear</button>' : ''}
        <button class="search-submit" type="submit">Search</button>
      </form>
    `;
  }

  function renderFilterBar() {
    const filters = state.filters || {};
    const items = [
      ['topRated', '4.5+'],
      ['noCode', 'No code'],
      ['openNow', 'Open now'],
      ['accessible', 'Accessible']
    ];
    return `
      <div class="filter-bar" aria-label="Bathroom filters">
        <span class="filter-label">${icon('filter')} Filters</span>
        ${items.map(([key, label]) => `
          <button class="filter-chip ${filters[key] ? 'is-active' : ''}" data-action="toggle-filter" data-filter-key="${key}">${label}</button>
        `).join('')}
      </div>
    `;
  }

  function renderNearbyList() {
    const visible = sortedByDistance(filteredBathrooms());
    if (!visible.length) return '';
    return `
      <div class="nearby-rail" aria-label="Nearby bathrooms">
        ${visible.map((bathroom) => `
          <button class="nearby-pill ${bathroom.id === selectedBathroom()?.id ? 'is-active' : ''}" data-select-bathroom="${bathroom.id}">
            <b>${escapeHtml(bathroom.name)}</b>
            <span>${rounded(bathroom.rating)} ★ · ${escapeHtml(distanceLabel(bathroom))}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderTrustCard() {
    return `
      <article class="trust-card">
        <div>
          <p class="card-kicker">Photo rules</p>
          <h3>Show the vibe, not the victims.</h3>
          <p>No people, no nudity, no disasters. Useful photos only.</p>
        </div>
        <button class="secondary-button" data-action="open-add-bathroom">Add throne</button>
      </article>
    `;
  }

  function renderLocationStrip() {
    const status = state.geoStatus;
    if (status === 'ready' && state.userLocation) {
      return `
        <article class="location-strip location-strip--ready">
          <span>${icon('locate')}</span>
          <div><b>Location active</b><small>Distances and emergency route are calculated from your phone.</small></div>
          <button data-action="recenter">Recenter</button>
        </article>
      `;
    }
    if (status === 'error') {
      return `
        <article class="location-strip location-strip--error">
          <span>${icon('locate')}</span>
          <div><b>Location unavailable</b><small>${escapeHtml(state.geoError || 'Allow location access to sort by distance.')}</small></div>
          <button data-action="request-location">Retry</button>
        </article>
      `;
    }
    return `
      <article class="location-strip">
        <span>${icon('locate')}</span>
        <div><b>Use your location</b><small>Sort bathrooms by walking distance and enable emergency routing.</small></div>
        <button data-action="request-location">Enable</button>
      </article>
    `;
  }

  function renderMap() {
    const visibleBathrooms = filteredBathrooms();
    const mappedCount = visibleBathrooms.filter(hasCoordinates).length;
    const emptyText = visibleBathrooms.length
      ? `${visibleBathrooms.length - mappedCount} bathroom${visibleBathrooms.length - mappedCount === 1 ? '' : 's'} need coordinates.`
      : 'No bathrooms mapped yet.';
    const emptyState = mappedCount ? '' : `<div class="map-empty">${escapeHtml(emptyText)}</div>`;

    return `
      <div class="map-card map-card--leaflet">
        <div id="unpissed-map" class="leaflet-map" aria-label="Interactive map with nearby bathrooms"></div>
        ${emptyState}
        <button class="add-throne" data-action="open-add-bathroom"><span>+</span> Add this throne to the map</button>
        <button class="recenter" data-action="recenter" aria-label="Use current location">${icon('locate')}</button>
      </div>
    `;
  }

  function renderNoBathroomsCard() {
    return `
      <article class="card selected-card">
        <div class="selected-body empty-state">
          <h2>No bathrooms yet</h2>
          <p>Your Supabase database is connected, but no bathrooms are mapped. Add the first throne to start building the city.</p>
        </div>
        <div class="card-actions">
          <button class="primary-button full-width" data-action="open-add-bathroom">Add first bathroom</button>
        </div>
      </article>
    `;
  }

  function renderBathroomCard(bathroom) {
    const criteriaOrder = ['cleanliness', 'queueFactor', 'paperQuality', 'lockConfidence', 'vibe'];
    const criteriaRows = criteriaOrder.map((key) => {
      const value = bathroom.criteria?.[key] || 0;
      const isGold = key === 'vibe' && value >= 4.8;
      return `
        <div class="rating-row">
          <span class="rating-row__label">${CRITERIA_LABELS[key]}</span>
          <span class="rating-track"><span class="rating-fill ${isGold ? 'is-gold' : ''}" style="width:${Math.min(value * 20, 100)}%"></span></span>
          <span class="rating-value ${isGold ? 'is-gold' : ''}">${rounded(value)}</span>
        </div>
      `;
    }).join('');

    return `
      <article class="card selected-card">
        <div class="selected-body">
          <div class="card-top">
            <div>
              <h2 class="bathroom-name">${escapeHtml(bathroom.name)}</h2>
              <div class="rating-line"><span class="rating-number">${rounded(bathroom.rating)} ★</span><span class="dot-separator"></span><span>${escapeHtml(distanceLabel(bathroom))}</span></div>
            </div>
            <span class="trending-pill">${escapeHtml(bathroom.status || 'OPEN')}</span>
          </div>
          <div class="chip-row">${(bathroom.tags || []).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}</div>
          ${renderCrowdPulse(bathroom)}
          ${renderPhotoStrip(bathroom)}
          <div class="breakdown">
            <div class="card-kicker">Rate the relief</div>
            ${criteriaRows}
            <p class="footnote">Also rated: Essentials · Sound Safety</p>
          </div>
        </div>
        <div class="card-actions">
          <button class="primary-button flex-1" data-action="open-checkin" data-bathroom-id="${bathroom.id}">Check in on the throne</button>
          <button class="secondary-button" data-action="open-details" data-bathroom-id="${bathroom.id}">Details</button>
        </div>
      </article>
    `;
  }

  function renderCrowdPulse(bathroom) {
    const tags = (bathroom.vibeTags || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
    return `
      <div class="crowd-pulse">
        <div><b>Live-ish pulse</b><span>${escapeHtml(bathroom.crowdLevel || 'Crowd level unknown')}</span></div>
        <div class="vibe-tags">${tags || '<span>Needs check-ins</span>'}</div>
      </div>
    `;
  }

  function renderPhotoStrip(bathroom) {
    const photos = bathroom.photos || [];
    if (!photos.length && !bathroom.photoCount) {
      return `<div class="photo-strip" aria-label="Bathroom photos"><div class="photo-tile"><span>No photos yet</span></div></div>`;
    }
    const photoCards = photos.slice(0, 3).map((photo) => `
      <div class="photo-tile photo-tile--uploaded" title="${escapeHtml(photo.storage_key || 'Bathroom photo')}">
        ${photo.public_url ? `<img src="${escapeHtml(photo.public_url)}" alt="Bathroom photo" loading="lazy" />` : icon('camera')}
        <span>Photo</span>
      </div>
    `).join('');
    const placeholders = Math.max(0, Math.min(3, Number(bathroom.photoCount || 0)) - photos.length);
    const placeholderCards = Array.from({ length: placeholders }, () => `<div class="photo-tile"><span>Photo pending</span></div>`).join('');
    return `<div class="photo-strip" aria-label="Bathroom photos">${photoCards}${placeholderCards}</div>`;
  }

  function renderActivityCard(items = []) {
    if (!items.length) {
      return `<div class="card activity-card"><div class="empty-state">No feed activity yet. Check-ins and badges will appear here.</div></div>`;
    }
    return `
      <div class="card activity-card">
        ${items.slice(0, 8).map((item) => `
          <div class="activity-row">
            <div class="mini-avatar ${item.avatar || ''}">
              ${item.icon ? icon(item.icon) : escapeHtml(item.initials || 'UP')}
            </div>
            <div class="activity-copy">${item.html}</div>
            <span class="activity-time">${escapeHtml(timeAgo(item.createdAt))}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderBadgeTeaser() {
    const unlockedIds = new Set(state.userBadges.map((item) => item.badge_id || item.id));
    const unlockedBadge = state.badges.find((badge) => unlockedIds.has(badge.id));
    const nextBadge = state.badges.find((badge) => !unlockedIds.has(badge.id));
    const badge = unlockedBadge || nextBadge;
    if (!badge) return '';
    return `
      <article class="badge-card">
        <div class="badge-medallion">${icon('pulse')}</div>
        <div>
          <p class="badge-kicker">${unlockedBadge ? 'Badge unlocked' : 'Next badge'}</p>
          <h2 class="badge-title">${escapeHtml(badge.title)}</h2>
          <p class="badge-quote">“${escapeHtml(badge.subtitle || badge.description || 'Keep exploring.')}”</p>
          <p class="badge-sub">${unlockedBadge ? 'Your family does not need to know.' : 'Check in to make progress.'}</p>
        </div>
      </article>
    `;
  }

  function renderFeedPage() {
    return `
      <section class="content-page">
        <h2 class="page-title">Feed</h2>
        <p class="page-subtitle">Friend activity, trending thrones and questionable little victories.</p>
        <article class="simple-card friend-radar">
          <div class="card-kicker">Privacy by default</div>
          <p class="privacy-note">Activity is designed for delayed, non-exact sharing. No live bathroom location is shown by default.</p>
        </article>
        <div style="height:12px"></div>
        ${renderActivityCard(state.feed)}
      </section>
    `;
  }

  function renderCheckinPage() {
    const bathroom = selectedBathroom();
    return `
      <section class="content-page">
        <h2 class="page-title">Check In</h2>
        <p class="page-subtitle">You survived. How was it?</p>
        ${bathroom ? renderBathroomCard(bathroom) : renderNoBathroomsCard()}
        <div style="height:14px"></div>
        ${bathroom ? `<button class="primary-button full-width" data-action="open-checkin" data-bathroom-id="${bathroom.id}">Rate the relief</button>` : ''}
      </section>
    `;
  }

  function renderBadgesPage() {
    const unlockedIds = new Set(state.userBadges.map((item) => item.badge_id || item.id));
    return `
      <section class="content-page">
        <h2 class="page-title">Badges</h2>
        <p class="page-subtitle">Small rewards for questionable commitment.</p>
        <div class="badge-grid">
          ${state.badges.length ? state.badges.map((badge) => {
            const unlocked = unlockedIds.has(badge.id);
            return `
              <article class="badge-list-item ${unlocked ? '' : 'is-locked'}">
                <div class="badge-list-icon">${icon('badge')}</div>
                <div class="badge-list-copy">
                  <h3>${escapeHtml(badge.title)} ${unlocked ? '<span class="gold-text">✓</span>' : '<span class="faint-text">Locked</span>'}</h3>
                  <p>${escapeHtml(badge.subtitle || '')}</p>
                  <p class="faint-text">${escapeHtml(badge.description || '')}</p>
                </div>
              </article>
            `;
          }).join('') : '<div class="empty-state">No badges configured in Supabase yet.</div>'}
        </div>
      </section>
    `;
  }

  function renderProfilePage() {
    const uniqueCount = new Set(state.checkins.map((c) => c.bathroomId)).size;
    const badgeCount = new Set(state.userBadges.map((item) => item.badge_id || item.id)).size;
    const best = [...bathrooms()].sort((a, b) => b.rating - a.rating)[0];
    return `
      <section class="content-page">
        <h2 class="page-title">Profile</h2>
        <p class="page-subtitle">Your bathroom history. Probably don't frame it.</p>
        <div class="stats-grid">
          <div class="stat-card"><b>${state.checkins.length}</b><span>Check-ins</span></div>
          <div class="stat-card"><b>${uniqueCount}</b><span>Unique thrones</span></div>
          <div class="stat-card"><b>${badgeCount}</b><span>Badges</span></div>
          <div class="stat-card"><b>${best ? rounded(best.rating) : '—'}</b><span>Best nearby</span></div>
        </div>
        <article class="simple-card">
          <h3>${escapeHtml(currentDisplayName())}</h3>
          <p>${state.authUser ? 'Signed in with Supabase' : 'Sign in to save check-ins, photos and badge progress.'} · Anonymous mode ${state.anonymous ? 'on' : 'off'}${best ? ` · Best nearby: ${escapeHtml(best.name)}` : ''}</p>
          <div style="height:12px"></div>
          <button class="secondary-button full-width" data-action="open-auth">${state.authUser ? 'Account settings' : 'Sign in'}</button>
        </article>
        <div style="height:12px"></div>
        ${renderCheckinHistory()}
      </section>
    `;
  }

  function renderCheckinHistory() {
    const items = state.checkins.slice(0, 5);
    if (!items.length) {
      return `<article class="simple-card"><h3>Recent check-ins</h3><p>No check-ins yet. Your porcelain legacy starts here.</p></article>`;
    }
    return `
      <article class="simple-card">
        <h3>Recent check-ins</h3>
        <div class="history-list">
          ${items.map((item) => `
            <div class="history-row">
              <span>${escapeHtml(item.bathroomName)}</span>
              <b>${rounded(item.rating)} ★</b>
            </div>
          `).join('')}
        </div>
      </article>
    `;
  }

  function renderBottomNav() {
    const items = [
      ['map', 'Map', 'map'],
      ['feed', 'Feed', 'feed'],
      ['checkin', 'Check In', 'plus'],
      ['badges', 'Badges', 'badge'],
      ['profile', 'Profile', 'user']
    ];
    return `
      <nav class="bottom-nav" aria-label="Primary navigation">
        ${items.map(([tab, label, iconName]) => {
          const isPrimary = tab === 'checkin';
          return `
            <button class="nav-item ${state.activeTab === tab ? 'is-active' : ''} ${isPrimary ? 'nav-item--primary' : ''}" data-tab="${tab}">
              ${isPrimary ? `<span class="nav-main-icon">${icon(iconName)}</span>` : icon(iconName)}
              <span>${label}</span>
            </button>
          `;
        }).join('')}
      </nav>
    `;
  }

  function renderModal() {
    if (!state.modal) return '';
    if (state.modal === 'emergency') return renderEmergencyModal();
    if (state.modal === 'checkin') return renderCheckinModal();
    if (state.modal === 'details') return renderDetailsModal();
    if (state.modal === 'addBathroom') return renderAddBathroomModal();
    if (state.modal === 'notifications') return renderNotificationsModal();
    if (state.modal === 'auth') return renderAuthModal();
    return '';
  }

  function renderModalShell(title, subtitle, body) {
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" data-modal-panel>
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(title)}</h2>
              <p class="modal-subtitle">${escapeHtml(subtitle)}</p>
            </div>
            <button class="modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button>
          </div>
          <div class="modal-body">${body}</div>
        </section>
      </div>
    `;
  }

  function renderEmergencyModal() {
    const sorted = sortedByDistance(bathrooms());
    const body = sorted.length ? `
      ${state.userLocation ? '' : '<article class="simple-card simple-card--compact"><h3>Location needed for real distance</h3><p>Tap Enable location to sort these by walking distance.</p><button class="secondary-button full-width" data-action="request-location">Enable location</button></article>'}
      <div class="list-stack">
        ${sorted.map((bathroom, index) => `
          <article class="simple-card">
            <h3>${index === 0 ? 'Best immediate option: ' : ''}${escapeHtml(bathroom.name)}</h3>
            <p><span class="gold-text">${rounded(bathroom.rating)} ★</span> · ${escapeHtml(distanceLabel(bathroom))} · ${escapeHtml(bathroom.access)}</p>
            <div style="height:12px"></div>
            <button class="primary-button full-width" data-action="route-to" data-bathroom-id="${bathroom.id}">${icon('route')} Start emergency route</button>
          </article>
        `).join('')}
      </div>
    ` : '<div class="empty-state">No bathrooms are mapped yet. Add one first.</div>';
    return renderModalShell('Emergency Mode', 'Find the closest usable option.', body);
  }

  function renderCheckinModal() {
    const bathroom = bathrooms().find((b) => b.id === state.checkinBathroomId) || selectedBathroom();
    if (!bathroom) return renderModalShell('Check in', 'No bathroom selected.', '<div class="empty-state">Add a bathroom before checking in.</div>');
    const criteriaRows = Object.entries(CRITERIA_LABELS).map(([key, label]) => `
      <label class="range-row">
        <span>${escapeHtml(label)}</span>
        <input type="range" name="${key}" min="1" max="5" step="0.5" value="4" />
      </label>
    `).join('');

    const body = `
      <form class="checkin-form" data-form="checkin">
        <input type="hidden" name="bathroomId" value="${bathroom.id}" />
        <div class="simple-card">
          <h3>${escapeHtml(bathroom.name)}</h3>
          <p>Rate the relief. Keep it useful, not gross.</p>
        </div>
        <div class="range-grid">${criteriaRows}</div>
        <label class="form-field">
          <span>Comment</span>
          <textarea name="comment" rows="3" maxlength="240" placeholder="Elite mirror. Suspiciously good paper."></textarea>
        </label>
        <label class="form-field">
          <span>Photo</span>
          <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" />
          <small>Show the vibe, not the victims. No people, no nudity, no disasters.</small>
        </label>
        <div class="toggle-row">
          <div><b>Anonymous check-in</b><span>Hide your name in public activity.</span></div>
          <button class="switch ${state.anonymous ? 'is-on' : ''}" type="button" aria-pressed="${state.anonymous}" data-action="toggle-anonymous" aria-label="Toggle anonymous check-in"></button>
        </div>
        <button class="primary-button full-width" type="submit">Check in on the throne</button>
      </form>
    `;
    return renderModalShell('Check In', 'You survived. How was it?', body);
  }

  function renderDetailsModal() {
    const bathroom = selectedBathroom();
    if (!bathroom) return renderModalShell('Bathroom details', 'No bathroom selected.', '<div class="empty-state">No bathrooms are mapped yet.</div>');
    const allCriteria = Object.entries(CRITERIA_LABELS).map(([key, label]) => {
      const value = bathroom.criteria?.[key] || 0;
      return `<div class="rating-row"><span class="rating-row__label">${escapeHtml(label)}</span><span class="rating-track"><span class="rating-fill" style="width:${Math.min(value * 20, 100)}%"></span></span><span class="rating-value">${rounded(value)}</span></div>`;
    }).join('');

    const body = `
      <article class="simple-card">
        <h3>${escapeHtml(bathroom.name)}</h3>
        <p><span class="gold-text">${rounded(bathroom.rating)} ★</span> · ${escapeHtml(distanceLabel(bathroom))} · ${escapeHtml(bathroom.type)}</p>
        <div class="chip-row chip-row--compact">${(bathroom.facilities || []).map((facility) => `<span class="pill">${escapeHtml(facility)}</span>`).join('')}</div>
        <div class="quick-verdict">${escapeHtml(bathroom.access || 'Access unknown')}</div>
      </article>
      <div style="height:12px"></div>
      <article class="simple-card"><div class="card-kicker">Full breakdown</div>${allCriteria}</article>
      <div style="height:12px"></div>
      ${renderReviewList(bathroom.id)}
      <div style="height:12px"></div>
      <button class="secondary-button full-width" data-action="report-privacy">Report privacy issue</button>
      <div style="height:10px"></div>
      <button class="primary-button full-width" data-action="open-checkin" data-bathroom-id="${bathroom.id}">Check in on the throne</button>
    `;
    return renderModalShell('Bathroom Details', 'All the dignity metrics.', body);
  }

  function renderReviewList(bathroomId) {
    const reviews = state.reviewsByBathroom[bathroomId];
    if (!reviews) return '<article class="simple-card"><h3>Recent reviews</h3><p>Loading reviews...</p></article>';
    if (!reviews.length) return '<article class="simple-card"><h3>Recent reviews</h3><p>No reviews yet.</p></article>';
    return `
      <article class="simple-card">
        <h3>Recent reviews</h3>
        <div class="review-list">
          ${reviews.map((review) => `
            <div class="review-row">
              <div><b>${escapeHtml(review.author)}</b><small>${escapeHtml(review.text || 'No comment.')}</small></div>
              <span>${rounded(review.rating)} ★</span>
            </div>
          `).join('')}
        </div>
      </article>
    `;
  }

  function renderAddBathroomModal() {
    const body = `
      <form class="add-form" data-form="add-bathroom">
        <label class="form-field">
          <span>Name</span>
          <input name="name" required maxlength="80" placeholder="Venue or bathroom name" />
        </label>
        <div class="field-grid">
          <label class="form-field"><span>Type</span><select name="type"><option>Bar</option><option>Restaurant</option><option>Café</option><option>Club</option><option>Venue</option><option>Public</option><option>Other</option></select></label>
          <label class="form-field"><span>Access</span><select name="accessMode"><option value="public">Public</option><option value="no-code">No code</option><option value="code-needed">Code needed</option><option value="customer-only">Customer-only</option><option value="paid">Paid</option><option value="unknown">Unknown</option></select></label>
        </div>
        <label class="form-field">
          <span>Access note</span>
          <input name="access" maxlength="120" placeholder="Public-ish · No code · Great lighting" />
        </label>
        <label class="form-field">
          <span>Facilities</span>
          <input name="facilities" maxlength="180" placeholder="Accessible, Soap, Mirror, Hooks" />
          <small>Comma-separated.</small>
        </label>
        <label class="form-field">
          <span>City</span>
          <input name="city" maxlength="80" placeholder="City" />
        </label>
        <article class="location-capture">
          <div>
            <b>Map position</b>
            <small>${state.userLocation ? `Will save current location: ${Number(state.userLocation.lat).toFixed(5)}, ${Number(state.userLocation.lng).toFixed(5)}` : 'Enable location before adding to place the bathroom on the map.'}</small>
          </div>
          <button type="button" class="secondary-button" data-action="request-location">${state.userLocation ? 'Refresh' : 'Use my location'}</button>
        </article>
        <button class="primary-button full-width" type="submit">Add this throne</button>
      </form>
    `;
    return renderModalShell('Add Bathroom', 'Map a new throne for the people.', body);
  }

  function renderAuthModal() {
    if (state.authUser) {
      const body = `
        <article class="simple-card">
          <h3>${escapeHtml(currentDisplayName())}</h3>
          <p>${escapeHtml(state.authUser.email || '')}</p>
        </article>
        <div style="height:12px"></div>
        <button class="primary-button full-width" data-action="sync-supabase">Sync data</button>
        <div style="height:10px"></div>
        <button class="secondary-button full-width" data-action="sign-out">Sign out</button>
      `;
      return renderModalShell('Account', 'Supabase session is active.', body);
    }

    const mode = state.authMode === 'signup' ? 'signup' : 'signin';
    const isSignup = mode === 'signup';
    const body = `
      <form class="auth-form" data-form="auth">
        <div class="auth-mode-toggle" role="tablist" aria-label="Account mode">
          <button type="button" class="${!isSignup ? 'is-active' : ''}" data-action="set-auth-mode" data-auth-mode="signin" role="tab" aria-selected="${!isSignup}">Sign in</button>
          <button type="button" class="${isSignup ? 'is-active' : ''}" data-action="set-auth-mode" data-auth-mode="signup" role="tab" aria-selected="${isSignup}">Create account</button>
        </div>
        ${state.authNotice ? `<div class="auth-notice" role="status">${escapeHtml(state.authNotice)}</div>` : ''}
        ${state.authError ? `<div class="auth-error" role="alert">${escapeHtml(state.authError)}</div>` : ''}
        <label class="form-field"><span>Email</span><input name="email" type="email" required autocomplete="email" value="${escapeHtml(state.authEmail || '')}" /></label>
        <label class="form-field"><span>Password</span><input name="password" type="password" required autocomplete="${isSignup ? 'new-password' : 'current-password'}" minlength="6" /></label>
        ${isSignup ? `<label class="form-field"><span>Display name</span><input name="displayName" autocomplete="nickname" placeholder="Optional" value="${escapeHtml(state.authDisplayName || '')}" /><small>Shown on non-anonymous activity.</small></label>` : ''}
        <button class="primary-button full-width" type="submit" name="mode" value="${mode}" ${state.authSubmitting ? 'disabled' : ''}>${state.authSubmitting ? 'Working...' : (isSignup ? 'Create account' : 'Sign in')}</button>
      </form>
    `;
    return renderModalShell(isSignup ? 'Create account' : 'Sign in', 'Save check-ins, photos and badge progress.', body);
  }

  function renderNotificationsModal() {
    const body = state.feed.length
      ? renderActivityCard(state.feed.slice(0, 5))
      : '<div class="empty-state">No notifications yet.</div>';
    return renderModalShell('Notifications', 'Recent activity from Supabase.', body);
  }

  function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach((element) => {
      element.addEventListener('click', () => {
        setState({ activeTab: element.dataset.tab, modal: null });
      });
    });

    document.querySelectorAll('[data-select-bathroom]').forEach((element) => {
      element.addEventListener('click', () => {
        setState({ selectedBathroomId: element.dataset.selectBathroom });
      });
    });

    document.querySelectorAll('[data-action]').forEach((element) => {
      element.addEventListener('click', async (event) => {
        const panel = event.target.closest('[data-modal-panel]');
        if (element.classList.contains('modal-backdrop') && panel) return;
        await handleAction(element, event);
      });
    });

    document.querySelectorAll('[data-form="auth"]').forEach((form) => form.addEventListener('submit', handleAuthSubmit));
    document.querySelectorAll('[data-form="bathroom-search"]').forEach((form) => form.addEventListener('submit', handleSearchSubmit));
    document.querySelectorAll('[data-form="checkin"]').forEach((form) => form.addEventListener('submit', handleCheckinSubmit));
    document.querySelectorAll('[data-form="add-bathroom"]').forEach((form) => form.addEventListener('submit', handleAddBathroomSubmit));
  }

  async function handleAction(element) {
    const action = element.dataset.action;
    switch (action) {
      case 'close-modal':
        setState({ modal: null });
        break;
      case 'open-emergency':
        setState({ modal: 'emergency' });
        if (!state.userLocation && state.geoStatus !== 'loading') requestUserLocation({ silent: true });
        break;
      case 'open-checkin':
        if (!state.authUser) {
          toast('Sign in required', 'Check-ins are saved to Supabase and need an account.');
          setState({ modal: 'auth' });
          return;
        }
        setState({ modal: 'checkin', checkinBathroomId: element.dataset.bathroomId || selectedBathroom()?.id });
        break;
      case 'open-details':
        setState({ modal: 'details', selectedBathroomId: element.dataset.bathroomId || state.selectedBathroomId });
        loadReviews(element.dataset.bathroomId || state.selectedBathroomId);
        break;
      case 'open-add-bathroom':
        if (!state.authUser) {
          toast('Sign in required', 'Bathroom submissions need an account.');
          setState({ modal: 'auth' });
          return;
        }
        setState({ modal: 'addBathroom' });
        break;
      case 'open-notifications':
        setState({ modal: 'notifications' });
        break;
      case 'open-auth':
        setState({ modal: 'auth', authError: '', authNotice: '', authSubmitting: false });
        break;
      case 'set-auth-mode':
        setState({
          authMode: element.dataset.authMode === 'signup' ? 'signup' : 'signin',
          authError: '',
          authNotice: '',
          authSubmitting: false
        });
        break;
      case 'sync-supabase':
        await syncSupabase();
        break;
      case 'sign-out':
        await signOut();
        break;
      case 'toggle-anonymous':
        setState({ anonymous: !state.anonymous });
        break;
      case 'clear-search':
        setState({ searchQuery: '' });
        break;
      case 'report-privacy':
        await reportPrivacyIssue();
        break;
      case 'toggle-filter': {
        const key = element.dataset.filterKey;
        const nextFilters = { ...(state.filters || {}) };
        nextFilters[key] = !nextFilters[key];
        setState({ filters: nextFilters });
        break;
      }
      case 'route-to': {
        const bathroomId = element.dataset.bathroomId || state.selectedBathroomId;
        const target = bathrooms().find((item) => item.id === bathroomId);
        if (!target || !hasCoordinates(target)) {
          toast('Route unavailable', 'This bathroom needs coordinates before we can route to it.');
          return;
        }
        if (!state.userLocation) await requestUserLocation({ silent: true });
        toast('Emergency route ready', state.userLocation ? 'Follow the blue line. Dignity may be restored.' : 'Location is needed for the blue line.');
        setState({ modal: null, selectedBathroomId: bathroomId, routeBathroomId: bathroomId });
        break;
      }
      case 'request-location':
        await requestUserLocation();
        break;
      case 'recenter':
        await requestUserLocation({ recenter: true });
        break;
      default:
        break;
    }
  }


  function queueMapRender() {
    if (mapRenderTimer) window.clearTimeout(mapRenderTimer);
    mapRenderTimer = window.setTimeout(updateLeafletMap, 0);
  }

  function mapDefaults() {
    const config = window.UNPISSED_CONFIG || {};
    const center = Array.isArray(config.MAP_DEFAULT_CENTER) ? config.MAP_DEFAULT_CENTER : [59.9139, 10.7522];
    return {
      center,
      zoom: Number(config.MAP_DEFAULT_ZOOM || 14),
      tileUrl: config.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: config.MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    };
  }

  function updateLeafletMap() {
    const container = document.querySelector('#unpissed-map');
    if (!container || state.activeTab !== 'map' || state.loading || state.backendStatus === 'missing') return;
    if (!window.L) {
      container.innerHTML = '<div class="map-empty">Map library did not load.</div>';
      return;
    }

    const defaults = mapDefaults();
    if (leafletMap && leafletMap.getContainer && leafletMap.getContainer() !== container) {
      leafletMap.remove();
      leafletMap = null;
      markerLayer = null;
      userMarker = null;
      routeLine = null;
    }

    const selected = selectedBathroom();
    const firstMapped = sortedByDistance(filteredBathrooms()).find(hasCoordinates);
    const startCenter = state.userLocation
      ? [state.userLocation.lat, state.userLocation.lng]
      : hasCoordinates(selected)
        ? [Number(selected.lat), Number(selected.lng)]
        : hasCoordinates(firstMapped)
          ? [Number(firstMapped.lat), Number(firstMapped.lng)]
          : defaults.center;

    if (!leafletMap) {
      leafletMap = window.L.map(container, {
        zoomControl: false,
        attributionControl: true
      }).setView(startCenter, defaults.zoom);
      window.L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
      window.L.tileLayer(defaults.tileUrl, {
        maxZoom: 19,
        attribution: defaults.attribution
      }).addTo(leafletMap);
      markerLayer = window.L.layerGroup().addTo(leafletMap);
    }

    markerLayer.clearLayers();
    const markers = [];
    filteredBathrooms().filter(hasCoordinates).forEach((bathroom) => {
      const isActive = bathroom.id === selectedBathroom()?.id;
      const marker = window.L.marker([Number(bathroom.lat), Number(bathroom.lng)], {
        title: bathroom.name,
        icon: window.L.divIcon({
          className: `unpissed-leaflet-pin${isActive ? ' is-active' : ''}`,
          html: `<span>★</span>${rounded(bathroom.rating)}`,
          iconSize: [58, 32],
          iconAnchor: [29, 32]
        })
      });
      marker.on('click', () => setState({ selectedBathroomId: bathroom.id }));
      marker.bindPopup(`<b>${escapeHtml(bathroom.name)}</b><br>${rounded(bathroom.rating)} ★ · ${escapeHtml(distanceLabel(bathroom))}`);
      marker.addTo(markerLayer);
      markers.push(marker);
    });

    if (userMarker) {
      userMarker.remove();
      userMarker = null;
    }
    if (state.userLocation) {
      userMarker = window.L.marker([state.userLocation.lat, state.userLocation.lng], {
        title: 'You are here',
        icon: window.L.divIcon({
          className: 'unpissed-user-marker',
          html: '<span></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        })
      }).addTo(leafletMap);
    }

    if (routeLine) {
      routeLine.remove();
      routeLine = null;
    }
    const routeTarget = bathrooms().find((item) => item.id === state.routeBathroomId);
    if (state.userLocation && hasCoordinates(routeTarget)) {
      routeLine = window.L.polyline([
        [state.userLocation.lat, state.userLocation.lng],
        [Number(routeTarget.lat), Number(routeTarget.lng)]
      ], {
        color: '#6aa2ff',
        weight: 5,
        opacity: 0.85,
        dashArray: '8 9'
      }).addTo(leafletMap);
    }

    const boundsItems = [];
    if (state.userLocation) boundsItems.push([state.userLocation.lat, state.userLocation.lng]);
    markers.forEach((marker) => boundsItems.push(marker.getLatLng()));
    if (boundsItems.length >= 2 && !state.mapHasMoved) {
      leafletMap.fitBounds(boundsItems, { padding: [36, 36], maxZoom: 16 });
    } else if (state.userLocation && !state.mapHasMoved) {
      leafletMap.setView([state.userLocation.lat, state.userLocation.lng], 15);
    }

    window.setTimeout(() => leafletMap?.invalidateSize?.(), 80);
  }

  async function requestUserLocation(options = {}) {
    if (!navigator.geolocation) {
      setState({ geoStatus: 'error', geoError: 'Geolocation is not supported on this device.' });
      return null;
    }
    state = { ...state, geoStatus: 'loading', geoError: '' };
    if (!options.silent) render();

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            updatedAt: new Date().toISOString()
          };
          const nearestId = sortedByDistance((state.bathrooms || []).map((bathroom) => {
            const km = distanceKmBetween(nextLocation, bathroom);
            return Number.isFinite(km) ? { ...bathroom, distanceKm: km, distanceMinutes: walkingMinutes(km) } : bathroom;
          }))[0]?.id;
          state = {
            ...state,
            userLocation: nextLocation,
            geoStatus: 'ready',
            geoError: '',
            mapHasMoved: false,
            selectedBathroomId: nearestId || state.selectedBathroomId,
            syncMessage: 'Location active. Bathrooms are sorted by walking distance.'
          };
          render();
          if (!options.silent) toast('Location active', 'Emergency mode can now find the nearest throne.');
          resolve(nextLocation);
        },
        (error) => {
          const message = error.code === 1
            ? 'Location permission was denied.'
            : error.code === 2
              ? 'Your position is currently unavailable.'
              : 'Location request timed out.';
          state = { ...state, geoStatus: 'error', geoError: message };
          render();
          if (!options.silent) toast('Location failed', message);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  async function initApp() {
    if (!API?.isConfigured?.()) {
      setState({ loading: false, backendStatus: 'missing', syncMessage: 'Add Supabase credentials in js/config.js.' });
      return;
    }
    try {
      const { user } = await API.getSession();
      let profile = null;
      if (user) profile = await API.ensureProfile(user);
      state = {
        ...state,
        authUser: user,
        authProfile: profile,
        backendStatus: user ? 'live' : 'ready',
        syncMessage: user ? 'Signed in. Loading Supabase data.' : 'Supabase connected. Sign in to add and rate bathrooms.'
      };
      render();
      await syncSupabase({ silent: true });
    } catch (error) {
      setState({ loading: false, backendStatus: 'error', syncMessage: `Supabase error: ${error.message}` });
    }
  }

  async function syncSupabase(options = {}) {
    if (!API?.isConfigured?.()) {
      setState({ backendStatus: 'missing', syncMessage: 'Supabase configuration is missing.' });
      return;
    }
    try {
      const [remoteBathrooms, badges, feed] = await Promise.all([
        API.listBathrooms(),
        API.listBadges(),
        API.listFeedEvents()
      ]);
      const checkins = state.authUser ? await API.listMyCheckins(state.authUser.id) : [];
      const userBadges = state.authUser ? await API.listUserBadges(state.authUser.id) : [];
      state = {
        ...state,
        bathrooms: remoteBathrooms,
        badges,
        feed,
        checkins,
        userBadges,
        loading: false,
        backendStatus: state.authUser ? 'live' : 'ready',
        selectedBathroomId: state.selectedBathroomId || sortedByDistance(remoteBathrooms.map((item) => applyDistance(item)))[0]?.id || remoteBathrooms[0]?.id || null,
        syncMessage: `${remoteBathrooms.length} bathrooms loaded from Supabase.`
      };
      render();
      if (!options.silent) toast('Supabase synced', state.syncMessage);
    } catch (error) {
      state = { ...state, loading: false, backendStatus: 'error', syncMessage: `Sync failed: ${error.message}` };
      render();
      toast('Sync failed', error.message);
    }
  }

  async function signOut() {
    try {
      await API?.signOut?.();
      state = {
        ...state,
        authUser: null,
        authProfile: null,
        checkins: [],
        userBadges: [],
        backendStatus: 'ready',
        syncMessage: 'Signed out. Public Supabase data remains visible.',
        modal: null
      };
      render();
      toast('Signed out', 'Public bathroom data is still available.');
    } catch (error) {
      toast('Sign out failed', error.message);
    }
  }

  async function reportPrivacyIssue() {
    const bathroom = selectedBathroom();
    if (!bathroom) return;
    try {
      await API.reportPrivacyIssue({ bathroomId: bathroom.id, reason: 'privacy_issue' }, state.authUser?.id || null);
      toast('Report saved', 'Moderation ticket created in Supabase.');
    } catch (error) {
      toast('Report failed', error.message);
    }
  }

  function authErrorMessage(error, mode) {
    const message = String(error?.message || 'Authentication failed.');
    const lower = message.toLowerCase();
    if (lower.includes('invalid login credentials')) return 'Email or password is incorrect.';
    if (lower.includes('email not confirmed')) return 'Confirm your email before signing in.';
    if (lower.includes('user already registered') || lower.includes('already registered')) return 'That email already has an account. Sign in instead.';
    if (lower.includes('password')) return message;
    if (lower.includes('row-level security')) {
      return mode === 'signup'
        ? 'Account was created, but your profile could not be saved yet. Confirm your email and sign in.'
        : 'Your account is signed in, but profile access is blocked by Supabase policy.';
    }
    return message;
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!API?.isConfigured?.()) return;
    const submitter = event.submitter;
    const mode = state.authMode === 'signup' || submitter?.value === 'signup' ? 'signup' : 'signin';
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const displayName = String(formData.get('displayName') || '').trim();
    if (!email || !password) return;

    state = {
      ...state,
      authEmail: email,
      authDisplayName: displayName,
      authError: '',
      authNotice: '',
      authSubmitting: true
    };
    render();

    try {
      const result = mode === 'signup'
        ? await API.signUp(email, password, displayName)
        : await API.signIn(email, password);
      const currentSession = await API.getSession();
      const user = currentSession.user || result.session?.user || null;
      if (mode === 'signup' && !user) {
        setState({
          authMode: 'signin',
          authSubmitting: false,
          authError: '',
          authNotice: 'Check your email to confirm the account, then sign in.',
          syncMessage: 'Check your email to confirm the account, then sign in.'
        });
        return;
      }
      const profile = user ? await API.ensureProfile(user, displayName) : null;
      state = {
        ...state,
        authUser: user,
        authProfile: profile,
        modal: null,
        authEmail: '',
        authDisplayName: '',
        authError: '',
        authNotice: '',
        authSubmitting: false,
        backendStatus: user ? 'live' : 'ready',
        syncMessage: 'Signed in. Supabase writes are active.'
      };
      render();
      toast('Signed in', state.syncMessage);
      await syncSupabase({ silent: true });
    } catch (error) {
      setState({
        authSubmitting: false,
        authNotice: '',
        authError: authErrorMessage(error, mode)
      });
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = String(formData.get('query') || '').trim();
    const nextVisible = bathrooms().filter((bathroom) => {
      const haystack = [bathroom.name, bathroom.type, bathroom.access, ...(bathroom.tags || []), ...(bathroom.facilities || []), ...(bathroom.vibeTags || [])].join(' ').toLowerCase();
      return !query || haystack.includes(query.toLowerCase());
    });
    setState({ searchQuery: query, selectedBathroomId: nextVisible[0]?.id || state.selectedBathroomId });
  }

  async function handleCheckinSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const bathroom = bathrooms().find((b) => b.id === state.checkinBathroomId) || selectedBathroom();
    if (!bathroom || !state.authUser) return;
    const formData = new FormData(form);
    const criteria = {};
    Object.keys(CRITERIA_LABELS).forEach((key) => {
      criteria[key] = Number(formData.get(key));
    });
    const rating = overallFromCriteria(criteria);
    const photo = form.querySelector('input[name="photo"]')?.files?.[0];
    const checkin = {
      bathroomId: bathroom.id,
      bathroomName: bathroom.name,
      criteria,
      rating,
      comment: String(formData.get('comment') || '').trim(),
      anonymous: state.anonymous
    };

    try {
      await API.createCheckin({ ...checkin, photo }, state.authUser.id);
      await updateBadgeUnlocks();
      state = {
        ...state,
        modal: null,
        activeTab: 'feed',
        syncMessage: 'Check-in saved to Supabase.'
      };
      render();
      toast('Check-in saved', 'Saved to Supabase. Your family does not need to know.');
      await syncSupabase({ silent: true });
    } catch (error) {
      toast('Supabase save failed', error.message);
    }
  }

  async function handleAddBathroomSubmit(event) {
    event.preventDefault();
    if (!state.authUser) return;
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') || '').trim();
    if (!name) return;
    const access = String(formData.get('access') || '').trim();
    const facilities = String(formData.get('facilities') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const input = {
      name,
      type: String(formData.get('type') || 'Other'),
      access: access || 'Access unknown',
      accessMode: String(formData.get('accessMode') || 'unknown'),
      facilities,
      city: String(formData.get('city') || '').trim(),
      lat: state.userLocation?.lat ?? null,
      lng: state.userLocation?.lng ?? null,
      vibeTags: facilities.slice(0, 3)
    };

    try {
      const created = await API.addBathroom(input, state.authUser.id);
      await updateBadgeUnlocks({ bathroomAdded: true });
      state = {
        ...state,
        selectedBathroomId: created.id,
        modal: null,
        activeTab: 'map',
        syncMessage: 'Bathroom submitted to Supabase moderation.'
      };
      render();
      toast('Bathroom added', 'Saved to Supabase as pending.');
      await syncSupabase({ silent: true });
    } catch (error) {
      toast('Supabase save failed', error.message);
    }
  }

  async function updateBadgeUnlocks(extra = {}) {
    if (!state.authUser || !state.badges.length) return;
    try {
      const latestCheckins = await API.listMyCheckins(state.authUser.id);
      const unique = new Set(latestCheckins.map((item) => item.bathroomId));
      const toUnlock = [];
      if (latestCheckins.length >= 1) toUnlock.push('emergency-landing');
      if (unique.size >= 5) toUnlock.push('pub-crawl-plumber');
      if (unique.size >= 10) toUnlock.push('golden-flush');
      if (extra.bathroomAdded) toUnlock.push('hidden-gem-hunter');
      await Promise.all(toUnlock.map((badgeId) => API.unlockBadge(state.authUser.id, badgeId).catch(() => null)));
    } catch {
      // Badge unlocks are non-critical; check-in/add should not fail because of badge rules.
    }
  }

  async function loadReviews(bathroomId) {
    if (!bathroomId || state.reviewsByBathroom[bathroomId]) return;
    try {
      const reviews = await API.listReviews(bathroomId);
      state = {
        ...state,
        reviewsByBathroom: {
          ...state.reviewsByBathroom,
          [bathroomId]: reviews
        }
      };
      render();
    } catch (error) {
      state = {
        ...state,
        reviewsByBathroom: {
          ...state.reviewsByBathroom,
          [bathroomId]: []
        }
      };
      render();
    }
  }

  function toast(title, subtitle) {
    const root = document.querySelector('#toast-root');
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `<div class="badge-list-icon" style="width:38px;height:38px">${icon('pulse')}</div><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>`;
    root.appendChild(item);
    setTimeout(() => item.remove(), 3400);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  render();
  initApp();
})();
