(() => {
  const DATA = window.UNPISSED_DATA;
  const STORAGE_KEY = 'unpissed-demo-state-v2';

  const defaultState = {
    activeTab: 'map',
    selectedBathroomId: 'fox-barrel',
    modal: null,
    anonymous: true,
    checkinBathroomId: 'fox-barrel',
    checkins: [],
    customBathrooms: [],
    unlockedBadges: ['emergency-landing'],
    filters: {
      topRated: false,
      noCode: false,
      openNow: false,
      accessible: false
    }
  };

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultState };
      return { ...defaultState, ...JSON.parse(raw), modal: null };
    } catch {
      return { ...defaultState };
    }
  }

  function persist() {
    const { modal, activeTab, selectedBathroomId, ...stored } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }

  function setState(patch) {
    state = { ...state, ...patch };
    persist();
    render();
  }

  function bathrooms() {
    return [...DATA.bathrooms, ...state.customBathrooms];
  }

  function filteredBathrooms() {
    return bathrooms().filter((bathroom) => {
      const filters = state.filters || {};
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
    return all.find((b) => b.id === state.selectedBathroomId) || visible[0] || all[0];
  }

  function photoEntriesForBathroom(bathroomId) {
    return state.checkins.filter((checkin) => checkin.bathroomId === bathroomId && checkin.photoName).slice(-3).reverse();
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

  function overallFromCriteria(criteria) {
    const values = Object.values(criteria || {}).map(Number).filter((n) => !Number.isNaN(n));
    if (!values.length) return 0;
    return values.reduce((sum, n) => sum + n, 0) / values.length;
  }

  function render() {
    const app = document.querySelector('#app');
    app.innerHTML = `
      <section class="screen">
        ${renderStatusBar()}
        <div class="scroll-area">
          ${renderHeader()}
          ${renderActiveTab()}
        </div>
        ${renderBottomNav()}
        ${renderModal()}
      </section>
    `;
    bindEvents();
  }

  function renderStatusBar() {
    return `
      <div class="status-bar">
        <span class="status-bar__time">11:47</span>
        <div class="status-bar__right">
          <span class="status-bar__network">5G</span>
          <div class="signal-bars"><span></span><span></span><span></span><span></span></div>
          <div class="battery"></div>
        </div>
      </div>
    `;
  }

  function renderHeader() {
    return `
      <header class="header">
        <div>
          <h1 class="logo">Unpissed<span>.</span></h1>
          <p class="tagline">Find the throne before it's too late</p>
        </div>
        <div class="header-actions">
          <button class="icon-button" data-action="open-notifications" aria-label="Notifications">
            ${icon('bell')}
            <span class="notification-dot" aria-hidden="true"></span>
          </button>
          <div class="avatar" aria-label="Profile avatar">${DATA.user.initials}</div>
        </div>
      </header>
    `;
  }

  function renderActiveTab() {
    switch (state.activeTab) {
      case 'feed': return renderFeedPage();
      case 'checkin': return renderCheckinPage();
      case 'badges': return renderBadgesPage();
      case 'profile': return renderProfilePage();
      default: return renderMapPage();
    }
  }

  function renderMapPage() {
    const bathroom = selectedBathroom();
    return `
      <button class="emergency-card" data-action="open-emergency">
        <div>
          <div class="emergency-kicker"><span class="pulse-dot"></span>Emergency mode</div>
          <h2>I need a bathroom. Now.</h2>
          <p>Routes you to the closest survivable throne.</p>
        </div>
        <span class="emergency-arrow">${icon('chevron')}</span>
      </button>

      ${renderFilterBar()}
      <div class="section-row">
        <h2 class="section-title">Bathroom hotspots nearby</h2>
        <span class="section-meta">${filteredBathrooms().length} visible · 0.6 mi radius</span>
      </div>
      ${renderMap()}
      ${renderBathroomCard(bathroom)}

      <div class="section-row">
        <h2 class="section-title">Tonight around you</h2>
        <button class="section-action" data-tab="feed">See all</button>
      </div>
      ${renderActivityCard(DATA.feed)}
      ${renderBadgeTeaser()}
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

  function renderMap() {
    const visibleBathrooms = filteredBathrooms();
    const pins = visibleBathrooms.map((bathroom) => `
      <button
        class="map-pin ${bathroom.id === state.selectedBathroomId ? 'is-active' : ''}"
        style="left:${bathroom.x}%; top:${bathroom.y}%;"
        data-select-bathroom="${bathroom.id}"
        aria-label="Select ${escapeHtml(bathroom.name)}"
      ><span class="star">★</span>${rounded(bathroom.rating)}</button>
    `).join('');
    const emptyState = visibleBathrooms.length ? '' : '<div class="map-empty">No matches. Lower your standards, temporarily.</div>';

    return `
      <div class="map-card" role="img" aria-label="Stylized map with nearby bathroom ratings">
        <div class="map-water"></div>
        <span class="road"></span><span class="road"></span><span class="road"></span><span class="road"></span><span class="road"></span>
        <span class="you-dot" aria-label="You are here"></span>
        ${pins}
        ${emptyState}
        <button class="add-throne" data-action="open-add-bathroom"><span>+</span> Add this throne to the map</button>
        <button class="recenter" data-action="recenter" aria-label="Recenter map">${icon('locate')}</button>
      </div>
    `;
  }

  function renderBathroomCard(bathroom) {
    const criteriaOrder = ['cleanliness', 'queueFactor', 'paperQuality', 'lockConfidence', 'vibe'];
    const criteriaRows = criteriaOrder.map((key) => {
      const value = bathroom.criteria[key] || 0;
      const isGold = key === 'vibe' && value >= 4.8;
      return `
        <div class="rating-row">
          <span class="rating-row__label">${DATA.criteriaLabels[key]}</span>
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
              <div class="rating-line"><span class="rating-number">${rounded(bathroom.rating)} ★</span><span class="dot-separator"></span><span>${bathroom.distanceMinutes} min walk</span></div>
            </div>
            <span class="trending-pill">${escapeHtml(bathroom.status || 'OPEN')}</span>
          </div>
          <div class="chip-row">${bathroom.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}</div>
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


  function renderPhotoStrip(bathroom) {
    const uploaded = photoEntriesForBathroom(bathroom.id);
    const placeholders = Math.max(0, Math.min(3, Number(bathroom.photoCount || 0)) - uploaded.length);
    const uploadedCards = uploaded.map((entry) => `
      <div class="photo-tile photo-tile--uploaded" title="${escapeHtml(entry.photoName)}">
        ${icon('camera')}
        <span>${escapeHtml(entry.photoName)}</span>
      </div>
    `).join('');
    const placeholderCards = Array.from({ length: placeholders }, (_, index) => `
      <div class="photo-tile"><span>Bathroom photo ${index + 1}</span></div>
    `).join('');
    return `
      <div class="photo-strip" aria-label="Bathroom photos">
        ${uploadedCards}${placeholderCards || '<div class="photo-tile"><span>No photos yet</span></div>'}
      </div>
    `;
  }

  function renderActivityCard(items) {
    return `
      <div class="card activity-card">
        ${items.map((item) => `
          <div class="activity-row">
            <div class="mini-avatar ${item.avatar === 'teal' ? 'teal' : item.avatar === 'blue' ? 'blue' : ''}">
              ${item.icon === 'trend' ? icon('trend') : escapeHtml(item.initials)}
            </div>
            <div class="activity-copy">${item.text}</div>
            <span class="activity-time">${item.time}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderBadgeTeaser() {
    return `
      <article class="badge-card">
        <div class="badge-medallion">${icon('pulse')}</div>
        <div>
          <p class="badge-kicker">Badge unlocked</p>
          <h2 class="badge-title">Emergency Landing</h2>
          <p class="badge-quote">“Fast thinking. Faster walking.”</p>
          <p class="badge-sub">Your family does not need to know.</p>
        </div>
      </article>
    `;
  }

  function renderFeedPage() {
    const personalEvents = state.checkins.slice().reverse().map((checkin, index) => ({
      id: `checkin-${index}`,
      initials: state.anonymous ? '??' : DATA.user.initials,
      avatar: 'gold',
      text: `<b>${state.anonymous ? 'Someone discreet' : DATA.user.name}</b> checked in at <b>${escapeHtml(checkin.bathroomName)}</b>${checkin.photoName ? ' · added a photo' : ''}`,
      time: 'now'
    }));
    const feed = [...personalEvents, ...DATA.feed];
    return `
      <section class="content-page">
        <h2 class="page-title">Feed</h2>
        <p class="page-subtitle">Friend activity, trending thrones and questionable little victories.</p>
        ${renderActivityCard(feed)}
      </section>
    `;
  }

  function renderCheckinPage() {
    const bathroom = selectedBathroom();
    return `
      <section class="content-page">
        <h2 class="page-title">Check In</h2>
        <p class="page-subtitle">You survived. How was it?</p>
        ${renderBathroomCard(bathroom)}
        <div style="height:14px"></div>
        <button class="primary-button full-width" data-action="open-checkin" data-bathroom-id="${bathroom.id}">Rate the relief</button>
      </section>
    `;
  }

  function renderBadgesPage() {
    const badges = DATA.badges.map((badge) => ({
      ...badge,
      unlocked: badge.unlocked || state.unlockedBadges.includes(badge.id)
    }));
    return `
      <section class="content-page">
        <h2 class="page-title">Badges</h2>
        <p class="page-subtitle">Collect proof of your most unnecessary achievements.</p>
        <div class="badge-grid">
          ${badges.map((badge) => `
            <article class="badge-list-item ${badge.unlocked ? '' : 'is-locked'}">
              <div class="badge-list-icon">${badge.unlocked ? icon('pulse') : icon('lock')}</div>
              <div class="badge-list-copy">
                <h3>${escapeHtml(badge.title)} ${badge.unlocked ? '<span class="gold-text">✓</span>' : '<span class="faint-text">Locked</span>'}</h3>
                <p>${escapeHtml(badge.subtitle)}</p>
                <p class="faint-text">${escapeHtml(badge.description)}</p>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderProfilePage() {
    const uniqueCount = new Set(state.checkins.map((c) => c.bathroomId)).size;
    const badgeCount = new Set(state.unlockedBadges).size;
    const best = [...bathrooms()].sort((a, b) => b.rating - a.rating)[0];
    return `
      <section class="content-page">
        <h2 class="page-title">Profile</h2>
        <p class="page-subtitle">Your bathroom history. Probably don't frame it.</p>
        <div class="stats-grid">
          <div class="stat-card"><b>${state.checkins.length}</b><span>Check-ins</span></div>
          <div class="stat-card"><b>${uniqueCount}</b><span>Unique thrones</span></div>
          <div class="stat-card"><b>${badgeCount}</b><span>Badges</span></div>
          <div class="stat-card"><b>${rounded(best.rating)}</b><span>Best nearby</span></div>
        </div>
        <article class="simple-card">
          <h3>${escapeHtml(DATA.user.name)}</h3>
          <p>${escapeHtml(DATA.user.city)} · Anonymous mode ${state.anonymous ? 'on' : 'off'} · Best nearby: ${escapeHtml(best.name)}</p>
        </article>
        <div style="height:12px"></div>
        ${renderCheckinHistory()}
        <div style="height:12px"></div>
        <button class="secondary-button full-width" data-action="reset-demo">Reset demo data</button>
      </section>
    `;
  }


  function renderCheckinHistory() {
    const items = state.checkins.slice().reverse().slice(0, 5);
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
    const sorted = bathrooms().slice().sort((a, b) => a.distanceMinutes - b.distanceMinutes);
    const body = `
      <div class="list-stack">
        ${sorted.map((bathroom, index) => `
          <article class="simple-card">
            <h3>${index === 0 ? 'Best immediate option: ' : ''}${escapeHtml(bathroom.name)}</h3>
            <p><span class="gold-text">${rounded(bathroom.rating)} ★</span> · ${bathroom.distanceMinutes} min walk · ${escapeHtml(bathroom.access)}</p>
            <div style="height:12px"></div>
            <button class="primary-button full-width" data-action="route-to" data-bathroom-id="${bathroom.id}">${icon('route')} Start emergency route</button>
          </article>
        `).join('')}
      </div>
    `;
    return renderModalShell('Emergency Mode', 'Closest survivable thrones. No judgment.', body);
  }

  function renderCheckinModal() {
    const bathroom = bathrooms().find((b) => b.id === state.checkinBathroomId) || selectedBathroom();
    const criteriaRows = Object.entries(DATA.criteriaLabels).map(([key, label]) => {
      const value = bathroom.criteria?.[key] || 4;
      return `
        <div class="rating-input-row">
          <label for="rating-${key}">${label}</label>
          <input id="rating-${key}" name="${key}" type="range" min="1" max="5" step="0.1" value="${value}" data-rating-slider />
          <output for="rating-${key}">${rounded(value)}</output>
        </div>
      `;
    }).join('');

    const body = `
      <form class="form-grid" data-form="checkin">
        <article class="simple-card">
          <h3>${escapeHtml(bathroom.name)}</h3>
          <p>${escapeHtml(bathroom.access)} · ${bathroom.distanceMinutes} min walk</p>
        </article>
        ${criteriaRows}
        <div class="form-field">
          <label for="checkin-photo">Optional photo</label>
          <input id="checkin-photo" name="photo" type="file" accept="image/*" />
          <small>Demo stores only the filename. Netlify + Cloudflare upload is scaffolded for later.</small>
        </div>
        <div class="form-field">
          <label for="checkin-comment">Comment</label>
          <textarea id="checkin-comment" name="comment" maxlength="160" placeholder="No soap. No hope."></textarea>
        </div>
        <div class="toggle-row">
          <div>
            <span>Anonymous check-in</span>
            <span>Share the rating, not your exact bathroom moment.</span>
          </div>
          <button class="switch" type="button" aria-pressed="${state.anonymous}" data-action="toggle-anonymous" aria-label="Toggle anonymous check-in"></button>
        </div>
        <button class="primary-button full-width" type="submit">Submit check-in</button>
      </form>
    `;
    return renderModalShell('Rate the relief', 'You survived. How was it?', body);
  }

  function renderDetailsModal() {
    const bathroom = selectedBathroom();
    const allCriteria = Object.entries(DATA.criteriaLabels).map(([key, label]) => {
      const value = bathroom.criteria[key] || 0;
      return `<div class="rating-row"><span class="rating-row__label">${label}</span><span class="rating-track"><span class="rating-fill" style="width:${value * 20}%"></span></span><span class="rating-value">${rounded(value)}</span></div>`;
    }).join('');
    const body = `
      <article class="simple-card">
        <h3>${escapeHtml(bathroom.name)}</h3>
        <p><span class="gold-text">${rounded(bathroom.rating)} ★</span> · ${bathroom.distanceMinutes} min walk · ${escapeHtml(bathroom.type)}</p>
        <p style="margin-top:8px">${escapeHtml(bathroom.access)}</p>
        <div class="chip-row chip-row--compact">${(bathroom.facilities || []).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join('')}</div>
      </article>
      <div style="height:14px"></div>
      <div class="simple-card">
        <div class="card-kicker">Photos</div>
        ${renderPhotoStrip(bathroom)}
      </div>
      <div style="height:14px"></div>
      <div class="simple-card">
        <div class="card-kicker">Full breakdown</div>
        ${allCriteria}
      </div>
      <div style="height:14px"></div>
      <button class="primary-button full-width" data-action="open-checkin" data-bathroom-id="${bathroom.id}">Check in on the throne</button>
    `;
    return renderModalShell('Bathroom details', 'Useful facts before a questionable decision.', body);
  }

  function renderAddBathroomModal() {
    const body = `
      <form class="form-grid" data-form="add-bathroom">
        <div class="form-field">
          <label for="bathroom-name">Bathroom name</label>
          <input id="bathroom-name" name="name" required maxlength="60" placeholder="The Secret Sink" />
        </div>
        <div class="form-field">
          <label for="bathroom-type">Type</label>
          <select id="bathroom-type" name="type">
            <option>Bar</option>
            <option>Restaurant</option>
            <option>Café</option>
            <option>Venue</option>
            <option>Public</option>
            <option>Other</option>
          </select>
        </div>
        <div class="form-field">
          <label for="bathroom-access">Access note</label>
          <input id="bathroom-access" name="access" maxlength="80" placeholder="No code · Great lighting · Public-ish" />
        </div>
        <div class="form-field">
          <label for="bathroom-facilities">Facilities</label>
          <input id="bathroom-facilities" name="facilities" maxlength="120" placeholder="Accessible, soap, hooks, changing table" />
        </div>
        <button class="primary-button full-width" type="submit">Add this throne</button>
      </form>
    `;
    return renderModalShell('Add this throne', 'Show the vibe, not the victims. No people, no chaos.', body);
  }

  function renderNotificationsModal() {
    const body = `
      <div class="list-stack">
        <article class="simple-card"><h3>Badge unlocked</h3><p><b class="gold-text">Emergency Landing</b> · Fast thinking. Faster walking.</p></article>
        <article class="simple-card"><h3>Trending nearby</h3><p>The Fox & Barrel is having a suspiciously great bathroom night.</p></article>
      </div>
    `;
    return renderModalShell('Notifications', 'Tiny updates. Big relief.', body);
  }

  function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (tab === 'checkin') {
          setState({ activeTab: 'checkin', modal: 'checkin', checkinBathroomId: selectedBathroom().id });
        } else {
          setState({ activeTab: tab, modal: null });
        }
      });
    });

    document.querySelectorAll('[data-select-bathroom]').forEach((button) => {
      button.addEventListener('click', () => {
        setState({ selectedBathroomId: button.dataset.selectBathroom });
      });
    });

    document.querySelectorAll('[data-action]').forEach((element) => {
      element.addEventListener('click', (event) => {
        const action = element.dataset.action;
        if (action === 'close-modal') {
          if (element.hasAttribute('data-modal-panel')) return;
          setState({ modal: null });
          return;
        }
        if (element.closest('[data-modal-panel]') && element.classList.contains('modal-backdrop')) return;
        handleAction(action, element, event);
      });
    });

    document.querySelectorAll('[data-modal-panel]').forEach((panel) => {
      panel.addEventListener('click', (event) => event.stopPropagation());
    });

    document.querySelectorAll('[data-rating-slider]').forEach((slider) => {
      slider.addEventListener('input', () => {
        const output = slider.parentElement.querySelector('output');
        if (output) output.value = rounded(slider.value);
      });
    });

    const checkinForm = document.querySelector('[data-form="checkin"]');
    if (checkinForm) {
      checkinForm.addEventListener('submit', handleCheckinSubmit);
    }

    const addBathroomForm = document.querySelector('[data-form="add-bathroom"]');
    if (addBathroomForm) {
      addBathroomForm.addEventListener('submit', handleAddBathroomSubmit);
    }
  }

  function handleAction(action, element, event) {
    if (!action) return;
    switch (action) {
      case 'open-emergency':
        setState({ modal: 'emergency' });
        break;
      case 'open-checkin':
        setState({ modal: 'checkin', checkinBathroomId: element.dataset.bathroomId || selectedBathroom().id });
        break;
      case 'open-details':
        setState({ modal: 'details', selectedBathroomId: element.dataset.bathroomId || state.selectedBathroomId });
        break;
      case 'open-add-bathroom':
        setState({ modal: 'addBathroom' });
        break;
      case 'open-notifications':
        setState({ modal: 'notifications' });
        break;
      case 'toggle-anonymous':
        state.anonymous = !state.anonymous;
        persist();
        element.setAttribute('aria-pressed', String(state.anonymous));
        break;
      case 'toggle-filter': {
        const key = element.dataset.filterKey;
        const nextFilters = { ...(state.filters || {}) };
        nextFilters[key] = !nextFilters[key];
        setState({ filters: nextFilters });
        break;
      }
      case 'route-to':
        toast('Emergency route ready', 'Follow the blue line. Dignity may be restored.');
        setState({ modal: null, selectedBathroomId: element.dataset.bathroomId || state.selectedBathroomId });
        break;
      case 'recenter':
        toast('Map recentered', 'You are still here. Stay strong.');
        break;
      case 'reset-demo':
        localStorage.removeItem(STORAGE_KEY);
        state = { ...defaultState };
        toast('Demo reset', 'Your porcelain history has been wiped.');
        render();
        break;
      default:
        break;
    }
  }

  function handleCheckinSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const bathroom = bathrooms().find((b) => b.id === state.checkinBathroomId) || selectedBathroom();
    const formData = new FormData(form);
    const criteria = {};
    Object.keys(DATA.criteriaLabels).forEach((key) => {
      criteria[key] = Number(formData.get(key));
    });
    const rating = overallFromCriteria(criteria);
    const photo = form.querySelector('input[name="photo"]')?.files?.[0];
    const checkin = {
      id: `checkin-${Date.now()}`,
      bathroomId: bathroom.id,
      bathroomName: bathroom.name,
      criteria,
      rating,
      comment: String(formData.get('comment') || '').trim(),
      photoName: photo ? photo.name : '',
      anonymous: state.anonymous,
      createdAt: new Date().toISOString()
    };

    const nextCheckins = [...state.checkins, checkin];
    const nextBadges = updateBadges(nextCheckins);
    state = {
      ...state,
      checkins: nextCheckins,
      unlockedBadges: nextBadges,
      modal: null,
      activeTab: 'feed'
    };
    persist();
    render();
    toast('Check-in saved', 'Badge progress updated. Your family does not need to know.');
  }

  function handleAddBathroomSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') || '').trim();
    if (!name) return;
    const access = String(formData.get('access') || 'Access unknown').trim();
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`;
    const facilities = String(formData.get('facilities') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const lowerAccess = access.toLowerCase();
    const custom = {
      id,
      name,
      rating: 4.0,
      distanceMinutes: Math.floor(3 + Math.random() * 6),
      distanceMiles: 0.2,
      x: Math.floor(20 + Math.random() * 60),
      y: Math.floor(25 + Math.random() * 55),
      tags: access.split('·').map((tag) => tag.trim()).filter(Boolean).slice(0, 3),
      status: 'NEW',
      access,
      accessMode: lowerAccess.includes('no code') ? 'no-code' : lowerAccess.includes('code') ? 'code-needed' : lowerAccess.includes('customer') ? 'customer-only' : 'unknown',
      openNow: true,
      type: String(formData.get('type') || 'Other'),
      facilities,
      photoCount: 0,
      criteria: {
        cleanliness: 4.0,
        queueFactor: 4.0,
        paperQuality: 4.0,
        lockConfidence: 4.0,
        vibe: 4.0,
        essentials: 4.0,
        soundSafety: 4.0
      }
    };
    if (!custom.tags.length) custom.tags = ['New throne', 'Needs ratings'];
    state = {
      ...state,
      customBathrooms: [...state.customBathrooms, custom],
      selectedBathroomId: custom.id,
      modal: null,
      activeTab: 'map'
    };
    persist();
    render();
    toast('Bathroom added', 'Hidden Gem Hunter progress started.');
  }

  function updateBadges(checkins) {
    const unlocked = new Set(state.unlockedBadges);
    const unique = new Set(checkins.map((c) => c.bathroomId));
    if (checkins.length >= 1) unlocked.add('emergency-landing');
    if (unique.size >= 3) unlocked.add('hidden-gem-hunter');
    if (unique.size >= 5) unlocked.add('pub-crawl-plumber');
    if (unique.size >= 10) unlocked.add('golden-flush');
    if (checkins.some((c) => c.bathroomId === 'fox-barrel')) unlocked.add('porcelain-royalty');
    return [...unlocked];
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
})();
