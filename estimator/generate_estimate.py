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
from pricing_engine import PricingEngine, LineItem, build_standard_estimate, build_5phase_estimate
from labor_rates import LaborRateCalculator, DEFAULT_HANDLING_RATE
from scope_checker import ScopeChecker
from estimate_adjuster import EstimateAdjuster
from job_similarity import JobSimilarityEngine
from supplement_predictor import SupplementPredictor
from crew_optimizer import CrewOptimizer

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

    # Step 7: Similar jobs lookup
    similarity_engine = JobSimilarityEngine()
    similar_jobs = similarity_engine.find_similar(
        room_count=walkthrough.total_rooms,
        tag_estimate=final_tags,
        box_estimate=final_boxes,
    )
    similarity_text = similarity_engine.format_similar_jobs(
        similar_jobs, predicted_rcv=estimate_result.subtotal_rcv)

    # Step 8: Supplement predictions
    predictor = SupplementPredictor()
    supplements = predictor.predict(
        estimate_items=scope_items,
        tag_count=final_tags,
        box_count=final_boxes,
    )
    supplement_text = predictor.format_prediction(supplements)

    # Step 9: Crew recommendation
    optimizer = CrewOptimizer()
    crew_rec = optimizer.recommend(
        tag_count=final_tags,
        box_count=final_boxes,
        room_count=walkthrough.total_rooms,
        drive_time_min=drive_time_min,
    )
    crew_text = optimizer.format_recommendation(
        crew_rec, tag_count=final_tags, box_count=final_boxes)

    # Step 10: Format outputs
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
        with open(summary_path, 'w', encoding='utf-8') as f:
            f.write(summary + "\n\n")
            f.write(estimate_text + "\n\n")
            f.write(scope_text + "\n\n")
            if adjustment_report:
                f.write(adjustment_report + "\n\n")
            f.write(similarity_text + "\n\n")
            f.write(supplement_text + "\n\n")
            f.write(crew_text + "\n")

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
        'similarity_text': similarity_text,
        'supplement_text': supplement_text,
        'crew_text': crew_text,
    }


def generate_5phase_estimate(
    walkthrough: WalkthroughAnalysis,
    drive_time_min: float = 25.0,
    storage_vaults: int = 4,
    storage_duration_months: int = 2,
    customer_name: str = "Draft Estimate",
    apply_corrections: bool = True,
    output_dir: Optional[Path] = None,
    handling_rate: float = None,
    target_margin: float = 0.65,
    crew_size: int = None,
    truck_loads: int = None,
    carry_time_min: float = 4.0,
    pad_count: int = None,
) -> dict:
    """
    Generate a 5-phase estimate matching actual submitted estimate structure.

    Phases: Packout, Handling to Storage, Storage, Handling from Storage, Pack back

    Key differences from legacy generate_estimate:
    - Handling labor billed at target margin rate (default 65% = ~$79/hr)
    - Cartage hours applied to handling phases (not packout)
    - Packback phase adds boxes/TAGs at reduced rate (no materials)
    - Storage specified as vaults x months

    Args:
        walkthrough: Room analysis results
        drive_time_min: One-way drive time to warehouse
        storage_vaults: Number of storage vaults needed
        storage_duration_months: Months of storage per vault
        customer_name: Name for output files
        apply_corrections: Whether to apply statistical correction factors
        output_dir: Where to save CSV/summary
        handling_rate: Override billing rate for handling labor ($/hr)
        target_margin: Target labor margin if handling_rate not specified
        crew_size: Override crew size (default from walkthrough)
        truck_loads: Override truck loads (default from walkthrough)
        carry_time_min: Minutes to carry one load inside house to truck
        pad_count: Override furniture pad count (default = tag count)
    """
    # Step 1: Get initial counts
    initial_tags = walkthrough.total_tags
    initial_boxes = walkthrough.total_boxes
    _crew_size = crew_size or walkthrough.suggested_crew_size
    _truck_loads = truck_loads or walkthrough.suggested_truck_loads

    # Step 2: Corrections
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

    # Step 3: Cartage calculator for HANDLING hours
    cartage = calculate_cartage(
        drive_time_min=drive_time_min,
        truck_loads=_truck_loads,
        crew_size=_crew_size,
        carry_time_min=carry_time_min,
        tag_count=final_tags,
        box_count=final_boxes,
    )
    # Total handling person-hours (used for each direction)
    handling_hours = round(cartage.total_hours, 2)

    # Step 4: Calculate handling rate
    if handling_rate is None:
        calc = LaborRateCalculator()
        handling_rate = calc.billing_rate_for_margin(target_margin)

    # Step 5: Box sizing
    lg_boxes = max(0, final_boxes // 15) if final_boxes > 30 else 0
    xl_boxes = max(0, final_boxes // 40) if final_boxes > 80 else 0
    moving_van_days = _truck_loads

    # Step 6: Storage months
    storage_months = storage_vaults * storage_duration_months

    # Step 7: Build 5-phase line items
    items, packback_discount = build_5phase_estimate(
        tag_count=final_tags,
        box_count=final_boxes,
        handling_hours=handling_hours,
        moving_van_days=moving_van_days,
        storage_months=storage_months,
        storage_vaults=storage_vaults,
        lg_boxes=lg_boxes,
        xl_boxes=xl_boxes,
        pad_count=pad_count,
        handling_rate=handling_rate,
    )

    # Step 8: Price everything
    engine = PricingEngine()
    estimate_result = engine.price_5phase_estimate(items, packback_discount)

    # Step 9: Scope check
    checker = ScopeChecker()
    scope_items = [{'desc': item.desc, 'qty': item.qty} for item in items]
    scope_result = checker.check(scope_items, job_context={
        'tag_count': final_tags,
        'box_count': final_boxes,
    })

    # Step 10: Similar jobs
    similarity_engine = JobSimilarityEngine()
    similar_jobs = similarity_engine.find_similar(
        room_count=walkthrough.total_rooms,
        tag_estimate=final_tags,
        box_estimate=final_boxes,
    )
    similarity_text = similarity_engine.format_similar_jobs(
        similar_jobs, predicted_rcv=estimate_result.subtotal_rcv)

    # Step 11: Supplement predictions
    predictor = SupplementPredictor()
    supplements = predictor.predict(
        estimate_items=scope_items,
        tag_count=final_tags,
        box_count=final_boxes,
    )
    supplement_text = predictor.format_prediction(supplements)

    # Step 12: Crew recommendation
    optimizer = CrewOptimizer()
    crew_rec = optimizer.recommend(
        tag_count=final_tags,
        box_count=final_boxes,
        room_count=walkthrough.total_rooms,
        drive_time_min=drive_time_min,
    )
    crew_text = optimizer.format_recommendation(
        crew_rec, tag_count=final_tags, box_count=final_boxes)

    # Step 13: Format outputs
    estimate_text = engine.format_5phase_estimate(estimate_result)
    scope_text = checker.format_report(scope_result)

    # Labor rate analysis
    calc = LaborRateCalculator()
    labor_text = calc.format_breakdown(target_margin)

    # Build summary
    summary_lines = []
    summary_lines.append("=" * 80)
    summary_lines.append(f"5-PHASE PACKOUT ESTIMATE -- {customer_name}")
    summary_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    summary_lines.append("=" * 80)
    summary_lines.append("")
    summary_lines.append(f"Home: {walkthrough.total_rooms} rooms ({walkthrough.home_size_estimate})")
    summary_lines.append(f"TAGs: {final_tags} (initial: {initial_tags})")
    summary_lines.append(f"Boxes: {final_boxes} med + {lg_boxes} lg + {xl_boxes} xl (initial: {initial_boxes})")
    summary_lines.append(f"Crew: {_crew_size} staff, {_truck_loads} truck load(s)")
    summary_lines.append(f"Drive time: {drive_time_min:.0f} min one-way")
    summary_lines.append(f"Handling rate: ${handling_rate:.2f}/hr ({target_margin*100:.0f}% margin)")
    summary_lines.append(f"Storage: {storage_vaults} vault(s) x {storage_duration_months} months = {storage_months} MO")
    summary_lines.append(f"")
    summary_lines.append(f"Handling hours: {handling_hours:.1f} hr per direction (x2 = {handling_hours*2:.1f} total)")
    summary_lines.append(f"Total RCV: ${estimate_result.subtotal_rcv:,.2f}")
    summary_lines.append("")
    summary_lines.append("ROOM BREAKDOWN:")
    for room in walkthrough.rooms:
        summary_lines.append(f"  {room.room_name:<25} TAGs: {room.estimated_tags:>3}  Boxes: {room.estimated_boxes:>3}")

    summary = "\n".join(summary_lines)

    # Save CSV
    csv_path = None
    if output_dir:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        safe_name = customer_name.replace(' ', '_').replace(',', '')
        csv_path = output_dir / f"estimate_5phase_{safe_name}.csv"
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['#', 'Phase', 'Description', 'Qty', 'Unit', 'Unit Cost', 'RCV', 'Cat', 'Sel'])
            for i, item in enumerate(estimate_result.line_items, 1):
                phase = getattr(item, 'phase', '')
                writer.writerow([i, phase, item.desc, item.qty, item.unit,
                                item.applied_unit_cost, item.rcv, item.cat, item.sel])

        summary_path = output_dir / f"estimate_5phase_{safe_name}_summary.txt"
        with open(summary_path, 'w', encoding='utf-8') as f:
            f.write(summary + "\n\n")
            f.write(estimate_text + "\n\n")
            f.write(scope_text + "\n\n")
            if adjustment_report:
                f.write(adjustment_report + "\n\n")
            f.write(labor_text + "\n\n")
            f.write(similarity_text + "\n\n")
            f.write(supplement_text + "\n\n")
            f.write(crew_text + "\n")

    return {
        'customer': customer_name,
        'rooms': walkthrough.total_rooms,
        'tags': final_tags,
        'boxes': final_boxes,
        'lg_boxes': lg_boxes,
        'xl_boxes': xl_boxes,
        'handling_hours': handling_hours,
        'handling_rate': handling_rate,
        'storage_months': storage_months,
        'total_rcv': estimate_result.subtotal_rcv,
        'scope_score': scope_result.score,
        'summary': summary,
        'estimate_text': estimate_text,
        'scope_text': scope_text,
        'adjustment_report': adjustment_report,
        'labor_text': labor_text,
        'csv_path': str(csv_path) if csv_path else None,
        'line_items': [{
            'desc': i.desc, 'qty': i.qty, 'unit': i.unit,
            'unit_cost': i.applied_unit_cost, 'rcv': i.rcv,
            'phase': getattr(i, 'phase', ''),
        } for i in estimate_result.line_items],
        'similarity_text': similarity_text,
        'supplement_text': supplement_text,
        'crew_text': crew_text,
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
    print()
    print(result['similarity_text'])
    print()
    print(result['supplement_text'])
    print()
    print(result['crew_text'])

    if result['csv_path']:
        print(f"\nCSV saved to: {result['csv_path']}")


if __name__ == '__main__':
    main()
