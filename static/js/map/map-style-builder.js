import { THEME_COLORS } from "../constants.js";

export function getSourceFromId(layerId) {
  return layerId.startsWith("ne-") ? "ne-master" : "awmc-master";
}

export function getLayer({
  id,
  type,
  source,
  sourceLayer,
  minzoom,
  layout = {},
  paint = {},
  visible = true,
}) {
  const resolvedSourceLayer = sourceLayer || id.replaceAll("-", "_");

  return {
    id,
    type,
    ...(source !== undefined && { source }),
    ...(source !== undefined && { "source-layer": resolvedSourceLayer }),
    ...(minzoom !== undefined && { minzoom }),
    layout: { visibility: visible ? "visible" : "none", ...layout },
    paint,
  };
}

export function getLayerBg(bgColor = THEME_COLORS.OCEAN) {
  return getLayer({
    id: "background-sea",
    type: "background",
    paint: { "background-color": bgColor },
  });
}

export function getLayerFill({
  id,
  sourceLayer,
  minzoom,
  visible = true,
  fillColor = THEME_COLORS.LAND,
  fillOpacity = 1,
  outlineColor = undefined,
}) {
  return getLayer({
    id,
    type: "fill",
    source: getSourceFromId(id),
    sourceLayer,
    minzoom,
    visible,
    paint: {
      "fill-color": fillColor,
      "fill-opacity": fillOpacity,
      ...(outlineColor && { "fill-outline-color": outlineColor }),
    },
  });
}

export function getLayerLine({
  id,
  sourceLayer,
  minzoom,
  visible = true,
  lineColor = THEME_COLORS.COUNTRY_BORDER,
  lineWidth = 1,
}) {
  return getLayer({
    id,
    type: "line",
    source: getSourceFromId(id),
    sourceLayer,
    minzoom,
    visible,
    paint: { "line-color": lineColor, "line-width": lineWidth },
  });
}

export function getLayerSymbol({
  id,
  sourceLayer,
  minZoom,
  visible = true,
  font = "Noto Sans Regular",
  textSize = 11,
  symbolPlacement = "point",
  textColor = THEME_COLORS.TEXT,
  textHaloColor = THEME_COLORS.HALO,
  textHaloWidth = 1.5,
  textField = ["get", "name"],
  extraLayout = {},
  extraPaint = {},
}) {
  return getLayer({
    id,
    type: "symbol",
    source: getSourceFromId(id),
    sourceLayer,
    minzoom: minZoom,
    visible,
    layout: {
      "text-field": textField,
      "text-font": [font],
      "text-size": textSize,
      "symbol-placement": symbolPlacement,
      ...extraLayout,
    },
    paint: {
      "text-color": textColor,
      ...(textHaloColor && {
        "text-halo-color": textHaloColor,
        "text-halo-width": textHaloWidth,
      }),
      ...extraPaint,
    },
  });
}
