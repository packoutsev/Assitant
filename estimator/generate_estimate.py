"""
Deliverable 6b: Photo-to-Estimate Generator
Main script that takes walk-through photos and generates a draft Xactimate estimate.

Pipeline:
1. Load photos from input folder (or Encircle PDF)
2. Analyze each photo for room type, TAG items, box counts
3. Aggregate across all rooms
4. Run through Cartage Calculator -> labor hours
5. Map to Xactimate line items using pricing reference
6. Run scope checker for missing items
7. Apply correction factors
8. Output draft estimate as CSV and formatted summary

Usage:
    python generate_estimate.py --photos <folder_of_jpgs>
    python generate_estimate.py --pdf <encircle_walkthrough.pdf>
    python generate_estimate.py --rooms <rooms_json>  (for batch/backtest mode)
"""

import argparse
import json
import csv
import sys
from pathlib import Path
from datetime import datetime
from dataclasses import asdict
from typing import Optional

# Add estimator directory to path
sys.path.insert(0, str(Path(__file__).parent))

from photo_analyzer import PhotoAnalyzer, WalkthroughAnalysis
from cartage_calculator import calculate_cartage, FactoryStandards
from pricing_engine import PricingEngine, LineItem, build_standard_estimate
from scope_checker import ScopeChecker
from estimate_adjuster import EstimateAdjuster

DATA_DIR = Path(__file__).parent / 'data'


def analyze_from_rooms_json(rooms_data: list, density: str = 'medium') -> WalkthroughAnalysis:
    """Analyze from a pre-built rooms list (for backtesting)."""
    analyzer = PhotoAnalyzer()
    return analyzer.analyze_walkthrough_local(rooms_data, default_density=density)


def analyze_from_pdf(pdf_path: str, density: str = 'medium') -> WalkthroughAnalysis:
    """Extract rooms from an Encircle PDF and analyze."""
    import pdfplumber
    import re

    rooms = []
    with pdfplumber.open(pdf_path) as pdf:
        all_text = ''
        for page in pdf.pages:
            text = page.extract_text() or ''
            all_text += text + '\n'

        room_matches = re.findall(r'Overview Photos:\s*(.+?)(?:\n|$)', all_text)
        room_names = [r.strip() for r in room_matches if r.strip()]

    # Classify rooms
    from build_visual_training import classify_room
    for name in room_names:
        category = classify_room(name)
        rooms.append({
            'room_name': name,
            'room_category': category,
            'density': density,
        })

    analyzer = PhotoAnalyzer()
    return analyzer.analyze_walkthrough_local(rooms, default_density=density)


def generate_estimate(
    walkthrough: WalkthroughAnalysis,
    drive_time_min: float = 25.0,
    storage_months: int = 3,
    customer_name: str = "Draft Estimate",
    apply_corrections: bool = True,
    output_dir: Optional[Path] = None,
) -> dict:
    """
    Generate a complete draft estimate from walk-through analysis.

    Returns dict with estimate data, formatted output, and metadata.
    """
    # Step 1: Get initial counts from photo analysis
    initial_tags = walkthrough.total_tags
    initial_boxes = walkthrough.total_boxes
    crew_size = walkthrough.suggested_crew_size
    truck_loads = walkthrough.suggested_truck_loads

    # Step 2: Apply correction factors if requested
    adjuster = EstimateAdjuster()
    if apply_corrections:
        adjusted = adjuster.adjust(
            tags=initial_tags, boxes=initial_boxes,
            is_post_acquisition=True,
        )
        final_tags = adjusted.adjusted_tags
        final_boxes = adjusted.adjusted_boxes
        adjustment_report = adjuster.format_report(adjusted)
    else:
        final_tags = initial_tags
        final_boxes = initial_boxes
        adjusted = None
        adjustment_report = ""

    # Step 3: Run cartage calculator
    cartage = calculate_cartage(
        drive_time_min=drive_time_min,
        truck_loads=truck_loads,
        crew_size=crew_size,
        carry_time_min=8,  # Default carry time
        tag_count=final_tags,
        box_count=final_boxes,
    )

    # Step 4: Build line items
    # Estimate large boxes as ~10% of med boxes for larger jobs
    lg_boxes = max(0, final_boxes // 15) if final_boxes > 30 else 0
    xl_boxes = max(0, final_boxes // 40) if final_boxes > 80 else 0
    moving_van_days = truck_loads  # 1 day per load as baseline

    items = build_standard_estimate(
        tag_count=final_tags,
        box_count=final_boxes,
        cps_lab_hours=cartage.cps_lab_hours,
        cps_labs_hours=cartage.cps_labs_hours,
        storage_months=storage_months,
        moving_van_days=moving_van_days,
        lg_boxes=lg_boxes,
        xl_boxes=xl_boxes,
    )

    # Step 5: Apply pricing
    engine = PricingEngine()
    estimate_result = engine.price_estimate(items)

    # Step 6: Run scope checker
    checker = ScopeChecker()
    scope_items = [{'desc': item.desc, 'qty': item.qty} for item in items]
    scope_result = checker.check(scope_items, job_context={
        'tag_count': final_tags,
        'box_count': final_boxes,
    })

    # Step 7: Format outputs
    estimate_text = engine.format_estimate(estimate_result)
    scope_text = checker.format_report(scope_result)

    # Build summary
    summary_lines = []
    summary_lines.append("=" * 80)
    summary_lines.append(f"PACKOUT ESTIMATE — {customer_name}")
    summary_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    summary_lines.append("=" * 80)
    summary_lines.append("")
    summary_lines.append(f"Home: {walkthrough.total_rooms} rooms ({walkthrough.home_size_estimate})")
    summary_lines.append(f"TAGs: {final_tags} (initial: {initial_tags})")
    summary_lines.append(f"Boxes: {final_boxes} med + {lg_boxes} lg + {xl_boxes} xl (initial: {initial_boxes})")
    summary_lines.append(f"Crew: {crew_size} staff, {truck_loads} truck load(s)")
    summary_lines.append(f"Drive time: {drive_time_min:.0f} min one-way")
    summary_lines.append(f"")
    summary_lines.append(f"Labor: {cartage.cps_lab_hours:.1f} hr CPS LAB + {cartage.cps_labs_hours:.1f} hr CPS LABS")
    summary_lines.append(f"Total RCV: ${estimate_result.subtotal_rcv:,.2f}")
    summary_lines.append("")
    summary_lines.append("ROOM BREAKDOWN:")
    for room in walkthrough.rooms:
        summary_lines.append(f"  {room.room_name:<25} TAGs: {room.estimated_tags:>3}  Boxes: {room.estimated_boxes:>3}")

    summary = "\n".join(summary_lines)

    # Save CSV if output_dir specified
    csv_path = None
    if output_dir:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        safe_name = customer_name.replace(' ', '_').replace(',', '')
        csv_path = output_dir / f"estimate_{safe_name}.csv"
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['#', 'Group', 'Description', 'Qty', 'Unit', 'Unit Cost', 'RCV', 'Cat', 'Sel'])
            for i, item in enumerate(estimate_result.line_items, 1):
                writer.writerow([i, item.group_desc, item.desc, item.qty, item.unit,
                                item.applied_unit_cost, item.rcv, item.cat, item.sel])

        summary_path = output_dir / f"estimate_{safe_name}_summary.txt"
        with open(summary_path, 'w') as f:
            f.write(summary + "\n\n")
            f.write(estimate_text + "\n\n")
            f.write(scope_text + "\n\n")
            if adjustment_report:
                f.write(adjustment_report + "\n")

    return {
        'customer': customer_name,
        'rooms': walkthrough.total_rooms,
        'tags': final_tags,
        'boxes': final_boxes,
        'labor_hours': round(cartage.cps_lab_hours + cartage.cps_labs_hours, 1),
        'cps_lab': round(cartage.cps_lab_hours, 1),
        'cps_labs': round(cartage.cps_labs_hours, 1),
        'total_rcv': estimate_result.subtotal_rcv,
        'scope_score': scope_result.score,
        'summary': summary,
        'estimate_text': estimate_text,
        'scope_text': scope_text,
        'adjustment_report': adjustment_report,
        'csv_path': str(csv_path) if csv_path else None,
        'line_items': [{
            'desc': i.desc, 'qty': i.qty, 'unit': i.unit,
            'unit_cost': i.applied_unit_cost, 'rcv': i.rcv,
        } for i in estimate_result.line_items],
    }


def main():
    parser = argparse.ArgumentParser(description='Generate a draft packout estimate from walk-through data')
    parser.add_argument('--pdf', type=str, help='Path to Encircle walk-through PDF')
    parser.add_argument('--rooms', type=str, help='Path to rooms JSON file')
    parser.add_argument('--drive-time', type=float, default=25, help='One-way drive time in minutes')
    parser.add_argument('--storage-months', type=int, default=3, help='Storage months to include')
    parser.add_argument('--customer', type=str, default='Draft', help='Customer name')
    parser.add_argument('--density', type=str, default='medium', choices=['light', 'medium', 'heavy'])
    parser.add_argument('--output-dir', type=str, default=None, help='Output directory for CSV/summary')
    parser.add_argument('--no-corrections', action='store_true', help='Skip correction factor adjustments')
    args = parser.parse_args()

    # Determine analysis source
    if args.pdf:
        print(f"Analyzing Encircle PDF: {args.pdf}")
        walkthrough = analyze_from_pdf(args.pdf, density=args.density)
    elif args.rooms:
        with open(args.rooms) as f:
            rooms_data = json.load(f)
        walkthrough = analyze_from_rooms_json(rooms_data, density=args.density)
    else:
        # Demo mode with sample rooms
        print("No input specified — running demo with sample 9-room home")
        rooms = [
            {'room_name': 'Kitchen', 'room_category': 'kitchen', 'density': 'medium'},
            {'room_name': 'Living Room', 'room_category': 'living_room', 'density': 'medium'},
            {'room_name': 'Dining Room', 'room_category': 'dining_room', 'density': 'light'},
            {'room_name': 'Primary Bedroom', 'room_category': 'bedroom', 'density': 'medium'},
            {'room_name': 'Guest Bedroom', 'room_category': 'bedroom', 'density': 'light'},
            {'room_name': 'Primary Bathroom', 'room_category': 'bathroom', 'density': 'medium'},
            {'room_name': 'Office', 'room_category': 'office', 'density': 'heavy'},
            {'room_name': 'Garage', 'room_category': 'garage', 'density': 'medium'},
            {'room_name': 'Hallway', 'room_category': 'hallway', 'density': 'light'},
        ]
        walkthrough = analyze_from_rooms_json(rooms, density='medium')

    # Generate estimate
    result = generate_estimate(
        walkthrough=walkthrough,
        drive_time_min=args.drive_time,
        storage_months=args.storage_months,
        customer_name=args.customer,
        apply_corrections=not args.no_corrections,
        output_dir=args.output_dir or str(Path(__file__).parent / 'output'),
    )

    # Print results
    print(result['summary'])
    print()
    print(result['estimate_text'])
    print()
    print(result['scope_text'])
    if result['adjustment_report']:
        print()
        print(result['adjustment_report'])

    if result['csv_path']:
        print(f"\nCSV saved to: {result['csv_path']}")


if __name__ == '__main__':
    main()
