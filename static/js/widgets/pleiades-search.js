import {
  loadPleiadesPlaceNames,
  loadPleiadesPlaceTypes,
  loadPleiadesSearchCorpus,
  loadPleiadesTypeCounts,
  loadPleiadesTimePeriods,
  loadPleiadesPeriodPlaces,
} from "../data/static-resolver.js";

const RESULT_BATCH_SIZE = 200;
const SUGGESTION_LIMIT = 12;
const PLEIADES_PLACE_TYPES = "https://pleiades.stoa.org/vocabularies/place-types/";
const PLEIADES_PLACES = "https://pleiades.stoa.org/places/";

export function initializePleiadesSearch({ onMapSelected, onMapAll, onError }) {
  const root = document.getElementById("pleiades-search");
  if (!root) return createEmptyController();

  const idInput = root.querySelector("#browse-id-query");
  const idSuggestions = root.querySelector("#browse-id-suggestions");
  const nameInput = root.querySelector("#browse-name-query");
  const nameSuggestions = root.querySelector("#browse-name-suggestions");
  const typeInput = root.querySelector("#browse-type-query");
  const typeSuggestions = root.querySelector("#browse-type-suggestions");
  const idSelectionSummary = root.querySelector("#browse-id-selection-summary");
  const nameSelectionSummary = root.querySelector("#browse-name-selection-summary");
  const typeSelectionSummary = root.querySelector("#browse-type-selection-summary");
  const periodInput = root.querySelector("#browse-period-query");
  const periodSuggestions = root.querySelector("#browse-period-suggestions");
  const periodSelectionSummary = root.querySelector("#browse-period-selection-summary");
  const typeRelationshipInputs = [
    ...root.querySelectorAll('input[name="browse-type-relationship"]'),
  ];
  const typeRelationshipGroup = root.querySelector("#browse-radio-group");
  const typeOptions = root.querySelector("#browse-place-type__options");
  const narrowTypesInput = root.querySelector("#browse-narrow-types");
  const narrowRow = root.querySelector("#browse-narrow-row");
  const narrowPeriodsInput = root.querySelector("#browse-narrow-periods");
  const narrowPeriodRow = root.querySelector("#browse-narrow-period-row");
  const clearSearchInputButtons = root.querySelectorAll(".clear-search-btn");
  const clearButton = root.querySelector("#browse-clear-all");
  const infoButton = root.querySelector("#browse-info");
  const infoPopover = root.querySelector("#browse-info-popover");
  const loading = root.querySelector("#browse-loading");
  const resultSummary = root.querySelector("#pleiades-search-summary");
  const resultSummarySelectionActions = root.querySelector("#pleiades-results-selection-actions");
  const resultList = root.querySelector("#pleiades-search-results");
  const allButton = root.querySelector("#pleiades-results-all");
  const noneButton = root.querySelector("#pleiades-results-none");
  const moreButton = root.querySelector("#pleiades-results-more");
  const mapButton = root.querySelector("#pleiades-map-selected");
  const selectedCount = root.querySelector("#browse-selected-count");
  const mapAllButton = document.getElementById("browse-map-all");

  let corpus = null;
  let types = null;
  let typeCounts = [];
  let distinctNames = [];
  let timePeriods = [];
  let periodPlaces = [];
  let currentResults = [];
  let renderedCount = 0;
  let loadPromise = null;

  const selectedBrowseIds = new Set();
  const selectedNames = new Set();
  const selectedTypeIndexes = new Set();
  const selectedPeriodIndexes = new Set();
  const resultSelection = new Map();

  function setLoading(isLoading) {
    loading.hidden = !isLoading;
  }

  function ensureLoaded() {
    if (corpus && types) return Promise.resolve();
    if (loadPromise) return loadPromise;

    setLoading(true);
    loadPromise = Promise.all([
      loadPleiadesSearchCorpus(),
      loadPleiadesPlaceTypes(),
      loadPleiadesPlaceNames(),
      loadPleiadesTypeCounts(),
      loadPleiadesTimePeriods(),
      loadPleiadesPeriodPlaces(),
    ])
      .then(([loadedCorpus, loadedTypes, loadedNames, loadedTypeCounts, loadedPeriods, loadedPeriodPlaces]) => {
        corpus = loadedCorpus;
        types = loadedTypes;
        distinctNames = loadedNames;
        typeCounts = loadedTypeCounts;
        timePeriods = loadedPeriods;
        periodPlaces = loadedPeriodPlaces;
        if (typeCounts.length !== types.length) {
          throw new Error("Pleiades type-count index does not match the place-type index.");
        }
      })
      .finally(() => setLoading(false));

    return loadPromise;
  }

  function getTypeRelationship() {
    return typeRelationshipInputs.find((input) => input.checked)?.value === "and" ? "and" : "or";
  }

  function updateResults() {
    if (!corpus) return;

    currentResults = buildBrowseResults(corpus, {
      selectedIds: selectedBrowseIds,
      selectedNames,
      selectedTypeIndexes,
      typeRelationship: getTypeRelationship(),
      narrowByTypes: narrowTypesInput.checked,
      selectedPeriodPlaceIds: getSelectedPeriodPlaceIds(),
      narrowByPeriods: narrowPeriodsInput.checked,
    });

    for (const record of currentResults) {
      const id = String(record[0]);
      if (!resultSelection.has(id)) resultSelection.set(id, true);
    }

    updateNarrowVisibility();
    renderedCount = 0;
    renderResults(true);
  }

  function renderIdSuggestions() {
    if (!corpus) return;
    const query = idInput.value.trim();
    idSuggestions.replaceChildren();

    if (!/^\d+$/.test(query)) {
      idSuggestions.hidden = true;
      return;
    }

    const matches = suggestPleiadesIds(corpus, query, SUGGESTION_LIMIT);
    if (matches.length) {
      idSuggestions.append(
        createSuggestionHeader(() => {
          idInput.value = "";
          idSuggestions.hidden = true;
          idInput.focus();
        }),
      );
    }
    for (const record of matches) {
      const id = String(record[0]);
      idSuggestions.append(
        createSuggestionCheckbox({
          checked: selectedBrowseIds.has(id),
          label: `${id} — ${record[1] || "[ Untitled ]"}`,
          onChange(checked) {
            setMembership(selectedBrowseIds, id, checked);
            renderSelectionSummaries();
            updateResults();
          },
        }),
      );
    }

    idSuggestions.hidden = matches.length === 0;
  }

  function renderNameSuggestions() {
    if (!corpus) return;
    const query = normalize(nameInput.value);
    nameSuggestions.replaceChildren();

    if (!query) {
      nameSuggestions.hidden = true;
      return;
    }

    const matches = distinctNames
      .filter((name) => normalize(name).includes(query))
      .slice(0, SUGGESTION_LIMIT);

    if (matches.length) {
      nameSuggestions.append(
        createSuggestionHeader(() => {
          nameInput.value = "";
          nameSuggestions.hidden = true;
          nameInput.focus();
        }),
      );
    }
    for (const name of matches) {
      nameSuggestions.append(
        createSuggestionCheckbox({
          checked: selectedNames.has(name),
          label: name,
          onChange(checked) {
            setMembership(selectedNames, name, checked);
            renderSelectionSummaries();
            updateResults();
          },
        }),
      );
    }

    nameSuggestions.hidden = matches.length === 0;
  }

  function renderTypeSuggestions() {
    if (!types) return;
    const query = normalize(typeInput.value);
    typeSuggestions.replaceChildren();

    if (!query) {
      typeSuggestions.hidden = true;
    periodSuggestions.hidden = true;
      return;
    }

    const matches = types
      .map(([key, term], index) => ({ key, term, index, count: typeCounts[index] || 0 }))
      .filter(({ key, term, count }) => count > 0 && (normalize(term).includes(query) || normalize(key).includes(query)))
      .sort(
        (a, b) => b.count - a.count || a.term.localeCompare(b.term, undefined, { numeric: true }),
      )
      .slice(0, SUGGESTION_LIMIT);

    if (matches.length) {
      typeSuggestions.append(
        createSuggestionHeader(() => {
          typeInput.value = "";
          typeSuggestions.hidden = true;
          typeInput.focus();
        }),
      );
    }
    for (const { term, index, count } of matches) {
      typeSuggestions.append(
        createSuggestionCheckbox({
          checked: selectedTypeIndexes.has(index),
          label: term,
          detail: count.toLocaleString(),
          onChange(checked) {
            setMembership(selectedTypeIndexes, index, checked);
            renderSelectionSummaries();
            updateResults();
          },
        }),
      );
    }

    typeSuggestions.hidden = matches.length === 0;
  }

  function getSelectedPeriodPlaceIds() {
    const ids = new Set();
    for (const index of selectedPeriodIndexes) {
      for (const id of periodPlaces[index] ?? []) ids.add(String(id));
    }
    return ids;
  }

  function renderPeriodSuggestions() {
    if (!timePeriods.length) return;
    const query = normalize(periodInput.value);
    periodSuggestions.replaceChildren();
    if (!query) { periodSuggestions.hidden = true; return; }
    const matches = timePeriods.map(([key, term], index) => ({ key, term, index, count: (periodPlaces[index] ?? []).length }))
      .filter(({ key, term, count }) => count > 0 && (normalize(term).includes(query) || normalize(key).includes(query)))
      .sort((a,b) => b.count - a.count || a.term.localeCompare(b.term, undefined, {numeric:true}))
      .slice(0, SUGGESTION_LIMIT);
    if (matches.length) periodSuggestions.append(createSuggestionHeader(() => { periodInput.value = ""; periodSuggestions.hidden = true; periodInput.focus(); }));
    for (const {term,index,count} of matches) {
      periodSuggestions.append(createSuggestionCheckbox({ checked: selectedPeriodIndexes.has(index), label: term, detail: count.toLocaleString(), onChange(checked) { setMembership(selectedPeriodIndexes,index,checked); renderSelectionSummaries(); updateResults(); } }));
    }
    periodSuggestions.hidden = matches.length === 0;
  }

  function renderSelectionSummaries() {
    renderSelectionCount(idSelectionSummary, selectedBrowseIds.size);
    renderSelectionCount(nameSelectionSummary, selectedNames.size);
    renderSelectionCount(typeSelectionSummary, selectedTypeIndexes.size);
    renderSelectionCount(periodSelectionSummary, selectedPeriodIndexes.size);
    narrowTypesInput.disabled = selectedTypeIndexes.size === 0;
    narrowPeriodsInput.disabled = selectedPeriodIndexes.size === 0;
  }

  function updateNarrowVisibility() {
    const hasIdOrName = selectedBrowseIds.size > 0 || selectedNames.size > 0;
    const hasTypes = selectedTypeIndexes.size > 0;
    const hasPeriods = selectedPeriodIndexes.size > 0;
    const hasTypesToCompare = selectedTypeIndexes.size > 1;
    typeRelationshipGroup.hidden = !hasTypesToCompare;
    narrowRow.hidden = !(hasTypes && (hasIdOrName || hasPeriods));
    narrowPeriodRow.hidden = !(hasPeriods && (hasIdOrName || hasTypes));
    typeOptions.hidden = narrowRow.hidden && narrowPeriodRow.hidden && typeRelationshipGroup.hidden;
    if (!hasTypes) narrowTypesInput.checked = false;
    if (!hasPeriods) narrowPeriodsInput.checked = false;
  }

  function renderResults(reset = false) {
    if (reset) resultList.replaceChildren();

    const next = currentResults.slice(renderedCount, renderedCount + RESULT_BATCH_SIZE);
    for (const record of next) resultList.append(createResultRow(record));
    renderedCount += next.length;

    renderResultSummaryOnly();
    moreButton.hidden = renderedCount >= currentResults.length;
    allButton.disabled = currentResults.length === 0;
    noneButton.disabled = currentResults.length === 0;
  }

  function createResultRow(record) {
    const [id, title, lat, lng, typeIndexes] = record;
    const row = document.createElement("label");
    row.className = "pleiades-search__result";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = resultSelection.get(String(id)) !== false;
    checkbox.addEventListener("change", () => {
      resultSelection.set(String(id), checkbox.checked);
      renderResultSummaryOnly();
    });

    const body = document.createElement("span");
    body.className = "pleiades-search__result-body";
    const typeNames = typeIndexes.map((index) => types[index]?.[1]).filter(Boolean);

    const titleElement = document.createElement("strong");
    titleElement.className = "pleiades-search__result-title";
    titleElement.textContent = title || "[ Untitled ]";
    titleElement.title = title || "[ Untitled ]";

    const meta = document.createElement("span");
    meta.className = "pleiades-search__result-meta";

    const idElement = document.createElement("span");
    idElement.className = "pleiades-search__result-id";
    idElement.textContent = `ID ${id}`;

    const externalLink = document.createElement("a");
    externalLink.className = "pleiades-search__result-link";
    externalLink.href = `${PLEIADES_PLACES}${encodeURIComponent(id)}`;
    externalLink.target = "_blank";
    externalLink.rel = "noopener noreferrer";
    externalLink.textContent = "↗";
    externalLink.title = `Open Pleiades place ${id}`;
    externalLink.setAttribute("aria-label", `Open Pleiades place ${id}`);
    externalLink.addEventListener("click", (event) => event.stopPropagation());

    const separator = document.createElement("span");
    separator.className = "pleiades-search__result-separator";
    separator.textContent = "|";

    const coordinates = document.createElement("span");
    coordinates.textContent = formatCoordinates(lat, lng);

    meta.append(idElement, externalLink, separator, coordinates);
    body.append(titleElement, meta);

    if (typeNames.length) {
      const typeLine = document.createElement("span");
      typeLine.textContent = typeNames.join(" · ");
      body.append(typeLine);
    }

    row.append(checkbox, body);
    return row;
  }

  function renderResultSummaryOnly() {
    const selected = getSelectedResultIds().length;

    resultSummary.textContent = currentResults.length
      ? `${currentResults.length.toLocaleString()} mappable places`
      : hasBrowseCriteria()
        ? "No places found."
        : "";

    resultSummarySelectionActions.hidden = !hasBrowseCriteria();
    if (selectedCount) selectedCount.textContent = `${selected.toLocaleString()} selected`;
    mapButton.disabled = selected === 0;
    mapButton.textContent =
      selected === 1 ? "Map 1 place" : `Map ${selected.toLocaleString()} places`;
  }

  function setAllSelected(selected) {
    for (const record of currentResults) resultSelection.set(String(record[0]), selected);
    for (const checkbox of resultList.querySelectorAll('input[type="checkbox"]'))
      checkbox.checked = selected;
    renderResultSummaryOnly();
  }

  function getSelectedResultIds() {
    return currentResults
      .map((record) => String(record[0]))
      .filter((id) => resultSelection.get(id) !== false);
  }

  function hasBrowseCriteria() {
    return selectedBrowseIds.size > 0 || selectedNames.size > 0 || selectedTypeIndexes.size > 0 || selectedPeriodIndexes.size > 0;
  }

  function clearSuggestions() {
    idSuggestions.hidden = true;
    nameSuggestions.hidden = true;
    typeSuggestions.hidden = true;
  }

  function clearAll() {
    selectedBrowseIds.clear();
    selectedNames.clear();
    selectedTypeIndexes.clear();
    selectedPeriodIndexes.clear();
    resultSelection.clear();
    idInput.value = "";
    nameInput.value = "";
    typeInput.value = "";
    periodInput.value = "";
    narrowTypesInput.checked = false;
    narrowPeriodsInput.checked = false;
    narrowTypesInput.disabled = true;
    typeRelationshipInputs.forEach((input) => {
      input.checked = input.value === "or";
    });
    clearSuggestions();
    renderSelectionSummaries();
    updateResults();
  }

  async function open() {
    try {
      await ensureLoaded();
      renderSelectionSummaries();
      updateNarrowVisibility();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
  }

  function openAndRender(render) {
    return open().then(render);
  }

  idInput.addEventListener("input", () => openAndRender(renderIdSuggestions));
  idInput.addEventListener("focus", () => {
    if (idInput.value.trim()) openAndRender(renderIdSuggestions);
  });
  nameInput.addEventListener("input", () => openAndRender(renderNameSuggestions));
  nameInput.addEventListener("focus", () => {
    if (nameInput.value.trim()) openAndRender(renderNameSuggestions);
  });
  typeInput.addEventListener("input", () => openAndRender(renderTypeSuggestions));
  typeInput.addEventListener("focus", () => {
    if (typeInput.value.trim()) openAndRender(renderTypeSuggestions);
  });
  periodInput.addEventListener("input", () => openAndRender(renderPeriodSuggestions));
  periodInput.addEventListener("focus", () => { if (periodInput.value.trim()) openAndRender(renderPeriodSuggestions); });

  clearSearchInputButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.previousElementSibling;
      button.hidden = input.value.length === 0;

      if (input && input.tagName === "INPUT") {
        input.value = "";
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });

  typeRelationshipInputs.forEach((input) => input.addEventListener("change", updateResults));
  narrowTypesInput.addEventListener("change", updateResults);
  narrowPeriodsInput.addEventListener("change", updateResults);
  clearButton.addEventListener("click", clearAll);
  allButton.addEventListener("click", () => setAllSelected(true));
  noneButton.addEventListener("click", () => setAllSelected(false));
  moreButton.addEventListener("click", () => renderResults(false));
  mapButton.addEventListener("click", () => onMapSelected?.(getSelectedResultIds()));

  mapAllButton?.addEventListener("click", async () => {
    try {
      await ensureLoaded();
      onMapAll?.(corpus.map((record) => String(record[0])));
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
  });

  infoButton.addEventListener("click", () => {
    const willOpen = infoPopover.hidden;
    infoPopover.hidden = !willOpen;
    infoButton.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target.closest?.(".browse-suggestions")) return;
    if (target === idInput || target === nameInput || target === typeInput) return;
    clearSuggestions();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    clearSuggestions();
    infoPopover.hidden = true;
    infoButton.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("click", (event) => {
    if (infoPopover.hidden) return;
    if (
      event.target === infoButton ||
      infoButton.contains(event.target) ||
      infoPopover.contains(event.target)
    )
      return;
    infoPopover.hidden = true;
    infoButton.setAttribute("aria-expanded", "false");
  });

  function preload() {
    return ensureLoaded().catch((error) => {
      onError?.(error instanceof Error ? error.message : String(error));
    });
  }

  async function mapPlaceType(typeName) {
    await ensureLoaded();
    const index = types.findIndex(([key]) => key === typeName);
    if (index < 0) {
      throw new Error(`Unknown Pleiades feature category: ${typeName}`);
    }

    clearAll();
    selectedTypeIndexes.add(index);
    renderSelectionSummaries();
    updateResults();
    onMapSelected?.(getSelectedResultIds());
  }

  return { open, preload, clear: clearAll, mapPlaceType };
}

export function suggestPleiadesIds(records, query, limit = SUGGESTION_LIMIT) {
  const normalized = String(query ?? "").trim();
  if (!/^\d+$/.test(normalized)) return [];
  return records.filter((record) => String(record[0]).startsWith(normalized)).slice(0, limit);
}

export function searchPleiadesRecords(records, query) {
  const normalized = normalize(query);
  if (!normalized) return [];
  const numeric = /^\d+$/.test(normalized);
  return records.filter((record) =>
    numeric ? String(record[0]).startsWith(normalized) : normalize(record[1]).includes(normalized),
  );
}

export function buildBrowseResults(
  records,
  {
    selectedIds = new Set(),
    selectedNames = new Set(),
    selectedTypeIndexes = new Set(),
    typeRelationship = "or",
    narrowByTypes = false,
    selectedPeriodPlaceIds = new Set(),
    narrowByPeriods = false,
  } = {},
) {
  const ids = new Set([...selectedIds].map(String));
  const names = new Set(selectedNames);
  const typeIndexes = new Set(selectedTypeIndexes);
  const hasIdOrName = ids.size > 0 || names.size > 0;
  const hasTypes = typeIndexes.size > 0;
  const periodIds = new Set([...selectedPeriodPlaceIds].map(String));
  const hasPeriods = periodIds.size > 0;

  if (!hasIdOrName && !hasTypes && !hasPeriods) return [];

  return records.filter((record) => {
    const idOrNameMatch = ids.has(String(record[0])) || names.has(record[1]);
    const typeMatch = matchesSelectedTypes(record[4], typeIndexes, typeRelationship);
    const periodMatch = periodIds.has(String(record[0]));
    const matches = [];
    if (hasIdOrName) matches.push(idOrNameMatch);
    if (hasTypes) matches.push(typeMatch);
    if (hasPeriods) matches.push(periodMatch);
    if (narrowByTypes && hasTypes && (hasIdOrName || hasPeriods)) {
      const other = (hasIdOrName && idOrNameMatch) || (hasPeriods && periodMatch);
      if (!(typeMatch && other)) return false;
    }
    if (narrowByPeriods && hasPeriods && (hasIdOrName || hasTypes)) {
      const other = (hasIdOrName && idOrNameMatch) || (hasTypes && typeMatch);
      if (!(periodMatch && other)) return false;
    }
    return matches.some(Boolean);
  });
}

export function matchesSelectedTypes(recordTypeIndexes, selectedTypeIndexes, relationship = "or") {
  if (selectedTypeIndexes.size === 0) return true;
  if (relationship === "and") {
    return [...selectedTypeIndexes].every((index) => recordTypeIndexes.includes(index));
  }
  return [...selectedTypeIndexes].some((index) => recordTypeIndexes.includes(index));
}

export function formatCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Unlocated";
  const latHemisphere = lat < 0 ? "S" : "N";
  const lngHemisphere = lng < 0 ? "W" : "E";
  return `${Math.abs(lat).toFixed(4)}° ${latHemisphere}, ${Math.abs(lng).toFixed(4)}° ${lngHemisphere}`;
}

function createSuggestionHeader(onDone) {
  const header = document.createElement("div");
  header.className = "browse-suggestions__header";

  const text = document.createElement("span");
  text.textContent = "Suggestions";

  const done = document.createElement("button");
  done.type = "button";
  done.textContent = "Done";
  done.addEventListener("click", onDone);

  header.append(text, done);
  return header;
}

function createSuggestionCheckbox({ checked, label, detail = null, onChange }) {
  const row = document.createElement("label");
  row.className = "browse-suggestion";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.addEventListener("change", () => onChange(checkbox.checked));

  const text = document.createElement("span");
  text.className = "browse-suggestion__label";
  text.textContent = label;
  text.title = label;
  row.append(checkbox, text);

  if (detail !== null) {
    const count = document.createElement("strong");
    count.textContent = detail;
    row.append(count);
  }

  return row;
}

function renderSelectionCount(element, count) {
  if (!element) return;
  element.textContent = `${count.toLocaleString()} selected`;
}

function setMembership(set, value, included) {
  if (included) set.add(value);
  else set.delete(value);
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function createEmptyController() {
  return { async open() {}, async preload() {}, clear() {} };
}

export { PLEIADES_PLACE_TYPES };
