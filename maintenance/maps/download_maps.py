import json
import urllib.request
from pathlib import Path

from maintenance.utils import USER_AGENT, download_file

# --- Project Paths Configuration ---
DATA_RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
TARGET_DIR_AWMC = DATA_RAW_DIR / "awmc"
TARGET_DIR_NE = DATA_RAW_DIR / "ne"

# --- Remote Asset URLs Configuration ---
AWMC_POLITICAL_SHADING_DIR = "https://api.github.com/repos/AWMC/geodata/contents/Cultural-Data/political_shading"

DIR_URLS = [AWMC_POLITICAL_SHADING_DIR]

# Stable, public Amazon S3 mirrors managed by the mapping community
NE_S3_BASE = "https://naturalearth.s3.amazonaws.com"
NE_SIZE = "50m"
ZIP_URLS = [
    f"{NE_S3_BASE}/{NE_SIZE}_cultural/ne_{NE_SIZE}_admin_0_countries.zip",
    f"{NE_S3_BASE}/{NE_SIZE}_physical/ne_{NE_SIZE}_land.zip",
    f"{NE_S3_BASE}/{NE_SIZE}_physical/ne_{NE_SIZE}_rivers_lake_centerlines.zip",
    f"{NE_S3_BASE}/{NE_SIZE}_physical/ne_{NE_SIZE}_lakes.zip",
    f"{NE_S3_BASE}/{NE_SIZE}_physical/ne_{NE_SIZE}_geography_marine_polys.zip"
]


def make_request(url: str) -> list | dict:
    """Production wrapper for scanning metadata catalogs or processing GitHub API payloads."""
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': USER_AGENT,
            'Accept': 'application/vnd.github.v3+json'
        }
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode('utf-8'))


def run_download_pipeline():
    """Executes the complete asset collection pipeline for geospatial dependencies."""
    print("🚀 Starting spatial data synchronization...", flush=True)

    # --- Phase 1: Natural Earth Layer Bundles (ZIP Files) ---
    print("\n--- Synchronizing Natural Earth Bundles ---", flush=True)
    for zip_url in ZIP_URLS:
        # download_file automatically takes care of missing target directory creation internally
        destination = TARGET_DIR_NE / Path(zip_url).name.replace(f"ne_{NE_SIZE}", "ne")
        try:
            download_file(zip_url, destination)
        except Exception as e:
            print(f"❌ Aborted bundle transfer for {destination.name}. Error: {e}", flush=True)

    # --- Phase 2: Crawl and Scrape Nested API Structural Folders ---
    print("\n--- Crawling Remote Repository Subfolders ---", flush=True)
    for folder_api_url in DIR_URLS:
        repo_name = folder_api_url.split('/')[-1]
        print(f"🔎 Scanning API structural collection container: {repo_name}...", flush=True)

        try:
            root_contents = make_request(folder_api_url)
            for item in root_contents:
                if item.get("type") != "dir":
                    continue

                folder_name = item.get("name", "").replace(" ", "_")
                subfolder_url = item.get("url")

                try:
                    print(f"  └─ Checking nested index: {folder_name}...", flush=True)
                    subfolder_contents = make_request(subfolder_url)

                    for sub_item in subfolder_contents:
                        file_name = sub_item.get("name", "")

                        if file_name.endswith(".geojson"):
                            download_url = sub_item.get("download_url")
                            destination = TARGET_DIR_AWMC / f"awmc_{folder_name}.geojson"

                            print(f"     📥 Catching core layer: {file_name} -> {destination.name}", flush=True)
                            download_file(download_url, destination)
                            break  # Target file acquired; advance directly to scanning the next catalog path

                except Exception as sub_e:
                    print(f"  ❌ Error walking through subdirectory '{folder_name}': {sub_e}", flush=True)

        except Exception as e:
            print(f"❌ Pipeline break scanning collection path root. Error: {e}", flush=True)

    print("\n✅ Synchronization cycle complete! Spatial layer cache matching is finished.")


if __name__ == "__main__":
    run_download_pipeline()
