import { parseExcelBuffer } from "../data/file-parser.js";

import { detectColumns, parseRows } from "../data/spreadsheet.js";

import { analyzeDuplicates } from "../data/duplicates.js";

export function initializeUpload({ onParsed, onError }) {
  const elements = getElements();

  let isProcessing = false;
  let currentFileName = "";

  function setProcessing(processing) {
    isProcessing = processing;
    elements.dropZone.classList.toggle("is-processing", processing);
    elements.chooseButton.disabled = processing;
  }

  function showInitialState() {
    setMessage("Drag and drop your spreadsheet here", "");
    elements.chooseButton.textContent = "Choose file";
    elements.uploadedFileInfo.hidden = true;
    elements.uploadedFileName.textContent = "";
    elements.uploadedFileName.removeAttribute("title");
    elements.dropZone.classList.remove("has-loaded-file");
  }

  function showLoadedState() {
    setMessage("Map Loaded", "Drag and drop another spreadsheet here to replace this map");
    elements.chooseButton.textContent = "Choose another file";
    elements.dropZone.classList.add("has-loaded-file");

    if (currentFileName) {
      elements.uploadedFileName.textContent = truncateFilename(currentFileName);
      elements.uploadedFileName.title = currentFileName;
      elements.uploadedFileInfo.hidden = false;
    }
  }

  function restore() {
    setProcessing(false);
    if (currentFileName) showLoadedState();
    else showInitialState();
  }

  function reset() {
    currentFileName = "";
    setProcessing(false);
    showInitialState();
  }

  function setMessage(title, instruction) {
    elements.title.textContent = title;
    elements.instruction.textContent = instruction;
  }

  async function processFile(file) {
    if (isProcessing) {
      return;
    }

    setProcessing(true);

    try {
      let matrix;

      if (isExcelFile(file)) {
        setMessage("Analyzing spreadsheet...", "Reading rows locally... please wait.");
        const sheets = await readExcelFile(file);
        const parsed = parseUploadSheets(sheets);
        await onParsed({ ...parsed, fileName: file.name });
        return;
      } else {
        setMessage("Analyzing text data...", "Reading rows locally... please wait.");
        matrix = await readTextFile(file);
      }

      const parsed = parseUploadMatrix(matrix);

      await onParsed({ ...parsed, fileName: file.name });
    } catch (error) {
      restore();
      onError(error instanceof Error ? error.message : String(error), file.name);
    }
  }

  elements.chooseButton.addEventListener("click", () => {
    if (!isProcessing) {
      elements.fileInput.click();
    }
  });

  elements.dropZone.addEventListener("click", (event) => {
    if (isProcessing || event.target.closest("button, input")) {
      return;
    }

    elements.fileInput.click();
  });

  elements.fileInput.addEventListener("change", () => {
    const file = elements.fileInput.files[0];

    if (file) {
      processFile(file);
    }

    elements.fileInput.value = "";
  });

  elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();

    if (!isProcessing) {
      elements.dropZone.classList.add("dragging");
    }
  });

  elements.dropZone.addEventListener("dragleave", () => {
    elements.dropZone.classList.remove("dragging");
  });

  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");

    if (isProcessing) {
      return;
    }

    const file = event.dataTransfer.files[0];

    if (file) {
      processFile(file);
    }
  });

  return {
    reset,
    restore,

    showLoaded(fileName = "") {
      currentFileName = fileName;
      setProcessing(false);
      showLoadedState();
    },
  };
}

export function parseUploadSheets(sheets) {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error(
      "The uploaded file appears to be completely empty. " + "See 'How to Use' for guidance.",
    );
  }

  const parsedSheets = sheets.map(({ name, matrix }) => ({
    name,
    parsed: parseUploadMatrix(matrix),
  }));
  const rows = parsedSheets.flatMap(({ parsed }) => parsed.rows);
  const groups = new Set(parsedSheets.flatMap(({ parsed }) => [...parsed.groups]));
  const duplicates = analyzeDuplicates(rows.filter((row) => row.valid));

  return {
    rows,
    groups,
    duplicates,
    groupingEnabled: parsedSheets.some(({ parsed }) => parsed.groupingEnabled),
  };
}

export function parseUploadMatrix(matrix) {
  if (!matrix || matrix.length === 0) {
    throw new Error(
      "The uploaded file appears to be completely empty. " + "See 'How to Use' for guidance.",
    );
  }

  const columns = detectColumns(matrix);
  const rows = parseRows(matrix, columns);

  if (rows.length === 0) {
    throw new Error(
      "No readable numbers or Pleiades IDs could be found " + "inside your sheet columns.",
    );
  }

  const groups = new Set(rows.map((row) => row.group?.trim()).filter(Boolean));
  const duplicates = analyzeDuplicates(rows.filter((row) => row.valid));

  return {
    rows,
    groups,
    duplicates,
    groupingEnabled: columns.groupingEnabled,
  };
}

function isExcelFile(file) {
  const name = file.name.toLowerCase();

  return name.endsWith(".xlsx") || name.endsWith(".xls");
}

function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        resolve(parseExcelBuffer(event.target.result, XLSX));
      } catch (error) {
        reject(new Error(`Could not read this file as an Excel spreadsheet: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error("Could not read this Excel file."));
    };

    reader.readAsArrayBuffer(file);
  });
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete(results) {
        resolve(results.data);
      },

      error(error) {
        reject(new Error(`The file could not be read as text data: ${error.message}`));
      },
    });
  });
}

function getElements() {
  const elements = {
    chooseButton: document.querySelector("#choose-file-button"),
    fileInput: document.querySelector("#file-input"),
    dropZone: document.querySelector("#drop-zone"),
    title: document.querySelector("#drop-title"),
    instruction: document.querySelector("#drop-instruction"),
    uploadedFileInfo: document.querySelector("#uploaded-file-info"),
    uploadedFileName: document.querySelector("#uploaded-file-name"),
  };

  for (const [name, element] of Object.entries(elements)) {
    if (!element) {
      throw new Error(`Upload widget is missing required element: ${name}`);
    }
  }

  return elements;
}

export function truncateFilename(fileName, maxLength = 30) {
  const name = String(fileName ?? "");
  if (name.length <= maxLength) return name;

  const dotIndex = name.lastIndexOf(".");
  const extension = dotIndex > 0 ? name.slice(dotIndex) : "";
  const available = Math.max(1, maxLength - extension.length - 1);

  return `${name.slice(0, available)}…${extension}`;
}
