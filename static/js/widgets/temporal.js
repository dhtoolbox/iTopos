import {
  loadPleiadesConfidences,
  loadPleiadesTemporalPlaces,
  loadPleiadesTimePeriods,
} from "../data/static-resolver.js";
import { openHelp } from "./help.js";

const DEFAULT_DISPLAYED_PERIODS = 5;
const MIN_PLAYBACK_PERIODS = 2;
const PLAYBACK_MS = 1100;

export function buildTemporalModel(records, periods, allowedConfidenceIndexes = new Set([0])) {
  const usedPeriods = new Set();
  const locationRecords = [];
  const nameRecords = [];

  for (const [placeId, record] of records) {
    for (const location of record.locations ?? []) {
      const attestations = filterAttestations(location.attestations, allowedConfidenceIndexes);
      if (!attestations.length) continue;
      attestations.forEach(([period]) => usedPeriods.add(period));
      locationRecords.push({ placeId, types: location.types ?? [], attestations });
    }
    for (const name of record.names ?? []) {
      const attestations = filterAttestations(name.attestations, allowedConfidenceIndexes);
      if (!attestations.length) continue;
      attestations.forEach(([period]) => usedPeriods.add(period));
      nameRecords.push({ placeId, attestations });
    }
  }

  const periodStats = [...usedPeriods]
    .map((periodIndex) => {
      const period = periods[periodIndex];
      if (!period || !Number.isFinite(period[2]) || !Number.isFinite(period[3])) return null;
      const locations = locationRecords.filter((record) => hasPeriod(record, periodIndex));
      const names = nameRecords.filter((record) => hasPeriod(record, periodIndex));
      const placeIds = new Set([...locations, ...names].map((record) => record.placeId));
      return {
        periodIndex,
        start: period[2],
        end: period[3],
        places: placeIds.size,
        locations: locations.length,
        names: names.length,
        evidence: locations.length + names.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.periodIndex - b.periodIndex);

  if (!periodStats.length) return null;
  return { periodStats, locationRecords, nameRecords, periods };
}

export function chooseInitialPeriodIndexes(
  periodStats,
  count = DEFAULT_DISPLAYED_PERIODS,
  rng = Math.random,
) {
  if (periodStats.length <= count) return periodStats.map((item) => item.periodIndex);

  const byStart = [...periodStats].sort((a, b) => a.start - b.start || a.end - b.end);
  const corpusStart = Math.min(...periodStats.map((item) => item.start));
  const corpusEnd = Math.max(...periodStats.map((item) => item.end));
  const corpusMidpoint = (corpusStart + corpusEnd) / 2;
  const highestCoverage = [...periodStats].sort(
    (a, b) => b.places - a.places || b.evidence - a.evidence,
  )[0];
  const earliest = byStart[0];
  const latest = byStart[byStart.length - 1];
  const middle = [...periodStats].sort(
    (a, b) =>
      Math.abs((a.start + a.end) / 2 - corpusMidpoint) -
      Math.abs((b.start + b.end) / 2 - corpusMidpoint),
  )[0];

  const chosen = [];
  const add = (item) => {
    if (item && !chosen.includes(item.periodIndex)) chosen.push(item.periodIndex);
  };
  [highestCoverage, earliest, middle, latest].forEach(add);

  const remaining = () => periodStats.filter((item) => !chosen.includes(item.periodIndex));
  while (chosen.length < count && remaining().length) {
    const pool = remaining();
    add(pool[Math.floor(rng() * pool.length)] ?? pool[0]);
  }
  return chosen;
}

export function retainPeriodIndexesByKey(periodIndexes, previousKeys, periods) {
  return periodIndexes.filter((index) => previousKeys.has(periods[index]?.[0]));
}

export function groupDisplayedPeriods(periodIndexes, periodStats) {
  const statsByIndex = new Map(periodStats.map((item) => [item.periodIndex, item]));
  const groups = new Map();
  for (const periodIndex of periodIndexes) {
    const stat = statsByIndex.get(periodIndex);
    if (!stat) continue;
    const key = `${stat.start}:${stat.end}`;
    if (!groups.has(key))
      groups.set(key, { start: stat.start, end: stat.end, periodIndexes: [], places: new Set() });
    groups.get(key).periodIndexes.push(periodIndex);
  }
  return [...groups.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function packPeriodGroups(groups) {
  const lanes = [];
  for (const group of groups) {
    let laneIndex = lanes.findIndex((lane) => lane.end <= group.start);
    if (laneIndex < 0) {
      laneIndex = lanes.length;
      lanes.push({ end: group.end });
    } else {
      lanes[laneIndex].end = group.end;
    }
    group.lane = laneIndex;
  }
  return { groups, laneCount: lanes.length };
}

export function summarizeTemporalPeriods(model, selectedPeriodIndexes) {
  const selected = new Set(selectedPeriodIndexes);
  if (!model || !selected.size) {
    return { places: 0, locations: 0, names: 0, types: 0, periods: 0 };
  }
  const activeLocations = model.locationRecords.filter((record) =>
    record.attestations.some(([period]) => selected.has(period)),
  );
  const activeNames = model.nameRecords.filter((record) =>
    record.attestations.some(([period]) => selected.has(period)),
  );
  const placeIds = new Set([...activeLocations, ...activeNames].map((record) => record.placeId));
  const typeIndexes = new Set(activeLocations.flatMap((record) => record.types));
  return {
    places: placeIds.size,
    locations: activeLocations.length,
    names: activeNames.length,
    types: typeIndexes.size,
    periods: selected.size,
  };
}

export function buildTemporalPlaceEvidence(
  records,
  periods,
  confidences,
  selectedPeriodIndexes,
  allowedConfidenceIndexes,
) {
  const selected = new Set(selectedPeriodIndexes);
  const allowed = new Set(allowedConfidenceIndexes);
  const result = new Map();

  for (const [placeId, record] of records) {
    const matrix = new Map();
    let activeLocations = 0;
    let activeNames = 0;

    const addEvidence = (kind, attestations = []) => {
      const active = attestations.some(
        ([periodIndex, confidenceIndex]) =>
          selected.has(periodIndex) && allowed.has(confidenceIndex),
      );
      if (active) {
        if (kind === "location") activeLocations += 1;
        else activeNames += 1;
      }

      for (const [periodIndex, confidenceIndex] of attestations) {
        const period = periods[periodIndex];
        const confidence = confidences[confidenceIndex];
        if (!period || !confidence) continue;
        if (!matrix.has(periodIndex)) matrix.set(periodIndex, new Map());
        const byConfidence = matrix.get(periodIndex);
        if (!byConfidence.has(confidenceIndex)) {
          byConfidence.set(confidenceIndex, { locations: 0, names: 0 });
        }
        const counts = byConfidence.get(confidenceIndex);
        if (kind === "location") counts.locations += 1;
        else counts.names += 1;
      }
    };

    for (const location of record.locations ?? []) addEvidence("location", location.attestations);
    for (const name of record.names ?? []) addEvidence("name", name.attestations);

    const temporalRows = [...matrix.entries()]
      .map(([periodIndex, byConfidence]) => ({
        periodIndex,
        term: periods[periodIndex]?.[1] ?? periods[periodIndex]?.[0] ?? String(periodIndex),
        start: periods[periodIndex]?.[2],
        end: periods[periodIndex]?.[3],
        selected: selected.has(periodIndex),
        confidences: [...byConfidence.entries()].map(([confidenceIndex, counts]) => ({
          confidenceIndex,
          confidence: confidences[confidenceIndex],
          allowed: allowed.has(confidenceIndex),
          ...counts,
        })),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end || a.periodIndex - b.periodIndex);

    result.set(String(placeId), {
      active: activeLocations + activeNames > 0,
      attestedLocations: (record.locations ?? []).filter((item) => (item.attestations ?? []).length)
        .length,
      attestedNames: (record.names ?? []).filter((item) => (item.attestations ?? []).length).length,
      activeLocations,
      activeNames,
      totalLocations: record.total_locations ?? (record.locations ?? []).length,
      totalNames: record.total_names ?? (record.names ?? []).length,
      temporalRows,
    });
  }

  return result;
}

function filterAttestations(attestations = [], allowed) {
  return attestations.filter(
    (attestation) => Array.isArray(attestation) && allowed.has(attestation[1]),
  );
}

function hasPeriod(record, periodIndex) {
  return record.attestations.some(([period]) => period === periodIndex);
}

export function buildNiceTicks(start, end, interiorCount = 3) {
  const span = end - start;
  if (!(span > 0) || interiorCount < 1) return [];
  const rough = span / (interiorCount + 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const first = Math.ceil(start / step) * step;
  const ticks = [];
  for (let value = first; value < end && ticks.length < interiorCount + 2; value += step) {
    if (value > start) ticks.push(value);
  }
  if (ticks.length > interiorCount) {
    const stride = Math.ceil(ticks.length / interiorCount);
    return ticks.filter((_, index) => index % stride === 0).slice(0, interiorCount);
  }
  return ticks;
}

export function chronologicalPercent(year, start, end) {
  if (!(end > start)) return 0;
  return ((year - start) / (end - start)) * 100;
}

export function buildTemporalScale(start, end, boundaries = []) {
  const span = end - start;
  const values = [...new Set([start, ...boundaries, end].filter(Number.isFinite))]
    .filter((value) => value >= start && value <= end)
    .sort((a, b) => a - b);

  let breakStart = null;
  let breakEnd = null;
  let largestGap = 0;
  for (let index = 1; index < values.length; index += 1) {
    const gap = values[index] - values[index - 1];
    if (gap > largestGap) {
      largestGap = gap;
      breakStart = values[index - 1];
      breakEnd = values[index];
    }
  }

  const hasBreak =
    values.length > 2 && span > 0 && largestGap >= 10000 && largestGap / span >= 0.35;
  if (!hasBreak) {
    return {
      hasBreak: false,
      percent: (year) => chronologicalPercent(year, start, end),
      yearAtPercent: (percent) => start + (percent / 100) * span,
    };
  }

  const breakPercent = 4;
  const leftSpan = Math.max(0, breakStart - start);
  const rightSpan = Math.max(0, end - breakEnd);
  const visibleSpan = leftSpan + rightSpan || 1;
  const leftPercent = (100 - breakPercent) * (leftSpan / visibleSpan);
  const breakLeft = leftPercent;
  const breakRight = leftPercent + breakPercent;

  function percent(year) {
    if (year <= breakStart) {
      return leftSpan ? ((year - start) / leftSpan) * leftPercent : 0;
    }
    if (year >= breakEnd) {
      return breakRight + (rightSpan ? ((year - breakEnd) / rightSpan) * (100 - breakRight) : 0);
    }
    return breakLeft + ((year - breakStart) / largestGap) * breakPercent;
  }

  function yearAtPercent(value) {
    if (value <= breakLeft) {
      return start + (leftPercent ? value / leftPercent : 0) * leftSpan;
    }
    if (value >= breakRight) {
      return (
        breakEnd + (100 - breakRight ? (value - breakRight) / (100 - breakRight) : 0) * rightSpan
      );
    }
    return breakStart + ((value - breakLeft) / breakPercent) * largestGap;
  }

  return { hasBreak: true, breakStart, breakEnd, breakLeft, breakRight, percent, yearAtPercent };
}

export function initializeTemporalWidget({
  onVisibilityChange,
  onRangeChange,
  onEnabledChange,
} = {}) {
  const root = document.getElementById("temporal-widget");
  if (!root)
    return {
      loadDataset() {},
      setEnabled() {},
      isEnabled() {
        return false;
      },
      destroy() {},
    };

  let timer = null;
  let isPlaying = false;
  let model = null;
  let availableModel = null;
  let periods = [];
  let records = new Map();
  let confidences = [];
  let displayed = new Set();
  let selected = new Set();
  let playbackOrder = [];
  let playbackIndex = 0;
  let playbackSet = [];
  let playingPeriodIndex = null;
  let expanded = false;
  let minimized = false;
  let filteringDisabled = false;
  let pendingSummaryFrame = null;
  let allowedConfidenceIndexes = new Set([0]);
  let enabled = true;
  let loaded = false;

  async function loadDataset(dataset) {
    stop();
    root.hidden = true;
    root.replaceChildren();
    const ids = dataset.places.map((place) => place.id);
    [periods, confidences, records] = await Promise.all([
      loadPleiadesTimePeriods(),
      loadPleiadesConfidences(),
      loadPleiadesTemporalPlaces(ids),
    ]);
    availableModel = buildTemporalModel(
      records,
      periods,
      new Set(confidences.map((_, index) => index)),
    );
    displayed = new Set();
    selected = new Set();
    loaded = true;
    rebuild(false, false);
  }

  function rebuild(includeAllConfidence = false, preserveDisplayed = true) {
    const previousDisplayedKeys = preserveDisplayed
      ? new Set([...displayed].map((index) => periods[index]?.[0]).filter(Boolean))
      : new Set();
    const previousSelectedKeys = preserveDisplayed
      ? new Set([...selected].map((index) => periods[index]?.[0]).filter(Boolean))
      : new Set();
    if (includeAllConfidence)
      allowedConfidenceIndexes = new Set(confidences.map((_, index) => index));
    if (!allowedConfidenceIndexes.size) {
      allowedConfidenceIndexes = new Set(
        confidences.flatMap((value, index) => (value.startsWith("confident") ? [index] : [])),
      );
    }
    const allowed = new Set(allowedConfidenceIndexes);
    const filteredModel = buildTemporalModel(records, periods, allowed);

    // The period score belongs to the mapped dataset, not to the current
    // confidence filter. Confidence changes which evidence is active; it must
    // not make the widget or its available periods disappear.
    if (!availableModel) {
      const placeEvidence = buildTemporalPlaceEvidence(
        records,
        periods,
        confidences,
        [],
        allowedConfidenceIndexes,
      );
      root.hidden = true;
      root.replaceChildren();
      onVisibilityChange?.(false);
      onRangeChange?.({
        periodIndexes: [],
        allowedConfidenceIndexes: [...allowedConfidenceIndexes],
        summary: { places: 0, locations: 0, names: 0, types: 0, periods: 0 },
        placeEvidence,
        periods,
        confidences,
        disabled: true,
      });
      return;
    }

    model = filteredModel ?? {
      ...availableModel,
      locationRecords: [],
      nameRecords: [],
    };
    model.periodStats = availableModel.periodStats;

    const available = new Set(availableModel.periodStats.map((item) => item.periodIndex));
    const retained = availableModel.periodStats
      .filter((item) => previousDisplayedKeys.has(periods[item.periodIndex]?.[0]))
      .map((item) => item.periodIndex);
    const initial = retained.length
      ? retained
      : chooseInitialPeriodIndexes(availableModel.periodStats);
    displayed = new Set(initial.filter((index) => available.has(index)));
    selected = preserveDisplayed
      ? new Set(
          retainPeriodIndexesByKey(
            availableModel.periodStats.map((item) => item.periodIndex),
            previousSelectedKeys,
            periods,
          ),
        )
      : new Set(displayed);
    playbackIndex = 0;
    render(includeAllConfidence);
    root.hidden = !enabled;
    onVisibilityChange?.(enabled);
  }

  function render(includeAllConfidence) {
    const arrowImg = minimized
      ? '<img class="control-icon" src="./static/vendor/icons/angles-up.svg" alt="">'
      : '<img class="control-icon" src="./static/vendor/icons/angles-down.svg" alt="">';
    root.classList.toggle("is-minimized", minimized);
    root.innerHTML = `
      <div class="temporal-widget__sidecar">
        <button type="button" class="temporal-widget__tool temporal-widget__help" data-act="help" aria-label="How to use Temporal Exploration" title="Temporal Exploration help"><img src="./static/vendor/icons/circle-question-solid.svg" alt=""></button>
        <button type="button" class="temporal-widget__tool" data-act="choose" aria-label="Choose time periods" title="Choose time periods"><img src="./static/vendor/icons/clock.svg" alt=""></button>
        <button type="button" class="temporal-widget__tool" data-act="config" aria-label="Temporal settings" title="Temporal settings"><img src="./static/vendor/icons/gear.svg" alt=""></button>
      </div>
      <div class="temporal-widget__heading">
        <span><img src="./static/vendor/icons/globe.svg" alt=""> Temporal Exploration</span>
        <label class="temporal-widget__disable">
          <input type="checkbox" data-act="disable-filter" ${filteringDisabled ? "checked" : ""}> 
          Disable temporal filtering
        </label>
        <button type="button" class="temporal-widget__minimize" data-act="minimize" 
                aria-label="${minimized ? "Expand" : "Minimize"} Temporal Exploration" 
                title="${minimized ? "Expand" : "Minimize"}">${arrowImg}
        </button>
      </div>
      <div class="temporal-widget__body" ${minimized ? "hidden" : ""}>
        <div class="temporal-widget__top"><div class="temporal-widget__stats"></div></div>
        <div class="temporal-widget__score-head"><span class="temporal-widget__score-title">Time periods</span>          
          <div class="temporal-widget__playback-status" aria-live="polite"></div>
          <button type="button" class="temporal-widget__expand" data-act="expand">Expand</button></div>
        <div class="temporal-widget__score-shell"><div class="temporal-widget__score" role="listbox" aria-label="Pleiades time periods" aria-multiselectable="true"></div><div class="temporal-widget__axis" aria-hidden="true"></div></div>
        <div class="temporal-widget__piggyback">
          <div class="temporal-widget__controls"></div>
        </div>
      </div>
      <div class="temporal-widget__chooser" hidden>
        <div class="temporal-widget__chooser-search"><div class="temporal-widget__search-wrap"><input type="search" placeholder="Search time periods…" aria-label="Search time periods"><button type="button" data-act="clear-period-search" class="clear-search-btn" aria-label="Clear time period search">×</button></div><span><button type="button" data-act="all">All</button> | <button type="button" data-act="none">None</button></span></div>
        <div class="temporal-widget__chooser-list"></div><button type="button" data-act="done" class="temporal-widget__chooser-done">Done</button>
      </div>
      <div class="temporal-widget__config" hidden>
        <strong>Attestation confidence</strong><div class="temporal-widget__config-list">${confidences.map((value, index) => `<label><input type="checkbox" data-confidence-index="${index}" ${allowedConfidenceIndexes.has(index) ? "checked" : ""}> ${escapeHtml(String(value).replaceAll("-", " "))}</label>`).join("")}</div>
        <button type="button" data-act="config-done" class="temporal-widget__chooser-done">Done</button>
      </div>`;

    root.addEventListener("click", onRootClick);
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeyDown, true);
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);
    window.removeEventListener("resize", positionChooser);
    window.addEventListener("resize", positionChooser);
    root
      .querySelector(".temporal-widget__chooser input")
      .addEventListener("input", renderChooserList);
    root
      .querySelectorAll("[data-confidence-index]")
      .forEach((input) => input.addEventListener("change", onConfidenceChange));
    root
      .querySelector(".temporal-widget__help")
      .addEventListener("click", () => openHelp("temporal"));
    renderScore();
    renderChooserList();
    if (enabled) {
      updateSummary();
    } else {
      onRangeChange?.({
        periodIndexes: [],
        allowedConfidenceIndexes: [...allowedConfidenceIndexes],
        summary: { places: 0, locations: 0, names: 0, types: 0, periods: 0 },
        placeEvidence: new Map(),
        periods,
        confidences,
        disabled: true,
      });
    }
  }

  function renderScore() {
    const score = root.querySelector(".temporal-widget__score");
    if (!score || !model) return;

    const groups = groupDisplayedPeriods([...displayed], model.periodStats);
    const packed = packPeriodGroups(groups);
    const displayedStats = model.periodStats.filter((item) => displayed.has(item.periodIndex));
    const axis = root.querySelector(".temporal-widget__axis");

    score.classList.toggle("is-expanded", expanded);
    score.replaceChildren();
    axis.replaceChildren();

    if (!displayedStats.length) {
      score.style.height = "24px";
      root.querySelector(".temporal-widget__expand").hidden = true;
      playbackOrder = [];
      renderPlaybackControls();
      return;
    }

    const corpusStart = Math.min(...displayedStats.map((item) => item.start));
    const corpusEnd = Math.max(...displayedStats.map((item) => item.end));
    const boundaries = displayedStats.flatMap((item) => [item.start, item.end]);
    const scale = buildTemporalScale(corpusStart, corpusEnd, boundaries);
    const scorePercent = (year) => 2 + scale.percent(year) * 0.96;

    const tickYears = [
      corpusStart,
      ...[25, 50, 75].map((percent) => Math.round(scale.yearAtPercent(percent))),
      corpusEnd,
    ];
    const uniqueTicks = tickYears.filter(
      (value, index, values) => index === 0 || value !== values[index - 1],
    );

    for (const tick of uniqueTicks) {
      const marker = document.createElement("span");
      marker.className = "temporal-widget__tick";
      marker.style.left = `${scorePercent(tick)}%`;
      marker.innerHTML = `<i></i><b>${formatYear(tick)}</b>`;
      axis.append(marker);
    }

    if (scale.hasBreak) {
      const breakMarker = document.createElement("span");
      breakMarker.className = "temporal-widget__axis-break";
      breakMarker.style.left = `${2 + ((scale.breakLeft + scale.breakRight) / 2) * 0.96}%`;
      breakMarker.title = `${formatYear(scale.breakStart)} to ${formatYear(scale.breakEnd)} compressed`;
      breakMarker.textContent = "//";
      axis.append(breakMarker);
    }

    score.style.setProperty("--temporal-lanes", String(Math.max(1, packed.laneCount)));

    for (const group of packed.groups) {
      const left = scorePercent(group.start);
      const right = scorePercent(group.end);
      const line = document.createElement("button");
      line.type = "button";
      line.className = "temporal-widget__period-line";
      line.dataset.periodIndexes = group.periodIndexes.join(",");
      line.style.left = `${Math.max(0, left)}%`;
      line.style.width = `${Math.max(0.18, right - left)}%`;
      line.style.top = `${group.lane * (expanded ? 22 : 12) + (expanded ? 8 : 5)}px`;
      const isPlaying =
        playingPeriodIndex != null && group.periodIndexes.includes(playingPeriodIndex);
      const isSelected =
        playingPeriodIndex != null
          ? isPlaying
          : group.periodIndexes.every((index) => selected.has(index));
      line.classList.toggle("is-selected", isSelected);
      line.classList.toggle("is-playing", isPlaying);
      line.setAttribute("aria-selected", String(isSelected));
      const names = group.periodIndexes.map((index) => periods[index]?.[1]).filter(Boolean);
      line.title = `${names.join("\n")}\n${formatYear(group.start)} – ${formatYear(group.end)}`;
      line.setAttribute(
        "aria-label",
        `${names.join("; ")}, ${formatYear(group.start)} to ${formatYear(group.end)}`,
      );
      score.append(line);
    }

    if (scale.hasBreak) {
      const scoreBreak = document.createElement("span");
      scoreBreak.className = "temporal-widget__score-break";
      scoreBreak.style.left = `${2 + ((scale.breakLeft + scale.breakRight) / 2) * 0.96}%`;
      scoreBreak.textContent = "//";
      scoreBreak.setAttribute("aria-hidden", "true");
      score.append(scoreBreak);
    }

    const visibleHeight = Math.max(
      24,
      packed.laneCount * (expanded ? 22 : 12) + (expanded ? 14 : 10),
    );
    score.style.height = `${visibleHeight}px`;
    root.querySelector(".temporal-widget__expand").textContent = expanded ? "Collapse" : "Expand";
    root.querySelector(".temporal-widget__expand").hidden = packed.laneCount <= 6;

    playbackOrder = [...displayed].sort((a, b) => {
      const pa = periods[a];
      const pb = periods[b];
      return pa[2] - pb[2] || pa[3] - pb[3] || a - b;
    });
    renderPlaybackControls();
  }

  function renderPlaybackControls() {
    const controls = root.querySelector(".temporal-widget__controls");
    const status = root.querySelector(".temporal-widget__playback-status");
    if (!controls) return;

    if (status) {
      const currentIndexes = playingPeriodIndex != null
        ? [playingPeriodIndex]
        : selected.size === 1
          ? [...selected]
          : [];
      const currentIndex = currentIndexes[0];
      const period = currentIndex != null ? periods[currentIndex] : null;

      if (filteringDisabled) {
        status.textContent = "Temporal filtering disabled";
        status.removeAttribute("title");
      } else if (period) {
        const fullTerm = String(period[1] ?? period[0] ?? "Time period");
        const shortTerm = fullTerm.split("(", 1)[0].trim() || fullTerm;
        status.innerHTML = `<strong>${escapeHtml(shortTerm)}</strong><span>${formatYear(period[2])}–${formatYear(period[3])}</span>`;
        status.title = fullTerm;
      } else if (selected.size) {
        status.textContent = `${selected.size.toLocaleString()} time periods selected`;
        status.removeAttribute("title");
      } else {
        status.textContent = "No time period selected";
        status.removeAttribute("title");
      }
    }

    const candidates = playbackCandidates();
    const canSequence = !filteringDisabled && candidates.length >= MIN_PLAYBACK_PERIODS;
    controls.innerHTML = `
      <button type="button" data-act="rewind" title="First selected time period" ${canSequence ? "" : "disabled"}>|◀</button>
      <button type="button" data-act="play" title="${isPlaying ? "Pause" : "Play selected time periods"}" ${canSequence ? "" : "disabled"}>${isPlaying ? "❚❚" : "▶"}</button>
      <button type="button" data-act="next" title="Next selected time period" ${canSequence ? "" : "disabled"}>▶|</button>
      <button type="button" data-act="stop" title="Stop and restore all displayed time periods" ${filteringDisabled ? "disabled" : ""}>■</button>`;
  }

  function renderChooserList() {
    const list = root.querySelector(".temporal-widget__chooser-list");
    if (!list || !model) return;
    const query = root
      .querySelector(".temporal-widget__chooser input")
      .value.trim()
      .toLocaleLowerCase();
    list.replaceChildren();
    for (const stat of model.periodStats) {
      const period = periods[stat.periodIndex];
      const haystack = `${period[0]} ${period[1]}`.toLocaleLowerCase();
      if (query && !haystack.includes(query)) continue;
      const label = document.createElement("label");
      label.className = "temporal-widget__period-option";
      label.innerHTML = `<input type="checkbox" value="${stat.periodIndex}" ${displayed.has(stat.periodIndex) ? "checked" : ""}><span>${escapeHtml(period[1])}</span><small>${stat.places.toLocaleString()} places</small>`;
      label.querySelector("input").addEventListener("change", (event) => {
        const index = Number(event.target.value);
        stop();
        if (event.target.checked) {
          displayed.add(index);
          selected.add(index);
        } else {
          displayed.delete(index);
          selected.delete(index);
        }
        renderScore();
        updateSummary();
      });
      list.append(label);
    }
  }

  function openConfig() {
    closeChooser();
    const panel = root.querySelector(".temporal-widget__config");
    if (panel) panel.hidden = false;
  }

  function closeConfig() {
    const panel = root.querySelector(".temporal-widget__config");
    if (panel) panel.hidden = true;
  }

  function onConfidenceChange(event) {
    const checked = [...root.querySelectorAll("[data-confidence-index]:checked")].map((input) =>
      Number(input.dataset.confidenceIndex),
    );
    if (!checked.length) {
      event.target.checked = true;
      return;
    }
    allowedConfidenceIndexes = new Set(checked);
    stop();
    rebuild(false, true);
    requestAnimationFrame(openConfig);
  }

  function closeChooser({ restoreFocus = false } = {}) {
    const chooser = root.querySelector(".temporal-widget__chooser");
    if (!chooser || chooser.hidden) return;
    chooser.hidden = true;
    root.classList.remove("has-open-chooser");
    chooser.classList.remove("is-upward");
    chooser.style.removeProperty("--chooser-max-height");
    if (restoreFocus) root.querySelector('[data-act="choose"]')?.focus();
  }

  function positionChooser() {
    const chooser = root.querySelector(".temporal-widget__chooser");
    if (!chooser || chooser.hidden) return;
    const widgetRect = root.getBoundingClientRect();
    const margin = 10;
    const spaceAbove = Math.max(0, widgetRect.top - margin);
    const spaceBelow = Math.max(0, window.innerHeight - widgetRect.bottom - margin);
    const openUpward = spaceAbove > spaceBelow;
    const available = Math.max(140, Math.min(430, openUpward ? spaceAbove : spaceBelow));
    chooser.classList.toggle("is-upward", openUpward);
    chooser.style.setProperty("--chooser-max-height", `${available}px`);
  }

  function openChooser() {
    const chooser = root.querySelector(".temporal-widget__chooser");
    if (!chooser) return;
    chooser.hidden = false;
    root.classList.add("has-open-chooser");
    positionChooser();
    requestAnimationFrame(() => chooser.querySelector('input[type="search"]')?.focus());
  }

  function onDocumentPointerDown(event) {
    const chooser = root.querySelector(".temporal-widget__chooser");
    const config = root.querySelector(".temporal-widget__config");

    if (chooser && !chooser.hidden) {
      if (chooser.contains(event.target) || event.target.closest?.('[data-act="choose"]')) return;
      closeChooser();
    }

    if (config && !config.hidden) {
      if (config.contains(event.target) || event.target.closest?.('[data-act="config"]')) return;
      closeConfig();
    }
  }

  function onDocumentKeyDown(event) {
    if (event.key !== "Escape") return;
    const chooser = root.querySelector(".temporal-widget__chooser");
    const config = root.querySelector(".temporal-widget__config");

    if (chooser && !chooser.hidden) {
      event.preventDefault();
      event.stopPropagation();
      const input = root.querySelector(".temporal-widget__chooser input");
      if (!input.value) {
        closeChooser({ restoreFocus: true });
      } else {
        input.value = "";
        renderChooserList();
        input.focus();
      }
      return;
    }

    if (config && !config.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeConfig();
      root.querySelector('[data-act="config"]')?.focus();
    }
  }

  function onRootClick(event) {
    const line = event.target.closest(".temporal-widget__period-line");
    if (line) {
      pausePlayback();
      const indexes = line.dataset.periodIndexes.split(",").map(Number);
      if (event.ctrlKey || event.metaKey) {
        const base = new Set(selected);
        const allSelected = indexes.every((index) => base.has(index));
        indexes.forEach((index) => (allSelected ? base.delete(index) : base.add(index)));
        selected = base;
      } else {
        const onlyThese =
          selected.size === indexes.length && indexes.every((index) => selected.has(index));
        selected = onlyThese ? new Set() : new Set(indexes);
      }
      playingPeriodIndex = null;
      renderScore();
      updateSummary();
      return;
    }

    const actionButton = event.target.closest?.("[data-act]");
    const action = actionButton?.dataset?.act;
    if (!action) return;

    if (action === "choose") openChooser();
    if (action === "config") openConfig();
    if (action === "config-done") closeConfig();
    if (action === "clear-period-search") {
      const input = root.querySelector(".temporal-widget__chooser input");
      input.value = "";
      renderChooserList();
      input.focus();
    }
    if (action === "minimize") {
      minimized = !minimized;
      render(false);
      return;
    }
    if (action === "disable-filter") {
      filteringDisabled = actionButton.querySelector?.("input")?.checked ?? event.target.checked;
      pausePlayback();
      renderPlaybackControls();
      updateSummary();
      return;
    }
    if (action === "done") closeChooser();
    if (action === "expand") {
      expanded = !expanded;
      renderScore();
    }
    if (action === "help") return;
    if (action === "all") {
      stop();
      displayed = new Set(model.periodStats.map((item) => item.periodIndex));
      selected = new Set(displayed);
      renderChooserList();
      renderScore();
      updateSummary();
    }
    if (action === "none") {
      stop();
      displayed.clear();
      selected.clear();
      renderChooserList();
      renderScore();
      updateSummary();
    }
    if (action === "rewind") rewindPlayback();
    if (action === "next") nextPlaybackPeriod();
    if (action === "play") play();
    if (action === "stop") stopAndReset();
  }

  function playbackCandidates() {
    return playbackOrder.filter((index) => selected.has(index));
  }

  function beginPlaybackSet() {
    const candidates = playbackCandidates();
    if (
      !playbackSet.length ||
      !playbackSet.every((index) => candidates.includes(index)) ||
      playbackSet.length !== candidates.length
    ) {
      playbackSet = [...candidates];
    }
    if (!playbackSet.length) playbackSet = [...playbackOrder];
    if (playbackIndex >= playbackSet.length) playbackIndex = 0;
  }

  function showPlaybackPeriod() {
    if (!playbackSet.length) return;
    playingPeriodIndex = playbackSet[playbackIndex];
    renderScore();
    updateSummary(new Set([playingPeriodIndex]));
  }

  function rewindPlayback() {
    pausePlayback();
    beginPlaybackSet();
    if (!playbackSet.length) return;
    playbackIndex = 0;
    showPlaybackPeriod();
  }

  function nextPlaybackPeriod() {
    pausePlayback();
    beginPlaybackSet();
    if (!playbackSet.length) return;
    const current = playingPeriodIndex == null ? -1 : playbackSet.indexOf(playingPeriodIndex);
    playbackIndex = current >= 0 ? Math.min(current + 1, playbackSet.length - 1) : 0;
    showPlaybackPeriod();
  }

  function schedulePlaybackStep() {
    if (!isPlaying) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (!isPlaying) return;
      if (playbackIndex >= playbackSet.length - 1) {
        isPlaying = false;
        renderPlaybackControls();
        return;
      }
      playbackIndex += 1;
      showPlaybackPeriod();
      schedulePlaybackStep();
    }, PLAYBACK_MS);
  }

  function play() {
    if (isPlaying) {
      pausePlayback();
      return;
    }

    beginPlaybackSet();
    if (playbackSet.length < MIN_PLAYBACK_PERIODS) {
      renderPlaybackControls();
      return;
    }

    const current = playingPeriodIndex == null ? -1 : playbackSet.indexOf(playingPeriodIndex);
    // Media-player semantics: Play at the end restarts from the beginning.
    playbackIndex = current === playbackSet.length - 1 ? 0 : current >= 0 ? current : 0;
    isPlaying = true;
    showPlaybackPeriod();
    renderPlaybackControls();
    schedulePlaybackStep();
  }

  function updateSummary(selectionOverride = null) {
    if (pendingSummaryFrame) cancelAnimationFrame(pendingSummaryFrame);
    pendingSummaryFrame = requestAnimationFrame(() => {
      pendingSummaryFrame = null;
      const effective = selectionOverride ?? selected;
      const summary = summarizeTemporalPeriods(model, effective);
      const statItems = [
        [
          summary.places,
          "Places",
          "Mapped Places with temporal evidence attested to the active time period selection.",
        ],
        [
          summary.locations,
          "Locations",
          "Attested Pleiades Locations represented by the active time period selection.",
        ],
        [
          summary.names,
          "Names",
          "Attested Pleiades Names represented by the active time period selection.",
        ],
        [
          summary.types,
          "Feature Categories",
          "Distinct Feature Categories on Locations represented by the active time period selection.",
        ],
        [
          summary.periods,
          "Time Periods",
          "Distinct Pleiades time periods currently active on the map.",
        ],
      ];
      root.querySelector(".temporal-widget__stats").innerHTML = statItems
        .map(
          ([value, label, title]) =>
            `<span tabindex="0" title="${title}"><b>${value.toLocaleString()}</b> ${label}</span>`,
        )
        .join("");
      const evidenceStarted = performance.now();
      const placeEvidence = buildTemporalPlaceEvidence(
        records,
        periods,
        confidences,
        effective,
        allowedConfidenceIndexes,
      );
      if (filteringDisabled) {
        for (const evidence of placeEvidence.values()) {
          evidence.active = false;
          evidence.activeLocations = 0;
          evidence.activeNames = 0;
        }
      }
      const evidenceMs = performance.now() - evidenceStarted;
      if (records.size >= 5000 || evidenceMs >= 50) {
        console.debug(
          `[temporal perf] evidence ${evidenceMs.toFixed(1)}ms for ${records.size.toLocaleString()} places`,
        );
      }
      onRangeChange?.({
        periodIndexes: [...effective],
        allowedConfidenceIndexes: [...allowedConfidenceIndexes],
        summary,
        placeEvidence,
        periods,
        confidences,
        filteringDisabled,
      });
    });
  }

  function pausePlayback() {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    isPlaying = false;
    renderPlaybackControls();
  }

  function stopAndReset() {
    pausePlayback();
    playingPeriodIndex = null;
    playbackSet = [];
    playbackIndex = 0;
    selected = new Set(displayed);
    renderScore();
    updateSummary();
  }

  function stop() {
    pausePlayback();
    playingPeriodIndex = null;
    playbackSet = [];
    if (pendingSummaryFrame) {
      cancelAnimationFrame(pendingSummaryFrame);
      pendingSummaryFrame = null;
    }
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    if (!loaded || !model) {
      root.hidden = true;
      onVisibilityChange?.(false);
      onEnabledChange?.(enabled);
      return;
    }

    if (!enabled) {
      stop();
      closeChooser();
      root.hidden = true;
      onVisibilityChange?.(false);
      onEnabledChange?.(false);
      onRangeChange?.({
        periodIndexes: [],
        allowedConfidenceIndexes: [...allowedConfidenceIndexes],
        summary: { places: 0, locations: 0, names: 0, types: 0, periods: 0 },
        placeEvidence: new Map(),
        periods,
        confidences,
        disabled: true,
      });
      return;
    }

    root.hidden = false;
    onVisibilityChange?.(true);
    onEnabledChange?.(true);
    updateSummary();
  }

  function isEnabled() {
    return enabled;
  }

  function minimize() {
    if (!enabled || minimized) return;
    minimized = true;
    closeChooser();
    render();
  }

  function destroy() {
    stop();
    loaded = false;
    model = null;
    availableModel = null;
    root.hidden = true;
    root.replaceChildren();
    onVisibilityChange?.(false);
  }

  return { loadDataset, setEnabled, isEnabled, minimize, destroy };
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

export function formatYear(year) {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`;
  return `${year.toLocaleString()} CE`;
}
