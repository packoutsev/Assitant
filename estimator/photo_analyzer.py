"""
Deliverable 6a: Photo Analyzer Module
Analyzes walk-through photos using Claude's vision API to identify:
- Room type
- Contents density (light/medium/heavy)
- Estimated TAG items (large furniture needing individual tags)
- Estimated box count (how many medium boxes of smaller items)
- Contents types visible
- Special items (fragile, oversized, high-value)

Designed for the Claude API. Includes prompt templates for structured output.
"""

import json
import base64
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

DATA_DIR = Path(__file__).parent / 'data'


@dataclass
class RoomAnalysis:
    """Analysis result for a single room photo or photo set."""
    room_name: str = ''
    room_category: str = ''  # kitchen, bedroom, living_room, etc.
    density: str = 'medium'  # light, medium, heavy
    estimated_tags: int = 0
    estimated_boxes: int = 0
    tag_items: list = field(default_factory=list)   # List of visible TAG items
    box_items: list = field(default_factory=list)    # Types of items that go in boxes
    special_items: list = field(default_factory=list) # Fragile, oversized, high-value
    damage_indicators: list = field(default_factory=list)
    confidence: float = 0.0
    notes: str = ''


@dataclass
class WalkthroughAnalysis:
    """Complete analysis of all photos from a walk-through."""
    rooms: list = field(default_factory=list)  # List of RoomAnalysis
    total_tags: int = 0
    total_boxes: int = 0
    total_rooms: int = 0
    dominant_loss_type: str = ''
    home_size_estimate: str = ''  # small, medium, large, xlarge
    suggested_crew_size: int = 6
    suggested_truck_loads: int = 2
    suggested_drive_time: float = 25.0


# The core prompt template for Claude vision analysis
ROOM_ANALYSIS_PROMPT = """You are an expert contents packout estimator for 1-800-Packouts.
You are looking at photos from an initial walk-through of a home that needs contents packout.

A "packout" means removing all contents from the home for cleaning/storage while the home is repaired.

For each room photo, analyze and provide:

1. **Room Type**: What type of room is this? (kitchen, living room, bedroom, dining room, bathroom, closet, office, garage, laundry, hallway, basement, other)

2. **Contents Density**: How full is this room?
   - "light": Minimal furniture, mostly empty, sparse items
   - "medium": Normal amount of furniture and belongings
   - "heavy": Very full, lots of items, cluttered, packed shelves

3. **TAG Items**: Large items that need individual tags and pad wrapping.
   Count each of these as a TAG:
   - Each piece of furniture (couch=1, sectional=2-3, table=1, each chair=1)
   - Bed frame + headboard = 1 TAG, mattress = 1 TAG
   - Each dresser, nightstand, bookshelf, desk = 1 TAG
   - TVs, large mirrors, large artwork = 1 TAG each
   - Appliances (if moveable) = 1 TAG each
   - Exercise equipment = 1 TAG each

4. **Box Estimate**: How many MEDIUM boxes (18x18x16") would be needed to pack all the smaller items visible?
   Guidelines:
   - Kitchen cabinets full of dishes: ~4-6 boxes per section
   - Bookshelf full of books: ~2-3 boxes per shelf
   - Closet full of clothing: ~3-5 boxes per rod
   - Bathroom cabinet: ~1-2 boxes
   - Desk with supplies: ~2-3 boxes
   - Entertainment center with media: ~2-4 boxes

5. **Special Items**: Note any fragile (china, crystal, artwork), oversized (pool table, piano), or high-value (electronics, collectibles) items.

6. **Damage Indicators**: Note any visible water damage, fire/smoke damage, mold, or other loss indicators.

Respond in this exact JSON format:
{
  "room_type": "living_room",
  "density": "medium",
  "tag_items": ["sectional sofa (2 pieces)", "coffee table", "TV on stand", "bookshelf", "floor lamp"],
  "estimated_tags": 6,
  "box_items": ["books", "decorative items", "media/DVDs", "throw blankets"],
  "estimated_boxes": 8,
  "special_items": ["large TV - fragile"],
  "damage_indicators": ["water staining on baseboards"],
  "confidence": 0.8,
  "notes": "Standard living room with moderate furnishings"
}
"""

WALKTHROUGH_SUMMARY_PROMPT = """You are summarizing a complete home walk-through for a contents packout estimate.

Here are the room-by-room analysis results:
{room_analyses}

Based on ALL rooms combined, provide:
1. Total TAG count (sum of all rooms, but also account for items not visible in overview photos - typically add 15-20% for items in drawers, closets not fully visible, etc.)
2. Total box count (same adjustment)
3. Home size estimate (small: 1-5 rooms, medium: 6-9, large: 10-14, xlarge: 15+)
4. Suggested crew size (5 for small, 6 for medium, 7-8 for large)
5. Suggested truck loads (1 for small, 2 for medium, 3-4 for large)

Respond in JSON format:
{
  "total_tags": 120,
  "total_boxes": 180,
  "adjustment_factor": 1.15,
  "home_size": "medium",
  "crew_size": 6,
  "truck_loads": 2,
  "notes": "explanation"
}
"""


class PhotoAnalyzer:
    """Analyzes walk-through photos for packout estimation."""

    def __init__(self, room_lookup_path: Optional[Path] = None):
        """Load room scope lookup for calibration."""
        lookup_path = room_lookup_path or (DATA_DIR / 'room_scope_lookup.json')
        with open(lookup_path) as f:
            data = json.load(f)
        self.room_lookup = data['room_types']

    def analyze_room_local(self, room_name: str, room_category: str,
                           density: str = 'medium', photo_count: int = 3) -> RoomAnalysis:
        """
        Analyze a room using the local lookup table (no API call).
        Used for batch processing and backtesting when API is not available.

        Args:
            room_name: Name of the room (e.g., "Kitchen", "Primary Bedroom")
            room_category: Classified category (e.g., "kitchen", "bedroom")
            density: Contents density level ("light", "medium", "heavy")
            photo_count: Number of photos taken of this room

        Returns:
            RoomAnalysis with estimated TAG and box counts
        """
        lookup = self.room_lookup.get(room_category, self.room_lookup.get('other', {}))
        typical_tags = lookup.get('typical_tags', {})
        typical_boxes = lookup.get('typical_boxes', {})

        tags = typical_tags.get(density, typical_tags.get('medium', 5))
        boxes = typical_boxes.get(density, typical_boxes.get('medium', 8))

        # Adjust based on actual data if available
        actual = lookup.get('actual_data', {})
        if actual.get('sample_size', 0) >= 3:
            # Blend lookup estimate with actual data
            actual_tags = actual.get('median_tags', tags)
            actual_boxes = actual.get('median_boxes', boxes)
            tags = round(0.5 * tags + 0.5 * actual_tags)
            boxes = round(0.5 * boxes + 0.5 * actual_boxes)

        return RoomAnalysis(
            room_name=room_name,
            room_category=room_category,
            density=density,
            estimated_tags=tags,
            estimated_boxes=boxes,
            tag_items=lookup.get('common_tags', []),
            box_items=lookup.get('common_box_items', []),
            confidence=0.6,  # Lower confidence without vision analysis
            notes=f"Estimated from lookup table ({density} density)",
        )

    def analyze_walkthrough_local(self, rooms: list,
                                  default_density: str = 'medium') -> WalkthroughAnalysis:
        """
        Analyze a complete walk-through using lookup tables.

        Args:
            rooms: List of dicts with 'room_name', 'room_category', optional 'density'
            default_density: Default density if not specified per room

        Returns:
            WalkthroughAnalysis with totals and recommendations
        """
        result = WalkthroughAnalysis()
        result.total_rooms = len(rooms)

        for room in rooms:
            analysis = self.analyze_room_local(
                room_name=room.get('room_name', 'Unknown'),
                room_category=room.get('room_category', 'other'),
                density=room.get('density', default_density),
                photo_count=room.get('photo_count', 3),
            )
            result.rooms.append(analysis)

        # Sum totals
        raw_tags = sum(r.estimated_tags for r in result.rooms)
        raw_boxes = sum(r.estimated_boxes for r in result.rooms)

        # Apply 20% adjustment for items not visible in overview photos
        # (drawers, cabinets, closet interiors, etc.)
        adjustment = 1.20
        result.total_tags = round(raw_tags * adjustment)
        result.total_boxes = round(raw_boxes * adjustment)

        # Home size classification
        if result.total_rooms <= 5:
            result.home_size_estimate = 'small'
            result.suggested_crew_size = 5
            result.suggested_truck_loads = 1
        elif result.total_rooms <= 9:
            result.home_size_estimate = 'medium'
            result.suggested_crew_size = 6
            result.suggested_truck_loads = 2
        elif result.total_rooms <= 14:
            result.home_size_estimate = 'large'
            result.suggested_crew_size = 7
            result.suggested_truck_loads = 3
        else:
            result.home_size_estimate = 'xlarge'
            result.suggested_crew_size = 8
            result.suggested_truck_loads = 4

        return result

    @staticmethod
    def get_api_prompt_for_room() -> str:
        """Get the prompt template for Claude API room analysis."""
        return ROOM_ANALYSIS_PROMPT

    @staticmethod
    def get_api_prompt_for_summary() -> str:
        """Get the prompt template for Claude API walkthrough summary."""
        return WALKTHROUGH_SUMMARY_PROMPT

    @staticmethod
    def encode_image_for_api(image_path: str) -> dict:
        """Encode an image file for the Claude API messages format."""
        path = Path(image_path)
        suffix = path.suffix.lower()
        media_types = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
        }
        media_type = media_types.get(suffix, 'image/jpeg')

        with open(path, 'rb') as f:
            data = base64.b64encode(f.read()).decode('utf-8')

        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": data,
            }
        }


if __name__ == '__main__':
    analyzer = PhotoAnalyzer()

    # Test: analyze a walk-through using lookup tables
    test_rooms = [
        {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'medium'},
        {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'medium'},
        {'room_name': 'Dining Room', 'room_category': 'dining_room', 'density': 'light'},
        {'room_name': 'Primary Bedroom', 'room_category': 'bedroom', 'density': 'medium'},
        {'room_name': 'Guest Bedroom', 'room_category': 'bedroom', 'density': 'light'},
        {'room_name': 'Primary Bathroom', 'room_category': 'bathroom', 'density': 'medium'},
        {'room_name': 'Office', 'room_category': 'office', 'density': 'heavy'},
        {'room_name': 'Garage', 'room_category': 'garage', 'density': 'medium'},
        {'room_name': 'Hallway', 'room_category': 'hallway', 'density': 'light'},
    ]

    result = analyzer.analyze_walkthrough_local(test_rooms)
    print(f"Walk-through Analysis (9 rooms, {result.home_size_estimate} home):")
    print(f"  Total TAGs: {result.total_tags}")
    print(f"  Total Boxes: {result.total_boxes}")
    print(f"  Crew: {result.suggested_crew_size}")
    print(f"  Truck Loads: {result.suggested_truck_loads}")

    print("\nPer-room breakdown:")
    for room in result.rooms:
        print(f"  {room.room_name:<20} TAGs: {room.estimated_tags:>3}  Boxes: {room.estimated_boxes:>3}  ({room.density})")

    print(f"\nAPI prompt template available via PhotoAnalyzer.get_api_prompt_for_room()")
