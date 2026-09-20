import json
import sqlite3
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from export_pleiades import export_dataset, shard_for_id


def build_database(path: Path, *, bad_confidence: bool = False) -> None:
    db = sqlite3.connect(path)
    db.executescript(
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
            in_vocabulary INTEGER NOT NULL
        );
        CREATE TABLE places_place_types (
            place_id INTEGER NOT NULL,
            place_type TEXT NOT NULL
        );
        CREATE TABLE locations (
            location_pk INTEGER PRIMARY KEY,
            place_id INTEGER NOT NULL,
            location_id TEXT NOT NULL,
            title TEXT,
            start INTEGER,
            end INTEGER
        );
        CREATE TABLE locations_place_types (
            location_pk INTEGER NOT NULL,
            place_type TEXT NOT NULL
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
            confidence TEXT NOT NULL DEFAULT ''
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
            association_certainty TEXT
        );
        CREATE TABLE names_time_periods (
            name_pk INTEGER NOT NULL,
            time_period TEXT NOT NULL,
            confidence TEXT NOT NULL DEFAULT ''
        );

        INSERT INTO places VALUES
            (579885, 'Athens', 37.97, 23.72),
            (123456, 'Unlocated Place', NULL, NULL),
            (777777, 'Name-only Place', 40.0, 20.0);

        INSERT INTO place_types VALUES
            ('port', 'Port', 1),
            ('settlement', 'Settlement', 1),
            ('unused-type', 'Unused type', 1),
            ('legacy feature', NULL, 0);

        INSERT INTO places_place_types VALUES
            (579885, 'settlement'),
            (579885, 'port'),
            (579885, 'legacy feature');

        INSERT INTO time_periods VALUES
            ('classical', 'Classical (Greco-Roman; 550-330 BCE/BC) (550 BC - 330 BC)', -550, -330),
            ('roman', 'Roman, early Empire (30 BC-AD 300) (30 BC - AD 300)', -30, 300);

        INSERT INTO locations VALUES
            (1, 579885, 'athens-location', 'Athens location', -550, 300),
            (2, 123456, 'unlocated-location', 'Unlocated evidence', -30, 300),
            (3, 579885, 'athens-undated', 'Athens undated location', NULL, NULL);

        INSERT INTO locations_place_types VALUES
            (1, 'settlement'),
            (1, 'legacy feature'),
            (2, 'port');

        INSERT INTO locations_time_periods VALUES
            (1, 'classical', 'confident'),
            (1, 'roman', 'less-confident'),
            (2, 'roman', 'confident');

        INSERT INTO names VALUES
            (10, 579885, 'athenai', 'Ἀθῆναι', 'Athenai', 'grc', 'geographic', -550, 300, 'certain'),
            (11, 579885, 'athens-modern', NULL, 'Athens', 'en', 'associated_modern', -30, 300, 'certain'),
            (12, 777777, 'name-only', NULL, 'Name Only', NULL, 'geographic', -30, 300, 'certain'),
            (13, 579885, 'athens-undated-name', NULL, 'Undated Athens Name', NULL, 'geographic', NULL, NULL, 'certain');

        INSERT INTO names_time_periods VALUES
            (10, 'classical', 'confident'),
            (10, 'roman', 'confident-inferred'),
            (11, 'roman', 'confident'),
            (12, 'roman', 'confident');
        """
    )
    if bad_confidence:
        db.execute(
            "INSERT INTO names_time_periods VALUES (12, 'classical', 'mystery-confidence')"
        )
    db.commit()
    db.close()


def write_metadata(path: Path) -> None:
    path.write_text(
        json.dumps({
            "source_url": "https://example.test/data.zip",
            "refreshed_at": "2026-08-18T12:00:00+00:00",
        }),
        encoding="utf-8",
    )


def test_shard_for_id():
    assert shard_for_id(579885) == "5"
    assert shard_for_id(48210385) == "4"
    assert shard_for_id(766) == "7"


def test_exports_static_and_temporal_dataset(tmp_path):
    database = tmp_path / "test.sqlite"
    output = tmp_path / "pleiades"
    metadata = tmp_path / "metadata.json"
    build_database(database)
    write_metadata(metadata)

    stats = export_dataset(database, output, metadata)

    assert stats.places == 3
    assert stats.located == 2
    assert stats.unlocated == 1
    assert stats.search_records == 2
    assert stats.place_names == 2
    assert stats.place_types == 3
    assert stats.temporal_places == 3
    assert stats.temporal_located_places == 2
    assert stats.temporal_unlocated_places == 1
    assert stats.temporal_locations == 2
    assert stats.temporal_names == 3
    assert stats.location_attestations == 3
    assert stats.name_attestations == 4

    types = json.loads((output / "types.json").read_text(encoding="utf-8"))
    assert types == [
        ["port", "Port"],
        ["settlement", "Settlement"],
        ["unused-type", "Unused type"],
    ]
    assert all(row[0] != "legacy feature" for row in types)

    shard = json.loads((output / "5.json").read_text(encoding="utf-8"))
    assert shard["579885"] == ["Athens", 37.97, 23.72, [0, 1]]

    unlocated = json.loads((output / "1.json").read_text(encoding="utf-8"))
    assert unlocated["123456"] == ["Unlocated Place", None, None, []]

    search = json.loads((output / "search.json").read_text(encoding="utf-8"))
    assert search == [
        ["579885", "Athens", 37.97, 23.72, [0, 1]],
        ["777777", "Name-only Place", 40.0, 20.0, []],
    ]

    type_counts = json.loads((output / "type-counts.json").read_text(encoding="utf-8"))
    assert type_counts == [1, 1, 0]

    periods = json.loads((output / "temporal" / "periods.json").read_text(encoding="utf-8"))
    assert periods == [
        ["classical", "Classical (Greco-Roman; 550-330 BCE/BC) (550 BC - 330 BC)", -550, -330],
        ["roman", "Roman, early Empire (30 BC-AD 300) (30 BC - AD 300)", -30, 300],
    ]

    confidences = json.loads((output / "temporal" / "confidences.json").read_text(encoding="utf-8"))
    assert confidences == [
        "confident",
        "confident-inferred",
        "less-confident",
        "less-confident-inferred",
    ]

    temporal_5 = json.loads((output / "temporal" / "5.json").read_text(encoding="utf-8"))
    athens = temporal_5["579885"]
    assert athens["total_locations"] == 2
    assert athens["total_names"] == 3
    assert athens["locations"] == [{
        "start": -550,
        "end": 300,
        "types": [1],
        "attestations": [[0, 0], [1, 2]],
    }]
    assert athens["names"] == [
        {
            "romanized": "Athenai",
            "attested": "Ἀθῆναι",
            "language": "grc",
            "name_type": "geographic",
            "start": -550,
            "end": 300,
            "attestations": [[0, 0], [1, 1]],
        },
        {
            "romanized": "Athens",
            "attested": None,
            "language": "en",
            "name_type": "associated_modern",
            "start": -30,
            "end": 300,
            "attestations": [[1, 0]],
        },
    ]

    # Name-only evidence still makes the conceptual Place belong to Roman.
    period_places = json.loads((output / "temporal" / "period-places.json").read_text(encoding="utf-8"))
    assert period_places[0] == [579885]
    assert period_places[1] == [123456, 579885, 777777]

    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["format_version"] == 2
    assert manifest["temporal"] is True
    assert manifest["type_schema"] == ["key", "term"]
    assert manifest["search_schema"] == ["id", "title", "latitude", "longitude", "type_indexes"]

    temporal_manifest = json.loads((output / "temporal" / "manifest.json").read_text(encoding="utf-8"))
    assert temporal_manifest["period_schema"] == ["key", "term", "lower_bound", "upper_bound"]
    assert temporal_manifest["attestation_schema"] == ["period_index", "confidence_index"]
    assert temporal_manifest["places"] == 3
    assert temporal_manifest["located_places"] == 2
    assert temporal_manifest["unlocated_places"] == 1
    assert temporal_manifest["shards"] == 9
    assert manifest["shards"] == 9
    assert manifest["temporal_located_places"] == 2
    assert manifest["temporal_unlocated_places"] == 1
    assert not (output / "0.json").exists()
    assert not (output / "temporal" / "0.json").exists()


def test_rejects_partial_coordinates(tmp_path):
    database = tmp_path / "test.sqlite"
    output = tmp_path / "pleiades"
    metadata = tmp_path / "missing.json"
    build_database(database)
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO places VALUES (999999, 'Broken', 10.0, NULL)")
        db.commit()
    with pytest.raises(RuntimeError, match="only one representative point"):
        export_dataset(database, output, metadata)


def test_rejects_unknown_attestation_confidence(tmp_path):
    database = tmp_path / "test.sqlite"
    output = tmp_path / "pleiades"
    metadata = tmp_path / "missing.json"
    build_database(database, bad_confidence=True)
    with pytest.raises(RuntimeError, match="unknown confidence"):
        export_dataset(database, output, metadata)


def test_exports_count_only_record_for_place_with_undated_location(tmp_path):
    database = tmp_path / "test.sqlite"
    output = tmp_path / "pleiades"
    metadata = tmp_path / "metadata.json"
    build_database(database)
    write_metadata(metadata)

    db = sqlite3.connect(database)
    db.execute("INSERT INTO places VALUES (461726239, 'Undated Location Place', 12.0, 34.0)")
    db.execute(
        "INSERT INTO locations VALUES (99, 461726239, 'undated-only', 'Undated only', NULL, NULL)"
    )
    db.commit()
    db.close()

    stats = export_dataset(database, output, metadata)

    record = json.loads((output / "temporal" / "4.json").read_text(encoding="utf-8"))["461726239"]
    assert record == {
        "locations": [],
        "names": [],
        "total_locations": 1,
        "total_names": 0,
    }
    assert stats.temporal_places == 3  # still means Places with temporal evidence
    assert stats.temporal_records == 4  # includes count-only popup support records
