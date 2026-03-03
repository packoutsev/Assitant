"""
Encircle Pipeline — Claim Lookup -> Download Media -> Video Pipeline -> Estimate

Orchestrates the full flow from an Encircle claim to a 5-phase estimate:
  1. Find claim by name or ID
  2. Download videos and photos
  3. Fetch room structure for context
  4. Run video pipeline on the walkthrough video
  5. Output estimate CSV + summary

Usage:
    python encircle_pipeline.py --list-claims
    python encircle_pipeline.py --claim "Huttie"
    python encircle_pipeline.py --claim "Huttie" --show-media
    python encircle_pipeline.py --claim "Huttie" --download-only
    python encircle_pipeline.py --claim-id "abc-123" --photos-only
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from dataclasses import dataclass, field
from dotenv import load_dotenv

# Add estimator directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Load API keys
load_dotenv(Path(__file__).parent / '.env')

from encircle_client import EncircleClient, EncircleAPIError


@dataclass
class PipelineResult:
    """Result from the Encircle pipeline run."""
    claim: dict = field(default_factory=dict)
    claim_id: str = ""
    customer_name: str = ""

    # Media counts
    total_media: int = 0
    video_count: int = 0
    photo_count: int = 0

    # Downloaded paths
    video_paths: list = field(default_factory=list)
    photo_paths: list = field(default_factory=list)

    # Encircle room structure
    encircle_rooms: list = field(default_factory=list)

    # Video pipeline result (if run)
    video_result: object = None  # PipelineResult from video_pipeline
    estimate_result: dict = field(default_factory=dict)
    total_rcv: float = 0.0

    # Status
    error: str = ""

    @property
    def ok(self) -> bool:
        return not self.error


# Rooms that are post-packout operations, not initial walkthrough scope
# Rooms to ALWAYS exclude (not packout scope)
EXCLUDE_ROOMS_ALWAYS = {
    "packback", "pack back", "pack-back",
    "vaulting warehouse", "vaulting", "warehouse", "vault",
    "cleaning", "clean",
}

# Additional rooms to exclude from PHOTOS (not physical rooms to estimate)
EXCLUDE_ROOMS_PHOTOS = EXCLUDE_ROOMS_ALWAYS | {
    "room art", "progress photos", "policyholder photos",
    "total loss", "clothing count",
    "u-haul", "rental",
    "packout phase",
    "video tour", "video - walkthru", "video",
}


def _filter_walkthrough_media(media_items: list[dict],
                               is_video: bool = False) -> list[dict]:
    """Filter out media from non-scope rooms.

    For videos: minimal filter (just packback/vaulting/cleaning) — walkthrough
    videos may be in rooms named "Video Tour" etc. and should be kept.
    For photos: broader filter to exclude non-physical rooms.
    """
    exclude = EXCLUDE_ROOMS_ALWAYS if is_video else EXCLUDE_ROOMS_PHOTOS
    filtered = []
    for m in media_items:
        labels = m.get("labels") or []
        room_name = labels[1].lower().strip() if len(labels) >= 2 else ""
        if any(excl in room_name for excl in exclude):
            continue
        filtered.append(m)
    return filtered


def _detect_walkthrough_date(media_items: list[dict]) -> str | None:
    """Find the walkthrough date from the earliest media timestamp.

    Returns date string like '2025-10-27' or None.
    """
    dates = []
    for m in media_items:
        ts = m.get("primary_client_created") or m.get("primary_server_created") or ""
        if ts and len(ts) >= 10:
            dates.append(ts[:10])
    if not dates:
        return None
    return min(dates)


def _filter_by_date(media_items: list[dict], walkthrough_date: str,
                    window_days: int = 3) -> list[dict]:
    """Keep only media within window_days of the walkthrough date.

    Initial walkthrough photos are typically taken on the same day or within
    a couple days. Packout/cleaning/packback photos come weeks or months later.
    """
    from datetime import datetime, timedelta
    try:
        base = datetime.strptime(walkthrough_date, "%Y-%m-%d")
    except ValueError:
        return media_items

    cutoff = base + timedelta(days=window_days)
    filtered = []
    for m in media_items:
        ts = m.get("primary_client_created") or m.get("primary_server_created") or ""
        if not ts or len(ts) < 10:
            filtered.append(m)  # keep items without dates
            continue
        try:
            item_date = datetime.strptime(ts[:10], "%Y-%m-%d")
            if item_date <= cutoff:
                filtered.append(m)
        except ValueError:
            filtered.append(m)
    return filtered


def _extract_customer_name(claim: dict) -> str:
    """Extract a clean customer name from a claim dict."""
    name = claim.get("policyholder_name") or "Unknown"
    # Format as "Last_First" for filenames
    parts = name.strip().split()
    if len(parts) >= 2:
        return f"{parts[-1]}_{parts[0]}"
    return name.replace(" ", "_")


def run_encircle_pipeline(
    claim_name: str = None,
    claim_id: str = None,
    download_only: bool = False,
    photos_only: bool = False,
    show_media: bool = False,
    output_base: str | Path = None,
    drive_time_min: float = 25.0,
    storage_duration_months: int = 2,
    gemini_model: str = "gemini-2.5-pro",
    skip_whisper: bool = False,
    gemini_only: bool = False,
) -> PipelineResult:
    """Run the full Encircle-to-estimate pipeline.

    Args:
        claim_name: Policyholder name to search for (fuzzy match)
        claim_id: Exact claim ID (overrides claim_name)
        download_only: Download media without running estimate
        photos_only: Download only photos, skip videos
        show_media: List media items without downloading
        output_base: Base output directory (default: estimator/output/)
        drive_time_min: One-way drive time for cartage calc
        storage_duration_months: Storage months for estimate
        gemini_model: Gemini model for video analysis
        skip_whisper: Skip Whisper audio transcription
        gemini_only: Use Gemini only (no Whisper, no Claude merge)
    """
    result = PipelineResult()
    client = EncircleClient()

    # ── Step 1: Find claim ──────────────────────────────────
    print("\n=== Encircle Pipeline ===\n")

    if claim_id:
        print(f"Looking up claim ID: {claim_id}")
        try:
            claim = client.get_claim(claim_id)
        except EncircleAPIError as e:
            result.error = f"Claim not found: {e}"
            print(f"ERROR: {result.error}")
            return result
    elif claim_name:
        print(f"Searching for claim: '{claim_name}'")
        claim = client.find_claim_by_name(claim_name)
        if not claim:
            result.error = f"No claim found matching '{claim_name}'"
            print(f"ERROR: {result.error}")
            return result
    else:
        result.error = "Must provide --claim or --claim-id"
        print(f"ERROR: {result.error}")
        return result

    result.claim = claim
    result.claim_id = claim.get("id", "")
    result.customer_name = _extract_customer_name(claim)

    print(f"\nFound claim:")
    client.print_claim_summary(claim)

    # ── Step 2: List media ──────────────────────────────────
    print(f"\nFetching media for claim {result.claim_id}...")
    media = client.get_media(result.claim_id)
    videos = client.filter_videos(media)
    photos = client.filter_photos(media)

    result.total_media = len(media)
    result.video_count = len(videos)
    result.photo_count = len(photos)

    print(f"  Total media:  {len(media)}")
    print(f"  Videos:       {len(videos)}")
    print(f"  Photos:       {len(photos)}")

    # ── Step 2b: Filter to walkthrough media only ─────────
    # Room-name filter: skip post-packout rooms (packback, vaulting, cleaning)
    # Date filter: only for PHOTOS (not videos) — videos from walkthrough rooms
    # are always relevant regardless of upload date
    if not show_media:
        videos_before = len(videos)
        photos_before = len(photos)
        videos = _filter_walkthrough_media(videos, is_video=True)
        photos = _filter_walkthrough_media(photos, is_video=False)

        # Date filter photos only — packout/packback photos come weeks later
        # but walkthrough videos are always relevant if they're in scope rooms
        walkthrough_date = _detect_walkthrough_date(videos + photos)
        if walkthrough_date:
            photos = _filter_by_date(photos, walkthrough_date)
            print(f"  Walkthrough date: {walkthrough_date}")

        if videos_before != len(videos) or photos_before != len(photos):
            print(f"  After filtering: {len(videos)} videos, {len(photos)} photos "
                  f"(excluded {videos_before - len(videos)} videos, "
                  f"{photos_before - len(photos)} photos)")

    if show_media:
        _print_media_list(media)
        return result

    if not videos and not photos:
        result.error = "No videos or photos found for this claim"
        print(f"\nERROR: {result.error}")
        return result

    # ── Step 3: Set up output directory ─────────────────────
    if output_base:
        base_dir = Path(output_base)
    else:
        base_dir = Path(__file__).parent / "output"
    output_dir = base_dir / result.customer_name
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"\nOutput directory: {output_dir}")

    # ── Step 4: Download videos ─────────────────────────────
    if videos and not photos_only:
        video_dir = output_dir / "videos"
        print(f"\nDownloading {len(videos)} video(s)...")
        for v in videos:
            try:
                path = client.download_media(v, video_dir)
                result.video_paths.append(str(path))
            except Exception as e:
                print(f"  WARNING: Failed to download video: {e}")

    # ── Step 5: Download photos (grouped by room) ──────────
    photos_by_room = {}  # room_name -> list of local file paths
    if photos:
        photo_dir = output_dir / "photos"
        grouped = client.group_photos_by_room(photos)
        total_dl = 0
        print(f"\nDownloading {len(photos)} photo(s) across {len(grouped)} room(s)...")
        for room_name, room_photos in grouped.items():
            # Save to room-specific subdirectory
            room_dir = photo_dir / room_name.replace("/", "_").replace("\\", "_")
            room_paths = []
            for p in room_photos:
                try:
                    path = client.download_media(p, room_dir)
                    result.photo_paths.append(str(path))
                    room_paths.append(str(path))
                    total_dl += 1
                except Exception as e:
                    print(f"  WARNING: Failed to download photo: {e}")
            if room_paths:
                photos_by_room[room_name] = room_paths
        print(f"  Downloaded {total_dl} photo(s) in {len(photos_by_room)} room group(s)")

    # ── Step 6: Fetch room structure ────────────────────────
    print(f"\nFetching Encircle room structure...")
    try:
        rooms = client.get_all_rooms(result.claim_id)
        result.encircle_rooms = rooms
        print(f"  Found {len(rooms)} room(s)")
        for r in rooms:
            rname = r.get("name", "?")
            struct = r.get("_structure_name", "")
            print(f"    - {rname}" + (f" ({struct})" if struct else ""))
    except EncircleAPIError as e:
        print(f"  WARNING: Could not fetch rooms: {e}")

    # Save rooms JSON
    if result.encircle_rooms:
        rooms_path = output_dir / "encircle_rooms.json"
        with open(rooms_path, "w") as f:
            json.dump(result.encircle_rooms, f, indent=2, default=str)
        print(f"  Saved: {rooms_path}")

    # ── Step 6b: Fetch notes (claim-level + room-level) ───
    all_notes = {"claim_notes": [], "room_notes": {}}
    print(f"\nFetching notes...")
    try:
        all_notes = client.get_all_notes(result.claim_id)
        cn = len(all_notes["claim_notes"])
        rn = sum(len(v) for v in all_notes["room_notes"].values())
        print(f"  Claim notes: {cn}")
        print(f"  Room notes:  {rn} across {len(all_notes['room_notes'])} room(s)")
        for title_note in all_notes["claim_notes"]:
            title = title_note.get("title", "")
            text = (title_note.get("text") or "")[:100]
            print(f"    [{title}] {text}")
        for rname, rnotes in all_notes["room_notes"].items():
            for rn_item in rnotes:
                title = rn_item.get("title", "")
                text = (rn_item.get("text") or "")[:80]
                print(f"    {rname}: [{title}] {text}")
    except EncircleAPIError as e:
        print(f"  WARNING: Could not fetch notes: {e}")

    # Extract loss context from claim
    loss_details = claim.get("loss_details") or ""
    type_of_loss = claim.get("type_of_loss") or ""
    if loss_details or type_of_loss:
        print(f"  Loss type: {type_of_loss}")
        if loss_details:
            print(f"  Loss details: {loss_details[:150]}")

    # Save all notes
    if all_notes["claim_notes"] or all_notes["room_notes"]:
        notes_path = output_dir / "encircle_notes.json"
        with open(notes_path, "w") as f:
            json.dump(all_notes, f, indent=2, default=str)
        print(f"  Saved: {notes_path}")

    if download_only:
        print(f"\n=== Download Complete ===")
        print(f"  Videos: {len(result.video_paths)}")
        print(f"  Photos: {len(result.photo_paths)}")
        print(f"  Rooms:  {len(result.encircle_rooms)}")
        return result

    # ── Step 7: Process videos and/or photos into rooms ─────
    try:
        from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate

        merged = []

        # 7a: Video processing (if we have videos)
        if result.video_paths and not photos_only:
            from video_pipeline import run_pipeline

            all_rooms = []
            video_results = []

            sorted_paths = sorted(
                result.video_paths,
                key=lambda p: Path(p).stat().st_size,
                reverse=True,
            )

            for i, vpath in enumerate(sorted_paths, 1):
                vsize = Path(vpath).stat().st_size / (1024 * 1024)
                print(f"\n[Video {i}/{len(sorted_paths)}] {Path(vpath).name} ({vsize:.1f} MB)")

                vr = run_pipeline(
                    video_path=vpath,
                    customer_name=f"{result.customer_name}_v{i}",
                    skip_whisper=skip_whisper,
                    gemini_only=gemini_only,
                    gemini_model=gemini_model,
                    output_dir=str(output_dir),
                    save_intermediates=True,
                    drive_time_min=drive_time_min,
                    storage_duration_months=storage_duration_months,
                )
                video_results.append(vr)

                if vr.final_rooms_json:
                    print(f"  Rooms from this video: {len(vr.final_rooms_json)}")
                    all_rooms.extend(vr.final_rooms_json)
                elif vr.fatal_error:
                    print(f"  WARNING: Failed — {vr.fatal_error}")

            result.video_result = video_results

            if all_rooms:
                merged = _merge_rooms(all_rooms, encircle_rooms=result.encircle_rooms)
                print(f"\nMerged video rooms: {len(all_rooms)} raw -> {len(merged)} deduplicated")

        # 7b: Photo supplement — analyze room photos to refine box counts
        # Photos catch cabinet/drawer/closet contents that video walkthroughs miss
        if photos_by_room:
            print(f"\n--- Photo Supplement ({len(photos_by_room)} room groups) ---")
            if merged:
                # Supplement existing video-derived rooms with photo data
                merged = _supplement_rooms_with_photos(
                    merged, photos_by_room, gemini_model=gemini_model
                )
            else:
                # Photos-only mode: build rooms entirely from photos
                print(f"  Photos-only mode — building rooms from {len(photos_by_room)} photo groups")
                from build_visual_training import classify_room
                for room_name, photo_paths in photos_by_room.items():
                    if room_name == "_unassigned":
                        continue
                    print(f"  Analyzing: {room_name} ({len(photo_paths)} photos)...")
                    analysis = _analyze_room_photos(photo_paths, room_name, gemini_model)
                    if analysis:
                        cat = classify_room(room_name)
                        merged.append({
                            "room_name": room_name,
                            "room_category": cat,
                            "density": analysis.get("density", "medium"),
                            "override_tags": analysis.get("estimated_tags", 0),
                            "override_boxes": analysis.get("estimated_boxes", 0),
                        })
                        print(f"    {analysis.get('estimated_tags', 0)} TAGs, "
                              f"{analysis.get('estimated_boxes', 0)} boxes")

        # 7c: Inject Encircle notes into room data
        if merged and (all_notes["claim_notes"] or all_notes["room_notes"]):
            merged = _inject_notes_into_rooms(merged, all_notes, loss_details)

        # 7d: Backfill rooms from Encircle that video missed
        if merged and result.encircle_rooms:
            merged = _backfill_from_encircle(merged, result.encircle_rooms)

        # 7e: Apply lookup table floor (prevents video under-counting)
        if merged:
            merged = _apply_lookup_floor(merged)

        if not merged:
            result.error = "No rooms extracted from videos or photos"
            print(f"\nERROR: {result.error}")
        else:
            # Save final rooms JSON
            merged_path = output_dir / f"{result.customer_name}_rooms_merged.json"
            with open(merged_path, "w") as f:
                json.dump(merged, f, indent=2)
            print(f"  Saved: {merged_path}")

            # ── Step 8: Generate combined estimate ────────────
            print(f"\nGenerating combined 5-phase estimate...")
            walkthrough = analyze_from_rooms_json(merged)
            est = generate_5phase_estimate(
                walkthrough=walkthrough,
                drive_time_min=drive_time_min,
                storage_duration_months=storage_duration_months,
                customer_name=result.customer_name,
                apply_corrections=True,
                output_dir=str(output_dir),
            )
            result.estimate_result = est
            result.total_rcv = est["total_rcv"]

            print(f"\n=== Estimate Complete ===")
            print(f"  Customer:    {result.customer_name}")
            print(f"  Total RCV:   ${est['total_rcv']:,.2f}")
            print(f"  Rooms:       {est['rooms']}")
            print(f"  TAGs:        {est['tags']}")
            print(f"  Boxes:       {est['boxes']}")

    except Exception as e:
        result.error = f"Pipeline error: {e}"
        print(f"\nERROR: {result.error}")
        import traceback
        traceback.print_exc()

    # ── Summary ─────────────────────────────────────────────
    print(f"\n=== Pipeline Summary ===")
    print(f"  Claim:       {claim.get('policyholder_name', '?')}")
    print(f"  Media:       {result.total_media} total ({result.video_count} videos, {result.photo_count} photos)")
    print(f"  Downloaded:  {len(result.video_paths)} videos, {len(result.photo_paths)} photos")
    print(f"  Rooms:       {len(result.encircle_rooms)} (Encircle)")
    if result.total_rcv > 0:
        print(f"  Estimate:    ${result.total_rcv:,.2f} RCV")
    print(f"  Output:      {output_dir}")
    if result.error:
        print(f"  Error:       {result.error}")

    return result


PHOTO_ANALYSIS_PROMPT = """You are an expert contents packout estimator for 1-800-Packouts.

You are looking at photos of a room from an insurance contents packout job. These photos show the ACTUAL room contents that need to be packed out.

Your job: estimate the **TAG items** (large furniture) and **medium boxes** (15" x 15" x 15") needed to pack this room.

## DEFINITIONS

**TAG items** = Large furniture/items needing individual inventory tags and pad wrapping:
- Each piece of furniture is 1 TAG: couch, table, EACH chair, dresser, nightstand, bookshelf, desk, TV, mirror
- Bed frame + headboard = 1 TAG, mattress = 1 TAG (separate)
- Built-in cabinets and appliances are NOT TAGs (they stay — only their CONTENTS get packed)

**Boxes** = Medium boxes (15" x 15" x 15") for packing smaller items.
- A box must be filled to ~80% capacity to count as one box (high-density packing)
- Do NOT count one box per item — multiple small items share a box
- Think about how many 15x15x15 boxes you'd ACTUALLY fill, not how many items you see

## BOX ESTIMATION GUIDELINES (15x15x15 at 80% fill)

Kitchen:
- Upper cabinet section (~30" wide): plates/glasses/mugs pack into ~1-2 boxes
- Lower cabinet section (~30" wide): pots/pans/appliances ~1 box
- Utensil/junk drawer: ~1 box per 2-3 drawers
- Under sink: ~1 box
- Pantry shelf level: ~1 box per level
- Typical full kitchen total: 15-25 boxes

Living/Family Room:
- Bookshelf contents: ~1-2 boxes per shelf level
- Entertainment center contents (DVDs, games, remotes): ~1-3 boxes
- Coffee table / end table contents: ~1 box total
- Typical living room total: 3-10 boxes (most contents are TAGs, not boxes)

Bedroom:
- Dresser drawer contents: ~1 box per 2 drawers
- Nightstand contents: ~1 box per 2 nightstands
- Under-bed storage: ~1-2 boxes
- Typical bedroom total: 3-8 boxes

Closet:
- Hanging clothes: ~2-3 boxes per 4 linear feet (or wardrobe boxes)
- Shelf contents: ~1-2 boxes per shelf
- Shoe collection: ~1 box per 6-8 pairs
- Typical closet total: 5-15 boxes

Bathroom/Linen Closet:
- Cabinet contents: ~1-2 boxes
- Linen closet: ~2-4 boxes

## IMPORTANT

- Be CONSERVATIVE. It is better to slightly undercount than overcount.
- Only count contents that would ACTUALLY be packed into boxes — not the furniture itself.
- If cabinets/closets are CLOSED, assume moderately full but don't guess at maximum capacity.
- If photos show OPEN cabinets/drawers, count based on what you can actually see.

Respond with ONLY valid JSON (no markdown fences):
{
    "estimated_tags": <int>,
    "estimated_boxes": <int>,
    "tag_items": ["item1", "item2"],
    "density": "light|medium|heavy|very_heavy",
    "notes": "brief description of what you see"
}"""


def _analyze_room_photos(photo_paths: list[str], room_name: str,
                          gemini_model: str = "gemini-2.5-pro") -> dict | None:
    """Send room photos to Gemini for TAG/box count analysis.

    Returns dict with estimated_tags, estimated_boxes, density, notes
    or None on failure.
    """
    from google import genai

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print(f"    WARNING: No GOOGLE_API_KEY — skipping photo analysis")
        return None

    client = genai.Client(api_key=api_key)

    # Build content: photos + prompt
    contents = []
    for pp in photo_paths:
        p = Path(pp)
        if not p.exists():
            continue
        # Upload image file to Gemini
        try:
            uploaded = client.files.upload(file=str(p))
            contents.append(uploaded)
        except Exception as e:
            print(f"    WARNING: Could not upload {p.name}: {e}")

    if not contents:
        return None

    prompt = f"Room: {room_name}\n\n{PHOTO_ANALYSIS_PROMPT}"
    contents.append(prompt)

    try:
        response = client.models.generate_content(
            model=gemini_model,
            contents=contents,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.1,
            },
        )
        text = response.text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines).strip()
        result = json.loads(text)
        return result
    except Exception as e:
        print(f"    WARNING: Gemini photo analysis failed for {room_name}: {e}")
        return None


def _supplement_rooms_with_photos(
    rooms: list[dict],
    photos_by_room: dict[str, list[str]],
    gemini_model: str = "gemini-2.5-pro",
) -> list[dict]:
    """Supplement video-derived room data with photo-based box/TAG counts.

    For each room that has matching photos, runs Gemini photo analysis and
    takes the HIGHER box count (photos catch cabinets/drawers that video misses).
    TAG counts from video are generally trusted; photos can only increase them.

    Args:
        rooms: List of room dicts from video pipeline (with override_tags/boxes)
        photos_by_room: Dict mapping room_name -> list of photo file paths
        gemini_model: Gemini model for photo analysis

    Returns:
        Updated rooms list with photo-supplemented counts.
    """
    if not photos_by_room:
        return rooms

    # Build lookup: lowercase room name -> room dict
    room_lookup = {}
    for r in rooms:
        key = r.get("room_name", "").lower().strip()
        room_lookup[key] = r

    # Also try matching Encircle room names to video room names
    from build_visual_training import classify_room

    # Track which video rooms have already been matched by a photo group
    # to prevent multiple photo groups from supplementing the same room
    matched_room_keys = set()

    matched = 0
    for enc_room_name, photo_paths in photos_by_room.items():
        if enc_room_name == "_unassigned":
            continue

        # Try exact match first
        key = enc_room_name.lower().strip()
        target = room_lookup.get(key)
        target_key = key if target else None

        # Try substring/category matching if exact fails
        if not target:
            enc_cat = classify_room(enc_room_name)
            for rkey, rdict in room_lookup.items():
                # Skip rooms already matched by a previous photo group
                if rkey in matched_room_keys:
                    continue
                # Match by category
                if rdict.get("room_category") == enc_cat:
                    target = rdict
                    target_key = rkey
                    break
                # Match by substring
                if key in rkey or rkey in key:
                    target = rdict
                    target_key = rkey
                    break

        if not target:
            # Room in photos but not in video — add it as a new room
            print(f"  Photo room not in video: '{enc_room_name}' — analyzing as new room")
            analysis = _analyze_room_photos(photo_paths, enc_room_name, gemini_model)
            if analysis:
                cat = classify_room(enc_room_name)
                new_room = {
                    "room_name": enc_room_name,
                    "room_category": cat,
                    "density": analysis.get("density", "medium"),
                    "override_tags": analysis.get("estimated_tags", 0),
                    "override_boxes": analysis.get("estimated_boxes", 0),
                }
                rooms.append(new_room)
                room_lookup[key] = new_room
                matched += 1
                print(f"    Added: {analysis.get('estimated_tags', 0)} TAGs, "
                      f"{analysis.get('estimated_boxes', 0)} boxes")
            continue

        # Room exists in video data — supplement with photos
        # Mark this room as matched so other photo groups don't also supplement it
        if target_key:
            matched_room_keys.add(target_key)

        print(f"  Supplementing '{target['room_name']}' with {len(photo_paths)} photo(s)...")
        analysis = _analyze_room_photos(photo_paths, enc_room_name, gemini_model)
        if not analysis:
            continue

        matched += 1
        photo_tags = analysis.get("estimated_tags", 0)
        photo_boxes = analysis.get("estimated_boxes", 0)
        video_tags = target.get("override_tags") or 0
        video_boxes = target.get("override_boxes") or 0

        # Merge strategy: photos supplement video, but don't replace it entirely.
        # TAGs: video is generally reliable for furniture — take max but photos rarely add many.
        # Boxes: photos see inside cabinets/drawers that video misses, so they CAN add boxes.
        #   But cap the increase: if video saw the room, photo boxes shouldn't exceed
        #   video_boxes + photo_boxes (additive for hidden contents like cabinets),
        #   with a ceiling of 2x the video count (to prevent runaway over-counting).
        new_tags = max(video_tags, photo_tags)

        if video_boxes > 0:
            # Video saw this room — photo adds hidden contents (cabinets, drawers)
            # Use the higher of the two, but cap at 2x video count
            max_allowed = max(video_boxes * 2, video_boxes + 10)
            new_boxes = min(max(video_boxes, photo_boxes), max_allowed)
        else:
            # Video didn't count boxes for this room — trust photos
            new_boxes = photo_boxes

        if new_boxes > video_boxes or new_tags > video_tags:
            target["override_tags"] = new_tags
            target["override_boxes"] = new_boxes
            delta_tags = new_tags - video_tags
            delta_boxes = new_boxes - video_boxes
            print(f"    Updated: TAGs {video_tags}->{new_tags} (+{delta_tags}), "
                  f"boxes {video_boxes}->{new_boxes} (+{delta_boxes})")
        else:
            print(f"    No change (video counts already >= photo counts)")

    print(f"  Photo supplement: {matched} room(s) analyzed")
    return rooms


def _inject_notes_into_rooms(rooms: list[dict], all_notes: dict,
                             loss_details: str = "") -> list[dict]:
    """Inject Encircle notes into room data as scope_notes.

    Room-level notes (e.g. "only pack under sink", "skip built-in shelving")
    become scope_notes on the matching room. Claim-level notes and loss_details
    are added as context to all rooms.
    """
    from build_visual_training import classify_room

    # Build room lookup
    room_lookup = {}
    for r in rooms:
        key = r.get("room_name", "").lower().strip()
        room_lookup[key] = r

    # Inject room-level notes
    matched = 0
    for enc_room_name, notes in all_notes.get("room_notes", {}).items():
        key = enc_room_name.lower().strip()
        target = room_lookup.get(key)

        # Fuzzy match by category if exact miss
        if not target:
            enc_cat = classify_room(enc_room_name)
            for rkey, rdict in room_lookup.items():
                if rdict.get("room_category") == enc_cat:
                    target = rdict
                    break
                if key in rkey or rkey in key:
                    target = rdict
                    break

        if target:
            note_texts = []
            for n in notes:
                title = n.get("title", "")
                text = n.get("text", "")
                if title and text:
                    note_texts.append(f"{title}: {text}")
                elif text:
                    note_texts.append(text)
                elif title:
                    note_texts.append(title)

            if note_texts:
                existing = target.get("scope_notes", "")
                combined = "; ".join(note_texts)
                target["scope_notes"] = f"{existing}; {combined}" if existing else combined
                matched += 1

    # Add claim-level context as a note on all rooms if relevant
    # (loss_details often has scope info like "pack entire home" or "upstairs only")
    claim_scope = []
    for cn in all_notes.get("claim_notes", []):
        title = cn.get("title", "")
        text = cn.get("text", "")
        if title or text:
            claim_scope.append(f"{title}: {text}" if title and text else (text or title))
    if loss_details:
        claim_scope.append(f"Loss details: {loss_details}")

    if claim_scope:
        claim_context = "; ".join(claim_scope)
        for r in rooms:
            existing = r.get("claim_context", "")
            r["claim_context"] = f"{existing}; {claim_context}" if existing else claim_context

    if matched or claim_scope:
        print(f"  Notes injected: {matched} room-level, "
              f"{len(claim_scope)} claim-level entries")

    return rooms


def _merge_rooms(all_rooms: list[dict], encircle_rooms: list[dict] = None) -> list[dict]:
    """Merge rooms from multiple videos using two-pass deduplication.

    Pass 1: Exact name dedup (same room name across videos → keep best).
    Pass 2: Category-based dedup constrained by Encircle room structure.
            When Encircle says there are 2 bedrooms, keep at most 2 bedroom
            rooms from video analysis, dropping the lower-count duplicates.

    This prevents N overlapping walkthrough videos from creating N copies
    of each room with slightly different names.
    """
    from build_visual_training import classify_room

    if not all_rooms:
        return []

    # ── Pass 1: Exact name dedup (original logic) ──
    by_name = {}
    for room in all_rooms:
        name = room.get("room_name", "Unknown")
        key = name.lower().strip()

        if key not in by_name:
            by_name[key] = room
            continue

        existing = by_name[key]
        new_has_overrides = (
            room.get("override_tags") is not None
            or room.get("override_boxes") is not None
        )
        old_has_overrides = (
            existing.get("override_tags") is not None
            or existing.get("override_boxes") is not None
        )

        if new_has_overrides and not old_has_overrides:
            by_name[key] = room
        elif new_has_overrides and old_has_overrides:
            new_tags = room.get("override_tags") or 0
            old_tags = existing.get("override_tags") or 0
            if new_tags > old_tags:
                by_name[key] = room

    name_deduped = list(by_name.values())
    print(f"  Name dedup: {len(all_rooms)} raw -> {len(name_deduped)} unique names")

    # ── Pass 2: Category-based dedup ──
    # Always reclassify rooms for consistency (video pipeline may use different categories)
    for room in name_deduped:
        room["room_category"] = classify_room(room.get("room_name", "Unknown"))

    # Count Encircle rooms per category (excluding utility/process rooms)
    ENCIRCLE_SKIP = {
        "warehouse", "vault", "vaulting warehouse", "pack back", "packback",
        "cleaning", "progress photos", "room art", "video - walkthru",
        "video", "total loss", "policyholder photos",
    }

    encircle_cat_counts = {}
    if encircle_rooms:
        for er in encircle_rooms:
            ename = er.get("name", "")
            elow = ename.lower().strip()
            if elow in ENCIRCLE_SKIP:
                continue
            if any(kw in elow for kw in [
                "packback", "pack back", "vaulting", "warehouse",
                "progress photo", "room art", "total loss",
                "cleaning", "policyholder",
            ]):
                continue
            cat = classify_room(ename)
            encircle_cat_counts[cat] = encircle_cat_counts.get(cat, 0) + 1

        print(f"  Encircle room categories: {dict(encircle_cat_counts)}")

    # Group video rooms by category
    by_category = {}
    for room in name_deduped:
        cat = room["room_category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(room)

    # For each category, keep up to N rooms (N = Encircle count, default 1)
    result = []
    for cat, rooms_in_cat in by_category.items():
        if encircle_rooms:
            max_rooms = encircle_cat_counts.get(cat, 1)
        else:
            # No Encircle data — no cap
            max_rooms = len(rooms_in_cat)

        # Sort by total items (TAGs + boxes) descending — keep the richest
        rooms_sorted = sorted(
            rooms_in_cat,
            key=lambda r: (r.get("override_tags") or 0) + (r.get("override_boxes") or 0),
            reverse=True,
        )

        kept = rooms_sorted[:max_rooms]
        dropped = len(rooms_in_cat) - len(kept)
        if dropped > 0:
            kept_names = [r.get("room_name", "?") for r in kept]
            dropped_names = [r.get("room_name", "?") for r in rooms_sorted[max_rooms:]]
            print(f"  Category '{cat}': kept {len(kept)}/{len(rooms_in_cat)} "
                  f"(Encircle: {max_rooms}) — kept: {kept_names}, dropped: {dropped_names}")
        result.extend(kept)

    return result


def _apply_lookup_floor(rooms: list[dict], bump_density: bool = False,
                        blend_factor: float = 1.0) -> list[dict]:
    """Apply lookup table floor to prevent video under-counting.

    Video analysis consistently under-counts TAGs/boxes (misses items in cabinets,
    drawers, closets). The lookup table is calibrated from Diana's actual estimates.

    Args:
        rooms: List of room dicts with override_tags/override_boxes.
        bump_density: Use one tier higher density for lookup (aggressive).
        blend_factor: How much of the gap to close (0.0=no floor, 0.5=halfway,
                     1.0=full max). Backfilled rooms (no video data) always
                     get full lookup regardless of blend_factor.
    """
    DENSITY_BUMP = {
        'light': 'medium',
        'medium': 'heavy',
        'heavy': 'very_heavy',
        'very_heavy': 'very_heavy',
    }

    lookup_path = Path(__file__).parent / 'data' / 'room_scope_lookup.json'
    with open(lookup_path) as f:
        lookup_data = json.load(f)['room_types']

    adjustments = 0
    for room in rooms:
        category = room.get('room_category', 'other')
        density = room.get('density', 'medium')
        floor_density = DENSITY_BUMP.get(density, density) if bump_density else density

        room_lookup = lookup_data.get(category, lookup_data.get('other', {}))
        lookup_tags = room_lookup.get('typical_tags', {}).get(floor_density, 0)
        lookup_boxes = room_lookup.get('typical_boxes', {}).get(floor_density, 0)

        video_tags = room.get('override_tags') or 0
        video_boxes = room.get('override_boxes') or 0

        # Backfilled rooms (no override) get full lookup; video rooms get blended
        is_backfill = room.get('override_tags') is None and room.get('override_boxes') is None
        bf = 1.0 if is_backfill else blend_factor

        if bf >= 1.0:
            new_tags = max(video_tags, lookup_tags)
            new_boxes = max(video_boxes, lookup_boxes)
        else:
            # Blend: close bf% of the gap between video and lookup
            gap_tags = max(0, lookup_tags - video_tags)
            gap_boxes = max(0, lookup_boxes - video_boxes)
            new_tags = round(video_tags + gap_tags * bf)
            new_boxes = round(video_boxes + gap_boxes * bf)

        if new_tags != video_tags or new_boxes != video_boxes:
            adjustments += 1
            label = "Backfill" if is_backfill else "Floor"
            print(f"    {label}: {room.get('room_name', '?')} ({category}/{density}) "
                  f"TAGs {video_tags}->{new_tags}, Boxes {video_boxes}->{new_boxes}")

        room['override_tags'] = new_tags
        room['override_boxes'] = new_boxes

    if adjustments:
        total_tags = sum(r.get('override_tags', 0) for r in rooms)
        total_boxes = sum(r.get('override_boxes', 0) for r in rooms)
        print(f"  Lookup floor: adjusted {adjustments}/{len(rooms)} rooms "
              f"-> {total_tags} TAGs, {total_boxes} boxes")

    return rooms


def _backfill_from_encircle(rooms: list[dict], encircle_rooms: list[dict]) -> list[dict]:
    """Add rooms from Encircle structure that the video walkthrough missed.

    For each Encircle room category, if the video detected fewer rooms than
    Encircle has, add the missing rooms with 'medium' density lookup defaults.
    This ensures every packable room in the claim gets estimated.
    """
    from build_visual_training import classify_room

    if not encircle_rooms:
        return rooms

    # Skip utility/process rooms
    SKIP_KEYWORDS = [
        "packback", "pack back", "vaulting", "warehouse",
        "progress photo", "room art", "total loss",
        "cleaning", "policyholder", "video",
    ]

    # Count video rooms by category
    video_cats = {}
    for r in rooms:
        cat = r.get('room_category', 'other')
        video_cats[cat] = video_cats.get(cat, 0) + 1

    # Count Encircle rooms by category, keeping names for backfill
    encircle_by_cat = {}
    for er in encircle_rooms:
        ename = er.get("name", "")
        elow = ename.lower().strip()
        if any(kw in elow for kw in SKIP_KEYWORDS):
            continue
        cat = classify_room(ename)
        if cat == 'exterior':
            continue  # Skip exterior — not part of interior packout
        if cat not in encircle_by_cat:
            encircle_by_cat[cat] = []
        encircle_by_cat[cat].append(ename)

    # For each category, if video has fewer rooms than Encircle, backfill
    backfilled = 0
    for cat, encircle_names in encircle_by_cat.items():
        video_count = video_cats.get(cat, 0)
        encircle_count = len(encircle_names)
        missing = encircle_count - video_count

        if missing > 0:
            # Add 'missing' rooms at medium density (no video data, use lookup defaults)
            for i in range(missing):
                room_name = encircle_names[video_count + i] if (video_count + i) < len(encircle_names) else f"{cat.replace('_', ' ').title()} {video_count + i + 1}"
                rooms.append({
                    "room_name": room_name,
                    "room_category": cat,
                    "density": "medium",
                    # No override_tags/override_boxes → lookup table will fill in via _apply_lookup_floor
                })
                backfilled += 1
                print(f"    Backfill: {room_name} ({cat}/medium) — not seen in video")

    if backfilled:
        print(f"  Backfilled {backfilled} room(s) from Encircle structure")

    return rooms


def _print_media_list(media: list[dict]):
    """Print a formatted list of media items."""
    print(f"\n--- Media Items ({len(media)}) ---")
    for i, m in enumerate(media, 1):
        source = m.get("source") or {}
        source_type = source.get("type", "?")
        filename = m.get("filename") or m.get("file_name") or "?"
        media_id = source.get("primary_id", "?")
        labels = m.get("labels") or []
        content_type = m.get("content_type", "")

        print(f"  {i:3}. [{source_type:<30}] {filename}")
        if labels:
            print(f"       Labels: {', '.join(labels)}")
        creator = m.get("creator") or {}
        if creator:
            cname = creator.get("actor_identifier", "")
            if cname:
                print(f"       Creator: {cname}")
        print(f"       ID: {media_id}  Type: {content_type}")


def list_claims_command(client: EncircleClient, limit: int = 20):
    """List recent claims."""
    print("Fetching recent claims...\n")
    claims = client.list_claims(limit=limit)
    print(f"  {'Policyholder':<25} {'Loss Type':<20} {'Date':<12} {'Address':<35} {'ID'}")
    print("  " + "-" * 105)
    for c in claims:
        name = c.get("policyholder_name") or "?"
        tol = (c.get("type_of_loss") or "").replace("type_of_loss_", "")
        created = c.get("date_claim_created") or ""
        address = (c.get("full_address") or "")[:33]
        cid = c.get("id", "?")
        print(f"  {name:<25} {tol:<20} {created:<12} {address:<35} {cid}")
    print(f"\n{len(claims)} claim(s) found")


def main():
    parser = argparse.ArgumentParser(
        description="Encircle Pipeline — Claim to 5-Phase Estimate"
    )

    # Claim selection
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--claim", type=str, help="Policyholder name to search for")
    group.add_argument("--claim-id", type=str, help="Exact Encircle claim ID")
    group.add_argument("--list-claims", action="store_true", help="List recent claims")

    # Mode flags
    parser.add_argument("--show-media", action="store_true", help="List media without downloading")
    parser.add_argument("--download-only", action="store_true", help="Download media without running estimate")
    parser.add_argument("--photos-only", action="store_true", help="Download photos only")

    # Pipeline options
    parser.add_argument("--drive-time", type=float, default=25.0, help="One-way drive time in minutes")
    parser.add_argument("--storage-months", type=int, default=2, help="Storage duration in months")
    parser.add_argument("--gemini-model", type=str, default="gemini-2.5-pro", help="Gemini model")
    parser.add_argument("--skip-whisper", action="store_true", help="Skip Whisper transcription")
    parser.add_argument("--gemini-only", action="store_true", help="Gemini only (no Whisper/Claude)")
    parser.add_argument("--output-dir", type=str, default=None, help="Output base directory")

    args = parser.parse_args()

    try:
        client = EncircleClient()
    except ValueError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    # List claims mode
    if args.list_claims:
        list_claims_command(client)
        return

    # Require claim selection for other modes
    if not args.claim and not args.claim_id:
        parser.print_help()
        print("\nERROR: Provide --claim, --claim-id, or --list-claims")
        sys.exit(1)

    # Run pipeline
    result = run_encircle_pipeline(
        claim_name=args.claim,
        claim_id=args.claim_id,
        download_only=args.download_only,
        photos_only=args.photos_only,
        show_media=args.show_media,
        output_base=args.output_dir,
        drive_time_min=args.drive_time,
        storage_duration_months=args.storage_months,
        gemini_model=args.gemini_model,
        skip_whisper=args.skip_whisper,
        gemini_only=args.gemini_only,
    )

    sys.exit(0 if result.ok else 1)


if __name__ == "__main__":
    main()
