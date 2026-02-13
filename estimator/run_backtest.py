"""
Deliverable 7: Backtesting — Critical Validation

Runs the photo-to-estimate prototype against all walk-throughs where we have:
- Room data from Encircle walk-through PDFs
- Actual final estimates (or initial estimates as fallback) from Xactimate

Computes per-customer and aggregate accuracy metrics:
- MAPE (Mean Absolute Percentage Error) on TAGs, boxes, labor, RCV
- Signed error (bias direction)
- Comparison: AI estimate vs. final, AND AI estimate vs. human initial estimate

Target: MAPE on total RCV under 25% = usable first draft.

Usage:
    python run_backtest.py
    python run_backtest.py --output-dir <dir>  (default: estimator/output/backtest)
"""

import json
import csv
import sys
import argparse
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field

sys.path.insert(0, str(Path(__file__).parent))

from photo_analyzer import PhotoAnalyzer, WalkthroughAnalysis
from cartage_calculator import calculate_cartage
from pricing_engine import PricingEngine, build_standard_estimate
from scope_checker import ScopeChecker
from estimate_adjuster import EstimateAdjuster

DATA_DIR = Path(__file__).parent / 'data'


@dataclass
class BacktestResult:
    """Result of running the prototype on one customer."""
    customer: str
    is_post_acquisition: bool
    room_count: int

    # Predicted values (from our prototype)
    pred_tags: float = 0.0
    pred_boxes: float = 0.0
    pred_labor: float = 0.0
    pred_rcv: float = 0.0

    # Actual values (from final estimate)
    actual_tags: float = 0.0
    actual_boxes: float = 0.0
    actual_labor: float = 0.0
    actual_rcv: float = 0.0

    # Human initial estimate values (for comparison)
    human_est_tags: float = 0.0
    human_est_boxes: float = 0.0
    human_est_labor: float = 0.0
    human_est_rcv: float = 0.0

    # Error metrics (vs final)
    tag_error_pct: float = 0.0
    box_error_pct: float = 0.0
    labor_error_pct: float = 0.0
    rcv_error_pct: float = 0.0

    # Human estimator error (vs final)
    human_tag_error_pct: float = 0.0
    human_box_error_pct: float = 0.0
    human_labor_error_pct: float = 0.0
    human_rcv_error_pct: float = 0.0

    notes: str = ''


def pct_error(predicted, actual):
    """Signed percentage error. Positive = overestimate."""
    if actual == 0:
        if predicted == 0:
            return 0.0
        return 100.0  # Can't compute meaningful % error from zero
    return ((predicted - actual) / actual) * 100


def abs_pct_error(predicted, actual):
    """Absolute percentage error."""
    return abs(pct_error(predicted, actual))


def safe_mape(errors):
    """Mean of absolute percentage errors, excluding NaN/inf and zero-actual entries."""
    valid = [e for e in errors if abs(e) < 500]  # Exclude extreme outliers
    if not valid:
        return float('nan')
    return sum(abs(e) for e in valid) / len(valid)


def run_single_backtest(walkthrough_data: dict, density: str = 'medium') -> BacktestResult:
    """Run prototype on one customer's walk-through and compare to actuals."""

    customer = walkthrough_data['customer']
    rooms = walkthrough_data['rooms']
    actual = walkthrough_data.get('actual_data') or walkthrough_data.get('final_data')
    estimate = walkthrough_data.get('estimate_data')

    result = BacktestResult(
        customer=customer,
        is_post_acquisition=walkthrough_data.get('is_post_acquisition', False),
        room_count=len(rooms),
    )

    if not actual or actual.get('total_rcv', 0) == 0:
        result.notes = 'No actual data available'
        return result

    # -- Step 1: Analyze rooms using lookup tables --
    analyzer = PhotoAnalyzer()
    rooms_input = []
    for room in rooms:
        # Skip exterior rooms — they're not packed out
        if room['room_category'] == 'exterior':
            continue
        rooms_input.append({
            'room_name': room['room_name'],
            'room_category': room['room_category'],
            'density': density,
        })

    if not rooms_input:
        result.notes = 'No packable rooms found'
        return result

    walkthrough = analyzer.analyze_walkthrough_local(rooms_input, default_density=density)

    # -- Step 2: Apply correction factors --
    adjuster = EstimateAdjuster()
    adjusted = adjuster.adjust(
        tags=walkthrough.total_tags,
        boxes=walkthrough.total_boxes,
        is_post_acquisition=result.is_post_acquisition,
    )
    final_tags = adjusted.adjusted_tags
    final_boxes = adjusted.adjusted_boxes

    # -- Step 3: Run cartage calculator --
    crew_size = walkthrough.suggested_crew_size
    truck_loads = walkthrough.suggested_truck_loads
    drive_time = 25.0  # Default

    cartage = calculate_cartage(
        drive_time_min=drive_time,
        truck_loads=truck_loads,
        crew_size=crew_size,
        carry_time_min=8,
        tag_count=final_tags,
        box_count=final_boxes,
    )

    # -- Step 4: Build and price line items --
    lg_boxes = max(0, final_boxes // 15) if final_boxes > 30 else 0
    xl_boxes = max(0, final_boxes // 40) if final_boxes > 80 else 0
    moving_van_days = truck_loads

    # Estimate storage months based on job size
    # Storage is highly variable — use 3 months as conservative default
    storage_months = 3

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

    engine = PricingEngine()
    estimate_result = engine.price_estimate(items)

    # -- Step 5: Record results --
    pred_labor = cartage.cps_lab_hours + cartage.cps_labs_hours
    actual_labor = actual.get('labor_hours', 0) + actual.get('supervisor_hours', 0)

    result.pred_tags = final_tags
    result.pred_boxes = final_boxes
    result.pred_labor = round(pred_labor, 1)
    result.pred_rcv = round(estimate_result.subtotal_rcv, 2)

    result.actual_tags = actual.get('tag_count', 0)
    result.actual_boxes = actual.get('total_boxes', 0)
    result.actual_labor = round(actual_labor, 1)
    result.actual_rcv = actual.get('total_rcv', 0)

    # Errors vs final
    result.tag_error_pct = round(pct_error(result.pred_tags, result.actual_tags), 1)
    result.box_error_pct = round(pct_error(result.pred_boxes, result.actual_boxes), 1)
    result.labor_error_pct = round(pct_error(result.pred_labor, result.actual_labor), 1)
    result.rcv_error_pct = round(pct_error(result.pred_rcv, result.actual_rcv), 1)

    # Human estimator comparison (if initial estimate available)
    if estimate:
        human_labor = estimate.get('labor_hours', 0) + estimate.get('supervisor_hours', 0)
        result.human_est_tags = estimate.get('tag_count', 0)
        result.human_est_boxes = estimate.get('total_boxes', 0)
        result.human_est_labor = round(human_labor, 1)
        result.human_est_rcv = estimate.get('total_rcv', 0)

        result.human_tag_error_pct = round(pct_error(result.human_est_tags, result.actual_tags), 1)
        result.human_box_error_pct = round(pct_error(result.human_est_boxes, result.actual_boxes), 1)
        result.human_labor_error_pct = round(pct_error(result.human_est_labor, result.actual_labor), 1)
        result.human_rcv_error_pct = round(pct_error(result.human_est_rcv, result.actual_rcv), 1)

    return result


def run_full_backtest(output_dir: str = None):
    """Run backtest across all available walk-throughs."""

    # Load training data
    with open(DATA_DIR / 'walkthrough_visual_training.json') as f:
        data = json.load(f)

    walkthroughs = data['walkthroughs']

    # Filter to usable candidates:
    # Must have rooms AND actual data with non-zero RCV
    candidates = []
    excluded = []
    for wt in walkthroughs:
        actual = wt.get('actual_data') or wt.get('final_data')
        rooms = wt.get('rooms', [])
        packable_rooms = [r for r in rooms if r.get('room_category') != 'exterior']

        if not packable_rooms:
            excluded.append((wt['customer'], 'no packable rooms'))
            continue
        if not actual or actual.get('total_rcv', 0) == 0:
            excluded.append((wt['customer'], 'no actual data'))
            continue
        # Exclude jobs with 0 tags AND 0 boxes (atypical scope)
        if actual.get('tag_count', 0) == 0 and actual.get('total_boxes', 0) == 0:
            excluded.append((wt['customer'], 'zero tags and boxes (atypical scope)'))
            continue

        candidates.append(wt)

    print(f"Backtesting {len(candidates)} customers ({len(excluded)} excluded)")
    for name, reason in excluded:
        print(f"  Excluded: {name} — {reason}")
    print()

    # Run backtest for each candidate
    results = []
    for wt in candidates:
        print(f"  Testing: {wt['customer']}...", end=' ')
        result = run_single_backtest(wt)
        results.append(result)
        if result.notes:
            print(f"SKIP ({result.notes})")
        else:
            print(f"RCV: predicted ${result.pred_rcv:,.0f} vs actual ${result.actual_rcv:,.0f} "
                  f"({result.rcv_error_pct:+.1f}%)")

    # Filter to valid results
    valid = [r for r in results if not r.notes]
    post_acq = [r for r in valid if r.is_post_acquisition]
    pre_acq = [r for r in valid if not r.is_post_acquisition]
    has_human = [r for r in valid if r.human_est_rcv > 0]

    # -- Compute aggregate metrics --
    print(f"\n{'='*80}")
    print(f"BACKTEST RESULTS — {len(valid)} customers tested")
    print(f"{'='*80}")

    # Per-customer detail
    print(f"\n{'Customer':<22} {'Rooms':>5} {'Pred TAGs':>9} {'Act TAGs':>9} "
          f"{'Pred Box':>9} {'Act Box':>8} {'Pred RCV':>10} {'Act RCV':>10} {'RCV Err':>8}")
    print("-" * 100)
    for r in valid:
        print(f"{r.customer[:21]:<22} {r.room_count:>5} {r.pred_tags:>9.0f} {r.actual_tags:>9.0f} "
              f"{r.pred_boxes:>9.0f} {r.actual_boxes:>8.0f} "
              f"${r.pred_rcv:>9,.0f} ${r.actual_rcv:>9,.0f} {r.rcv_error_pct:>+7.1f}%")

    # Aggregate MAPE
    tag_errors = [r.tag_error_pct for r in valid]
    box_errors = [r.box_error_pct for r in valid]
    labor_errors = [r.labor_error_pct for r in valid]
    rcv_errors = [r.rcv_error_pct for r in valid]

    tag_mape = safe_mape(tag_errors)
    box_mape = safe_mape(box_errors)
    labor_mape = safe_mape(labor_errors)
    rcv_mape = safe_mape(rcv_errors)

    # Median absolute error (more robust than MAPE)
    def median_abs(errors):
        valid = sorted(abs(e) for e in errors if abs(e) < 500)
        if not valid:
            return float('nan')
        mid = len(valid) // 2
        return valid[mid]

    tag_mdae = median_abs(tag_errors)
    box_mdae = median_abs(box_errors)
    labor_mdae = median_abs(labor_errors)
    rcv_mdae = median_abs(rcv_errors)

    # Mean signed error (bias)
    tag_bias = sum(tag_errors) / len(tag_errors) if tag_errors else 0
    box_bias = sum(box_errors) / len(box_errors) if box_errors else 0
    labor_bias = sum(labor_errors) / len(labor_errors) if labor_errors else 0
    rcv_bias = sum(rcv_errors) / len(rcv_errors) if rcv_errors else 0

    print(f"\n{'AGGREGATE METRICS':^80}")
    print(f"{'Metric':<20} {'MAPE':>10} {'MdAE':>10} {'Bias':>10} {'N':>5}")
    print("-" * 55)
    print(f"{'TAGs':<20} {tag_mape:>9.1f}% {tag_mdae:>9.1f}% {tag_bias:>+9.1f}% {len(tag_errors):>5}")
    print(f"{'Boxes':<20} {box_mape:>9.1f}% {box_mdae:>9.1f}% {box_bias:>+9.1f}% {len(box_errors):>5}")
    print(f"{'Labor Hours':<20} {labor_mape:>9.1f}% {labor_mdae:>9.1f}% {labor_bias:>+9.1f}% {len(labor_errors):>5}")
    print(f"{'Total RCV':<20} {rcv_mape:>9.1f}% {rcv_mdae:>9.1f}% {rcv_bias:>+9.1f}% {len(rcv_errors):>5}")

    # Post-acquisition subset
    if post_acq:
        pa_rcv_errors = [r.rcv_error_pct for r in post_acq]
        pa_rcv_mape = safe_mape(pa_rcv_errors)
        pa_tag_errors = [r.tag_error_pct for r in post_acq]
        pa_tag_mape = safe_mape(pa_tag_errors)
        print(f"\nPost-Acquisition Only (n={len(post_acq)}):")
        print(f"  RCV MAPE: {pa_rcv_mape:.1f}%  TAG MAPE: {pa_tag_mape:.1f}%")

    # -- Compare AI vs Human Estimator --
    if has_human:
        print(f"\n{'AI vs HUMAN ESTIMATOR (both vs final)':^80}")
        print(f"{'Customer':<22} {'AI RCV Err':>11} {'Human Err':>10} {'AI Wins?':>9}")
        print("-" * 55)

        ai_wins = 0
        for r in has_human:
            ai_abs = abs(r.rcv_error_pct)
            human_abs = abs(r.human_rcv_error_pct)
            winner = 'AI' if ai_abs < human_abs else ('TIE' if ai_abs == human_abs else 'Human')
            if winner == 'AI':
                ai_wins += 1
            print(f"{r.customer[:21]:<22} {r.rcv_error_pct:>+10.1f}% {r.human_rcv_error_pct:>+9.1f}% "
                  f"{'  <-- AI' if winner == 'AI' else ('  TIE' if winner == 'TIE' else '')}")

        ai_rcv_mape = safe_mape([r.rcv_error_pct for r in has_human])
        human_rcv_mape = safe_mape([r.human_rcv_error_pct for r in has_human])
        print(f"\n  AI RCV MAPE: {ai_rcv_mape:.1f}%  |  Human RCV MAPE: {human_rcv_mape:.1f}%")
        print(f"  AI wins {ai_wins}/{len(has_human)} matchups on RCV accuracy")

        # Per-metric comparison
        ai_tag_mape = safe_mape([r.tag_error_pct for r in has_human])
        human_tag_mape = safe_mape([r.human_tag_error_pct for r in has_human])
        ai_box_mape = safe_mape([r.box_error_pct for r in has_human])
        human_box_mape = safe_mape([r.human_box_error_pct for r in has_human])
        ai_labor_mape = safe_mape([r.labor_error_pct for r in has_human])
        human_labor_mape = safe_mape([r.human_labor_error_pct for r in has_human])

        print(f"\n  {'Metric':<15} {'AI MAPE':>10} {'Human MAPE':>12} {'Better':>8}")
        print(f"  {'-'*47}")
        for metric, ai_m, hu_m in [
            ('TAGs', ai_tag_mape, human_tag_mape),
            ('Boxes', ai_box_mape, human_box_mape),
            ('Labor', ai_labor_mape, human_labor_mape),
            ('RCV', ai_rcv_mape, human_rcv_mape),
        ]:
            better = 'AI' if ai_m < hu_m else ('TIE' if ai_m == hu_m else 'Human')
            print(f"  {metric:<15} {ai_m:>9.1f}% {hu_m:>11.1f}% {better:>8}")

    # -- Verdict --
    print(f"\n{'='*80}")
    if rcv_mape < 25:
        print(f"VERDICT: RCV MAPE = {rcv_mape:.1f}% — UNDER 25% TARGET. Usable first draft!")
    elif rcv_mape < 35:
        print(f"VERDICT: RCV MAPE = {rcv_mape:.1f}% — Close to 25% target. Needs refinement.")
    else:
        print(f"VERDICT: RCV MAPE = {rcv_mape:.1f}% — Above 25% target. Significant room for improvement.")

    print(f"\nKey observations:")
    if tag_bias > 10:
        print(f"  - TAGs biased HIGH by {tag_bias:.0f}% — prototype overestimates furniture items")
    elif tag_bias < -10:
        print(f"  - TAGs biased LOW by {abs(tag_bias):.0f}% — prototype underestimates furniture items")

    if box_bias > 10:
        print(f"  - Boxes biased HIGH by {box_bias:.0f}% — prototype overestimates box counts")
    elif box_bias < -10:
        print(f"  - Boxes biased LOW by {abs(box_bias):.0f}% — prototype underestimates box counts")

    if rcv_bias > 10:
        print(f"  - RCV biased HIGH by {rcv_bias:.0f}% — prototype overprices")
    elif rcv_bias < -10:
        print(f"  - RCV biased LOW by {abs(rcv_bias):.0f}% — prototype underprices")

    print(f"  - Storage set to 3 months default (actual varies wildly per job)")
    print(f"  - Using medium density for all rooms (no photo analysis yet)")
    print(f"{'='*80}")

    # -- Save outputs --
    if output_dir:
        out = Path(output_dir)
    else:
        out = Path(__file__).parent / 'output' / 'backtest'
    out.mkdir(parents=True, exist_ok=True)

    # CSV detail
    csv_path = out / 'backtest_results.csv'
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            'Customer', 'Post_Acq', 'Rooms',
            'Pred_TAGs', 'Actual_TAGs', 'TAG_Error_%',
            'Pred_Boxes', 'Actual_Boxes', 'Box_Error_%',
            'Pred_Labor', 'Actual_Labor', 'Labor_Error_%',
            'Pred_RCV', 'Actual_RCV', 'RCV_Error_%',
            'Human_TAGs', 'Human_Boxes', 'Human_RCV',
            'Human_TAG_Error_%', 'Human_Box_Error_%', 'Human_RCV_Error_%',
            'Notes',
        ])
        for r in results:
            writer.writerow([
                r.customer, r.is_post_acquisition, r.room_count,
                r.pred_tags, r.actual_tags, r.tag_error_pct,
                r.pred_boxes, r.actual_boxes, r.box_error_pct,
                r.pred_labor, r.actual_labor, r.labor_error_pct,
                r.pred_rcv, r.actual_rcv, r.rcv_error_pct,
                r.human_est_tags, r.human_est_boxes, r.human_est_rcv,
                r.human_tag_error_pct, r.human_box_error_pct, r.human_rcv_error_pct,
                r.notes,
            ])

    # Summary text
    summary_path = out / 'backtest_summary.txt'
    with open(summary_path, 'w') as f:
        f.write(f"BACKTEST SUMMARY — {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"{'='*80}\n\n")
        f.write(f"Customers tested: {len(valid)} ({len(post_acq)} post-acquisition, {len(pre_acq)} pre-acquisition)\n")
        f.write(f"Excluded: {len(excluded)}\n\n")

        f.write(f"AGGREGATE ACCURACY METRICS\n")
        f.write(f"{'-'*40}\n")
        f.write(f"{'Metric':<20} {'MAPE':>10} {'MdAE':>10} {'Bias':>10}\n")
        f.write(f"{'TAGs':<20} {tag_mape:>9.1f}% {tag_mdae:>9.1f}% {tag_bias:>+9.1f}%\n")
        f.write(f"{'Boxes':<20} {box_mape:>9.1f}% {box_mdae:>9.1f}% {box_bias:>+9.1f}%\n")
        f.write(f"{'Labor Hours':<20} {labor_mape:>9.1f}% {labor_mdae:>9.1f}% {labor_bias:>+9.1f}%\n")
        f.write(f"{'Total RCV':<20} {rcv_mape:>9.1f}% {rcv_mdae:>9.1f}% {rcv_bias:>+9.1f}%\n\n")

        if post_acq:
            pa_rcv_mape_val = safe_mape([r.rcv_error_pct for r in post_acq])
            f.write(f"Post-Acquisition RCV MAPE: {pa_rcv_mape_val:.1f}% (n={len(post_acq)})\n\n")

        f.write(f"PER-CUSTOMER RESULTS\n")
        f.write(f"{'-'*40}\n")
        for r in valid:
            f.write(f"{r.customer}: {r.room_count} rooms, "
                    f"pred ${r.pred_rcv:,.0f} vs actual ${r.actual_rcv:,.0f} "
                    f"({r.rcv_error_pct:+.1f}%)"
                    f"{' [post-acq]' if r.is_post_acquisition else ''}\n")

        if has_human:
            f.write(f"\nAI vs HUMAN ESTIMATOR\n")
            f.write(f"{'-'*40}\n")
            ai_rcv_mape_val = safe_mape([r.rcv_error_pct for r in has_human])
            human_rcv_mape_val = safe_mape([r.human_rcv_error_pct for r in has_human])
            f.write(f"AI RCV MAPE: {ai_rcv_mape_val:.1f}%\n")
            f.write(f"Human RCV MAPE: {human_rcv_mape_val:.1f}%\n")

        f.write(f"\nNOTES\n")
        f.write(f"- Storage defaulted to 3 months (actual varies per job)\n")
        f.write(f"- All rooms set to 'medium' density (no photo analysis)\n")
        f.write(f"- Drive time defaulted to 25 min\n")
        f.write(f"- Exterior rooms excluded from analysis\n")
        f.write(f"- With Claude vision API, density + room analysis would improve accuracy\n")

    print(f"\nOutputs saved to: {out}")
    print(f"  {csv_path.name}")
    print(f"  {summary_path.name}")

    return {
        'valid_count': len(valid),
        'rcv_mape': rcv_mape,
        'tag_mape': tag_mape,
        'box_mape': box_mape,
        'labor_mape': labor_mape,
        'results': results,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run backtest of estimate prototype')
    parser.add_argument('--output-dir', type=str, default=None)
    parser.add_argument('--density', type=str, default='medium',
                        choices=['light', 'medium', 'heavy'])
    args = parser.parse_args()
    run_full_backtest(output_dir=args.output_dir)
