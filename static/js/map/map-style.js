import { FONT_BASE, MAP_BASE, SHADINGS, THEME_COLORS } from "../constants.js";
import * as b from "./map-style-builder.js";

function getMapSources() {
  const sources = {};
  for (const name of ["ne", "awmc"]) {
    const fileURL = new URL(`master_${name}.pmtiles`, MAP_BASE).href;
    sources[`${name}-master`] = { type: "vector", url: `pmtiles://${fileURL}` };
  }
  return sources;
}

function getOtherShadings() {
  const fillLayers = [];
  const lineLayers = [];

  for (const shading of SHADINGS) {
    const shadingSource = shading.id.replaceAll("-", "_");
    if (shading.type === "fill" || shading.type === "both") {
      fillLayers.push(
        b.getLayerFill({
          id: `${shading.id}-fill`,
          sourceLayer: shadingSource,
          visible: false,
          fillColor: shading.color,
          fillOpacity: 0.4,
        }),
      );
    }
    if (shading.type === "line" || shading.type === "both") {
      lineLayers.push(
        b.getLayerLine({
          id: `${shading.id}-line`,
          sourceLayer: shadingSource,
          visible: false,
          lineColor: shading.color,
          lineWidth: 1.2,
        }),
      );
    }
  }
  return [...fillLayers, ...lineLayers];
}

export const mapStyle = {
  version: 8,
  glyphs: `${FONT_BASE.href}{fontstack}/{range}.pbf`,
  sources: getMapSources(),
  layers: [
    b.getLayerBg(),
    b.getLayerFill({
      id: "ne-land-fill",
      sourceLayer: "visual_ne_land",
      outlineColor: THEME_COLORS.COUNTRY_BORDER,
    }),
    b.getLayerLine({
      id: "ne-country-line",
      sourceLayer: "visual_ne_admin_0_countries",
      outlineColor: THEME_COLORS.COUNTRY_BORDER,
    }),
    b.getLayerFill({
      id: "ne-lakes-fill",
      sourceLayer: "visual_ne_lakes",
      fillColor: THEME_COLORS.INLAND_WATER,
    }),
    b.getLayerLine({
      id: "ne-rivers-line",
      sourceLayer: "visual_ne_rivers_lake_centerlines",
      lineColor: THEME_COLORS.INLAND_WATER,
    }),
    b.getLayerSymbol({
      id: "ne-rivers-labels",
      sourceLayer: "labels_ne_rivers_lake_centerlines",
      minZoom: 5,
      symbolPlacement: "line",
      textHaloColor: THEME_COLORS.OCEAN,
      extraLayout: { "text-letter-spacing": 0.35 },
    }),
    b.getLayerSymbol({ id: "ne-lakes-labels", sourceLayer: "labels_ne_lakes", minZoom: 5 }),

    ...getOtherShadings(),

    b.getLayerSymbol({
      id: "ne-marine-labels",
      sourceLayer: "labels_ne_geography_marine_polys",
      font: "Noto Sans Italic",
      extraLayout: {
        "text-letter-spacing": 0.2,
        "text-max-width": 10,
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
    }),
    b.getLayerSymbol({
      id: "ne-country-labels",
      sourceLayer: "labels_ne_admin_0_countries",
      extraLayout: { "text-transform": "uppercase" },
    }),
  ],
};
