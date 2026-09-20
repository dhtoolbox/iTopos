import { resolveBatchFromStaticData } from "./static-resolver.js";

const DEFAULT_BATCH_SIZE = 1000;

export async function resolveIds(
  ids,
  { batchSize = DEFAULT_BATCH_SIZE, resolveBatch = resolveBatchFromStaticData } = {},
) {
  const uniqueIds = uniqueNonEmptyIds(ids);

  const result = {
    places: [],
    not_found: [],
    invalid: [],
  };

  for (let start = 0; start < uniqueIds.length; start += batchSize) {
    const batch = uniqueIds.slice(start, start + batchSize);

    const batchResult = await resolveBatch(batch);

    result.places.push(...(batchResult.places || []));

    result.not_found.push(...(batchResult.not_found || []));

    result.invalid.push(...(batchResult.invalid || []));
  }

  return result;
}

function uniqueNonEmptyIds(ids) {
  return [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
}
