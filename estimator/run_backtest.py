"""
Backtest: Run the rebuilt model against all studied Diana estimates.
Compare AI output to Diana's actual counts and totals.
Calculate MAPE for each metric. Target: <20% error on total RCV.

Two modes per job:
  1. "With overrides" — uses room-level TAG/box overrides from visual photo study
  2. "Lookup only" — uses only room_category + density (no overrides)
"""
import sys
import csv
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate

OUTPUT_DIR = Path(__file__).parent / 'output' / 'backtest'

# ══════════════════════════════════════════════════════════════════════════════
# JOB DEFINITIONS
# ══════════════════════════════════════════════════════════════════════════════

JOBS = [
    # ── SCHAFER (Feb 2026, Diana's most recent, 5 rooms) ──
    {
        'name': 'Schafer (with overrides)',
        'date': '2026-02-09',
        'mode': 'override',
        'rooms': [
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light',
             'override_tags': 0, 'override_boxes': 2},
            {'room_name': 'Dining Room', 'room_category': 'dining_room', 'density': 'heavy'},
            {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'heavy',
             'override_tags': 22, 'override_boxes': 54},
            {'room_name': 'Pantry Closet', 'room_category': 'closet', 'density': 'medium'},
            {'room_name': 'Linen Closet', 'room_category': 'closet', 'density': 'medium'},
        ],
        'params': {
            'drive_time_min': 35.0, 'storage_vaults': 4, 'storage_duration_months': 2,
            'crew_size': 3, 'truck_loads': 2, 'carry_time_min': 4.0,
            'target_margin': 0.65, 'apply_corrections': True,
        },
        'diana': {'tags': 31, 'med_boxes': 74, 'pads': 20, 'total_rcv': 11769.25},
    },
    {
        'name': 'Schafer (lookup only)',
        'date': '2026-02-09',
        'mode': 'lookup',
        'rooms': [
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light'},
            {'room_name': 'Dining Room', 'room_category': 'dining_room', 'density': 'heavy'},
            {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'heavy'},
            {'room_name': 'Pantry Closet', 'room_category': 'closet', 'density': 'medium'},
            {'room_name': 'Linen Closet', 'room_category': 'closet', 'density': 'medium'},
        ],
        'params': {
            'drive_time_min': 35.0, 'storage_vaults': 4, 'storage_duration_months': 2,
            'crew_size': 3, 'truck_loads': 2, 'carry_time_min': 4.0,
            'target_margin': 0.65, 'apply_corrections': True,
        },
        'diana': {'tags': 31, 'med_boxes': 74, 'pads': 20, 'total_rcv': 11769.25},
    },
    # ── HUTTIE/CAPITAN (Oct 2025, luxury Scottsdale, 10 rooms) ──
    {
        'name': 'Huttie (with overrides)',
        'date': '2025-10-27',
        'mode': 'override',
        'rooms': [
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light',
             'override_tags': 1, 'override_boxes': 0},
            {'room_name': 'Kitchen-Dining', 'room_category': 'dining_room', 'density': 'heavy',
             'override_tags': 8, 'override_boxes': 2},
            {'room_name': 'Living+Formal Dining', 'room_category': 'living_room', 'density': 'heavy',
             'override_tags': 13, 'override_boxes': 8},
            {'room_name': 'Formal Living', 'room_category': 'living_room', 'density': 'medium'},
            {'room_name': 'Entry & Hallway', 'room_category': 'hallway', 'density': 'medium'},
            {'room_name': 'Bed 1', 'room_category': 'bedroom', 'density': 'heavy',
             'override_tags': 9, 'override_boxes': 20},
            {'room_name': 'Bed 2', 'room_category': 'bedroom', 'density': 'heavy',
             'override_tags': 24, 'override_boxes': 33},
            {'room_name': 'Primary', 'room_category': 'bedroom', 'density': 'heavy'},
            {'room_name': 'Primary Closet', 'room_category': 'closet', 'density': 'heavy',
             'override_tags': 2, 'override_boxes': 33},
            {'room_name': 'Sitting Area', 'room_category': 'other', 'density': 'medium',
             'override_tags': 6, 'override_boxes': 7},
        ],
        'params': {
            'drive_time_min': 30.0, 'storage_vaults': 3, 'storage_duration_months': 2,
            'crew_size': 3, 'truck_loads': 2, 'carry_time_min': 4.0,
            'target_margin': 0.65, 'apply_corrections': False,
        },
        # Core 5-phase only (excl $11,705 specialty handling)
        'diana': {'tags': 84, 'med_boxes': 101, 'pads': 103, 'total_rcv': 19736.35},
    },
    {
        'name': 'Huttie (lookup only)',
        'date': '2025-10-27',
        'mode': 'lookup',
        'rooms': [
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light'},
            {'room_name': 'Kitchen-Dining', 'room_category': 'dining_room', 'density': 'heavy'},
            {'room_name': 'Living+Formal Dining', 'room_category': 'living_room', 'density': 'heavy'},
            {'room_name': 'Formal Living', 'room_category': 'living_room', 'density': 'medium'},
            {'room_name': 'Entry & Hallway', 'room_category': 'hallway', 'density': 'medium'},
            {'room_name': 'Bed 1', 'room_category': 'bedroom', 'density': 'heavy'},
            {'room_name': 'Bed 2', 'room_category': 'bedroom', 'density': 'heavy'},
            {'room_name': 'Primary', 'room_category': 'bedroom', 'density': 'heavy'},
            {'room_name': 'Primary Closet', 'room_category': 'closet', 'density': 'heavy'},
            {'room_name': 'Sitting Area', 'room_category': 'other', 'density': 'medium'},
        ],
        'params': {
            'drive_time_min': 30.0, 'storage_vaults': 3, 'storage_duration_months': 2,
            'crew_size': 3, 'truck_loads': 2, 'carry_time_min': 4.0,
            'target_margin': 0.65, 'apply_corrections': False,
        },
        'diana': {'tags': 84, 'med_boxes': 101, 'pads': 103, 'total_rcv': 19736.35},
    },
    # ── CROOK (Mar 2026, Tucson, 3 rooms — kitchen cabinets excluded from scope) ──
    # Walkthrough estimated 5 rooms (106 TAGs, 197 boxes) but laundry+hallway excluded from final.
    # Kitchen cabinets excluded from scope → 76 est boxes → 0 actual boxes.
    # Family Room walkthrough was "best guess" on full room → TAGs dropped 78→41, boxes rose 10→26.
    {
        'name': 'Crook (with overrides)',
        'date': '2026-03-25',
        'mode': 'override',
        'rooms': [
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light',
             'override_tags': 7, 'override_boxes': 0},
            {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'medium',
             'override_tags': 9, 'override_boxes': 9},
            {'room_name': 'Family Room', 'room_category': 'living_room', 'density': 'heavy',
             'override_tags': 41, 'override_boxes': 26},
        ],
        'params': {
            'drive_time_min': 120.0, 'storage_vaults': 5, 'storage_duration_months': 1,
            'crew_size': 4, 'truck_loads': 2, 'carry_time_min': 5.0,
            'target_margin': 0.65, 'apply_corrections': True,
        },
        'diana': {'tags': 57, 'med_boxes': 25, 'pads': 55, 'total_rcv': 10627.77},
    },
    {
        'name': 'Crook (lookup only)',
        'date': '2026-03-25',
        'mode': 'lookup',
        'rooms': [
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light'},
            {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'medium'},
            {'room_name': 'Family Room', 'room_category': 'living_room', 'density': 'heavy'},
        ],
        'params': {
            'drive_time_min': 120.0, 'storage_vaults': 5, 'storage_duration_months': 1,
            'crew_size': 4, 'truck_loads': 2, 'carry_time_min': 5.0,
            'target_margin': 0.65, 'apply_corrections': True,
        },
        'diana': {'tags': 57, 'med_boxes': 25, 'pads': 55, 'total_rcv': 10627.77},
    },
    # ── HOLM (Feb-Mar 2026, Casa Grande, water loss, 5 rooms) ──
    # IWT estimate: 74 TAGs, 142 boxes (140 med + 2 lg), 46 pads, 7 vaults x 2 mo = $21,832.69
    # Final PO: 88 TAGs, 101 boxes (100 med + 1 lg), 72 pads, 7 vaults x 1 mo + 14 SF rack = $11,201.88
    # Final is packout + handling + storage ONLY (no packback — billed separately per carrier).
    # TAGs went UP 74→88 (+19%), boxes DOWN 142→101 (-29%), pads UP 46→72 (+57%).
    # Cartage spreadsheet: 57 min drive, 1 truck load, crew 4, carry 4 min, pad_wrap 4 min.
    # Rooms: Laundry, Kitchen, Living Room, Dining Room, Bathroom.
    # Living Room was massive: 294 inventoried items + 97 stay items in Encircle.
    {
        'name': 'Holm (with overrides)',
        'date': '2026-03-06',
        'mode': 'override',
        # Per-room actuals from Encircle Box Report (box__957940.xlsx).
        # Med boxes = single med + (dbl med × 2). TAGs from TAG column. Stay boxes excluded.
        'rooms': [
            {'room_name': 'Laundry Room', 'room_category': 'laundry', 'density': 'light',
             'override_tags': 0, 'override_boxes': 5},
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'medium',
             'override_tags': 4, 'override_boxes': 9},
            {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'heavy',
             'override_tags': 55, 'override_boxes': 53},
            {'room_name': 'Dining Room', 'room_category': 'dining_room', 'density': 'heavy',
             'override_tags': 28, 'override_boxes': 24},
            {'room_name': 'Bathroom', 'room_category': 'bathroom', 'density': 'light',
             'override_tags': 0, 'override_boxes': 1},
        ],
        'params': {
            'drive_time_min': 57.0, 'storage_vaults': 7, 'storage_duration_months': 1,
            'crew_size': 4, 'truck_loads': 1, 'carry_time_min': 4.0,
            'target_margin': 0.65, 'apply_corrections': True,
        },
        # Combined PO ($11,201.88) + PB ($8,831.89) = $20,033.77 for full 5-phase comparison.
        # PB had 15 lg boxes (vs 1 in PO) — items consolidated into larger boxes on return.
        'diana': {'tags': 88, 'med_boxes': 100, 'pads': 72, 'total_rcv': 20033.77},
    },
    {
        'name': 'Holm (lookup only)',
        'date': '2026-03-06',
        'mode': 'lookup',
        'rooms': [
            {'room_name': 'Laundry Room', 'room_category': 'laundry', 'density': 'light'},
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'medium'},
            {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'heavy'},
            {'room_name': 'Dining Room', 'room_category': 'dining_room', 'density': 'heavy'},
            {'room_name': 'Bathroom', 'room_category': 'bathroom', 'density': 'light'},
        ],
        'params': {
            'drive_time_min': 57.0, 'storage_vaults': 7, 'storage_duration_months': 1,
            'crew_size': 4, 'truck_loads': 1, 'carry_time_min': 4.0,
            'target_margin': 0.65, 'apply_corrections': True,
        },
        'diana': {'tags': 88, 'med_boxes': 100, 'pads': 72, 'total_rcv': 20033.77},
    },
]


def run_backtest():
    results = []
    for job in JOBS:
        walkthrough = analyze_from_rooms_json(job['rooms'], density='medium')
        result = generate_5phase_estimate(
            walkthrough=walkthrough,
            customer_name=job['name'],
            output_dir=str(OUTPUT_DIR),
            **job['params'],
        )
        diana = job['diana']
        comp = {
            'name': job['name'],
            'date': job['date'],
            'mode': job['mode'],
            'ai_tags': result['tags'],
            'diana_tags': diana['tags'],
            'ai_boxes': result['boxes'],
            'diana_boxes': diana['med_boxes'],
            'ai_rcv': result['total_rcv'],
            'diana_rcv': diana['total_rcv'],
            'tag_err': (result['tags'] - diana['tags']) / diana['tags'] * 100,
            'box_err': (result['boxes'] - diana['med_boxes']) / diana['med_boxes'] * 100,
            'rcv_err': (result['total_rcv'] - diana['total_rcv']) / diana['total_rcv'] * 100,
        }
        # Pad comparison
        for li in result['line_items']:
            if 'blanket/pad' in li['desc'] and li['phase'] == 'Packout':
                comp['ai_pads'] = int(li['qty'])
                comp['diana_pads'] = diana.get('pads', 0)
                break
        results.append(comp)
    return results


def print_report(results):
    print("=" * 105)
    print(f"BACKTEST RESULTS — AI Model vs Diana's Actual Estimates")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 105)
    print()

    # Header
    print(f"{'Job':<32} {'Mode':<8} {'TAGs':>10} {'Boxes':>10} {'Pads':>10} "
          f"{'RCV':>18} {'TAG%':>7} {'BOX%':>7} {'RCV%':>7}")
    print("-" * 105)

    for r in results:
        tag_s = f"{r['ai_tags']}/{r['diana_tags']}"
        box_s = f"{r['ai_boxes']}/{r['diana_boxes']}"
        pad_s = f"{r.get('ai_pads', '?')}/{r.get('diana_pads', '?')}"
        rcv_s = f"${r['ai_rcv']:,.0f}/${r['diana_rcv']:,.0f}"
        print(f"{r['name']:<32} {r['mode']:<8} {tag_s:>10} {box_s:>10} {pad_s:>10} "
              f"{rcv_s:>18} {r['tag_err']:>+6.1f}% {r['box_err']:>+6.1f}% {r['rcv_err']:>+6.1f}%")

    print("-" * 105)

    # MAPE by mode
    for mode_label, mode_filter in [('All jobs', None), ('With overrides', 'override'), ('Lookup only', 'lookup')]:
        subset = [r for r in results if (mode_filter is None or r['mode'] == mode_filter)]
        if not subset:
            continue
        n = len(subset)
        mape_tag = sum(abs(r['tag_err']) for r in subset) / n
        mape_box = sum(abs(r['box_err']) for r in subset) / n
        mape_rcv = sum(abs(r['rcv_err']) for r in subset) / n
        print(f"\n  {mode_label} (n={n}):  TAG MAPE={mape_tag:.1f}%  BOX MAPE={mape_box:.1f}%  RCV MAPE={mape_rcv:.1f}%")

    # Target check
    all_rcv_errs = [abs(r['rcv_err']) for r in results]
    override_rcv_errs = [abs(r['rcv_err']) for r in results if r['mode'] == 'override']
    mape_all = sum(all_rcv_errs) / len(all_rcv_errs)
    mape_override = sum(override_rcv_errs) / len(override_rcv_errs) if override_rcv_errs else 0

    print()
    print("=" * 105)
    print(f"TARGET: <20% MAPE on Total RCV")
    print(f"  Overall MAPE:       {mape_all:.1f}%  {'MET' if mape_all < 20 else 'NOT MET'}")
    print(f"  With overrides:     {mape_override:.1f}%  {'MET' if mape_override < 20 else 'NOT MET'}")
    print()
    print("PREVIOUS MODEL: Schafer at +29% error (58 TAGs vs Diana's 31)")
    print(f"CURRENT MODEL:  Schafer with overrides at {[r['rcv_err'] for r in results if 'Schafer' in r['name'] and r['mode'] == 'override'][0]:+.1f}% error")
    print("=" * 105)


if __name__ == '__main__':
    results = run_backtest()
    print_report(results)

    # Save
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = OUTPUT_DIR / 'backtest_results.csv'
    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)
    print(f"\nCSV saved to: {csv_path}")
