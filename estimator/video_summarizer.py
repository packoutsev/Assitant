"""
Video Summarizer Module
Uses Claude to merge Whisper transcript + Gemini visual analysis into
final structured rooms JSON ready for generate_estimate.py.

Visual analysis is the PRIMARY source (TAG/box counts from Gemini).
Transcript is used for scope notes and overrides (e.g., "only pack under sink").

Includes Gemini-only fallback that converts visual analysis directly
to rooms JSON without Claude (uses classify_room for category mapping).

Usage:
    from video_summarizer import summarize, gemini_fallback

    result = summarize(transcript_text, visual_analysis_rooms)
    rooms_json = result.to_rooms_json()
"""

import os
import json
from pathlib import Path
from dataclasses import dataclass, field
from dotenv import load_dotenv

# Load API keys from estimator/.env
load_dotenv(Path(__file__).parent / '.env')

# Valid room categories from room_scope_lookup.json
VALID_CATEGORIES = [
    "kitchen", "living_room", "dining_room", "bedroom", "bedroom_primary",
    "bedroom_guest", "bedroom_kids", "bathroom", "closet", "office",
    "garage", "laundry", "hallway", "exterior", "basement", "other"
]


@dataclass
class SummaryRoom:
    """A room in the final summary."""
    room_name: str
    room_category: str
    density: str = "medium"
    override_tags: int = None
    override_boxes: int = None
    scope_notes: str = ""
    damage_indicators: list = field(default_factory=list)
    tag_items: list = field(default_factory=list)


@dataclass
class SummaryResult:
    """Complete summarization result."""
    rooms: list[SummaryRoom] = field(default_factory=list)
    total_tags: int = 0
    total_boxes: int = 0
    notes: str = ""
    model_used: str = ""
    error: str = ""

    @property
    def ok(self) -> bool:
        return not self.error and len(self.rooms) > 0

    def to_rooms_json(self) -> list[dict]:
        """Convert to the format expected by analyze_from_rooms_json()."""
        result = []
        for room in self.rooms:
            entry = {
                "room_name": room.room_name,
                "room_category": room.room_category,
                "density": room.density,
            }
            if room.override_tags is not None:
                entry["override_tags"] = room.override_tags
            if room.override_boxes is not None:
                entry["override_boxes"] = room.override_boxes
            result.append(entry)
        return result


CLAUDE_MERGE_PROMPT = """You are merging two data sources for a contents packout estimate:

1. **Visual Analysis** (from Gemini video analysis) — PRIMARY source for TAG/box counts
2. **Transcript** (from Whisper audio transcription) — used for scope notes and overrides

## YOUR TASK

Produce a final room-by-room JSON that will feed into our Xactimate estimate generator.

## RULES

1. **Visual analysis is authoritative** for TAG and box counts. Do NOT reduce counts based on transcript unless the tech explicitly says to skip a room or limit scope.
2. **Transcript overrides** apply ONLY for scope limitations like:
   - "only pack under sink" → reduce that room's boxes
   - "skip the garage" → remove garage from list
   - "don't pack this room" → remove room
   - "add 5 more boxes for the attic stuff" → increase count
3. **room_category** MUST be one of: {categories}
4. Use the most specific bedroom category when possible:
   - "Primary Bedroom" / "Master Bedroom" → bedroom_primary
   - "Guest Bedroom" / "Spare Room" → bedroom_guest
   - "Kids Room" / child's name → bedroom_kids
   - Generic "Bedroom" → bedroom
5. If visual analysis and transcript disagree on room count, trust visual analysis.

## VISUAL ANALYSIS DATA
{visual_data}

## TRANSCRIPT
{transcript}

## OUTPUT FORMAT

Return a JSON array. ONLY output valid JSON, no markdown or explanation:
[
  {{
    "room_name": "Kitchen",
    "room_category": "kitchen",
    "density": "light",
    "override_tags": 1,
    "override_boxes": 3,
    "scope_notes": "Only pack under sink per tech",
    "damage_indicators": ["water damage under sink"]
  }}
]

override_tags and override_boxes should reflect the final counts after considering both sources.
Include ALL rooms from the visual analysis unless the transcript explicitly says to skip them."""


def summarize(
    transcript_text: str,
    visual_analysis_rooms: list[dict],
    model: str = "claude-sonnet-4-5-20250929",
) -> SummaryResult:
    """
    Use Claude to merge transcript + visual analysis into final rooms JSON.

    Args:
        transcript_text: Full text from Whisper transcription
        visual_analysis_rooms: List of room dicts from Gemini analysis
        model: Claude model to use

    Returns:
        SummaryResult with merged room data
    """
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return SummaryResult(error="ANTHROPIC_API_KEY not set in environment or .env")

    client = anthropic.Anthropic(api_key=api_key)

    # Build prompt
    visual_json = json.dumps(visual_analysis_rooms, indent=2)
    transcript = transcript_text if transcript_text else "(No transcript available)"

    prompt = CLAUDE_MERGE_PROMPT.format(
        categories=", ".join(VALID_CATEGORIES),
        visual_data=visual_json,
        transcript=transcript,
    )

    print(f"  Merging with Claude ({model})...")

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            temperature=0.1,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as e:
        return SummaryResult(error=f"Claude API error: {e}")

    raw_text = response.content[0].text
    rooms = _parse_summary_response(raw_text)

    if not rooms:
        return SummaryResult(
            error=f"Failed to parse Claude response. Raw: {raw_text[:500]}",
            model_used=model,
        )

    # Build result
    summary_rooms = []
    total_tags = 0
    total_boxes = 0

    for room in rooms:
        tags = room.get("override_tags")
        boxes = room.get("override_boxes")
        total_tags += tags if tags is not None else 0
        total_boxes += boxes if boxes is not None else 0

        summary_rooms.append(SummaryRoom(
            room_name=room["room_name"],
            room_category=room.get("room_category", "other"),
            density=room.get("density", "medium"),
            override_tags=tags,
            override_boxes=boxes,
            scope_notes=room.get("scope_notes", ""),
            damage_indicators=room.get("damage_indicators", []),
            tag_items=room.get("tag_items", []),
        ))

    print(f"  Claude merge complete: {len(summary_rooms)} rooms, "
          f"{total_tags} TAGs, {total_boxes} boxes")

    return SummaryResult(
        rooms=summary_rooms,
        total_tags=total_tags,
        total_boxes=total_boxes,
        model_used=model,
    )


def gemini_fallback(visual_analysis_rooms: list[dict]) -> SummaryResult:
    """
    Convert Gemini visual analysis directly to rooms JSON without Claude.
    Used when Claude API is unavailable or --gemini-only mode.

    Uses classify_room() for consistent category mapping.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from build_visual_training import classify_room

    summary_rooms = []
    total_tags = 0
    total_boxes = 0

    for room in visual_analysis_rooms:
        # Use Gemini's category if valid, otherwise re-classify
        category = room.get("room_category", "")
        if category not in VALID_CATEGORIES:
            category = classify_room(room.get("room_name", "Unknown"))

        tags = room.get("estimated_tags", 0)
        boxes = room.get("estimated_boxes", 0)
        total_tags += tags
        total_boxes += boxes

        summary_rooms.append(SummaryRoom(
            room_name=room.get("room_name", "Unknown"),
            room_category=category,
            density=room.get("density", "medium"),
            override_tags=tags,
            override_boxes=boxes,
            scope_notes=room.get("scope_notes", ""),
            damage_indicators=room.get("damage_indicators", []),
            tag_items=room.get("tag_items", []),
        ))

    print(f"  Gemini fallback: {len(summary_rooms)} rooms, "
          f"{total_tags} TAGs, {total_boxes} boxes")

    return SummaryResult(
        rooms=summary_rooms,
        total_tags=total_tags,
        total_boxes=total_boxes,
        model_used="gemini-fallback",
    )


def _parse_summary_response(text: str) -> list[dict]:
    """Parse Claude's JSON response."""
    text = text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        rooms = json.loads(text)
    except json.JSONDecodeError:
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

    # Validate categories
    for room in rooms:
        if not isinstance(room, dict):
            continue
        cat = room.get("room_category", "other")
        if cat not in VALID_CATEGORIES:
            room["room_category"] = "other"

    return [r for r in rooms if isinstance(r, dict) and "room_name" in r]


if __name__ == "__main__":
    # Quick test with sample data
    sample_visual = [
        {
            "room_name": "Kitchen",
            "room_category": "kitchen",
            "density": "light",
            "estimated_tags": 1,
            "estimated_boxes": 3,
            "tag_items": ["small island"],
            "damage_indicators": ["water under sink"],
            "scope_notes": "",
        },
        {
            "room_name": "Living Room",
            "room_category": "living_room",
            "density": "heavy",
            "estimated_tags": 12,
            "estimated_boxes": 8,
            "tag_items": ["sectional", "coffee table", "TV", "4 chairs", "2 end tables", "bookshelf", "floor lamp"],
            "damage_indicators": [],
            "scope_notes": "",
        },
    ]

    sample_transcript = "Ok this is the kitchen, we're only going to pack under the sink. The living room needs full packout."

    # Test Gemini fallback (no API needed)
    print("=== GEMINI FALLBACK TEST ===")
    fb_result = gemini_fallback(sample_visual)
    print(json.dumps(fb_result.to_rooms_json(), indent=2))

    # Test Claude merge (needs API key)
    print("\n=== CLAUDE MERGE TEST ===")
    result = summarize(sample_transcript, sample_visual)
    if result.ok:
        print(json.dumps(result.to_rooms_json(), indent=2))
    else:
        print(f"Error: {result.error}")
