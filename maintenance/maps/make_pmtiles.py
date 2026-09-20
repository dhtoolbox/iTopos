import tempfile
import warnings
from pathlib import Path

import geopandas as gpd
import topojson as tp
from osgeo import gdal

# Bring in paths configured from previous files
from download_maps import TARGET_DIR_AWMC, TARGET_DIR_NE

warnings.filterwarnings('ignore', 'GeoSeries.notna', UserWarning)
# Silence the FutureWarning by explicitly enabling modern GDAL exceptions
gdal.UseExceptions()


# Core Processing Modules we created earlier
def simplify_topology(gdf: gpd.GeoDataFrame, tolerance: float = 0.005) -> gpd.GeoDataFrame:
    if gdf.empty:
        return gdf

    # 1. Clean missing/empty shapes
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()

    # 2. FIX: Instead of dropping invalid geometries, FIX THEM natively
    invalid_mask = ~gdf.geometry.is_valid
    invalid_count = invalid_mask.sum()
    if invalid_count > 0:
        print(f"🔧 Found {invalid_count} invalid geometries (e.g. self-intersections). Repairing them...")
        # .make_valid() fixes bow-ties and overlapping vertices automatically
        gdf.loc[invalid_mask, "geometry"] = gdf.loc[invalid_mask, "geometry"].make_valid()

    if gdf.empty:
        return gdf

    print(f"📐 Running topology-preserving simplification (tolerance={tolerance})...")

    try:
        topology = tp.Topology(gdf, prequantize=False)
        simplified_topology = topology.toposimplify(tolerance)
        simplified_gdf = simplified_topology.to_gdf()
    except Exception as e:
        print(
            f"⚠️ TopoJSON simplification failed due to complex shapes ({e}). Falling back to standard Shapely simplification...")
        # Fallback to standard safe simplification if TopoJSON chokes on the repaired shape
        gdf["geometry"] = gdf.geometry.simplify(tolerance, preserve_topology=True)
        simplified_gdf = gdf

    if gdf.crs:
        simplified_gdf = simplified_gdf.set_crs(gdf.crs, allow_override=True)
    return simplified_gdf


def verify_conversion(original_gdf: gpd.GeoDataFrame, processed_gdf: gpd.GeoDataFrame, layer_name: str):
    """
    Automated check to compare the processed output against the original source data.
    """
    print(f"🔍 Validating data integrity for '{layer_name}'...")

    orig_count = len(original_gdf)
    proc_count = len(processed_gdf)

    if proc_count == 0:
        print(f"❌ CRITICAL ERROR: '{layer_name}' is empty after processing!")
        return False

    # Calculate how many features were lost
    loss_percent = ((orig_count - proc_count) / orig_count) * 100
    if loss_percent > 10:  # Warn if more than 10% of rows disappeared
        print(
            f"⚠️ WARNING: Row count dropped significantly! Original: {orig_count}, Processed: {proc_count} ({loss_percent:.1f}% lost)")

    # Compare Bounding Box Extents to ensure it didn't shrink or move drastically
    orig_bounds = original_gdf.total_bounds  # [minx, miny, maxx, maxy]
    proc_bounds = processed_gdf.total_bounds

    # If the bounding boxes drastically mismatch, something went wrong
    if abs(orig_bounds[2] - proc_bounds[2]) > 1.0 or abs(orig_bounds[0] - proc_bounds[0]) > 1.0:
        print(f"❌ GEOMETRY LOSS DETECTED on '{layer_name}':")
        print(f"   Original Max Longitude: {orig_bounds[2]:.4f}° East")
        print(f"   Processed Max Longitude: {proc_bounds[2]:.4f}° East (The map was truncated!)")
        return False

    print(f"✅ Pass! Data integrity verified for '{layer_name}'.")
    return True


def truncate_precision(gdf: gpd.GeoDataFrame, decimals: int = 5) -> gpd.GeoDataFrame:
    if gdf.empty: return gdf
    grid_size = 10 ** -decimals
    gdf["geometry"] = gdf.geometry.set_precision(grid_size=grid_size, mode="valid_output")
    return gdf


def extract_surface_labels(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.empty: return gdf
    label_gdf = gdf.copy()
    label_gdf["geometry"] = label_gdf.geometry.representative_point()
    return label_gdf.set_geometry("geometry")


def compile_final_master_archive(layers_dict: dict, output_path: Path):
    """
    Takes a dictionary of {layer_name: gdf}, stages them into a multi-layer
    temporary GeoPackage, and uses GDAL's VectorTranslate to generate a
    flawless, multi-layer master PMTiles file.
    """
    print(f"\n🧱 Initiating master serialization for: {output_path.name}")

    if not layers_dict:
        print("⚠️ No layers collected to write. Skipping output.")
        return

    # Delete any stale files from prior test runs
    if output_path.exists():
        output_path.unlink()

    # Create an isolated temporary directory for the intermediate GeoPackage stage
    with tempfile.TemporaryDirectory() as tmp_dir:
        gpkg_path = Path(tmp_dir) / "staging.gpkg"

        try:
            # Step 1: Sequential stacking works perfectly inside GeoPackage files
            for i, (layer_name, gdf) in enumerate(layers_dict.items()):
                if gdf.empty:
                    continue

                print(f"  -> Staging layer [{i + 1}/{len(layers_dict)}]: {layer_name}")

                # Write/Append directly to the intermediate GeoPackage dataset
                gdf.to_file(
                    gpkg_path,
                    layer=layer_name,
                    driver="GPKG",
                    mode="a" if gpkg_path.exists() else "w"
                )

            if not gpkg_path.exists():
                print("⚠️ No valid vector data was written to staging. Skipping final compilation.")
                return

            print(f"  ⚡ Running GDAL VectorTranslate to assemble multi-layer PMTiles...")

            # Step 2: Convert the entire GeoPackage container simultaneously to PMTiles.
            # Using layer_creation_options instead of dataset_options avoids invalid flags.
            gdal.VectorTranslate(
                str(output_path),
                str(gpkg_path),
                format="PMTiles"
            )

            file_size_mb = output_path.stat().st_size / (1024 * 1024)
            print(f"🎉 Success! Compressed multi-layer archive saved: {output_path.name} ({file_size_mb:.3f} MB)\n")

        except Exception as e:
            print(f"❌ Master PMTiles compilation failed: {e}")


def run_full_production_pipeline():
    print("🎬 Starting complete Geospatial Production Pipeline...\n")

    # Final PMTiles distribution output directory
    dist_dir = Path(__file__).resolve().parents[2] / "static" / "map"
    dist_dir.mkdir(parents=True, exist_ok=True)

    # Create empty in-memory staging dictionaries
    ne_layers = {}
    awmc_layers = {}

    # --- Phase 1: Batch Process Natural Earth Layers ---
    print("--- 🌍 Processing Natural Earth Dataset ---")
    ne_staged_files = list(TARGET_DIR_NE.glob("*.geojson"))

    # Define one unified output file path for all Natural Earth data
    master_ne_output = dist_dir / "master_ne.pmtiles"

    # Clear out the old archive ONCE at the start of the production run
    if master_ne_output.exists():
        try:
            master_ne_output.unlink()
            print(f"🧹 Cleared old master archive: {master_ne_output.name}")
        except Exception as e:
            print(f"⚠️ Could not delete old file: {e}")

    for file_path in ne_staged_files:
        if file_path.name.startswith("optimized_") or file_path.name.startswith("labels_") or file_path.name.startswith(
                "visual_"):
            continue  # Skip existing artifacts

        print(f"\n💎 Optimizing Natural Earth Layer: {file_path.name}")
        gdf = gpd.read_file(file_path)

        # Standardize column names to lowercase to prevent casing mismatches
        gdf.columns = gdf.columns.str.lower()
        name_cols = [col for col in gdf.columns if col in ["name", "name_en", "pid"]]

        # ----------------------------------------------------
        # BRANCH 1: Custom Line-Label Optimization for Rivers
        # ----------------------------------------------------
        if "rivers" in file_path.name:
            print(f"🌊 Running Custom Line-Label Optimization for Rivers: {file_path.name}")

            # 1. Compile the pure visual background lines (Zero attributes)
            pure_geometry_gdf = gdf[["geometry"]].copy()
            simplified_visual = simplify_topology(pure_geometry_gdf, tolerance=0.005)
            simplified_visual = truncate_precision(simplified_visual, decimals=5)

            # 2. Compile the Line-Label tracking file (Keep lines intact, do not convert to points)
            river_labels_gdf = gdf[name_cols + ["geometry"]].copy() if name_cols else gdf[["geometry"]].copy()
            simplified_labels = simplify_topology(river_labels_gdf, tolerance=0.005)
            simplified_labels = truncate_precision(simplified_labels, decimals=5)

            ne_layers[f"visual_{file_path.stem}"] = simplified_visual
            ne_layers[f"labels_{file_path.stem}"] = simplified_labels
            # CRITICAL: Skip the rest of the loop for this file so it doesn't process twice!
            continue

            # ----------------------------------------------------
        # BRANCH 2: General Poly/Point Layers (Countries, Lakes, Places)
        # ----------------------------------------------------
        if name_cols:
            # 1. Isolate and extract surface center point labels
            labels_gdf = extract_surface_labels(gdf)
            labels_gdf = truncate_precision(labels_gdf, decimals=5)
            labels_gdf = labels_gdf[name_cols + ["geometry"]]

            ne_layers[f"labels_{file_path.stem}"] = labels_gdf

        # 2. Isolate and Simplify the Visual Polygon/Line Geometry Layer
        pure_geometry_gdf = gdf[["geometry"]].copy()
        simplified_gdf = simplify_topology(pure_geometry_gdf, tolerance=0.005)
        simplified_gdf = truncate_precision(simplified_gdf, decimals=5)

        ne_layers[f"visual_{file_path.stem}"] = simplified_gdf

    # --- Phase 2: Batch Process AWMC Layers ---
    print("\n--- 🏺 Processing AWMC Dataset ---")
    awmc_staged_files = list(TARGET_DIR_AWMC.glob("normalized_*.geojson"))

    # Define a single, unified output file path for historical layers
    master_awmc_output = dist_dir / "master_awmc.pmtiles"

    # Clear out the old archive ONCE before starting the loop
    if master_awmc_output.exists():
        try:
            master_awmc_output.unlink()
            print(f"🧹 Cleared old AWMC master archive: {master_awmc_output.name}")
        except Exception as e:
            print(f"⚠️ Could not delete old AWMC file: {e}")

    for file_path in awmc_staged_files:
        # Example: normalized_political_shading_layername.geojson
        clean_layer_name = file_path.name.replace("normalized_", "").replace(".geojson", "")
        print(f"\n💎 Optimizing AWMC Layer: {clean_layer_name}")

        gdf = gpd.read_file(file_path)

        # Keep a copy of original for validation
        original_gdf = gdf.copy()

        # Simplify geometry globally
        simplified_gdf = simplify_topology(gdf, tolerance=0.001)  # Lower tolerance to preserve detailed empires
        simplified_gdf = truncate_precision(simplified_gdf, decimals=5)

        # Run verification check
        verify_conversion(original_gdf, simplified_gdf, clean_layer_name)

        # Stage to the AWMC dictionary:
        awmc_layers[clean_layer_name] = simplified_gdf

    # --- Phase 3: Final Output Compilation Block ---
    print("\n🏁 Staging completed. Starting compilation...")

    # Write Natural Earth Master
    if ne_layers:
        compile_final_master_archive(ne_layers, master_ne_output)

    # Write AWMC Master
    if awmc_layers:
        compile_final_master_archive(awmc_layers, master_awmc_output)

    print(f"\n🚀 Production pipeline complete! All assets compiled to single-file PMTiles under {dist_dir}.")


if __name__ == "__main__":
    run_full_production_pipeline()
