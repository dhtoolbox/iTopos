import { GROUP_NOT_SPECIFIED } from "../constants.js";

function matchesGroupFilter(place, activeGroups) {
  if (place.userGroups.length === 0) {
    return activeGroups.has(GROUP_NOT_SPECIFIED);
  }

  return place.userGroups.some((group) => activeGroups.has(group));
}

function matchesTypeFilter(place, activeTypes) {
  if (activeTypes === null) {
    return true;
  }

  const placeTypes = normalizePlaceTypes(place.place_types);

  return placeTypes.some((type) => activeTypes.has(type));
}

export function getAvailableGroups(dataset) {
  if (!dataset.groupingEnabled) {
    return [];
  }

  const groups = new Set();
  let hasUnspecified = false;

  for (const place of dataset.places) {
    if (!place.mappable) {
      continue;
    }

    if (place.userGroups.length === 0) {
      hasUnspecified = true;
      continue;
    }

    for (const group of place.userGroups) {
      groups.add(group);
    }
  }

  const result = [...groups];

  if (hasUnspecified) {
    result.push(GROUP_NOT_SPECIFIED);
  }

  return result;
}

export function getAvailableTypes(places, { groupingEnabled, activeGroups }) {
  const groupFiltered = filterPlaces(places, {
    groupingEnabled,
    activeGroups,
    activeTypes: null,
  });

  const types = new Set();

  for (const place of groupFiltered) {
    for (const type of normalizePlaceTypes(place.place_types)) {
      types.add(type);
    }
  }

  return [...types];
}

export function filterPlaces(places, { groupingEnabled, activeGroups, activeTypes }) {
  const groups = new Set(activeGroups);
  const types = activeTypes === null ? null : new Set(activeTypes);

  return places.filter((place) => {
    if (groupingEnabled && !matchesGroupFilter(place, groups)) {
      return false;
    }

    if (!matchesTypeFilter(place, types)) {
      return false;
    }

    return true;
  });
}

export function normalizePlaceTypes(value) {
  if (Array.isArray(value)) {
    return value.map((type) => String(type ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.map((type) => String(type ?? "").trim()).filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  return [];
}
