const ID_HEADERS = new Set(["place_id", "id", "pleiades_id", "pleiades id", "pleiades", "uri"]);

const GROUP_HEADERS = new Set(["group"]);

const PLEIADES_ID_PATTERN = /^\d+$/;
const PLEIADES_DETECTION_PATTERN = /^\d{3,20}$/;
const PLEIADES_PLACE_URL_PATTERN = /^https?:\/\/(?:www\.)?pleiades\.stoa\.org\/places\/(\d{3,20})(?:[\/?#].*)?$/i;

export function detectColumns(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return {
      idColumnIndex: -1,
      groupColumnIndex: -1,
      hasHeaders: false,
      startingRowOffset: 0,
    };
  }

  const firstRow = (matrix[0] || []).map(normalizeHeader);

  let idColumnIndex = -1;
  let groupColumnIndex = -1;
  let hasHeaders = false;

  for (let i = 0; i < firstRow.length; i++) {
    const cleanHeader = firstRow[i]?.toLowerCase() || "";

    if (ID_HEADERS.has(cleanHeader)) {
      idColumnIndex = i;
      hasHeaders = true;
    }

    if (GROUP_HEADERS.has(cleanHeader)) {
      groupColumnIndex = i;
    }
  }

  if (hasHeaders) {
    return {
      idColumnIndex,
      groupColumnIndex,
      groupingEnabled: groupColumnIndex !== -1,
      hasHeaders: true,
      startingRowOffset: 1,
    };
  }

  idColumnIndex = detectIdColumnFromData(matrix);

  return {
    idColumnIndex,
    groupColumnIndex: -1,
    groupingEnabled: false,
    hasHeaders: false,
    startingRowOffset: 0,
  };
}

export function parseRows(matrix, columns = detectColumns(matrix)) {
  if (!Array.isArray(matrix)) {
    return [];
  }

  const places = [];

  for (let r = columns.startingRowOffset; r < matrix.length; r++) {
    const rowData = matrix[r];

    if (!Array.isArray(rowData) || rowData.length === 0) {
      continue;
    }

    if (isBlankRow(rowData)) {
      continue;
    }

    const rawID = String(rowData[columns.idColumnIndex] ?? "").trim();
    const normalizedID = normalizePleiadesId(rawID);

    let group = null;

    if (columns.groupColumnIndex !== -1 && rowData[columns.groupColumnIndex] != null) {
      const rawGroup = String(rowData[columns.groupColumnIndex]).trim();

      group = rawGroup || null;
    }

    places.push({
      row: r + 1,
      id: normalizedID,
      group,
      valid: PLEIADES_ID_PATTERN.test(normalizedID),
    });
  }

  return places;
}

export function normalizePleiadesId(value) {
  const text = String(value ?? "").trim();
  if (PLEIADES_ID_PATTERN.test(text)) return text;
  const match = text.match(PLEIADES_PLACE_URL_PATTERN);
  return match ? match[1] : text;
}

function detectIdColumnFromData(matrix) {
  const scanDepth = Math.min(matrix.length, 5);
  const columnVotes = new Map();

  for (let r = 0; r < scanDepth; r++) {
    const row = matrix[r] || [];

    for (let c = 0; c < row.length; c++) {
      const value = normalizePleiadesId(String(row[c] ?? "").trim());

      if (PLEIADES_DETECTION_PATTERN.test(value)) {
        columnVotes.set(c, (columnVotes.get(c) || 0) + 1);
      }
    }
  }

  let bestColumn = -1;
  let maxVotes = 0;

  for (const [columnIndex, votes] of columnVotes) {
    if (votes > maxVotes) {
      maxVotes = votes;
      bestColumn = columnIndex;
    }
  }

  // Preserve the existing behavior: fall back to column A.
  return bestColumn === -1 ? 0 : bestColumn;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isBlankRow(row) {
  return row.every((cell) => cell === undefined || cell === null || String(cell).trim() === "");
}
