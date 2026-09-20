import { mapStyle } from "./js/map/map-style.js";
import {
  ATTRIBUTION,
  DEFAULT_MARKER_COLOR,
  PLACES_ICON_BASE,
  PLACES_ICONS,
  THEME_COLORS,
} from "./js/constants.js";
import { buildMapMarkers, getRepresentativePoint } from "./js/map/markers.js";
import { buildMarkerStyles } from "./js/map/marker-styles.js";
import { showCoincidentPopup, showPlacePopup } from "./js/widgets/place-popup.js";
import { initializeBasemapControls } from "./js/basemaps/controls.js";

export let map = null;
export let mapLoaded = false;

let markerStyles = new Map();
let homeCoordinates = [];

let currentPlaces = [];
let currentGroupingEnabled = false;
let highlightedPlaceIds = new Set();
let temporalPlaceEvidence = new Map();
let temporalModeActive = false;
let clusteringEnabled = true;
let clusterToggleButton = null;

const MAP_MAX_ZOOM = 14;
const CLUSTER_MAX_ZOOM = 10;
const COINCIDENT_MARKER_MIN_ZOOM = CLUSTER_MAX_ZOOM + 1;

export function loadDataset(dataset) {
  markerStyles = buildMarkerStyles(dataset);

  if (map && mapLoaded) {
    map.jumpTo({
      center: [40, 35],
      zoom: 3,
    });
  }

  renderPlaces(dataset.places, dataset.groupingEnabled);
}

export function renderPlaces(places, groupingEnabled) {
  if (!map || !mapLoaded) {
    return;
  }

  currentPlaces = places;
  currentGroupingEnabled = groupingEnabled;
  highlightedPlaceIds.clear();

  const markers = buildCurrentMarkers();

  updatePlaceSources(markers);

  const specialVisibility = groupingEnabled ? "visible" : "none";

  for (const layerId of [
    "places-points-special-outer",
    "places-points-special-core",
    "places-points-special-symbol",
  ]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", specialVisibility);
    }
  }

  homeCoordinates = markers.coordinates.slice();
  fitDatasetCoordinates(markers.coordinates);
}

function buildCurrentMarkers() {
  const getTemporal = (place) => temporalPlaceEvidence.get(String(place.id)) ?? null;
  const markers = currentGroupingEnabled
    ? buildMapMarkers(
        currentPlaces,
        (place) =>
          markerStyles.get(place.displayGroup) ?? {
            kind: "default",
            color: DEFAULT_MARKER_COLOR,
          },
        getTemporal,
      )
    : buildMapMarkers(currentPlaces, undefined, getTemporal);

  applyHighlightProperties(markers);
  const temporalMode = temporalModeActive ? 1 : 0;
  for (const feature of markers.points) feature.properties.temporal_mode = temporalMode;
  for (const feature of markers.coincidentPoints) feature.properties.temporal_mode = temporalMode;

  return markers;
}

function applyHighlightProperties(markers) {
  for (const feature of markers.points) {
    feature.properties.highlighted = highlightedPlaceIds.has(
      String(feature.properties.pleiades_id),
    );
  }

  for (const feature of markers.coincidentPoints) {
    const rawCoincidentPlaces = feature.properties.coincident_places ?? "[]";

    let coincidentPlaces = [];

    if (Array.isArray(rawCoincidentPlaces)) {
      coincidentPlaces = rawCoincidentPlaces;
    } else if (typeof rawCoincidentPlaces === "string") {
      try {
        coincidentPlaces = JSON.parse(rawCoincidentPlaces);
      } catch {
        coincidentPlaces = [];
      }
    }

    feature.properties.highlighted_count = coincidentPlaces.reduce(
      (count, place) => count + (highlightedPlaceIds.has(String(place.id)) ? 1 : 0),
      0,
    );
  }
}

function updatePlaceSources(markers) {
  map.getSource("places")?.setData({
    type: "FeatureCollection",
    features: markers.points,
  });

  map.getSource("coincident-places")?.setData({
    type: "FeatureCollection",
    features: markers.coincidentPoints,
  });
}

function refreshPlaceSources() {
  if (!map || !mapLoaded) {
    return;
  }

  updatePlaceSources(buildCurrentMarkers());
}

export function setTemporalPlaceEvidence(placeEvidence) {
  temporalPlaceEvidence = placeEvidence instanceof Map ? placeEvidence : new Map();
  temporalModeActive = temporalPlaceEvidence.size > 0;
  refreshPlaceSources();
}

export function clearPlacePopups() {
  document.querySelectorAll(".maplibregl-popup").forEach((popup) => popup.remove());
}

function deduplicateCoordinates(coordinates) {
  return [
    ...new Map(
      coordinates.map((coordinate) => [`${coordinate[0]},${coordinate[1]}`, coordinate]),
    ).values(),
  ];
}

function fitDatasetCoordinates(coordinates) {
  if (!map || coordinates.length === 0) {
    return;
  }

  const uniqueCoordinates = deduplicateCoordinates(coordinates);

  if (uniqueCoordinates.length === 1) {
    map.easeTo({
      center: uniqueCoordinates[0],
      zoom: 5,
      duration: 800,
      essential: true,
    });

    return;
  }

  const bounds = new maplibregl.LngLatBounds();

  for (const coordinate of uniqueCoordinates) {
    bounds.extend(coordinate);
  }

  map.fitBounds(bounds, {
    padding: {
      top: 120,
      bottom: 80,
      left: 120,
      right: 80,
    },
    maxZoom: 5,
    duration: 800,
    essential: true,
  });
}

function focusCoordinates(coordinates) {
  if (!map || coordinates.length === 0) {
    return;
  }

  const uniqueCoordinates = deduplicateCoordinates(coordinates);

  if (uniqueCoordinates.length === 1) {
    map.easeTo({
      center: uniqueCoordinates[0],

      zoom: Math.max(map.getZoom(), COINCIDENT_MARKER_MIN_ZOOM),

      duration: 800,
      essential: true,
    });

    return;
  }

  const bounds = new maplibregl.LngLatBounds();

  for (const coordinate of uniqueCoordinates) {
    bounds.extend(coordinate);
  }

  map.fitBounds(bounds, {
    padding: {
      top: 120,
      bottom: 80,
      left: 120,
      right: 80,
    },
    maxZoom: 5,
    duration: 800,
    essential: true,
  });
}

export function focusPlaces(places) {
  if (!map || !mapLoaded || places.length === 0) {
    clearPlaceHighlight();
    return;
  }

  highlightPlaces(places);

  focusCoordinates(getPlaceCoordinates(places));
}

export function getPlaceCoordinates(places) {
  return places
    .filter((place) => place.mappable)
    .map(getRepresentativePoint)
    .filter(Boolean);
}

export function highlightPlaces(places) {
  if (!map || !mapLoaded) {
    return;
  }

  highlightedPlaceIds = new Set(
    places.filter((place) => place.mappable).map((place) => String(place.id)),
  );

  refreshPlaceSources();
}

export function clearPlaceHighlight() {
  if (!map || !mapLoaded || highlightedPlaceIds.size === 0) {
    return;
  }

  highlightedPlaceIds.clear();

  refreshPlaceSources();
}

async function registerPlaceIcons() {
  if (!map) {
    return;
  }

  await Promise.all(
    PLACES_ICONS.map(
      (icon) =>
        new Promise((resolve) => {
          if (map.hasImage(icon.id)) {
            resolve();
            return;
          }

          const image = new Image();

          image.onload = () => {
            try {
              if (!map.hasImage(icon.id)) {
                map.addImage(icon.id, image, {
                  pixelRatio: 2,
                });
              }
            } catch (error) {
              console.warn(`Could not register place icon ${icon.id}:`, error);
            }

            resolve();
          };

          image.onerror = () => {
            console.warn(`Could not load place icon ${icon.id}: ${icon.file}`);

            resolve();
          };

          image.src = new URL(icon.file, PLACES_ICON_BASE).href;
        }),
    ),
  );
}

function createHomeControl() {
  return {
    onAdd() {
      const container = document.createElement("div");
      container.className = "maplibregl-ctrl maplibregl-ctrl-group";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-nav-icon";
      button.title = "Return to map extent";
      button.setAttribute("aria-label", "Return to map extent");

      const icon = document.createElement("img");
      icon.src = "./static/map-nav-home.svg";
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");

      button.append(icon);
      button.addEventListener("click", () => {
        if (homeCoordinates.length > 0) {
          fitDatasetCoordinates(homeCoordinates);

          return;
        }

        map.easeTo({
          center: [40, 35],
          zoom: 3,
          duration: 700,
          essential: true,
        });
      });

      container.append(button);
      this._container = container;

      return container;
    },

    onRemove() {
      this._container?.remove();
      this._container = null;
    },
  };
}

function initializeMap() {
  if (typeof maplibregl === "undefined" || typeof pmtiles === "undefined") {
    setTimeout(initializeMap, 30);

    return;
  }

  const protocol = new pmtiles.Protocol();

  maplibregl.addProtocol("pmtiles", protocol.tile);

  map = new maplibregl.Map({
    container: "map",
    attributionControl: false,
    zoomRate: 1,
    wheelZoomRate: 1,
    inertiaLinearity: 0,
    style: mapStyle,
    center: [40, 35],
    zoom: 3,
    maxZoom: MAP_MAX_ZOOM,
    fillLargeMeshArrays: true,
  });

  map.addControl(
    new maplibregl.AttributionControl({
      customAttribution: ATTRIBUTION,
      compact: true,
    }),
    "bottom-right",
  );
  map.addControl(
    new maplibregl.NavigationControl({
      showCompass: false,
      showZoom: true,
      pitchWithRotate: false,
    }),
    "top-right",
  );
  map.addControl(createHomeControl(), "top-right");
  map.addControl(createClusterToggleControl(), "top-right");
  map.addControl(
    new maplibregl.ScaleControl({
      maxWidth: 120,
      unit: "metric",
    }),
    "bottom-left",
  );

  map.on("load", () => {
    window.map = map;
    window.mapLoaded = true;

    mapLoaded = true;

    addPlaceSources();
    addHighlightLayers();
    addClusterLayers();
    addCoincidentLayers();
    addPointLayers();
    addTemporalCountLayers();
    addPlaceInteractions();

    initializeBasemapControls(map);

    window.dispatchEvent(new Event("app:map-ready"));
  });
}

function addPlaceSources() {
  addPlacesSource();
  map.addSource("coincident-places", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}

function addPlacesSource() {
  const options = {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    maxzoom: MAP_MAX_ZOOM,
  };

  if (clusteringEnabled) {
    Object.assign(options, {
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: 60,
      clusterProperties: {
        place_count: ["+", ["get", "place_count"]],
        highlighted_count: ["+", ["case", ["==", ["get", "highlighted"], true], 1, 0]],
        active_place_count: ["+", ["get", "active_place_count"]],
        active_locations: ["+", ["get", "active_locations"]],
        active_names: ["+", ["get", "active_names"]],
        temporal_mode_count: ["+", ["get", "temporal_mode"]],
      },
    });
  }

  map.addSource("places", options);
}

const PLACE_SOURCE_LAYER_IDS = [
  "place-highlight-clusters-outer",
  "place-highlights",
  "place-clusters-outer",
  "place-clusters-core",
  "place-cluster-count-symbol",
  "places-points",
  "places-points-special-outer",
  "places-points-special-core",
  "places-points-special-symbol",
  "places-temporal-location-count",
  "places-temporal-name-count",
];

function rebuildPlacesSource() {
  if (!map || !mapLoaded) return;
  for (const layerId of PLACE_SOURCE_LAYER_IDS) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  if (map.getSource("places")) map.removeSource("places");
  addPlacesSource();
  addHighlightLayers();
  addClusterLayers();
  addPointLayers();
  addTemporalCountLayers();
  const specialVisibility = currentGroupingEnabled ? "visible" : "none";
  for (const layerId of [
    "places-points-special-outer",
    "places-points-special-core",
    "places-points-special-symbol",
  ]) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", specialVisibility);
  }
  const coincidentMinZoom = clusteringEnabled ? COINCIDENT_MARKER_MIN_ZOOM : 0;
  for (const layerId of [
    "places-coincident-outer",
    "places-coincident-core",
    "places-coincident-highlight",
    "places-coincident-symbol",
  ]) {
    if (map.getLayer(layerId)) map.setLayerZoomRange(layerId, coincidentMinZoom, MAP_MAX_ZOOM + 1);
  }
  refreshPlaceSources();
}

function clusterToggleIcon(clustered) {
  const icon = document.createElement("img");
  icon.src = clustered ? "./static/map-nav-cluster.svg" : "./static/map-nav-points.svg";
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");
  return icon.outerHTML;
}

function updateClusterToggleControl() {
  if (!clusterToggleButton) return;

  clusterToggleButton.innerHTML = clusterToggleIcon(clusteringEnabled);
  const action = clusteringEnabled ? "Show individual Places" : "Cluster Places";
  const guidance = clusteringEnabled
    ? "Recommended for smaller datasets; large datasets may render slowly."
    : "Recommended for large datasets and overview maps.";
  clusterToggleButton.title = `${action}. ${guidance}`;
  clusterToggleButton.setAttribute("aria-label", `${action}. ${guidance}`);
  clusterToggleButton.classList.add("map-nav-icon");
  clusterToggleButton.classList.toggle("is-unclustered", !clusteringEnabled);
}

function createClusterToggleControl() {
  return {
    onAdd() {
      const container = document.createElement("div");
      container.className = "maplibregl-ctrl maplibregl-ctrl-group";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "place-cluster-toggle";
      button.addEventListener("click", () => {
        clusteringEnabled = !clusteringEnabled;
        updateClusterToggleControl();
        rebuildPlacesSource();
      });
      clusterToggleButton = button;
      updateClusterToggleControl();
      container.append(button);
      this._container = container;
      return container;
    },
    onRemove() {
      this._container?.remove();
      this._container = null;
      if (clusterToggleButton?.isConnected === false) clusterToggleButton = null;
    },
  };
}

const CLUSTER_TEXT_SIZE = 12;
const CLUSTER_BASE_CIRCLE_RADIUS = 17;
const CLUSTER_OUTER_CIRCLE_RADIUS = CLUSTER_BASE_CIRCLE_RADIUS + 2;
const CLUSTER_RADIUS_EXPRESSION = [
  "step",
  ["get", "place_count"],
  15,
  10,
  17,
  100,
  23,
  1000,
  23,
  10000,
  27,
];
const CLUSTER_OUTER_RADIUS_EXPRESSION = ["+", CLUSTER_RADIUS_EXPRESSION, 2];
const CLUSTER_CIRCLE_STROKE_WIDTH = 1;

const PLACE_TEXT_SIZE = 12;
const PLACE_BASE_CIRCLE_RADIUS = 7;
const PLACE_OUTER_CIRCLE_RADIUS = PLACE_BASE_CIRCLE_RADIUS + 2;
const PLACE_CIRCLE_STROKE_WIDTH = 1.5;

const HIGHLIGHT_STROKE_WIDTH = CLUSTER_CIRCLE_STROKE_WIDTH + 1;
const HIGHLIGHT_RADIUS = CLUSTER_OUTER_CIRCLE_RADIUS + HIGHLIGHT_STROKE_WIDTH;

const OPACITY_TEMPORAL_INACTIVE = 0.2;

function addHighlightLayers() {
  map.addLayer({
    id: "place-highlight-clusters-outer",
    type: "circle",
    source: "places",
    filter: ["all", ["has", "point_count"], [">", ["get", "highlighted_count"], 0]],
    maxzoom: COINCIDENT_MARKER_MIN_ZOOM,
    paint: {
      "circle-radius": ["+", CLUSTER_RADIUS_EXPRESSION, 4],
      "circle-color": "transparent",
      "circle-stroke-width": HIGHLIGHT_STROKE_WIDTH,
      "circle-stroke-color": THEME_COLORS.CIRCLE_STROKE_HIGHLIGHT,
    },
  });

  map.addLayer({
    id: "place-highlights",
    type: "circle",
    source: "places",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "highlighted"], true],
      ["!=", ["get", "coincident"], true],
    ],
    paint: {
      "circle-radius": HIGHLIGHT_RADIUS,
      "circle-color": "transparent",
      "circle-stroke-width": HIGHLIGHT_STROKE_WIDTH,
      "circle-stroke-color": THEME_COLORS.CIRCLE_STROKE_HIGHLIGHT,
    },
  });
}

function abbreviateCountExpression(property) {
  return [
    "case",
    [">=", ["get", property], 1000],
    ["concat", ["to-string", ["floor", ["/", ["get", property], 1000]]], "k"],
    ["to-string", ["get", property]],
  ];
}

const clusterOpacity = [
  "case",
  ["==", ["get", "temporal_mode_count"], 0],
  1,
  [">", ["get", "active_place_count"], 0],
  1,
  OPACITY_TEMPORAL_INACTIVE,
];

function addClusterLayers() {
  map.addLayer({
    id: "place-clusters-outer",
    type: "circle",
    source: "places",
    filter: ["has", "point_count"],
    maxzoom: COINCIDENT_MARKER_MIN_ZOOM,
    paint: {
      "circle-radius": CLUSTER_OUTER_RADIUS_EXPRESSION,
      "circle-color": DEFAULT_MARKER_COLOR,
      "circle-opacity": clusterOpacity,
    },
  });

  // Retain this layer id as a transparent hit target so existing click/hover
  // behavior does not depend on the exact painted pixels of the pin image.
  map.addLayer({
    id: "place-clusters-core",
    type: "circle",
    source: "places",
    filter: ["has", "point_count"],
    maxzoom: COINCIDENT_MARKER_MIN_ZOOM,
    paint: {
      "circle-radius": CLUSTER_RADIUS_EXPRESSION,
      "circle-color": "transparent",
      "circle-stroke-color": THEME_COLORS.CIRCLE_STROKE,
      "circle-stroke-width": CLUSTER_CIRCLE_STROKE_WIDTH,
      "circle-opacity": clusterOpacity,
    },
  });

  map.addLayer({
    id: "place-cluster-count-symbol",
    type: "symbol",
    source: "places",
    filter: ["has", "point_count"],
    maxzoom: COINCIDENT_MARKER_MIN_ZOOM,
    layout: {
      "text-field": [
        "case",
        [">", ["get", "temporal_mode_count"], 0],
        [
          "concat",
          abbreviateCountExpression("active_place_count"),
          "/",
          abbreviateCountExpression("place_count"),
        ],
        abbreviateCountExpression("place_count"),
      ],
      "text-size": CLUSTER_TEXT_SIZE,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": THEME_COLORS.SYMBOL_TEXT,
      "text-halo-color": THEME_COLORS.HALO,
      "text-halo-width": 0.1,
    },
  });
}

const placeOpacity = [
  "case",
  ["==", ["get", "temporal_mode"], 0],
  1,
  ["==", ["get", "temporal_active"], true],
  1,
  OPACITY_TEMPORAL_INACTIVE,
];
function addCoincidentLayers() {
  map.addLayer({
    id: "places-coincident-outer",
    type: "circle",
    source: "coincident-places",
    minzoom: COINCIDENT_MARKER_MIN_ZOOM,
    paint: {
      "circle-radius": PLACE_OUTER_CIRCLE_RADIUS,
      "circle-color": DEFAULT_MARKER_COLOR,
      "circle-opacity": placeOpacity,
    },
  });

  map.addLayer({
    id: "places-coincident-core",
    type: "circle",
    source: "coincident-places",
    minzoom: COINCIDENT_MARKER_MIN_ZOOM,
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "temporal_active"], true],
        PLACE_BASE_CIRCLE_RADIUS + 2,
        PLACE_BASE_CIRCLE_RADIUS,
      ],
      "circle-color": "transparent",
      "circle-opacity": placeOpacity,
      "circle-stroke-color": THEME_COLORS.CIRCLE_STROKE,
      "circle-stroke-width": PLACE_CIRCLE_STROKE_WIDTH,
    },
  });

  map.addLayer({
    id: "places-coincident-highlight",
    type: "circle",
    source: "coincident-places",
    minzoom: COINCIDENT_MARKER_MIN_ZOOM,
    filter: [">", ["get", "highlighted_count"], 0],
    paint: {
      "circle-radius": HIGHLIGHT_RADIUS,
      "circle-color": "transparent",
      "circle-stroke-width": HIGHLIGHT_STROKE_WIDTH,
      "circle-stroke-color": THEME_COLORS.CIRCLE_STROKE_HIGHLIGHT,
    },
  });

  map.addLayer({
    id: "places-coincident-symbol",
    type: "symbol",
    source: "coincident-places",
    minzoom: COINCIDENT_MARKER_MIN_ZOOM,
    layout: {
      "text-field": "+",
      "text-size": PLACE_TEXT_SIZE,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": THEME_COLORS.SYMBOL_TEXT,
      "text-halo-color": THEME_COLORS.HALO,
      "text-halo-width": 0.1,
    },
  });
}

function addPointLayers() {
  map.addLayer({
    id: "places-points",
    type: "circle",
    source: "places",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["!=", ["get", "coincident"], true],
      ["match", ["get", "marker_kind"], ["default", "group"], true, false],
    ],
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "temporal_active"], true],
        PLACE_BASE_CIRCLE_RADIUS + 2,
        PLACE_BASE_CIRCLE_RADIUS,
      ],
      "circle-color": ["get", "color"],
      "circle-opacity": placeOpacity,
      "circle-stroke-color": THEME_COLORS.CIRCLE_STROKE,
      "circle-stroke-width": PLACE_CIRCLE_STROKE_WIDTH,
    },
  });

  const specialFilter = [
    "all",
    ["!", ["has", "point_count"]],
    ["!=", ["get", "coincident"], true],
    ["match", ["get", "marker_kind"], ["unspecified", "multiple"], true, false],
  ];

  map.addLayer({
    id: "places-points-special-outer",
    type: "circle",
    source: "places",
    filter: specialFilter,
    paint: {
      "circle-radius": PLACE_OUTER_CIRCLE_RADIUS,
      "circle-color": DEFAULT_MARKER_COLOR,
    },
  });

  map.addLayer({
    id: "places-points-special-core",
    type: "circle",
    source: "places",
    filter: specialFilter,
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "temporal_active"], true],
        PLACE_BASE_CIRCLE_RADIUS + 2,
        PLACE_BASE_CIRCLE_RADIUS,
      ],
      "circle-color": ["get", "color"],
      "circle-opacity": placeOpacity,
      "circle-stroke-color": THEME_COLORS.CIRCLE_STROKE,
      "circle-stroke-width": PLACE_CIRCLE_STROKE_WIDTH,
    },
  });

  map.addLayer({
    id: "places-points-special-symbol",
    type: "symbol",
    source: "places",
    filter: specialFilter,
    layout: {
      "text-field": ["case", ["==", ["get", "marker_kind"], "unspecified"], "?", "#"],
      "text-size": PLACE_TEXT_SIZE,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },

    paint: {
      "text-color": THEME_COLORS.SYMBOL_TEXT,
      "text-halo-color": THEME_COLORS.HALO,
      "text-halo-width": 0.1,
    },
  });
}

// Prevent ugly count tails when dataset is large
const LARGE_UNCLUSTERED_DATASET = 2000;
const LARGE_DATASET_COUNT_MIN_ZOOM = 6;

function temporalCountMinZoom() {
  return !clusteringEnabled && currentPlaces.length > LARGE_UNCLUSTERED_DATASET
    ? LARGE_DATASET_COUNT_MIN_ZOOM
    : 0;
}

function addTemporalCountLayers() {
  const activeFilter = [
    "all",
    ["!", ["has", "point_count"]],
    ["!=", ["get", "coincident"], true],
    ["==", ["get", "temporal_active"], true],
  ];

  map.addLayer({
    id: "places-temporal-location-count",
    type: "symbol",
    source: "places",
    filter: activeFilter,
    minzoom: temporalCountMinZoom(),
    layout: {
      "text-field": [
        "case",
        [">", ["get", "active_locations"], 0],
        ["to-string", ["get", "active_locations"]],
        "",
      ],
      "text-size": 10,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-offset": [
        "case",
        ["match", ["get", "marker_kind"], ["unspecified", "multiple"], true, false],
        ["literal", [-0.65, -0.7]],
        ["literal", [0, 0]],
      ],
    },
    paint: {
      "text-color": [
        "case",
        ["match", ["get", "marker_kind"], ["unspecified", "multiple"], true, false],
        THEME_COLORS.TEXT,
        THEME_COLORS.SYMBOL_TEXT,
      ],
      "text-halo-color": THEME_COLORS.HALO,
      "text-halo-width": 0.6,
    },
  });

  map.addLayer({
    id: "places-temporal-name-count",
    type: "symbol",
    source: "places",
    filter: activeFilter,
    minzoom: temporalCountMinZoom(),
    layout: {
      "text-field": [
        "case",
        [">", ["get", "active_names"], 0],
        ["to-string", ["get", "active_names"]],
        "",
      ],
      "text-size": 8.5,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-offset": [0.65, -0.7],
    },
    paint: {
      "text-color": THEME_COLORS.TEXT,
      "text-halo-color": THEME_COLORS.HALO,
      "text-halo-width": 1.5,
    },
  });
}

function addPlaceInteractions() {
  const expandCluster = async (feature) => {
    const source = map.getSource("places");
    const clusterId = feature.properties.cluster_id;

    try {
      const pointCount = Number(feature.properties.point_count) || 0;
      const leaves = await source.getClusterLeaves(clusterId, pointCount, 0);
      const firstCoordinate = leaves[0]?.geometry?.coordinates;
      const isFullyCoincident =
        firstCoordinate &&
        leaves.length === pointCount &&
        leaves.every(
          ({ geometry }) =>
            geometry?.coordinates?.[0] === firstCoordinate[0] &&
            geometry?.coordinates?.[1] === firstCoordinate[1],
        );
      const zoom = isFullyCoincident
        ? COINCIDENT_MARKER_MIN_ZOOM
        : await source.getClusterExpansionZoom(clusterId);

      map.easeTo({
        center: feature.geometry.coordinates,
        zoom: Math.min(zoom, MAP_MAX_ZOOM),
        duration: 700,
      });
    } catch (error) {
      console.warn("Could not expand place cluster:", error);
    }
  };

  map.on("click", async (event) => {
    const [feature] = map.queryRenderedFeatures(event.point, {
      layers: ["place-clusters-core", "place-cluster-count-symbol"],
    });

    if (feature) {
      await expandCluster(feature);
    }
  });

  for (const layerId of [
    "place-clusters-core",
    "place-cluster-count-symbol",
    "places-coincident-core",
    "places-coincident-symbol",
  ]) {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  }

  map.on("click", "places-coincident-core", (event) => showCoincidentPopup(event, map, maplibregl));

  const placePointLayers = [
    "places-points",
    "places-points-special-core",
    "places-points-special-symbol",
    "places-temporal-location-count",
    "places-temporal-name-count",
  ];

  for (const layerId of placePointLayers) {
    map.on("click", layerId, (event) => showPlacePopup(event, map, maplibregl));

    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

window.setTimeout(initializeMap, 0);
