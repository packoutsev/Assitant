"""Photos-only analysis for Love job — no video, just room photos from 12/29."""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()
load_dotenv(Path(__file__).parent / '.env')

sys.path.insert(0, str(Path(__file__).parent))

from estimate import (
    load_photos_from_folder, analyze_photos_for_room, _get_baseline,
    normalize_rooms, print_rooms
)
from build_visual_training import classify_room
from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate
import anthropic

PHOTOS_DIR = Path(__file__).parent / 'output' / 'Love_Toni' / 'photos'
OUTPUT_DIR = Path(__file__).parent / 'output'
CUSTOMER = "Love_Toni"

# Diana's actuals for comparison
DIANA = {
    'tags': 90,
    'boxes': 233,  # 215 med + 3 lg + 15 xlg
    'vaults': 11,
    'months': 3,
    'trucks': 4,
    'crew': 3,
    'drive_time': 33,
    'rcv': 33803,
}

def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # Load photos grouped by room subfolder
    photos_by_room = load_photos_from_folder(PHOTOS_DIR)
    print(f"Found {sum(len(v) for v in photos_by_room.values())} photos across {len(photos_by_room)} rooms\n")

    # Analyze each room with Claude
    rooms = []
    total_tags = 0
    total_boxes = 0

    for room_name, photo_paths in sorted(photos_by_room.items()):
        room_category = classify_room(room_name)
        density = 'medium'  # default, will be adjusted by photo analysis
        baseline_tags, baseline_boxes, _ = _get_baseline(room_category, density)

        print(f"{room_name} ({len(photo_paths)} photos, cat={room_category}, baseline={baseline_tags} TAGs)...")

        result = analyze_photos_for_room(
            photo_paths, room_name, client,
            room_category=room_category, density=density
        )

        if result:
            tag_items = result.get('tag_items', [])
            tag_count = len(tag_items)
            box_count = result.get('box_estimate', 0)
            total_tags += tag_count
            total_boxes += box_count

            print(f"  -> {tag_count} TAGs, {box_count} boxes")
            for i, item in enumerate(tag_items, 1):
                print(f"     {i:2d}. {item}")

            rooms.append({
                'room_name': room_name,
                'room_category': room_category,
                'density': density,
                'override_tags': tag_count,
                'override_boxes': box_count,
            })
        else:
            print(f"  -> FAILED, using baseline")
            rooms.append({
                'room_name': room_name,
                'room_category': room_category,
                'density': density,
                'override_tags': baseline_tags,
                'override_boxes': baseline_boxes,
            })

    # Save rooms JSON
    rooms_path = OUTPUT_DIR / f"{CUSTOMER}_rooms.json"
    with open(rooms_path, 'w') as f:
        json.dump(rooms, f, indent=2)
    print(f"\nRooms saved: {rooms_path}")

    # Show room breakdown
    print_rooms(rooms)

    # Generate estimate with Diana's known parameters
    walkthrough = analyze_from_rooms_json(rooms)
    est = generate_5phase_estimate(
        walkthrough=walkthrough,
        drive_time_min=DIANA['drive_time'],
        storage_vaults=DIANA['vaults'],
        storage_duration_months=DIANA['months'],
        customer_name=CUSTOMER,
        apply_corrections=False,
        output_dir=str(OUTPUT_DIR),
        crew_size=DIANA['crew'],
        truck_loads=DIANA['trucks'],
    )

    # Comparison
    print(f"\n{'='*60}")
    print(f"COMPARISON vs DIANA'S ACTUAL")
    print(f"{'='*60}")
    print(f"{'':>20} {'Ours':>10} {'Diana':>10} {'Delta':>10}")
    print(f"{'TAGs':>20} {total_tags:>10} {DIANA['tags']:>10} {total_tags - DIANA['tags']:>+10}")
    print(f"{'Boxes':>20} {total_boxes:>10} {DIANA['boxes']:>10} {total_boxes - DIANA['boxes']:>+10}")
    print(f"{'RCV':>20} ${est['total_rcv']:>9,.2f} ${DIANA['rcv']:>9,} {est['total_rcv'] - DIANA['rcv']:>+10,.2f}")
    pct = (est['total_rcv'] - DIANA['rcv']) / DIANA['rcv'] * 100
    print(f"{'RCV %':>20} {'':>10} {'':>10} {pct:>+9.1f}%")
    tag_pct = (total_tags - DIANA['tags']) / DIANA['tags'] * 100
    print(f"{'TAG %':>20} {'':>10} {'':>10} {tag_pct:>+9.1f}%")


if __name__ == '__main__':
    main()
