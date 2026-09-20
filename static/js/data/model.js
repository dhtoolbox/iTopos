import { GROUP_NOT_SPECIFIED, MULTIPLE_GROUPS_SPECIFIED } from "../constants.js";

export function buildDataset(rows, resolvedPlaces, { groupingEnabled = false } = {}) {
  const resolvedById = new Map(resolvedPlaces.map((place) => [normalizeId(place.id), place]));
  const placesById = new Map();

  for (const row of rows) {
    const id = normalizeId(row.id);

    if (!id) {
      continue;
    }

    const resolved = resolvedById.get(id);

    // Invalid/not-found rows remain row-level
    // reporting concerns. They do not become places.
    if (!resolved) {
      continue;
    }

    let place = placesById.get(id);

    if (!place) {
      place = createPlace(id, resolved);
      placesById.set(id, place);
    }

    if (groupingEnabled) {
      addUserGroup(place, row.group);
    }
  }

  const places = [...placesById.values()];

  for (const place of places) {
    place.displayGroup = determineDisplayGroup(place, groupingEnabled);
  }

  return {
    groupingEnabled,
    rows,
    places,
  };
}

function createPlace(id, resolved) {
  const mappable = hasRepresentativePoint(resolved);

  return {
    id,
    title: resolved.title ?? null,
    repr_lat: resolved.repr_lat ?? null,
    repr_lng: resolved.repr_lng ?? null,
    place_types: Array.isArray(resolved.place_types) ? [...resolved.place_types] : [],
    ...(Array.isArray(resolved.place_type_keys) ? { place_type_keys: [...resolved.place_type_keys] } : {}),
    userGroups: [],
    displayGroup: null,
    mappable: mappable,
  };
}

function addUserGroup(place, rawGroup) {
  const group = normalizeUserGroup(rawGroup);

  if (group === null) {
    return;
  }

  if (!place.userGroups.includes(group)) {
    place.userGroups.push(group);
  }
}

export function determineDisplayGroup(place, groupingEnabled) {
  if (!groupingEnabled) {
    return null;
  }

  if (!place.mappable) {
    return null;
  }

  if (place.userGroups.length === 0) {
    return GROUP_NOT_SPECIFIED;
  }

  if (place.userGroups.length > 1) {
    return MULTIPLE_GROUPS_SPECIFIED;
  }

  return place.userGroups[0];
}

export function normalizeUserGroup(value) {
  const group = String(value ?? "").trim();

  return group || null;
}

function hasRepresentativePoint(place) {
  return isFiniteCoordinate(place.repr_lat) && isFiniteCoordinate(place.repr_lng);
}

function isFiniteCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  return Number.isFinite(Number(value));
}

function normalizeId(value) {
  const id = String(value ?? "").trim();

  return id || null;
}

export function compareNaturalNames(a, b) {
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
