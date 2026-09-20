#!/usr/bin/env python3
"""ETL current Pleiades source data into the local iTopos SQLite model."""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import shutil
import sqlite3
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote

from utils import download_file, download_file_to_disk

GIS_ZIP_URL = "https://atlantides.org/downloads/pleiades/gis/pleiades_gis_data.zip"
PLACES_JSON_GZ_URL = "https://atlantides.org/downloads/pleiades/json/pleiades-places-latest.json.gz"

PLACE_URI_RE = re.compile(r"^https?://pleiades\.stoa\.org/places/(\d{3,20})/?$", re.I)
LOCATION_URI_RE = re.compile(r"^https?://pleiades\.stoa\.org/places/(\d{3,20})/([^/?#]+)/?$", re.I)
NAME_URI_RE = LOCATION_URI_RE
PLACE_TYPE_URI_PREFIX = "https://pleiades.stoa.org/vocabularies/place-types/"
TIME_PERIOD_URI_PREFIX = "https://pleiades.stoa.org/vocabularies/time-periods/"
ATTESTATION_CONFIDENCE_URI_PREFIX = "https://pleiades.stoa.org/vocabularies/attestation-confidence/"
ASSOCIATION_CERTAINTY_URI_PREFIX = "https://pleiades.stoa.org/vocabularies/association-certainty/"
ACCURACY_BASIS_URI_PREFIX = "https://pleiades.stoa.org/features/metadata/"

ATTESTATION_CONFIDENCE_KEYS = {
    "confident",
    "confident-inferred",
    "less-confident",
    "less-confident-inferred",
}
LOCATION_TYPE_KEYS = {
    "associated_modern",
    "central_point",
    "legacy",
    "representative",
    "relocated_modern",
}

MAX_DIAGNOSTIC_EXAMPLES = 20


@dataclass
class ImportStats:
    places_read: int = 0
    places_imported: int = 0
    mappable: int = 0
    unmappable: int = 0
    invalid_place_ids: int = 0
    place_uri_mismatches: int = 0
    place_type_mappings: int = 0
    locations_read: int = 0
    locations_imported: int = 0
    location_uri_mismatches: int = 0
    locations_with_dates: int = 0
    locations_without_dates: int = 0
    locations_partial_dates: int = 0
    location_type_mappings: int = 0
    attestations_read: int = 0
    time_period_mappings: int = 0
    locations_with_named_periods: int = 0
    names_read: int = 0
    names_imported: int = 0
    duplicate_name_ids: int = 0
    name_uri_mismatches: int = 0
    names_with_dates: int = 0
    names_without_dates: int = 0
    names_partial_dates: int = 0
    names_with_named_periods: int = 0
    name_attestations_read: int = 0
    name_time_period_mappings: int = 0
    names_attested_present: int = 0
    names_romanized_present: int = 0
    names_language_present: int = 0
    name_types: Counter[str] = field(default_factory=Counter)
    places_by_name_count: Counter[int] = field(default_factory=Counter)
    max_periods_per_name: int = 0
    name_dates_and_periods: int = 0
    name_dates_without_periods: int = 0
    name_periods_without_dates: int = 0
    name_neither_dates_nor_periods: int = 0
    name_start_after_end: int = 0
    name_association_uri_discrepancies: int = 0
    name_time_period_uri_discrepancies: int = 0
    name_confidence_uri_discrepancies: int = 0
    geometry_types: Counter[str] = field(default_factory=Counter)
    polygon_exterior_vertices_min: int | None = None
    polygon_exterior_vertices_max: int = 0
    polygons_with_interior_rings: int = 0
    polygons_with_repeated_vertices: int = 0
    multipolygon_parts_max: int = 0
    places_by_location_count: Counter[int] = field(default_factory=Counter)
    unknown_place_type_keys: set[str] = field(default_factory=set)
    unlisted_place_type_records: dict[str, list[tuple[int, str | None, str | None]]] = field(default_factory=dict)
    legacy_location_category_aliases_normalized: int = 0
    unknown_location_type_keys: set[str] = field(default_factory=set)
    unknown_time_period_keys: set[str] = field(default_factory=set)
    unknown_association_certainty_keys: set[str] = field(default_factory=set)
    unknown_archaeological_remains_keys: set[str] = field(default_factory=set)
    unknown_attestation_confidence_keys: set[str] = field(default_factory=set)
    unknown_location_category_keys: set[str] = field(default_factory=set)
    location_category_mappings: int = 0
    feature_type_uri_location_type_uri_equal: int = 0
    feature_type_uri_location_type_uri_different: int = 0
    feature_type_uri_only: int = 0
    location_type_uri_only: int = 0
    neither_type_uri: int = 0
    dates_and_periods: int = 0
    dates_without_periods: int = 0
    periods_without_dates: int = 0
    neither_dates_nor_periods: int = 0
    type_uri_discrepancies: int = 0
    time_period_uri_discrepancies: int = 0
    confidence_uri_discrepancies: int = 0
    association_uri_discrepancies: int = 0
    feature_location_unmatched: int = 0
    location_feature_unmatched: int = 0
    unexpected_place_temporal_fields: int = 0
    start_after_end: int = 0
    diagnostics: dict[str, list[str]] = field(default_factory=dict)

    def note(self, category: str, message: str) -> None:
        bucket = self.diagnostics.setdefault(category, [])
        if len(bucket) < MAX_DIAGNOSTIC_EXAMPLES:
            bucket.append(message)


def get_zip_buffer(archive_dir: Path, force_download: bool = False) -> io.BytesIO:
    archive_dir.mkdir(parents=True, exist_ok=True)
    cached_zip = archive_dir / "pleiades_gis_data.zip"
    if cached_zip.exists() and not force_download:
        print(f"Using cached GIS archive: {cached_zip}", flush=True)
        return io.BytesIO(cached_zip.read_bytes())
    return download_file(GIS_ZIP_URL, cached_zip)


def get_json_path(archive_dir: Path, force_download: bool = False) -> Path:
    return get_large_json_path(
        archive_dir,
        "pleiades-places-latest",
        PLACES_JSON_GZ_URL,
        force_download,
    )


def get_large_json_path(
        archive_dir: Path,
        stem: str,
        url: str,
        force_download: bool = False,
) -> Path:
    archive_dir.mkdir(parents=True, exist_ok=True)
    gz_path = archive_dir / f"{stem}.json.gz"
    json_path = archive_dir / f"{stem}.json"

    if force_download or not gz_path.exists():
        download_file_to_disk(url, gz_path)
    else:
        print(f"Using cached JSON archive: {gz_path}", flush=True)

    if force_download or not json_path.exists() or json_path.stat().st_mtime < gz_path.stat().st_mtime:
        print(f"Extracting {gz_path.name}...", flush=True)
        with gzip.open(gz_path, "rb") as source, json_path.open("wb") as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)
    else:
        print(f"Using cached extracted JSON: {json_path}", flush=True)

    return json_path


def read_csv_from_zip(zf: zipfile.ZipFile, path: str) -> csv.DictReader:
    if path not in zf.namelist():
        raise RuntimeError(f"Required Pleiades file missing: {path}")
    return csv.DictReader(io.StringIO(zf.read(path).decode("utf-8-sig")))


def read_vocabs(
        zf: zipfile.ZipFile,
        filename: str,
        opt_fields: dict[str, Callable[[str], Any]] | None = None,
) -> dict[str, Any]:
    path = f"data/gis/{filename}"
    if path not in zf.namelist():
        print(f"Vocabulary not packaged in GIS archive: {filename}", flush=True)
        return {}

    result: dict[str, Any] = {}
    parsers = opt_fields or {}
    for row in read_csv_from_zip(zf, path):
        key = (row.get("key") or "").strip()
        term = (row.get("term") or "").strip()
        if not key:
            continue
        if not parsers:
            result[key] = term
            continue
        entry = {"term": term}
        for field_name, parser_func in parsers.items():
            entry[field_name] = parser_func(row.get(field_name) or "")
        result[key] = entry
    return result


def uri_key(uri: object, prefix: str) -> str | None:
    if not isinstance(uri, str) or not uri.startswith(prefix):
        return None
    key = uri[len(prefix):].strip("/")
    return key or None


def validate_parallel_keys_and_uris(
        keys: object,
        uris: object,
        prefix: str,
        stats: ImportStats,
        category: str,
        context: str,
) -> list[str]:
    clean_keys = [str(value).strip() for value in keys] if isinstance(keys, list) else []
    clean_uris = [value if isinstance(value, str) else "" for value in uris] if isinstance(uris, list) else []
    if len(clean_keys) != len(clean_uris):
        stats.type_uri_discrepancies += 1
        stats.note(category, f"{context}: key/URI array lengths differ ({len(clean_keys)} vs {len(clean_uris)})")

    imported: list[str] = []
    for index, key in enumerate(clean_keys):
        if not key:
            continue
        imported.append(key)
        uri = clean_uris[index] if index < len(clean_uris) else ""
        uri_value = uri_key(uri, prefix)
        if uri_value != key:
            stats.type_uri_discrepancies += 1
            stats.note(category, f"{context}: key={key!r}, uri={uri!r}")
    return imported


def compact_geometry(geometry: object) -> tuple[str | None, str | None]:
    if not isinstance(geometry, dict):
        return None, None
    geometry_type = geometry.get("type")
    if not isinstance(geometry_type, str) or not geometry_type:
        geometry_type = None
    return geometry_type, json.dumps(geometry, separators=(",", ":"), ensure_ascii=False)


def extract_accuracy_basis(raw: object, stats: ImportStats, context: str) -> str | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    value = raw.strip()
    if value.startswith(ACCURACY_BASIS_URI_PREFIX):
        return value[len(ACCURACY_BASIS_URI_PREFIX):].strip("/") or None
    stats.note("accuracy_basis", f"{context}: unexpected accuracy URI {value!r}")
    return value


def parse_pleiades_year(value: str) -> int | None:
    """Convert Pleiades CSV year strings to signed integer years."""
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    upper = text.upper()

    if upper.startswith("AD "):
        return int(upper[3:].strip())

    if upper.endswith(" AD"):
        return int(upper[:-3].strip())

    if upper.endswith(" BC"):
        return -int(upper[:-3].strip())

    raise ValueError(f"Unexpected Pleiades year value: {value!r}")


class StructureProfiler:
    def __init__(self, name: str) -> None:
        self.name = name
        self.path_types: dict[str, Counter[str]] = defaultdict(Counter)
        self.path_presence: Counter[str] = Counter()
        self.array_lengths: dict[str, Counter[int]] = defaultdict(Counter)
        self.categorical: dict[str, Counter[str]] = defaultdict(Counter)
        self.records = 0

    def observe(self, value: object, path: str = "root") -> None:
        type_name = "null" if value is None else type(value).__name__
        self.path_types[path][type_name] += 1
        self.path_presence[path] += 1
        if isinstance(value, dict):
            for key, child in value.items():
                child_path = f"{path}.{key}"
                self.observe(child, child_path)
        elif isinstance(value, list):
            self.array_lengths[path][len(value)] += 1
            for child in value:
                self.observe(child, f"{path}[]")

    def count_category(self, path: str, value: object) -> None:
        if value is None or value == "":
            self.categorical[path]["<missing>"] += 1
        elif isinstance(value, list):
            if not value:
                self.categorical[path]["<empty-list>"] += 1
            for item in value:
                self.categorical[path][str(item)] += 1
        else:
            self.categorical[path][str(value)] += 1

    def write(self, path: Path) -> None:
        lines = [f"PLEIADES JSON STRUCTURE PROFILE: {self.name}", "=" * 72, ""]
        lines.append("PATHS / OBSERVED JSON TYPES")
        for field_path in sorted(self.path_types):
            types = ", ".join(f"{k}={v}" for k, v in sorted(self.path_types[field_path].items()))
            lengths = self.array_lengths.get(field_path)
            extra = ""
            if lengths:
                extra = f" | array lengths min={min(lengths)} max={max(lengths)}"
            lines.append(f"{field_path}: {types}{extra}")
        if self.categorical:
            lines.extend(["", "CATEGORICAL VALUES"])
            for field_path in sorted(self.categorical):
                lines.append(f"[{field_path}]")
                for value, count in self.categorical[field_path].most_common():
                    lines.append(f"  {value!r}: {count}")
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def profile_payload(payload: object, name: str) -> StructureProfiler:
    profiler = StructureProfiler(name)
    profiler.observe(payload)
    graph = payload.get("@graph", []) if isinstance(payload, dict) else []
    if isinstance(graph, list):
        profiler.records = len(graph)
        for place in graph:
            if not isinstance(place, dict):
                continue
            profiler.count_category("place.@type", place.get("@type"))
            profiler.count_category("place.review_state", place.get("review_state"))
            locations = place.get("locations", [])
            if isinstance(locations, list):
                for location in locations:
                    if not isinstance(location, dict):
                        continue
                    profiler.count_category("location.geometry.type",
                                            (location.get("geometry") or {}).get("type") if isinstance(
                                                location.get("geometry"), dict) else None)
                    profiler.count_category("location.featureType", location.get("featureType"))
                    profiler.count_category("location.locationType", location.get("locationType"))
                    profiler.count_category("location.associationCertainty", location.get("associationCertainty"))
                    profiler.count_category("location.archaeologicalRemains", location.get("archaeologicalRemains"))
                    for att in location.get("attestations", []) if isinstance(location.get("attestations"),
                                                                              list) else []:
                        if isinstance(att, dict):
                            profiler.count_category("attestation.timePeriod", att.get("timePeriod"))
                            profiler.count_category("attestation.confidence", att.get("confidence"))
            names = place.get("names", [])
            if isinstance(names, list):
                for name_record in names:
                    if not isinstance(name_record, dict):
                        continue
                    profiler.count_category("name.nameType", name_record.get("nameType"))
                    profiler.count_category("name.language", name_record.get("language"))
                    profiler.count_category("name.associationCertainty", name_record.get("associationCertainty"))
            features = place.get("features", [])
            if isinstance(features, list):
                for feature in features:
                    if isinstance(feature, dict):
                        props = feature.get("properties", {})
                        profiler.count_category("feature.location_precision",
                                                props.get("location_precision") if isinstance(props, dict) else None)
    return profiler


def polygon_profile(geometry: object, stats: ImportStats, context: str) -> None:
    if not isinstance(geometry, dict):
        return
    geometry_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if geometry_type == "Polygon" and isinstance(coords, list):
        rings = [ring for ring in coords if isinstance(ring, list)]
        if not rings:
            return
        exterior = rings[0]
        vertex_count = len(exterior)
        stats.polygon_exterior_vertices_min = (
            vertex_count
            if stats.polygon_exterior_vertices_min is None
            else min(stats.polygon_exterior_vertices_min, vertex_count)
        )
        stats.polygon_exterior_vertices_max = max(stats.polygon_exterior_vertices_max, vertex_count)
        if len(rings) > 1:
            stats.polygons_with_interior_rings += 1
        comparable = [tuple(point) for point in exterior if isinstance(point, list)]
        expected_unique = max(0, len(comparable) - 1) if comparable and comparable[0] == comparable[-1] else len(
            comparable)
        if len(set(comparable)) < expected_unique:
            stats.polygons_with_repeated_vertices += 1
        stats.note(
            "polygon_shape",
            f"{context}: exterior_vertices={vertex_count}, interior_rings={max(0, len(rings) - 1)}",
        )
    elif geometry_type == "MultiPolygon" and isinstance(coords, list):
        stats.multipolygon_parts_max = max(stats.multipolygon_parts_max, len(coords))
        stats.note("polygon_shape", f"{context}: multipolygon_parts={len(coords)}")


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE places (
            id INTEGER PRIMARY KEY,
            title TEXT,
            repr_lat REAL,
            repr_lng REAL
        );

        CREATE TABLE place_types (
            key TEXT PRIMARY KEY,
            term TEXT,
            in_vocabulary INTEGER NOT NULL CHECK (in_vocabulary IN (0, 1))
        );

        CREATE TABLE places_place_types (
            place_id INTEGER NOT NULL,
            place_type TEXT NOT NULL,
            PRIMARY KEY (place_id, place_type),
            FOREIGN KEY (place_id) REFERENCES places(id)
        );

        CREATE TABLE locations (
            location_pk INTEGER PRIMARY KEY,
            place_id INTEGER NOT NULL,
            location_id TEXT NOT NULL,
            title TEXT,
            start INTEGER,
            end INTEGER,
            geometry_type TEXT,
            geometry TEXT,
            location_precision TEXT,
            accuracy_meters REAL,
            accuracy_basis TEXT,
            association_certainty TEXT,
            archaeological_remains TEXT,
            UNIQUE (place_id, location_id),
            FOREIGN KEY (place_id) REFERENCES places(id)
        );

        CREATE TABLE locations_place_types (
            location_pk INTEGER NOT NULL,
            place_type TEXT NOT NULL,
            PRIMARY KEY (location_pk, place_type),
            FOREIGN KEY (location_pk) REFERENCES locations(location_pk)
        );

        CREATE TABLE location_categories (
            key TEXT PRIMARY KEY
        );

        CREATE TABLE locations_location_categories (
            location_pk INTEGER NOT NULL,
            location_category TEXT NOT NULL,
            PRIMARY KEY (location_pk, location_category),
            FOREIGN KEY (location_pk) REFERENCES locations(location_pk),
            FOREIGN KEY (location_category) REFERENCES location_categories(key)
        );

        CREATE TABLE time_periods (
            key TEXT PRIMARY KEY,
            term TEXT NOT NULL,
            lower_bound INTEGER,
            upper_bound INTEGER
        );

        CREATE TABLE locations_time_periods (
            location_pk INTEGER NOT NULL,
            time_period TEXT NOT NULL,
            confidence TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (location_pk, time_period, confidence),
            FOREIGN KEY (location_pk) REFERENCES locations(location_pk)
        );

        CREATE TABLE names (
            name_pk INTEGER PRIMARY KEY,
            place_id INTEGER NOT NULL,
            name_id TEXT NOT NULL,
            attested TEXT,
            romanized TEXT,
            language TEXT,
            name_type TEXT,
            start INTEGER,
            end INTEGER,
            association_certainty TEXT,
            FOREIGN KEY (place_id) REFERENCES places(id)
        );

        CREATE TABLE names_time_periods (
            name_pk INTEGER NOT NULL,
            time_period TEXT NOT NULL,
            confidence TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (name_pk, time_period, confidence),
            FOREIGN KEY (name_pk) REFERENCES names(name_pk)
        );

        CREATE INDEX idx_locations_place_id ON locations(place_id);
        CREATE INDEX idx_locations_dates ON locations(start, end);
        CREATE INDEX idx_locations_time_period ON locations_time_periods(time_period);
        CREATE INDEX idx_locations_place_type ON locations_place_types(place_type);
        CREATE INDEX idx_locations_location_category ON locations_location_categories(location_category);
        CREATE INDEX idx_names_place_id ON names(place_id);
        CREATE INDEX idx_names_dates ON names(start, end);
        CREATE INDEX idx_names_time_period ON names_time_periods(time_period);
        """
    )


def import_vocabularies(connection: sqlite3.Connection, zf: zipfile.ZipFile) -> dict[str, dict[str, str]]:
    time_periods = read_vocabs(zf, "time_periods.csv",
                               {"lower_bound": parse_pleiades_year, "upper_bound": parse_pleiades_year})
    for key, data in time_periods.items():
        lower = data["lower_bound"]
        upper = data["upper_bound"]
        if lower is not None and upper is not None and lower > upper:
            data["lower_bound"], data["upper_bound"] = upper, lower
            print(
                f"WARNING: Time period {key!r} has reversed bounds; "
                f"normalized {lower}..{upper} to {upper}..{lower}",
                flush=True,
            )

    place_types = read_vocabs(zf, "place_types.csv")
    association_certainty = read_vocabs(zf, "association_certainty.csv")
    archaeological_remains = read_vocabs(zf, "archaeological_remains.csv")

    if not place_types:
        raise RuntimeError("place_types.csv is required")

    connection.executemany(
        "INSERT INTO place_types (key, term, in_vocabulary) VALUES (?, ?, 1)",
        sorted(place_types.items()),
    )
    connection.executemany(
        "INSERT INTO time_periods (key, term, lower_bound, upper_bound) VALUES (?, ?, ?, ?)",
        ((key, data["term"], data["lower_bound"], data["upper_bound"]) for key, data in time_periods.items()),
    )
    connection.executemany(
        "INSERT INTO location_categories (key) VALUES (?)",
        [(key,) for key in sorted(LOCATION_TYPE_KEYS)],
    )
    return {
        "place_types": place_types,
        "time_periods": time_periods,
        "association_certainty": association_certainty,
        "archaeological_remains": archaeological_remains,
    }


def import_json(
        connection: sqlite3.Connection,
        payload: dict,
        vocabularies: dict[str, dict[str, str]],
        stats: ImportStats,
) -> None:
    graph = payload.get("@graph")
    if not isinstance(graph, list):
        raise RuntimeError("Pleiades JSON does not contain an @graph array")

    valid_place_types = set(vocabularies["place_types"])
    valid_time_periods = set(vocabularies["time_periods"])
    valid_association = set(vocabularies["association_certainty"])
    valid_remains = set(vocabularies["archaeological_remains"])

    for place in graph:
        if not isinstance(place, dict):
            continue
        stats.places_read += 1
        raw_id = str(place.get("id") or "").strip()
        uri = str(place.get("uri") or "").strip()
        match = PLACE_URI_RE.match(uri)
        if not raw_id.isdigit() or not (3 <= len(raw_id) <= 20):
            stats.invalid_place_ids += 1
            stats.note("invalid_place_id", f"id={raw_id!r}, uri={uri!r}")
            continue
        place_id = int(raw_id)
        if match is None or int(match.group(1)) != place_id:
            stats.place_uri_mismatches += 1
            stats.note("place_uri", f"place {place_id}: {uri!r}")

        repr_point = place.get("reprPoint")
        repr_lng = repr_lat = None
        if isinstance(repr_point, list) and len(repr_point) >= 2:
            try:
                repr_lng = float(repr_point[0])
                repr_lat = float(repr_point[1])
            except (TypeError, ValueError):
                repr_lng = repr_lat = None
        if repr_lat is None or repr_lng is None:
            stats.unmappable += 1
        else:
            stats.mappable += 1

        connection.execute(
            "INSERT INTO places (id, title, repr_lat, repr_lng) VALUES (?, ?, ?, ?)",
            (place_id, (place.get("title") or "").strip() or None, repr_lat, repr_lng),
        )
        stats.places_imported += 1

        place_type_keys = validate_parallel_keys_and_uris(
            place.get("placeTypes"), place.get("placeTypeURIs"), PLACE_TYPE_URI_PREFIX,
            stats, "place_type_uri", f"place {place_id}",
        )
        place_title = (place.get("title") or "").strip() or None
        place_type_uris = place.get("placeTypeURIs") if isinstance(place.get("placeTypeURIs"), list) else []
        for index, key in enumerate(place_type_keys):
            if key not in valid_place_types:
                stats.unknown_place_type_keys.add(key)
                observed_uri = str(place_type_uris[index]).strip() if index < len(place_type_uris) else None
                stats.unlisted_place_type_records.setdefault(key, []).append(
                    (place_id, place_title, observed_uri or None)
                )
                stats.note("unlisted_place_category", f"place {place_id}: {key}")
                connection.execute(
                    "INSERT OR IGNORE INTO place_types (key, term, in_vocabulary) VALUES (?, NULL, 0)",
                    (key,),
                )
            connection.execute(
                "INSERT OR IGNORE INTO places_place_types (place_id, place_type) VALUES (?, ?)",
                (place_id, key),
            )
            stats.place_type_mappings += 1

        for field_name in ("attestations", "timePeriod", "timePeriodURI", "start", "end"):
            if field_name in place and place.get(field_name) not in (None, [], ""):
                stats.unexpected_place_temporal_fields += 1
                stats.note("place_temporal", f"place {place_id}: unexpected {field_name}")

        features = place.get("features") if isinstance(place.get("features"), list) else []
        features_by_id = {
            str(feature.get("id")): feature
            for feature in features
            if isinstance(feature, dict) and feature.get("id")
        }
        locations = place.get("locations") if isinstance(place.get("locations"), list) else []
        stats.places_by_location_count[len(locations)] += 1
        location_ids: set[str] = set()

        for location in locations:
            if not isinstance(location, dict):
                continue
            stats.locations_read += 1
            location_id = str(location.get("id") or "").strip()
            if not location_id:
                stats.note("location_id", f"place {place_id}: missing location id")
                continue
            location_ids.add(location_id)
            location_uri = str(location.get("uri") or "").strip()
            location_match = LOCATION_URI_RE.match(location_uri)
            if (
                    location_match is None
                    or int(location_match.group(1)) != place_id
                    or unquote(location_match.group(2)) != location_id
            ):
                stats.location_uri_mismatches += 1
                stats.note("location_uri", f"place {place_id}, location {location_id}: {location_uri!r}")

            feature = features_by_id.get(location_id)
            if feature is None:
                stats.location_feature_unmatched += 1
            feature_properties = feature.get("properties", {}) if isinstance(feature, dict) else {}
            precision = feature_properties.get("location_precision") if isinstance(feature_properties, dict) else None
            if precision not in (None, "", "rough", "precise", "unlocated"):
                stats.note("location_precision", f"place {place_id}, location {location_id}: {precision!r}")

            start = location.get("start")
            end = location.get("end")
            start = int(start) if isinstance(start, (int, float)) else None
            end = int(end) if isinstance(end, (int, float)) else None
            if start is not None or end is not None:
                stats.locations_with_dates += 1
                if start is None or end is None:
                    stats.locations_partial_dates += 1
            else:
                stats.locations_without_dates += 1
            if start is not None and end is not None and start > end:
                stats.start_after_end += 1
                stats.note("date_order", f"place {place_id}, location {location_id}: {start} > {end}")

            geometry_type, geometry_json = compact_geometry(location.get("geometry"))
            stats.geometry_types[geometry_type or "NULL"] += 1
            polygon_profile(location.get("geometry"), stats, f"place {place_id}, location {location_id}")

            association = str(location.get("associationCertainty") or "").strip() or None
            association_uri = location.get("associationCertaintyURI")
            if association:
                if valid_association and association not in valid_association:
                    stats.unknown_association_certainty_keys.add(association)
                if uri_key(association_uri, ASSOCIATION_CERTAINTY_URI_PREFIX) != association:
                    stats.association_uri_discrepancies += 1
                    stats.note("association_uri",
                               f"place {place_id}, location {location_id}: {association!r}, {association_uri!r}")

            remains = str(location.get("archaeologicalRemains") or "").strip() or None
            if remains and valid_remains and remains not in valid_remains:
                stats.unknown_archaeological_remains_keys.add(remains)

            accuracy_value = location.get("accuracy_value")
            try:
                accuracy_meters = float(accuracy_value) if accuracy_value not in (None, "") else None
            except (TypeError, ValueError):
                accuracy_meters = None
                stats.note("accuracy_meters", f"place {place_id}, location {location_id}: {accuracy_value!r}")

            cursor = connection.execute(
                """
                INSERT INTO locations (
                    place_id, location_id, title, start, end, geometry_type, geometry,
                    location_precision, accuracy_meters, accuracy_basis,
                    association_certainty, archaeological_remains
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    place_id, location_id, (location.get("title") or "").strip() or None,
                    start, end, geometry_type, geometry_json, precision or None,
                    accuracy_meters,
                    extract_accuracy_basis(location.get("accuracy"), stats,
                                           f"place {place_id}, location {location_id}"),
                    association, remains,
                ),
            )
            location_pk = int(cursor.lastrowid)
            stats.locations_imported += 1

            location_type_keys = validate_parallel_keys_and_uris(
                location.get("featureType"), location.get("featureTypeURI"), PLACE_TYPE_URI_PREFIX,
                stats, "location_place_type_uri", f"place {place_id}, location {location_id}",
            )
            for key in location_type_keys:
                if key not in valid_place_types:
                    stats.unknown_location_type_keys.add(key)
                    stats.note("unknown_location_type", f"place {place_id}, location {location_id}: {key}")
                    connection.execute(
                        "INSERT OR IGNORE INTO place_types (key, term, in_vocabulary) VALUES (?, NULL, 0)",
                        (key,),
                    )
                connection.execute(
                    "INSERT OR IGNORE INTO locations_place_types (location_pk, place_type) VALUES (?, ?)",
                    (location_pk, key),
                )
                stats.location_type_mappings += 1

            category_keys = location.get("locationType") if isinstance(location.get("locationType"), list) else []
            for key_value in category_keys:
                key = str(key_value).strip()
                if not key:
                    continue
                if key == "associated modern":
                    key = "associated_modern"
                    stats.legacy_location_category_aliases_normalized += 1
                if key not in LOCATION_TYPE_KEYS:
                    stats.unknown_location_category_keys.add(key)
                    stats.note("unknown_location_category", f"place {place_id}, location {location_id}: {key!r}")
                    continue
                connection.execute(
                    "INSERT OR IGNORE INTO locations_location_categories (location_pk, location_category) VALUES (?, ?)",
                    (location_pk, key),
                )
                stats.location_category_mappings += 1

            feature_type_uris = location.get("featureTypeURI") if isinstance(location.get("featureTypeURI"),
                                                                             list) else []
            legacy_location_type_uris = location.get("locationTypeURI") if isinstance(location.get("locationTypeURI"),
                                                                                      list) else []
            if feature_type_uris and legacy_location_type_uris:
                if feature_type_uris == legacy_location_type_uris:
                    stats.feature_type_uri_location_type_uri_equal += 1
                else:
                    stats.feature_type_uri_location_type_uri_different += 1
                    stats.note("duplicate_type_uri",
                               f"place {place_id}, location {location_id}: featureTypeURI={feature_type_uris!r}, locationTypeURI={legacy_location_type_uris!r}")
            elif feature_type_uris:
                stats.feature_type_uri_only += 1
            elif legacy_location_type_uris:
                stats.location_type_uri_only += 1
            else:
                stats.neither_type_uri += 1

            attestations = location.get("attestations") if isinstance(location.get("attestations"), list) else []
            if attestations:
                stats.locations_with_named_periods += 1
            has_dates = start is not None or end is not None
            has_periods = bool(attestations)
            if has_dates and has_periods:
                stats.dates_and_periods += 1
            elif has_dates:
                stats.dates_without_periods += 1
            elif has_periods:
                stats.periods_without_dates += 1
            else:
                stats.neither_dates_nor_periods += 1
            for attestation in attestations:
                if not isinstance(attestation, dict):
                    continue
                stats.attestations_read += 1
                period = str(attestation.get("timePeriod") or "").strip()
                period_uri = attestation.get("timePeriodURI")
                confidence = str(attestation.get("confidence") or "").strip()
                confidence_uri = attestation.get("confidenceURI")
                if not period:
                    stats.note("time_period", f"place {place_id}, location {location_id}: empty timePeriod")
                    continue
                if valid_time_periods and period not in valid_time_periods:
                    stats.unknown_time_period_keys.add(period)
                    stats.note("unknown_time_period", f"place {place_id}, location {location_id}: {period}")
                if uri_key(period_uri, TIME_PERIOD_URI_PREFIX) != period:
                    stats.time_period_uri_discrepancies += 1
                    stats.note("time_period_uri",
                               f"place {place_id}, location {location_id}: {period!r}, {period_uri!r}")
                if confidence:
                    if confidence not in ATTESTATION_CONFIDENCE_KEYS:
                        stats.unknown_attestation_confidence_keys.add(confidence)
                    if uri_key(confidence_uri, ATTESTATION_CONFIDENCE_URI_PREFIX) != confidence:
                        stats.confidence_uri_discrepancies += 1
                        stats.note("confidence_uri",
                                   f"place {place_id}, location {location_id}: {confidence!r}, {confidence_uri!r}")
                connection.execute(
                    "INSERT OR IGNORE INTO locations_time_periods (location_pk, time_period, confidence) VALUES (?, ?, ?)",
                    (location_pk, period, confidence),
                )
                stats.time_period_mappings += 1

        for feature_id in set(features_by_id) - location_ids:
            stats.feature_location_unmatched += 1
            stats.note("feature_without_location", f"place {place_id}: feature {feature_id}")

        names = place.get("names") if isinstance(place.get("names"), list) else []
        stats.places_by_name_count[len(names)] += 1

        for name in names:
            if not isinstance(name, dict):
                continue
            stats.names_read += 1
            name_id = str(name.get("id") or "").strip()
            if not name_id:
                stats.note("name_id", f"place {place_id}: missing name id")
                continue

            name_uri = str(name.get("uri") or "").strip()
            name_match = NAME_URI_RE.match(name_uri)
            if (
                    name_match is None
                    or int(name_match.group(1)) != place_id
                    or unquote(name_match.group(2)) != name_id
            ):
                stats.name_uri_mismatches += 1
                stats.note("name_uri", f"place {place_id}, name {name_id}: {name_uri!r}")

            attested = str(name.get("attested") or "").strip() or None
            romanized = str(name.get("romanized") or "").strip() or None
            language = str(name.get("language") or "").strip() or None
            name_type = str(name.get("nameType") or "").strip() or None
            if attested:
                stats.names_attested_present += 1
            if romanized:
                stats.names_romanized_present += 1
            if language:
                stats.names_language_present += 1
            stats.name_types[name_type or "<missing>"] += 1

            start = name.get("start")
            end = name.get("end")
            start = int(start) if isinstance(start, (int, float)) else None
            end = int(end) if isinstance(end, (int, float)) else None
            if start is not None or end is not None:
                stats.names_with_dates += 1
                if start is None or end is None:
                    stats.names_partial_dates += 1
            else:
                stats.names_without_dates += 1
            if start is not None and end is not None and start > end:
                stats.name_start_after_end += 1
                stats.note("name_date_order", f"place {place_id}, name {name_id}: {start} > {end}")

            association = str(name.get("associationCertainty") or "").strip() or None
            association_uri = name.get("associationCertaintyURI")
            if association:
                if valid_association and association not in valid_association:
                    stats.unknown_association_certainty_keys.add(association)
                if uri_key(association_uri, ASSOCIATION_CERTAINTY_URI_PREFIX) != association:
                    stats.name_association_uri_discrepancies += 1
                    stats.note("name_association_uri",
                               f"place {place_id}, name {name_id}: {association!r}, {association_uri!r}")

            existing_name_count = connection.execute(
                """
                SELECT COUNT(*)
                FROM names
                WHERE place_id = ?
                  AND name_id = ?
                """,
                (place_id, name_id),
            ).fetchone()[0]

            if existing_name_count:
                stats.duplicate_name_ids += 1
                stats.note(
                    "duplicate_name_id",
                    f"place {place_id}, name_id={name_id!r}, "
                    f"romanized={romanized!r}, attested={attested!r}",
                )
            cursor = connection.execute(
                """
                INSERT INTO names (
                    place_id, name_id, attested, romanized, language, name_type,
                    start, end, association_certainty
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (place_id, name_id, attested, romanized, language, name_type,
                 start, end, association),
            )
            name_pk = int(cursor.lastrowid)
            stats.names_imported += 1

            attestations = name.get("attestations") if isinstance(name.get("attestations"), list) else []
            if attestations:
                stats.names_with_named_periods += 1
            stats.max_periods_per_name = max(stats.max_periods_per_name, len(attestations))

            has_dates = start is not None or end is not None
            has_periods = bool(attestations)
            if has_dates and has_periods:
                stats.name_dates_and_periods += 1
            elif has_dates:
                stats.name_dates_without_periods += 1
            elif has_periods:
                stats.name_periods_without_dates += 1
            else:
                stats.name_neither_dates_nor_periods += 1

            if len(attestations) > 1:
                periods = [
                    str(att.get("timePeriod") or "").strip()
                    for att in attestations
                    if isinstance(att, dict) and str(att.get("timePeriod") or "").strip()
                ]
                stats.note(
                    "multi_attested_name",
                    f"place {place_id}, name {name_id}: attested={attested!r}, "
                    f"romanized={romanized!r}, language={language!r}, nameType={name_type!r}, "
                    f"start={start}, end={end}, periods={periods!r}",
                )

            for attestation in attestations:
                if not isinstance(attestation, dict):
                    continue
                stats.name_attestations_read += 1
                period = str(attestation.get("timePeriod") or "").strip()
                period_uri = attestation.get("timePeriodURI")
                confidence = str(attestation.get("confidence") or "").strip()
                confidence_uri = attestation.get("confidenceURI")
                if not period:
                    stats.note("name_time_period", f"place {place_id}, name {name_id}: empty timePeriod")
                    continue
                if valid_time_periods and period not in valid_time_periods:
                    stats.unknown_time_period_keys.add(period)
                    stats.note("unknown_name_time_period", f"place {place_id}, name {name_id}: {period}")
                if uri_key(period_uri, TIME_PERIOD_URI_PREFIX) != period:
                    stats.name_time_period_uri_discrepancies += 1
                    stats.note("name_time_period_uri",
                               f"place {place_id}, name {name_id}: {period!r}, {period_uri!r}")
                if confidence:
                    if confidence not in ATTESTATION_CONFIDENCE_KEYS:
                        stats.unknown_attestation_confidence_keys.add(confidence)
                    if uri_key(confidence_uri, ATTESTATION_CONFIDENCE_URI_PREFIX) != confidence:
                        stats.name_confidence_uri_discrepancies += 1
                        stats.note("name_confidence_uri",
                                   f"place {place_id}, name {name_id}: {confidence!r}, {confidence_uri!r}")
                connection.execute(
                    "INSERT OR IGNORE INTO names_time_periods (name_pk, time_period, confidence) VALUES (?, ?, ?)",
                    (name_pk, period, confidence),
                )
                stats.name_time_period_mappings += 1


def load_json_payload(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as stream:
        payload = json.load(stream)
    if not isinstance(payload, dict) or not isinstance(payload.get("@graph"), list):
        raise RuntimeError(f"JSON does not contain an @graph array: {path}")
    return payload


def validate_database(connection: sqlite3.Connection, stats: ImportStats, minimum_places: int = 40000) -> None:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise RuntimeError(f"SQLite integrity check failed: {integrity}")
    place_count = connection.execute("SELECT COUNT(*) FROM places").fetchone()[0]
    if place_count != stats.places_imported:
        raise RuntimeError(f"Place count mismatch: imported {stats.places_imported}, database contains {place_count}")
    if place_count < minimum_places:
        raise RuntimeError(f"Pleiades dataset unexpectedly small: {place_count} places")
    foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_errors:
        raise RuntimeError(f"Foreign-key validation failed: {foreign_key_errors[:10]}")


def build_database(
        zip_buffer: io.BytesIO,
        places_payload: dict,
        destination: Path,
        minimum_places: int = 40000,
) -> ImportStats:
    stats = ImportStats()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)
    connection = sqlite3.connect(destination)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        create_schema(connection)
        with zipfile.ZipFile(zip_buffer) as zf:
            vocabularies = import_vocabularies(connection, zf)
        import_json(connection, places_payload, vocabularies, stats)
        connection.commit()
        validate_database(connection, stats, minimum_places=minimum_places)
    except Exception:
        connection.close()
        destination.unlink(missing_ok=True)
        raise
    else:
        print("Optimizing SQLite database...", flush=True)
        connection.execute("VACUUM")
        connection.close()
    return stats


def print_set(label: str, values: set[str]) -> None:
    print(f"{label:<35}{len(values)}")
    for value in sorted(values):
        print(f"  - {value}")


def print_report(destination: Path, stats: ImportStats) -> None:
    print("\n" + "=" * 64)
    print("PLEIADES INGESTION REPORT")
    print("=" * 64)
    print(f"Database:                           {destination}")
    print(f"Places read:                        {stats.places_read}")
    print(f"Places imported:                    {stats.places_imported}")
    print(f"Mappable places:                    {stats.mappable}")
    print(f"Unmappable places:                  {stats.unmappable}")
    print(f"Invalid place IDs:                  {stats.invalid_place_ids}")
    print(f"Place URI mismatches:               {stats.place_uri_mismatches}")
    print(f"Place/type mappings:                {stats.place_type_mappings}")
    print()
    print(f"Locations read:                     {stats.locations_read}")
    print(f"Locations imported:                 {stats.locations_imported}")
    print(f"Location URI mismatches:            {stats.location_uri_mismatches}")
    print(f"Locations with dates:               {stats.locations_with_dates}")
    print(f"Locations without dates:            {stats.locations_without_dates}")
    print(f"Locations with partial dates:       {stats.locations_partial_dates}")
    print(f"Locations with named periods:       {stats.locations_with_named_periods}")
    print(f"Location/type mappings:             {stats.location_type_mappings}")
    print(f"Attestations read:                  {stats.attestations_read}")
    print(f"Time-period mappings:               {stats.time_period_mappings}")
    print(f"Locations without matching feature: {stats.location_feature_unmatched}")
    print(f"Features without matching location: {stats.feature_location_unmatched}")
    print(f"Start > end:                        {stats.start_after_end}")
    print()
    print("Geometry types:")
    for key, count in sorted(stats.geometry_types.items()):
        print(f"  {key:<30}{count}")
    print()
    print("Polygon geometry profile:")
    print(f"  Exterior vertices min:             {stats.polygon_exterior_vertices_min}")
    print(f"  Exterior vertices max:             {stats.polygon_exterior_vertices_max}")
    print(f"  Polygons with interior rings:      {stats.polygons_with_interior_rings}")
    print(f"  Polygons with repeated vertices:   {stats.polygons_with_repeated_vertices}")
    print(f"  Max MultiPolygon component count:  {stats.multipolygon_parts_max}")
    print()
    print("Places by location count:")
    for key, count in sorted(stats.places_by_location_count.items()):
        label = "5+" if key >= 5 else str(key)
        if key < 5:
            print(f"  {label:<30}{count}")
    five_plus = sum(count for key, count in stats.places_by_location_count.items() if key >= 5)
    print(f"  {'5+':<30}{five_plus}")
    print()
    print_set("Place category keys absent from place_types.csv:", stats.unknown_place_type_keys)
    print_set("Unknown Location type keys:", stats.unknown_location_type_keys)
    print_set("Unknown time-period keys:", stats.unknown_time_period_keys)
    print_set("Unknown attestation confidence:", stats.unknown_attestation_confidence_keys)
    print_set("Unknown location categories:", stats.unknown_location_category_keys)
    print_set("Unknown association certainty:", stats.unknown_association_certainty_keys)
    print_set("Unknown archaeological remains:", stats.unknown_archaeological_remains_keys)
    print()
    print(f"Place/location type URI discrepancies: {stats.type_uri_discrepancies}")
    print(f"Time-period URI discrepancies:          {stats.time_period_uri_discrepancies}")
    print(f"Confidence URI discrepancies:           {stats.confidence_uri_discrepancies}")
    print(f"Association URI discrepancies:          {stats.association_uri_discrepancies}")
    print(f"Unexpected Place temporal fields:       {stats.unexpected_place_temporal_fields}")
    print()
    print(f"Location-category mappings:             {stats.location_category_mappings}")
    print(f"Legacy location-category aliases normalized: {stats.legacy_location_category_aliases_normalized}")
    print("featureTypeURI / locationTypeURI relationship:")
    print(f"  both present + identical:             {stats.feature_type_uri_location_type_uri_equal}")
    print(f"  both present + different:             {stats.feature_type_uri_location_type_uri_different}")
    print(f"  featureTypeURI only:                  {stats.feature_type_uri_only}")
    print(f"  locationTypeURI only:                 {stats.location_type_uri_only}")
    print(f"  neither:                              {stats.neither_type_uri}")
    print()
    print("Date / named-period cross-tab:")
    print(f"  dates + periods:                      {stats.dates_and_periods}")
    print(f"  dates + no periods:                   {stats.dates_without_periods}")
    print(f"  no dates + periods:                   {stats.periods_without_dates}")
    print(f"  no dates + no periods:                {stats.neither_dates_nor_periods}")
    print()
    print(f"Names read:                            {stats.names_read}")
    print(f"Names imported:                        {stats.names_imported}")
    print(f"Duplicate Name IDs within Places:      {stats.duplicate_name_ids}")
    print(f"Name URI mismatches:                   {stats.name_uri_mismatches}")
    print(f"Names with dates:                      {stats.names_with_dates}")
    print(f"Names without dates:                   {stats.names_without_dates}")
    print(f"Names with partial dates:              {stats.names_partial_dates}")
    print(f"Names with named periods:              {stats.names_with_named_periods}")
    print(f"Name attestations read:                {stats.name_attestations_read}")
    print(f"Name/time-period mappings:             {stats.name_time_period_mappings}")
    print(f"Name start > end:                      {stats.name_start_after_end}")
    print(f"Names with attested text:              {stats.names_attested_present}")
    print(f"Names with romanized text:             {stats.names_romanized_present}")
    print(f"Names with language:                   {stats.names_language_present}")
    print(f"Max periods per Name:                  {stats.max_periods_per_name}")
    print(f"Name association URI discrepancies:    {stats.name_association_uri_discrepancies}")
    print(f"Name time-period URI discrepancies:    {stats.name_time_period_uri_discrepancies}")
    print(f"Name confidence URI discrepancies:     {stats.name_confidence_uri_discrepancies}")
    print()
    print("Name date / named-period cross-tab:")
    print(f"  dates + periods:                      {stats.name_dates_and_periods}")
    print(f"  dates + no periods:                   {stats.name_dates_without_periods}")
    print(f"  no dates + periods:                   {stats.name_periods_without_dates}")
    print(f"  no dates + no periods:                {stats.name_neither_dates_nor_periods}")
    print()
    print("Name types:")
    for key, count in stats.name_types.most_common():
        print(f"  {key:<30}{count}")

    if stats.diagnostics:
        print("\nDIAGNOSTIC EXAMPLES (capped per category)")
        for category, examples in sorted(stats.diagnostics.items()):
            print(f"\n[{category}]")
            for example in examples:
                print(f"  - {example}")
    print("=" * 64 + "\n")


def write_unlisted_place_types_report(path: Path, stats: ImportStats) -> None:
    lines = [
        "PLEIADES PLACE CATEGORIES ABSENT FROM place_types.csv",
        "=" * 72,
        "",
        "These category keys occur on current Pleiades Place records but are not",
        "defined by the packaged place_types.csv vocabulary. They are retained in",
        "SQLite with in_vocabulary=0 and term=NULL.",
        "",
    ]
    if not stats.unlisted_place_type_records:
        lines.append("None observed.")
    for key in sorted(stats.unlisted_place_type_records):
        records = stats.unlisted_place_type_records[key]
        unique_places = {place_id for place_id, _, _ in records}
        uris = sorted({uri for _, _, uri in records if uri})
        lines.extend([
            key,
            "-" * len(key),
            f"Mappings: {len(records)}",
            f"Distinct places: {len(unique_places)}",
            "Observed URI evidence:",
        ])
        if uris:
            lines.extend(f"  {uri}" for uri in uris)
        else:
            lines.append("  <none>")
        lines.append("Places:")
        for place_id, title, uri in sorted(records, key=lambda item: (item[0], item[1] or "")):
            title_text = title or "<untitled>"
            uri_text = f" | {uri}" if uri else ""
            lines.append(f"  {place_id} | {title_text}{uri_text}")
        lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    base_dir = script_dir.parent if script_dir.name == "maintenance" else script_dir
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=base_dir / "data" / "pleiades.sqlite")
    parser.add_argument("--archive-dir", type=Path, default=base_dir / "data" / "archive")
    parser.add_argument("--fresh", action="store_true",
                        help="Force fresh downloads of the Pleiades GIS and Places sources")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        zip_buffer = get_zip_buffer(args.archive_dir, force_download=args.fresh)
        json_path = get_json_path(args.archive_dir, force_download=args.fresh)
        print(f"Loading Pleiades JSON: {json_path}", flush=True)
        places_payload = load_json_payload(json_path)

        places_profiler = profile_payload(places_payload, "places")
        places_profile_path = args.archive_dir / "pleiades-places-structure.txt"
        places_profiler.write(places_profile_path)
        print(f"Wrote JSON structure profile: {places_profile_path}", flush=True)

        stats = build_database(zip_buffer, places_payload, args.output)
        unlisted_report_path = args.archive_dir / "pleiades-unlisted-place-types.txt"
        write_unlisted_place_types_report(unlisted_report_path, stats)
        print(f"Wrote unlisted Place-category report: {unlisted_report_path}", flush=True)
    except Exception as exc:
        print(f"FATAL SYSTEM ERROR: {exc}", file=sys.stderr)
        return 1
    print_report(args.output, stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
