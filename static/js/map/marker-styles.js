import { compareNaturalNames } from "../data/model.js";
import {
  DEFAULT_MARKER_COLOR,
  GROUP_NOT_SPECIFIED,
  MULTIPLE_GROUPS_SPECIFIED,
  RESERVED_COLORS,
  SPECIAL_MARKER_COLOR,
} from "../constants.js";

export function buildMarkerStyles(dataset) {
  if (!dataset.groupingEnabled) {
    return new Map();
  }

  const ordinaryGroups = new Set();

  let hasUnspecified = false;
  let hasMultiple = false;

  for (const place of dataset.places) {
    if (!place.mappable) {
      continue;
    }

    for (const group of place.userGroups) {
      ordinaryGroups.add(group);
    }

    if (place.displayGroup === GROUP_NOT_SPECIFIED) {
      hasUnspecified = true;
      continue;
    }

    if (place.displayGroup === MULTIPLE_GROUPS_SPECIFIED) {
      hasMultiple = true;
    }
  }

  const sortedGroups = [...ordinaryGroups].sort(compareNaturalNames);
  const styles = new Map();
  const colors = generateGroupColors(sortedGroups.length);

  sortedGroups.forEach((group, index) => {
    styles.set(group, {
      kind: "group",
      color: colors[index],
    });
  });

  if (hasUnspecified) {
    styles.set(GROUP_NOT_SPECIFIED, {
      kind: "unspecified",
      color: SPECIAL_MARKER_COLOR,
    });
  }

  if (hasMultiple) {
    styles.set(MULTIPLE_GROUPS_SPECIFIED, {
      kind: "multiple",
      color: SPECIAL_MARKER_COLOR,
    });
  }
  return styles;
}

// -- Color Palette --
const CANDIDATE_POOL_FACTOR = 3;
const RESERVED_HUE_RANGES = [
  {
    min: 115,
    max: 175,
  },
];

function isReservedHue(hue) {
  return RESERVED_HUE_RANGES.some(({ min, max }) => hue >= min && hue <= max);
}

// Converts HSL properties directly to an RGB object for accurate distance math
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  };
}

// Safely converts hex or standard color strings into RGB objects
function parseColor(colorStr) {
  // If it's a hex string (e.g. "#99FF99")
  if (colorStr.startsWith("#")) {
    const r = parseInt(colorStr.slice(1, 3), 16);
    const g = parseInt(colorStr.slice(3, 5), 16);
    const b = parseInt(colorStr.slice(5, 7), 16);
    return { r, g, b };
  }
  // Recursively calls itself using the fallback color string
  return parseColor(DEFAULT_MARKER_COLOR);
}

function toHslString(candidate) {
  return `hsl(${candidate.hue} ${candidate.saturation}% ${candidate.lightness}%)`;
}

function rgbDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function buildColorCandidates(count) {
  if (count <= 0) {
    return [];
  }

  const candidates = [];

  /*
   * Generate more candidates than we ultimately need so
   * the distance selector can reject colors too close to
   * reserved colors or previously selected colors.
   */
  const candidateTarget = count * CANDIDATE_POOL_FACTOR;

  /*
   * Golden-angle stepping keeps consecutive hues far apart
   * instead of walking through neighboring colors.
   */
  const GOLDEN_ANGLE = 137.508;

  let index = 0;

  while (candidates.length < candidateTarget) {
    const hue = (index * GOLDEN_ANGLE) % 360;
    const isLight = index % 2 === 0;
    index++;

    if (isReservedHue(hue)) {
      continue;
    }

    /*
     * Strong light/dark alternation is intentional.
     * Hue alone is not enough to distinguish small markers.
     */
    const lightness = isLight ? 60 : 36;
    const saturation = isLight ? 78 : 68;

    candidates.push({
      hue,
      saturation,
      lightness,

      rgb: hslToRgb(hue, saturation, lightness),
    });
  }

  return candidates;
}

export function generateGroupColors(count) {
  if (count <= 0) {
    return [];
  }

  const candidates = buildColorCandidates(count);

  const lightCandidates = candidates.filter((candidate) => candidate.lightness >= 50);

  const darkCandidates = candidates.filter((candidate) => candidate.lightness < 50);

  const reservedRgb = [...new Set(RESERVED_COLORS)].map(parseColor);

  const selected = [];
  const selectedRgb = [];

  for (let index = 0; index < count; index++) {
    /*
     * Force alternating luminance:
     *
     * group 1 = light
     * group 2 = dark
     * group 3 = light
     * group 4 = dark
     */
    const pool = index % 2 === 0 ? lightCandidates : darkCandidates;

    if (pool.length === 0) {
      break;
    }

    const comparisonColors = [...reservedRgb, ...selectedRgb];

    let bestIndex = 0;
    let bestDistance = -1;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];

      const minimumDistance = Math.min(
        ...comparisonColors.map((existing) => rgbDistance(candidate.rgb, existing)),
      );

      if (minimumDistance > bestDistance) {
        bestDistance = minimumDistance;

        bestIndex = i;
      }
    }

    const [chosen] = pool.splice(bestIndex, 1);

    selected.push(chosen);
    selectedRgb.push(chosen.rgb);
  }

  return selected.map(toHslString);
}
