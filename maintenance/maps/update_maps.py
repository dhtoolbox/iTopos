#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

#
# cd maintenance/maps
# python update_maps.py
#

sys.path.append(str(Path(__file__).resolve().parents[2]))

# Import the main execution blocks from the existing modular scripts
try:
    import download_maps
    import process_maps
    import make_pmtiles
except ImportError as e:
    print(f"❌ Core script import failed: {e}")
    print("💡 Ensure download_maps.py, process_maps.py, and make_pmtiles.py are in this folder.")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="🏛️ Classical Mapping Pipeline Controller"
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip fetching raw assets from the internet and process existing local data."
    )
    args = parser.parse_args()

    print("====================================================")
    print("🎬 STARTING MASTER DATA MAINTENANCE PIPELINE")
    print("====================================================\n")

    # Step 1: Download Phase
    if args.skip_download:
        print("⏭️ Skipping download phase as requested. Using local files.")
    else:
        print("📥 Phase 1: Downloading Remote Mapping Data Assets...")
        if hasattr(download_maps, "run_download_pipeline"):
            download_maps.run_download_pipeline()
        else:
            print("⚠️ Could not find run_download_pipeline() entrypoint. Skipping.")

    # Step 2: Normalization Phase
    print("\n🧼 Phase 2: Extracting, Normalizing, and Projecting Vectors...")
    process_maps.run_normalization_pipeline()

    # Step 3: Compilation Phase
    print("\n📦 Phase 3: Optimizing Topology and Compiling PMTiles Archives...")
    make_pmtiles.run_full_production_pipeline()

    print("\n====================================================")
    print("🎉 PIPELINE RUN COMPLETE! All assets generated successfully.")
    print("====================================================")


if __name__ == "__main__":
    main()
