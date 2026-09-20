export function analyzeDuplicates(places) {
  const idToGroups = new Map();
  const idCounts = new Map();
  const pairCounts = new Map();

  for (const place of places) {
    const id = String(place.id ?? "").trim();

    if (!id) {
      continue;
    }

    if (!idToGroups.has(id)) {
      idToGroups.set(id, new Set());
    }

    if (place.group) {
      idToGroups.get(id).add(place.group);
    }

    idCounts.set(id, (idCounts.get(id) || 0) + 1);

    if (place.group) {
      const key = `${id}\u0000${place.group}`;

      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
  }

  const duplicateIDs = [];

  for (const [id, count] of idCounts) {
    if (count > 1) {
      duplicateIDs.push({ id, count });
    }
  }

  const duplicatePairs = [];

  for (const [key, count] of pairCounts) {
    if (count > 1) {
      const [id, group] = key.split("\u0000");

      duplicatePairs.push({
        id,
        group,
        count,
      });
    }
  }

  const crossGroupConflicts = [];

  for (const [id, groups] of idToGroups) {
    if (groups.size > 1) {
      crossGroupConflicts.push({
        id,
        groups: Array.from(groups),
      });
    }
  }

  return {
    duplicateIDs,
    duplicatePairs,
    crossGroupConflicts,
  };
}
