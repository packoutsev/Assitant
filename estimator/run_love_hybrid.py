"""Hybrid approach: photo TAGs + density-inferred boxes.

Photos are great at counting visible TAG items but can't see inside
drawers, cabinets, closets. So:
  1. Use photo TAGs (proven accurate)
  2. Infer density from TAG count vs baseline
  3. Pull baseline boxes for that density tier
  4. Infer closets from bedrooms (closets rarely photographed separately)
  5. Take max(photo_boxes, baseline_boxes)
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()
load_dotenv(Path(__file__).parent / '.env')

sys.path.insert(0, str(Path(__file__).parent))

from estimate import (
    load_photos_from_folder, analyze_photos_for_room, _load_baselines,
    normalize_rooms, print_rooms
)
from build_visual_training import classify_room
from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate
import anthropic

PHOTOS_DIR = Path(__file__).parent / 'output' / 'Love_Toni' / 'photos'
OUTPUT_DIR = Path(__file__).parent / 'output'
CUSTOMER = "Love_Toni"

DIANA = {
    'tags': 90, 'boxes': 233,
    'vaults': 11, 'months': 3, 'trucks': 4, 'crew': 3,
    'drive_time': 33, 'rcv': 33803,
}


def infer_density(room_category, tag_count):
    """Infer density tier from observed TAG count vs baseline thresholds."""
    baselines = _load_baselines()
    room_data = baselines.get(room_category, baselines.get('other', {}))
    tag_tiers = room_data.get('typical_tags', {})

    # Get thresholds
    light = tag_tiers.get('light', 1)
    medium = tag_tiers.get('medium', 4)
    heavy = tag_tiers.get('heavy', 8)
    very_heavy = tag_tiers.get('very_heavy', 15)

    # Find best matching tier
    if tag_count >= very_heavy:
        return 'very_heavy'
    elif tag_count >= heavy:
        return 'heavy'
    elif tag_count >= medium:
        return 'medium'
    else:
        return 'light'


def get_baseline_boxes(room_category, density):
    """Get baseline box count for a room type at a given density."""
    baselines = _load_baselines()
    room_data = baselines.get(room_category, baselines.get('other', {}))
    box_tiers = room_data.get('typical_boxes', {})
    return box_tiers.get(density, 6)


def infer_closets(rooms):
    """Add closet rooms for bedrooms that likely have closets."""
    closet_rooms = []
    bedroom_cats = {'bedroom', 'bedroom_primary', 'bedroom_guest', 'bedroom_kids'}

    for r in rooms:
        cat = r.get('room_category', '')
        if cat in bedroom_cats:
            density = r.get('density', 'medium')
            # Primary bedrooms tend to have bigger closets
            if cat == 'bedroom_primary':
                closet_density = 'heavy'
            elif density in ('heavy', 'very_heavy'):
                closet_density = 'medium'
            else:
                closet_density = 'light'

            boxes = get_baseline_boxes('closet', closet_density)
            closet_rooms.append({
                'room_name': f"{r['room_name']} Closet",
                'room_category': 'closet',
                'density': closet_density,
                'override_tags': 0,
                'override_boxes': boxes,
            })

    return closet_rooms


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    photos_by_room = load_photos_from_folder(PHOTOS_DIR)
    print(f"Found {sum(len(v) for v in photos_by_room.values())} photos across {len(photos_by_room)} rooms\n")

    # ── Load previous photo analysis results (already ran) ──
    prev_rooms_path = OUTPUT_DIR / 'Love_Toni_rooms.json'
    if prev_rooms_path.exists():
        with open(prev_rooms_path) as f:
            photo_rooms = json.load(f)
        print(f"Loaded previous photo analysis from {prev_rooms_path}\n")
    else:
        print("No previous results found, would need to re-run photo analysis")
        sys.exit(1)

    # ── Apply density inference + baseline boxes ──
    print(f"{'Room':<25} {'Cat':<15} {'P.TAGs':>6} {'Density':<10} {'P.Box':>5} {'B.Box':>5} {'Final':>5}")
    print("-" * 80)

    total_tags = 0
    total_photo_boxes = 0
    total_baseline_boxes = 0
    total_final_boxes = 0

    for r in photo_rooms:
        cat = r.get('room_category', 'other')
        photo_tags = r.get('override_tags', 0)
        photo_boxes = r.get('override_boxes', 0)

        # Infer density from TAG count
        density = infer_density(cat, photo_tags)
        r['density'] = density

        # Get baseline boxes for this density
        baseline_boxes = get_baseline_boxes(cat, density)

        # Take max of photo and baseline
        final_boxes = max(photo_boxes, baseline_boxes)
        r['override_boxes'] = final_boxes

        total_tags += photo_tags
        total_photo_boxes += photo_boxes
        total_baseline_boxes += baseline_boxes
        total_final_boxes += final_boxes

        print(f"{r['room_name']:<25} {cat:<15} {photo_tags:>6} {density:<10} {photo_boxes:>5} {baseline_boxes:>5} {final_boxes:>5}")

    print("-" * 80)
    print(f"{'SUBTOTAL':<25} {'':15} {total_tags:>6} {'':10} {total_photo_boxes:>5} {total_baseline_boxes:>5} {total_final_boxes:>5}")

    # ── Infer closets ──
    closet_rooms = infer_closets(photo_rooms)
    closet_boxes = sum(r['override_boxes'] for r in closet_rooms)
    print(f"\nInferred closets:")
    for cr in closet_rooms:
        print(f"  + {cr['room_name']}: {cr['override_boxes']} boxes ({cr['density']})")
    print(f"  Closet total: {closet_boxes} boxes")

    all_rooms = photo_rooms + closet_rooms
    grand_total_boxes = total_final_boxes + closet_boxes
    print(f"\nGRAND TOTAL: {total_tags} TAGs, {grand_total_boxes} boxes")

    # ── Show room breakdown ──
    print_rooms(all_rooms)

    # ── Generate estimate ──
    walkthrough = analyze_from_rooms_json(all_rooms)
    est = generate_5phase_estimate(
        walkthrough=walkthrough,
        drive_time_min=DIANA['drive_time'],
        storage_vaults=DIANA['vaults'],
        storage_duration_months=DIANA['months'],
        customer_name=CUSTOMER + '_hybrid',
        apply_corrections=False,
        output_dir=str(OUTPUT_DIR),
        crew_size=DIANA['crew'],
        truck_loads=DIANA['trucks'],
    )

    # ── Comparison ──
    print(f"\n{'='*60}")
    print(f"COMPARISON vs DIANA'S ACTUAL")
    print(f"{'='*60}")
    print(f"{'':>20} {'Photos':>10} {'Hybrid':>10} {'Diana':>10}")
    print(f"{'TAGs':>20} {total_tags:>10} {total_tags:>10} {DIANA['tags']:>10}")
    print(f"{'Boxes':>20} {total_photo_boxes:>10} {grand_total_boxes:>10} {DIANA['boxes']:>10}")
    print(f"{'RCV':>20} {'':>10} ${est['total_rcv']:>9,.2f} ${DIANA['rcv']:>9,}")
    pct = (est['total_rcv'] - DIANA['rcv']) / DIANA['rcv'] * 100
    box_pct = (grand_total_boxes - DIANA['boxes']) / DIANA['boxes'] * 100
    print(f"{'Box gap':>20} {'':>10} {box_pct:>+9.1f}% {'':>10}")
    print(f"{'RCV gap':>20} {'':>10} {pct:>+9.1f}% {'':>10}")


if __name__ == '__main__':
    main()
