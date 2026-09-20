import { ICON_BASE, SHADINGS } from "../constants.js";

export function initializeBasemapControls(map) {
  buildShadingCheckboxes(map);
  registerInterfaceListeners(map);

}

function setLayerVisibility(map, layerId, visible) {
  if (!map || !map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function buildShadingCheckboxes(map) {
  const container = document.querySelector(".shading-section");
  if (!container) return;

  container.innerHTML = "";
  const headerWrapper = document.createElement("div");
  headerWrapper.className = "layer-section-header";

  const heading = document.createElement("h3");
  heading.textContent = "AWMC Political Shading";

  const actions = createSectionActions(
    () => toggleSectionLayers(map, ".shading-section", true),
    () => toggleSectionLayers(map, ".shading-section", false),
  );

  headerWrapper.append(heading, actions);
  container.append(headerWrapper);

  const warning = document.createElement("p");
  warning.className = "shading-section__warning";

  const warningIcon = document.createElement("img");
  warningIcon.src = new URL("exclamation-triangle.svg", ICON_BASE).href;
  warningIcon.alt = "";
  warningIcon.setAttribute("aria-hidden", "true");

  const warningText = document.createElement("span");
  warningText.innerHTML =
    "<strong>Illustrative layers.</strong> Source data lacks provenance and temporal " +
    "records. Recommended use is for generalized historical context, not as precise boundaries.";

  warning.append(warningIcon, warningText);
  container.append(warning);

  for (const shading of SHADINGS) {
    const label = document.createElement("label");
    label.className = "layer-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";

    if (shading.type === "both") {
      checkbox.dataset.multiLayers = `${shading.id}-fill,${shading.id}-line`;
    } else {
      checkbox.dataset.layer = `${shading.id}-${shading.type}`;
    }

    label.append(checkbox, document.createTextNode(` ${shading.title}`));
    container.append(label);
  }
}

function createSectionActions(onAll, onNone) {
  const wrapper = document.createElement("div");
  wrapper.className = "layer-section-actions selection-actions";

  const all = document.createElement("button");
  all.type = "button";
  all.className = "layer-section-action selection-action";
  all.textContent = "All";

  const separator = document.createElement("span");
  separator.className = "layer-section-separator selection-action-separator";
  separator.textContent = "|";

  const none = document.createElement("button");
  none.type = "button";
  none.className = "layer-section-action selection-action";
  none.textContent = "None";

  all.addEventListener("click", onAll);
  none.addEventListener("click", onNone);
  wrapper.append(all, separator, none);
  return wrapper;
}

function toggleSectionLayers(map, sectionSelector, checked) {
  const section = document.querySelector(sectionSelector);
  if (!section) return;

  section.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    if (checkbox.checked === checked) return;
    checkbox.checked = checked;
    applyCheckboxLayerState(map, checkbox);
  });
}

function registerInterfaceListeners(map) {
  const controlPanel = document.getElementById("map-context-panel");
  if (!controlPanel) return;

  controlPanel.addEventListener("change", (event) => {
    const checkbox = event.target;
    if (checkbox?.tagName !== "INPUT" || checkbox.type !== "checkbox") return;
    applyCheckboxLayerState(map, checkbox);
  });

  document.getElementById("context-select-all")?.addEventListener("click", () =>
    toggleSectionLayers(map, ".map-context-layers", true),
  );
  document.getElementById("context-clear-all")?.addEventListener("click", () =>
    toggleSectionLayers(map, ".map-context-layers", false),
  );
}

function applyCheckboxLayerState(map, checkbox) {
  const singleLayer = checkbox.dataset.layer;
  const multiLayers = checkbox.dataset.multiLayers;

  if (singleLayer) setLayerVisibility(map, singleLayer.trim(), checkbox.checked);
  if (multiLayers) {
    multiLayers.split(",").forEach((layerId) =>
      setLayerVisibility(map, layerId.trim(), checkbox.checked),
    );
  }
}
