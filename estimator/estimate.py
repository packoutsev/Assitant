"""
MVP Estimator — Single entry point for 1-800-Packouts estimates.

Simple flow:
  1. Get rooms from walkthrough video (Gemini) + supplement with room photos
  2. Show room breakdown
  3. Generate 5-phase estimate
  4. Output CSV + summary

Usage:
    python estimator/estimate.py --video walkthrough.mp4 --customer "Hart Frank"
    python estimator/estimate.py --video walkthrough.mp4 --photos ./room_photos --customer "Hart Frank"
    python estimator/estimate.py --rooms rooms.json --customer "Hart Frank" --crew 6 --trucks 4 --vaults 11
    python estimator/estimate.py --claim "Prokell" --vaults 4 --months 3
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()
load_dotenv(Path(__file__).parent / '.env')

# Add estimator directory to path
sys.path.insert(0, str(Path(__file__).parent))

from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate
from gemini_video_analyzer import analyze_video
from video_summarizer import gemini_fallback


# ── Box prediction (room-type-aware) ─────────────────────────────────
# Photos count TAGs well (-15% error) but miss boxes hidden in drawers,
# cabinets, and closets (-74% error). This predictor uses:
#
# 1. LABELED DENSITY from video analysis (Gemini): determines the expected
#    box count per room from room_scope_lookup. Labeled density reflects what
#    the AI actually saw — more reliable than inferring density from TAG count
#    (high TAGs can mean lots of furniture with empty cabinets).
#
# 2. TAG DENSITY RATIO: Detects when Gemini under-labeled density. If total
#    TAGs are 1.5x+ the baseline for labeled densities, the whole house is
#    denser than labeled → bump all densities up one tier.
#
# 3. TARGETED UPGRADES: Only upgrade rooms where photos clearly undercounted
#    (< 50% of lookup). Trust photos for rooms with mostly visible contents.
#
# 4. IMPLICIT CLOSET/PANTRY: Bedrooms without explicit closet rooms get closet
#    contents added. Kitchens get pantry allocation. These spaces are invisible
#    to photos — the single biggest source of box undercount.

# Density tiers in order
DENSITY_TIERS = ['light', 'medium', 'heavy', 'very_heavy']

# Closet allocations (boxes) for bedrooms without explicit closet rooms
CLOSET_ALLOCATION = {
    'bedroom_primary': {'light': 5, 'medium': 15, 'heavy': 25, 'very_heavy': 35},
    'bedroom':         {'light': 3, 'medium': 8,  'heavy': 15, 'very_heavy': 22},
    'bedroom_guest':   {'light': 3, 'medium': 6,  'heavy': 12, 'very_heavy': 18},
    'bedroom_kids':    {'light': 3, 'medium': 10, 'heavy': 18, 'very_heavy': 28},
}

# Pantry/cabinet allocation for kitchens without explicit pantry room
PANTRY_ALLOCATION = {'light': 2, 'medium': 5, 'heavy': 10, 'very_heavy': 15}

# Room categories where photos reliably count boxes (mostly visible items).
# For these rooms, trust the photo count unless it's dramatically low.
PHOTO_RELIABLE_CATEGORIES = {
    'living_room', 'dining_room', 'hallway', 'exterior', 'laundry',
}

# Rooms where hidden contents dominate (drawers, cabinets, closets).
# Photos systematically undercount these — apply lookup as floor.
HIDDEN_CONTENT_CATEGORIES = {
    'bedroom', 'bedroom_primary', 'bedroom_guest', 'bedroom_kids',
    'kitchen', 'office', 'bathroom', 'closet', 'garage', 'basement',
}

# TAG density ratio threshold: if total actual TAGs exceed baseline by this
# factor, the house is denser than labeled → bump densities up one tier
TAG_DENSITY_BUMP_THRESHOLD = 1.5

# If TAG ratio is THIS high, also bump closet allocations an extra tier.
# Closets are the #1 source of undercounting and scale with home density.
TAG_CLOSET_BOOST_THRESHOLD = 1.75


def _bump_density(density):
    """Bump density up one tier (e.g., medium -> heavy)."""
    idx = DENSITY_TIERS.index(density) if density in DENSITY_TIERS else 1
    return DENSITY_TIERS[min(idx + 1, len(DENSITY_TIERS) - 1)]


def _lookup_boxes(baselines, room_category, density):
    """Look up expected box count for a room type at a given density."""
    room_data = baselines.get(room_category, baselines.get('other', {}))
    return (room_data.get('typical_boxes') or {}).get(density, 6)


def _lookup_tags(baselines, room_category, density):
    """Look up baseline TAG count for a room type at a given density."""
    room_data = baselines.get(room_category, baselines.get('other', {}))
    return (room_data.get('typical_tags') or {}).get(density, 5)


def apply_box_prediction(rooms):
    """Predict box counts using labeled density + TAG ratio detection + closet allocation.

    Steps:
    1. Compute TAG density ratio across all rooms to detect under-labeled density
    2. If ratio > 1.5x: bump all densities up one tier
    3. Per room: look up expected boxes at (boosted) density
    4. For hidden-content rooms (bedrooms, kitchens): upgrade if photo < 50% of lookup
    5. For visible-content rooms (living, dining): trust photos
    6. Add closet allocation for bedrooms without explicit closet rooms
    7. Add pantry allocation for kitchens without explicit pantry
    """
    total_tags = sum(r.get('override_tags', 0) or 0 for r in rooms)
    if total_tags == 0:
        return rooms

    baselines = _load_baselines()

    # Detect explicit closets/pantries to avoid double-counting
    room_categories = [r.get('room_category', 'other') for r in rooms]
    room_names_lower = [r.get('room_name', '').lower() for r in rooms]
    has_explicit_closets = 'closet' in room_categories
    has_explicit_pantry = any('pantry' in n for n in room_names_lower)

    current_boxes = sum(r.get('override_boxes', 0) or 0 for r in rooms)

    # Step 1: Compute TAG density ratio to detect under-labeled houses
    baseline_tags_sum = 0
    for room in rooms:
        cat = room.get('room_category', 'other')
        den = room.get('density', 'medium')
        baseline_tags_sum += _lookup_tags(baselines, cat, den)

    tag_ratio = total_tags / max(baseline_tags_sum, 1)
    density_bumped = tag_ratio > TAG_DENSITY_BUMP_THRESHOLD

    print(f"\n  Box prediction: {total_tags} TAGs across {len(rooms)} rooms "
          f"(photo boxes: {current_boxes})")
    print(f"    TAG density ratio: {tag_ratio:.2f}x baseline"
          + (f" -> bumping density one tier" if density_bumped else ""))

    # Step 2-7: Per-room box prediction
    upgraded = 0
    for room in rooms:
        room_tags = room.get('override_tags', 0) or 0
        photo_boxes = room.get('override_boxes', 0) or 0
        room_cat = room.get('room_category', 'other')
        room_name = room.get('room_name', '?')
        labeled_density = room.get('density', 'medium')

        # Apply density bump if house is denser than labeled
        effective_density = _bump_density(labeled_density) if density_bumped else labeled_density

        # Look up expected boxes at effective density
        lookup_boxes = _lookup_boxes(baselines, room_cat, effective_density)

        # When closets are explicit rooms, bedroom lookups over-count because
        # they were calibrated from combined bedroom+closet scope. Deduct the
        # closet portion so we don't double-count.
        if has_explicit_closets and room_cat in CLOSET_ALLOCATION:
            closet_portion = CLOSET_ALLOCATION.get(room_cat, {}).get(effective_density, 0)
            lookup_boxes = max(lookup_boxes - closet_portion // 2, 0)

        # Closet allocation for bedrooms
        # Extra boost: very dense houses (ratio > 1.75) get closet allocation
        # bumped an additional tier — packed houses have packed closets.
        closet_bonus = 0
        if room_cat in CLOSET_ALLOCATION and not has_explicit_closets:
            # Detect master/primary bedrooms by name even if category is generic
            closet_cat = room_cat
            if room_cat == 'bedroom':
                name_lower = room_name.lower()
                if any(kw in name_lower for kw in ('master', 'primary', 'main bed')):
                    closet_cat = 'bedroom_primary'
            closet_density = effective_density
            if tag_ratio > TAG_CLOSET_BOOST_THRESHOLD:
                closet_density = _bump_density(effective_density)
            closet_bonus = CLOSET_ALLOCATION[closet_cat].get(closet_density, 6)

        # Pantry allocation for kitchens
        pantry_bonus = 0
        if room_cat == 'kitchen' and not has_explicit_pantry:
            pantry_bonus = PANTRY_ALLOCATION.get(effective_density, 5)

        predicted = lookup_boxes + closet_bonus + pantry_bonus

        # Decision: upgrade or keep photo count?
        should_upgrade = False
        if room_cat in HIDDEN_CONTENT_CATEGORIES:
            # Hidden-content rooms: upgrade if photos found < 50% of expected
            if photo_boxes < predicted * 0.5:
                should_upgrade = True
        elif room_cat in PHOTO_RELIABLE_CATEGORIES:
            # Photo-reliable rooms: normally trust photos. But when density is
            # bumped, even visible rooms like living rooms have packed shelves
            # and entertainment centers — upgrade if photo < 40% of lookup.
            if density_bumped and photo_boxes < lookup_boxes * 0.4:
                should_upgrade = True
            elif photo_boxes == 0 and predicted > 0:
                should_upgrade = True
        else:
            # Other rooms: upgrade if photo is clearly low
            if photo_boxes < predicted * 0.4:
                should_upgrade = True

        # Always add closet/pantry bonus even if base lookup doesn't trigger
        bonus_only = closet_bonus + pantry_bonus
        if not should_upgrade and bonus_only > 0 and photo_boxes + bonus_only > photo_boxes:
            # Add just the closet/pantry bonus on top of photo count
            new_boxes = photo_boxes + bonus_only
            if new_boxes > photo_boxes:
                room['override_boxes'] = new_boxes
                upgraded += 1
                parts = []
                if closet_bonus:
                    parts.append(f"closet=+{closet_bonus}")
                if pantry_bonus:
                    parts.append(f"pantry=+{pantry_bonus}")
                print(f"    {room_name}: boxes {photo_boxes} -> {new_boxes} "
                      f"({', '.join(parts)}, {effective_density})")
        elif should_upgrade and predicted > photo_boxes:
            room['override_boxes'] = int(predicted)
            upgraded += 1
            parts = [f"lookup={lookup_boxes}"]
            if closet_bonus:
                parts.append(f"closet=+{closet_bonus}")
            if pantry_bonus:
                parts.append(f"pantry=+{pantry_bonus}")
            print(f"    {room_name}: boxes {photo_boxes} -> {int(predicted)} "
                  f"({', '.join(parts)}, {effective_density})")

    final_total = sum(r.get('override_boxes', 0) or 0 for r in rooms)
    if final_total != current_boxes:
        print(f"  Box prediction: {current_boxes} -> {final_total} total boxes "
              f"({upgraded} rooms upgraded)")
    else:
        print(f"  Box prediction: {final_total} total boxes (no changes needed)")

    return rooms


# ── Photo TAG analysis ──────────────────────────────────────────────

# Load room baselines once
_BASELINES = None

def _load_baselines():
    global _BASELINES
    if _BASELINES is None:
        lookup_path = Path(__file__).parent / 'data' / 'room_scope_lookup.json'
        with open(lookup_path) as f:
            _BASELINES = json.load(f)['room_types']
    return _BASELINES


def _get_baseline(room_category, density):
    """Get expected TAG/box counts for a room type + density."""
    baselines = _load_baselines()
    room_data = baselines.get(room_category, baselines.get('other', {}))
    density = density or 'medium'
    tags = (room_data.get('typical_tags') or {}).get(density, 5)
    boxes = (room_data.get('typical_boxes') or {}).get(density, 6)
    common_tags = room_data.get('common_tags', [])
    return tags, boxes, common_tags


PHOTO_PROMPT = """You are an expert contents packout estimator for 1-800-Packouts. These photos show the "{room_name}" room.

## CONTEXT
A typical {density}-density {room_category} has about {baseline_tags} TAG items such as: {common_tags_str}.
Your count should be in the same general range unless this room is clearly unusual.

## WHAT IS A TAG ITEM?
Anything that gets individually inventoried, wrapped in furniture pads, and moved:
- Furniture: couches, tables, EACH chair/stool individually, dressers, nightstands, bookshelves, desks
- Beds DISASSEMBLED: headboard=1, footboard=1, side rails=1, mattress=1, box spring=1
- Wall items: mirrors, large art/framed pictures, wall shelves, clocks, large wall decor
- Floor items: rugs/area carpets (rolled=1 TAG each), floor lamps, large baskets that won't fit in a 15" box
- Electronics: TVs, large monitors

NOT TAG items: small decorative items, candles, small frames, kitchenware, small electronics, built-in cabinets/shelving, countertops, appliances staying with home, throw pillows, blankets, curtains, plants, chandeliers/ceiling fixtures, inflatable/temporary items.

## CRITICAL RULES
1. ONLY count items physically IN this room ("{room_name}"). If you can see into an adjacent room through a doorway or open floor plan, do NOT count those items.
2. These photos show the SAME room from MULTIPLE angles. Each unique physical item = ONLY ONE entry. If you see the same couch from 3 angles, list it once.
3. When in doubt whether two items in different photos are the same physical item, assume they ARE the same.
4. List every item. tag_count MUST equal len(tag_items).

Respond with ONLY valid JSON:
{{
  "tag_items": ["item 1", "item 2", ...],
  "tag_count": <MUST equal len(tag_items)>,
  "box_estimate": <medium boxes (15x15x15 in) for smaller items in this room>
}}"""


def _sample_photos(photo_paths, max_photos=5):
    """Select evenly-spaced photos from a larger set for best room coverage."""
    if len(photo_paths) <= max_photos:
        return list(photo_paths)
    # Evenly sample across the set
    step = len(photo_paths) / max_photos
    return [photo_paths[int(i * step)] for i in range(max_photos)]


def analyze_photos_for_room(photo_paths, room_name, client, room_category='other',
                             density='medium', model="claude-sonnet-4-5-20250929"):
    """Analyze room photos with Claude: single batch, baseline-anchored, max 5 photos."""
    import base64

    baseline_tags, baseline_boxes, common_tags = _get_baseline(room_category, density)

    # Sample down to 5 photos for best results
    sampled = _sample_photos(photo_paths, max_photos=5)

    # Build content blocks: images first, then prompt
    content = []
    for p in sampled:
        try:
            with open(p, 'rb') as f:
                data = base64.standard_b64encode(f.read()).decode('utf-8')
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": data,
                },
            })
        except Exception as e:
            print(f"    Skipping {p.name}: {e}")

    if not content:
        return None

    prompt = PHOTO_PROMPT.format(
        room_name=room_name,
        density=density,
        room_category=room_category.replace('_', ' '),
        baseline_tags=baseline_tags,
        common_tags_str=', '.join(common_tags) if common_tags else 'varies',
    )
    content.append({"type": "text", "text": prompt})

    try:
        response = client.messages.create(
            model=model,
            max_tokens=2000,
            messages=[{"role": "user", "content": content}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines).strip()
        result = json.loads(text)
        tag_items = result.get('tag_items', [])
        return {
            'tag_items': tag_items,
            'tag_count': len(tag_items),
            'box_estimate': result.get('box_estimate', 0),
        }
    except Exception as e:
        print(f"    Photo analysis failed for {room_name}: {e}")
        return None


def supplement_with_photos(rooms, photos_by_room):
    """Supplement video-derived rooms with photo-based TAG counts.

    Uses baseline-anchored sequential inventory building:
    1. Looks up expected TAG/box count from room_scope_lookup.json
    2. Processes photos in batches, building inventory sequentially
    3. Takes max(video, photo) for final counts
    """
    if not photos_by_room:
        return rooms

    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("  ANTHROPIC_API_KEY not set -- skipping photo supplement")
        return rooms

    client = anthropic.Anthropic(api_key=api_key)

    # Build fuzzy room name mapping: Encircle room names -> video room indices
    room_matches = _match_rooms(rooms, list(photos_by_room.keys()))

    updated = 0
    for enc_room, video_idx in room_matches.items():
        photo_paths = photos_by_room[enc_room]
        if not photo_paths:
            continue

        room = rooms[video_idx]
        video_tags = room.get('override_tags', 0) or 0
        video_boxes = room.get('override_boxes', 0) or 0
        room_name = room.get('room_name', enc_room)
        room_category = room.get('room_category', 'other')
        density = room.get('density', 'medium')

        baseline_tags, baseline_boxes, _ = _get_baseline(room_category, density)
        print(f"  {enc_room} ({len(photo_paths)} photos, baseline: {baseline_tags} TAGs, {baseline_boxes} boxes)")

        result = analyze_photos_for_room(
            photo_paths, enc_room, client,
            room_category=room_category, density=density
        )

        if result:
            tag_items = result.get('tag_items', [])
            photo_tags = len(tag_items)
            photo_boxes = result.get('box_estimate', 0)

            old_tags = video_tags
            old_boxes = video_boxes
            # Take the max of video and photo counts
            new_tags = max(video_tags, photo_tags)
            new_boxes = max(video_boxes, photo_boxes)

            if new_tags != old_tags or new_boxes != old_boxes:
                room['override_tags'] = new_tags
                room['override_boxes'] = new_boxes
                updated += 1
                delta_t = new_tags - old_tags
                delta_b = new_boxes - old_boxes
                print(f"    {room_name}: TAGs {old_tags}->{new_tags} (+{delta_t}), "
                      f"Boxes {old_boxes}->{new_boxes} (+{delta_b})")
                for ti, item in enumerate(tag_items, 1):
                    print(f"      {ti:2d}. {item}")
            else:
                print(f"    {room_name}: no change (video={video_tags}, photo={photo_tags})")

    if updated:
        print(f"\n  Photo supplement updated {updated} room(s)")
    else:
        print(f"\n  Photo supplement: no rooms needed updating")

    return rooms


def _match_rooms(video_rooms, encircle_room_names):
    """Fuzzy-match Encircle room names to video room indices.

    Returns dict: encircle_room_name -> video_room_index

    Matching strategy (in priority order):
    1. Exact matches first (so they don't get stolen by substring matches)
    2. Substring matches
    3. Key-word overlap (stripping noise words like 'off', 'level', 'area', '&')
    """
    NOISE_WORDS = {'off', 'the', 'a', 'an', '&', 'and', 'area', 'level',
                   'lower', 'upper', 'downstairs', 'upstairs', 'main',
                   'floor', 'first', 'second', 'of'}

    def _key_words(name):
        words = set(name.lower().replace('-', ' ').replace('_', ' ').split())
        cleaned = words - NOISE_WORDS
        return cleaned if cleaned else words  # Don't strip everything

    matches = {}
    used_indices = set()

    # Pass 1: Exact matches (highest priority — prevents stealing)
    for enc_name in encircle_room_names:
        enc_lower = enc_name.lower().strip()
        for i, room in enumerate(video_rooms):
            if i in used_indices:
                continue
            vid_name = (room.get('room_name') or '').lower().strip()
            if enc_lower == vid_name:
                matches[enc_name] = i
                used_indices.add(i)
                break

    # Pass 2: Fuzzy matches for unmatched rooms
    unmatched = [n for n in encircle_room_names if n not in matches]
    for enc_name in unmatched:
        enc_lower = enc_name.lower().strip()
        enc_keys = _key_words(enc_name)

        best_idx = None
        best_score = 0

        for i, room in enumerate(video_rooms):
            if i in used_indices:
                continue
            vid_name = (room.get('room_name') or '').lower().strip()
            vid_keys = _key_words(room.get('room_name') or '')

            # Substring match
            if enc_lower in vid_name or vid_name in enc_lower:
                score = 0.9
                if score > best_score:
                    best_score = score
                    best_idx = i
                continue

            # Key-word overlap (noise words removed)
            if enc_keys and vid_keys:
                overlap = len(enc_keys & vid_keys)
                if overlap == 0:
                    continue
                total = len(enc_keys | vid_keys)
                score = overlap / total
                if score > best_score and score >= 0.2:
                    best_score = score
                    best_idx = i

        if best_idx is not None:
            matches[enc_name] = best_idx
            used_indices.add(best_idx)

    return matches


# ── Encircle helpers ──────────────────────────────────────────────

def pick_walkthrough_video(videos):
    """Pick the best walkthrough video from a list of Encircle video media items.

    Prefers videos with 'walkthru'/'walkthrough'/'tour' in the name.
    Skips 'exterior', 'final', 'closing', 'end of day' videos.
    Falls back to the largest non-exterior video.
    """
    skip_keywords = ['exterior', 'final video', 'closing out', 'end of day',
                     'stopping point']
    prefer_keywords = ['walkthru', 'walkthrough', 'walk thru', 'walk through',
                       'tour', 'full walk']

    # Try preferred keywords first
    for v in videos:
        fname = (v.get('filename') or '').lower()
        labels = [l.lower() for l in (v.get('labels') or [])]
        all_text = fname + ' ' + ' '.join(labels)
        if any(kw in all_text for kw in prefer_keywords):
            return v

    # Fall back to largest non-exterior video
    candidates = []
    for v in videos:
        fname = (v.get('filename') or '').lower()
        labels = [l.lower() for l in (v.get('labels') or [])]
        all_text = fname + ' ' + ' '.join(labels)
        if any(kw in all_text for kw in skip_keywords):
            continue
        source = v.get('source') or {}
        size = source.get('file_size') or 0
        candidates.append((size, v))

    if candidates:
        candidates.sort(reverse=True)
        return candidates[0][1]

    # Last resort: first video
    return videos[0]


def download_room_photos(client, claim_id, output_dir):
    """Download all room photos from Encircle, grouped by room name.

    Returns dict: room_name -> list of Path objects
    """
    media = client.get_media(claim_id)
    photos = client.filter_photos(media)
    by_room = client.group_photos_by_room(photos)

    photos_dir = Path(output_dir) / 'photos'
    result = {}

    for room_name, room_photos in by_room.items():
        if room_name == '_unassigned' or room_name.lower() == 'exterior':
            continue

        room_dir = photos_dir / room_name.replace('/', '_').replace('\\', '_')
        paths = []
        for p in room_photos:
            try:
                path = client.download_media(p, room_dir)
                paths.append(path)
            except Exception as e:
                print(f"    Failed to download photo: {e}")

        if paths:
            result[room_name] = paths

    return result


# ── Room acquisition ──────────────────────────────────────────────

def get_rooms_from_video(video_path, customer_name, output_dir):
    """Send video to Gemini, get rooms JSON back."""
    result = analyze_video(video_path)
    if not result.ok:
        print(f"FATAL: Gemini analysis failed: {result.error}")
        sys.exit(1)

    summary = gemini_fallback(result.rooms)
    rooms = summary.to_rooms_json()

    # Save for re-use
    safe_name = customer_name.replace(' ', '_').replace(',', '')
    rooms_path = Path(output_dir) / f"{safe_name}_rooms.json"
    rooms_path.parent.mkdir(parents=True, exist_ok=True)
    with open(rooms_path, 'w') as f:
        json.dump(rooms, f, indent=2)
    print(f"Rooms saved to: {rooms_path}")

    return rooms


def get_rooms_from_claim(claim_name, output_dir):
    """Pull walkthrough video + room photos from Encircle, analyze both."""
    from encircle_client import EncircleClient

    client = EncircleClient()
    claim = client.find_claim_by_name(claim_name)
    if not claim:
        print(f"No claim found matching '{claim_name}'")
        sys.exit(1)

    customer = claim.get('policyholder_name', claim_name)
    print(f"Found claim: {customer}")
    client.print_claim_summary(claim)

    media = client.get_media(claim['id'])
    videos = client.filter_videos(media)
    if not videos:
        print(f"No videos found for {customer}")
        sys.exit(1)

    # Pick the walkthrough video (not exterior/final clips)
    video = pick_walkthrough_video(videos)
    fname = video.get('filename') or '?'
    print(f"Selected walkthrough: {fname} (of {len(videos)} videos)")

    video_path = client.download_media(video, Path(output_dir) / 'videos')
    rooms = get_rooms_from_video(video_path, customer, output_dir)

    # Download and analyze room photos
    photos = client.filter_photos(media)
    if photos:
        print(f"\nDownloading {len(photos)} room photos...")
        photos_by_room = download_room_photos(client, claim['id'], output_dir)
        if photos_by_room:
            total_photos = sum(len(v) for v in photos_by_room.values())
            print(f"  {total_photos} photos across {len(photos_by_room)} rooms")
            print(f"\nSupplementing with photos...")
            rooms = normalize_rooms(rooms)
            rooms = supplement_with_photos(rooms, photos_by_room)

    return rooms, customer


def load_photos_from_folder(photos_dir):
    """Load room photos from a local folder.

    Expects either:
    - Flat folder of images (all treated as one room)
    - Subfolders named by room (each subfolder = one room's photos)
    """
    photos_dir = Path(photos_dir)
    image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.heic'}

    # Check for subfolders
    subdirs = [d for d in photos_dir.iterdir() if d.is_dir()]
    if subdirs:
        result = {}
        for d in subdirs:
            photos = [f for f in d.iterdir() if f.suffix.lower() in image_exts]
            if photos:
                result[d.name] = sorted(photos)
        return result

    # Flat folder — group all as "Unknown Room"
    photos = [f for f in photos_dir.iterdir() if f.suffix.lower() in image_exts]
    if photos:
        return {"All Rooms": sorted(photos)}
    return {}


# ── Normalization and display ──────────────────────────────────────

def normalize_rooms(rooms):
    """Normalize rooms from various formats into the standard format."""
    from build_visual_training import classify_room

    normalized = []
    for r in rooms:
        entry = {}
        entry['room_name'] = r.get('room_name') or r.get('name', 'Unknown')
        entry['room_category'] = r.get('room_category') or classify_room(entry['room_name'])
        entry['density'] = r.get('density', 'medium')
        tags = r.get('override_tags')
        if tags is None:
            tags = r.get('estimated_tags')
        if tags is not None:
            entry['override_tags'] = tags
        boxes = r.get('override_boxes')
        if boxes is None:
            boxes = r.get('estimated_boxes')
        if boxes is not None:
            entry['override_boxes'] = boxes
        normalized.append(entry)
    return normalized


def print_rooms(rooms):
    """Print room breakdown to console."""
    print(f"\n{'Room':<30} {'TAGs':>5} {'Boxes':>6} {'Density':<12}")
    print("-" * 57)
    total_tags = total_boxes = 0
    for r in rooms:
        tags = r.get('override_tags', 0) or 0
        boxes = r.get('override_boxes', 0) or 0
        total_tags += tags
        total_boxes += boxes
        name = r.get('room_name', r.get('name', '?'))
        print(f"{name:<30} {tags:>5} {boxes:>6}  {r.get('density', ''):>12}")
    print("-" * 57)
    print(f"{'TOTAL':<30} {total_tags:>5} {total_boxes:>6}")
    print(f"\n{len(rooms)} rooms, {total_tags} TAGs, {total_boxes} boxes")


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='1-800-Packouts Estimate Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --rooms rooms.json --customer "Hart Frank" --crew 6 --trucks 4 --vaults 11
  %(prog)s --video walkthrough.mp4 --customer "Hart Frank"
  %(prog)s --video walkthrough.mp4 --photos ./room_photos --customer "Hart Frank"
  %(prog)s --claim "Prokell" --vaults 4 --months 3
  %(prog)s --rooms rooms.json --customer "Hart Frank" --rate 58.70
        """,
    )

    # Input source (pick one)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--video', help='Path to walkthrough video')
    group.add_argument('--rooms', help='Path to saved rooms JSON')
    group.add_argument('--claim', help='Encircle claim name or ID')

    # Photo supplement
    parser.add_argument('--photos', help='Path to room photos folder (subfolders per room)')

    # Customer name
    parser.add_argument('--customer', help='Customer name (required unless --claim)')

    # Manual overrides
    parser.add_argument('--drive-time', type=float, default=25.0,
                        help='One-way drive time in minutes (default: 25)')
    parser.add_argument('--crew', type=int, default=None,
                        help='Crew size (default: auto from room count)')
    parser.add_argument('--trucks', type=int, default=None,
                        help='Truck loads (default: auto from room count)')
    parser.add_argument('--vaults', type=int, default=None,
                        help='Storage vaults (default: auto from TAG/box count)')
    parser.add_argument('--months', type=int, default=2,
                        help='Storage duration in months (default: 2)')
    parser.add_argument('--rate', type=float, default=None,
                        help='Handling labor rate $/hr (default: 79.04 for 65%% margin)')
    parser.add_argument('--boxes', type=int, default=None,
                        help='Override total box count (skips auto box prediction)')
    parser.add_argument('--output-dir', default=None,
                        help='Output directory (default: estimator/output/)')

    args = parser.parse_args()

    output_dir = Path(args.output_dir) if args.output_dir else Path(__file__).parent / 'output'

    # ── Step 1: Get rooms ──
    if args.video:
        if not args.customer:
            parser.error('--customer is required with --video')
        customer = args.customer
        rooms = get_rooms_from_video(args.video, customer, output_dir)

        # Photo supplement for --video mode
        if args.photos:
            rooms = normalize_rooms(rooms)
            photos_by_room = load_photos_from_folder(args.photos)
            if photos_by_room:
                total_photos = sum(len(v) for v in photos_by_room.values())
                print(f"\nSupplementing with {total_photos} photos from {len(photos_by_room)} rooms...")
                rooms = supplement_with_photos(rooms, photos_by_room)

    elif args.rooms:
        customer = args.customer or Path(args.rooms).stem
        with open(args.rooms) as f:
            rooms = json.load(f)

    elif args.claim:
        # --claim auto-pulls walkthrough video + room photos
        rooms, claim_customer = get_rooms_from_claim(args.claim, output_dir)
        customer = args.customer or claim_customer

    # Normalize rooms to standard format
    rooms = normalize_rooms(rooms)

    # Apply box count: manual override or TAG-to-box regression floor
    if args.boxes:
        total_tags = sum(r.get('override_tags', 0) or 0 for r in rooms)
        if total_tags > 0:
            print(f"\n  Manual box override: {args.boxes} boxes (distributing by TAG share)")
            for room in rooms:
                room_tags = room.get('override_tags', 0) or 0
                room_share = room_tags / max(total_tags, 1)
                room['override_boxes'] = max(
                    room.get('override_boxes', 0) or 0,
                    int(args.boxes * room_share),
                )
    else:
        rooms = apply_box_prediction(rooms)

    # ── Step 2: Show rooms ──
    print_rooms(rooms)

    # ── Step 3: Generate estimate ──
    walkthrough = analyze_from_rooms_json(rooms)

    est = generate_5phase_estimate(
        walkthrough=walkthrough,
        drive_time_min=args.drive_time,
        storage_vaults=args.vaults,
        storage_duration_months=args.months,
        customer_name=customer,
        apply_corrections=False,
        output_dir=str(output_dir),
        handling_rate=args.rate,
        crew_size=args.crew,
        truck_loads=args.trucks,
    )

    # Save rooms JSON (only when generated from video/claim, not when loaded via --rooms)
    if not args.rooms:
        safe_name = customer.replace(' ', '_').replace(',', '')
        rooms_path = output_dir / f"{safe_name}_rooms.json"
        rooms_path.parent.mkdir(parents=True, exist_ok=True)
        with open(rooms_path, 'w') as f:
            json.dump(rooms, f, indent=2)

    # ── Step 4: Output ──
    print(f"\n{'='*57}")
    print(f"ESTIMATE: ${est['total_rcv']:,.2f} RCV")
    print(f"{'='*57}")
    print(f"Handling: {est['handling_hours']:.1f} hr/direction @ ${est['handling_rate']:.2f}/hr")
    print(f"Storage:  {est['storage_vaults']} vaults x {args.months} months")
    print(f"Saved:    {est.get('csv_path', output_dir)}")


if __name__ == '__main__':
    main()
