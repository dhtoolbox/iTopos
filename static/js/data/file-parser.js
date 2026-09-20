export function excelWorkbookToSheets(workbook, XLSX) {
  if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    return [];
  }

  return workbook.SheetNames.flatMap((name) => {
    const worksheet = workbook.Sheets[name];
    if (!worksheet || !worksheet["!ref"]) return [];

    const matrix = excelWorksheetToMatrix(worksheet, XLSX);
    return matrix.length > 0 ? [{ name, matrix }] : [];
  });
}

export function excelWorkbookToMatrix(workbook, XLSX) {
  return excelWorkbookToSheets(workbook, XLSX).flatMap(({ matrix }) => matrix);
}

export function excelWorksheetToMatrix(worksheet, XLSX) {
  const matrix = [];
  const rowMeta = worksheet["!rows"] || [];
  const range = XLSX.utils.decode_range(worksheet["!ref"]);

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
    if (rowMeta[rowIndex]?.hidden) continue;

    const row = [];
    let hasContent = false;

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex++) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address];
      const value = cell?.v !== undefined ? cell.v : "";
      row.push(value);

      if (value !== null && String(value).trim() !== "") hasContent = true;
    }

    if (hasContent) matrix.push(row);
  }

  return matrix;
}

export function parseExcelBuffer(buffer, XLSX) {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array" });
  return excelWorkbookToSheets(workbook, XLSX);
}

export function parseCsvText(text, Papa) {
  const result = Papa.parse(text, { header: false, skipEmptyLines: true });

  if (result.errors?.length) {
    const error = result.errors[0];
    throw new Error(error.message || "Could not parse CSV data.");
  }

  return result.data;
}
