"""
Encircle API Client — Claims, Media, Rooms, Download

REST client for https://api.encircleapp.com with Bearer token auth.
Handles pagination (cursor-based), rate limiting (429 retry w/ backoff),
and media download from temporary URIs.

Usage:
    from encircle_client import EncircleClient
    client = EncircleClient(api_token="...")
    claims = client.list_claims()
    media = client.get_media(claim_id)
    videos = client.filter_videos(media)
"""

import os
import time
import urllib.request
import urllib.error
import json
from pathlib import Path
from dataclasses import dataclass
from dotenv import load_dotenv

# Load .env from estimator directory
load_dotenv(Path(__file__).parent / '.env')

BASE_URL = "https://api.encircleapp.com/v1"
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0  # seconds, doubles each retry


class EncircleAPIError(Exception):
    """Raised on non-retryable API errors (401, 404, etc.)."""
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Encircle API {status_code}: {message}")


class EncircleClient:
    """Client for the Encircle REST API."""

    def __init__(self, api_token: str = None):
        self.api_token = api_token or os.environ.get("ENCIRCLE_API_TOKEN", "")
        if not self.api_token:
            raise ValueError(
                "Encircle API token required. Set ENCIRCLE_API_TOKEN in .env "
                "or pass api_token= to EncircleClient."
            )
        self._headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Accept": "application/json",
        }

    # ── Core HTTP ──────────────────────────────────────────────

    def _request(self, endpoint: str, params: dict = None) -> dict:
        """Make authenticated GET request with retry on 429."""
        url = f"{BASE_URL}{endpoint}"
        if params:
            query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
            if query:
                url = f"{url}?{query}"

        for attempt in range(MAX_RETRIES + 1):
            req = urllib.request.Request(url, headers=self._headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.loads(resp.read().decode())
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    raise EncircleAPIError(401, "Invalid or expired API token")
                if e.code == 404:
                    raise EncircleAPIError(404, f"Not found: {endpoint}")
                if e.code == 429 and attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF * (2 ** attempt)
                    print(f"  Rate limited (429), waiting {wait:.0f}s...")
                    time.sleep(wait)
                    continue
                body = e.read().decode() if e.fp else str(e)
                raise EncircleAPIError(e.code, body)
            except urllib.error.URLError as e:
                if attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF * (2 ** attempt)
                    print(f"  Connection error, retrying in {wait:.0f}s: {e}")
                    time.sleep(wait)
                    continue
                raise

    def _paginate(self, endpoint: str, limit: int = 100, params: dict = None) -> list:
        """Fetch all pages using cursor-based pagination (after parameter)."""
        all_items = []
        page_params = dict(params or {})
        page_params["limit"] = min(limit, 100)

        while True:
            data = self._request(endpoint, page_params)

            # Response formats:
            #   List: [...]
            #   Paginated: {"list": [...], "cursor": {"after": ...}}
            #   Alt paginated: {"data": [...], "paging": {"cursors": {"after": ...}}}
            #   Single object: {...}
            if isinstance(data, list):
                all_items.extend(data)
                break
            elif "list" in data:
                items = data["list"]
                all_items.extend(items)
                after_cursor = (data.get("cursor") or {}).get("after")
                if not after_cursor or len(items) < page_params["limit"]:
                    break
                page_params["after"] = after_cursor
            elif "data" in data:
                items = data["data"]
                all_items.extend(items)
                paging = data.get("paging", {})
                after_cursor = paging.get("cursors", {}).get("after")
                if not after_cursor or len(items) < page_params["limit"]:
                    break
                page_params["after"] = after_cursor
            else:
                # Single object response
                all_items.append(data)
                break

        return all_items

    # ── Claims ─────────────────────────────────────────────────

    def list_claims(self, limit: int = 50, search: str = None) -> list[dict]:
        """List property claims. If search is provided, filter client-side by policyholder name."""
        claims = self._paginate("/property_claims", limit=limit)
        if search:
            search_lower = search.lower()
            claims = [
                c for c in claims
                if search_lower in (c.get("policyholder_name") or "").lower()
            ]
        return claims

    def get_claim(self, claim_id: str) -> dict:
        """Get a single claim by ID."""
        return self._request(f"/property_claims/{claim_id}")

    def find_claim_by_name(self, name: str) -> dict | None:
        """Search claims by policyholder name (fuzzy, client-side).
        Returns the best match or None."""
        claims = self.list_claims()
        name_lower = name.lower().strip()

        # Exact match first
        for c in claims:
            ph = (c.get("policyholder_name") or "").lower()
            if ph == name_lower:
                return c

        # Substring match
        matches = []
        for c in claims:
            ph = (c.get("policyholder_name") or "").lower()
            if name_lower in ph or ph in name_lower:
                matches.append(c)

        # Word overlap match
        if not matches:
            name_words = set(name_lower.split())
            for c in claims:
                ph = (c.get("policyholder_name") or "").lower()
                ph_words = set(ph.split())
                if name_words & ph_words:
                    matches.append(c)

        return matches[0] if matches else None

    # ── Media ──────────────────────────────────────────────────

    def get_media(self, claim_id: str, limit: int = 100) -> list[dict]:
        """Get all media items for a claim."""
        return self._paginate(f"/property_claims/{claim_id}/media", limit=limit)

    @staticmethod
    def filter_videos(media_items: list[dict]) -> list[dict]:
        """Filter media to video files only (source.type == 'VideoFile')."""
        return [
            m for m in media_items
            if (m.get("source") or {}).get("type") == "VideoFile"
        ]

    @staticmethod
    def filter_photos(media_items: list[dict]) -> list[dict]:
        """Filter media to room overview photos (source.type == 'ClaimRoomAfterPicture')."""
        return [
            m for m in media_items
            if (m.get("source") or {}).get("type") == "ClaimRoomAfterPicture"
        ]

    @staticmethod
    def get_media_room_name(media_item: dict) -> str:
        """Extract room name from a media item.

        Encircle stores room association in labels array:
        labels[0] = structure name (e.g. "Main Building")
        labels[1] = room name (e.g. "Kitchen", "Living Room")
        """
        labels = media_item.get("labels") or []
        if len(labels) >= 2:
            return labels[1]
        if len(labels) == 1:
            return labels[0]
        return ""

    @staticmethod
    def group_photos_by_room(photos: list[dict]) -> dict[str, list[dict]]:
        """Group photo media items by their Encircle room name.

        Returns dict mapping room_name -> list of photo media items.
        Photos without a room association go under '_unassigned'.
        """
        by_room = {}
        for p in photos:
            labels = p.get("labels") or []
            room_name = labels[1] if len(labels) >= 2 else ""
            if not room_name:
                room_name = "_unassigned"
            by_room.setdefault(room_name, []).append(p)
        return by_room

    def download_media(self, media_item: dict, output_dir: str | Path) -> Path:
        """Download a media file from its temporary download_uri.

        Args:
            media_item: Media dict from get_media() — must have download_uri
            output_dir: Directory to save the file

        Returns:
            Path to the downloaded file
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        download_url = media_item.get("download_uri") or media_item.get("download_url")
        if not download_url:
            raise ValueError(f"No download_uri in media item: {media_item.get('id', '?')}")

        # Build filename from media metadata
        media_id = (media_item.get("source") or {}).get("primary_id") or media_item.get("id", "unknown")
        filename = media_item.get("filename") or media_item.get("file_name")
        if not filename:
            ext = media_item.get("content_type", "").split("/")[-1] or "bin"
            filename = f"{media_id}.{ext}"

        # Sanitize filename
        filename = "".join(c if c.isalnum() or c in ".-_ " else "_" for c in filename)
        output_path = output_dir / filename

        if output_path.exists():
            print(f"  Already downloaded: {filename}")
            return output_path

        print(f"  Downloading: {filename}...")
        for attempt in range(MAX_RETRIES + 1):
            try:
                urllib.request.urlretrieve(download_url, str(output_path))
                size_mb = output_path.stat().st_size / (1024 * 1024)
                print(f"  Saved: {filename} ({size_mb:.1f} MB)")
                return output_path
            except Exception as e:
                if attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF * (2 ** attempt)
                    print(f"  Download error, retrying in {wait:.0f}s: {e}")
                    time.sleep(wait)
                    continue
                raise

    # ── Structures & Rooms ─────────────────────────────────────

    def get_structures(self, claim_id: str) -> list[dict]:
        """Get structures (buildings) for a claim."""
        return self._paginate(f"/property_claims/{claim_id}/structures")

    def get_rooms(self, claim_id: str, structure_id: str) -> list[dict]:
        """Get rooms for a specific structure."""
        return self._paginate(
            f"/property_claims/{claim_id}/structures/{structure_id}/rooms"
        )

    def get_all_rooms(self, claim_id: str) -> list[dict]:
        """Get all rooms across all structures for a claim."""
        structures = self.get_structures(claim_id)
        all_rooms = []
        for struct in structures:
            sid = struct.get("id")
            if sid:
                rooms = self.get_rooms(claim_id, sid)
                for room in rooms:
                    room["_structure_name"] = struct.get("name", "")
                all_rooms.extend(rooms)
        return all_rooms

    # ── Notes ───────────────────────────────────────────────────

    def get_claim_notes(self, claim_id: str) -> list[dict]:
        """Get all claim-level notes (scope notes, adjuster comments, etc.).

        Returns list of dicts with 'id', 'title', 'text', 'client_created',
        'server_created' fields.
        """
        data = self._request(f"/v2/property_claims/{claim_id}/notes")
        if isinstance(data, dict) and "list" in data:
            return data["list"]
        return data if isinstance(data, list) else []

    def get_room_notes(self, claim_id: str, structure_id: str,
                       room_id: str) -> list[dict]:
        """Get notes for a specific room (scope limits, special instructions).

        Returns list of dicts with 'id', 'title', 'text' fields.
        """
        data = self._request(
            f"/v2/property_claims/{claim_id}/structures/{structure_id}"
            f"/rooms/{room_id}/notes"
        )
        if isinstance(data, dict) and "list" in data:
            return data["list"]
        return data if isinstance(data, list) else []

    def get_room_text_notes(self, claim_id: str, structure_id: str,
                            room_id: str) -> list[dict]:
        """Get text notes for a specific room.

        Returns list of dicts with 'id', 'title', 'text' fields.
        """
        data = self._request(
            f"/v1/property_claims/{claim_id}/structures/{structure_id}"
            f"/rooms/{room_id}/text_notes"
        )
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "list" in data:
            return data["list"]
        return []

    def get_all_notes(self, claim_id: str) -> dict:
        """Get all notes for a claim: claim-level + per-room.

        Returns {
            'claim_notes': [...],
            'room_notes': {room_name: [...], ...}
        }
        """
        result = {
            "claim_notes": [],
            "room_notes": {},
        }

        # Claim-level notes
        try:
            result["claim_notes"] = self.get_claim_notes(claim_id)
        except EncircleAPIError:
            pass

        # Per-room notes
        structures = self.get_structures(claim_id)
        for struct in structures:
            sid = struct.get("id")
            if not sid:
                continue
            rooms = self.get_rooms(claim_id, sid)
            for room in rooms:
                rid = room.get("id")
                rname = room.get("name", f"room_{rid}")
                if not rid:
                    continue
                room_notes = []
                try:
                    room_notes.extend(self.get_room_notes(claim_id, sid, rid))
                except EncircleAPIError:
                    pass
                try:
                    room_notes.extend(self.get_room_text_notes(claim_id, sid, rid))
                except EncircleAPIError:
                    pass
                if room_notes:
                    result["room_notes"][rname] = room_notes

        return result

    # ── Convenience ────────────────────────────────────────────

    def print_claim_summary(self, claim: dict):
        """Print a formatted claim summary."""
        print(f"  Claim ID:      {claim.get('id', '?')}")
        print(f"  Policyholder:  {claim.get('policyholder_name', '?')}")
        print(f"  Address:       {claim.get('full_address') or claim.get('loss_address', '?')}")
        # Try multiple possible field names for claim number
        claim_num = (claim.get('insurer_identifier')
                     or claim.get('contractor_identifier')
                     or claim.get('assignment_identifier')
                     or claim.get('claim_number', '?'))
        print(f"  Claim #:       {claim_num}")
        tol = claim.get("type_of_loss")
        if tol:
            print(f"  Type of Loss:  {tol}")
        loss = claim.get("loss_details")
        if loss:
            print(f"  Loss Details:  {loss[:120]}")
        dol = claim.get("date_of_loss")
        if dol:
            print(f"  Date of Loss:  {dol}")
        adjuster = claim.get("adjuster_name")
        if adjuster:
            print(f"  Adjuster:      {adjuster}")
        pm = claim.get("project_manager_name")
        if pm:
            print(f"  Project Mgr:   {pm}")
        created = claim.get("created") or claim.get("created_at", "")
        if created:
            print(f"  Created:       {str(created)[:10]}")


# ── Standalone test ────────────────────────────────────────────
if __name__ == "__main__":
    client = EncircleClient()
    print("Encircle API Client — Connection Test\n")

    print("Fetching recent claims...")
    claims = client.list_claims(limit=10)
    print(f"Found {len(claims)} claims:\n")

    for c in claims[:10]:
        name = c.get("policyholder_name", "?")
        cid = c.get("id", "?")
        status = c.get("status", "?")
        print(f"  {name:<30} {status:<12} {cid}")
