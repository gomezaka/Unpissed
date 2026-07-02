(() => {
  const LOAD_TIMEOUT_MS = 3500;
  const SUPABASE_SOURCES = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2'
  ];
  const LEAFLET_SOURCES = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        script.remove();
        reject(new Error(`Timed out loading ${src}`));
      }, LOAD_TIMEOUT_MS);

      script.src = src;
      script.async = true;
      script.onload = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        script.remove();
        reject(new Error(`Could not load ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  async function loadFirstAvailable(sources, isReady) {
    if (isReady()) return true;
    for (const src of sources) {
      try {
        await loadScript(src);
      } catch {
        // Try the next CDN source below.
      }
      if (isReady()) return true;
    }
    return isReady();
  }

  window.UnpissedSupabaseVendorReady = loadFirstAvailable(
    SUPABASE_SOURCES,
    () => Boolean(window.supabase?.createClient)
  );
  window.UnpissedLeafletVendorReady = loadFirstAvailable(
    LEAFLET_SOURCES,
    () => Boolean(window.L)
  );
  window.UnpissedVendorsReady = Promise.allSettled([
    window.UnpissedSupabaseVendorReady,
    window.UnpissedLeafletVendorReady
  ]);
})();
