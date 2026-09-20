export function calculateProcessingSummary(dataset, groups, duplicates, result) {
  const matchedIds = new Set(dataset.places.map((place) => place.id));
  const matchedRows = dataset.rows.filter((row) => matchedIds.has(String(row.id ?? "").trim()));
  const mappableIds = new Set(
    dataset.places.filter((place) => place.mappable).map((place) => place.id),
  );
  const mappablePlaces = dataset.places.filter((place) => place.mappable);
  const unlocatedPlaces = dataset.places.filter((place) => !place.mappable);
  const ambiguousPlaces = dataset.places.filter((place) => place.userGroups.length > 1);
  const unspecifiedGroupPlaces = dataset.groupingEnabled
    ? dataset.places.filter((place) => place.userGroups.length === 0)
    : [];

  return {
    rowsProcessed: dataset.rows.length,
    matchedRows: matchedRows.length,
    mappablePlaces: mappablePlaces.length,
    uniquePleiadesIds: dataset.places.length,
    groups: dataset.groupingEnabled ? groups.size : 0,
    duplicateIds: duplicates.duplicateIDs.length,
    duplicatePairs: duplicates.duplicatePairs.length,
    notFoundIds: result.not_found?.length ?? 0,
    invalidIds: result.invalid?.length ?? 0,
    unlocatedPlaces: unlocatedPlaces.length,
    unlocatedIds: unlocatedPlaces.map((place) => place.id),
    unspecifiedGroupPlaces: unspecifiedGroupPlaces.length,
    unspecifiedGroupIds: unspecifiedGroupPlaces.map((place) => place.id),
    multipleGroupPlaces: ambiguousPlaces.length,
    multipleGroupIds: ambiguousPlaces.map((place) => place.id),
    notFoundValues: result.not_found ?? [],
    invalidValues: result.invalid ?? [],
  };
}
