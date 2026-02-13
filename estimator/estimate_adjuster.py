"""
Deliverable 5c: Estimate Adjuster
Applies correction factors from Deliverable 2 to adjust initial TAG/box estimates.
Provides confidence ranges (low/expected/high) based on historical variance.
"""

import json
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

DATA_DIR = Path(__file__).parent / 'data'


@dataclass
class AdjustedEstimate:
    """Adjusted estimate with confidence ranges."""
    # TAG counts
    raw_tags: float = 0.0
    adjusted_tags: float = 0.0
    tags_low: float = 0.0
    tags_high: float = 0.0

    # Box counts
    raw_boxes: float = 0.0
    adjusted_boxes: float = 0.0
    boxes_low: float = 0.0
    boxes_high: float = 0.0

    # Labor hours (from cartage calculator, adjusted)
    raw_labor_hours: float = 0.0
    adjusted_labor_hours: float = 0.0
    labor_low: float = 0.0
    labor_high: float = 0.0

    # RCV
    raw_rcv: float = 0.0
    adjusted_rcv: float = 0.0
    rcv_low: float = 0.0
    rcv_high: float = 0.0

    # Metadata
    confidence: float = 0.0
    adjustment_notes: list = None

    def __post_init__(self):
        if self.adjustment_notes is None:
            self.adjustment_notes = []


class EstimateAdjuster:
    """Adjusts estimates based on correction factors from estimate-vs-final analysis."""

    def __init__(self, factors_path: Optional[Path] = None):
        """Load correction factors."""
        json_path = factors_path or (DATA_DIR / 'correction_factors.json')
        with open(json_path) as f:
            self.factors = json.load(f)

    def adjust(self, tags: float, boxes: float, labor_hours: float = 0,
               rcv: float = 0, is_post_acquisition: bool = True) -> AdjustedEstimate:
        """
        Adjust initial estimates based on historical correction factors.

        Uses post-acquisition factors when available, falls back to all-data factors.
        Post-acquisition data is weighted more heavily since it reflects current
        operations (Matthew's ownership, April 2025+).

        Args:
            tags: Initial TAG item estimate
            boxes: Initial box count estimate
            labor_hours: Initial labor hours (optional, 0 = not provided)
            rcv: Initial RCV estimate (optional, 0 = not provided)
            is_post_acquisition: Whether this is a post-acquisition job

        Returns:
            AdjustedEstimate with ranges
        """
        result = AdjustedEstimate()
        result.raw_tags = tags
        result.raw_boxes = boxes
        result.raw_labor_hours = labor_hours
        result.raw_rcv = rcv

        # Get correction factors
        tag_factor = self._get_factor('tag_multiplier', is_post_acquisition)
        box_factor = self._get_factor('box_multiplier', is_post_acquisition)
        labor_factor = self._get_factor('labor_multiplier', is_post_acquisition)
        rcv_factor = self._get_factor('rcv_multiplier', is_post_acquisition)

        # Apply adjustments
        result.adjusted_tags = round(tags * tag_factor['value'])
        result.adjusted_boxes = round(boxes * box_factor['value'])
        result.adjusted_labor_hours = round(labor_hours * labor_factor['value'], 1)
        result.adjusted_rcv = round(rcv * rcv_factor['value'], 2)

        # Compute confidence ranges using standard deviation
        # Use wider ranges when we have less data
        tag_std = tag_factor.get('std', 0.3)
        box_std = box_factor.get('std', 0.3)
        labor_std = labor_factor.get('std', 0.2)
        rcv_std = rcv_factor.get('std', 0.3)

        result.tags_low = max(0, round(tags * max(0.5, tag_factor['value'] - tag_std)))
        result.tags_high = round(tags * (tag_factor['value'] + tag_std))
        result.boxes_low = max(0, round(boxes * max(0.5, box_factor['value'] - box_std)))
        result.boxes_high = round(boxes * (box_factor['value'] + box_std))
        result.labor_low = max(0, round(labor_hours * max(0.5, labor_factor['value'] - labor_std), 1))
        result.labor_high = round(labor_hours * (labor_factor['value'] + labor_std), 1)
        result.rcv_low = max(0, round(rcv * max(0.5, rcv_factor['value'] - rcv_std), 2))
        result.rcv_high = round(rcv * (rcv_factor['value'] + rcv_std), 2)

        # Overall confidence
        result.confidence = min(
            tag_factor['confidence'],
            box_factor['confidence'],
        )

        # Notes
        if tag_factor['value'] > 1.05:
            result.adjustment_notes.append(
                f"TAGs typically increase {(tag_factor['value']-1)*100:.0f}% from estimate to final"
            )
        elif tag_factor['value'] < 0.95:
            result.adjustment_notes.append(
                f"TAGs typically decrease {(1-tag_factor['value'])*100:.0f}% from estimate to final"
            )

        if box_factor['value'] > 1.05:
            result.adjustment_notes.append(
                f"Boxes typically increase {(box_factor['value']-1)*100:.0f}% from estimate to final"
            )
        elif box_factor['value'] < 0.95:
            result.adjustment_notes.append(
                f"Boxes typically decrease {(1-box_factor['value'])*100:.0f}% from estimate to final"
            )

        # Add commonly-added items note
        commonly_added = self.factors.get('commonly_added_items', [])
        if commonly_added:
            top_items = [item['desc'][:50] for item in commonly_added[:3]]
            result.adjustment_notes.append(
                f"Commonly added in finals: {'; '.join(top_items)}"
            )

        return result

    def _get_factor(self, factor_name: str, use_post_acq: bool) -> dict:
        """Get the best correction factor."""
        factor_data = self.factors.get(factor_name, {})

        if use_post_acq and factor_data.get('post_acquisition', {}).get('n', 0) >= 3:
            src = factor_data['post_acquisition']
            return {
                'value': src['median'],
                'std': src.get('std', 0.3),
                'confidence': factor_data.get('confidence', 0.7),
            }
        elif factor_data.get('all_estimates', {}).get('n', 0) > 0:
            src = factor_data['all_estimates']
            return {
                'value': src['median'],
                'std': src.get('std', 0.3),
                'confidence': factor_data.get('confidence', 0.6),
            }
        else:
            return {'value': 1.0, 'std': 0.3, 'confidence': 0.5}

    def format_report(self, result: AdjustedEstimate) -> str:
        """Format adjustment report."""
        lines = []
        lines.append("=" * 60)
        lines.append(f"ESTIMATE ADJUSTMENT REPORT (Confidence: {result.confidence:.0%})")
        lines.append("=" * 60)
        lines.append("")
        lines.append(f"{'Metric':<20} {'Initial':>10} {'Adjusted':>10} {'Low':>10} {'High':>10}")
        lines.append("-" * 62)
        lines.append(f"{'TAGs':<20} {result.raw_tags:>10.0f} {result.adjusted_tags:>10.0f} "
                     f"{result.tags_low:>10.0f} {result.tags_high:>10.0f}")
        lines.append(f"{'Boxes':<20} {result.raw_boxes:>10.0f} {result.adjusted_boxes:>10.0f} "
                     f"{result.boxes_low:>10.0f} {result.boxes_high:>10.0f}")
        if result.raw_labor_hours > 0:
            lines.append(f"{'Labor Hours':<20} {result.raw_labor_hours:>10.1f} "
                         f"{result.adjusted_labor_hours:>10.1f} "
                         f"{result.labor_low:>10.1f} {result.labor_high:>10.1f}")
        if result.raw_rcv > 0:
            lines.append(f"{'RCV':<20} ${result.raw_rcv:>9,.0f} ${result.adjusted_rcv:>9,.0f} "
                         f"${result.rcv_low:>9,.0f} ${result.rcv_high:>9,.0f}")

        if result.adjustment_notes:
            lines.append("\nNotes:")
            for note in result.adjustment_notes:
                lines.append(f"  - {note}")

        return "\n".join(lines)


if __name__ == '__main__':
    adjuster = EstimateAdjuster()

    # Test: adjust a typical initial estimate
    result = adjuster.adjust(
        tags=100, boxes=150, labor_hours=60, rcv=15000,
        is_post_acquisition=True,
    )
    print(adjuster.format_report(result))

    print("\n\n--- Pre-acquisition job adjustment ---")
    result2 = adjuster.adjust(
        tags=80, boxes=200, labor_hours=50, rcv=12000,
        is_post_acquisition=False,
    )
    print(adjuster.format_report(result2))
