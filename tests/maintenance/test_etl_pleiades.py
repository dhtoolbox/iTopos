import io
import sqlite3
import sys
import zipfile
from pathlib import Path

import pytest

MAINTENANCE_DIR = Path(__file__).resolve().parents[1]
if str(MAINTENANCE_DIR) not in sys.path:
    sys.path.insert(0, str(MAINTENANCE_DIR))

import etl_pleiades as etl


def make_vocab_zip():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("data/gis/place_types.csv", "key,term\nsettlement,Settlement\nroad,Road\n")
        zf.writestr(
            "data/gis/time_periods.csv",
            'key,term,lower_bound,upper_bound\n'
            'roman,"Roman, early Empire (30 BC-AD 300) (30 BC - AD 300)",30 BC,AD 300\n'
        )
        zf.writestr("data/gis/association_certainty.csv", "key,term\ncertain,Certain\n")
        zf.writestr("data/gis/archaeological_remains.csv", "key,term\nunknown,Unknown\n")
    buffer.seek(0)
    return buffer


def sample_payload(extra_place_field=False):
    place = {
        "id": "123456",
        "title": "Test Place",
        "uri": "https://pleiades.stoa.org/places/123456",
        "reprPoint": [12.5, 41.9],
        "placeTypes": ["settlement", "legacy feature"],
        "placeTypeURIs": [
            "https://pleiades.stoa.org/vocabularies/place-types/settlement",
            "https://pleiades.stoa.org/vocabularies/place-types/legacy feature",
        ],
        "features": [
            {
                "id": "location with space",
                "geometry": {"type": "Point", "coordinates": [12.5, 41.9]},
                "properties": {"location_precision": "precise"},
            }
        ],
        "names": [
            {
                "id": "latin-name",
                "uri": "https://pleiades.stoa.org/places/123456/latin-name",
                "attested": "Roma",
                "romanized": "Roma",
                "language": "la",
                "nameType": "geographic",
                "start": -30,
                "end": 300,
                "associationCertainty": "certain",
                "associationCertaintyURI": "https://pleiades.stoa.org/vocabularies/association-certainty/certain",
                "attestations": [
                    {
                        "timePeriod": "roman",
                        "timePeriodURI": "https://pleiades.stoa.org/vocabularies/time-periods/roman",
                        "confidence": "confident",
                        "confidenceURI": "https://pleiades.stoa.org/vocabularies/attestation-confidence/confident",
                    }
                ],
            }
        ],
        "locations": [
            {
                "id": "location with space",
                "title": "Test Location",
                "uri": "https://pleiades.stoa.org/places/123456/location%20with%20space",
                "start": -100,
                "end": 100,
                "geometry": {"type": "Point", "coordinates": [12.5, 41.9]},
                "featureType": ["road", ""],
                "featureTypeURI": [
                    "https://pleiades.stoa.org/vocabularies/place-types/road",
                    "",
                ],
                "locationType": ["representative", "associated modern", ""],
                "locationTypeURI": [
                    "https://pleiades.stoa.org/vocabularies/place-types/road",
                    "",
                ],
                "accuracy_value": 20.0,
                "accuracy": "https://pleiades.stoa.org/features/metadata/generic-osm-accuracy-assessment",
                "associationCertainty": "certain",
                "associationCertaintyURI": "https://pleiades.stoa.org/vocabularies/association-certainty/certain",
                "archaeologicalRemains": "unknown",
                "attestations": [
                    {
                        "timePeriod": "roman",
                        "timePeriodURI": "https://pleiades.stoa.org/vocabularies/time-periods/roman",
                        "confidence": "confident",
                        "confidenceURI": "https://pleiades.stoa.org/vocabularies/attestation-confidence/confident",
                    }
                ],
            }
        ],
    }
    if extra_place_field:
        place["brandNewField"] = {"nested": True}
    return {"@graph": [place]}


def test_parse_pleiades_year():
    assert etl.parse_pleiades_year("2600000 BC") == -2600000
    assert etl.parse_pleiades_year("30 BC") == -30
    assert etl.parse_pleiades_year("AD 1") == 1
    assert etl.parse_pleiades_year("AD 300") == 300
    assert etl.parse_pleiades_year("2100 AD") == 2100
    assert etl.parse_pleiades_year("") is None
    assert etl.parse_pleiades_year(None) is None


def test_build_database_normalizes_and_preserves_source_semantics(tmp_path):
    db_path = tmp_path / "pleiades.sqlite"
    stats = etl.build_database(make_vocab_zip(), sample_payload(), db_path, minimum_places=1)

    with sqlite3.connect(db_path) as db:
        assert db.execute("SELECT id, title, repr_lat, repr_lng FROM places").fetchone() == (
            123456, "Test Place", 41.9, 12.5
        )
        assert db.execute(
            "SELECT term, in_vocabulary FROM place_types WHERE key='settlement'"
        ).fetchone() == ("Settlement", 1)
        assert db.execute(
            "SELECT term, in_vocabulary FROM place_types WHERE key='legacy feature'"
        ).fetchone() == (None, 0)

        location = db.execute(
            "SELECT location_id, start, end, geometry_type, location_precision, accuracy_meters, accuracy_basis "
            "FROM locations"
        ).fetchone()
        assert location == (
            "location with space", -100, 100, "Point", "precise", 20.0,
            "generic-osm-accuracy-assessment",
        )
        assert db.execute("SELECT place_type FROM locations_place_types").fetchall() == [("road",)]
        assert set(db.execute("SELECT location_category FROM locations_location_categories").fetchall()) == {
            ("representative",), ("associated_modern",)
        }
        assert db.execute(
            "SELECT time_period, confidence FROM locations_time_periods"
        ).fetchall() == [("roman", "confident")]
        assert db.execute(
            "SELECT term, lower_bound, upper_bound FROM time_periods WHERE key = 'roman'"
        ).fetchone() == ("Roman, early Empire (30 BC-AD 300) (30 BC - AD 300)", -30, 300)
        assert db.execute(
            "SELECT name_id, attested, romanized, language, name_type, start, end, association_certainty FROM names"
        ).fetchone() == (
            "latin-name", "Roma", "Roma", "la", "geographic", -30, 300, "certain"
        )
        assert db.execute(
            "SELECT time_period, confidence FROM names_time_periods"
        ).fetchall() == [("roman", "confident")]

    assert stats.location_uri_mismatches == 0
    assert stats.name_uri_mismatches == 0
    assert stats.names_imported == 1
    assert stats.names_with_dates == 1
    assert stats.names_with_named_periods == 1
    assert stats.name_attestations_read == 1
    assert stats.legacy_location_category_aliases_normalized == 1
    assert stats.feature_type_uri_location_type_uri_equal == 1
    assert stats.dates_and_periods == 1
    assert stats.unknown_place_type_keys == {"legacy feature"}


def test_structure_profiler_records_new_paths(tmp_path):
    profile = etl.profile_payload(sample_payload(extra_place_field=True), "places")
    out = tmp_path / "profile.txt"
    profile.write(out)
    text = out.read_text(encoding="utf-8")
    assert "root.@graph[].brandNewField: dict=1" in text
    assert "root.@graph[].brandNewField.nested: bool=1" in text
    assert "[location.locationType]" in text


def test_unlisted_place_type_report_contains_all_evidence(tmp_path):
    db_path = tmp_path / "pleiades.sqlite"
    stats = etl.build_database(make_vocab_zip(), sample_payload(), db_path, minimum_places=1)
    report = tmp_path / "unlisted.txt"
    etl.write_unlisted_place_types_report(report, stats)
    text = report.read_text(encoding="utf-8")
    assert "legacy feature" in text
    assert "123456 | Test Place" in text
    assert "https://pleiades.stoa.org/vocabularies/place-types/legacy feature" in text
    assert "in_vocabulary=0 and term=NULL" in text


def test_small_dataset_guard_remains_enabled_by_default(tmp_path):
    with pytest.raises(RuntimeError, match="unexpectedly small"):
        etl.build_database(make_vocab_zip(), sample_payload(), tmp_path / "small.sqlite")
