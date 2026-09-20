#!/usr/bin/env python3
"""Export the validated Pleiades SQLite snapshot for static browser lookup."""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path


FORMAT_VERSION = 2
CONFIDENCES = [
    "confident",
    "confident-inferred",
    "less-confident",
    "less-confident-inferred",
]


@dataclass
class ExportStats:
    places: int = 0
    located: int = 0
    unlocated: int = 0
    type_mappings: int = 0
    place_types: int = 0
    search_records: int = 0
    place_names: int = 0
    time_periods: int = 0
    temporal_places: int = 0
    temporal_records: int = 0
    temporal_located_places: int = 0
    temporal_unlocated_places: int = 0
    temporal_locations: int = 0
    temporal_names: int = 0
    location_attestations: int = 0
    name_attestations: int = 0
    period_place_mappings: int = 0


def load_type_index(connection: sqlite3.Connection) -> tuple[list[list], dict[str, int]]:
    rows = connection.execute(
        """
        SELECT key, term
        FROM place_types
        WHERE in_vocabulary = 1
        ORDER BY key
        """
    ).fetchall()
    types = [[key, term] for key, term in rows]
    return types, {row[0]: index for index, row in enumerate(types)}


def load_types_by_place(
    connection: sqlite3.Connection,
    type_to_index: dict[str, int],
) -> dict[int, list[int]]:
    result: dict[int, list[int]] = {}
    rows = connection.execute(
        """
        SELECT ppt.place_id, ppt.place_type
        FROM places_place_types AS ppt
        JOIN place_types AS pt ON pt.key = ppt.place_type
        WHERE pt.in_vocabulary = 1
        ORDER BY ppt.place_id, ppt.place_type
        """
    )
    for place_id, place_type in rows:
        result.setdefault(place_id, []).append(type_to_index[place_type])
    return result


def load_location_types(
    connection: sqlite3.Connection,
    type_to_index: dict[str, int],
) -> dict[int, list[int]]:
    result: dict[int, list[int]] = {}
    rows = connection.execute(
        """
        SELECT lpt.location_pk, lpt.place_type
        FROM locations_place_types AS lpt
        JOIN place_types AS pt ON pt.key = lpt.place_type
        WHERE pt.in_vocabulary = 1
        ORDER BY lpt.location_pk, lpt.place_type
        """
    )
    for location_pk, place_type in rows:
        result.setdefault(location_pk, []).append(type_to_index[place_type])
    return result


def load_period_index(connection: sqlite3.Connection) -> tuple[list[list], dict[str, int]]:
    rows = connection.execute(
        """
        SELECT key, term, lower_bound, upper_bound
        FROM time_periods
        ORDER BY lower_bound, upper_bound, key
        """
    ).fetchall()
    periods = [[key, term, lower, upper] for key, term, lower, upper in rows]
    return periods, {row[0]: index for index, row in enumerate(periods)}


def shard_for_id(place_id: int) -> str:
    return str(place_id)[0]


def load_refresh_metadata(metadata_path: Path) -> dict:
    if not metadata_path.exists():
        return {}
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def export_dataset(database_path: Path, output_dir: Path, metadata_path: Path) -> ExportStats:
    stats = ExportStats()
    connection = sqlite3.connect(f"{database_path.resolve().as_uri()}?mode=ro", uri=True)

    try:
        types, type_to_index = load_type_index(connection)
        types_by_place = load_types_by_place(connection, type_to_index)
        location_types = load_location_types(connection, type_to_index)
        periods, period_to_index = load_period_index(connection)
        confidence_to_index = {value: index for index, value in enumerate(CONFIDENCES)}

        stats.place_types = len(types)
        stats.type_mappings = sum(len(values) for values in types_by_place.values())
        stats.time_periods = len(periods)

        search_records: list[list] = []
        located_names: set[str] = set()
        located_type_counts = [0] * len(types)
        shards: dict[str, dict[str, list]] = {str(number): {} for number in range(1, 10)}

        rows = connection.execute(
            "SELECT id, title, repr_lat, repr_lng FROM places ORDER BY id"
        )
        for place_id, title, repr_lat, repr_lng in rows:
            stats.places += 1
            has_lat = repr_lat is not None
            has_long = repr_lng is not None
            if has_lat != has_long:
                raise RuntimeError(f"Place has only one representative point: {place_id}")
            if has_lat:
                if not math.isfinite(repr_lat) or not math.isfinite(repr_lng):
                    raise RuntimeError(f"Place has non-finite coordinates: {place_id}")
                stats.located += 1
            else:
                stats.unlocated += 1

            type_indexes = types_by_place.get(place_id, [])
            shards[shard_for_id(place_id)][str(place_id)] = [title, repr_lat, repr_lng, type_indexes]

            if has_lat:
                search_records.append([str(place_id), title, repr_lat, repr_lng, type_indexes])
                stats.search_records += 1
                if title:
                    located_names.add(title)
                for type_index in type_indexes:
                    located_type_counts[type_index] += 1

        stats.place_names = len(located_names)

        temporal_shards: dict[str, dict[str, dict]] = {str(number): {} for number in range(1, 10)}
        period_places: list[set[int]] = [set() for _ in periods]

        location_attestations: dict[int, list[list[int]]] = {}
        for location_pk, place_id, period, confidence in connection.execute(
            """
            SELECT ltp.location_pk, l.place_id, ltp.time_period, ltp.confidence
            FROM locations_time_periods AS ltp
            JOIN locations AS l ON l.location_pk = ltp.location_pk
            ORDER BY ltp.location_pk, ltp.time_period, ltp.confidence
            """
        ):
            if period not in period_to_index:
                raise RuntimeError(f"Location attestation references unknown period: {period}")
            if confidence not in confidence_to_index:
                raise RuntimeError(f"Location attestation references unknown confidence: {confidence}")
            period_index = period_to_index[period]
            location_attestations.setdefault(location_pk, []).append(
                [period_index, confidence_to_index[confidence]]
            )
            period_places[period_index].add(place_id)
            stats.location_attestations += 1

        for location_pk, place_id, start, end in connection.execute(
            """
            SELECT location_pk, place_id, start, end
            FROM locations
            WHERE location_pk IN (SELECT DISTINCT location_pk FROM locations_time_periods)
            ORDER BY place_id, location_pk
            """
        ):
            record = {
                "start": start,
                "end": end,
                "types": location_types.get(location_pk, []),
                "attestations": location_attestations.get(location_pk, []),
            }
            place_record = temporal_shards[shard_for_id(place_id)].setdefault(
                str(place_id), {"locations": [], "names": []}
            )
            place_record["locations"].append(record)
            stats.temporal_locations += 1

        name_attestations: dict[int, list[list[int]]] = {}
        for name_pk, place_id, period, confidence in connection.execute(
            """
            SELECT ntp.name_pk, n.place_id, ntp.time_period, ntp.confidence
            FROM names_time_periods AS ntp
            JOIN names AS n ON n.name_pk = ntp.name_pk
            ORDER BY ntp.name_pk, ntp.time_period, ntp.confidence
            """
        ):
            if period not in period_to_index:
                raise RuntimeError(f"Name attestation references unknown period: {period}")
            if confidence not in confidence_to_index:
                raise RuntimeError(f"Name attestation references unknown confidence: {confidence}")
            period_index = period_to_index[period]
            name_attestations.setdefault(name_pk, []).append(
                [period_index, confidence_to_index[confidence]]
            )
            period_places[period_index].add(place_id)
            stats.name_attestations += 1

        for (
            name_pk,
            place_id,
            attested,
            romanized,
            language,
            name_type,
            start,
            end,
        ) in connection.execute(
            """
            SELECT name_pk, place_id, attested, romanized, language, name_type, start, end
            FROM names
            WHERE name_pk IN (SELECT DISTINCT name_pk FROM names_time_periods)
            ORDER BY place_id, name_pk
            """
        ):
            record = {
                "romanized": romanized,
                "attested": attested,
                "language": language,
                "name_type": name_type,
                "start": start,
                "end": end,
                "attestations": name_attestations.get(name_pk, []),
            }
            place_record = temporal_shards[shard_for_id(place_id)].setdefault(
                str(place_id), {"locations": [], "names": []}
            )
            place_record["names"].append(record)
            stats.temporal_names += 1

        # Preserve total child counts so the browser can disclose Locations/Names
        # that exist but have no time-period attestations. A Place with only undated
        # children still needs a lightweight temporal record for popup disclosure,
        # even though it contributes nothing to temporal filtering.
        location_totals = dict(connection.execute(
            "SELECT place_id, COUNT(*) FROM locations GROUP BY place_id"
        ))
        name_totals = dict(connection.execute(
            "SELECT place_id, COUNT(*) FROM names GROUP BY place_id"
        ))

        # Count Places with actual temporal evidence before adding count-only records.
        temporal_place_ids = {
            int(place_id)
            for shard in temporal_shards.values()
            for place_id in shard
        }
        stats.temporal_places = len(temporal_place_ids)

        child_place_ids = set(location_totals) | set(name_totals)
        for place_id in child_place_ids:
            place_record = temporal_shards[shard_for_id(place_id)].setdefault(
                str(place_id), {"locations": [], "names": []}
            )
            place_record["total_locations"] = location_totals.get(place_id, 0)
            place_record["total_names"] = name_totals.get(place_id, 0)

        stats.temporal_records = sum(len(shard) for shard in temporal_shards.values())
        if temporal_place_ids:
            placeholders = ",".join("?" for _ in temporal_place_ids)
            stats.temporal_located_places = connection.execute(
                f"SELECT COUNT(*) FROM places WHERE id IN ({placeholders}) AND repr_lat IS NOT NULL",
                tuple(sorted(temporal_place_ids)),
            ).fetchone()[0]
        stats.temporal_unlocated_places = stats.temporal_places - stats.temporal_located_places
        period_place_lists = [sorted(values) for values in period_places]
        stats.period_place_mappings = sum(len(values) for values in period_place_lists)

        validate_export(connection, stats)
        write_dataset(
            output_dir,
            shards,
            types,
            search_records,
            sorted(located_names),
            located_type_counts,
            temporal_shards,
            periods,
            CONFIDENCES,
            period_place_lists,
            stats,
            load_refresh_metadata(metadata_path),
        )
    finally:
        connection.close()

    return stats


def validate_export(connection: sqlite3.Connection, stats: ExportStats) -> None:
    db_places = connection.execute("SELECT COUNT(*) FROM places").fetchone()[0]
    db_mappings = connection.execute(
        """
        SELECT COUNT(*)
        FROM places_place_types AS ppt
        JOIN place_types AS pt ON pt.key = ppt.place_type
        WHERE pt.in_vocabulary = 1
        """
    ).fetchone()[0]
    db_types = connection.execute(
        "SELECT COUNT(*) FROM place_types WHERE in_vocabulary = 1"
    ).fetchone()[0]
    db_located_names = connection.execute(
        """
        SELECT COUNT(DISTINCT title)
        FROM places
        WHERE repr_lat IS NOT NULL AND title IS NOT NULL AND title <> ''
        """
    ).fetchone()[0]
    db_periods = connection.execute("SELECT COUNT(*) FROM time_periods").fetchone()[0]
    db_temporal_locations = connection.execute(
        "SELECT COUNT(DISTINCT location_pk) FROM locations_time_periods"
    ).fetchone()[0]
    db_temporal_names = connection.execute(
        "SELECT COUNT(DISTINCT name_pk) FROM names_time_periods"
    ).fetchone()[0]
    db_location_attestations = connection.execute(
        "SELECT COUNT(*) FROM locations_time_periods"
    ).fetchone()[0]
    db_name_attestations = connection.execute(
        "SELECT COUNT(*) FROM names_time_periods"
    ).fetchone()[0]
    db_temporal_located_places = connection.execute(
        """
        SELECT COUNT(*) FROM places p
        WHERE p.repr_lat IS NOT NULL
          AND p.id IN (
              SELECT l.place_id FROM locations_time_periods ltp
              JOIN locations l ON l.location_pk = ltp.location_pk
              UNION
              SELECT n.place_id FROM names_time_periods ntp
              JOIN names n ON n.name_pk = ntp.name_pk
          )
        """
    ).fetchone()[0]
    db_temporal_places = connection.execute(
        """
        SELECT COUNT(*) FROM (
            SELECT l.place_id
            FROM locations_time_periods ltp
            JOIN locations l ON l.location_pk = ltp.location_pk
            UNION
            SELECT n.place_id
            FROM names_time_periods ntp
            JOIN names n ON n.name_pk = ntp.name_pk
        )
        """
    ).fetchone()[0]

    checks = [
        (stats.places, db_places, "Exported place count does not match the database."),
        (stats.type_mappings, db_mappings, "Exported type-mapping count does not match the database."),
        (stats.place_types, db_types, "Exported place-type count does not match the database."),
        (stats.place_names, db_located_names, "Place-name count does not match the located distinct-title count."),
        (stats.time_periods, db_periods, "Exported time-period count does not match the database."),
        (stats.temporal_locations, db_temporal_locations, "Temporal Location count does not match the database."),
        (stats.temporal_names, db_temporal_names, "Temporal Name count does not match the database."),
        (stats.location_attestations, db_location_attestations, "Location attestation count does not match the database."),
        (stats.name_attestations, db_name_attestations, "Name attestation count does not match the database."),
        (stats.temporal_places, db_temporal_places, "Temporal Place count does not match the database."),
        (stats.temporal_located_places, db_temporal_located_places, "Located temporal Place count does not match the database."),
    ]
    for actual, expected, message in checks:
        if actual != expected:
            raise RuntimeError(message)
    if stats.temporal_located_places + stats.temporal_unlocated_places != stats.temporal_places:
        raise RuntimeError("Located/unlocated temporal Place counts do not add up.")
    if stats.search_records != stats.located:
        raise RuntimeError("Search-record count does not match the located-place count.")
    if stats.located + stats.unlocated != stats.places:
        raise RuntimeError("Located/unlocated counts do not add up to the total place count.")


def write_dataset(
    output_dir: Path,
    shards: dict[str, dict[str, list]],
    types: list[list],
    search_records: list[list],
    place_names: list[str],
    type_counts: list[int],
    temporal_shards: dict[str, dict[str, dict]],
    periods: list[list],
    confidences: list[str],
    period_places: list[list[int]],
    stats: ExportStats,
    source_metadata: dict,
) -> None:
    temporary_dir = output_dir.with_name(f"{output_dir.name}.tmp")
    if temporary_dir.exists():
        shutil.rmtree(temporary_dir)
    temporary_dir.mkdir(parents=True, exist_ok=True)

    try:
        write_json(temporary_dir / "types.json", types)
        write_json(temporary_dir / "search.json", search_records)
        write_json(temporary_dir / "names.json", place_names)
        write_json(temporary_dir / "type-counts.json", type_counts)
        for shard_name, places in shards.items():
            write_json(temporary_dir / f"{shard_name}.json", places)

        temporal_dir = temporary_dir / "temporal"
        temporal_dir.mkdir()
        write_json(temporal_dir / "periods.json", periods)
        write_json(temporal_dir / "confidences.json", confidences)
        write_json(temporal_dir / "period-places.json", period_places)
        for shard_name, places in temporal_shards.items():
            write_json(temporal_dir / f"{shard_name}.json", places)

        temporal_manifest = {
            "format_version": FORMAT_VERSION,
            "places": stats.temporal_places,
            "records": stats.temporal_records,
            "located_places": stats.temporal_located_places,
            "unlocated_places": stats.temporal_unlocated_places,
            "locations": stats.temporal_locations,
            "names": stats.temporal_names,
            "location_attestations": stats.location_attestations,
            "name_attestations": stats.name_attestations,
            "time_periods": stats.time_periods,
            "period_place_mappings": stats.period_place_mappings,
            "shards": 9,
            "period_schema": ["key", "term", "lower_bound", "upper_bound"],
            "attestation_schema": ["period_index", "confidence_index"],
        }
        write_json(temporal_dir / "manifest.json", temporal_manifest, pretty=True)

        manifest = {
            "format_version": FORMAT_VERSION,
            "source": "Pleiades GIS",
            "source_url": source_metadata.get("source_url"),
            "refreshed_at": source_metadata.get("refreshed_at"),
            "places": stats.places,
            "located": stats.located,
            "unlocated": stats.unlocated,
            "place_types": stats.place_types,
            "type_mappings": stats.type_mappings,
            "shards": 9,
            "search_records": stats.search_records,
            "place_names": stats.place_names,
            "temporal": True,
            "temporal_places": stats.temporal_places,
            "temporal_records": stats.temporal_records,
            "temporal_located_places": stats.temporal_located_places,
            "temporal_unlocated_places": stats.temporal_unlocated_places,
            "search_schema": ["id", "title", "latitude", "longitude", "type_indexes"],
            "type_schema": ["key", "term"],
        }
        write_json(temporary_dir / "manifest.json", manifest, pretty=True)

        if output_dir.exists():
            shutil.rmtree(output_dir)
        temporary_dir.rename(output_dir)
    except Exception:
        shutil.rmtree(temporary_dir, ignore_errors=True)
        raise


def write_json(path: Path, value, *, pretty: bool = False) -> None:
    if pretty:
        text = json.dumps(value, ensure_ascii=False, indent=2)
    else:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")


def print_report(output_dir: Path, stats: ExportStats) -> None:
    static_bytes = sum(path.stat().st_size for path in output_dir.glob("*.json"))
    temporal_dir = output_dir / "temporal"
    temporal_bytes = sum(path.stat().st_size for path in temporal_dir.glob("*.json"))
    total_bytes = static_bytes + temporal_bytes
    print("\n" + "=" * 45)
    print("      STATIC PLEIADES EXPORT")
    print("=" * 45)
    print(f"Output:                 {output_dir}")
    print(f"Places:                 {stats.places}")
    print(f"Located:                {stats.located}")
    print(f"Unlocated:              {stats.unlocated}")
    print(f"Place types:            {stats.place_types}")
    print(f"Type mappings:          {stats.type_mappings}")
    print(f"Search records:         {stats.search_records}")
    print(f"Place names:            {stats.place_names}")
    print(f"Time periods:           {stats.time_periods}")
    print(f"Temporal places:        {stats.temporal_places}")
    print(f"Temporal records:       {stats.temporal_records}")
    print(f"  Located:              {stats.temporal_located_places}")
    print(f"  Unlocated:            {stats.temporal_unlocated_places}")
    print(f"Temporal locations:     {stats.temporal_locations}")
    print(f"Temporal names:         {stats.temporal_names}")
    print(f"Location attestations:  {stats.location_attestations}")
    print(f"Name attestations:      {stats.name_attestations}")
    print(f"Period/place mappings:  {stats.period_place_mappings}")
    print(f"Static JSON size:       {static_bytes / 1024 / 1024:.2f} MB")
    print(f"Temporal JSON size:     {temporal_bytes / 1024 / 1024:.2f} MB")
    print(f"Total JSON size:        {total_bytes / 1024 / 1024:.2f} MB")
    print("=" * 45 + "\n")


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    base_dir = script_dir.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=base_dir / "data" / "pleiades.sqlite")
    parser.add_argument("--output", type=Path, default=base_dir / "static" / "data" / "pleiades")
    parser.add_argument("--metadata", type=Path, default=base_dir / "data" / "archive" / "pleiades_gis_data.json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        stats = export_dataset(args.database, args.output, args.metadata)
    except Exception as exc:
        print(f"EXPORT FAILED: {exc}")
        return 1
    print_report(args.output, stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
