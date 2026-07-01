(() => {
  const config = window.UNPISSED_CONFIG || {};
  let client = null;

  function isConfigured() {
    return Boolean(
      config.ENABLE_SUPABASE &&
      config.SUPABASE_URL &&
      config.SUPABASE_ANON_KEY &&
      window.supabase?.createClient
    );
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client) {
      client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
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
      status: String(row.status || (row.moderation_status === 'pending' ? 'NEW' : 'OPEN')).toUpperCase(),
      access,
      accessMode: normalizeAccessMode(row.access_mode),
      openNow: row.is_open_now !== false,
      type: row.type || 'Other',
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

  function feedText(row = {}) {
    const payload = row.payload || {};
    const actor = row.profiles?.display_name || 'Someone discreet';
    const bathroom = row.bathrooms?.name || payload.bathroomName || 'a bathroom';
    const badge = row.badges?.title || payload.badgeTitle || 'a badge';
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
    const name = displayName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Unpissed User';
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, display_name: name }, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async function listBathrooms() {
    const supabase = getClient();
    if (!supabase) return [];
    const viewResult = await supabase
      .from('bathroom_cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (!viewResult.error && Array.isArray(viewResult.data)) {
      return viewResult.data.map(mapBathroom);
    }

    const { data, error } = await supabase
      .from('bathrooms')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapBathroom);
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
      .select('id,bathroom_id,anonymous,comment,created_at,bathrooms(name),ratings(overall,cleanliness,queue_factor,paper_quality,lock_confidence,vibe,essentials,sound_safety)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []).map(normalizeCheckin);
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
      .select('id,event_type,created_at,payload,profiles!feed_events_actor_id_fkey(display_name),bathrooms(name),badges(title)')
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
      initials: initials(row.profiles?.display_name),
      icon: row.event_type === 'trending' ? 'trend' : '',
      html: feedText(row),
      createdAt: row.created_at
    }));
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
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      added_by: userId,
      moderation_status: 'pending',
      is_open_now: true,
      status: 'NEW',
      vibe_tags: input.vibeTags || []
    };
    const { data, error } = await supabase
      .from('bathrooms')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;

    await supabase.from('feed_events').insert({
      actor_id: userId,
      event_type: 'bathroom_added',
      bathroom_id: data.id,
      visibility: 'public',
      payload: { bathroomName: data.name }
    });

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

  async function createCheckin(input = {}, userId) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!userId) throw new Error('You must be signed in to check in.');

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

    await supabase.from('feed_events').insert({
      actor_id: userId,
      event_type: 'checkin',
      bathroom_id: input.bathroomId,
      checkin_id: checkin.id,
      visibility: input.anonymous ? 'friends_delayed' : 'friends',
      payload: {
        bathroomName: input.bathroomName,
        rating: input.rating
      }
    });

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
    getClient,
    getSession,
    signIn,
    signUp,
    signOut,
    ensureProfile,
    listBathrooms,
    listBadges,
    listUserBadges,
    unlockBadge,
    listMyCheckins,
    listReviews,
    listFeedEvents,
    addBathroom,
    createCheckin,
    reportPrivacyIssue
  };
})();
