#!/usr/bin/env node
/*
  Batch geocoder for Unpissed seed venues.

  Flow:
  1. Read candidates from public.location_qa_candidates or a JSON file.
  2. Read a local OSM venue index, or fetch venues per city with Overpass mirrors.
  3. Fuzzy-match candidates to venues and score confidence.
  4. Use Nominatim fallback only for unresolved candidates.
  5. Write SQL for high-confidence inserts, plus review files for the rest.

  This tool does not write to Supabase directly. It generates SQL for review/run.
*/

import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULTS = {
  outDir: path.join(ROOT, 'tools', 'output'),
  threshold: 86,
  reviewThreshold: 62,
  delayMs: 1100,
  pageSize: 1000,
  dataDir: path.join(ROOT, 'tools', 'data'),
  localPlacesPath: path.join(ROOT, 'tools', 'data', 'norway-osm-venues.geojson'),
  pbfPath: path.join(ROOT, 'tools', 'data', 'norway-latest.osm.pbf'),
  pbfUrl: 'https://download.geofabrik.de/europe/norway-latest.osm.pbf',
  overpassUrls: [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ],
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  userAgent: 'UnpissedLocationQA/1.0 (local data QA)',
  country: 'Norway',
  countryCode: 'no'
};

const VENUE_TAGS = [
  ['amenity', 'restaurant|cafe|bar|pub|fast_food|food_court|biergarten|nightclub'],
  ['shop', 'mall|bakery|convenience|supermarket'],
  ['tourism', 'hotel|attraction|museum'],
  ['leisure', 'bowling_alley|sports_centre|stadium'],
  ['building', 'retail|commercial']
];

function parseArgs(argv) {
  const args = {
    input: '',
    outDir: DEFAULTS.outDir,
    threshold: DEFAULTS.threshold,
    reviewThreshold: DEFAULTS.reviewThreshold,
    delayMs: DEFAULTS.delayMs,
    limit: 0,
    cities: [],
    backend: 'auto',
    localGeojson: '',
    pbf: '',
    pbfUrl: DEFAULTS.pbfUrl,
    downloadPbf: false,
    buildLocalIndex: false,
    osmiumBin: process.env.OSMIUM_BIN || 'osmium',
    overpassUrls: [...DEFAULTS.overpassUrls],
    noNominatim: false,
    noOverpass: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--input') {
      args.input = next || '';
      index += 1;
    } else if (arg === '--out') {
      args.outDir = path.resolve(next || DEFAULTS.outDir);
      index += 1;
    } else if (arg === '--threshold') {
      args.threshold = Number(next || DEFAULTS.threshold);
      index += 1;
    } else if (arg === '--review-threshold') {
      args.reviewThreshold = Number(next || DEFAULTS.reviewThreshold);
      index += 1;
    } else if (arg === '--delay-ms') {
      args.delayMs = Number(next || DEFAULTS.delayMs);
      index += 1;
    } else if (arg === '--limit') {
      args.limit = Number(next || 0);
      index += 1;
    } else if (arg === '--city') {
      args.cities = String(next || '').split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--backend') {
      args.backend = next || 'auto';
      index += 1;
    } else if (arg === '--local-geojson') {
      args.localGeojson = path.resolve(next || DEFAULTS.localPlacesPath);
      index += 1;
    } else if (arg === '--pbf') {
      args.pbf = path.resolve(next || DEFAULTS.pbfPath);
      index += 1;
    } else if (arg === '--pbf-url') {
      args.pbfUrl = next || DEFAULTS.pbfUrl;
      index += 1;
    } else if (arg === '--download-pbf') {
      args.downloadPbf = true;
    } else if (arg === '--build-local-index') {
      args.buildLocalIndex = true;
    } else if (arg === '--osmium') {
      args.osmiumBin = next || 'osmium';
      index += 1;
    } else if (arg === '--overpass-url') {
      args.overpassUrls = [next || DEFAULTS.overpassUrls[0]];
      index += 1;
    } else if (arg === '--overpass-urls') {
      args.overpassUrls = String(next || '').split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--no-nominatim') {
      args.noNominatim = true;
    } else if (arg === '--no-overpass') {
      args.noOverpass = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!['auto', 'overpass', 'local'].includes(args.backend)) {
    throw new Error(`Unknown backend "${args.backend}". Use auto, overpass or local.`);
  }

  return args;
}

function printHelp() {
  console.log(`Unpissed seed location batch geocoder

Usage:
  node tools/geocode_seed_locations.mjs
  node tools/geocode_seed_locations.mjs --city Fredrikstad,Sarpsborg --threshold 88
  node tools/geocode_seed_locations.mjs --backend local --download-pbf --build-local-index
  node tools/geocode_seed_locations.mjs --input candidates.json --out tools/output

Options:
  --input <file>          Read candidates from JSON instead of Supabase.
  --out <dir>            Output directory. Default: tools/output
  --city <a,b>           Only process these cities.
  --backend <mode>        auto, overpass or local. Default: auto
  --local-geojson <file>  Read local OSM venue GeoJSON index.
  --pbf <file>            Use local .osm.pbf file when building the GeoJSON index.
  --download-pbf          Download Norway PBF from Geofabrik to tools/data.
  --build-local-index     Build tools/data/norway-osm-venues.geojson from PBF via osmium.
  --pbf-url <url>         PBF download URL. Default: Geofabrik Norway latest.
  --osmium <path>         osmium executable. Default: osmium
  --overpass-url <url>    Use one Overpass endpoint.
  --overpass-urls <a,b>   Use endpoint list. Default: private.coffee,kumi,official.
  --threshold <n>        Auto SQL threshold. Default: 86
  --review-threshold <n> Suggested/review threshold. Default: 62
  --limit <n>            Process only first n candidates.
  --delay-ms <n>         Delay before external calls. Default: 1100
  --no-overpass          Skip Overpass city venue harvest.
  --no-nominatim         Skip Nominatim per-candidate fallback.
  --dry-run              Do not write output files.
`);
}

async function readRuntimeConfig() {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
  };
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) return env;

  const configPath = path.join(ROOT, 'js', 'config.js');
  const text = await fs.readFile(configPath, 'utf8').catch(() => '');
  return {
    SUPABASE_URL: env.SUPABASE_URL || matchConfigValue(text, 'SUPABASE_URL'),
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || matchConfigValue(text, 'SUPABASE_ANON_KEY')
  };
}

function matchConfigValue(text, key) {
  const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`);
  return text.match(regex)?.[1] || '';
}

async function loadCandidates(options, config) {
  const rows = options.input
    ? await loadCandidatesFromFile(options.input)
    : await loadCandidatesFromSupabase(config);
  const normalized = rows.map(normalizeCandidate)
    .filter((row) => row.source_bathroom_id && row.name);
  const filtered = options.cities.length
    ? normalized.filter((row) => options.cities.some((city) => normalize(row.city) === normalize(city)))
    : normalized;
  return options.limit > 0 ? filtered.slice(0, options.limit) : filtered;
}

async function loadCandidatesFromFile(inputPath) {
  const absolute = path.resolve(inputPath);
  const payload = JSON.parse(await fs.readFile(absolute, 'utf8'));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.candidates)) return payload.candidates;
  throw new Error(`No candidates array found in ${absolute}`);
}

async function loadCandidatesFromSupabase(config) {
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env vars or js/config.js.');
  }

  const rows = [];
  for (let offset = 0; ; offset += DEFAULTS.pageSize) {
    const url = new URL(`${config.SUPABASE_URL}/rest/v1/location_qa_candidates`);
    url.searchParams.set('select', '*');
    url.searchParams.set('qa_status', 'neq.inserted');
    url.searchParams.set('order', 'city.asc,venue_name.asc,name.asc');
    url.searchParams.set('limit', String(DEFAULTS.pageSize));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers: supabaseHeaders(config) });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(formatSupabaseLoadError(response.status, errorText));
    }
    const page = await response.json();
    rows.push(...page);
    if (!Array.isArray(page) || page.length < DEFAULTS.pageSize) break;
  }
  return rows;
}

function formatSupabaseLoadError(status, errorText) {
  const parsed = parseJsonSafe(errorText);
  if (status === 404 && parsed?.code === 'PGRST205') {
    return [
      'Supabase table public.location_qa_candidates is not available through PostgREST yet.',
      '',
      'Run this first in Supabase SQL Editor:',
      '  supabase/reset_unverified_seed_bathrooms_for_location_qa.sql',
      '',
      'If you already ran it, reload the schema cache and retry:',
      "  notify pgrst, 'reload schema';",
      '',
      `Original Supabase error: HTTP ${status} ${errorText}`
    ].join('\n');
  }
  return `Supabase load failed: HTTP ${status} ${errorText}`;
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function supabaseHeaders(config) {
  return {
    apikey: config.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
    Accept: 'application/json'
  };
}

function normalizeCandidate(row = {}) {
  return {
    source_bathroom_id: row.source_bathroom_id || row.id,
    name: row.name || '',
    venue_name: row.venue_name || stripToiletPrefix(row.name || ''),
    type: row.type || 'Other',
    access_mode: row.access_mode || 'customer-only',
    access_note: row.access_note || 'Unverified seed throne: likely guest toilet at venue. Verify access, code/key, opening hours and facilities before approving.',
    address: row.address || '',
    city: row.city || '',
    country: row.country || DEFAULTS.country,
    old_lat: numberOrNull(row.old_lat ?? row.lat),
    old_lng: numberOrNull(row.old_lng ?? row.lng),
    facilities: Array.isArray(row.facilities) ? row.facilities : ['guest_toilet', 'unverified', 'venue_seed'],
    vibe_tags: Array.isArray(row.vibe_tags) ? row.vibe_tags : ['unverified', 'seed'],
    crowd_level: row.crowd_level || 'Unverified',
    status: row.status || 'UNUSED',
    map_x: numberOrDefault(row.map_x, 50),
    map_y: numberOrDefault(row.map_y, 50)
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stripToiletPrefix(value) {
  const stripped = String(value || '').replace(/^toalett\s*[-\u2013\u2014]\s*/i, '').trim();
  if (stripped || !value) return stripped;
  return String(value || '').replace(/^toalett\s*[-–]\s*/i, '').trim();
}

function venueName(candidate) {
  return candidate.venue_name || stripToiletPrefix(candidate.name);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = await readRuntimeConfig();
  await fs.mkdir(options.outDir, { recursive: true });

  console.log('Loading candidates...');
  const candidates = await loadCandidates(options, config);
  console.log(`Loaded ${candidates.length} candidates.`);
  if (!candidates.length) return;

  const grouped = groupByCity(candidates);
  const cityPlaces = new Map();
  const results = [];
  const localPlaces = await prepareLocalBackend(options);

  if (localPlaces?.length) {
    console.log(`Using local OSM venue index (${localPlaces.length} places).`);
    for (const [city, rows] of grouped.entries()) {
      const cityName = city.split(',')[0].trim();
      const places = filterLocalPlacesForCity(localPlaces, cityName);
      cityPlaces.set(city, places.length ? places : localPlaces);
      console.log(`  ${cityName}: ${places.length || localPlaces.length} local places for ${rows.length} candidates.`);
    }
  } else if (!options.noOverpass && options.backend !== 'local') {
    for (const [city, rows] of grouped.entries()) {
      console.log(`Harvesting OSM venues for ${city} (${rows.length} candidates)...`);
      try {
        await delay(options.delayMs);
        const bounds = await fetchCityBounds(city, rows[0]?.country || DEFAULTS.country, options);
        if (!bounds) {
          console.log(`  No city bounds for ${city}; skipping Overpass.`);
          cityPlaces.set(city, []);
          continue;
        }
        await delay(options.delayMs);
        const places = await fetchOverpassVenues(bounds, options);
        cityPlaces.set(city, places);
        console.log(`  ${places.length} OSM venues harvested.`);
      } catch (error) {
        console.log(`  Overpass harvest failed for ${city}: ${error.message}`);
        cityPlaces.set(city, []);
      }
    }
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const cityKey = cityKeyFor(candidate.city, candidate.country);
    const places = cityPlaces.get(cityKey) || [];
    const osmMatch = bestMatch(candidate, places, places[0]?.source || 'osm');
    let match = osmMatch;
    let fallbackUsed = false;

    if (!options.noNominatim && (!match || match.score < options.threshold)) {
      await delay(options.delayMs);
      try {
        const fallbackPlaces = await fetchNominatimCandidate(candidate, options);
        const nominatimMatch = bestMatch(candidate, fallbackPlaces, 'nominatim');
        if (nominatimMatch && (!match || nominatimMatch.score > match.score)) {
          match = nominatimMatch;
          fallbackUsed = true;
        }
      } catch (error) {
        results.push(resultFor(candidate, match, 'error', `Nominatim fallback failed: ${error.message}`));
        console.log(`${index + 1}/${candidates.length} ${venueName(candidate)}: fallback error`);
        continue;
      }
    }

    const status = !match
      ? 'no_match'
      : match.score >= options.threshold
        ? 'accepted'
        : match.score >= options.reviewThreshold
          ? 'review'
          : 'low_confidence';
    results.push(resultFor(candidate, match, status, fallbackUsed ? 'nominatim fallback' : ''));
    console.log(`${index + 1}/${candidates.length} ${venueName(candidate)}: ${status}${match ? ` score=${match.score}` : ''}`);
  }

  await writeOutputs(results, options);
}

function groupByCity(candidates) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const key = cityKeyFor(candidate.city, candidate.country);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }
  return grouped;
}

function cityKeyFor(city, country) {
  return [city || 'Unknown', country || DEFAULTS.country].join(', ');
}

async function prepareLocalBackend(options) {
  if (options.backend === 'overpass') return null;

  const localGeojson = options.localGeojson || DEFAULTS.localPlacesPath;
  const pbf = options.pbf || DEFAULTS.pbfPath;
  const localRequested = options.backend === 'local' ||
    options.localGeojson ||
    options.pbf ||
    options.downloadPbf ||
    options.buildLocalIndex;

  if (options.downloadPbf) {
    await downloadPbf(options.pbfUrl || DEFAULTS.pbfUrl, pbf);
  }

  if (options.buildLocalIndex || (options.pbf && !(await pathExists(localGeojson)))) {
    if (!(await pathExists(pbf))) {
      throw new Error(`PBF file not found: ${pbf}. Use --download-pbf or --pbf <file>.`);
    }
    await buildLocalGeojsonFromPbf(pbf, localGeojson, options);
  }

  if (await pathExists(localGeojson)) {
    return loadLocalPlaces(localGeojson);
  }

  if (localRequested) {
    throw new Error(`Local backend requested, but no GeoJSON index exists at ${localGeojson}. Use --download-pbf --build-local-index first.`);
  }

  return null;
}

async function downloadPbf(url, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (await pathExists(targetPath)) {
    console.log(`PBF already exists: ${path.relative(ROOT, targetPath)}`);
    return;
  }

  console.log(`Downloading ${url}`);
  console.log(`Target: ${path.relative(ROOT, targetPath)}`);
  const response = await fetch(url, { headers: externalHeaders({}) });
  if (!response.ok || !response.body) {
    throw new Error(`PBF download failed: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));
}

async function buildLocalGeojsonFromPbf(pbfPath, outputGeojson, options) {
  await fs.mkdir(path.dirname(outputGeojson), { recursive: true });
  const filteredPbf = path.join(path.dirname(outputGeojson), 'norway-osm-venues.filtered.osm.pbf');
  const filters = VENUE_TAGS.flatMap(([key, values]) => {
    const list = values.split('|').join(',');
    return [`n/${key}=${list}`, `w/${key}=${list}`, `r/${key}=${list}`];
  });

  console.log(`Building local venue index with ${options.osmiumBin}`);
  await runCommand(options.osmiumBin, [
    'tags-filter',
    pbfPath,
    ...filters,
    '-o',
    filteredPbf,
    '--overwrite'
  ]);
  await runCommand(options.osmiumBin, [
    'export',
    filteredPbf,
    '-o',
    outputGeojson,
    '--overwrite'
  ]);
  console.log(`Local venue index written: ${path.relative(ROOT, outputGeojson)}`);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', (error) => {
      reject(new Error(`${command} failed to start. Install osmium-tool or pass --osmium <path>. ${error.message}`));
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

async function loadLocalPlaces(localGeojson) {
  const payload = JSON.parse(await fs.readFile(localGeojson, 'utf8'));
  const features = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.features)
      ? payload.features
      : [];
  return dedupePlaces(features.map(localFeatureToPlace).filter(Boolean));
}

function localFeatureToPlace(feature) {
  const properties = feature.properties || feature.tags || feature;
  const coordinates = representativeCoordinate(feature.geometry);
  if (!coordinates) return null;
  const [lng, lat] = coordinates;
  if (!properties.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = [
    properties['addr:street'] && properties['addr:housenumber']
      ? `${properties['addr:street']} ${properties['addr:housenumber']}`
      : properties['addr:street'],
    properties['addr:postcode'],
    properties['addr:city']
  ].filter(Boolean).join(', ');
  const typeKey = Object.keys(properties).find((key) => ['amenity', 'shop', 'tourism', 'leisure', 'building'].includes(key)) || '';

  return {
    source: 'local-osm',
    source_id: properties.id || properties['@id'] || properties.osm_id || `${properties.name}:${lat.toFixed(6)}:${lng.toFixed(6)}`,
    name: properties.name,
    label: [properties.name, address].filter(Boolean).join(', '),
    address,
    city: properties['addr:city'] || '',
    lat,
    lng,
    className: typeKey,
    type: properties[typeKey] || '',
    raw: properties
  };
}

function representativeCoordinate(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry.coordinates;
  const points = flattenCoordinates(geometry.coordinates);
  if (!points.length) return null;
  const sum = points.reduce((acc, point) => {
    acc.lng += Number(point[0]);
    acc.lat += Number(point[1]);
    return acc;
  }, { lat: 0, lng: 0 });
  return [sum.lng / points.length, sum.lat / points.length];
}

function flattenCoordinates(value) {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === 'number' && typeof value[1] === 'number') return [value];
  return value.flatMap(flattenCoordinates);
}

function filterLocalPlacesForCity(places, city) {
  const needle = normalize(city);
  if (!needle) return places;
  return places.filter((place) => {
    const haystack = normalize(`${place.city} ${place.address} ${place.label}`);
    return haystack.includes(needle);
  });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchCityBounds(cityKey, country, options) {
  const city = cityKey.split(',')[0].trim();
  const url = new URL(options.nominatimUrl || DEFAULTS.nominatimUrl);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', DEFAULTS.countryCode);
  url.searchParams.set('q', [city, country || DEFAULTS.country].filter(Boolean).join(', '));
  const response = await fetch(url, { headers: externalHeaders(options) });
  if (!response.ok) throw new Error(`Nominatim bounds HTTP ${response.status}`);
  const rows = await response.json();
  const box = rows?.[0]?.boundingbox;
  if (!Array.isArray(box) || box.length !== 4) return null;
  return {
    south: Number(box[0]),
    north: Number(box[1]),
    west: Number(box[2]),
    east: Number(box[3])
  };
}

async function fetchOverpassVenues(bounds, options) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const selectors = VENUE_TAGS.map(([key, values]) => `nwr["name"]["${key}"~"${values}"](${bbox});`).join('\n  ');
  const query = `[out:json][timeout:120];
(
  ${selectors}
);
out center tags;`;

  const errors = [];
  for (const endpoint of overpassEndpointList(options)) {
    try {
      console.log(`  Overpass endpoint: ${endpoint}`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...externalHeaders(options),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ data: query })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 220)}`);
      }
      const payload = await response.json();
      return (payload.elements || []).map(overpassElementToPlace).filter(Boolean);
    } catch (error) {
      errors.push(`${endpoint} => ${error.message}`);
      console.log(`  Endpoint failed, trying next: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

function overpassEndpointList(options) {
  const urls = options.overpassUrls?.length ? options.overpassUrls : DEFAULTS.overpassUrls;
  return [...new Set(urls.filter(Boolean))];
}

function overpassElementToPlace(element) {
  const tags = element.tags || {};
  const lat = Number(element.lat ?? element.center?.lat);
  const lng = Number(element.lon ?? element.center?.lon);
  if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    source: 'overpass',
    source_id: `${element.type}/${element.id}`,
    name: tags.name,
    label: [
      tags.name,
      tags['addr:street'] && tags['addr:housenumber'] ? `${tags['addr:street']} ${tags['addr:housenumber']}` : tags['addr:street'],
      tags['addr:postcode'],
      tags['addr:city']
    ].filter(Boolean).join(', '),
    address: [
      tags['addr:street'] && tags['addr:housenumber'] ? `${tags['addr:street']} ${tags['addr:housenumber']}` : tags['addr:street'],
      tags['addr:postcode'],
      tags['addr:city']
    ].filter(Boolean).join(', '),
    city: tags['addr:city'] || '',
    lat,
    lng,
    className: Object.keys(tags).find((key) => ['amenity', 'shop', 'tourism', 'leisure', 'building'].includes(key)) || '',
    type: tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.building || '',
    raw: tags
  };
}

async function fetchNominatimCandidate(candidate, options) {
  const queries = [
    [venueName(candidate), candidate.address, candidate.city, candidate.country || DEFAULTS.country].filter(Boolean).join(', '),
    [venueName(candidate), candidate.city, candidate.country || DEFAULTS.country].filter(Boolean).join(', ')
  ];
  const all = [];
  for (const query of queries) {
    if (!query.trim()) continue;
    const url = new URL(options.nominatimUrl || DEFAULTS.nominatimUrl);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '8');
    url.searchParams.set('countrycodes', DEFAULTS.countryCode);
    url.searchParams.set('q', query);
    const response = await fetch(url, { headers: externalHeaders(options) });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const rows = await response.json();
    all.push(...rows.map(nominatimRowToPlace).filter(Boolean));
    if (all.length) break;
  }
  return dedupePlaces(all);
}

function nominatimRowToPlace(row) {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = row.address || {};
  const name = row.name || address.amenity || address.shop || String(row.display_name || '').split(',')[0];
  return {
    source: 'nominatim',
    source_id: `${row.osm_type || 'unknown'}/${row.osm_id || ''}`,
    name,
    label: row.display_name || name,
    address: compactAddress(address),
    city: address.city || address.town || address.village || address.municipality || '',
    lat,
    lng,
    className: row.class || '',
    type: row.type || '',
    raw: row
  };
}

function compactAddress(address = {}) {
  const street = [address.road, address.house_number].filter(Boolean).join(' ');
  const city = address.city || address.town || address.village || address.municipality;
  return [street, address.postcode, city].filter(Boolean).join(', ');
}

function dedupePlaces(places) {
  const seen = new Set();
  return places.filter((place) => {
    const key = `${place.source_id}:${place.lat.toFixed(6)}:${place.lng.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bestMatch(candidate, places, provider) {
  let best = null;
  for (const place of places) {
    const score = scorePlace(candidate, place);
    const match = { ...place, score, provider };
    if (!best || match.score > best.score) best = match;
  }
  return best;
}

function scorePlace(candidate, place) {
  const candidateName = normalizeVenue(venueName(candidate), candidate.city);
  const placeName = normalizeVenue(place.name, candidate.city);
  const label = normalize(`${place.label} ${place.address} ${place.city}`);
  const candidateAddress = normalize(candidate.address);
  const city = normalize(candidate.city);
  const type = normalize(candidate.type);

  let score = Math.round(nameSimilarity(candidateName, placeName) * 62);

  if (candidateAddress) {
    const addressTokens = tokenSet(candidateAddress).filter((token) => token.length > 1);
    const hitCount = addressTokens.filter((token) => label.includes(token)).length;
    score += Math.min(22, hitCount * 5);
  }

  if (city && label.includes(city)) score += 8;
  if (type && venueTypeMatches(type, place.type, place.className)) score += 8;
  if (place.source === 'overpass') score += 2;

  if (candidate.old_lat !== null && candidate.old_lng !== null) {
    const meters = distanceMeters(candidate.old_lat, candidate.old_lng, place.lat, place.lng);
    if (meters < 80) score += 3;
    if (meters > 10000) score -= 4;
  }

  return clamp(Math.round(score), 0, 100);
}

function normalizeVenue(value, city = '') {
  const normalizedCity = normalize(city);
  let text = normalize(stripToiletPrefix(value));
  if (normalizedCity) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(normalizedCity)}\\b`, 'g'), '');
  }
  return text
    .replace(/\b(as|restaurant|restaurang|cafe|cafeen|kaffe|kaffebar|bar|pub|bistro|brasserie)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a')
    .replace(/\u00e3\u00a6/g, 'ae')
    .replace(/\u00e3\u00b8/g, 'o')
    .replace(/\u00e3\u00a5/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
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
  return Math.max(tokenScore, editScore * 0.92);
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

function venueTypeMatches(candidateType, placeType, placeClass) {
  const haystack = normalize(`${placeType} ${placeClass}`);
  if (candidateType.includes('restaurant')) return /restaurant|fast food|food court/.test(haystack);
  if (candidateType.includes('cafe')) return /cafe|bakery/.test(haystack);
  if (candidateType.includes('bar')) return /bar|pub|nightclub|biergarten/.test(haystack);
  if (candidateType.includes('pub')) return /pub|bar|biergarten/.test(haystack);
  return false;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const earth = 6371000;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resultFor(candidate, match, status, note = '') {
  return {
    status,
    note,
    candidate,
    match: match || null
  };
}

async function writeOutputs(results, options) {
  const accepted = results.filter((result) => result.status === 'accepted');
  const review = results.filter((result) => result.status === 'review' || result.status === 'low_confidence' || result.status === 'no_match' || result.status === 'error');
  const suggestions = results.filter((result) => result.match);

  const files = {
    resultsJson: path.join(options.outDir, 'location_qa_results.json'),
    acceptedSql: path.join(options.outDir, 'location_qa_autofix.sql'),
    suggestionsSql: path.join(options.outDir, 'location_qa_suggestions.sql'),
    reviewCsv: path.join(options.outDir, 'location_qa_review.csv')
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    thresholds: {
      accepted: options.threshold,
      review: options.reviewThreshold
    },
    summary: summarize(results),
    results
  };

  const acceptedSql = buildAcceptedSql(accepted);
  const suggestionsSql = buildSuggestionsSql(suggestions);
  const reviewCsv = buildReviewCsv(review);

  if (!options.dryRun) {
    await fs.writeFile(files.resultsJson, `${JSON.stringify(payload, null, 2)}\n`);
    await fs.writeFile(files.acceptedSql, acceptedSql);
    await fs.writeFile(files.suggestionsSql, suggestionsSql);
    await fs.writeFile(files.reviewCsv, reviewCsv);
  }

  console.log('\nSummary');
  console.log(JSON.stringify(payload.summary, null, 2));
  console.log('\nOutput files');
  Object.values(files).forEach((file) => console.log(`- ${path.relative(ROOT, file)}`));
}

function summarize(results) {
  return results.reduce((summary, result) => {
    summary.total += 1;
    summary[result.status] = (summary[result.status] || 0) + 1;
    return summary;
  }, { total: 0 });
}

function buildAcceptedSql(results) {
  if (!results.length) {
    return '-- No high-confidence matches were found.\n';
  }
  return [
    '-- Auto-generated high-confidence venue coordinate inserts.',
    '-- Review before running in Supabase SQL Editor.',
    'begin;',
    ...results.map((result) => sqlForAccepted(result.candidate, result.match)),
    'commit;',
    ''
  ].join('\n\n');
}

function buildSuggestionsSql(results) {
  if (!results.length) return '-- No suggestions were found.\n';
  return [
    '-- Auto-generated QA suggestions. This updates location_qa_candidates only.',
    'begin;',
    ...results.map((result) => sqlForSuggestion(result.candidate, result.match, result.status, result.note)),
    'commit;',
    ''
  ].join('\n\n');
}

function buildReviewCsv(results) {
  const header = [
    'status',
    'score',
    'source',
    'id',
    'venue_name',
    'name',
    'address',
    'city',
    'lat',
    'lng',
    'label',
    'note'
  ];
  const rows = results.map((result) => [
    result.status,
    result.match?.score ?? '',
    result.match?.source || '',
    result.candidate.source_bathroom_id,
    venueName(result.candidate),
    result.candidate.name,
    result.candidate.address,
    result.candidate.city,
    result.match?.lat ?? '',
    result.match?.lng ?? '',
    result.match?.label || '',
    result.note || ''
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function sqlForAccepted(candidate, match) {
  const facilities = unique([...(candidate.facilities || []), 'guest_toilet', 'unverified', 'venue_seed']);
  const vibeTags = unique([...(candidate.vibe_tags || []), 'unverified', 'seed', 'location-verified']);
  const address = candidate.address || match.address || '';
  const source = `${match.source}:${match.source_id || ''}`;
  return `insert into public.bathrooms (
  id, name, venue_name, type, access_mode, access_note, address, city, country, lat, lng,
  is_open_now, facilities, vibe_tags, crowd_level, status, map_x, map_y, added_by,
  moderation_status, created_at, updated_at
) values (
  '${candidate.source_bathroom_id}'::uuid,
  ${sqlString(candidate.name)},
  ${sqlString(candidate.venue_name || venueName(candidate))},
  ${sqlString(candidate.type || 'Other')},
  ${sqlString(candidate.access_mode || 'customer-only')},
  ${sqlString(candidate.access_note)},
  ${sqlString(address || null)},
  ${sqlString(candidate.city || null)},
  ${sqlString(candidate.country || DEFAULTS.country)},
  ${Number(match.lat).toFixed(7)},
  ${Number(match.lng).toFixed(7)},
  true,
  ${sqlArray(facilities)},
  ${sqlArray(vibeTags)},
  ${sqlString(candidate.crowd_level || 'Unverified')},
  'UNUSED',
  ${Number(candidate.map_x || 50).toFixed(2)},
  ${Number(candidate.map_y || 50).toFixed(2)},
  null,
  'unused',
  now(),
  now()
)
on conflict (id) do update set
  name = excluded.name,
  venue_name = excluded.venue_name,
  type = excluded.type,
  access_mode = excluded.access_mode,
  access_note = excluded.access_note,
  address = excluded.address,
  city = excluded.city,
  country = excluded.country,
  lat = excluded.lat,
  lng = excluded.lng,
  is_open_now = excluded.is_open_now,
  facilities = excluded.facilities,
  vibe_tags = excluded.vibe_tags,
  crowd_level = excluded.crowd_level,
  status = excluded.status,
  map_x = excluded.map_x,
  map_y = excluded.map_y,
  moderation_status = excluded.moderation_status,
  updated_at = now()
where bathrooms.added_by is null
  and bathrooms.moderation_status in ('unused', 'pending');

update public.location_qa_candidates
set qa_status = 'inserted',
    qa_lat = ${Number(match.lat).toFixed(7)},
    qa_lng = ${Number(match.lng).toFixed(7)},
    qa_address = ${sqlString(address || match.label || null)},
    qa_source = ${sqlString(source)},
    qa_note = ${sqlString(`score=${match.score}; ${match.label || ''}`)},
    updated_at = now()
where source_bathroom_id = '${candidate.source_bathroom_id}'::uuid;`;
}

function sqlForSuggestion(candidate, match, status, note) {
  const qaStatus = status === 'accepted' ? 'accepted' : 'suggested';
  const source = `${match.source}:${match.source_id || ''}`;
  return `update public.location_qa_candidates
set qa_status = ${sqlString(qaStatus)},
    qa_lat = ${Number(match.lat).toFixed(7)},
    qa_lng = ${Number(match.lng).toFixed(7)},
    qa_address = ${sqlString(match.address || match.label || null)},
    qa_source = ${sqlString(source)},
    qa_note = ${sqlString(`status=${status}; score=${match.score}; ${note || ''} ${match.label || ''}`.trim())},
    updated_at = now()
where source_bathroom_id = '${candidate.source_bathroom_id}'::uuid;`;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function sqlArray(values) {
  return `ARRAY[${unique(values).map(sqlString).join(',')}]::text[]`;
}

function sqlString(value) {
  if (value === null || value === undefined || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function externalHeaders(options) {
  return {
    Accept: 'application/json',
    'User-Agent': options.userAgent || DEFAULTS.userAgent
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
