"""
Gemini Video Analyzer Module
Uploads walkthrough video to Gemini Files API and analyzes room-by-room contents.

This is the most critical module — Gemini's visual analysis directly drives
TAG/box counts and estimate accuracy. The prompt is calibrated against real
Huttie and Schafer job data.

Uses google-genai (new unified SDK), NOT the older google-generativeai.

Usage:
    from gemini_video_analyzer import analyze_video

    result = analyze_video("walkthrough.mp4")
    for room in result.rooms:
        print(f"{room['room_name']}: {room['estimated_tags']} TAGs, {room['estimated_boxes']} boxes")
"""

import os
import json
import time
from pathlib import Path
from dataclasses import dataclass, field
from dotenv import load_dotenv

# Load API keys from estimator/.env
load_dotenv(Path(__file__).parent / '.env')


@dataclass
class VideoAnalysisResult:
    """Complete video analysis result."""
    rooms: list[dict] = field(default_factory=list)
    total_tags: int = 0
    total_boxes: int = 0
    total_rooms: int = 0
    raw_response: str = ""
    model_used: str = ""
    processing_time_seconds: float = 0.0
    error: str = ""

    @property
    def ok(self) -> bool:
        return not self.error and len(self.rooms) > 0


# Valid room categories matching room_scope_lookup.json
VALID_ROOM_CATEGORIES = [
    "kitchen", "living_room", "dining_room", "bedroom", "bedroom_primary",
    "bedroom_guest", "bedroom_kids", "bathroom", "closet", "office",
    "garage", "laundry", "hallway", "exterior", "basement", "other"
]

# The calibration prompt — this is the core of accuracy
GEMINI_ANALYSIS_PROMPT = """You are an expert contents packout estimator for 1-800-Packouts, a contents restoration company.

You are watching a walkthrough video of a home that needs a full contents packout. Your job is to identify every room visited and estimate the TAG items and box counts for each room.

## DEFINITIONS

**TAG items** = Large furniture/items that need individual inventory tags and pad wrapping:
- Each piece of furniture is 1 TAG: couch=1, sectional=1, table=1, EACH chair=1
- Bed frame + headboard = 1 TAG, mattress = 1 TAG (separate)
- Each dresser, nightstand, bookshelf, desk, TV, mirror = 1 TAG
- Each shelving unit = 1 TAG
- Exercise equipment, large lamps, large artwork = 1 TAG each
- Built-in cabinets and appliances are NOT TAGs

**Boxes** = Medium boxes (18x18x16") needed to pack all smaller items:
- Kitchen cabinets full of dishes/pots: ~4-6 boxes per section of cabinets
- Full bookshelf: ~2-3 boxes per shelf level
- Closet rod of hanging clothes: ~3-5 boxes (or wardrobe boxes)
- Bathroom cabinet contents: ~1-2 boxes
- Desk drawers/supplies: ~2-3 boxes
- Drawer contents (per dresser): ~2-4 boxes
- Pantry shelves: ~2-4 boxes per section

## DENSITY LEVELS

- **light**: Minimal furniture, mostly empty, few items in cabinets
- **medium**: Normal furnishings, cabinets/shelves moderately full
- **heavy**: Very full room, lots of furniture, packed shelves, full closets
- **very_heavy**: Extremely packed, hoarding-adjacent, multiple shelving units stacked full

## CALIBRATION FROM REAL JOBS

These are actual counts from real packout estimates. Use them to calibrate your estimates:

**Huttie job (10 rooms, luxury home, $19,736 RCV):**
- Kitchen (light): 1 TAG, 1 box
- Living Room + Formal Dining (heavy): 13 TAGs, 8 boxes
- Dining Room (heavy): 8 TAGs (table + 6 chairs + hutch), 2 boxes
- Primary Bedroom (heavy): 14 TAGs, 12 boxes, 21 pads
- Bedroom 1 / Guest (heavy): 9 TAGs, 20 boxes
- Bedroom 2 (very_heavy, massive shelving): 24 TAGs, 33 boxes
- Primary Closet (heavy): 2 TAGs, 33 boxes (clothing/shoes)
- Primary Bathroom (medium): 0 TAGs, 2 boxes
- Entry/Hallway (medium): 3 TAGs, 3 boxes
- Sitting Area (medium): 6 TAGs, 7 boxes

**Schafer job (8 rooms, standard home):**
- Living Room (very_heavy): 22 TAGs, 54 boxes (sectional, daybed, cube storage, extensive wall art)
- Kitchen (light, under-sink only): 0 TAGs, 2 boxes

## ROOM CATEGORIES

Use EXACTLY one of these categories for each room:
kitchen, living_room, dining_room, bedroom, bedroom_primary, bedroom_guest, bedroom_kids, bathroom, closet, office, garage, laundry, hallway, exterior, basement, other

## YOUR TASK

Watch the entire walkthrough video and identify EVERY room visited. For each room provide:

1. **room_name**: Descriptive name (e.g., "Primary Bedroom", "Guest Bathroom", "Kitchen")
2. **room_category**: One of the valid categories above
3. **density**: light, medium, heavy, or very_heavy
4. **estimated_tags**: Count of TAG items visible (use calibration above as reference)
5. **estimated_boxes**: Count of medium boxes needed (use calibration above as reference)
6. **tag_items**: List of specific TAG items you can see (e.g., ["sectional sofa", "coffee table", "TV", "2 end tables"])
7. **damage_indicators**: Any visible damage (water stains, soot, mold, etc.)
8. **scope_notes**: Any relevant notes (e.g., "only pack under sink", "skip built-in shelving", "pack entire room")

## IMPORTANT RULES

- Count EVERY piece of furniture as a separate TAG. 6 dining chairs = 6 TAGs.
- Closets are box-heavy, TAG-light (mainly shelving units).
- Kitchens with only cabinet contents = mostly boxes, few/no TAGs.
- If a tech mentions scope limitations (e.g., "only pack under sink"), note them.
- If you see the same room from multiple angles, combine into one entry.
- Bedrooms with lots of shelving/storage can be very_heavy (24+ TAGs, 30+ boxes).
- Primary closets are often the highest box-count room (30+ boxes for full walk-in).

Respond with a JSON array of room objects. ONLY output valid JSON, no markdown fences or explanation:
[
  {
    "room_name": "Kitchen",
    "room_category": "kitchen",
    "density": "light",
    "estimated_tags": 1,
    "estimated_boxes": 3,
    "tag_items": ["small table"],
    "damage_indicators": ["water staining on ceiling"],
    "scope_notes": "Only pack under sink per adjuster"
  }
]"""


def _upload_and_wait(client, video_path: Path, timeout: int = 300) -> object:
    """Upload video to Gemini Files API and wait until processing completes."""
    print(f"  Uploading video to Gemini ({video_path.stat().st_size / (1024*1024):.0f} MB)...")

    video_file = client.files.upload(file=str(video_path))
    print(f"  Upload complete. File: {video_file.name}, state: {video_file.state}")

    # Poll until processing is done
    start = time.time()
    while video_file.state.name == "PROCESSING":
        elapsed = time.time() - start
        if elapsed > timeout:
            raise TimeoutError(f"Gemini file processing exceeded {timeout}s timeout")
        print(f"  Processing... ({elapsed:.0f}s elapsed)")
        time.sleep(10)
        video_file = client.files.get(name=video_file.name)

    if video_file.state.name == "FAILED":
        raise RuntimeError(f"Gemini file processing failed: {video_file.state}")

    print(f"  File ready (state: {video_file.state.name})")
    return video_file


def _parse_rooms_response(text: str) -> list[dict]:
    """Parse Gemini's JSON response, handling common formatting issues."""
    text = text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```) and last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        rooms = json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON array in the text
        start = text.find("[")
        end = text.rfind("]")
        if start >= 0 and end > start:
            try:
                rooms = json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return []
        else:
            return []

    if not isinstance(rooms, list):
        return []

    # Validate and clean each room
    cleaned = []
    for room in rooms:
        if not isinstance(room, dict):
            continue
        # Ensure required fields
        if "room_name" not in room:
            continue
        # Normalize room_category
        cat = room.get("room_category", "other")
        if cat not in VALID_ROOM_CATEGORIES:
            room["room_category"] = "other"
        # Ensure numeric fields
        room["estimated_tags"] = int(room.get("estimated_tags", 0))
        room["estimated_boxes"] = int(room.get("estimated_boxes", 0))
        # Default missing fields
        room.setdefault("density", "medium")
        room.setdefault("tag_items", [])
        room.setdefault("damage_indicators", [])
        room.setdefault("scope_notes", "")
        cleaned.append(room)

    return cleaned


def analyze_video(
    video_path: str | Path,
    model: str = "gemini-2.5-pro",
    timeout: int = 300,
) -> VideoAnalysisResult:
    """
    Analyze a walkthrough video using Gemini's visual understanding.

    Args:
        video_path: Path to the video file
        model: Gemini model to use (gemini-2.0-flash recommended for cost/speed)
        timeout: Max seconds to wait for file processing

    Returns:
        VideoAnalysisResult with room-by-room analysis
    """
    from google import genai

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return VideoAnalysisResult(error="GOOGLE_API_KEY not set in environment or .env")

    video_path = Path(video_path)
    if not video_path.exists():
        return VideoAnalysisResult(error=f"Video not found: {video_path}")

    client = genai.Client(api_key=api_key)
    start_time = time.time()

    try:
        # Upload video
        video_file = _upload_and_wait(client, video_path, timeout=timeout)

        # Generate analysis
        print(f"  Analyzing with {model}...")
        response = client.models.generate_content(
            model=model,
            contents=[video_file, GEMINI_ANALYSIS_PROMPT],
            config={
                "response_mime_type": "application/json",
                "temperature": 0.1,  # Low temperature for consistent counting
            },
        )

        raw_text = response.text
        rooms = _parse_rooms_response(raw_text)

        if not rooms:
            return VideoAnalysisResult(
                raw_response=raw_text,
                model_used=model,
                processing_time_seconds=time.time() - start_time,
                error=f"Failed to parse rooms from Gemini response. Raw: {raw_text[:500]}",
            )

        total_tags = sum(r.get("estimated_tags", 0) for r in rooms)
        total_boxes = sum(r.get("estimated_boxes", 0) for r in rooms)
        elapsed = time.time() - start_time

        print(f"  Gemini analysis complete: {len(rooms)} rooms, "
              f"{total_tags} TAGs, {total_boxes} boxes ({elapsed:.0f}s)")

        return VideoAnalysisResult(
            rooms=rooms,
            total_tags=total_tags,
            total_boxes=total_boxes,
            total_rooms=len(rooms),
            raw_response=raw_text,
            model_used=model,
            processing_time_seconds=elapsed,
        )

    except TimeoutError as e:
        return VideoAnalysisResult(
            error=str(e),
            processing_time_seconds=time.time() - start_time,
        )
    except Exception as e:
        return VideoAnalysisResult(
            error=f"Gemini analysis failed: {type(e).__name__}: {e}",
            processing_time_seconds=time.time() - start_time,
        )
    finally:
        # Clean up uploaded file
        try:
            client.files.delete(name=video_file.name)
            print(f"  Cleaned up uploaded file: {video_file.name}")
        except Exception:
            pass


def analyze_video_chunked(
    video_path: str | Path,
    chunk_minutes: int = 10,
    model: str = "gemini-2.5-pro",
) -> VideoAnalysisResult:
    """
    Fallback: split video into chunks and analyze each separately.
    Used if direct upload fails (e.g., file too large for API).

    This is slower and less accurate (may duplicate rooms across chunks)
    but handles edge cases.
    """
    import subprocess
    import shutil
    from audio_extractor import _find_ffmpeg, get_duration

    video_path = Path(video_path)
    total_duration = get_duration(video_path)
    chunk_dur = chunk_minutes * 60

    if total_duration <= chunk_dur:
        return analyze_video(video_path, model=model)

    ffmpeg = _find_ffmpeg()
    temp_dir = video_path.parent / f"_temp_chunks_{video_path.stem}"
    temp_dir.mkdir(exist_ok=True)

    all_rooms = []
    start = 0.0
    idx = 0

    try:
        while start < total_duration:
            dur = min(chunk_dur, total_duration - start)
            chunk_path = temp_dir / f"chunk_{idx:03d}{video_path.suffix}"

            cmd = [
                ffmpeg, "-ss", str(start), "-t", str(dur),
                "-i", str(video_path), "-c", "copy", "-y", str(chunk_path)
            ]
            subprocess.run(cmd, capture_output=True, timeout=120, check=True)

            print(f"  Analyzing chunk {idx} ({start:.0f}s - {start+dur:.0f}s)...")
            result = analyze_video(chunk_path, model=model)
            if result.ok:
                all_rooms.extend(result.rooms)

            start += dur
            idx += 1

        # Deduplicate rooms by name (take the one with higher counts)
        seen = {}
        for room in all_rooms:
            name = room["room_name"].lower().strip()
            if name not in seen:
                seen[name] = room
            else:
                existing = seen[name]
                if (room["estimated_tags"] + room["estimated_boxes"] >
                        existing["estimated_tags"] + existing["estimated_boxes"]):
                    seen[name] = room

        deduped = list(seen.values())
        total_tags = sum(r["estimated_tags"] for r in deduped)
        total_boxes = sum(r["estimated_boxes"] for r in deduped)

        return VideoAnalysisResult(
            rooms=deduped,
            total_tags=total_tags,
            total_boxes=total_boxes,
            total_rooms=len(deduped),
            model_used=model,
        )

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python gemini_video_analyzer.py <video_path>")
        sys.exit(1)

    video = Path(sys.argv[1])
    result = analyze_video(video)

    if result.ok:
        print(f"\n=== VIDEO ANALYSIS: {len(result.rooms)} rooms ===")
        for room in result.rooms:
            print(f"  {room['room_name']:<25} "
                  f"TAGs: {room['estimated_tags']:>3}  "
                  f"Boxes: {room['estimated_boxes']:>3}  "
                  f"({room['density']})")
            if room.get('tag_items'):
                print(f"    TAG items: {', '.join(room['tag_items'][:5])}")
            if room.get('scope_notes'):
                print(f"    Scope: {room['scope_notes']}")
        print(f"\n  TOTALS: {result.total_tags} TAGs, {result.total_boxes} boxes")
        print(f"  Time: {result.processing_time_seconds:.0f}s")
    else:
        print(f"Error: {result.error}")
