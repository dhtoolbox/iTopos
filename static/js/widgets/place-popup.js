import {
  DEFAULT_MARKER_COLOR,
  GROUP_NOT_SPECIFIED,
  MULTIPLE_GROUPS_SPECIFIED,
  NOT_SPECIFIED,
} from "../constants.js";

const PLEIADES_BASE = "https://pleiades.stoa.org";
const PLEIADES_PLACES = `${PLEIADES_BASE}/places/`;
const PLEIADES_PLACE_TYPES = `${PLEIADES_BASE}/vocabularies/place-types/`;
const LOCATION_ICON = "./static/vendor/icons/location-arrow.svg";
const NAME_ICON = "./static/vendor/icons/tag.svg";
const UNTITLED_PLACE = "[ Untitled ]";
const MAX_INLINE_TYPES = 3;
const MAX_TEMPORAL_ROWS = 3;

let temporalPopupState = new Map();
let temporalPeriods = [];
let temporalConfidences = [];
let temporalFilteringDisabled = false;
const openPopups = new Set();

export function setTemporalPopupState({
  placeEvidence,
  periods,
  confidences,
  filteringDisabled = false,
} = {}) {
  temporalPopupState = placeEvidence instanceof Map ? placeEvidence : new Map();
  temporalPeriods = Array.isArray(periods) ? periods : [];
  temporalConfidences = Array.isArray(confidences) ? confidences : [];
  temporalFilteringDisabled = Boolean(filteringDisabled);

  for (const entry of openPopups) {
    entry.popup.setHTML(
      entry.coincident
        ? createCoincidentPopupHTML(entry.properties)
        : createPlacePopupHTML(entry.properties),
    );
    bindGroupLinks(entry.popup.getElement?.());
  }
}

export function getPopupData(properties) {
  const userGroups = parseArrayProperty(properties.user_groups);
  const placeTypes = parseArrayProperty(properties.place_types);
  const placeTypeKeys = parseArrayProperty(properties.place_type_keys);

  return {
    id: String(properties.pleiades_id ?? ""),
    title: properties.title || UNTITLED_PLACE,
    color: properties.color || DEFAULT_MARKER_COLOR,
    displayGroup: properties.display_group || null,
    userGroups,
    placeTypes,
    placeTypeKeys,
    reprLat: toFiniteNumber(properties.repr_lat),
    reprLng: toFiniteNumber(properties.repr_lng),
  };
}

export function createPlacePopupHTML(properties) {
  return renderPlaceCard(getPopupData(properties));
}

export function createCoincidentPopupHTML(properties) {
  const members = parseArrayProperty(properties.coincident_places);
  const count = Number(properties.place_count ?? members.length);

  const cards = members
    .map((member) =>
      renderPlaceCard(
        {
          id: String(member.id ?? ""),
          title: member.title || UNTITLED_PLACE,
          color: member.color || DEFAULT_MARKER_COLOR,
          displayGroup: member.displayGroup || null,
          userGroups: Array.isArray(member.userGroups) ? member.userGroups : [],
          placeTypes: Array.isArray(member.placeTypes) ? member.placeTypes : [],
          placeTypeKeys: Array.isArray(member.placeTypeKeys) ? member.placeTypeKeys : [],
          reprLat: toFiniteNumber(member.reprLat),
          reprLng: toFiniteNumber(member.reprLng),
        },
        { compact: true },
      ),
    )
    .join("");

  return `
    <div class="place-popup place-popup--coincident">
      <div class="place-popup__coincident-heading">
        <strong>${count.toLocaleString()} places</strong> share this representative point
      </div>
      <div class="place-popup__coincident-list">
        ${cards}
      </div>
    </div>
  `;
}

export function showPlacePopup(event, map, maplibregl) {
  if (!event.features || event.features.length === 0) return;
  closeTrackedPopups();

  const popup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: "390px" })
    .setLngLat(event.lngLat)
    .setHTML(createPlacePopupHTML(event.features[0].properties))
    .addTo(map);

  bindGroupLinks(popup.getElement?.());
  trackPopup(popup, event.features[0].properties, false);
}

export function showCoincidentPopup(event, map, maplibregl) {
  if (!event.features || event.features.length === 0) return;
  closeTrackedPopups();

  const popup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: "390px" })
    .setLngLat(event.lngLat)
    .setHTML(createCoincidentPopupHTML(event.features[0].properties))
    .addTo(map);

  bindGroupLinks(popup.getElement?.());
  trackPopup(popup, event.features[0].properties, true);
}

function closeTrackedPopups() {
  for (const entry of [...openPopups]) entry.popup.remove?.();
  openPopups.clear();
}

function trackPopup(popup, properties, coincident) {
  const entry = { popup, properties, coincident };
  openPopups.add(entry);
  popup.on?.("close", () => openPopups.delete(entry));
}

function renderPlaceCard(data, { compact = false } = {}) {
  const pleiadesURL = `${PLEIADES_PLACES}${encodeURIComponent(data.id)}`;
  const compactClass = compact ? " place-popup__card--compact" : "";
  const temporal = temporalPopupState.get(String(data.id));

  return `
    <div class="place-popup__card${compactClass}">
      <div class="place-popup__header" style="--place-color: ${escapeHTML(data.color)};">
        ${renderTitleMarker(data)}
        <strong class="place-popup__title">${escapeHTML(data.title)}</strong>
      </div>
      <div class="place-popup__body">
        <div class="place-popup__row place-popup__meta-row">
          <span class="place-popup__label">ID</span>
          <span class="place-popup__value">${escapeHTML(data.id)}</span>
          <a href="${pleiadesURL}" target="_blank" rel="noopener noreferrer"
          class="place-popup__external-link"
          aria-label="Open Pleiades place ${escapeHTML(data.id)}">↗</a>
        </div>
        ${renderCoordinates(data)}
        ${renderTypes(data.placeTypes, data.placeTypeKeys)}
        ${compact ? renderCompactTemporal(temporal) : renderTemporalEvidence(temporal)}
        ${renderGroups(data)}
      </div>
    </div>
  `;
}

function renderTitleMarker(data) {
  let symbol = "";
  if (data.displayGroup === GROUP_NOT_SPECIFIED) symbol = "?";
  if (data.displayGroup === MULTIPLE_GROUPS_SPECIFIED) symbol = "#";

  const specialClass = symbol ? " special-marker" : " place-marker";
  return `<span class="${specialClass}" aria-hidden="true">${symbol}</span>`;
}

function renderCoordinates(data) {
  if (!Number.isFinite(data.reprLat) || !Number.isFinite(data.reprLng)) return "";
  return `<div class="place-popup__row place-popup__coordinates"><span class="place-popup__label">REPRESENTATIVE POINT</span><span class="place-popup__value">${formatCoordinate(data.reprLat)}, ${formatCoordinate(data.reprLng)}</span></div>`;
}

function renderTypes(placeTypes, placeTypeKeys = []) {
  if (placeTypes.length === 0) return "";

  const label = placeTypes.length === 1 ? "FEATURE CATEGORY" : "FEATURE CATEGORIES";
  const visible = placeTypes.slice(0, MAX_INLINE_TYPES);
  const links = visible.map((type, index) => {
    const key = placeTypeKeys[index] || type;
    const url = `${PLEIADES_PLACE_TYPES}${encodeURIComponent(key)}`;
    return `<span class="place-popup__item">${escapeHTML(type)} <a href="${url}" target="_blank" rel="noopener noreferrer"
              class="place-popup__external-link"
              aria-label="Open Pleiades feature category ${escapeHTML(type)}">↗</a></span>`;
  });

  if (placeTypes.length > visible.length) {
    links.push(
      `<span class="place-popup__more" title="${escapeHTML(placeTypes.slice(visible.length).join(" · "))}">+${placeTypes.length - visible.length}</span>`,
    );
  }

  return `<div class="place-popup__row place-popup__types"><span class="place-popup__label">${label}</span>
          <span class="place-popup__inline-list">${links.join('<span class="place-popup__delimiter" aria-hidden="true"> · </span>')}</span></div>`;
}

function renderCompactTemporal(temporal) {
  if (!temporal) return "";
  const selectedRows = temporal.temporalRows.filter((row) => row.selected);
  if (!selectedRows.length) return "";
  return `<div class="place-popup__row place-popup__temporal-compact"><span class="place-popup__label">TEMPORAL</span><span class="place-popup__evidence-counts">${renderEvidenceIcon(LOCATION_ICON, temporal.activeLocations, "Location")}${renderEvidenceIcon(NAME_ICON, temporal.activeNames, "Name")}<span>${selectedRows.length.toLocaleString()} period${selectedRows.length === 1 ? "" : "s"}</span></span></div>`;
}

function renderTemporalEvidence(temporal) {
  if (!temporal) return "";

  const temporalRows = temporal.temporalRows ?? [];
  const totalLocations = temporal.totalLocations ?? 0;
  const totalNames = temporal.totalNames ?? 0;
  const attestedLocations = temporal.attestedLocations ?? 0;
  const attestedNames = temporal.attestedNames ?? 0;

  const unspecifiedLocations = Math.max(0, totalLocations - attestedLocations);
  const unspecifiedNames = Math.max(0, totalNames - attestedNames);

  /*
   * A Place can have Locations or Names with no
   * time-period attestations. There is no evidence
   * matrix to draw in that case, but the popup should
   * still disclose those children using Pleiades'
   * "unspecified date range" wording.
   */
  if (!temporalRows.length) {
    const unspecified = [
      unspecifiedLocations
        ? `${unspecifiedLocations.toLocaleString()} Location${unspecifiedLocations === 1 ? "" : "s"} (unspecified date range)`
        : "",
      unspecifiedNames
        ? `${unspecifiedNames.toLocaleString()} Name${unspecifiedNames === 1 ? "" : "s"} (unspecified date range)`
        : "",
    ].filter(Boolean);

    if (!unspecified.length) return "";

    return `
      <div class="place-popup__temporal">
        <div class="place-popup__label">TEMPORAL EVIDENCE</div>
        <div class="place-popup__temporal-total">
          ${unspecified.join("<br>")}
        </div>
      </div>
    `;
  }

  const selectedRows = temporalFilteringDisabled ? [] : temporalRows.filter((row) => row.selected);
  const unselectedRows = temporalFilteringDisabled
    ? temporalRows
    : temporalRows.filter((row) => !row.selected);

  const rows = [...selectedRows, ...unselectedRows].slice(
    0,
    Math.max(MAX_TEMPORAL_ROWS, selectedRows.length),
  );

  const confidenceIndexes = [
    ...new Set(rows.flatMap((row) => row.confidences.map((item) => item.confidenceIndex))),
  ];

  const head = confidenceIndexes
    .map(
      (index) =>
        `<th scope="col" title="${escapeHTML(
          formatConfidence(temporalConfidences[index]),
        )}">${escapeHTML(shortConfidence(temporalConfidences[index]))}</th>`,
    )
    .join("");

  const body = rows
    .map((row) => {
      const cells = confidenceIndexes
        .map((confidenceIndex) => {
          const counts = row.confidences.find((item) => item.confidenceIndex === confidenceIndex);

          return `
            <td class="${counts && !counts.allowed ? "is-muted" : ""}">
              ${
                counts
                  ? `${renderEvidenceIcon(
                      LOCATION_ICON,
                      counts.locations,
                      "Location",
                    )}${renderEvidenceIcon(NAME_ICON, counts.names, "Name")}`
                  : '<span class="place-popup__empty">—</span>'
              }
            </td>
          `;
        })
        .join("");

      return `
        <tr class="${!temporalFilteringDisabled && row.selected ? "is-selected" : ""}">
          <th scope="row" title="${escapeHTML(row.term)}">
            ${escapeHTML(shortPeriodTerm(row.term))}
          </th>
          ${cells}
        </tr>
      `;
    })
    .join("");

  const remaining = temporalRows.length - rows.length;

  const footer =
    remaining > 0
      ? `
        <div
          class="place-popup__temporal-more"
          title="${escapeHTML(
            temporalRows
              .slice(rows.length)
              .map((row) => row.term)
              .join("\n"),
          )}"
        >
          +${remaining} more time period${remaining === 1 ? "" : "s"}
        </div>
      `
      : "";

  const unspecified = [
    unspecifiedLocations
      ? `${unspecifiedLocations.toLocaleString()} Location${unspecifiedLocations === 1 ? "" : "s"} (unspecified date range)`
      : "",
    unspecifiedNames
      ? `${unspecifiedNames.toLocaleString()} Name${unspecifiedNames === 1 ? "" : "s"} (unspecified date range)`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <div class="place-popup__temporal">
      <div class="place-popup__label">TEMPORAL EVIDENCE</div>
      <div class="place-popup__table-wrap">
        <table class="place-popup__temporal-table">
          <thead>
            <tr>
              <th scope="col">Time period</th>
              ${head}
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      </div>

      ${footer}

      <div class="place-popup__temporal-total">
        ${totalLocations.toLocaleString()}
        Location${totalLocations === 1 ? "" : "s"}
        ·
        ${totalNames.toLocaleString()}
        Name${totalNames === 1 ? "" : "s"}
        total
        ${unspecified ? `<br>${unspecified}` : ""}
      </div>
    </div>
  `;
}

function renderEvidenceIcon(src, count, singular) {
  if (!count) return "";
  const label = `${count.toLocaleString()} ${singular}${count === 1 ? "" : "s"}`;
  return `<span class="place-popup__evidence" title="${label}" aria-label="${label}"><img src="${src}" alt="">${count.toLocaleString()}</span>`;
}

function shortPeriodTerm(term) {
  const value = String(term ?? "").trim();
  return value.split("(", 1)[0].trim() || value;
}

function formatConfidence(value) {
  return String(value ?? "").replaceAll("-", " ");
}

function shortConfidence(value) {
  const text = formatConfidence(value);
  if (text === "confident inferred") return "Conf., inferred";
  if (text === "less confident inferred") return "Less conf., inferred";
  if (text === "less confident") return "Less confident";
  return text ? text[0].toUpperCase() + text.slice(1) : "Confidence";
}

function renderGroups(data) {
  if (!data.displayGroup) return "";

  if (data.displayGroup === GROUP_NOT_SPECIFIED) {
    return `<div class="place-popup__row"><span class="place-popup__label">GROUP</span> <span>${NOT_SPECIFIED}</span></div>`;
  }

  const groups =
    data.displayGroup === MULTIPLE_GROUPS_SPECIFIED
      ? data.userGroups
      : [data.userGroups[0] || data.displayGroup].filter(Boolean);

  if (groups.length === 0) return "";

  const label = groups.length === 1 ? "GROUP" : "GROUPS";
  const links = groups
    .map(
      (group) => `<button type="button" class="place-popup__group-link"
                     data-group="${escapeHTML(group)}">${escapeHTML(group)}</button>`,
    )
    .join('<span class="place-popup__delimiter" aria-hidden="true"> · </span>');

  return `<div class="place-popup__row place-popup__groups"><span class="place-popup__label">${label}</span>
          <span class="place-popup__inline-list place-popup__group-list">${links}</span></div>`;
}

function bindGroupLinks(root) {
  if (!root) return;
  root.addEventListener("click", (event) => {
    const button = event.target.closest?.(".place-popup__group-link");
    if (!button) return;
    window.dispatchEvent(
      new CustomEvent("app:focus-group", { detail: { group: button.dataset.group } }),
    );
  });
}

function parseArrayProperty(value) {
  if (Array.isArray(value))
    return value
      .map((item) => (typeof item === "object" && item !== null ? item : String(item ?? "").trim()))
      .filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatCoordinate(value) {
  return Number(value).toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
