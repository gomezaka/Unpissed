(() => {
  const config = window.UNPISSED_CONFIG || {};
  const PAGE_SIZE = 1000;
  const REQUEST_TIMEOUT_MS = Number(config.SUPABASE_REQUEST_TIMEOUT_MS || 12000);
  const PLACEHOLDER_VALUES = new Set([
    'https://your-project-ref.supabase.co',
    'https://your_project.supabase.co',
    'your-supabase-anon-key',
    'your_anon_or_publishable_key'
  ]);
  let client = null;
  const REST_SESSION_KEY = `unpissed.supabase.${config.SUPABASE_URL || 'local'}.session`;
  const SESSION_EXPIRY_SKEW_MS = 60000;

  function cleanValue(value) {
    return String(value || '').trim();
  }

  function hasRealValue(value) {
    const cleaned = cleanValue(value).toLowerCase();
    return Boolean(cleaned) && !PLACEHOLDER_VALUES.has(cleaned);
  }

  function configurationStatus() {
    if (!config.ENABLE_SUPABASE) {
      return {
        ok: false,
        reason: 'disabled',
        title: 'Supabase disabled',
        message: 'Supabase is disabled in js/config.js.'
      };
    }
    if (!hasRealValue(config.SUPABASE_URL) || !hasRealValue(config.SUPABASE_ANON_KEY)) {
      return {
        ok: false,
        reason: 'missing-credentials',
        title: 'Supabase credentials missing',
        message: 'Add your Supabase URL and anon key in js/config.js.'
      };
    }
    if (!window.supabase?.createClient) {
      return {
        ok: true,
        reason: 'rest-fallback',
        title: 'Supabase ready',
        message: 'Supabase CDN did not load, using built-in REST client.'
      };
    }
    return {
      ok: true,
      reason: 'ready',
      title: 'Supabase ready',
      message: 'Supabase is configured.'
    };
  }

  function sessionExpiresAtMs(session) {
    const expiresAt = Number(session?.expires_at || 0);
    if (expiresAt) return expiresAt * 1000;
    const expiresIn = Number(session?.expires_in || 0);
    if (!expiresIn) return 0;
    return Date.now() + expiresIn * 1000;
  }

  function isSessionExpired(session, skewMs = SESSION_EXPIRY_SKEW_MS) {
    const expiresAtMs = sessionExpiresAtMs(session);
    return Boolean(expiresAtMs && expiresAtMs < Date.now() + skewMs);
  }

  function getStoredSession(options = {}) {
    try {
      const raw = window.localStorage?.getItem(REST_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session?.access_token) return null;
      if (!options.allowExpired && isSessionExpired(session, -30000)) {
        window.localStorage?.removeItem(REST_SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  function setStoredSession(session) {
    try {
      if (!session?.access_token) {
        window.localStorage?.removeItem(REST_SESSION_KEY);
        return;
      }
      const sessionToStore = { ...session };
      if (!sessionToStore.expires_at && sessionToStore.expires_in) {
        sessionToStore.expires_at = Math.floor(Date.now() / 1000) + Number(sessionToStore.expires_in);
      }
      window.localStorage?.setItem(REST_SESSION_KEY, JSON.stringify(sessionToStore));
    } catch {
      // Auth persistence is useful, but the app can continue without it.
    }
  }

  function redirectToUrl() {
    const url = new URL(window.location.href);
    url.hash = '';
    url.pathname = url.pathname.replace(/\/index\.html$/i, '/');
    ['access_token', 'code', 'error', 'error_code', 'error_description', 'expires_at', 'expires_in', 'provider_token', 'refresh_token', 'token_type', 'type'].forEach((key) => {
      url.searchParams.delete(key);
    });
    return url.toString();
  }

  function cleanAuthUrl() {
    if (!window.history?.replaceState) return;
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    const hasAuthHash = hashParams.has('access_token') || hashParams.has('refresh_token');
    if (!hasAuthHash) return;
    url.hash = '';
    window.history.replaceState({}, document.title, url.toString());
  }

  async function getUserForAccessToken(accessToken) {
    if (!accessToken) return null;
    const response = await fetchWithTimeout(`${config.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    const result = await readResponse(response, true);
    if (result.error) throw result.error;
    return result.data;
  }

  async function hydrateSessionUser(session) {
    if (!session?.access_token || session.user) return session;
    return {
      ...session,
      user: await getUserForAccessToken(session.access_token)
    };
  }

  async function refreshStoredSession(session) {
    if (!session?.refresh_token) return null;
    const response = await fetchWithTimeout(`${config.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const result = await readResponse(response);
    if (result.error) {
      if ([400, 401, 403].includes(Number(result.error.status))) setStoredSession(null);
      throw result.error;
    }
    const refreshed = {
      ...session,
      ...result.data
    };
    if (!refreshed.expires_at && refreshed.expires_in) {
      refreshed.expires_at = Math.floor(Date.now() / 1000) + Number(refreshed.expires_in);
    }
    const hydrated = await hydrateSessionUser(refreshed);
    setStoredSession(hydrated);
    return hydrated;
  }

  async function getUsableStoredSession() {
    const session = getStoredSession({ allowExpired: true });
    if (!session) return null;
    if (!isSessionExpired(session)) return hydrateSessionUser(session);
    if (!session.refresh_token) {
      setStoredSession(null);
      return null;
    }
    return refreshStoredSession(session);
  }

  async function detectRestOAuthSessionFromUrl() {
    const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hash) return getUsableStoredSession();
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    if (!accessToken) return getUsableStoredSession();

    const expiresIn = Number(params.get('expires_in') || 0);
    const expiresAt = Number(params.get('expires_at') || 0) ||
      (expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : 0);
    const session = {
      access_token: accessToken,
      refresh_token: params.get('refresh_token') || '',
      provider_token: params.get('provider_token') || '',
      token_type: params.get('token_type') || 'bearer',
      expires_in: expiresIn || undefined,
      expires_at: expiresAt || undefined,
      user: await getUserForAccessToken(accessToken)
    };
    setStoredSession(session);
    cleanAuthUrl();
    return session;
  }

  async function authHeaders(extra = {}) {
    let session = null;
    try {
      session = await getUsableStoredSession();
    } catch {
      session = getStoredSession({ allowExpired: true });
    }
    return {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token || config.SUPABASE_ANON_KEY}`,
      ...extra
    };
  }

  function postgrestError(status, payload) {
    const message = payload?.message || payload?.msg || `Supabase request failed with HTTP ${status}.`;
    const error = new Error(message);
    error.code = payload?.code || String(status);
    error.details = payload?.details || '';
    error.hint = payload?.hint || '';
    error.status = status;
    return error;
  }

  function encodeFilterValue(value) {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  }

  async function readResponse(response, single = false) {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) return { data: null, error: postgrestError(response.status, payload) };
    if (response.status === 204) return { data: single ? null : [], error: null };
    return { data: payload, error: null };
  }

  class RestQuery {
    constructor(table) {
      this.table = table;
      this.method = 'GET';
      this.params = new URLSearchParams();
      this.headers = {};
      this.body = undefined;
      this.singleRow = false;
      this.rangeValue = null;
      this.orderValues = [];
    }

    select(columns = '*') {
      this.params.set('select', columns);
      if (this.method !== 'GET') this.headers.Prefer = this.headers.Prefer || 'return=representation';
      return this;
    }

    order(column, options = {}) {
      this.orderValues.push(`${column}.${options.ascending ? 'asc' : 'desc'}`);
      this.params.set('order', this.orderValues.join(','));
      return this;
    }

    range(from, to) {
      this.rangeValue = `${from}-${to}`;
      return this;
    }

    limit(count) {
      this.params.set('limit', String(count));
      return this;
    }

    eq(column, value) {
      this.params.set(column, `eq.${encodeFilterValue(value)}`);
      return this;
    }

    in(column, values = []) {
      const encoded = values
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => `"${String(value).replaceAll('"', '\\"')}"`)
        .join(',');
      this.params.set(column, `in.(${encoded})`);
      return this;
    }

    not(column, operator, value) {
      this.params.set(column, `not.${operator}.${encodeFilterValue(value)}`);
      return this;
    }

    or(filter) {
      this.params.set('or', `(${filter})`);
      return this;
    }

    insert(payload) {
      this.method = 'POST';
      this.body = payload;
      this.headers.Prefer = 'return=representation';
      return this;
    }

    upsert(payload, options = {}) {
      this.method = 'POST';
      this.body = payload;
      this.headers.Prefer = 'resolution=merge-duplicates,return=representation';
      if (options.onConflict) this.params.set('on_conflict', options.onConflict);
      return this;
    }

    update(payload) {
      this.method = 'PATCH';
      this.body = payload;
      this.headers.Prefer = 'return=representation';
      return this;
    }

    delete() {
      this.method = 'DELETE';
      return this;
    }

    single() {
      this.singleRow = true;
      return this;
    }

    async execute() {
      const url = new URL(`${config.SUPABASE_URL}/rest/v1/${this.table}`);
      this.params.forEach((value, key) => url.searchParams.set(key, value));
      const headers = await authHeaders({
        Accept: this.singleRow ? 'application/vnd.pgrst.object+json' : 'application/json',
        ...this.headers
      });
      if (this.body !== undefined) headers['Content-Type'] = 'application/json';
      if (this.rangeValue) headers.Range = this.rangeValue;

      const response = await fetchWithTimeout(url.toString(), {
        method: this.method,
        headers,
        body: this.body === undefined ? undefined : JSON.stringify(this.body)
      });
      return readResponse(response, this.singleRow);
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }

    catch(reject) {
      return this.execute().catch(reject);
    }
  }

  function createRestClient() {
    return {
      auth: {
        async getSession() {
          const session = await detectRestOAuthSessionFromUrl();
          return { data: { session }, error: null };
        },
        async signInWithOAuth({ provider, options = {} }) {
          const redirectTo = options.redirectTo || redirectToUrl();
          const url = new URL(`${config.SUPABASE_URL}/auth/v1/authorize`);
          url.searchParams.set('provider', provider);
          url.searchParams.set('redirect_to', redirectTo);
          if (options.scopes) url.searchParams.set('scopes', options.scopes);
          Object.entries(options.queryParams || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
          });
          window.location.assign(url.toString());
          return { data: { url: url.toString(), provider }, error: null };
        },
        async signInWithPassword({ email, password }) {
          const response = await fetchWithTimeout(`${config.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
              apikey: config.SUPABASE_ANON_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
          });
          const result = await readResponse(response);
          if (result.error) return result;
          setStoredSession(result.data);
          return { data: { ...result.data, user: result.data?.user || null, session: result.data }, error: null };
        },
        async signUp({ email, password, options = {} }) {
          const response = await fetchWithTimeout(`${config.SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: {
              apikey: config.SUPABASE_ANON_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password, data: options.data || {} })
          });
          const result = await readResponse(response);
          if (result.error) return result;
          if (result.data?.access_token) setStoredSession(result.data);
          return {
            data: {
              ...result.data,
              user: result.data?.user || result.data,
              session: result.data?.access_token ? result.data : null
            },
            error: null
          };
        },
        async signOut() {
          setStoredSession(null);
          return { error: null };
        }
      },
      from(table) {
        return new RestQuery(table);
      },
      async rpc(name, payload = {}) {
        const response = await fetchWithTimeout(`${config.SUPABASE_URL}/rest/v1/rpc/${name}`, {
          method: 'POST',
          headers: await authHeaders({
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(payload)
        });
        return readResponse(response);
      },
      storage: {
        from(bucket) {
          return {
            async upload(path, file, options = {}) {
              const headers = await authHeaders({
                'Cache-Control': options.cacheControl || '3600',
                'x-upsert': options.upsert ? 'true' : 'false',
                'Content-Type': file?.type || 'application/octet-stream'
              });
              const response = await fetchWithTimeout(`${config.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
                method: 'POST',
                headers,
                body: file
              });
              const result = await readResponse(response);
              if (result.error) return result;
              return { data: { ...(result.data || {}), path }, error: null };
            },
            getPublicUrl(path) {
              return {
                data: {
                  publicUrl: `${config.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
                }
              };
            }
          };
        }
      }
    };
  }

  function isConfigured() {
    return configurationStatus().ok;
  }

  async function fetchWithTimeout(input, init = {}) {
    if (!Number.isFinite(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS <= 0) {
      return fetch(input, init);
    }

    const controller = new AbortController();
    const upstreamSignal = init.signal;
    let timedOut = false;

    const abortFromUpstream = () => controller.abort();
    if (upstreamSignal?.aborted) controller.abort();
    upstreamSignal?.addEventListener?.('abort', abortFromUpstream, { once: true });

    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new Error(`Supabase request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
      upstreamSignal?.removeEventListener?.('abort', abortFromUpstream);
    }
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client) {
      client = window.supabase?.createClient
        ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          },
          global: {
            fetch: fetchWithTimeout
          }
        })
        : createRestClient();
    }
    return client;
  }

  function criteriaFromRow(row = {}) {
    return {
      cleanliness: Number(row.cleanliness ?? row.avg_cleanliness ?? 0),
      queueFactor: Number(row.queue_factor ?? row.avg_queue_factor ?? 0),
      paperQuality: Number(row.paper_quality ?? row.avg_paper_quality ?? 0),
      lockConfidence: Number(row.lock_confidence ?? row.avg_lock_confidence ?? 0),
      vibe: Number(row.vibe ?? row.avg_vibe ?? 0),
      essentials: Number(row.essentials ?? row.avg_essentials ?? 0),
      soundSafety: Number(row.sound_safety ?? row.avg_sound_safety ?? 0)
    };
  }

  function ratingFromCriteria(criteria) {
    const values = Object.values(criteria).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function normalizeAccessMode(mode = 'unknown') {
    return String(mode || 'unknown').toLowerCase().replaceAll('_', '-');
  }

  function tagList(row = {}) {
    const tags = [];
    if (row.access_note) tags.push(...String(row.access_note).split('·').map((v) => v.trim()).filter(Boolean));
    if (row.access_mode && !tags.length) {
      const mode = normalizeAccessMode(row.access_mode);
      if (mode === 'no-code') tags.push('No code');
      if (mode === 'code-needed') tags.push('Code needed');
      if (mode === 'customer-only') tags.push('Customer-only');
      if (mode === 'paid') tags.push('Paid');
      if (mode === 'public') tags.push('Public');
    }
    return tags.slice(0, 3).length ? tags.slice(0, 3) : ['Needs ratings'];
  }

  function hashPercent(input, min, max) {
    const value = String(input || 'unpissed').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return min + (value % (max - min));
  }

  function mapBathroom(row = {}) {
    const criteria = criteriaFromRow(row);
    const rating = Number(row.overall_rating ?? row.average_rating ?? ratingFromCriteria(criteria));
    const facilities = Array.isArray(row.facilities) ? row.facilities : [];
    const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
    const tags = tagList(row);
    const access = row.access_note || tags.join(' · ') || 'Access unknown';
    return {
      id: row.id,
      name: row.name || 'Unnamed throne',
      rating,
      lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
      lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
      distanceMinutes: Number(row.distance_minutes ?? 0),
      distanceMiles: Number(row.distance_miles ?? 0),
      x: Number(row.map_x ?? hashPercent(row.id || row.name, 18, 78)),
      y: Number(row.map_y ?? hashPercent(`${row.name || row.id}-y`, 26, 76)),
      tags,
      status: String(row.status || (row.moderation_status === 'unused' ? 'UNUSED' : row.moderation_status === 'pending' ? 'NEW' : 'OPEN')).toUpperCase(),
      access,
      accessMode: normalizeAccessMode(row.access_mode),
      openNow: row.is_open_now !== false,
      type: row.type || 'Other',
      city: row.city || '',
      country: row.country || '',
      facilities,
      photoCount: Number(row.photo_count ?? photos.length ?? 0),
      photos,
      vibeTags: Array.isArray(row.vibe_tags) ? row.vibe_tags : facilities.slice(0, 3),
      crowdLevel: row.crowd_level || (Number(row.rating_count || 0) ? `${row.rating_count} ratings` : 'Needs more check-ins'),
      criteria,
      remote: true
    };
  }

  function normalizeCheckin(row = {}) {
    const ratingRow = Array.isArray(row.ratings) ? row.ratings[0] : row.ratings;
    const bathroom = Array.isArray(row.bathrooms) ? row.bathrooms[0] : row.bathrooms;
    const criteria = criteriaFromRow(ratingRow || {});
    return {
      id: row.id,
      bathroomId: row.bathroom_id,
      bathroomName: bathroom?.name || row.bathroom_name || 'Unknown bathroom',
      bathroomType: bathroom?.type || row.bathroom_type || 'Other',
      country: bathroom?.country || row.country || '',
      facilities: Array.isArray(bathroom?.facilities) ? bathroom.facilities : [],
      vibeTags: Array.isArray(bathroom?.vibe_tags) ? bathroom.vibe_tags : [],
      rating: Number(ratingRow?.overall ?? ratingFromCriteria(criteria)),
      criteria,
      comment: row.comment || '',
      anonymous: Boolean(row.anonymous),
      createdAt: row.created_at
    };
  }

  function initials(name = '') {
    return String(name || 'UP').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'UP';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeProfile(row = {}) {
    const displayName = row.display_name || row.handle || 'Unpissed User';
    return {
      id: row.id,
      displayName,
      handle: row.handle || '',
      city: row.city || '',
      avatarUrl: row.avatar_url || '',
      initials: initials(displayName),
      createdAt: row.created_at
    };
  }

  function relatedRow(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function isMissingRelationError(error) {
    const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return text.includes('pgrst205') ||
      text.includes('pgrst200') ||
      text.includes('42p01') ||
      text.includes('challenge_sessions') ||
      text.includes('challenge_participants') ||
      text.includes('challenge_events');
  }

  function challengeModeLabel(mode) {
    return mode === 'first_to_go' ? 'First to Go' : 'Last Throne Standing';
  }

  function normalizeChallengeParticipant(row = {}) {
    const profile = relatedRow(row.profiles);
    const bathroom = relatedRow(row.bathrooms);
    const displayName = profile?.display_name || profile?.handle || 'Unpissed User';
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      status: row.status || 'standing',
      joinedAt: row.joined_at,
      goneAt: row.first_gone_at,
      checkinId: row.first_checkin_id,
      bathroomId: row.first_bathroom_id,
      bathroomName: bathroom?.name || '',
      displayName,
      handle: profile?.handle || '',
      city: profile?.city || '',
      initials: initials(displayName)
    };
  }

  function normalizeChallenge(row = {}, participants = [], currentUserId = '') {
    const creator = relatedRow(row.profiles);
    const sessionParticipants = participants
      .filter((participant) => participant.sessionId === row.id)
      .sort((a, b) => {
        if (a.status === 'left' && b.status !== 'left') return 1;
        if (b.status === 'left' && a.status !== 'left') return -1;
        if (a.goneAt && b.goneAt) return new Date(a.goneAt) - new Date(b.goneAt);
        if (a.goneAt) return -1;
        if (b.goneAt) return 1;
        return new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0);
      });
    const activeParticipants = sessionParticipants.filter((participant) => participant.status !== 'left');
    const goneParticipants = activeParticipants.filter((participant) => participant.status === 'gone' && participant.goneAt);
    const standingParticipants = activeParticipants.filter((participant) => participant.status === 'standing');
    return {
      id: row.id,
      title: row.title || challengeModeLabel(row.mode),
      mode: row.mode || 'last_throne_standing',
      modeLabel: challengeModeLabel(row.mode),
      status: row.status || 'active',
      visibility: row.visibility || 'friends',
      createdBy: row.created_by,
      creatorName: creator?.display_name || 'Unpissed User',
      startedAt: row.started_at || row.created_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
      participants: sessionParticipants,
      activeParticipants,
      goneParticipants,
      standingParticipants,
      currentParticipant: sessionParticipants.find((participant) => participant.userId === currentUserId) || null
    };
  }

  function feedText(row = {}) {
    const payload = row.payload || {};
    const isAnonymous = row.visibility === 'friends_delayed';
    const actor = escapeHtml(isAnonymous ? 'Someone discreet' : (row.profiles?.display_name || 'Someone discreet'));
    const bathroom = escapeHtml(row.bathrooms?.name || payload.bathroomName || 'a bathroom');
    const badge = escapeHtml(row.badges?.title || payload.badgeTitle || 'a badge');
    if (row.event_type === 'badge') return `<b>${actor}</b> unlocked <b class="gold-text">${badge}</b>`;
    if (row.event_type === 'bathroom_added') return `<b>${actor}</b> added <b>${bathroom}</b> to the map`;
    if (row.event_type === 'trending') return `<b>${bathroom}</b> is trending tonight`;
    if (row.event_type === 'review') return `<b>${actor}</b> reviewed <b>${bathroom}</b>`;
    return `<b>${actor}</b> checked in at <b>${bathroom}</b>`;
  }

  async function getSession() {
    const supabase = getClient();
    if (!supabase) return { session: null, user: null };
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { session: data.session, user: data.session?.user || null };
  }

  async function signIn(email, password) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await ensureProfile(data.user);
    return data;
  }

  async function signInWithGoogle() {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectToUrl(),
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password, displayName) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split('@')[0]
        }
      }
    });
    if (error) throw error;
    if (data.session && data.user) await ensureProfile(data.user, displayName);
    return data;
  }

  async function signOut() {
    const supabase = getClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function ensureProfile(user, displayName = '') {
    const supabase = getClient();
    if (!supabase || !user?.id) return null;
    const metadata = user.user_metadata || {};
    const name = displayName || metadata.display_name || metadata.full_name || metadata.name || user.email?.split('@')[0] || 'Unpissed User';
    const payload = { id: user.id, display_name: name };
    if (metadata.avatar_url || metadata.picture) payload.avatar_url = metadata.avatar_url || metadata.picture;
    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async function fetchAllRows(table, options = {}) {
    const supabase = getClient();
    if (!supabase) return [];
    const rows = [];
    const pageSize = Number(options.pageSize || PAGE_SIZE);
    const orders = options.orders || [{ column: 'created_at', ascending: false }];

    for (let from = 0; ; from += pageSize) {
      let query = supabase.from(table).select(options.select || '*');
      orders.forEach((order) => {
        query = query.order(order.column, { ascending: Boolean(order.ascending) });
      });

      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw error;

      const page = Array.isArray(data) ? data : [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    return rows;
  }

  async function listBathrooms() {
    const supabase = getClient();
    if (!supabase) return [];

    try {
      const viewRows = await fetchAllRows('bathroom_cards');
      return viewRows.map(mapBathroom);
    } catch {
      const rows = await fetchAllRows('bathrooms');
      return rows.map(mapBathroom);
    }
  }

  async function listBadges() {
    const supabase = getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('badges')
      .select('*')
      .order('title', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function listUserBadges(userId) {
    const supabase = getClient();
    if (!supabase || !userId) return [];
    const { data, error } = await supabase
      .from('user_badges')
      .select('badge_id, unlocked_at, badges(*)')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function unlockBadge(userId, badgeId) {
    const supabase = getClient();
    if (!supabase || !userId || !badgeId) return null;
    const { data, error } = await supabase
      .from('user_badges')
      .upsert({ user_id: userId, badge_id: badgeId }, { onConflict: 'user_id,badge_id' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async function listMyCheckins(userId) {
    const supabase = getClient();
    if (!supabase || !userId) return [];
    const { data, error } = await supabase
      .from('checkins')
      .select('id,bathroom_id,anonymous,comment,created_at,bathrooms(name,type,country,facilities,vibe_tags),ratings(overall,cleanliness,queue_factor,paper_quality,lock_confidence,vibe,essentials,sound_safety)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []).map(normalizeCheckin);
  }

  async function listProfileCheckins(userId) {
    return listMyCheckins(userId);
  }

  async function listReviews(bathroomId) {
    const supabase = getClient();
    if (!supabase || !bathroomId) return [];
    const { data, error } = await supabase
      .from('checkins')
      .select('id,anonymous,comment,created_at,profiles(display_name),ratings(overall)')
      .eq('bathroom_id', bathroomId)
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return (data || [])
      .filter((row) => String(row.comment || '').trim())
      .map((row) => {
        const ratingRow = Array.isArray(row.ratings) ? row.ratings[0] : row.ratings;
        return {
          id: row.id,
          author: row.anonymous ? 'Anonymous relief agent' : (row.profiles?.display_name || 'Unpissed user'),
          rating: Number(ratingRow?.overall || 0),
          text: row.comment || '',
          createdAt: row.created_at
        };
      });
  }

  async function listFeedEvents() {
    const supabase = getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('feed_events')
      .select('id,event_type,visibility,created_at,payload,profiles!feed_events_actor_id_fkey(display_name),bathrooms(name),badges(title)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      const fallback = await supabase
        .from('feed_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (fallback.error) throw fallback.error;
      return (fallback.data || []).map((row) => ({
        id: row.id,
        initials: 'UP',
        icon: row.event_type === 'trending' ? 'trend' : '',
        html: feedText(row),
        createdAt: row.created_at
      }));
    }
    return (data || []).map((row) => ({
      id: row.id,
      initials: row.visibility === 'friends_delayed' ? 'UP' : initials(row.profiles?.display_name),
      icon: row.event_type === 'trending' ? 'trend' : '',
      html: feedText(row),
      createdAt: row.created_at
    }));
  }

  async function listProfiles(currentUserId, query = '') {
    const supabase = getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('id,display_name,handle,avatar_url,city,created_at')
      .order('display_name', { ascending: true })
      .limit(100);
    if (error) throw error;
    const term = String(query || '').trim().toLowerCase();
    return (data || [])
      .map(normalizeProfile)
      .filter((profile) => profile.id && profile.id !== currentUserId)
      .filter((profile) => {
        if (!term) return true;
        return [profile.displayName, profile.handle, profile.city].join(' ').toLowerCase().includes(term);
      })
      .slice(0, 50);
  }

  async function listFollows(userId) {
    const supabase = getClient();
    if (!supabase || !userId) return [];
    const { data, error } = await supabase
      .from('follows')
      .select('follower_id,following_id,created_at')
      .or(`follower_id.eq.${userId},following_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function listChallenges(currentUserId) {
    const supabase = getClient();
    if (!supabase || !currentUserId) return [];
    try {
      const { data: sessions, error: sessionsError } = await supabase
        .from('challenge_sessions')
        .select('*,profiles!challenge_sessions_created_by_fkey(display_name,handle,city)')
        .order('created_at', { ascending: false })
        .limit(30);
      if (sessionsError) throw sessionsError;

      const sessionIds = (sessions || []).map((row) => row.id).filter(Boolean);
      if (!sessionIds.length) return [];

      let participantRows = [];
      const { data: participants, error: participantsError } = await supabase
        .from('challenge_participants')
        .select('*,profiles!challenge_participants_user_id_fkey(display_name,handle,city),bathrooms!challenge_participants_first_bathroom_id_fkey(name)')
        .in('session_id', sessionIds)
        .order('joined_at', { ascending: true });
      if (participantsError) {
        const fallback = await supabase
          .from('challenge_participants')
          .select('*')
          .in('session_id', sessionIds)
          .order('joined_at', { ascending: true });
        if (fallback.error) throw fallback.error;
        participantRows = fallback.data || [];
      } else {
        participantRows = participants || [];
      }

      const normalizedParticipants = participantRows.map(normalizeChallengeParticipant);
      return (sessions || []).map((session) => normalizeChallenge(session, normalizedParticipants, currentUserId));
    } catch (error) {
      if (isMissingRelationError(error)) return [];
      throw error;
    }
  }

  async function createChallenge(input = {}, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!userId) throw new Error('You must be signed in to start a challenge.');
    const mode = input.mode === 'first_to_go' ? 'first_to_go' : 'last_throne_standing';
    const title = input.title || challengeModeLabel(mode);
    const { data, error } = await supabase
      .from('challenge_sessions')
      .insert({
        title,
        mode,
        status: 'active',
        visibility: 'friends',
        created_by: userId
      })
      .select('*')
      .single();
    if (error) throw error;
    await joinChallenge(data.id, userId);
    return data;
  }

  async function joinChallenge(sessionId, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!userId) throw new Error('You must be signed in to join a challenge.');
    if (!sessionId) throw new Error('Choose a challenge.');
    const { data, error } = await supabase
      .from('challenge_participants')
      .upsert({
        session_id: sessionId,
        user_id: userId,
        status: 'standing',
        first_gone_at: null,
        first_checkin_id: null,
        first_bathroom_id: null
      }, { onConflict: 'session_id,user_id' })
      .select('*')
      .single();
    if (error) throw error;
    await supabase.from('challenge_events').insert({
      session_id: sessionId,
      user_id: userId,
      event_type: 'joined'
    });
    return data;
  }

  async function leaveChallenge(sessionId, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!sessionId || !userId) return null;
    const { data, error } = await supabase
      .from('challenge_participants')
      .update({ status: 'left' })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select('*');
    if (error) throw error;
    await supabase.from('challenge_events').insert({
      session_id: sessionId,
      user_id: userId,
      event_type: 'left'
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function finishChallenge(sessionId, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!sessionId || !userId) return null;
    const { data, error } = await supabase
      .from('challenge_sessions')
      .update({ status: 'finished', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('created_by', userId)
      .select('*');
    if (error) throw error;
    await supabase.from('challenge_events').insert({
      session_id: sessionId,
      user_id: userId,
      event_type: 'finished'
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function recordChallengeCheckin(input = {}, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!userId) throw new Error('You must be signed in to update a challenge.');
    const sessionId = input.sessionId;
    if (!sessionId || !input.checkinId) return null;
    const goneAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('challenge_participants')
      .update({
        status: 'gone',
        first_gone_at: goneAt,
        first_checkin_id: input.checkinId,
        first_bathroom_id: input.bathroomId || null
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .eq('status', 'standing')
      .select('*');
    if (error) throw error;
    const participant = Array.isArray(data) ? data[0] : data;
    if (!participant) return null;
    await supabase.from('challenge_events').insert({
      session_id: sessionId,
      user_id: userId,
      event_type: 'checkin',
      checkin_id: input.checkinId,
      bathroom_id: input.bathroomId || null,
      payload: {
        bathroomName: input.bathroomName || '',
        goneAt
      }
    });
    return participant;
  }

  async function followUser(userId, targetUserId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!userId) throw new Error('You must be signed in to add friends.');
    if (!targetUserId || targetUserId === userId) throw new Error('Choose another user to add.');
    const { data, error } = await supabase
      .from('follows')
      .upsert({ follower_id: userId, following_id: targetUserId }, { onConflict: 'follower_id,following_id' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async function unfollowUser(userId, targetUserId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!userId || !targetUserId) return;
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', userId)
      .eq('following_id', targetUserId);
    if (error) throw error;
  }

  async function addBathroom(input = {}, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!userId) throw new Error('You must be signed in to add a bathroom.');
    const payload = {
      name: input.name,
      type: input.type || 'Other',
      access_note: input.access || 'Access unknown',
      access_mode: input.accessMode || 'unknown',
      facilities: input.facilities || [],
      city: input.city || null,
      country: input.country || null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      added_by: userId,
      moderation_status: 'unused',
      is_open_now: true,
      status: 'UNUSED',
      vibe_tags: input.vibeTags || []
    };
    const { data, error } = await supabase
      .from('bathrooms')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;

    const { error: feedError } = await supabase.from('feed_events').insert({
      actor_id: userId,
      event_type: 'bathroom_added',
      bathroom_id: data.id,
      visibility: 'public',
      payload: { bathroomName: data.name }
    });
    if (feedError) throw feedError;

    return mapBathroom(data);
  }

  async function uploadPhoto(file, userId, checkinId) {
    const supabase = getClient();
    if (!supabase || !file || !userId) return null;
    const bucket = config.SUPABASE_STORAGE_BUCKET || 'bathroom-photos';
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    const path = `${userId}/${checkinId || Date.now()}/${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;
    const publicResult = supabase.storage.from(bucket).getPublicUrl(data.path);
    return {
      storage_path: data.path,
      public_url: publicResult.data.publicUrl
    };
  }

  function shouldUseDirectCheckinFallback(error) {
    const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return error?.code === 'PGRST202' ||
      (message.includes('create_checkin_with_rating') && (
        message.includes('could not find') ||
        message.includes('schema cache') ||
        message.includes('function')
      ));
  }

  function ratingFromInputCriteria(criteria = {}) {
    const values = [
      criteria.cleanliness,
      criteria.queueFactor,
      criteria.paperQuality,
      criteria.lockConfidence,
      criteria.vibe,
      criteria.essentials,
      criteria.soundSafety
    ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  async function createCheckinWithDirectInserts(supabase, input, userId) {
    const { data: checkin, error: checkinError } = await supabase
      .from('checkins')
      .insert({
        user_id: userId,
        bathroom_id: input.bathroomId,
        anonymous: Boolean(input.anonymous),
        comment: input.comment || ''
      })
      .select('*')
      .single();
    if (checkinError) throw checkinError;

    const criteria = input.criteria || {};
    const { error: ratingError } = await supabase
      .from('ratings')
      .insert({
        checkin_id: checkin.id,
        bathroom_id: input.bathroomId,
        user_id: userId,
        cleanliness: criteria.cleanliness,
        queue_factor: criteria.queueFactor,
        paper_quality: criteria.paperQuality,
        lock_confidence: criteria.lockConfidence,
        vibe: criteria.vibe,
        essentials: criteria.essentials,
        sound_safety: criteria.soundSafety
      });
    if (ratingError) throw ratingError;

    await supabase.from('feed_events').insert({
      actor_id: userId,
      event_type: 'checkin',
      bathroom_id: input.bathroomId,
      checkin_id: checkin.id,
      visibility: input.anonymous ? 'friends_delayed' : 'friends',
      payload: {
        bathroomName: input.bathroomName,
        rating: input.rating ?? ratingFromInputCriteria(criteria)
      }
    });

    return checkin;
  }

  async function createCheckin(input = {}, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!userId) throw new Error('You must be signed in to check in.');

    const criteria = input.criteria || {};
    const { data: rpcCheckin, error: checkinError } = await supabase.rpc('create_checkin_with_rating', {
      p_bathroom_id: input.bathroomId,
      p_anonymous: Boolean(input.anonymous),
      p_comment: input.comment || '',
      p_cleanliness: criteria.cleanliness,
      p_queue_factor: criteria.queueFactor,
      p_paper_quality: criteria.paperQuality,
      p_lock_confidence: criteria.lockConfidence,
      p_vibe: criteria.vibe,
      p_essentials: criteria.essentials,
      p_sound_safety: criteria.soundSafety
    });
    if (checkinError && !shouldUseDirectCheckinFallback(checkinError)) throw checkinError;

    const checkin = checkinError
      ? await createCheckinWithDirectInserts(supabase, input, userId)
      : rpcCheckin;

    if (input.photo) {
      const uploaded = await uploadPhoto(input.photo, userId, checkin.id);
      if (uploaded) {
        const { error: photoError } = await supabase.from('photos').insert({
          bathroom_id: input.bathroomId,
          checkin_id: checkin.id,
          user_id: userId,
          storage_provider: 'supabase-storage',
          storage_key: uploaded.storage_path,
          public_url: uploaded.public_url,
          moderation_status: 'pending'
        });
        if (photoError) throw photoError;
      }
    }

    return checkin;
  }

  async function reportPrivacyIssue(input = {}, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.from('reports').insert({
      reporter_id: userId || null,
      bathroom_id: input.bathroomId,
      reason: input.reason || 'privacy_issue'
    });
    if (error) throw error;
  }

  window.UnpissedSupabase = {
    isConfigured,
    configurationStatus,
    getClient,
    getSession,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    ensureProfile,
    listBathrooms,
    listBadges,
    listUserBadges,
    unlockBadge,
    listMyCheckins,
    listProfileCheckins,
    listReviews,
    listFeedEvents,
    listProfiles,
    listFollows,
    listChallenges,
    createChallenge,
    joinChallenge,
    leaveChallenge,
    finishChallenge,
    recordChallengeCheckin,
    followUser,
    unfollowUser,
    addBathroom,
    createCheckin,
    reportPrivacyIssue
  };
})();
