#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  ROOT,
  assertProjectRoot,
  fetchAllBathrooms,
  filterBathrooms,
  getAdminConfig,
  normalize,
  updateBathroom,
  writeBackup
} from './admin-lib.mjs';

const DEFAULT_THRESHOLD = 0.85;
const DEFAULT_DELAY_MS = 1200;
const DEFAULT_LIMIT = 0;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'UnpissedCoordinateFixer/1.0 (local moderator tool)';

function parseArgs(argv) {
  const args = {
    apply: false,
    query: '',
    limit: DEFAULT_LIMIT,
    threshold: DEFAULT_THRESHOLD,
    delayMs: DEFAULT_DELAY_MS,
    all: false,
    yes: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--query') {
      args.query = next || '';
      index += 1;
    } else if (arg === '--limit') {
      args.limit = Number(next || DEFAULT_LIMIT);
      index += 1;
    } else if (arg === '--threshold') {
      args.threshold = Number(next || DEFAULT_THRESHOLD);
      index += 1;
    } else if (arg === '--delay-ms') {
      args.delayMs = Number(next || DEFAULT_DELAY_MS);
      index += 1;
    } else if (arg === '--all') {
      args.all = true;
    } else if (arg === '--yes') {
      args.yes = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (!Number.isFinite(args.threshold) || args.threshold <= 0 || args.threshold > 1) {
    throw new Error('--threshold must be between 0 and 1.');
  }
  return args;
}

function printHelp() {
  console.log(`Unpissed coordinate batch fixer

Dry-run by default:
  node scripts/fix-coordinates.mjs
  node scripts/fix-coordinates.mjs --query Sarpsborg --limit 10

Apply requires explicit confirmation:
  node scripts/fix-coordinates.mjs --apply

Options:
  --query <text>       Filter by name, address, city, country or id.
  --limit <n>          Limit processed candidates.
  --threshold <0-1>    Confidence threshold. Default: ${DEFAULT_THRESHOLD}
  --delay-ms <n>       Delay between geocoding calls. Default: ${DEFAULT_DELAY_MS}
  --all                Include approved/user-added rows. Default focuses on unverified/missing-coordinate rows.
  --apply              Write accepted fixes to Supabase after backup.
  --yes                Non-interactive confirm. Prefer the .cmd wrapper for apply.
`);
}

function isSeedOrCoordinateCandidate(row, all = false) {
  if (all) return !['hidden', 'rejected'].includes(String(row.moderation_status || '').toLowerCase());
  const moderation = String(row.moderation_status || '').toLowerCase();
  const facilities = Array.isArray(row.facilities) ? row.facilities.map((item) => String(item).toLowerCase()) : [];
  const vibeTags = Array.isArray(row.vibe_tags) ? row.vibe_tags.map((item) => String(item).toLowerCase()) : [];
  return ['unused', 'pending'].includes(moderation) ||
    row.lat === null ||
    row.lng === null ||
    facilities.includes('needs_geocoding') ||
    vibeTags.includes('needs-geocoding') ||
    facilities.includes('venue_seed') ||
    vibeTags.includes('venue_seed');
}

function candidateQuery(row) {
  const venue = row.venue_name || stripToiletPrefix(row.name);
  return [venue, row.address, row.city, row.country || 'Norway'].filter(Boolean).join(', ');
}

function stripToiletPrefix(value) {
  return String(value || '').replace(/^toalett\s*[-\u2013\u2014]\s*/i, '').trim();
}

async function geocode(row, options) {
  const query = candidateQuery(row);
  if (!query.trim()) return null;
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  if (normalize(row.country || 'Norway') === 'norway') url.searchParams.set('countrycodes', 'no');
  url.searchParams.set('q', query);
  const rows = await fetchJsonWithRetry(url, options);
  const scored = rows
    .map((place) => ({ place, confidence: confidence(row, place) }))
    .sort((a, b) => b.confidence - a.confidence);
  return scored[0] || null;
}

async function fetchJsonWithRetry(url, options, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  if ([429, 500, 502, 503, 504].includes(response.status) && attempt <= 4) {
    const waitMs = options.delayMs * attempt * 2;
    console.log(`  Rate/server limit ${response.status}; waiting ${waitMs} ms before retry ${attempt}.`);
    await delay(waitMs);
    return fetchJsonWithRetry(url, options, attempt + 1);
  }
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

function confidence(row, place) {
  const candidateName = normalizeVenue(row.venue_name || stripToiletPrefix(row.name), row.city);
  const placeName = normalizeVenue(place.name || place.address?.amenity || place.address?.shop || String(place.display_name || '').split(',')[0], row.city);
  const display = normalize(place.display_name || '');
  const address = normalize(row.address || '');
  const city = normalize(row.city || '');
  const country = normalize(row.country || 'Norway');

  let score = nameSimilarity(candidateName, placeName) * 0.58;
  if (address) {
    const tokens = tokenSet(address).filter((token) => token.length > 1);
    const hits = tokens.filter((token) => display.includes(token)).length;
    score += Math.min(0.22, hits * 0.045);
  }
  if (city && display.includes(city)) score += 0.1;
  if (country && display.includes(country)) score += 0.04;
  if (['restaurant', 'cafe', 'pub', 'bar', 'fast_food', 'food_court'].includes(String(place.type || ''))) score += 0.04;
  return clamp(score, 0, 1);
}

function normalizeVenue(value, city = '') {
  const normalizedCity = normalize(city);
  let text = normalize(value);
  if (normalizedCity) text = text.replace(new RegExp(`\\b${escapeRegExp(normalizedCity)}\\b`, 'g'), '');
  return text
    .replace(/\b(as|restaurant|restaurang|cafe|cafeen|kaffe|kaffebar|bar|pub|bistro|brasserie|toalett)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value) {
  return [...new Set(normalize(value).split(/\s+/).filter(Boolean))];
}

function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  const common = aTokens.filter((token) => bTokens.includes(token)).length;
  const tokenScore = common / Math.max(aTokens.length, bTokens.length, 1);
  const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  return Math.max(tokenScore, editScore * 0.9);
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceMeters(a, b) {
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const earth = 6371000;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function proposalFrom(row, match, options) {
  if (!match?.place) {
    return {
      row,
      accepted: false,
      reason: 'no_match',
      confidence: 0
    };
  }
  const place = match.place;
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  const distance = distanceMeters(row, { lat, lng });
  const accepted = match.confidence >= options.threshold && Number.isFinite(lat) && Number.isFinite(lng);
  return {
    row,
    accepted,
    reason: accepted ? 'accepted' : 'low_confidence',
    confidence: Number(match.confidence.toFixed(3)),
    distanceMeters: distance === null ? null : Math.round(distance),
    candidateQuery: candidateQuery(row),
    proposed: {
      lat,
      lng,
      address: row.address || compactAddress(place.address || null),
      city: row.city || place.address?.city || place.address?.town || place.address?.municipality || '',
      country: row.country || place.address?.country || 'Norway',
      displayName: place.display_name || ''
    }
  };
}

function compactAddress(address) {
  if (!address) return '';
  const street = [address.road, address.house_number].filter(Boolean).join(' ');
  const city = address.city || address.town || address.municipality || address.village;
  return [street, address.postcode, city].filter(Boolean).join(', ');
}

function updatePayload(proposal) {
  const row = proposal.row;
  const proposed = proposal.proposed;
  const payload = {
    lat: Number(proposed.lat),
    lng: Number(proposed.lng)
  };
  if (!row.address && proposed.address) payload.address = proposed.address;
  if (!row.city && proposed.city) payload.city = proposed.city;
  if (!row.country && proposed.country) payload.country = proposed.country;
  return payload;
}

async function confirmApply(count, options) {
  if (!options.apply) return false;
  if (options.yes || process.env.COORDINATE_FIX_CONFIRM === 'APPLY') return true;
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`Type APPLY to update ${count} bathroom coordinate records: `);
    return answer === 'APPLY';
  } finally {
    rl.close();
  }
}

function printSummary(proposals, options) {
  const accepted = proposals.filter((item) => item.accepted);
  const skipped = proposals.filter((item) => !item.accepted);
  console.log('');
  console.log(options.apply ? 'Apply plan' : 'Dry-run plan');
  console.log(`Candidates checked: ${proposals.length}`);
  console.log(`Accepted above threshold ${options.threshold}: ${accepted.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log('');
  accepted.slice(0, 20).forEach((item) => {
    console.log(`[OK ${item.confidence}] ${item.row.name} -> ${item.proposed.lat.toFixed(6)}, ${item.proposed.lng.toFixed(6)} (${item.distanceMeters ?? 'new'} m)`);
  });
  if (accepted.length > 20) console.log(`... ${accepted.length - 20} more accepted proposals`);
  if (skipped.length) {
    console.log('');
    skipped.slice(0, 10).forEach((item) => {
      console.log(`[SKIP ${item.confidence}] ${item.row.name} (${item.reason})`);
    });
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const project = await assertProjectRoot();
  const config = await getAdminConfig();
  console.log(`Project root: ${project.root}`);
  console.log(options.apply ? 'Mode: APPLY (will ask for confirmation)' : 'Mode: DRY-RUN (no database writes)');

  const allRows = await fetchAllBathrooms(config);
  let candidates = filterBathrooms(allRows, { query: options.query, status: options.all ? 'all' : 'visible' })
    .filter((row) => isSeedOrCoordinateCandidate(row, options.all));
  if (options.limit > 0) candidates = candidates.slice(0, options.limit);
  console.log(`Loaded ${candidates.length} coordinate candidates.`);

  const proposals = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const row = candidates[index];
    console.log(`${index + 1}/${candidates.length}: ${row.name}`);
    try {
      const match = await geocode(row, options);
      proposals.push(proposalFrom(row, match, options));
    } catch (error) {
      proposals.push({
        row,
        accepted: false,
        reason: error.message,
        confidence: 0
      });
    }
    if (index < candidates.length - 1) await delay(options.delayMs);
  }

  printSummary(proposals, options);

  const accepted = proposals.filter((item) => item.accepted);
  const planPath = await writeBackup(options.apply ? 'coordinate-apply-plan' : 'coordinate-dry-run-plan', {
    dryRun: !options.apply,
    threshold: options.threshold,
    query: options.query,
    candidatesChecked: proposals.length,
    acceptedCount: accepted.length,
    proposals
  });
  console.log(`Plan written: ${planPath}`);

  if (!options.apply) {
    console.log('No database writes were made. Re-run with --apply to write accepted fixes.');
    return;
  }

  if (!accepted.length) {
    console.log('No accepted fixes to apply.');
    return;
  }

  const confirmed = await confirmApply(accepted.length, options);
  if (!confirmed) {
    console.log('Apply cancelled. No database writes were made.');
    return;
  }

  const backupPath = await writeBackup('coordinate-before-apply-backup', {
    rows: accepted.map((item) => item.row),
    proposals: accepted
  });
  console.log(`Backup written: ${backupPath}`);

  for (const item of accepted) {
    const payload = updatePayload(item);
    await updateBathroom(config, item.row.id, payload);
    console.log(`Updated ${item.row.id}: ${item.row.name}`);
  }
  console.log(`Applied ${accepted.length} coordinate fixes.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
