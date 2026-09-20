export const DATA_BASE = new URL("../../data/pleiades/", import.meta.url);

/*
 * Keep the important static-data locations visible here.
 * Versioned requests clone these URLs rather than rebuilding
 * their paths elsewhere in the module.
 */
const MANIFEST_URL = new URL("manifest.json", DATA_BASE);
const TYPES_URL = new URL("types.json", DATA_BASE);
const SEARCH_URL = new URL("search.json", DATA_BASE);
const NAMES_URL = new URL("names.json", DATA_BASE);
const TYPE_COUNTS_URL = new URL("type-counts.json", DATA_BASE);
const TEMPORAL_BASE = new URL("temporal/", DATA_BASE);
const PERIODS_URL = new URL("periods.json", TEMPORAL_BASE);
const CONFIDENCES_URL = new URL("confidences.json", TEMPORAL_BASE);
const PERIOD_PLACES_URL = new URL("period-places.json", TEMPORAL_BASE);

const shardPromises = new Map();

let manifestPromise = null;
let typesPromise = null;
let searchPromise = null;
let namesPromise = null;
let typeCountsPromise = null;
let periodsPromise = null;
let confidencesPromise = null;
let periodPlacesPromise = null;
const temporalShardPromises = new Map();

/**
 * @typedef {Object} PleiadesManifest
 * @property {number} format_version
 * @property {string} source
 * @property {string|null} source_url
 * @property {string|null} refreshed_at
 * @property {number} places
 * @property {number} located
 * @property {number} unlocated
 * @property {number} place_types
 * @property {number} type_mappings
 * @property {number} shards
 * @property {number} [search_records]
 * @property {number} [place_names]
 * @property {string[]} [search_schema]
 */

/**
 * @returns {Promise<PleiadesManifest>}
 */
export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchJson(MANIFEST_URL.href, {
      cache: "no-cache",
    });
  }

  return manifestPromise;
}

export async function resolveBatchFromStaticData(ids) {
  const types = await loadTypes();
  const requested = normalizeRequestedIds(ids);
  const shardNames = [...new Set(requested.valid.map((id) => id[0]))];
  const shards = new Map();

  await Promise.all(
    shardNames.map(async (shardName) => {
      const data = await loadShard(shardName);

      shards.set(shardName, data);
    }),
  );

  const places = [];
  const notFound = [];

  for (const id of requested.valid) {
    const shard = shards.get(id[0]);

    const record = shard?.[id];

    if (!record) {
      notFound.push(Number(id));

      continue;
    }

    places.push(decodePlace(id, record, types));
  }

  return {
    places,
    not_found: notFound,
    invalid: requested.invalid,
  };
}

export async function loadPleiadesPlaceTypes() {
  return loadTypes();
}


export function loadPleiadesPlaceNames() {
  if (!namesPromise) {
    namesPromise = loadVersionedJson(NAMES_URL);
  }
  return namesPromise;
}

export function loadPleiadesTypeCounts() {
  if (!typeCountsPromise) {
    typeCountsPromise = loadVersionedJson(TYPE_COUNTS_URL);
  }
  return typeCountsPromise;
}

export function loadPleiadesTimePeriods() {
  if (!periodsPromise) periodsPromise = loadVersionedJson(PERIODS_URL);
  return periodsPromise;
}

export function loadPleiadesConfidences() {
  if (!confidencesPromise) confidencesPromise = loadVersionedJson(CONFIDENCES_URL);
  return confidencesPromise;
}

export function loadPleiadesPeriodPlaces() {
  if (!periodPlacesPromise) periodPlacesPromise = loadVersionedJson(PERIOD_PLACES_URL);
  return periodPlacesPromise;
}

export async function loadPleiadesTemporalPlaces(ids) {
  const requested = normalizeRequestedIds(ids);
  const shardNames = [...new Set(requested.valid.map((id) => id[0]))];
  const shards = new Map();
  await Promise.all(shardNames.map(async (name) => {
    if (!temporalShardPromises.has(name)) {
      temporalShardPromises.set(name, loadVersionedJson(new URL(`${name}.json`, TEMPORAL_BASE)));
    }
    shards.set(name, await temporalShardPromises.get(name));
  }));
  const result = new Map();
  for (const id of requested.valid) {
    const record = shards.get(id[0])?.[id];
    if (record) result.set(id, record);
  }
  return result;
}

export function loadPleiadesSearchCorpus() {
  if (!searchPromise) {
    searchPromise = loadVersionedJson(SEARCH_URL);
  }

  return searchPromise;
}

async function loadTypes() {
  if (!typesPromise) {
    typesPromise = loadVersionedJson(TYPES_URL);
  }

  return typesPromise;
}

async function loadVersionedJson(baseUrl) {
  const url = await versionedDataUrl(baseUrl);
  return fetchJson(url);
}

/**
 * Return a cache-versioned copy of a static-data URL.
 *
 * The original URL constant is never modified.
 *
 * @param {URL} baseUrl
 * @returns {Promise<string>}
 */
async function versionedDataUrl(baseUrl) {
  const manifest = await loadManifest();

  const url = new URL(baseUrl.href);

  if (manifest.refreshed_at) {
    url.searchParams.set("v", manifest.refreshed_at);
  }

  return url.href;
}

async function loadShard(name) {
  if (!shardPromises.has(name)) {
    shardPromises.set(
      name,
      (async () => {
        const shardUrl = new URL(`${name}.json`, DATA_BASE);

        const url = await versionedDataUrl(shardUrl);

        return fetchJson(url);
      })(),
    );
  }

  return shardPromises.get(name);
}

function normalizeNumericId(text) {
  return text.replace(/^0+(?=\d)/, "");
}

export function normalizeRequestedIds(ids) {
  const valid = [];
  const invalid = [];
  const seen = new Set();

  for (const rawId of ids) {
    const text = String(rawId ?? "").trim();

    if (!/^\d+$/.test(text)) {
      invalid.push(rawId);
      continue;
    }

    const normalized = normalizeNumericId(text);

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    valid.push(normalized);
  }

  return {
    valid,
    invalid,
  };
}

export function decodePlace(id, record, types) {
  const [title, reprLat, reprLong, typeIndexes] = record;

  const placeTypeRecords = typeIndexes.map((index) => {
    const typeRecord = types[index];
    if (!Array.isArray(typeRecord) || typeRecord.length < 2) {
      throw new Error(`Unknown feature-category index ${index} for Pleiades ${id}.`);
    }
    return typeRecord;
  });

  return {
    id: Number(id),
    title,
    repr_lat: reprLat,
    repr_lng: reprLong,
    place_types: placeTypeRecords.map(([, term]) => term),
    place_type_keys: placeTypeRecords.map(([key]) => key),
  };
}

async function fetchJson(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(`Could not load static Pleiades data: ${url}`);
  }

  if (!response.ok) {
    throw new Error(`Could not load static Pleiades data: ` + `${url} (${response.status})`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`Static Pleiades data is invalid JSON: ${url}`);
  }
}
