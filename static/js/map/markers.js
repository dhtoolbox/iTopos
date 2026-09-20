import { DEFAULT_MARKER_COLOR } from "../constants.js";

export function buildMapMarkers(
  places,
  getStyle = () => ({
    kind: "default",
    color: DEFAULT_MARKER_COLOR,
  }),
  getTemporal = () => null,
) {
  const coordinates = [];
  const entries = [];
  const byCoordinate = new Map();

  for (const place of places) {
    if (!place.mappable) continue;

    const coordinate = getRepresentativePoint(place);
    if (!coordinate) continue;

    const style = getStyle(place) || {
      kind: "default",
      color: DEFAULT_MARKER_COLOR,
    };

    const temporal = getTemporal(place) || null;

    const entry = {
      coordinate,
      member: {
        id: place.id,
        title: place.title,
        displayGroup: place.displayGroup,
        userGroups: place.userGroups ?? [],
        placeTypes: place.place_types ?? [],
        ...(Array.isArray(place.place_type_keys) ? { placeTypeKeys: place.place_type_keys } : {}),
        color: style.color ?? DEFAULT_MARKER_COLOR,
        markerKind: style.kind ?? "default",
        reprLat: Number(place.repr_lat),
        reprLng: Number(place.repr_lng),
        temporalActive: Boolean(temporal?.active),
        activeLocations: Number(temporal?.activeLocations ?? 0),
        activeNames: Number(temporal?.activeNames ?? 0),
      },
    };

    const key = coordinateKey(coordinate);
    const group = byCoordinate.get(key);
    if (group) group.push(entry);
    else byCoordinate.set(key, [entry]);

    entries.push(entry);
    coordinates.push(coordinate);
  }

  const coincidentKeys = new Set(
    [...byCoordinate.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([key]) => key),
  );

  const points = entries.map(({ coordinate, member }) => ({
    type: "Feature",
    id: String(member.id),
    geometry: { type: "Point", coordinates: coordinate },
    properties: {
      pleiades_id: member.id,
      title: member.title,
      display_group: member.displayGroup,
      user_groups: member.userGroups,
      marker_kind: member.markerKind,
      color: member.color,
      place_types: member.placeTypes,
      ...(member.placeTypeKeys ? { place_type_keys: member.placeTypeKeys } : {}),
      place_count: 1,
      coincident: coincidentKeys.has(coordinateKey(coordinate)),
      repr_lat: member.reprLat,
      repr_lng: member.reprLng,
      temporal_active: member.temporalActive,
      active_locations: member.activeLocations,
      active_names: member.activeNames,
      active_place_count: member.temporalActive ? 1 : 0,
    },
  }));

  const coincidentPoints = [...byCoordinate.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const coordinate = group[0].coordinate;
      const members = group.map(({ member }) => member);

      return {
        type: "Feature",
        id: `coincident:${coordinateKey(coordinate)}`,
        geometry: { type: "Point", coordinates: coordinate },
        properties: {
          color: DEFAULT_MARKER_COLOR,
          place_count: members.length,
          coincident_places: JSON.stringify(members),
          temporal_active: members.some((member) => member.temporalActive),
          active_place_count: members.filter((member) => member.temporalActive).length,
          active_locations: members.reduce((sum, member) => sum + member.activeLocations, 0),
          active_names: members.reduce((sum, member) => sum + member.activeNames, 0),
        },
      };
    });

  return { points, coincidentPoints, coordinates };
}

export function buildHighlightMarkers(places) {
  const byCoordinate = new Map();

  for (const place of places) {
    if (!place.mappable) continue;

    const coordinate = getRepresentativePoint(place);
    if (!coordinate) continue;

    const key = coordinateKey(coordinate);
    const existing = byCoordinate.get(key);

    if (existing) {
      existing.properties.place_count += 1;
      continue;
    }

    byCoordinate.set(key, {
      type: "Feature",
      geometry: { type: "Point", coordinates: coordinate },
      properties: {
        place_count: 1,
      },
    });
  }

  return [...byCoordinate.values()];
}

export function getRepresentativePoint(place) {
  const lat = toFiniteNumber(place.repr_lat);
  const lng = toFiniteNumber(place.repr_lng);

  if (lat === null || lng === null) return null;
  return [lng, lat];
}

function coordinateKey(coordinate) {
  return `${coordinate[0]}\u0000${coordinate[1]}`;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
