"""Run Schafer 5-phase estimate and compare to Diana's actual submitted estimate."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate

# Schafer - 8030 N. 55th Dr, Glendale AZ 85302
# Water loss, Feb 4, 2026, Liberty Mutual
# Estimator: Diana Ocegueda
#
# Diana's actual: full packout, $11,872.91 (with tax)
# 74 med boxes, 1 lg box, 31 TAGs, 20 pads
# 4 vaults x 2 months storage @ $195/mo
# 22.4 hr handling each direction @ $75/hr
# 2 van days each direction

# Room densities calibrated from visual walk-through photo study:
# - Kitchen: scope note "ONLY PACK OUT UNDER kitchen SINK" → light
# - Dining: round table + 4 chairs + shelf unit + gallery wall art → heavy
# - Living: EXTREME — sectional, daybed, 3 cube storage units, TV, entertainment
#   center, side tables, extensive wall art + 50+ boxes of shelf contents.
#   This room is beyond typical "heavy" — using overrides from visual count.
# - Closets: typical medium-density pantry and linen closets
rooms = [
    {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light',
     'override_tags': 0, 'override_boxes': 2},  # Under-sink only per scope note
    {'room_name': 'Dining Room', 'room_category': 'dining_room', 'density': 'heavy'},
    {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'heavy',
     'override_tags': 22, 'override_boxes': 54},  # Extreme density from visual study
    {'room_name': 'Pantry Closet', 'room_category': 'closet', 'density': 'medium'},
    {'room_name': 'Linen Closet', 'room_category': 'closet', 'density': 'medium'},
]

walkthrough = analyze_from_rooms_json(rooms, density='medium')

# Use Diana's parameters where known
result = generate_5phase_estimate(
    walkthrough=walkthrough,
    drive_time_min=35.0,              # ~17 miles, rush hour avg
    storage_vaults=4,                 # Diana used 4 vaults
    storage_duration_months=2,        # Diana used 2 months
    customer_name='Schafer, Tyler (5-Phase)',
    apply_corrections=True,
    output_dir=str(Path(__file__).parent / 'output'),
    target_margin=0.65,               # 65% labor margin -> ~$79/hr
    crew_size=3,                      # User specified
    truck_loads=2,                    # Diana used 2 van days
    carry_time_min=4.0,               # Reasonable for single-story
)

print(result['summary'])
print()
print(result['estimate_text'])
print()
print(result['labor_text'])

csv_path = result['csv_path']
if csv_path:
    print(f"\nCSV saved to: {csv_path}")

# ── COMPARISON TO DIANA'S ACTUAL ──
print()
print("=" * 80)
print("COMPARISON: AI 5-PHASE vs DIANA'S ACTUAL SUBMITTED ESTIMATE")
print("=" * 80)
print()

# Diana's actuals by phase
diana = {
    'Packout': 3330.72,
    'Handling to Storage': 2084.84,
    'Storage': 1560.00,
    'Handling from Storage': 2084.84,
    'Pack back': 2708.85,
}
diana_total = sum(diana.values())  # 11,769.25

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
print(f"{'TOTAL':<25} ${ai_total:>11,.2f} ${diana_total:>13,.2f} ${diff:>9,.2f} {err:>+7.1f}%")
print()

# Line item comparison
print(f"{'Metric':<25} {'AI':>10} {'Diana':>10}")
print("-" * 48)
print(f"{'TAGs':<25} {result['tags']:>10} {'31':>10}")
print(f"{'Med Boxes':<25} {result['boxes']:>10} {'74':>10}")
print(f"{'Lg Boxes':<25} {result['lg_boxes']:>10} {'1':>10}")
print(f"{'Handling hrs (per dir)':<25} {result['handling_hours']:>10.1f} {'22.4':>10}")
print(f"{'Handling rate':<25} ${result['handling_rate']:>9.2f} {'$75.00':>10}")
print(f"{'Storage (vault-months)':<25} {result['storage_months']:>10} {'8':>10}")
print(f"{'Van days (per dir)':<25} {'2':>10} {'2':>10}")
