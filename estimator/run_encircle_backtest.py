"""
Encircle Pipeline Backtest
Run the full Encircle-to-estimate pipeline against jobs with known Diana estimates.
Compare pipeline RCV vs Diana's RCV. Calculate MAPE. Target: <5%.

Usage:
    python estimator/run_encircle_backtest.py              # run all jobs
    python estimator/run_encircle_backtest.py --job Hill    # run one job
    python estimator/run_encircle_backtest.py --report-only # just report from saved results
"""
import sys
import csv
import json
import time
import argparse
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from encircle_pipeline import run_encircle_pipeline

OUTPUT_DIR = Path(__file__).parent / 'output' / 'encircle_backtest'

# Post-acquisition jobs with Diana/Xactimate ground truth RCV
# Sorted by recency (most recent first)
JOBS = [
    # ── Recent jobs (Nov 2025 - Feb 2026) ──
    {
        'name': 'Hart, Frank',
        'claim_id': '4221766',
        'diana_rcv': 35187.66,
        'diana_tags': 144,
        'diana_boxes': 217,
        'drive_time_min': 25.0,
        'notes': 'Jan 2026, large job (owner corrected: 217 boxes not 444)',
    },
    {
        'name': 'Campbell, Erik',
        'claim_id': '4277645',
        'diana_rcv': 13621.29,
        'diana_tags': 142,
        'diana_boxes': 120,
        'drive_time_min': 25.0,
        'notes': 'Jan 2026',
    },
    {
        'name': 'Love, Toni',
        'claim_id': '4203636',
        'diana_rcv': 30265.55,
        'diana_tags': 180,
        'diana_boxes': 230,
        'drive_time_min': 25.0,
        'notes': 'Dec 2025, large job, 24 videos (owner corrected: 230 boxes not 412)',
    },
    {
        'name': 'Schmitt, Liz',
        'claim_id': '4164910',
        'diana_rcv': 16458.62,
        'diana_tags': 222,
        'diana_boxes': 116,
        'drive_time_min': 25.0,
        'notes': 'Dec 2025, PACK-TO-POD (2x 16x8 pods on-site, no offsite storage)',
        'exclude': True,  # Not a standard 5-phase packout
    },
    {
        'name': 'Harvey, Curtis',
        'claim_id': '4082061',
        'diana_rcv': 14211.55,
        'diana_tags': 156,
        'diana_boxes': 108,
        'drive_time_min': 25.0,
        'notes': 'Nov 2025',
    },
    {
        'name': 'Smith (Huttie)',
        'claim_id': '4056751',
        'diana_rcv': 19736.35,
        'diana_tags': 84,
        'diana_boxes': 101,
        'drive_time_min': 30.0,
        'notes': 'Oct 2025, luxury Scottsdale, water loss',
    },
    # ── Oct 2025 jobs ──
    {
        'name': 'Morganroth, Liz',
        'claim_id': '4039469',
        'diana_rcv': 6611.14,
        'diana_tags': 0,
        'diana_boxes': 0,
        'drive_time_min': 25.0,
        'notes': 'Oct 2025',
    },
    {
        'name': 'Rendell, Dawn',
        'claim_id': '4032787',
        'diana_rcv': 11259.94,
        'diana_tags': 52,
        'diana_boxes': 106,
        'drive_time_min': 25.0,
        'notes': 'Oct 2025',
    },
    {
        'name': 'Duginski, Claire',
        'claim_id': '4014181',
        'diana_rcv': 6375.77,
        'diana_tags': 31,
        'diana_boxes': 50,
        'drive_time_min': 25.0,
        'notes': 'Oct 2025, two phases',
    },
    # ── Older post-acq with good data ──
    {
        'name': 'Szymanski, James',
        'claim_id': '3915072',
        'diana_rcv': 28102.73,
        'diana_tags': 18,
        'diana_boxes': 281,
        'drive_time_min': 25.0,
        'notes': 'Aug 2025, PO phase, box-heavy',
    },
    {
        'name': 'Susank, David',
        'claim_id': '3616317',
        'diana_rcv': 20962.15,
        'diana_tags': 65,
        'diana_boxes': 284,
        'drive_time_min': 25.0,
        'notes': 'May 2025, basement flood, box-heavy',
    },
    {
        'name': 'Qaqish, Mark',
        'claim_id': '3331206',
        'diana_rcv': 44161.75,
        'diana_tags': 149,
        'diana_boxes': 370,
        'drive_time_min': 25.0,
        'notes': 'Jan 2025, 11 rooms, very heavy',
    },
]


def run_single_job(job: dict, force_rerun: bool = False) -> dict:
    """Run the pipeline for a single job and return comparison metrics."""
    name = job['name']
    claim_id = job['claim_id']
    diana_rcv = job['diana_rcv']

    # Check for cached result
    result_file = OUTPUT_DIR / f"{name.replace(' ', '_').replace(',', '')}_result.json"
    if result_file.exists() and not force_rerun:
        with open(result_file) as f:
            cached = json.load(f)
        print(f"  [{name}] Using cached result: ${cached['ai_rcv']:,.2f}")
        return cached

    print(f"\n{'='*70}")
    print(f"  BACKTEST: {name} (claim {claim_id})")
    print(f"  Diana RCV: ${diana_rcv:,.2f}")
    print(f"{'='*70}")

    start = time.time()
    try:
        result = run_encircle_pipeline(
            claim_id=claim_id,
            output_base=str(OUTPUT_DIR),
            drive_time_min=job.get('drive_time_min', 25.0),
            storage_duration_months=2,
        )
        elapsed = time.time() - start

        if not result.ok:
            print(f"  ERROR: {result.error}")
            comp = {
                'name': name,
                'claim_id': claim_id,
                'diana_rcv': diana_rcv,
                'diana_tags': job['diana_tags'],
                'diana_boxes': job['diana_boxes'],
                'ai_rcv': 0,
                'ai_tags': 0,
                'ai_boxes': 0,
                'ai_rooms': 0,
                'rcv_err_pct': -100.0,
                'error': result.error,
                'elapsed_s': elapsed,
            }
        else:
            ai_rcv = result.total_rcv
            est = result.estimate_result or {}
            ai_tags = est.get('tags', 0)
            ai_boxes = est.get('boxes', 0)
            ai_rooms = est.get('rooms', 0)

            rcv_err = ((ai_rcv - diana_rcv) / diana_rcv * 100) if diana_rcv else 0

            comp = {
                'name': name,
                'claim_id': claim_id,
                'diana_rcv': diana_rcv,
                'diana_tags': job['diana_tags'],
                'diana_boxes': job['diana_boxes'],
                'ai_rcv': ai_rcv,
                'ai_tags': ai_tags,
                'ai_boxes': ai_boxes,
                'ai_rooms': ai_rooms,
                'rcv_err_pct': rcv_err,
                'error': '',
                'elapsed_s': elapsed,
            }

            print(f"\n  RESULT: ${ai_rcv:,.2f} vs Diana ${diana_rcv:,.2f} ({rcv_err:+.1f}%)")
            print(f"  Tags: {ai_tags} vs {job['diana_tags']}, Boxes: {ai_boxes} vs {job['diana_boxes']}")
            print(f"  Time: {elapsed:.0f}s")

    except Exception as e:
        elapsed = time.time() - start
        print(f"  EXCEPTION: {e}")
        comp = {
            'name': name,
            'claim_id': claim_id,
            'diana_rcv': diana_rcv,
            'diana_tags': job['diana_tags'],
            'diana_boxes': job['diana_boxes'],
            'ai_rcv': 0,
            'ai_tags': 0,
            'ai_boxes': 0,
            'ai_rooms': 0,
            'rcv_err_pct': -100.0,
            'error': str(e),
            'elapsed_s': elapsed,
        }

    # Cache result
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(result_file, 'w') as f:
        json.dump(comp, f, indent=2)

    return comp


def print_report(results: list[dict]):
    """Print backtest results table and MAPE summary."""
    print("\n" + "=" * 110)
    print("ENCIRCLE PIPELINE BACKTEST RESULTS")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 110)

    # Header
    print(f"\n{'Job':<25} {'Diana RCV':>12} {'AI RCV':>12} {'RCV Err':>8} "
          f"{'Tags D/AI':>10} {'Boxes D/AI':>12} {'Rooms':>5} {'Time':>6}")
    print("-" * 110)

    successes = []
    for r in results:
        if r.get('error'):
            print(f"{r['name']:<25} ${r['diana_rcv']:>10,.0f}  {'ERROR':>12}  "
                  f"{'':>8} {'':>10} {'':>12} {'':>5} {r['elapsed_s']:>5.0f}s")
            continue

        successes.append(r)
        tag_s = f"{r['diana_tags']}/{r['ai_tags']}"
        box_s = f"{r['diana_boxes']}/{r['ai_boxes']}"
        print(f"{r['name']:<25} ${r['diana_rcv']:>10,.0f} ${r['ai_rcv']:>10,.0f} "
              f"{r['rcv_err_pct']:>+7.1f}% {tag_s:>10} {box_s:>12} "
              f"{r['ai_rooms']:>5} {r['elapsed_s']:>5.0f}s")

    print("-" * 110)

    if not successes:
        print("\nNo successful runs to analyze.")
        return

    # MAPE calculation
    n = len(successes)
    mape_rcv = sum(abs(r['rcv_err_pct']) for r in successes) / n

    # Tag/box MAPE (skip if diana value is 0)
    tag_errs = [abs(r['ai_tags'] - r['diana_tags']) / r['diana_tags'] * 100
                for r in successes if r['diana_tags'] > 0]
    box_errs = [abs(r['ai_boxes'] - r['diana_boxes']) / r['diana_boxes'] * 100
                for r in successes if r['diana_boxes'] > 0]

    mape_tags = sum(tag_errs) / len(tag_errs) if tag_errs else 0
    mape_boxes = sum(box_errs) / len(box_errs) if box_errs else 0

    # Median absolute error
    rcv_abs_errs = sorted(abs(r['rcv_err_pct']) for r in successes)
    median_rcv_err = rcv_abs_errs[len(rcv_abs_errs) // 2]

    # Signed mean error (bias direction)
    mean_signed = sum(r['rcv_err_pct'] for r in successes) / n

    total_diana = sum(r['diana_rcv'] for r in successes)
    total_ai = sum(r['ai_rcv'] for r in successes)
    total_err = (total_ai - total_diana) / total_diana * 100

    print(f"\nSUMMARY ({n} jobs):")
    print(f"  RCV MAPE:           {mape_rcv:.1f}%  (target: <5%)")
    print(f"  RCV Median Abs Err: {median_rcv_err:.1f}%")
    print(f"  RCV Mean Signed:    {mean_signed:+.1f}% ({'over' if mean_signed > 0 else 'under'}-estimating)")
    print(f"  TAG MAPE:           {mape_tags:.1f}% (n={len(tag_errs)})")
    print(f"  BOX MAPE:           {mape_boxes:.1f}% (n={len(box_errs)})")
    print(f"  Total Diana:        ${total_diana:>12,.2f}")
    print(f"  Total AI:           ${total_ai:>12,.2f} ({total_err:+.1f}%)")
    print(f"  Total elapsed:      {sum(r['elapsed_s'] for r in results):.0f}s")

    # Per-job breakdown
    print(f"\n  Worst over-estimate:  {max(successes, key=lambda r: r['rcv_err_pct'])['name']} "
          f"({max(r['rcv_err_pct'] for r in successes):+.1f}%)")
    print(f"  Worst under-estimate: {min(successes, key=lambda r: r['rcv_err_pct'])['name']} "
          f"({min(r['rcv_err_pct'] for r in successes):+.1f}%)")

    target_met = "YES" if mape_rcv < 5 else "NO"
    print(f"\n  TARGET <5% MAPE: {target_met} ({mape_rcv:.1f}%)")
    print("=" * 110)


def remerge_single_job(job: dict, skip_photos: bool = False, single_video: bool = False,
                       handling_rate: float = None, bump_density: bool = False,
                       blend_factor: float = 1.0) -> dict:
    """Re-merge a job from saved per-video rooms JSON files.

    This is FAST (no Gemini API calls) — just re-applies merge logic
    and re-generates the estimate from already-saved intermediate files.

    If single_video=True, only uses v1 (the walkthrough video) — no merge needed.
    If handling_rate is set, uses that rate instead of the default 65% margin rate.
    """
    from encircle_pipeline import _merge_rooms, _supplement_rooms_with_photos, _apply_lookup_floor, _backfill_from_encircle
    from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate

    name = job['name']
    claim_id = job['claim_id']
    diana_rcv = job['diana_rcv']

    # Find the job output directory
    # Try common name patterns
    job_dirs = list(OUTPUT_DIR.glob("*"))
    job_dir = None
    for d in job_dirs:
        if not d.is_dir():
            continue
        dname = d.name.lower()
        # Match by claim_id or name-based folder
        if claim_id in d.name or name.replace(', ', '_').replace(' ', '_') in d.name:
            job_dir = d
            break
        # Fuzzy: last name (at least 4 chars to avoid false matches like "Liz")
        parts = name.replace('(', ',').replace(')', '').split(',')
        last = parts[0].strip()
        first = parts[1].strip() if len(parts) > 1 else ""
        if len(last) >= 4 and last.lower() in dname:
            job_dir = d
            break
        if len(first) >= 4 and first.lower() in dname:
            job_dir = d
            break

    if not job_dir:
        print(f"  [{name}] No output directory found — skipping")
        return None

    # Load per-video rooms JSON files
    room_files = sorted(job_dir.glob("*_v*_rooms.json"))
    if not room_files:
        print(f"  [{name}] No per-video rooms files in {job_dir.name} — skipping")
        return None

    if single_video:
        # Only use the first video (v1 = walkthrough)
        v1_files = [f for f in room_files if '_v1_rooms.json' in f.name]
        if not v1_files:
            print(f"  [{name}] No v1 rooms file found — skipping")
            return None
        room_files = v1_files

    all_rooms = []
    for rf in room_files:
        with open(rf) as f:
            rooms = json.load(f)
        all_rooms.extend(rooms)
        print(f"  [{name}] {rf.name}: {len(rooms)} rooms")

    # Load Encircle rooms
    encircle_rooms_file = job_dir / "encircle_rooms.json"
    encircle_rooms = []
    if encircle_rooms_file.exists():
        with open(encircle_rooms_file) as f:
            encircle_rooms = json.load(f)

    mode_label = "SINGLE-VIDEO" if single_video else "MULTI-VIDEO"
    print(f"  [{name}] {len(all_rooms)} raw rooms from {len(room_files)} video(s) [{mode_label}], "
          f"{len(encircle_rooms)} Encircle rooms")

    # Apply merge logic (still useful even for single video to cap by Encircle room structure)
    merged = _merge_rooms(all_rooms, encircle_rooms=encircle_rooms)
    print(f"  [{name}] Merged: {len(all_rooms)} -> {len(merged)} rooms")

    # Photo supplement (optional)
    if not skip_photos:
        # Find photo files grouped by room
        from build_visual_training import classify_room
        photos_by_room = {}
        for photo_dir in sorted(job_dir.iterdir()):
            if photo_dir.is_dir() and photo_dir.name.startswith("photos_"):
                room_name = photo_dir.name.replace("photos_", "").replace("_", " ")
                photos = [str(p) for p in sorted(photo_dir.glob("*.jpg"))]
                if photos:
                    photos_by_room[room_name] = photos

        # Also check for flat photo files grouped by Encircle room labels
        # (photos are typically stored flat in the job dir, grouped by download order)
        # For now, skip photo supplement in remerge — it requires Gemini API calls
        if photos_by_room:
            print(f"  [{name}] Photo supplement skipped in remerge (requires API)")

    # Backfill rooms from Encircle that video missed
    if encircle_rooms:
        merged = _backfill_from_encircle(merged, encircle_rooms)

    # Apply lookup table floor (prevents video under-counting)
    merged = _apply_lookup_floor(merged, bump_density=bump_density, blend_factor=blend_factor)

    # Generate estimate
    customer_name = job_dir.name
    walkthrough = analyze_from_rooms_json(merged)
    est_kwargs = dict(
        walkthrough=walkthrough,
        drive_time_min=job.get('drive_time_min', 25.0),
        storage_duration_months=2,
        customer_name=customer_name,
        apply_corrections=True,
        output_dir=str(job_dir),
    )
    if handling_rate is not None:
        est_kwargs['handling_rate'] = handling_rate
    est = generate_5phase_estimate(**est_kwargs)

    ai_rcv = est['total_rcv']
    rcv_err = ((ai_rcv - diana_rcv) / diana_rcv * 100) if diana_rcv else 0

    comp = {
        'name': name,
        'claim_id': claim_id,
        'diana_rcv': diana_rcv,
        'diana_tags': job['diana_tags'],
        'diana_boxes': job['diana_boxes'],
        'ai_rcv': ai_rcv,
        'ai_tags': est['tags'],
        'ai_boxes': est['boxes'],
        'ai_rooms': est['rooms'],
        'rcv_err_pct': rcv_err,
        'error': '',
        'elapsed_s': 0,
    }

    mode_tag = "SINGLE-VIDEO" if single_video else "REMERGE"
    print(f"  [{name}] {mode_tag}: ${ai_rcv:,.2f} vs Diana ${diana_rcv:,.2f} ({rcv_err:+.1f}%)")
    print(f"  Tags: {est['tags']} vs {job['diana_tags']}, Boxes: {est['boxes']} vs {job['diana_boxes']}")

    # Save result
    result_file = OUTPUT_DIR / f"{name.replace(' ', '_').replace(',', '')}_result.json"
    with open(result_file, 'w') as f:
        json.dump(comp, f, indent=2)

    return comp


def main():
    parser = argparse.ArgumentParser(description='Encircle Pipeline Backtest')
    parser.add_argument('--job', help='Run specific job (substring match)')
    parser.add_argument('--report-only', action='store_true', help='Report from cached results')
    parser.add_argument('--force', action='store_true', help='Force re-run (ignore cache)')
    parser.add_argument('--skip-photos', action='store_true', help='Skip photo supplement')
    parser.add_argument('--remerge', action='store_true',
                        help='Re-merge from saved per-video rooms (fast, no API calls)')
    parser.add_argument('--single-video', action='store_true',
                        help='Use only v1 (walkthrough video) — skip multi-video merge')
    parser.add_argument('--diana-rate', action='store_true',
                        help='Use Diana-equivalent handling rate ($58.70/hr) instead of 65% margin ($79.04/hr)')
    parser.add_argument('--bump-density', action='store_true',
                        help='Bump density one tier higher for lookup floor (compensates for video under-assessment)')
    parser.add_argument('--blend', type=float, default=1.0,
                        help='Blend factor for lookup floor (0.0=no floor, 0.5=halfway, 1.0=full max)')
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Filter jobs (exclude pack-to-pod and other non-standard jobs)
    jobs = [j for j in JOBS if not j.get('exclude')]
    if args.job:
        jobs = [j for j in JOBS if args.job.lower() in j['name'].lower()]
        if not jobs:
            print(f"No jobs matching '{args.job}'")
            sys.exit(1)

    if args.report_only:
        # Load cached results
        results = []
        for job in jobs:
            rf = OUTPUT_DIR / f"{job['name'].replace(' ', '_').replace(',', '')}_result.json"
            if rf.exists():
                with open(rf) as f:
                    results.append(json.load(f))
            else:
                print(f"  No cached result for {job['name']}")
        print_report(results)
        return

    if args.remerge:
        # Re-merge from saved per-video rooms (no API calls)
        results = []
        for i, job in enumerate(jobs):
            print(f"\n[{i+1}/{len(jobs)}] Remerging {job['name']}...")
            rate = 58.70 if args.diana_rate else None
            comp = remerge_single_job(job, skip_photos=args.skip_photos,
                                     single_video=args.single_video,
                                     handling_rate=rate,
                                     bump_density=args.bump_density,
                                     blend_factor=args.blend)
            if comp:
                results.append(comp)
        if results:
            csv_path = OUTPUT_DIR / 'encircle_backtest_results.csv'
            with open(csv_path, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=results[0].keys())
                writer.writeheader()
                writer.writerows(results)
        print_report(results)
        return

    # Run backtest
    results = []
    for i, job in enumerate(jobs):
        print(f"\n[{i+1}/{len(jobs)}] {job['name']}...")
        comp = run_single_job(job, force_rerun=args.force)
        results.append(comp)

    # Save combined results
    csv_path = OUTPUT_DIR / 'encircle_backtest_results.csv'
    if results:
        with open(csv_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)

    print_report(results)
    print(f"\nCSV saved to: {csv_path}")


if __name__ == '__main__':
    main()
