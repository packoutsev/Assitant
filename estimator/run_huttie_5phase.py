"""Run Huttie/Capitan 5-phase estimate and compare to Diana's actual submitted estimate."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate

# Huttie/Capitan - 8150 E Del Capitan Dr, Scottsdale AZ 85258
# Charm Restoration job (25-108-C), Oct 27, 2025
# Estimator: Diana Ocegueda (under Matt's login)
#
# Diana's actual: $31,441.39 (with O&P and specialty handling)
# Core 5-phase total (excl specialty): $19,736.35
#   Phase 1 Packing: $5,486.22 (includes $528.65 tag supplies)
#   Phase 2 Move to Storage: $4,792.02 (51.5 LAB + 17.2 LABS hrs)
#   Phase 3 Storage: $2,350.00 (6 vault-months @ $250 + 200 SF climate)
#   Phase 4 Move from Storage: $4,792.02
#   Phase 5 Unpack/Reset: $2,316.09
# Plus: $11,705.04 specialty (fine art $9,000 + firearms $750 + O&P)
#
# Room-by-room counts from estimate:
# Kitchen: 1 TAG, 1 lg box
# Kitchen-Dining: 8 TAGs, 2 med, 8 pads
# Living+Formal Dining: 13 TAGs, 5 med + 1 bric-a-brac + 2 lg, 22 pads
# Formal Living: 4 TAGs, 4 med, 4 pads
# Entry & Hallway: 3 TAGs, 3 med, 3 pads
# Bed 1: 9 TAGs, 19 med + 1 wardrobe, 12 pads, mattress cover, TV box
# Bed 2: 24 TAGs, 32 med + 1 lg, 24 pads, mattress cover, TV box
# Primary: 14 TAGs, 12 med, 21 pads, mattress cover
# Primary Closet: 2 TAGs, 8 low-density + 8 high-density + 17 wardrobe
# Sitting Area: 6 TAGs, 7 med, 9 pads
# TOTALS: 84 TAGs, ~101 med boxes, 103 pads

# Room setup calibrated from visual walk-through photo study (all 16 pages)
rooms = [
    {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light',
     'override_tags': 1, 'override_boxes': 0},  # Nearly empty, 1 lg box only
    {'room_name': 'Kitchen-Dining', 'room_category': 'dining_room', 'density': 'heavy',
     'override_tags': 8, 'override_boxes': 2},  # Glass table + 6 chairs
    {'room_name': 'Living Room + Formal Dining', 'room_category': 'living_room', 'density': 'heavy',
     'override_tags': 13, 'override_boxes': 8},  # Sectional, tables, chairs, art
    {'room_name': 'Formal Living', 'room_category': 'living_room', 'density': 'medium'},
    {'room_name': 'Entry & Hallway', 'room_category': 'hallway', 'density': 'medium'},
    {'room_name': 'Bed 1', 'room_category': 'bedroom', 'density': 'heavy',
     'override_tags': 9, 'override_boxes': 20},
    {'room_name': 'Bed 2', 'room_category': 'bedroom', 'density': 'heavy',
     'override_tags': 24, 'override_boxes': 33},  # Massive shelving units
    {'room_name': 'Primary', 'room_category': 'bedroom', 'density': 'heavy'},
    {'room_name': 'Primary Closet', 'room_category': 'closet', 'density': 'heavy',
     'override_tags': 2, 'override_boxes': 33},  # Huge walk-in
    {'room_name': 'Sitting Area', 'room_category': 'other', 'density': 'medium',
     'override_tags': 6, 'override_boxes': 7},
]

walkthrough = analyze_from_rooms_json(rooms, density='medium')

# Huttie used CPS LAB/LABS split, not flat rate
# From cartage calculator: 51.5 LAB + 17.2 LABS = 68.7 total hours
# Using flat rate equivalent: we'll use $75/hr for comparison
result = generate_5phase_estimate(
    walkthrough=walkthrough,
    drive_time_min=30.0,              # Scottsdale to warehouse
    storage_vaults=3,                 # Diana used 3 vaults
    storage_duration_months=2,        # Diana used 2 months
    customer_name='Huttie, Capitan (5-Phase)',
    apply_corrections=False,          # Use raw counts (we have exact per-room data)
    output_dir=str(Path(__file__).parent / 'output'),
    target_margin=0.65,
    crew_size=3,
    truck_loads=2,                    # Diana used 2 van days
    carry_time_min=4.0,
)

print(result['summary'])
print()

# ── COMPARISON TO DIANA'S ACTUAL ──
print()
print("=" * 80)
print("COMPARISON: AI 5-PHASE vs DIANA'S ACTUAL ESTIMATE (core phases only)")
print("=" * 80)
print()
print("NOTE: Diana's estimate also includes $11,705 specialty handling (fine art + firearms)")
print("      and uses CPS LAB/LABS split billing, not flat rate.")
print()

# Diana's core 5-phase actuals (excluding specialty handling)
diana = {
    'Packout': 5486.22,
    'Handling to Storage': 4792.02,
    'Storage': 2350.00,
    'Handling from Storage': 4792.02,
    'Pack back': 2316.09,
}
diana_total = sum(diana.values())

# Collect AI phase totals
ai_phases = {}
for item in result['line_items']:
    phase = item['phase']
    ai_phases[phase] = ai_phases.get(phase, 0) + item['rcv']

print(f"{'Phase':<25} {'AI Estimate':>12} {'Diana Actual':>14} {'Diff':>10} {'Error':>8}")
print("-" * 72)
for phase in ['Packout', 'Handling to Storage', 'Storage', 'Handling from Storage', 'Pack back']:
    ai_val = ai_phases.get(phase, 0)
    diana_val = diana.get(phase, 0)
    diff = ai_val - diana_val
    err = (diff / diana_val * 100) if diana_val > 0 else 0
    print(f"{phase:<25} ${ai_val:>11,.2f} ${diana_val:>13,.2f} ${diff:>9,.2f} {err:>+7.1f}%")
print("-" * 72)
ai_total = result['total_rcv']
diff = ai_total - diana_total
err = (diff / diana_total * 100)
print(f"{'TOTAL (core)':<25} ${ai_total:>11,.2f} ${diana_total:>13,.2f} ${diff:>9,.2f} {err:>+7.1f}%")
print()

print(f"{'Metric':<25} {'AI':>10} {'Diana':>10}")
print("-" * 48)
print(f"{'TAGs':<25} {result['tags']:>10} {'84':>10}")
print(f"{'Med Boxes':<25} {result['boxes']:>10} {'~101':>10}")
print(f"{'Handling hrs (per dir)':<25} {result['handling_hours']:>10.1f} {'68.7 total':>10}")
