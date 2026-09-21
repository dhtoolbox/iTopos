import { buildDataset } from "./js/data/model.js";
import { resolveIds } from "./js/data/resolver.js";
import { analyzeDuplicates } from "./js/data/duplicates.js";
import {
  clearProcessingReport,
  showProcessingError,
  showProcessingReport,
} from "./js/widgets/report.js";
import {
  clearPlaceHighlight,
  clearPlacePopups,
  focusPlaces,
  highlightPlaces,
  loadDataset,
  map,
  mapLoaded,
  renderPlaces,
  setTemporalPlaceEvidence,
} from "./map.js";
import { initializeUpload } from "./js/widgets/upload.js";
import { closeHelp, initializeHelp } from "./js/widgets/help.js";
import { initializeExplore } from "./js/widgets/explore.js";
import { initializeDrawer } from "./js/widgets/drawer.js";
import { initializePleiadesSearch } from "./js/widgets/pleiades-search.js";
import { loadManifest } from "./js/data/static-resolver.js";
import { initializeTemporalWidget } from "./js/widgets/temporal.js";
import { setTemporalPopupState } from "./js/widgets/place-popup.js";
import { initializePlaceExport } from "./js/widgets/export-places.js";

initializeHelp();

const welcomeDialog = document.querySelector("#welcome-dialog");
const welcomeUpload = document.querySelector("#welcome-upload");
const welcomeBrowse = document.querySelector("#welcome-browse");
const welcomeHelp = document.querySelector("#welcome-help");
const welcomeClose = document.querySelector("#welcome-close");
const welcomeCastles = document.querySelector("#welcome-castles");
const corpusFreshness = document.querySelector("#pleiades-corpus-freshness");
const mapAllPlaces = document.querySelector("#browse-map-all");

const mapContainer = document.querySelector("#map-container");
const appStatus = document.querySelector("#app-status");
const siteHeader = document.querySelector(".site-header");
const mapInfoStack = document.querySelector("#map-info-stack");
const shortLandscape = window.matchMedia("(max-height: 520px) and (orientation: landscape)");
const mobileViewport = window.matchMedia("(max-width: 760px), (max-height: 520px) and (orientation: landscape)");

let explore = null;
const placeExport = initializePlaceExport();
const temporal = initializeTemporalWidget({
  onRangeChange(state) {
    setTemporalPlaceEvidence(state.filteringDisabled ? new Map() : state.placeEvidence);
    setTemporalPopupState(state);
  },
});

appStatus?.addEventListener("click", (event) => {
  if (!event.target.closest(".app-status__clear")) return;
  explore?.clearFocus?.();
  blurMapFocusControl();
});

function blurMapFocusControl() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (
    active.matches(
      ".explore__locate, .place-popup__group-link, .place-popup__external-link",
    )
  ) {
    active.blur();
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  if (document.querySelector("dialog[open]")) return;

  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active.matches("input, select, textarea, [contenteditable='true']")
  ) {
    return;
  }

  if (explore?.hasFocus?.()) {
    explore.clearFocus();
    blurMapFocusControl();
    event.preventDefault();
    return;
  }

  if (document.querySelector(".maplibregl-popup")) {
    clearPlacePopups();
    blurMapFocusControl();
    event.preventDefault();
  }
});

const upload = initializeUpload({
  async onParsed({ rows, groups, duplicates, groupingEnabled, fileName }) {
    pleiadesSearch?.clear?.();
    clearPlacePopups();
    clearPlaceHighlight();
    clearProcessingReport();
    await resolvePlaces(rows, groups, duplicates, groupingEnabled, { source: "upload", fileName });
  },
  onError(message, fileName) {
    showProcessingError(message, fileName);
  },
});

const pleiadesSearch = initializePleiadesSearch({
  async onMapSelected(ids) {
    upload.reset();
    const rows = ids.map((id) => ({ id: String(id), valid: true, group: "" }));
    const duplicates = analyzeDuplicates(rows);
    clearPlacePopups();
    clearPlaceHighlight();
    clearProcessingReport();
    await resolvePlaces(rows, new Set(), duplicates, false, { source: "pleiades" });
  },
  async onMapAll(ids) {
    upload.reset();
    pleiadesSearch.clear();
    const rows = ids.map((id) => ({ id: String(id), valid: true, group: "" }));
    const duplicates = analyzeDuplicates(rows);
    clearPlacePopups();
    clearPlaceHighlight();
    clearProcessingReport();
    await resolvePlaces(rows, new Set(), duplicates, false, { source: "corpus" });
  },
  onError(message) {
    showProcessingError(message);
  },
});


function syncMobileOverlayState() {
  if (mobileViewport.matches) {
    if (appStatus && mapInfoStack && appStatus.parentElement !== mapInfoStack) {
      mapInfoStack.append(appStatus);
    }
  } else if (appStatus && siteHeader && appStatus.parentElement !== siteHeader) {
    siteHeader.insertBefore(appStatus, siteHeader.querySelector(".site-utilities"));
  }

  if (shortLandscape.matches) {
    explore?.close?.();
    temporal.minimize?.();
  }
}

mobileViewport.addEventListener?.("change", syncMobileOverlayState);
shortLandscape.addEventListener?.("change", syncMobileOverlayState);
window.addEventListener("orientationchange", () => window.setTimeout(syncMobileOverlayState, 80));

const drawer = initializeDrawer({
  initialMinimized: true,
  onTabChange(name) {
    if (name === "pleiades") pleiadesSearch.open();
  },
});

function closeWelcome() {
  if (welcomeDialog?.open) welcomeDialog.close();
}


function goToUploadFromWelcome() {
  drawer?.selectTab?.("data");
  closeWelcome();
  window.setTimeout(() => document.querySelector("#choose-file-button")?.focus(), 0);
}

welcomeUpload?.addEventListener("click", goToUploadFromWelcome);

welcomeBrowse?.addEventListener("click", () => {
  drawer?.selectTab?.("pleiades");
  closeWelcome();
});

async function mapCastleExample() {
  closeHelp();
  drawer?.selectTab?.("pleiades");
  closeWelcome();
  try {
    await pleiadesSearch.mapPlaceType?.("castle");
  } catch (error) {
    showProcessingError(error instanceof Error ? error.message : String(error));
  }
}

welcomeCastles?.addEventListener("click", mapCastleExample);
document.querySelector("#help-castles")?.addEventListener("click", mapCastleExample);

welcomeHelp?.addEventListener("click", () => {
  document.querySelector("#help-button")?.click();
});

welcomeClose?.addEventListener("click", goToUploadFromWelcome);

welcomeDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  goToUploadFromWelcome();
});

welcomeDialog?.showModal();
welcomeUpload?.focus({ preventScroll: true });

function preloadBrowsePlaces() {
  const start = () => pleiadesSearch.preload?.();

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => window.setTimeout(start, 300), { timeout: 3000 });
  } else {
    window.setTimeout(start, 1200);
  }
}

if (mapLoaded) {
  preloadBrowsePlaces();
} else {
  window.addEventListener("app:map-ready", preloadBrowsePlaces, { once: true });
}

window.addEventListener("app:focus-group", (event) => {
  const group = event.detail?.group;
  if (group) explore?.focusGroup?.(group);
});

loadManifest()
  .then((manifest) => {
    if (mapAllPlaces && Number.isFinite(manifest.located)) {
      mapAllPlaces.textContent = `See all ${manifest.located.toLocaleString()} mappable Pleiades places`;
    }
    if (corpusFreshness) {
      const refreshed = manifest.refreshed_at ? new Date(manifest.refreshed_at) : null;
      corpusFreshness.textContent =
        refreshed && !Number.isNaN(refreshed.getTime())
          ? `Pleiades dataset: refreshed ${refreshed.toLocaleDateString()}`
          : "Pleiades dataset: refresh date unavailable";
    }
  })
  .catch(() => {
    if (corpusFreshness) corpusFreshness.textContent = "Local dataset refresh date unavailable";
  });

async function resolvePlaces(places, groups, duplicates, groupingEnabled, { source, fileName } = {}) {
  placeExport.setDataset(null);
  const ids = places.map((place) => place.id);
  let result;

  try {
    result = await resolveIds(ids);
  } catch (error) {
    if (source === "upload") upload.restore();
    showProcessingError(error.message, source === "upload" ? fileName : "");
    return;
  }

  const dataset = buildDataset(places, result.places, { groupingEnabled });
  placeExport.setDataset(dataset, { visible: source !== "upload" });

  if (source === "upload" && dataset.places.length === 0) {
    upload.restore();
    await showProcessingReport({
      dataset,
      groups,
      duplicates,
      result,
      attemptedFileName: fileName,
    });
    return;
  }

  if (source === "upload") upload.showLoaded(fileName);

  loadDataset(dataset);
  temporal
    .loadDataset(dataset)
    .then(() => {
      if (mobileViewport.matches) temporal.minimize?.();
    })
    .catch((error) => console.warn("Temporal data unavailable:", error));
  await showProcessingReport({ dataset, groups, duplicates, result });

  if (map && mapLoaded) {
    const exploreWasOpen = mobileViewport.matches ? false : (explore?.isOpen?.() ?? false);
    explore?.destroy();
    explore = initializeExplore({
      dataset,
      defaultOpen: exploreWasOpen,
      onFilterChange(filteredPlaces) {
        clearPlacePopups();
        renderPlaces(filteredPlaces, dataset.groupingEnabled);
      },
      onFocusPlaces: focusPlaces,
      onHighlightPlaces: highlightPlaces,
      onFocusStatus(label) {
        if (!appStatus) return;
        if (!label) {
          appStatus.hidden = true;
          appStatus.textContent = "";
          return;
        }
        const text = document.createElement("span");
        text.textContent = `Highlighting: ${label}`;
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "app-status__clear";
        clear.textContent = "Clear";
        clear.setAttribute("aria-label", `Clear highlight for ${label}`);
        appStatus.replaceChildren(text, document.createTextNode(" · "), clear);
        appStatus.hidden = false;
      },
    });

    syncMobileOverlayState();
    if (mapContainer) mapContainer.hidden = false;
    if (mobileViewport.matches) drawer?.minimize?.();
  }
}

window.setTimeout(syncMobileOverlayState, 0);
