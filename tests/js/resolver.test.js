import {describe, expect, it, vi} from "vitest";

import {
    resolveIds,
} from "../../static/js/data/resolver.js";


describe("resolveIds", () => {
    it("deduplicates IDs before resolving them", async () => {
        const fakeResolver = vi.fn(async ids => ({
            places: ids.map(id => ({id})),
            not_found: [],
            invalid: [],
        }));

        await resolveIds(
            ["579885", "579885", "570182"],
            {resolveBatch: fakeResolver}
        );

        expect(fakeResolver).toHaveBeenCalledTimes(1);

        expect(fakeResolver).toHaveBeenCalledWith([
            "579885",
            "570182",
        ]);
    });


    it("ignores empty IDs", async () => {
        const fakeResolver = vi.fn(async ids => ({
            places: ids.map(id => ({id})),
            not_found: [],
            invalid: [],
        }));

        await resolveIds(
            ["579885", "", "   ", null, "570182"],
            {resolveBatch: fakeResolver}
        );

        expect(fakeResolver).toHaveBeenCalledWith([
            "579885",
            "570182",
        ]);
    });


    it("splits large requests into batches", async () => {
        const fakeResolver = vi.fn(async ids => ({
            places: ids.map(id => ({id})),
            not_found: [],
            invalid: [],
        }));

        await resolveIds(
            ["1", "2", "3", "4", "5"],
            {
                batchSize: 2,
                resolveBatch: fakeResolver,
            }
        );

        expect(fakeResolver).toHaveBeenCalledTimes(3);

        expect(fakeResolver.mock.calls[0][0]).toEqual([
            "1",
            "2",
        ]);

        expect(fakeResolver.mock.calls[1][0]).toEqual([
            "3",
            "4",
        ]);

        expect(fakeResolver.mock.calls[2][0]).toEqual([
            "5",
        ]);
    });


    it("combines results from multiple batches", async () => {
        const fakeResolver = vi.fn(async ids => ({
            places: ids.map(id => ({
                id,
                title: `Place ${id}`,
            })),
            not_found: [],
            invalid: [],
        }));

        const result = await resolveIds(
            ["1", "2", "3"],
            {
                batchSize: 2,
                resolveBatch: fakeResolver,
            }
        );

        expect(result.places).toEqual([
            {id: "1", title: "Place 1"},
            {id: "2", title: "Place 2"},
            {id: "3", title: "Place 3"},
        ]);
    });


    it("combines not-found and invalid results", async () => {
        const fakeResolver = vi
            .fn()
            .mockResolvedValueOnce({
                places: [],
                not_found: ["999"],
                invalid: [],
            })
            .mockResolvedValueOnce({
                places: [],
                not_found: [],
                invalid: ["banana"],
            });

        const result = await resolveIds(
            ["999", "banana"],
            {
                batchSize: 1,
                resolveBatch: fakeResolver,
            }
        );

        expect(result.not_found).toEqual(["999"]);
        expect(result.invalid).toEqual(["banana"]);
    });
});