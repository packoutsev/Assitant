"""Run Campbell estimate using packout photo report densities and compare to actual inventory."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from generate_estimate import analyze_from_rooms_json, generate_estimate

# Rooms with densities re-assessed from packout photos:
# Family Room: 13 TAGs (sofa pieces, tables, chairs, ottoman, carpet), ~2 boxes -> heavy
# Bedroom: 4 TAGs (desk parts, mattress bags, storage tote), 12 boxes -> medium
# Storage Room: 5 TAGs + 13 boxes in a small space -> heavy
# Bathroom: 0 TAGs, 1 box of toiletries -> light
# Living Room: 14 TAGs (sectional=4, Christmas tree, pillows each tagged), 9 boxes -> heavy
# Kitchen: 9 TAGs (table/chairs) + 45 boxes (dishes, utensils, appliances) -> heavy
# Laundry Room: 0 TAGs, 1 box -> light
# Pantry items STAYED (not packed) -> excluded

rooms = [
    {'room_name': 'Family Room', 'room_category': 'living_room', 'density': 'heavy'},
    {'room_name': 'Bedroom', 'room_category': 'bedroom', 'density': 'medium'},
    {'room_name': 'Storage Room', 'room_category': 'closet', 'density': 'heavy'},
    {'room_name': 'Bathroom', 'room_category': 'bathroom', 'density': 'light'},
    {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'heavy'},
    {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'heavy'},
    {'room_name': 'Laundry Room', 'room_category': 'laundry', 'density': 'light'},
]

walkthrough = analyze_from_rooms_json(rooms, density='medium')

result = generate_estimate(
    walkthrough=walkthrough,
    drive_time_min=30.0,
    storage_months=3,
    customer_name='Campbell, Lauren (Packout Report)',
    apply_corrections=True,
    output_dir=str(Path(__file__).parent / 'output'),
)

print(result['summary'])
print()
print(result['estimate_text'])
print()
print(result['scope_text'])
print()
print(result['adjustment_report'])
print()
print(result['similarity_text'])
print()
print(result['crew_text'])

csv_path = result['csv_path']
if csv_path:
    print(f"\nCSV saved to: {csv_path}")

# Compare to actual packout data
actual_tags = 43
actual_boxes = 83
pred_tags = result['tags']
pred_boxes = result['boxes']
pred_rcv = result['total_rcv']

def pct_err(pred, actual):
    if actual == 0:
        return 'N/A'
    return f"{((pred - actual) / actual) * 100:+.1f}%"

print()
print("=" * 80)
print("COMPARISON: AI ESTIMATE vs ACTUAL PACKOUT INVENTORY")
print("=" * 80)
print()
print(f"{'Metric':<20} {'AI Estimate':>12} {'Actual Packout':>15} {'Error':>10}")
print("-" * 60)
print(f"{'TAGs':<20} {pred_tags:>12.0f} {actual_tags:>15} {pct_err(pred_tags, actual_tags):>10}")
print(f"{'Boxes (med)':<20} {pred_boxes:>12.0f} {actual_boxes:>15} {pct_err(pred_boxes, actual_boxes):>10}")
print(f"{'Total RCV':<20} ${pred_rcv:>11,.2f} {'TBD':>15}")
print()
print("Note: Actual TAG/box counts extracted from Encircle packout inventory")
print("      (TAG 1-43 and Box 1-83 individually photographed and labeled)")

# Also show the walkthrough-only estimate for comparison
print()
print("=" * 80)
print("WALKTHROUGH vs PACKOUT PHOTO COMPARISON")
print("=" * 80)
print()
print(f"{'Source':<30} {'TAGs':>8} {'Boxes':>8} {'RCV':>12}")
print("-" * 60)
print(f"{'Walk-through estimate':<30} {'72':>8} {'94':>8} {'$9,575':>12}")
print(f"{'Packout photo estimate':<30} {pred_tags:>8.0f} {pred_boxes:>8.0f} ${pred_rcv:>11,.0f}")
print(f"{'Actual packout inventory':<30} {actual_tags:>8} {actual_boxes:>8} {'TBD':>12}")
print()
print("The packout photos revealed:")
print("  - Family Room is TAG-heavy (13 TAGs, only 2 boxes) -> heavy density correct")
print("  - Kitchen is EXTREMELY box-heavy (45 of 83 total boxes = 54%)")
print("  - Living Room sectional counted as 4 separate TAGs (left/middle/right/footrest)")
print("  - Each pillow individually tagged (TAGs 25-31) -> 7 pillow TAGs")
print("  - Pantry items all stayed in place (food items, not packed)")
