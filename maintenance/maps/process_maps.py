import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd

# Grab the data directories configured in the downloader script
from download_maps import TARGET_DIR_AWMC, TARGET_DIR_NE


def extract_and_normalize_properties(file_path: Path) -> gpd.GeoDataFrame:
    """Reads a geospatial layer, drops unneeded columns, and normalizes name attributes."""
    print(f"📖 Reading spatial vector data: {file_path.name}...")

    # Read spatial data into memory (handles .geojson and .shp natively)
    gdf = gpd.read_file(file_path)

    # Guarantee strict MapLibre positioning compatibility (WGS 84)
    if gdf.crs is None or gdf.crs.to_epsg() != 4326:
        print(f"🌐 Re-projecting layer {file_path.name} to standard EPSG:4326...")
        gdf = gdf.to_crs(epsg=4326)

    # Dictionary mapping to force a unified schema for properties we want to keep
    target_columns = {}

    # Search for naming variations across datasets
    for col in gdf.columns:
        col_lower = col.lower()
        if col_lower in ["name", "title"]:
            # Hardcode the target to "name" so "title" or "TITLE" becomes "name"
            target_columns[col] = "name"
            break

    # Keep only the target name columns and the vital 'geometry' vector track
    columns_to_keep = list(target_columns.keys()) + ["geometry"]
    gdf = gdf[columns_to_keep].copy()

    # Rename variables uniformly to lowercase (e.g., TITLE -> name, NAME -> name)
    gdf = gdf.rename(columns=target_columns)

    print(f"✨ Normalized properties for {file_path.name}. Columns retained: {list(gdf.columns)}")
    return gdf


def process_natural_earth_zips():
    """Unzips Natural Earth collections, normalizes vectors, and saves them as staging GeoJSONs."""
    print("\n📦 Processing Natural Earth ZIP archives...")

    # Find all downloaded zip modules
    zip_files = list(TARGET_DIR_NE.glob("*.zip"))
    if not zip_files:
        print("⚠️ No Natural Earth ZIP archives found to process.")
        return

    for zip_path in zip_files:
        print(f"\n📂 Extracting archive: {zip_path.name}")

        # Create an isolated temporary staging environment to hold internal shapefile clusters
        with tempfile.TemporaryDirectory() as tmp_dir:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(tmp_dir)

            # Locate the core .shp file within the extracted assets
            shp_files = list(Path(tmp_dir).glob("*.shp"))
            if not shp_files:
                print(f"❌ Failed to find a valid .shp master file inside {zip_path.name}")
                continue

            shp_path = shp_files[0]

            # Run normalization on the shapefile vector contents
            normalized_gdf = extract_and_normalize_properties(shp_path)

            # Save out a clean staging file (e.g., ne_50m_lakes.geojson) for the simplification phase
            staging_output = TARGET_DIR_NE / f"{zip_path.stem}.geojson"
            normalized_gdf.to_file(staging_output, driver="GeoJSON")
            print(f"💾 Staged normalized layer to: {staging_output.name}")


def process_awmc_geojson_layers():
    """Normalizes properties on existing direct GeoJSON files in place."""
    print("\n🏺 Processing AWMC GeoJSON layers...")

    # Process only raw geojsons (ignoring any already-normalized backups or temporary tracks)
    geojson_files = [f for f in TARGET_DIR_AWMC.glob("*.geojson") if not f.name.startswith("normalized_")]
    if not geojson_files:
        print("⚠️ No AWMC GeoJSON instances found to normalize.")
        return

    for geo_path in geojson_files:
        normalized_gdf = extract_and_normalize_properties(geo_path)

        # Overwrite or separate out the target payload files cleanly
        staging_output = TARGET_DIR_AWMC / f"normalized_{geo_path.name}"
        normalized_gdf.to_file(staging_output, driver="GeoJSON")
        print(f"💾 Staged normalized layer to: {staging_output.name}")


def run_normalization_pipeline():
    """Master controller orchestrating data preparation workflows."""
    process_natural_earth_zips()
    process_awmc_geojson_layers()
    print("\n✅ Normalization phase complete! Geometries are isolated, clean, and uniformly named.")


if __name__ == "__main__":
    run_normalization_pipeline()
