export const APP_BASE = new URL("../", import.meta.url);
export const MAP_BASE = new URL("map/", APP_BASE);
export const FONT_BASE = new URL("vendor/fonts/", APP_BASE);
export const ICON_BASE = new URL("vendor/icons/", APP_BASE);
export const PLACES_ICON_BASE = new URL("places/", ICON_BASE);

// Keep in sync with --color-primary.
export const SITE_PRIMARY = "#059669";
export const SITE_SECONDARY = "#28415a";

export const THEME_COLORS = {
  LAND: "#f7f5ee",
  INLAND_WATER: "#b3def2",
  OCEAN: "#d2effc",
  COUNTRY_BORDER: "#bbbab5",
  TEXT: "#4a4945",
  SYMBOL_TEXT: "#ffffff",
  HALO: "#ffffff",
  CIRCLE_STROKE: "#ffffff",
  CIRCLE_STROKE_HIGHLIGHT: "#111",
};

export const DEFAULT_MARKER_COLOR = SITE_PRIMARY;
export const SPECIAL_MARKER_COLOR = SITE_PRIMARY;

export const RESERVED_COLORS = [
  SITE_PRIMARY,
  SITE_SECONDARY,
  SPECIAL_MARKER_COLOR,
  DEFAULT_MARKER_COLOR,
  ...Object.values(THEME_COLORS),
];

export const GROUP_NOT_SPECIFIED = "[ Group not specified ]";
export const NOT_SPECIFIED = "[ not specified ]";
export const MULTIPLE_GROUPS_SPECIFIED = "[ Multiple groups specified ]";

export const PLACES_ICONS = [
  { id: "castle", file: "fort-awesome-brands-solid.svg" },
];

export const ATTRIBUTION = `
    Data: 
    <a href="https://pleiades.stoa.org/" target="_blank">Pleiades</a>
    ·
    <a href="https://awmc.unc.edu/" target="_blank">AWMC</a> (<a href="https://opendatacommons.org/licenses/odbl/" target="_blank">ODbL</a>)
    ·
    <a href="https://www.naturalearthdata.com/" target="_blank">Natural Earth</a>
    | Engine: 
    <a href="https://maplibre.org/" target="_blank">MapLibre GL</a>
    · <a href="https://protomaps.com/" target="_blank">PMTiles</a>
`;

const SHADING_COLORS = [
  "#e6194B", // Bright Clear Red
  "#3cb44b", // True Green
  "#ffe119", // Sunny Yellow
  "#4363d8", // Royal Blue
  "#f58231", // Clear Orange
  "#911eb4", // Deep Violet
  "#42d4f4", // Light Cyan
  "#f032e6", // Magenta
  "#bfef45", // Lime Green
  "#469990", // Muted Teal
];

const SHADING_CONFIGS = [
  {
    id: "awmc-persian-extent",
    title: "Persian Empire (Peak Extent)",
    type: "fill",
  },
  {
    id: "awmc-alexanders-empire",
    title: "Empire of Alexander the Great",
    type: "fill",
  },
  { id: "awmc-hasmonean", title: "Hasmonean Kingdom", type: "both" },
  {
    id: "awmc-roman-empire-bce-60",
    title: "Roman Empire (60 BCE)",
    type: "fill",
  },
  { id: "awmc-herod", title: "Herod's Kingdom", type: "fill" },
  {
    id: "awmc-roman-empire-ce-117-extent",
    title: "Roman Empire (Peak Extent, 117 CE)",
    type: "fill",
  },
  {
    id: "awmc-roman-empire-ce-200-extent",
    title: "Roman Empire (Peak Extent, 200 CE)",
    type: "fill",
  },
  {
    id: "awmc-roman-empire-ce-200-provinces",
    title: "Roman Provinces (200 CE)",
    type: "line",
  },
  {
    id: "awmc-roman-empire-provinces-post-diocletian",
    title: "Roman Provinces (Post-Diocletian)",
    type: "line",
  },
  {
    id: "awmc-senatorial-province",
    title: "Roman Senatorial Provinces",
    type: "fill",
  },
];

export const SHADINGS = SHADING_CONFIGS.map((config, index) => ({
  ...config,
  color: SHADING_COLORS[index] || THEME_COLORS.LAND,
}));
