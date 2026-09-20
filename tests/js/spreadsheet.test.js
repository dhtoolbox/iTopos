import {describe, expect, it} from "vitest";

import {
    detectColumns,
    parseRows,
} from "../../static/js/data/spreadsheet.js";


describe("detectColumns", () => {
    it("detects an explicit pleiades_id header", () => {
        const matrix = [
            ["name", "pleiades_id", "group"],
            ["Athens", "579885", "cities"],
        ];

        expect(detectColumns(matrix)).toEqual({
            idColumnIndex: 1,
            groupColumnIndex: 2,
            groupingEnabled: true,
            hasHeaders: true,
            startingRowOffset: 1,
        });
    });


    it("normalizes header capitalization and whitespace", () => {
        const matrix = [
            ["name", " PLEIADES   ID ", "GROUP"],
            ["Athens", "579885", "cities"],
        ];

        const result = detectColumns(matrix);

        expect(result.idColumnIndex).toBe(1);
        expect(result.groupColumnIndex).toBe(2);
        expect(result.groupingEnabled).toBe(true);
        expect(result.hasHeaders).toBe(true);
    });


    it("detects an ID column in headerless data", () => {
        const matrix = [
            ["Athens", "579885"],
            ["Corinth", "570182"],
            ["Sparta", "570685"],
        ];

        const result = detectColumns(matrix);

        expect(result.idColumnIndex).toBe(1);
        expect(result.groupColumnIndex).toBe(-1);
        expect(result.groupingEnabled).toBe(false);
        expect(result.hasHeaders).toBe(false);
        expect(result.startingRowOffset).toBe(0);
    });


    it("uses votes from the first five rows", () => {
        const matrix = [
            ["foo", "579885"],
            ["bar", "570182"],
            ["123", "570685"],
            ["baz", "570406"],
            ["456", "589913"],
            ["999999", "not-scanned"],
        ];

        expect(
            detectColumns(matrix).idColumnIndex
        ).toBe(1);
    });


    it("does not enable grouping without a group header", () => {
        const matrix = [
            ["993", "Good"],
            ["1000", "Bad"],
        ];

        const columns = detectColumns(matrix);

        expect(columns.groupColumnIndex).toBe(-1);
        expect(columns.groupingEnabled).toBe(false);
    });
});


describe("parseRows", () => {
    it("parses IDs and groups", () => {
        const matrix = [
            ["pleiades_id", "group"],
            ["579885", "cities"],
            ["570182", "ports"],
        ];

        expect(parseRows(matrix)).toEqual([
            {
                row: 2,
                id: "579885",
                group: "cities",
                valid: true,
            },
            {
                row: 3,
                id: "570182",
                group: "ports",
                valid: true,
            },
        ]);
    });


    it("normalizes canonical Pleiades place URLs", () => {
        const matrix = [
            ["pleiades_id"],
            ["https://pleiades.stoa.org/places/210647"],
            ["https://pleiades.stoa.org/places/210648/"],
            [" https://pleiades.stoa.org/places/210649 "],
            ["https://pleiades.stoa.org/places/210650?foo=bar"],
            ["https://pleiades.stoa.org/places/210651#section"],
            ["https://pleiades.stoa.org/places/210652/subtree"],
            ["https://pleiades.stoa.org/places/210653/abc123/other/things?foo=bar#section"],
        ];

        expect(parseRows(matrix).map((place) => place.id)).toEqual([
            "210647",
            "210648",
            "210649",
            "210650",
            "210651",
            "210652",
            "210653",
        ]);
        expect(parseRows(matrix).every((place) => place.valid)).toBe(true);
    });

    it("detects a headerless column of canonical Pleiades URLs", () => {
        const matrix = [
            ["Athens", "https://pleiades.stoa.org/places/210647"],
            ["Corinth", "https://pleiades.stoa.org/places/210648"],
            ["Sparta", "https://pleiades.stoa.org/places/210649"],
        ];

        expect(detectColumns(matrix).idColumnIndex).toBe(1);
    });

    it("records non-Pleiades URLs as malformed IDs", () => {
        const matrix = [
            ["pleiades_id"],
            ["https://example.com/places/210647"],
        ];

        expect(parseRows(matrix)[0]).toMatchObject({
            id: "https://example.com/places/210647",
            valid: false,
        });
    });

    it("records malformed IDs instead of discarding them", () => {
        const matrix = [
            ["pleiades_id"],
            ["579885"],
            ["banana"],
            [""],
        ];

        const result = parseRows(matrix);

        expect(result).toEqual([
            {
                row: 2,
                id: "579885",
                group: null,
                valid: true,
            },
            {
                row: 3,
                id: "banana",
                group: null,
                valid: false,
            },
        ]);
    });


    it("ignores completely blank rows", () => {
        const matrix = [
            ["pleiades_id"],
            ["579885"],
            ["", "", ""],
            [null, undefined, "   "],
            ["570182"],
        ];

        expect(parseRows(matrix)).toHaveLength(2);
    });
});