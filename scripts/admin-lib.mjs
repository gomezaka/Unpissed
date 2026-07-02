import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, '..');
export const BACKUP_DIR = path.join(ROOT, 'coordinate-backups');

export async function assertProjectRoot() {
  const packagePath = path.join(ROOT, 'package.json');
  const indexPath = path.join(ROOT, 'index.html');
  const schemaPath = path.join(ROOT, 'supabase', 'schema.sql');
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  if (pkg.name !== 'unpissed-app') {
    throw new Error(`Refusing to run outside Unpissed. Expected package name "unpissed-app", got "${pkg.name}".`);
  }
  await fs.access(indexPath);
  await fs.access(schemaPath);
  return { packageName: pkg.name, root: ROOT };
}

export async function loadEnvFiles() {
  const files = ['.env', '.env.local'];
  for (const file of files) {
    const absolute = path.join(ROOT, file);
    const text = await fs.readFile(absolute, 'utf8').catch(() => '');
    if (!text) continue;
    parseEnv(text).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }
}

function parseEnv(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      if (index === -1) return ['', ''];
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return [key, value];
    })
    .filter(([key]) => Boolean(key));
}

export async function getAdminConfig() {
  await assertProjectRoot();
  await loadEnvFiles();
  const configText = await fs.readFile(path.join(ROOT, 'js', 'config.js'), 'utf8').catch(() => '');
  const supabaseUrl = firstRealValue(
    process.env.SUPABASE_URL,
    process.env.UNPISSED_SUPABASE_URL,
    matchConfigValue(configText, 'SUPABASE_URL')
  );
  const serviceRoleKey = firstRealValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.UNPISSED_SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY
  );
  const unsafeFrontendKey = firstRealValue(
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    process.env.VITE_SUPABASE_SERVICE_KEY
  );

  return {
    supabaseUrl,
    serviceRoleKey,
    unsafeFrontendKey,
    configured: Boolean(supabaseUrl && serviceRoleKey)
  };
}

export function assertAdminConfig(config) {
  if (config?.unsafeFrontendKey && !config?.serviceRoleKey) {
    throw new Error('Found a VITE_ service-role key. Do not expose admin keys to frontend builds. Rename it to SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  }
  if (!config?.supabaseUrl) {
    throw new Error('Missing SUPABASE_URL. Add it to .env.local or js/config.js.');
  }
  if (!config?.serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local. Never put service-role keys in frontend files or VITE_ variables.');
  }
}

function matchConfigValue(text, key) {
  const match = String(text || '').match(new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`));
  return match?.[1] || '';
}

function firstRealValue(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

export async function supabaseRequest(config, resourcePath, options = {}) {
  assertAdminConfig(config);
  const url = new URL(`${config.supabaseUrl}${resourcePath}`);
  Object.entries(options.params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Accept: 'application/json',
    ...(options.headers || {})
  };
  let body;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body
  });
  const text = await response.text();
  const payload = text ? parseJsonSafe(text) ?? text : null;
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.message || `Supabase HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchAllBathrooms(config) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRequest(config, '/rest/v1/bathrooms', {
      params: {
        select: 'id,name,venue_name,type,address,city,country,lat,lng,access_mode,access_note,facilities,vibe_tags,crowd_level,status,moderation_status,added_by,map_x,map_y,created_at,updated_at',
        order: 'city.asc,name.asc',
        limit: pageSize,
        offset
      }
    });
    const items = Array.isArray(page) ? page : [];
    rows.push(...items);
    if (items.length < pageSize) break;
  }
  return rows;
}

export async function fetchBathroom(config, id) {
  const rows = await supabaseRequest(config, '/rest/v1/bathrooms', {
    params: {
      select: '*',
      id: `eq.${id}`,
      limit: 1
    }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function updateBathroom(config, id, payload) {
  const rows = await supabaseRequest(config, '/rest/v1/bathrooms', {
    method: 'PATCH',
    params: {
      id: `eq.${id}`,
      select: '*'
    },
    headers: {
      Prefer: 'return=representation'
    },
    body: payload
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function writeBackup(kind, payload) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeKind = String(kind || 'backup').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const filePath = path.join(BACKUP_DIR, `${stamp}-${safeKind}.json`);
  await fs.writeFile(filePath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    projectRoot: ROOT,
    kind,
    ...payload
  }, null, 2)}\n`);
  return filePath;
}

export function filterBathrooms(rows, options = {}) {
  const query = normalize(options.query || '');
  const status = String(options.status || 'visible').toLowerCase();
  return rows.filter((row) => {
    if (status === 'visible' && ['hidden', 'rejected'].includes(String(row.moderation_status || '').toLowerCase())) return false;
    if (status === 'hidden' && !['hidden', 'rejected'].includes(String(row.moderation_status || '').toLowerCase())) return false;
    if (!query) return true;
    const haystack = normalize([
      row.id,
      row.name,
      row.venue_name,
      row.address,
      row.city,
      row.country,
      row.status,
      row.moderation_status
    ].join(' '));
    return haystack.includes(query);
  });
}

export function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
