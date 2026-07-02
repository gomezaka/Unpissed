#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import {
  ROOT,
  assertProjectRoot,
  fetchAllBathrooms,
  fetchBathroom,
  filterBathrooms,
  getAdminConfig,
  updateBathroom,
  writeBackup
} from './admin-lib.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8789;

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    open: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--open') {
      args.open = true;
    } else if (arg === '--port') {
      args.port = Number(next || DEFAULT_PORT);
      index += 1;
    } else if (arg === '--host') {
      args.host = next || DEFAULT_HOST;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (args.host !== DEFAULT_HOST) {
    throw new Error('Moderator server must bind to 127.0.0.1 only.');
  }
  return args;
}

function printHelp() {
  console.log(`Unpissed local moderator server

Usage:
  node scripts/moderator-server.mjs
  node scripts/moderator-server.mjs --open
  node scripts/moderator-server.mjs --port 8789

Required in .env.local:
  SUPABASE_SERVICE_ROLE_KEY=...

Optional:
  SUPABASE_URL=...
`);
}

function jsonResponse(res, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function htmlResponse(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function cleanText(value, max = 240) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function assertCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Latitude must be between -90 and 90.');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Longitude must be between -180 and 180.');
}

async function handleHealth(res, config) {
  jsonResponse(res, 200, {
    ok: true,
    projectRoot: ROOT,
    bindHost: DEFAULT_HOST,
    supabaseUrlConfigured: Boolean(config.supabaseUrl),
    serviceRoleKeyConfigured: Boolean(config.serviceRoleKey),
    configured: Boolean(config.configured),
    warning: config.unsafeFrontendKey ? 'A VITE_ service-role-like key was detected. Do not use frontend-prefixed admin keys.' : ''
  });
}

async function handleList(req, res, config) {
  const requestUrl = new URL(req.url, `http://${DEFAULT_HOST}`);
  const query = requestUrl.searchParams.get('query') || '';
  const status = requestUrl.searchParams.get('status') || 'visible';
  const limit = Math.min(200, Math.max(1, Number(requestUrl.searchParams.get('limit') || 60)));
  const rows = filterBathrooms(await fetchAllBathrooms(config), { query, status }).slice(0, limit);
  jsonResponse(res, 200, {
    rows,
    count: rows.length
  });
}

async function backupAndPatch(config, id, action, payload) {
  const before = await fetchBathroom(config, id);
  if (!before) throw new Error(`Bathroom not found: ${id}`);
  const backupPath = await writeBackup(`moderator-${action}-${id}`, {
    before,
    patch: payload
  });
  const after = await updateBathroom(config, id, payload);
  return { before, after, backupPath };
}

async function handleCoordinateUpdate(req, res, config, id) {
  const body = await readJson(req);
  const lat = numberOrNull(body.lat);
  const lng = numberOrNull(body.lng);
  assertCoordinate(lat, lng);
  const payload = {
    lat,
    lng
  };
  if ('address' in body) payload.address = cleanText(body.address);
  if ('city' in body) payload.city = cleanText(body.city, 80);
  if ('country' in body) payload.country = cleanText(body.country, 80);
  const result = await backupAndPatch(config, id, 'coordinates', payload);
  jsonResponse(res, 200, {
    ok: true,
    backupPath: result.backupPath,
    row: result.after
  });
}

async function handleSoftStatus(req, res, config, id, moderationStatus) {
  const body = await readJson(req);
  const payload = {
    moderation_status: moderationStatus,
    status: moderationStatus.toUpperCase()
  };
  const reason = cleanText(body.reason);
  if (reason) payload.access_note = `${cleanText(body.currentAccessNote) || ''} Moderator note: ${reason}`.trim().slice(0, 240);
  const result = await backupAndPatch(config, id, moderationStatus, payload);
  jsonResponse(res, 200, {
    ok: true,
    backupPath: result.backupPath,
    row: result.after
  });
}

function routeMatch(pathname) {
  const match = pathname.match(/^\/api\/bathrooms\/([^/]+)\/(coordinates|hide|reject)$/);
  if (!match) return null;
  return {
    id: decodeURIComponent(match[1]),
    action: match[2]
  };
}

async function handler(req, res, config) {
  const requestUrl = new URL(req.url, `http://${DEFAULT_HOST}`);
  try {
    if (req.method === 'GET' && requestUrl.pathname === '/') {
      htmlResponse(res, 200, renderPage());
      return;
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
      await handleHealth(res, config);
      return;
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/bathrooms') {
      await handleList(req, res, config);
      return;
    }
    const match = routeMatch(requestUrl.pathname);
    if (req.method === 'POST' && match?.action === 'coordinates') {
      await handleCoordinateUpdate(req, res, config, match.id);
      return;
    }
    if (req.method === 'POST' && match?.action === 'hide') {
      await handleSoftStatus(req, res, config, match.id, 'hidden');
      return;
    }
    if (req.method === 'POST' && match?.action === 'reject') {
      await handleSoftStatus(req, res, config, match.id, 'rejected');
      return;
    }
    jsonResponse(res, 404, { error: 'Not found' });
  } catch (error) {
    jsonResponse(res, error.status || 500, {
      error: error.message,
      details: error.payload || undefined
    });
  }
}

function renderPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Unpissed Local Moderator</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, Segoe UI, Arial, sans-serif; background:#0f121a; color:#f7f8ff; }
      body { margin:0; background:#0f121a; }
      main { width:min(1180px, calc(100vw - 32px)); margin:0 auto; padding:28px 0 48px; }
      header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:20px; }
      h1 { margin:0 0 6px; font-size:32px; letter-spacing:0; }
      p { color:#aab4cf; line-height:1.5; }
      .pill { display:inline-flex; align-items:center; min-height:32px; padding:0 12px; border:1px solid #2c3448; border-radius:999px; color:#b9c6e8; background:#171c29; font-size:13px; }
      .toolbar, .editor, .results { border:1px solid #2c3448; border-radius:16px; background:#171c29; padding:14px; }
      .toolbar { display:grid; grid-template-columns: minmax(220px, 1fr) 160px 100px auto; gap:10px; margin-bottom:14px; }
      input, select, textarea, button { font:inherit; }
      input, select, textarea { width:100%; box-sizing:border-box; border:1px solid #38425b; border-radius:12px; background:#101521; color:#f7f8ff; padding:11px 12px; }
      button { border:0; border-radius:12px; padding:11px 14px; background:#4e7dff; color:white; font-weight:800; cursor:pointer; }
      button.secondary { background:#232b3d; color:#dce5ff; border:1px solid #38425b; }
      button.danger { background:#b8324b; }
      button:disabled { opacity:.6; cursor:wait; }
      .grid { display:grid; grid-template-columns:minmax(0, 1fr) 380px; gap:14px; align-items:start; }
      table { width:100%; border-collapse:collapse; font-size:13px; }
      th, td { text-align:left; border-bottom:1px solid #2c3448; padding:10px 8px; vertical-align:top; }
      th { color:#93a4ca; font-size:12px; text-transform:uppercase; letter-spacing:.06em; }
      tr:hover { background:#1c2333; }
      .muted { color:#93a4ca; }
      .status { font-family:Consolas, monospace; font-size:12px; color:#aab4cf; }
      .editor { position:sticky; top:12px; display:grid; gap:10px; }
      .editor h2 { margin:0; font-size:20px; }
      .field-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .message { margin:10px 0; color:#b9c6e8; white-space:pre-wrap; }
      .message.error { color:#ff9bad; }
      .actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      @media (max-width: 900px) { .toolbar, .grid { grid-template-columns:1fr; } .editor { position:static; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Unpissed Local Moderator</h1>
          <p>Runs only on 127.0.0.1. Uses server-side service role from .env/.env.local. Every write creates a backup.</p>
        </div>
        <span id="health" class="pill">Checking config...</span>
      </header>

      <section class="toolbar">
        <input id="query" placeholder="Search name, city, address or id" />
        <select id="status">
          <option value="visible">Visible</option>
          <option value="hidden">Hidden/rejected</option>
          <option value="all">All</option>
        </select>
        <input id="limit" type="number" min="1" max="200" value="60" />
        <button id="search">Search</button>
      </section>

      <div id="message" class="message"></div>
      <section class="grid">
        <div class="results">
          <table>
            <thead><tr><th>Name</th><th>Place</th><th>Coords</th><th>Status</th><th></th></tr></thead>
            <tbody id="rows"><tr><td colspan="5" class="muted">Search to load records.</td></tr></tbody>
          </table>
        </div>
        <aside class="editor">
          <h2>Edit selected</h2>
          <input id="id" readonly placeholder="Select a row" />
          <input id="name" readonly placeholder="Name" />
          <div class="field-row">
            <input id="lat" placeholder="Latitude" />
            <input id="lng" placeholder="Longitude" />
          </div>
          <input id="address" placeholder="Address" />
          <div class="field-row">
            <input id="city" placeholder="City" />
            <input id="country" placeholder="Country" />
          </div>
          <textarea id="reason" rows="3" placeholder="Moderator note for hide/reject"></textarea>
          <button id="save">Save coordinate fix</button>
          <div class="actions">
            <button id="hide" class="secondary">Hide</button>
            <button id="reject" class="danger">Reject</button>
          </div>
          <p class="muted">Hide/reject is soft delete through moderation_status, not a hard delete.</p>
        </aside>
      </section>
    </main>
    <script>
      const state = { rows: [], selected: null };
      const el = (id) => document.getElementById(id);
      const msg = (text, error = false) => {
        el('message').textContent = text || '';
        el('message').className = error ? 'message error' : 'message';
      };
      const api = async (url, options = {}) => {
        const response = await fetch(url, {
          ...options,
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
      };
      const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
      const coord = (row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)) ? Number(row.lat).toFixed(6) + ', ' + Number(row.lng).toFixed(6) : 'missing';

      async function loadHealth() {
        const health = await api('/api/health');
        el('health').textContent = health.configured ? 'Admin key loaded' : 'Missing service-role key';
        if (!health.configured) msg('Add SUPABASE_SERVICE_ROLE_KEY to .env.local. Do not use VITE_ prefix.', true);
      }

      function renderRows() {
        el('rows').innerHTML = state.rows.length ? state.rows.map((row) => \`
          <tr>
            <td><b>\${esc(row.name)}</b><br><span class="muted">\${esc(row.venue_name || row.type || '')}</span></td>
            <td>\${esc([row.address, row.city, row.country].filter(Boolean).join(', '))}</td>
            <td class="status">\${esc(coord(row))}</td>
            <td class="status">\${esc(row.moderation_status)} / \${esc(row.status)}</td>
            <td><button class="secondary" data-id="\${esc(row.id)}">Edit</button></td>
          </tr>
        \`).join('') : '<tr><td colspan="5" class="muted">No records found.</td></tr>';
        document.querySelectorAll('[data-id]').forEach((button) => {
          button.addEventListener('click', () => selectRow(button.dataset.id));
        });
      }

      function selectRow(id) {
        const row = state.rows.find((item) => item.id === id);
        state.selected = row;
        el('id').value = row?.id || '';
        el('name').value = row?.name || '';
        el('lat').value = row?.lat ?? '';
        el('lng').value = row?.lng ?? '';
        el('address').value = row?.address || '';
        el('city').value = row?.city || '';
        el('country').value = row?.country || '';
        el('reason').value = '';
      }

      async function search() {
        msg('Loading...');
        const params = new URLSearchParams({
          query: el('query').value,
          status: el('status').value,
          limit: el('limit').value
        });
        const data = await api('/api/bathrooms?' + params.toString());
        state.rows = data.rows || [];
        renderRows();
        msg(\`\${data.count || 0} records loaded.\`);
      }

      async function saveCoordinates() {
        if (!state.selected) return msg('Select a record first.', true);
        const id = state.selected.id;
        const data = await api('/api/bathrooms/' + encodeURIComponent(id) + '/coordinates', {
          method: 'POST',
          body: JSON.stringify({
            lat: el('lat').value,
            lng: el('lng').value,
            address: el('address').value,
            city: el('city').value,
            country: el('country').value
          })
        });
        msg('Saved. Backup: ' + data.backupPath);
        await search();
      }

      async function softStatus(action) {
        if (!state.selected) return msg('Select a record first.', true);
        const label = action === 'hide' ? 'hide' : 'reject';
        if (!confirm('Soft ' + label + ' this record? A backup will be written first.')) return;
        const data = await api('/api/bathrooms/' + encodeURIComponent(state.selected.id) + '/' + action, {
          method: 'POST',
          body: JSON.stringify({
            reason: el('reason').value,
            currentAccessNote: state.selected.access_note || ''
          })
        });
        msg('Updated. Backup: ' + data.backupPath);
        await search();
      }

      el('search').addEventListener('click', () => search().catch((error) => msg(error.message, true)));
      el('save').addEventListener('click', () => saveCoordinates().catch((error) => msg(error.message, true)));
      el('hide').addEventListener('click', () => softStatus('hide').catch((error) => msg(error.message, true)));
      el('reject').addEventListener('click', () => softStatus('reject').catch((error) => msg(error.message, true)));
      el('query').addEventListener('keydown', (event) => { if (event.key === 'Enter') search().catch((error) => msg(error.message, true)); });
      loadHealth().catch((error) => msg(error.message, true));
    </script>
  </body>
</html>`;
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = await assertProjectRoot();
  const config = await getAdminConfig();
  const server = http.createServer((req, res) => {
    handler(req, res, config);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, args.host, resolve);
  });
  const url = `http://${args.host}:${args.port}/`;
  console.log(`Unpissed moderator server running at ${url}`);
  console.log(`Project root: ${project.root}`);
  console.log(config.configured ? 'Service-role key loaded from env.' : 'Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  if (args.open) openBrowser(url);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
