"""
Huttie Validation Script
Runs the full video pipeline on the Huttie walkthrough video and compares
to known ground truth from Diana's actual estimate.

Ground truth (from Huttie estimate):
  - 10 rooms
  - 84 TAGs
  - ~101 boxes (80 med + wardrobe/lg)
  - $19,736 core RCV (5-phase with overrides)

Targets:
  - Rooms: ±2 of actual (8-12)
  - TAGs: within 20% of actual (67-101)
  - RCV: within 25% of actual ($14,802-$24,670)

Usage:
    python run_video_huttie.py
    python run_video_huttie.py --gemini-only
    python run_video_huttie.py --skip-whisper
"""

import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from video_pipeline import run_pipeline

# Known ground truth
HUTTIE_ACTUAL = {
    "rooms": 10,
    "tags": 84,
    "boxes": 101,  # 80 med + wardrobe/lg approximated as boxes
    "rcv": 19736.0,
}

# Validation targets
TARGETS = {
    "rooms_tolerance": 2,      # ±2 rooms
    "tags_pct": 0.20,          # within 20%
    "boxes_pct": 0.25,         # within 25%
    "rcv_pct": 0.25,           # within 25%
}

# Video location
VIDEO_PATH = Path.home() / "Downloads" / "Videos" / "huttie walk thru.mp4"


def validate(result, actual=HUTTIE_ACTUAL, targets=TARGETS):
    """Compare pipeline result to ground truth and print report."""
    print(f"\n{'='*60}")
    print(f"VALIDATION vs HUTTIE GROUND TRUTH")
    print(f"{'='*60}")

    checks = []

    # Room count
    room_diff = abs(result.final_rooms - actual["rooms"])
    room_ok = room_diff <= targets["rooms_tolerance"]
    checks.append(room_ok)
    icon = "PASS" if room_ok else "FAIL"
    print(f"\n  [{icon}] Rooms:  {result.final_rooms} vs {actual['rooms']} actual "
          f"(±{targets['rooms_tolerance']} tolerance, diff={room_diff})")

    # TAG count
    if actual["tags"] > 0:
        tag_pct = abs(result.final_tags - actual["tags"]) / actual["tags"]
    else:
        tag_pct = 0
    tag_ok = tag_pct <= targets["tags_pct"]
    checks.append(tag_ok)
    icon = "PASS" if tag_ok else "FAIL"
    print(f"  [{icon}] TAGs:   {result.final_tags} vs {actual['tags']} actual "
          f"({tag_pct*100:.1f}% off, target <={targets['tags_pct']*100:.0f}%)")

    # Box count
    if actual["boxes"] > 0:
        box_pct = abs(result.final_boxes - actual["boxes"]) / actual["boxes"]
    else:
        box_pct = 0
    box_ok = box_pct <= targets["boxes_pct"]
    checks.append(box_ok)
    icon = "PASS" if box_ok else "FAIL"
    print(f"  [{icon}] Boxes:  {result.final_boxes} vs {actual['boxes']} actual "
          f"({box_pct*100:.1f}% off, target <={targets['boxes_pct']*100:.0f}%)")

    # RCV
    if actual["rcv"] > 0:
        rcv_pct = abs(result.total_rcv - actual["rcv"]) / actual["rcv"]
    else:
        rcv_pct = 0
    rcv_ok = rcv_pct <= targets["rcv_pct"]
    checks.append(rcv_ok)
    icon = "PASS" if rcv_ok else "FAIL"
    print(f"  [{icon}] RCV:    ${result.total_rcv:,.2f} vs ${actual['rcv']:,.2f} actual "
          f"({rcv_pct*100:.1f}% off, target <={targets['rcv_pct']*100:.0f}%)")

    # Overall
    passed = sum(checks)
    total = len(checks)
    all_pass = all(checks)
    print(f"\n  Overall: {passed}/{total} checks passed")

    if all_pass:
        print(f"  VALIDATION PASSED")
    else:
        print(f"  VALIDATION FAILED -- {total - passed} check(s) out of tolerance")

    # Room-by-room breakdown
    if result.final_rooms_json:
        print(f"\n  Room-by-room (from pipeline):")
        for room in result.final_rooms_json:
            tags = room.get('override_tags', '?')
            boxes = room.get('override_boxes', '?')
            print(f"    {room['room_name']:<25} "
                  f"TAGs: {tags:>3}  Boxes: {boxes:>3}  "
                  f"({room.get('density', '?')})")

    return all_pass


def main():
    parser = argparse.ArgumentParser(description="Validate video pipeline against Huttie ground truth")
    parser.add_argument("--video", default=str(VIDEO_PATH), help="Path to Huttie walkthrough video")
    parser.add_argument("--skip-whisper", action="store_true", help="Skip Whisper transcription")
    parser.add_argument("--gemini-only", action="store_true", help="Gemini only mode")
    parser.add_argument("--gemini-model", default="gemini-2.5-pro", help="Gemini model")
    parser.add_argument("--claude-model", default="claude-sonnet-4-5-20250929", help="Claude model")

    args = parser.parse_args()

    video = Path(args.video)
    if not video.exists():
        print(f"ERROR: Video not found: {video}")
        print(f"Expected at: {VIDEO_PATH}")
        print(f"Download the Huttie walkthrough video to that location first.")
        sys.exit(1)

    print(f"Running Huttie validation...")
    print(f"Video: {video} ({video.stat().st_size / (1024*1024):.0f} MB)")

    result = run_pipeline(
        video_path=video,
        customer_name="Huttie_Validation",
        skip_whisper=args.skip_whisper,
        gemini_only=args.gemini_only,
        gemini_model=args.gemini_model,
        claude_model=args.claude_model,
        output_dir=Path(__file__).parent / "output" / "validation",
        save_intermediates=True,
    )

    if not result.ok:
        print(f"\nPipeline failed: {result.fatal_error}")
        sys.exit(1)

    passed = validate(result)
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
