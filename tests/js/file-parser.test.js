import {describe, expect, it,} from "vitest";

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

import * as XLSX from "xlsx";
import Papa from "papaparse";

import {excelWorkbookToMatrix, excelWorkbookToSheets, parseCsvText, parseExcelBuffer,} from "../../static/js/data/file-parser.js";

import {detectColumns, parseRows,} from "../../static/js/data/spreadsheet.js";

function rowsFromMatrix(matrix) {
    const columns = detectColumns(matrix);
    return parseRows(matrix, columns);
}

function rowsFromSheets(sheets) {
    return sheets.flatMap(({ matrix }) => rowsFromMatrix(matrix));
}

const testDirectory = path.dirname(
    fileURLToPath(import.meta.url)
);

const samplesDirectory = path.resolve(
    testDirectory,
    "../samples"
);


function readBinarySample(filename) {
    const buffer = fs.readFileSync(
        path.join(samplesDirectory, filename)
    );

    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    );
}


function readTextSample(filename) {
    return fs.readFileSync(
        path.join(samplesDirectory, filename),
        "utf8"
    );
}


describe("Excel fixture parsing", () => {
    it("reads two places from the Excel fixture", () => {
        const sheets = parseExcelBuffer(
            readBinarySample("2places.xls"),
            XLSX
        );

        const rows = rowsFromSheets(sheets);

        expect(rows).toHaveLength(2);
        expect(
            rows.every(row => row.valid)
        ).toBe(true);
    });


    it("does not include hidden Excel rows", () => {
        const sheets = parseExcelBuffer(
            readBinarySample(
                "1place_1hidden.xls"
            ),
            XLSX
        );

        const rows = rowsFromSheets(sheets);

        expect(rows).toHaveLength(1);
        expect(rows[0].valid).toBe(true);
    });


    it("reads a Google Sheets XLSX export", () => {
        const sheets = parseExcelBuffer(
            readBinarySample(
                "google_sheet.xlsx"
            ),
            XLSX
        );

        const rows = rowsFromSheets(sheets);

        expect(rows.length).toBeGreaterThan(0);

        expect(
            rows.some(row => row.valid)
        ).toBe(true);
    });


    it("handles an empty workbook", () => {
        const sheets = parseExcelBuffer(
            readBinarySample("empty.xlsx"),
            XLSX
        );

        expect(sheets).toEqual([]);
    });

    it("returns every non-empty worksheet independently", () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ["pleiades_id"],
            ["579885"],
        ]), "First");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ["id"],
            ["570182"],
        ]), "Second");

        const sheets = excelWorkbookToSheets(workbook, XLSX);

        expect(sheets).toEqual([
            { name: "First", matrix: [["pleiades_id"], ["579885"]] },
            { name: "Second", matrix: [["id"], ["570182"]] },
        ]);
    });

});


describe("CSV fixture parsing", () => {
    it("reads Pleiades rows from CSV", () => {
        const matrix = parseCsvText(
            readTextSample("places.csv"),
            Papa
        );

        const rows = rowsFromMatrix(matrix);

        expect(rows.length).toBeGreaterThan(0);

        expect(
            rows.every(row => row.valid)
        ).toBe(true);
    });
});