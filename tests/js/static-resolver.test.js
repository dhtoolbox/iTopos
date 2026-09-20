import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DATA_BASE,
  decodePlace,
  normalizeRequestedIds,
} from "../../static/js/data/static-resolver.js";

const MANIFEST_URL = new URL("manifest.json", DATA_BASE);
const TYPES_URL = new URL("types.json", DATA_BASE);
const SEARCH_URL = new URL("search.json", DATA_BASE);
const NAMES_URL = new URL("names.json", DATA_BASE);
const TYPE_COUNTS_URL = new URL("type-counts.json", DATA_BASE);

describe("normalizeRequestedIds", () => {
  it("accepts numeric IDs", () => {
    expect(normalizeRequestedIds(["579885", 570182])).toEqual({
      valid: ["579885", "570182"],
      invalid: [],
    });
  });

  it("reports malformed IDs", () => {
    expect(normalizeRequestedIds(["579885", "banana", ""])).toEqual({
      valid: ["579885"],
      invalid: ["banana", ""],
    });
  });

  it("deduplicates IDs", () => {
    expect(normalizeRequestedIds(["579885", "579885"])).toEqual({
      valid: ["579885"],
      invalid: [],
    });
  });

  it("normalizes leading zeroes", () => {
    expect(normalizeRequestedIds(["00579885", "579885"])).toEqual({
      valid: ["579885"],
      invalid: [],
    });
  });

  it("does not lose precision on long IDs", () => {
    expect(normalizeRequestedIds(["12345678901234567890"])).toEqual({
      valid: ["12345678901234567890"],
      invalid: [],
    });
  });
});

describe("decodePlace", () => {
  const types = [["aqueduct", "Aqueduct"], ["port", "Port"], ["settlement", "Settlement"]];

  it("decodes a located place", () => {
    const place = decodePlace("579885", ["Athens", 37.97, 23.72, [1, 2]], types);

    expect(place).toEqual({
      id: 579885,
      title: "Athens",
      repr_lat: 37.97,
      repr_lng: 23.72,
      place_types: ["Port", "Settlement"],
      place_type_keys: ["port", "settlement"],
    });
  });

  it("decodes an unlocated place", () => {
    const place = decodePlace("123456", ["Lost Place", null, null, [2]], types);

    expect(place).toMatchObject({
      id: 123456,
      repr_lat: null,
      repr_lng: null,
      place_types: ["Settlement"],
      place_type_keys: ["settlement"],
    });
  });

  it("rejects an invalid type index", () => {
    expect(() => decodePlace("579885", ["Athens", 1, 2, [999]], types)).toThrow(
      "Unknown feature-category index",
    );
  });
});

describe("static Pleiades loading", () => {
  beforeEach(() => {
    /*
     * The resolver caches manifest, type,
     * search, and shard Promises at module
     * scope. Each test needs a fresh module.
     */
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("loads the manifest with cache revalidation", async () => {
    const manifest = {
      refreshed_at: "2026-08-23T12:00:00Z",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,

      json: async () => manifest,
    });

    vi.stubGlobal("fetch", fetchMock);

    const { loadManifest } = await import("../../static/js/data/static-resolver.js");

    const result = await loadManifest();

    expect(result).toEqual(manifest);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(new URL(String(url)).href).toBe(MANIFEST_URL.href);

    expect(options).toEqual({
      cache: "no-cache",
    });
  });

  it("caches the manifest promise within the page session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,

      json: async () => ({
        refreshed_at: "2026-08-23T12:00:00Z",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { loadManifest } = await import("../../static/js/data/static-resolver.js");

    const first = loadManifest();

    const second = loadManifest();

    expect(second).toBe(first);

    await first;
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("can load the search corpus before any explicit manifest request", async () => {
    const refreshedAt = "2026-08-23T12:00:00Z";

    const corpus = [["963101052", "Fort at Great Wall of Gorgan", 37.484, 55.50946, [0]]];

    const fetchMock = vi.fn(async (url) => {
      const parsedUrl = new URL(String(url));

      if (parsedUrl.pathname === MANIFEST_URL.pathname) {
        return {
          ok: true,

          json: async () => ({
            refreshed_at: refreshedAt,
          }),
        };
      }

      if (parsedUrl.pathname === SEARCH_URL.pathname) {
        return {
          ok: true,

          json: async () => corpus,
        };
      }

      throw new Error(`Unexpected URL: ${parsedUrl.href}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { loadPleiadesSearchCorpus } = await import("../../static/js/data/static-resolver.js");

    const result = await loadPleiadesSearchCorpus();

    expect(result).toEqual(corpus);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const manifestUrl = new URL(String(fetchMock.mock.calls[0][0]));

    const searchUrl = new URL(String(fetchMock.mock.calls[1][0]));

    expect(manifestUrl.href).toBe(MANIFEST_URL.href);

    expect(searchUrl.pathname).toBe(SEARCH_URL.pathname);

    expect(searchUrl.searchParams.get("v")).toBe(refreshedAt);
  });

  it("loads place types through a versioned URL", async () => {
    const refreshedAt = "2026-08-23T12:00:00Z";

    const types = [["castle", "Castle"], ["port", "Port"], ["settlement", "Settlement"]];

    const fetchMock = vi.fn(async (url) => {
      const parsedUrl = new URL(String(url));

      if (parsedUrl.pathname === MANIFEST_URL.pathname) {
        return {
          ok: true,

          json: async () => ({
            refreshed_at: refreshedAt,
          }),
        };
      }

      if (parsedUrl.pathname === TYPES_URL.pathname) {
        return {
          ok: true,

          json: async () => types,
        };
      }

      throw new Error(`Unexpected URL: ${parsedUrl.href}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { loadPleiadesPlaceTypes } = await import("../../static/js/data/static-resolver.js");

    const result = await loadPleiadesPlaceTypes();

    expect(result).toEqual(types);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const typesUrl = new URL(String(fetchMock.mock.calls[1][0]));

    expect(typesUrl.pathname).toBe(TYPES_URL.pathname);

    expect(typesUrl.searchParams.get("v")).toBe(refreshedAt);
  });

  it("reuses the cached manifest when loading multiple static resources", async () => {
    const refreshedAt = "2026-08-23T12:00:00Z";

    const fetchMock = vi.fn(async (url) => {
      const parsedUrl = new URL(String(url));

      if (parsedUrl.pathname === MANIFEST_URL.pathname) {
        return {
          ok: true,

          json: async () => ({
            refreshed_at: refreshedAt,
          }),
        };
      }

      if (parsedUrl.pathname === TYPES_URL.pathname) {
        return {
          ok: true,

          json: async () => ["castle"],
        };
      }

      if (parsedUrl.pathname === SEARCH_URL.pathname) {
        return {
          ok: true,

          json: async () => [],
        };
      }

      throw new Error(`Unexpected URL: ${parsedUrl.href}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { loadPleiadesPlaceTypes, loadPleiadesSearchCorpus } =
      await import("../../static/js/data/static-resolver.js");

    await Promise.all([loadPleiadesPlaceTypes(), loadPleiadesSearchCorpus()]);

    const manifestCalls = fetchMock.mock.calls.filter(
      ([url]) => new URL(String(url)).pathname === MANIFEST_URL.pathname,
    );

    expect(manifestCalls).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not add a version parameter when the manifest has no refresh date", async () => {
    const fetchMock = vi.fn(async (url) => {
      const parsedUrl = new URL(String(url));

      if (parsedUrl.pathname === MANIFEST_URL.pathname) {
        return {
          ok: true,

          json: async () => ({
            refreshed_at: null,
          }),
        };
      }

      if (parsedUrl.pathname === SEARCH_URL.pathname) {
        return {
          ok: true,

          json: async () => [],
        };
      }

      throw new Error(`Unexpected URL: ${parsedUrl.href}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { loadPleiadesSearchCorpus } = await import("../../static/js/data/static-resolver.js");

    await loadPleiadesSearchCorpus();

    const searchUrl = new URL(String(fetchMock.mock.calls[1][0]));

    expect(searchUrl.pathname).toBe(SEARCH_URL.pathname);

    expect(searchUrl.searchParams.has("v")).toBe(false);
  });

  it("loads precomputed place names and type counts through versioned URLs", async () => {
    const refreshedAt = "2026-08-23T12:00:00Z";
    const fetchMock = vi.fn(async (url) => {
      const parsedUrl = new URL(String(url));
      if (parsedUrl.pathname === MANIFEST_URL.pathname) {
        return { ok: true, json: async () => ({ refreshed_at: refreshedAt }) };
      }
      if (parsedUrl.pathname === NAMES_URL.pathname) {
        return { ok: true, json: async () => ["Athenae", "Gallia"] };
      }
      if (parsedUrl.pathname === TYPE_COUNTS_URL.pathname) {
        return { ok: true, json: async () => [1, 2, 0] };
      }
      throw new Error(`Unexpected URL: ${parsedUrl.href}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const { loadPleiadesPlaceNames, loadPleiadesTypeCounts } = await import(
      "../../static/js/data/static-resolver.js"
    );

    expect(await loadPleiadesPlaceNames()).toEqual(["Athenae", "Gallia"]);
    expect(await loadPleiadesTypeCounts()).toEqual([1, 2, 0]);

    const requested = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(requested.find((url) => url.pathname === NAMES_URL.pathname).searchParams.get("v")).toBe(refreshedAt);
    expect(requested.find((url) => url.pathname === TYPE_COUNTS_URL.pathname).searchParams.get("v")).toBe(refreshedAt);
  });

});
