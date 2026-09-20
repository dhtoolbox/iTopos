import { calculateProcessingSummary } from "../data/summary.js";
import { loadManifest } from "../data/static-resolver.js";
import { openHelp } from "./help.js";

const reportSection = document.getElementById("report-section");
const reportSummary = document.getElementById("report-summary");
const reportProblems = document.getElementById("report-problems");

export async function showProcessingReport({
  dataset,
  groups,
  duplicates,
  result,
  attemptedFileName = "",
}) {
  if (!reportSection || !reportSummary || !reportProblems) return;

  await renderDatasetFreshness();

  const report = calculateProcessingSummary(dataset, groups, duplicates, result);
  const refreshDate = await getDatasetRefreshDate();

  renderReportMetrics(reportSummary, report, attemptedFileName);
  renderReportIssues(report, dataset, refreshDate);
  reportSection.hidden = false;
}

function renderReportMetrics(reportElement, report, attemptedFileName) {
  const attemptedFile = attemptedFileName
    ? `<p class="report-attempted-file"><strong>Could not map ${escapeHTML(attemptedFileName)}.</strong> Review the details below.</p>`
    : "";

  reportElement.innerHTML = `
    ${attemptedFile}
    <dl class="report-overview" aria-label="Processing summary">
      ${overviewMetric("Rows", report.rowsProcessed)}
      ${overviewMetric("Places", report.uniquePleiadesIds)}
      ${overviewMetric("Mappable", report.mappablePlaces)}
    </dl>

    <details class="report-details">
      <summary class="textLabel">Parsing metrics</summary>
      <dl class="report">
        ${reportMetric("Rows processed", report.rowsProcessed)}
        ${reportMetric("Rows matched to Pleiades", report.matchedRows)}
        ${reportMetric(
          "Mappable places",
          report.mappablePlaces,
          report.mappablePlaces === report.uniquePleiadesIds ? "all-good" : "warning-chip",
        )}
        ${reportMetric("Unique Pleiades IDs", report.uniquePleiadesIds)}
        ${reportMetric("Groups", report.groups)}
        ${reportMetric("Duplicate Pleiades IDs", report.duplicateIds)}
        ${reportMetric("Duplicate ID/group pairs", report.duplicatePairs)}
        ${reportMetric(
          "IDs not found",
          report.notFoundIds,
          report.notFoundIds > 0 ? "error-chip" : "neutral-chip",
        )}
        ${reportMetric(
          "Unlocated places",
          report.unlocatedPlaces,
          report.unlocatedPlaces > 0 ? "warning-chip" : "neutral-chip",
        )}
      </dl>
    </details>
  `;
}

function overviewMetric(label, value) {
  return `
    <div class="report-overview__metric">
      <dd>${Number(value).toLocaleString()}</dd>
      <dt>${label}</dt>
    </div>
  `;
}

function reportMetric(label, value, className = "") {
  return `
    <div>
      <dt>${label}</dt>
      <dd${className ? ` class="${className}"` : ""}>${Number(value).toLocaleString()}</dd>
    </div>
  `;
}

function renderReportIssues(report, dataset, refreshDate) {
  if (!reportProblems) return;

  const issues = [];

  if (report.unlocatedPlaces > 0) {
    const placeWord = report.unlocatedPlaces === 1 ? "place" : "places";
    const idDisplaySnippet = formatIdList(report.unlocatedIds);

    issues.push(
      reportIssue(
        reportIcon("exclamation-triangle.svg", "Warning"),
        "Unmappable Pleiades Places",
        `${report.unlocatedPlaces} matched Pleiades ${placeWord} ${
          report.unlocatedPlaces === 1 ? "has" : "have"
        } no representative points. (Pleiades IDs: ${escapeHTML(idDisplaySnippet)})`,
        "warning",
      ),
    );
  }

  if (report.notFoundIds > 0) {
    const ids = report.notFoundValues;
    const idDisplaySnippet = formatIdList(ids);
    const freshnessText = refreshDate ? ` Pleiades dataset: refreshed ${refreshDate}.` : "";

    issues.push(
      reportIssue(
        reportIcon("exclamation-triangle.svg", "Warning"),
        "Pleiades IDs Not Found",
        `${ids.length === 1 ? "1 ID was" : `${ids.length} IDs were`} not found in the local Pleiades dataset.${escapeHTML(
          freshnessText,
        )} (Pleiades IDs: ${escapeHTML(idDisplaySnippet)})`,
        "warning",
      ),
    );
  }

  if (report.invalidIds > 0) {
    const invalidCount = report.invalidIds;
    const idWord = invalidCount === 1 ? "ID" : "IDs";
    const verbWord = invalidCount === 1 ? "is" : "are";
    let invalidDisplaySnippet = report.invalidValues
      .slice(0, 5)
      .map((item) => `"${truncateDiagnosticValue(item)}"`)
      .join(", ");

    if (report.invalidValues.length > 5) {
      invalidDisplaySnippet += `, and ${report.invalidValues.length - 5} others`;
    }

    issues.push(
      reportIssue(
        reportIcon("xmark.svg", "Error"),
        "Invalid Input",
        `${invalidCount} of your Pleiades ${idWord} ${verbWord} invalid and could not be read. (Encountered: ${escapeHTML(
          invalidDisplaySnippet,
        )})`,
        "error",
      ),
    );
  }

  if (dataset.groupingEnabled && report.unspecifiedGroupPlaces > 0) {
    const ids = formatIdList(report.unspecifiedGroupIds);

    issues.push(
      reportIssue(
        reportSymbol("?", "Group not specified"),
        "Group Not Specified",
        `${report.unspecifiedGroupPlaces} matched ${
          report.unspecifiedGroupPlaces === 1 ? "place has" : "places have"
        } no group value in the uploaded spreadsheet. (Pleiades IDs: ${escapeHTML(ids)})`,
        "info",
      ),
    );
  }

  if (dataset.groupingEnabled && report.multipleGroupPlaces > 0) {
    const ids = formatIdList(report.multipleGroupIds);

    issues.push(
      reportIssue(
        reportSymbol("#", "Multiple groups specified"),
        "Multiple Groups Specified",
        `${report.multipleGroupPlaces} ${
          report.multipleGroupPlaces === 1 ? "place appears" : "places appear"
        } in more than one user-defined group. (Pleiades IDs: ${escapeHTML(ids)})`,
        "info",
      ),
    );
  }

  reportProblems.innerHTML = issues.length
    ? `<div class="report-issues" aria-label="Processing issues">${issues.join("")}</div>`
    : "";
}

function reportIssue(icon, title, text, tone) {
  return `
    <div class="report-issue report-issue--${tone}">
      <div class="report-issue__icon">${icon}</div>
      <div class="report-issue__body">
        <strong class="report-issue__title">${title}</strong>
        <p>${text}</p>
      </div>
    </div>
  `;
}

function reportIcon(file, label) {
  return `<img class="report-status-icon" src="./static/vendor/icons/${file}" alt="${label}">`;
}

function reportSymbol(symbol, label) {
  return `<span class="special-marker report-special-marker" role="img" aria-label="${label}">${symbol}</span>`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


export function truncateDiagnosticValue(value, maxLength = 180) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function formatIdList(ids, limit = 10) {
  const visible = ids.slice(0, limit);
  let text = visible.join(", ");
  const remaining = ids.length - visible.length;

  if (remaining > 0) text += `, ... and ${remaining} more`;
  return text;
}

async function getDatasetRefreshDate() {
  try {
    const manifest = await loadManifest();
    if (!manifest.refreshed_at) return null;

    const date = new Date(manifest.refreshed_at);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleDateString();
  } catch {
    return null;
  }
}

export function clearProcessingReport() {
  if (reportSection) reportSection.hidden = true;
  if (reportSummary) reportSummary.innerHTML = "";
  if (reportProblems) reportProblems.innerHTML = "";
}

export async function showProcessingError(message, fileName = "") {
  if (!reportSection || !reportSummary) return;

  clearProcessingReport();
  await renderDatasetFreshness();

  const paragraph = document.createElement("p");
  paragraph.className = "report-section-error";

  const body = document.createElement("span");
  body.className = "report-section-error__body";
  const fileText = fileName ? `<strong>${escapeHTML(fileName)}</strong> could not be processed. ` : "";
  body.innerHTML = `${fileText}${escapeHTML(message)}`;

  paragraph.innerHTML = reportIcon("xmark.svg", "Error");
  paragraph.append(body);

  const helpButtonDiv = document.createElement("div");
  const helpButton = document.createElement("button");
  helpButton.type = "button";
  helpButton.className = "text-button report-help-button";
  helpButton.textContent = "How to Use";
  helpButton.addEventListener("click", () => openHelp("upload"));

  helpButtonDiv.append(helpButton);
  reportSummary.append(paragraph, helpButtonDiv);
  reportSection.hidden = false;
}

async function renderDatasetFreshness() {
  const element = document.querySelector("#dataset-refresh-date");
  if (!element) return;

  const date = await getDatasetRefreshDate();
  element.textContent = date ? `refreshed ${date}` : "refresh date unavailable";
}
