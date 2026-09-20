import io
import json
import socket
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Production Config: Keep configurations clean and configurable
USER_AGENT = "iTopos-Data-Updater"
DEFAULT_TIMEOUT = 60


def get_request_headers() -> dict[str, str]:
    """Centralized headers to ensure consistency across all requests."""
    return {"User-Agent": USER_AGENT}


def stream_file(url: str, timeout: int = DEFAULT_TIMEOUT) -> io.BytesIO:
    """Streams a remote file entirely into an in-memory buffer.

    Raises:
        urllib.error.URLError: Network or DNS failures.
        socket.timeout: Request timed out.
    """
    print(f"📡 Downloading remote file into memory: {url}", flush=True)
    req = urllib.request.Request(url, headers=get_request_headers())

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return io.BytesIO(response.read())
    except (urllib.error.URLError, socket.timeout) as e:
        print(f"❌ In-memory stream failed for {url}. Error: {e}", flush=True)
        raise


def download_file(url: str, target_file: Path, timeout: int = DEFAULT_TIMEOUT) -> io.BytesIO:
    """Downloads a file, updates the local cache, and falls back to disk cache if offline."""
    print(f"📥 Fetching file: {url}", flush=True)
    req = urllib.request.Request(url, headers=get_request_headers())

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = response.read()

        # Ensure the destination directory exists (prevents FileNotFoundError)
        target_file.parent.mkdir(parents=True, exist_ok=True)

        # Save cache copy cleanly
        target_file.write_bytes(data)

        metadata_file = target_file.with_suffix(".json")
        metadata = {
            "source_url": url,
            "refreshed_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }
        metadata_file.write_text(
            json.dumps(metadata, indent=2),
            encoding="utf-8",
        )

        print(f"💾 Cache updated successfully: {target_file}", flush=True)
        return io.BytesIO(data)

    except (urllib.error.URLError, socket.timeout) as e:
        if target_file.exists():
            print(f"⚠️ Network error ({e}). Falling back to cached disk file.", flush=True)
            return io.BytesIO(target_file.read_bytes())

        print(f"❌ Download failed and no local cache exists at: {target_file}", flush=True)
        raise


def download_file_to_disk(url: str, target_file: Path, timeout: int = DEFAULT_TIMEOUT) -> Path:
    """Download a large remote file directly to disk, with cached fallback."""
    print(f"Fetching large file: {url}", flush=True)
    req = urllib.request.Request(url, headers=get_request_headers())
    target_file.parent.mkdir(parents=True, exist_ok=True)
    temp_file = target_file.with_suffix(target_file.suffix + ".part")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response, temp_file.open("wb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
        temp_file.replace(target_file)
        metadata_file = target_file.with_suffix(target_file.suffix + ".json")
        metadata_file.write_text(
            json.dumps(
                {
                    "source_url": url,
                    "refreshed_at": datetime.now(timezone.utc).isoformat(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"Cache updated successfully: {target_file}", flush=True)
        return target_file
    except (urllib.error.URLError, socket.timeout):
        temp_file.unlink(missing_ok=True)
        if target_file.exists():
            print(f"Network error. Falling back to cached disk file: {target_file}", flush=True)
            return target_file
        raise
