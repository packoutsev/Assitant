"""Run Schafer estimate from walk-through photo report assessment.

Customer: Tyler Schafer
Address: 8030 N. 55th Dr, Glendale, AZ 85302
Loss: Water, Feb 4, 2026
Insurance: Liberty Mutual
Warehouse: 926 E Jackson St, Phoenix AZ 85013
Distance: ~17 miles, 35 min avg rush hour

IMPORTANT: This is a LIMITED SCOPE job per packout instructions:
  Kitchen: "ONLY PACK OUT UNDER kitchen SINK"
  Dining Room: "Everything to come OFF WALLS"
  Living Room: "Everything is to come off walls. DO NOT unplug devices."
  Pantry Closet: No limiting instructions (food may stay per practice)
  Linen Closet: No limiting instructions (full packout)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from generate_estimate import analyze_from_rooms_json, generate_estimate
from photo_analyzer import WalkthroughAnalysis, RoomAnalysis

# ── TOOL ESTIMATE (full-room lookup, will overestimate for limited scope) ──

rooms = [
    {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'light'},
    {'room_name': 'Dining Room', 'room_category': 'dining_room', 'density': 'light'},
    {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'light'},
    {'room_name': 'Pantry Closet', 'room_category': 'closet', 'density': 'light'},
    {'room_name': 'Linen Closet', 'room_category': 'closet', 'density': 'light'},
]

walkthrough = analyze_from_rooms_json(rooms, density='light')

# Override crew to 3 (user specified) and truck loads to 1
walkthrough.suggested_crew_size = 3
walkthrough.suggested_truck_loads = 1

result_tool = generate_estimate(
    walkthrough=walkthrough,
    drive_time_min=35.0,
    storage_months=3,
    customer_name='Schafer, Tyler (Tool Estimate)',
    apply_corrections=True,
    output_dir=str(Path(__file__).parent / 'output'),
)

# ── MANUAL ESTIMATE (scope-adjusted counts from photo assessment) ──

manual_rooms = [
    RoomAnalysis(room_name='Kitchen (under sink only)', room_category='kitchen',
                 density='light', estimated_tags=0, estimated_boxes=1,
                 notes='ONLY under sink per instructions'),
    RoomAnalysis(room_name='Dining Room (walls only)', room_category='dining_room',
                 density='light', estimated_tags=2, estimated_boxes=2,
                 notes='Gallery wall ~8 frames, shelf unit - wall items only'),
    RoomAnalysis(room_name='Living Room (walls only)', room_category='living_room',
                 density='light', estimated_tags=4, estimated_boxes=3,
                 notes='Wall art, floating shelves, decor - furniture/electronics stay'),
    RoomAnalysis(room_name='Pantry Closet', room_category='closet',
                 density='light', estimated_tags=0, estimated_boxes=3,
                 notes='Mostly food - may stay per practice'),
    RoomAnalysis(room_name='Linen Closet', room_category='closet',
                 density='light', estimated_tags=0, estimated_boxes=3,
                 notes='Towels, linens, toiletries'),
]

manual_walkthrough = WalkthroughAnalysis(
    rooms=manual_rooms,
    total_tags=sum(r.estimated_tags for r in manual_rooms),
    total_boxes=sum(r.estimated_boxes for r in manual_rooms),
    total_rooms=5,
    dominant_loss_type='water',
    home_size_estimate='small',
    suggested_crew_size=3,
    suggested_truck_loads=1,
)

result_manual = generate_estimate(
    walkthrough=manual_walkthrough,
    drive_time_min=35.0,
    storage_months=3,
    customer_name='Schafer, Tyler (Manual Scope-Adjusted)',
    apply_corrections=False,  # Don't adjust manual counts
    output_dir=str(Path(__file__).parent / 'output'),
)

# ── OUTPUT ──

print("=" * 80)
print("SCHAFER ESTIMATE - Tyler Schafer")
print("8030 N. 55th Dr, Glendale, AZ 85302 | Water Loss | Liberty Mutual")
print("=" * 80)

print()
print("DRIVE TIME & DISTANCE ANALYSIS")
print("-" * 60)
print(f"  Property:   8030 N 55th Dr, Glendale, AZ 85302")
print(f"  Warehouse:  926 E Jackson St, Phoenix, AZ 85013")
print(f"  Distance:   ~17 miles (via I-17 or I-10)")
print(f"  Off-peak:   ~25 min")
print(f"  AM rush:    ~30-35 min (to property, against downtown flow)")
print(f"  PM rush:    ~40-50 min (to warehouse, into downtown flow)")
print(f"  Used:       35 min one-way (avg rush hour)")
print(f"  Crew:       3 (per user spec)")
print(f"  Loads:      1 (small job)")

print()
print("=" * 80)
print("SCOPE-ADJUSTED ESTIMATE (RECOMMENDED)")
print("Based on manual photo assessment + packout instruction limits")
print("=" * 80)
print()
print(result_manual['summary'])
print()
print(result_manual['estimate_text'])

print()
print("=" * 80)
print("TOOL ESTIMATE (FULL-ROOM LOOKUP - OVERESTIMATES FOR THIS JOB)")
print("=" * 80)
print()
print(result_tool['summary'])
print()
print(result_tool['estimate_text'])

print()
print("=" * 80)
print("COMPARISON: TOOL vs MANUAL SCOPE-ADJUSTED")
print("=" * 80)
print()
print(f"{'Metric':<25} {'Tool (full room)':>18} {'Manual (scoped)':>18}")
print("-" * 62)
print(f"{'TAGs':<25} {result_tool['tags']:>18.0f} {result_manual['tags']:>18.0f}")
print(f"{'Med Boxes':<25} {result_tool['boxes']:>18.0f} {result_manual['boxes']:>18.0f}")
print(f"{'Total RCV':<25} ${result_tool['total_rcv']:>17,.2f} ${result_manual['total_rcv']:>17,.2f}")
print()
print("SCOPE NOTES:")
print("  Kitchen:     ONLY under sink (not full kitchen packout)")
print("  Dining Room: Walls only (table/chairs stay)")
print("  Living Room: Walls only, no unplugging (sectional/TV/shelving stay)")
print("  Pantry:      Food items - likely stays per standard practice")
print("  Linen:       Full packout of towels/linens/toiletries")
print()
print("RECOMMENDATION: Use the Manual Scope-Adjusted estimate for this job.")
print("  The tool's full-room estimates significantly overcount TAGs/boxes")
print("  because most items in the kitchen, dining, and living rooms are STAYING.")

# Show similar jobs and crew info from tool
print()
print(result_tool['similarity_text'])
print()
print(result_manual['crew_text'])

csv1 = result_tool.get('csv_path')
csv2 = result_manual.get('csv_path')
if csv1:
    print(f"\nTool CSV:   {csv1}")
if csv2:
    print(f"Manual CSV: {csv2}")
