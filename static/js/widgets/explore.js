import { compareNaturalNames } from "../data/model.js";
import { filterPlaces, getAvailableGroups, getAvailableTypes } from "../data/filters.js";
import { buildMarkerStyles } from "../map/marker-styles.js";
import { GROUP_NOT_SPECIFIED, MULTIPLE_GROUPS_SPECIFIED } from "../constants.js";
import { initializePanel } from "./panel.js";

export function buildExploreModel(dataset) {
  const groups = getAvailableGroups(dataset).sort(compareNaturalNames);
  const types = getAvailableTypes(dataset.places, {
    groupingEnabled: dataset.groupingEnabled,
    activeGroups: groups,
  }).sort(compareNaturalNames);
  const hasMultipleGroups = dataset.places.some(
    (place) => place.mappable && place.displayGroup === MULTIPLE_GROUPS_SPECIFIED,
  );
  const groupCounts = countMappedGroups(dataset.places, groups);
  const typeCounts = countMappedTypes(dataset.places);

  return {
    groupingEnabled: dataset.groupingEnabled,
    groups,
    types,
    groupCounts,
    typeCounts,
    hasMultipleGroups,
    visible: groups.length > 0 || types.length > 0,
    markerStyles: buildMarkerStyles(dataset),
  };
}

function countMappedGroups(places, groups) {
  const counts = new Map(groups.map((group) => [group, 0]));

  for (const place of places) {
    if (!place.mappable) continue;

    if (place.userGroups.length === 0) {
      if (counts.has(GROUP_NOT_SPECIFIED)) {
        counts.set(GROUP_NOT_SPECIFIED, counts.get(GROUP_NOT_SPECIFIED) + 1);
      }
      continue;
    }

    for (const group of new Set(place.userGroups)) {
      if (counts.has(group)) counts.set(group, counts.get(group) + 1);
    }
  }

  return counts;
}

function countMappedTypes(places) {
  const counts = new Map();

  for (const place of places) {
    if (!place.mappable) continue;

    for (const type of new Set(place.place_types ?? [])) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }

  return counts;
}

export function formatExploreGroup(group) {
  if (group === GROUP_NOT_SPECIFIED) {
    return { label: GROUP_NOT_SPECIFIED, kind: "unspecified" };
  }

  return { label: group, kind: "group" };
}

export function initializeExplore({ dataset, onFilterChange, onFocusPlaces, onHighlightPlaces, onFocusStatus, defaultOpen = false }) {
  const container = document.getElementById("explore-widget");

  if (!container) {
    return createEmptyController();
  }

  const model = buildExploreModel(dataset);

  if (!model.visible) {
    container.innerHTML = "";
    container.hidden = true;
    onFilterChange(dataset.places);
    return createEmptyController();
  }

  const state = {
    activeGroups: new Set(model.groups),
    uncheckedPlaceTypes: new Set(),
    groupSearch: "",
    placeTypeSearch: "",
    focusedFilter: null,
    focusedLabel: null,
    focusedGetPlaces: null,
    sectionOpen: {
      groups: false,
      types: false,
    },
  };

  const ui = {
    groupCheckboxes: new Map(),
    groupRows: new Map(),
    typeCheckboxes: new Map(),
    typeRows: new Map(),
    locateButtons: new Map(),
    typeSection: null,
    typeOptions: null,
    typeSearch: null,
    focusStatus: null,
  };

  const context = {
    container,
    dataset,
    model,
    state,
    ui,
    onFilterChange,
    onFocusPlaces,
    onHighlightPlaces,
    onFocusStatus,
  };

  renderExplore(context);

  const panel = initializePanel({
    element: container,
    title: "Explore",
    iconSrc: "./static/vendor/icons/magnifying-glass-location-solid.svg",
    defaultOpen,
  });

  applyExploreFilters(context);
  container.classList.add("map-overlay-panel");
  container.hidden = false;

  return {
    reset() {
      resetExplore(context);
      panel.open();
    },

    isOpen() {
      return panel.isOpen();
    },

    close() {
      panel.close();
    },

    hasFocus() {
      return Boolean(state.focusedFilter);
    },

    clearFocus() {
      clearFocus(context);
    },

    focusGroup(group) {
      const button = ui.locateButtons.get(`group:${group}`);
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },

    destroy() {
      clearFocus(context);
      panel.destroy();
      container.classList.remove("map-overlay-panel");
      container.hidden = true;
    },
  };
}

function createEmptyController() {
  return {
    reset() {},
    isOpen() { return false; },
    hasFocus() { return false; },
    clearFocus() {},
    focusGroup() { return false; },
    destroy() {},
  };
}

function renderExplore(context) {
  const { container, dataset, model } = context;
  container.innerHTML = "";

  const widget = document.createElement("div");
  widget.className = "explore";

  if (dataset.groupingEnabled && model.groups.length > 0) {
    widget.append(buildGroupSection(context));
  }

  const availableTypes = getCurrentTypes(dataset, context.state);
  if (availableTypes.length > 0) {
    widget.append(buildTypeSection(context));
  }

  container.append(widget);
}

function buildGroupSection(context) {
  const { model, state, ui } = context;
  const section = document.createElement("section");
  section.className = "explore__section";

  const header = createSectionHeader(
    "Groups",
    () => setVisibleGroups(context, true),
    () => setVisibleGroups(context, false),
    () => toggleExploreSection(section, state, "groups"),
  );
  section.append(header);

  const body = document.createElement("div");
  body.className = "explore__section-body";

  const search = createSearchInput(
    "Search groups…",
    (value) => {
      state.groupSearch = value;
      updateGroupSearch(context);
    });
  body.append(search);

  if (model.hasMultipleGroups) {
    body.append(buildMultipleGroupsNote(model.markerStyles.get(MULTIPLE_GROUPS_SPECIFIED)));
  }

  const options = document.createElement("div");
  options.className = "explore__options";
  body.append(options);
  section.append(body);
  setExploreSectionOpen(section, state, "groups", false);

  for (const group of model.groups) {
    const presentation = formatExploreGroup(group);
    const style = model.markerStyles.get(group);
    const checkbox = createFilterCheckbox(
      state.activeGroups.has(group),
      `Show ${presentation.label}`,
      (checked) => {
        if (checked) {
          state.activeGroups.add(group);
        } else {
          state.activeGroups.delete(group);
        }
        rebuildTypeOptions(context);
        applyExploreFilters(context);
        refreshFocusAfterFilter(context);
      },
    );

    ui.groupCheckboxes.set(group, checkbox);

    const locate = createLocateButton(
      presentation.label,
      createGroupSymbol(presentation, style),
      () => {
        const visiblePlaces = getFilteredPlaces(context.dataset, state);
        return visiblePlaces.filter((place) => placeMatchesGroup(place, group));
      },
      `group:${group}`,
      context,
      model.groupCounts.get(group) ?? 0,
    );

    locate.disabled = !checkbox.checked;
    checkbox.addEventListener("change", () => { locate.disabled = !checkbox.checked; });
    checkbox.addEventListener("explore-bulk-state", () => { locate.disabled = !checkbox.checked; });

    const row = createFilterRow(checkbox, locate);
    ui.groupRows.set(group, row);
    options.append(row);
  }

  updateGroupSearch(context);
  return section;
}

function buildTypeSection(context) {
  const { ui } = context;
  const section = document.createElement("section");
  section.className = "explore__section";

  const header = createSectionHeader(
    "Feature Categories",
    () => setVisibleTypes(context, true),
    () => setVisibleTypes(context, false),
    () => toggleExploreSection(section, context.state, "types"),
  );

  const body = document.createElement("div");
  body.className = "explore__section-body";

  const search = createSearchInput(
    "e.g. castle",
    (value) => {
      context.state.placeTypeSearch = value;
      updateTypeSearch(context);
    });

  const options = document.createElement("div");
  options.className = "explore__options";

  body.append(search, options);
  section.append(header, body);
  setExploreSectionOpen(section, context.state, "types", false);
  ui.typeSection = section;
  ui.typeOptions = options;
  ui.typeSearch = search.querySelector("input");

  rebuildTypeOptions(context);
  return section;
}

function rebuildTypeOptions(context) {
  const { dataset, state, ui } = context;
  if (!ui.typeSection || !ui.typeOptions) return;

  const types = getCurrentTypes(dataset, state);
  ui.typeOptions.innerHTML = "";
  ui.typeCheckboxes.clear();
  ui.typeRows.clear();

  if (types.length === 0) {
    ui.typeSection.hidden = true;
    return;
  }

  ui.typeSection.hidden = false;

  for (const type of types) {
    const checkbox = createFilterCheckbox(
      !state.uncheckedPlaceTypes.has(type),
      `Show ${type}`,
      (checked) => {
        if (checked) {
          state.uncheckedPlaceTypes.delete(type);
        } else {
          state.uncheckedPlaceTypes.add(type);
        }
        applyExploreFilters(context);
        refreshFocusAfterFilter(context);
      },
    );
    ui.typeCheckboxes.set(type, checkbox);

    const locate = createLocateButton(
      type,
      null,
      () => {
        const visiblePlaces = getFilteredPlaces(dataset, state);
        return visiblePlaces.filter((place) => place.place_types.includes(type));
      },
      `type:${type}`,
      context,
      context.model.typeCounts.get(type) ?? 0,
    );

    locate.disabled = !checkbox.checked;
    checkbox.addEventListener("change", () => { locate.disabled = !checkbox.checked; });
    checkbox.addEventListener("explore-bulk-state", () => { locate.disabled = !checkbox.checked; });

    const row = createFilterRow(checkbox, locate);
    ui.typeRows.set(type, row);
    ui.typeOptions.append(row);
  }

  updateTypeSearch(context);
  updateFocusedButton(context);
}

function createFilterCheckbox(checked, ariaLabel, onChange) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "explore__checkbox";
  checkbox.checked = checked;
  checkbox.setAttribute("aria-label", ariaLabel);
  checkbox.addEventListener("change", () => onChange(checkbox.checked));
  return checkbox;
}

function createLocateButton(label, symbol, getPlaces, focusKey, context, count = 0) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "explore__locate";
  button.title = `Locate ${label} on map. Click again or press Esc to clear.`;
  button.setAttribute("aria-label", `Locate ${label} on map`);
  button.dataset.focusKey = focusKey;

  if (symbol) button.append(symbol);

  const text = document.createElement("span");
  text.className = "explore__label";
  text.textContent = label;
  button.append(text);

  const countLabel = document.createElement("span");
  countLabel.className = "explore__count";
  countLabel.textContent = `(${count.toLocaleString()})`;
  countLabel.setAttribute("aria-hidden", "true");
  button.append(countLabel);

  button.addEventListener("click", () => {
    if (button.disabled) return;

    if (context.state.focusedFilter === focusKey) {
      clearFocus(context);
      return;
    }

    context.state.focusedFilter = focusKey;
    context.state.focusedLabel = label;
    context.state.focusedGetPlaces = getPlaces;
    updateFocusedButton(context);
    context.onFocusPlaces?.(getPlaces());
  });

  context.ui.locateButtons.set(focusKey, button);
  return button;
}

function createFilterRow(checkbox, locateButton) {
  const row = document.createElement("div");
  row.className = "explore__filter-row";
  row.append(checkbox, locateButton);
  return row;
}

function createSearchInput(placeholder, onInput) {
  const wrapper = document.createElement("div");
  wrapper.className = "explore__search";

  const field = document.createElement("div");
  field.className = "explore__search-field";

  const input = document.createElement("input");
  input.type = "search";
  input.className = "explore__search-input";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder.replace("…", ""));

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "clear-search-btn";
  clear.textContent = "×";
  clear.title = "Clear search input";
  clear.setAttribute("aria-label", "Clear search input");
  clear.hidden = true;

  const update = () => {
    clear.hidden = input.value.length === 0;
    onInput(input.value);
  };

  input.addEventListener("input", update);
  clear.addEventListener("click", () => {
    input.value = "";
    update();
    input.focus();
  });

  field.append(input, clear);
  wrapper.append(field);
  return wrapper;
}

function createSectionHeader(title, onAll, onNone, onToggle) {
  const header = document.createElement("div");
  header.className = "explore__section-header";

  const headingButton = document.createElement("button");
  headingButton.type = "button";
  headingButton.className = "explore__section-toggle";
  headingButton.addEventListener("click", onToggle);

  const heading = document.createElement("span");
  heading.className = "explore__section-title";
  heading.textContent = title;

  const indicator = document.createElement("span");
  indicator.className = "explore__section-indicator";
  indicator.setAttribute("aria-hidden", "true");
  headingButton.append(indicator, heading);

  header.append(headingButton, createExploreActions("All", "None", onAll, onNone));
  return header;
}

function setExploreSectionOpen(section, state, key, open) {
  state.sectionOpen[key] = open;
  const body = section.querySelector(".explore__section-body");
  const toggle = section.querySelector(".explore__section-toggle");
  const indicator = section.querySelector(".explore__section-indicator");
  if (body) body.hidden = !open;
  if (toggle) toggle.setAttribute("aria-expanded", String(open));
  if (indicator) indicator.textContent = open ? "−" : "+";
  section.classList.toggle("is-open", open);
}

function toggleExploreSection(section, state, key) {
  setExploreSectionOpen(section, state, key, !state.sectionOpen[key]);
}

function createExploreActions(allLabel, noneLabel, onAll, onNone) {
  const actions = document.createElement("div");
  actions.className = "explore__actions selection-actions";

  const all = document.createElement("button");
  all.type = "button";
  all.className = "explore__action selection-action";
  all.textContent = allLabel;

  const separator = document.createElement("span");
  separator.className = "explore__action-separator selection-action-separator";
  separator.textContent = "|";

  const none = document.createElement("button");
  none.type = "button";
  none.className = "explore__action selection-action";
  none.textContent = noneLabel;

  all.addEventListener("click", onAll);
  none.addEventListener("click", onNone);
  actions.append(all, separator, none);
  return actions;
}

function setVisibleGroups(context, checked) {
  const { model, state, ui } = context;
  state.activeGroups.clear();

  for (const group of model.groups) {
    if (checked) state.activeGroups.add(group);
    const checkbox = ui.groupCheckboxes.get(group);
    if (checkbox) {
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event("explore-bulk-state"));
    }
  }

  rebuildTypeOptions(context);
  applyExploreFilters(context);
  refreshFocusAfterFilter(context);
}

function setVisibleTypes(context, checked) {
  const { state, ui } = context;
  const types = getCurrentTypes(context.dataset, state);

  for (const type of types) {
    if (checked) state.uncheckedPlaceTypes.delete(type);
    else state.uncheckedPlaceTypes.add(type);

    const checkbox = ui.typeCheckboxes.get(type);
    if (checkbox) {
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event("explore-bulk-state"));
    }
  }

  applyExploreFilters(context);
  refreshFocusAfterFilter(context);
}

function updateGroupSearch(context) {
  const { state, ui } = context;
  for (const [group, row] of ui.groupRows) {
    row.hidden = !matchesSearch(group, state.groupSearch);
  }
}

function updateTypeSearch(context) {
  const { state, ui } = context;
  for (const [type, row] of ui.typeRows) {
    row.hidden = !matchesSearch(type, state.placeTypeSearch);
  }
}

function matchesSearch(value, query) {
  const normalizedQuery = String(query ?? "").trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return String(value).toLocaleLowerCase().includes(normalizedQuery);
}

function resetExplore(context) {
  const { model, state, ui } = context;
  state.activeGroups = new Set(model.groups);
  state.uncheckedPlaceTypes.clear();
  state.groupSearch = "";
  state.placeTypeSearch = "";

  for (const checkbox of ui.groupCheckboxes.values()) checkbox.checked = true;
  for (const row of ui.groupRows.values()) row.hidden = false;

  const groupSearch = context.container.querySelector(
    ".explore__section:first-of-type input[type='search']",
  );
  if (groupSearch && context.dataset.groupingEnabled) groupSearch.value = "";
  if (ui.typeSearch) ui.typeSearch.value = "";

  clearFocus(context);
  rebuildTypeOptions(context);
  applyExploreFilters(context);
}

function clearFocus(context) {
  if (!context.state.focusedFilter) return;
  context.state.focusedFilter = null;
  context.state.focusedLabel = null;
  context.state.focusedGetPlaces = null;
  updateFocusedButton(context);
  context.onHighlightPlaces?.([]);
}

function updateFocusedButton(context) {
  for (const [key, button] of context.ui.locateButtons) {
    button.classList.toggle("is-active", key === context.state.focusedFilter);
  }

  context.onFocusStatus?.(context.state.focusedLabel);
}

function refreshFocusAfterFilter(context) {
  if (!context.state.focusedFilter || !context.state.focusedGetPlaces) return;

  const places = context.state.focusedGetPlaces();
  if (places.length === 0) {
    clearFocus(context);
    return;
  }

  context.onHighlightPlaces?.(places);
  updateFocusedButton(context);
}

function applyExploreFilters(context) {
  context.onFilterChange(getFilteredPlaces(context.dataset, context.state));
}

function getCurrentTypes(dataset, state) {
  return getAvailableTypes(dataset.places, {
    groupingEnabled: dataset.groupingEnabled,
    activeGroups: [...state.activeGroups],
  }).sort(compareNaturalNames);
}

export function getFilteredPlaces(dataset, state) {
  const availableTypes = getCurrentTypes(dataset, state);
  const activeTypes = availableTypes.filter((type) => !state.uncheckedPlaceTypes.has(type));
  const hasAnyTypes = dataset.places.some(
    (place) => Array.isArray(place.place_types) && place.place_types.length > 0,
  );

  const allAvailableTypesSelected =
    state.uncheckedPlaceTypes.size === 0 && activeTypes.length === availableTypes.length;

  return filterPlaces(dataset.places, {
    groupingEnabled: dataset.groupingEnabled,
    activeGroups: [...state.activeGroups],
    activeTypes: hasAnyTypes && !allAvailableTypesSelected ? activeTypes : null,
  });
}

function placeMatchesGroup(place, group) {
  if (group === GROUP_NOT_SPECIFIED) return place.userGroups.length === 0;
  return place.userGroups.includes(group);
}

function createGroupSymbol(presentation, style) {
  const symbol = document.createElement("span");
  symbol.className = "explore__symbol";
  symbol.dataset.kind = presentation.kind;
  if (presentation.kind === "unspecified") symbol.classList.add("special-marker");

  if (style?.color) symbol.style.setProperty("--marker-color", style.color);
  if (presentation.kind === "unspecified") symbol.textContent = "?";
  return symbol;
}

function buildMultipleGroupsNote(style) {
  const note = document.createElement("div");
  note.className = "explore__multiple-note";

  const symbol = document.createElement("span");
  symbol.className = "explore__symbol special-marker";
  symbol.dataset.kind = "multiple";
  symbol.textContent = "#";
  if (style?.color) symbol.style.setProperty("--marker-color", style.color);

  const text = document.createElement("span");
  text.textContent = "Place belongs to multiple groups";
  note.append(symbol, text);
  return note;
}
