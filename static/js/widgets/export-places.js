const MULTI_VALUE_SEPARATOR = "; ";

export const EXPORT_FIELDS = [
  { key: "id", label: "Pleiades ID", defaultName: "id", selected: true },
  { key: "title", label: "Title", defaultName: "title", selected: true },
  { key: "repr_lat", label: "Representative latitude", defaultName: "latitude", selected: true },
  { key: "repr_lng", label: "Representative longitude", defaultName: "longitude", selected: true },
  { key: "place_types", label: "Feature Category terms", defaultName: "feature_categories", selected: true, csvMulti: true },
  { key: "place_type_keys", label: "Feature Category keys", defaultName: "feature_category_keys", selected: false, csvMulti: true },
  { key: "groups", label: "Group(s)", defaultName: "group", selected: true, multi: true },
];

export function validateExportColumns(columns) {
  return columns.some((column) => column.selected)
    ? ""
    : "Select at least one field to export.";
}

function outputName(column) {
  return column.defaultName ?? column.name ?? column.key;
}

export function buildCsvExport(dataset, columns) {
  const selected = columns.filter((column) => column.selected);
  const header = selected.map((column) => csvCell(outputName(column)));
  const rows = [header.join(",")];
  const exportsGroup = selected.some((column) => column.key === "groups");

  for (const place of dataset?.places ?? []) {
    const groups = exportsGroup && place.userGroups?.length ? place.userGroups : [""];
    for (const group of groups) {
      rows.push(selected.map((column) => csvCell(csvValue(place, column.key, group), column.csvMulti)).join(","));
    }
  }
  return `${rows.join("\r\n")}\r\n`;
}

export function buildJsonExport(dataset, columns) {
  const selected = columns.filter((column) => column.selected);
  return (dataset?.places ?? []).map((place) => {
    const record = {};
    for (const column of selected) record[outputName(column)] = jsonValue(place, column.key);
    return record;
  });
}

function csvValue(place, key, group) {
  if (key === "groups") return group;
  const value = place?.[key];
  if (Array.isArray(value)) return value.join(MULTI_VALUE_SEPARATOR);
  return value ?? "";
}

function jsonValue(place, key) {
  if (key === "groups") return [...(place.userGroups ?? [])];
  const value = place?.[key];
  return Array.isArray(value) ? [...value] : value ?? null;
}

function csvCell(value, forceQuote = false) {
  const text = String(value ?? "");
  if (!forceQuote && !/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function initializePlaceExport() {
  const button = document.getElementById("browse-export-places");
  const dialog = document.getElementById("export-places-dialog");
  if (!button || !dialog) return { setDataset() {} };

  const form = dialog.querySelector("#export-places-form");
  const fields = dialog.querySelector("#export-places-fields");
  const formatInputs = [...dialog.querySelectorAll('input[name="export-format"]')];
  const error = dialog.querySelector("#export-places-error");
  const count = dialog.querySelector("#export-places-count");
  let dataset = null;

  fields.innerHTML = EXPORT_FIELDS.map((field) => `
    <label class="export-field-row">
      <input type="checkbox" data-export-field="${field.key}" ${field.selected ? "checked" : ""}>
      <span class="export-field-label">${escapeHtml(field.label)}</span>
      <code>${escapeHtml(field.defaultName)}</code>
    </label>`).join("");

  button.addEventListener("click", () => {
    if (!dataset?.places?.length) return;
    error.hidden = true;
    count.textContent = `${dataset.places.length.toLocaleString()} mapped Place${dataset.places.length === 1 ? "" : "s"}`;
    dialog.showModal();
  });
  dialog.querySelector("#export-places-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const columns = EXPORT_FIELDS.map((field) => ({
      ...field,
      selected: fields.querySelector(`[data-export-field="${field.key}"]`)?.checked ?? false,
    }));
    const message = validateExportColumns(columns);
    if (message) {
      error.textContent = message;
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const format = formatInputs.find((input) => input.checked)?.value ?? "csv";
    if (format === "json") {
      downloadText(JSON.stringify(buildJsonExport(dataset, columns), null, 2) + "\n", "itopos-mapped-places.json", "application/json;charset=utf-8");
    } else {
      downloadText(buildCsvExport(dataset, columns), "itopos-mapped-places.csv", "text/csv;charset=utf-8");
    }
    dialog.close();
  });

  return {
    setDataset(nextDataset, { visible = true } = {}) {
      dataset = nextDataset?.places?.length ? nextDataset : null;
      const hasGroups = Boolean(dataset?.places?.some((place) => place.userGroups?.length));

      for (const field of EXPORT_FIELDS) {
        const checkbox = fields.querySelector(`[data-export-field="${field.key}"]`);
        if (!checkbox) continue;
        checkbox.checked = field.key === "groups" ? hasGroups : field.selected;
      }

      const showButton = Boolean(dataset && visible);
      button.hidden = !showButton;
      button.disabled = !showButton;
    },
  };
}

function downloadText(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
