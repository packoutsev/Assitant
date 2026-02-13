"""
Stretch Goal S5: Supplement Predictor

Based on estimate-vs-final patterns from Deliverable 2, predicts which line items
are most likely to be added as supplements and pre-populates them as suggestions.

Uses estimate_vs_final_comparisons.csv to identify:
1. Items commonly ADDED from estimate to final (supplement candidates)
2. Items commonly REMOVED (overscope candidates)
3. Quantity adjustment patterns (which items tend to increase/decrease)
"""

import json
import csv
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
from collections import Counter

DATA_DIR = Path(__file__).parent / 'data'


@dataclass
class SupplementItem:
    """A predicted supplement line item."""
    desc: str
    frequency: int = 0       # How many times this was added across all jobs
    total_jobs: int = 0      # Total jobs analyzed
    add_rate: float = 0.0    # Percentage of jobs where this was added
    typical_qty: float = 0.0 # Typical quantity when added
    confidence: str = ''     # 'high', 'medium', 'low'


@dataclass
class SupplementPrediction:
    """Complete supplement prediction for a job."""
    likely_additions: list = field(default_factory=list)
    quantity_adjustments: list = field(default_factory=list)
    likely_removals: list = field(default_factory=list)
    total_pairs_analyzed: int = 0


class SupplementPredictor:
    """Predicts likely supplements based on historical estimate-to-final patterns."""

    def __init__(self):
        """Load historical comparison data."""
        self.comparisons = []
        self.added_items_counter = Counter()
        self.removed_items_counter = Counter()
        self.qty_changes = {}  # desc -> list of (change_pct)
        self._load_data()

    def _load_data(self):
        """Load and parse estimate-vs-final comparisons."""
        csv_path = DATA_DIR / 'estimate_vs_final_comparisons.csv'
        with open(csv_path, encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                self.comparisons.append(row)

                # Parse added items
                added = row.get('added_items', '')
                if added:
                    for item in added.split('; '):
                        item = item.strip()
                        if item and len(item) > 3:
                            # Normalize: strip leading "BID ITEM:" etc.
                            clean = re.sub(r'^BID\s*ITEM\s*:?\s*', '', item, flags=re.IGNORECASE)
                            self.added_items_counter[clean] += 1

                # Parse removed items
                removed = row.get('removed_items', '')
                if removed:
                    for item in removed.split('; '):
                        item = item.strip()
                        if item and len(item) > 3:
                            clean = re.sub(r'^BID\s*ITEM\s*:?\s*', '', item, flags=re.IGNORECASE)
                            self.removed_items_counter[clean] += 1

                # Track quantity changes
                for field_name, desc in [
                    ('tag_change_pct', 'TAG count'),
                    ('box_change_pct', 'Box count'),
                    ('labor_change_pct', 'Labor hours'),
                    ('rcv_change_pct', 'Total RCV'),
                ]:
                    try:
                        pct = float(row.get(field_name, 0))
                        if desc not in self.qty_changes:
                            self.qty_changes[desc] = []
                        self.qty_changes[desc].append(pct)
                    except (ValueError, TypeError):
                        pass

    def predict(self, estimate_items: list = None,
                tag_count: float = 0, box_count: float = 0,
                has_storage: bool = True) -> SupplementPrediction:
        """
        Predict likely supplements for a given estimate.

        Args:
            estimate_items: List of dicts with 'desc' key (current estimate line items)
            tag_count: Estimated TAG count
            box_count: Estimated box count
            has_storage: Whether storage is currently in scope

        Returns:
            SupplementPrediction with likely additions and adjustments
        """
        total = len(self.comparisons)
        result = SupplementPrediction(total_pairs_analyzed=total)

        # Get current item descriptions for duplicate checking
        current_descs = set()
        if estimate_items:
            for item in estimate_items:
                current_descs.add(item.get('desc', '').lower().strip())

        # Commonly added items
        for item_desc, count in self.added_items_counter.most_common(20):
            # Skip if already in current estimate
            if any(item_desc.lower() in d for d in current_descs):
                continue

            # Skip generic/one-off items
            if count < 2:
                continue

            add_rate = count / total
            confidence = 'high' if add_rate > 0.15 else ('medium' if add_rate > 0.08 else 'low')

            result.likely_additions.append(SupplementItem(
                desc=item_desc,
                frequency=count,
                total_jobs=total,
                add_rate=round(add_rate, 3),
                confidence=confidence,
            ))

        # Quantity adjustment patterns
        for desc, changes in self.qty_changes.items():
            if not changes:
                continue
            avg_change = sum(changes) / len(changes)
            # Filter out extreme outliers (Kuhn had 7800% change)
            filtered = [c for c in changes if abs(c) < 200]
            if filtered:
                avg_change = sum(filtered) / len(filtered)

            if abs(avg_change) > 3:  # Only report if >3% average change
                direction = "increases" if avg_change > 0 else "decreases"
                result.quantity_adjustments.append({
                    'metric': desc,
                    'avg_change_pct': round(avg_change, 1),
                    'direction': direction,
                    'n': len(filtered),
                })

        # Commonly removed items
        for item_desc, count in self.removed_items_counter.most_common(10):
            if count < 2:
                continue
            result.likely_removals.append(SupplementItem(
                desc=item_desc,
                frequency=count,
                total_jobs=total,
                add_rate=round(count / total, 3),
            ))

        # Context-specific suggestions
        if not has_storage and tag_count > 30:
            result.likely_additions.insert(0, SupplementItem(
                desc='Off-site storage vault (per month)',
                frequency=0,
                add_rate=0.86,  # 86% of packouts have storage
                confidence='high',
            ))

        if box_count > 50:
            # Check for wardrobe boxes
            has_wardrobe = any('wardrobe' in d for d in current_descs)
            if not has_wardrobe:
                result.likely_additions.append(SupplementItem(
                    desc='Provide wardrobe box & tape - large size',
                    frequency=3,
                    add_rate=0.13,
                    confidence='medium',
                    typical_qty=max(2, box_count // 25),
                ))

        return result

    def format_prediction(self, prediction: SupplementPrediction) -> str:
        """Format supplement prediction as readable report."""
        lines = []
        lines.append("=" * 65)
        lines.append("SUPPLEMENT PREDICTOR")
        lines.append(f"Based on {prediction.total_pairs_analyzed} estimate-to-final comparisons")
        lines.append("=" * 65)

        if prediction.likely_additions:
            lines.append("\nLIKELY SUPPLEMENT ITEMS:")
            for item in prediction.likely_additions:
                conf_marker = {'high': '[!]', 'medium': '[?]', 'low': '[ ]'}.get(
                    item.confidence, '[ ]')
                lines.append(f"  {conf_marker} {item.desc}")
                if item.add_rate > 0:
                    lines.append(f"      Added in {item.add_rate:.0%} of jobs "
                                 f"({item.frequency}/{prediction.total_pairs_analyzed})")

        if prediction.quantity_adjustments:
            lines.append("\nEXPECTED QUANTITY ADJUSTMENTS:")
            for adj in prediction.quantity_adjustments:
                lines.append(f"  {adj['metric']}: typically {adj['direction']} "
                             f"{abs(adj['avg_change_pct']):.0f}% from estimate to final "
                             f"(n={adj['n']})")

        if prediction.likely_removals:
            lines.append("\nITEMS SOMETIMES REMOVED:")
            for item in prediction.likely_removals:
                lines.append(f"  [-] {item.desc} (removed in {item.frequency} jobs)")

        return "\n".join(lines)


if __name__ == '__main__':
    predictor = SupplementPredictor()

    print(f"Loaded {len(predictor.comparisons)} estimate-vs-final comparisons")
    print(f"Unique added items: {len(predictor.added_items_counter)}")
    print(f"Unique removed items: {len(predictor.removed_items_counter)}")

    # Test: Predict supplements for a typical medium job
    prediction = predictor.predict(
        tag_count=100, box_count=150,
        has_storage=True,
    )
    print("\n" + predictor.format_prediction(prediction))
