import {describe, expect, it} from "vitest";

import {
    analyzeDuplicates,
} from "../../static/js/data/duplicates.js";


describe("analyzeDuplicates", () => {
    it("finds duplicate IDs", () => {
        const rows = [
            {id: "579885", group: "A"},
            {id: "579885", group: "A"},
            {id: "570182", group: "B"},
        ];

        const result = analyzeDuplicates(rows);

        expect(result.duplicateIDs).toEqual([
            {
                id: "579885",
                count: 2,
            },
        ]);
    });


    it("finds duplicate ID/group pairs", () => {
        const rows = [
            {id: "579885", group: "cities"},
            {id: "579885", group: "cities"},
        ];

        const result = analyzeDuplicates(rows);

        expect(result.duplicatePairs).toEqual([
            {
                id: "579885",
                group: "cities",
                count: 2,
            },
        ]);
    });


    it("detects IDs assigned to multiple groups", () => {
        const rows = [
            {id: "579885", group: "A"},
            {id: "579885", group: "B"},
        ];

        const result = analyzeDuplicates(rows);

        expect(result.crossGroupConflicts).toEqual([
            {
                id: "579885",
                groups: ["A", "B"],
            },
        ]);
    });


    it("does not report unique rows as duplicates", () => {
        const rows = [
            {id: "579885", group: "A"},
            {id: "570182", group: "B"},
        ];

        const result = analyzeDuplicates(rows);

        expect(result.duplicateIDs).toEqual([]);
        expect(result.duplicatePairs).toEqual([]);
        expect(result.crossGroupConflicts).toEqual([]);
    });
});