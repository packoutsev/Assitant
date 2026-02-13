"""
Deliverable 5a: Pricing Engine
Takes a list of line items with quantities, applies post-acquisition unit costs,
flags deviations, computes total RCV with tax.

Uses ONLY post-acquisition pricing data (April 15, 2025+).
"""

import pandas as pd
import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

DATA_DIR = Path(__file__).parent / 'data'


@dataclass
class LineItem:
    """A single line item in an estimate."""
    desc: str
    qty: float
    unit: str = ''
    unit_cost: Optional[float] = None  # None = look up from pricing reference
    cat: str = ''
    sel: str = ''
    group_desc: str = ''

    # Populated by pricing engine
    applied_unit_cost: float = 0.0
    rcv: float = 0.0
    tax: float = 0.0
    rcv_with_tax: float = 0.0
    cost_source: str = ''  # 'reference', 'override', 'not_found'
    deviation_pct: float = 0.0
    is_flagged: bool = False
    flag_reason: str = ''


@dataclass
class EstimateResult:
    """Complete estimate output."""
    line_items: list = field(default_factory=list)
    subtotal_rcv: float = 0.0
    total_tax: float = 0.0
    total_rcv_with_tax: float = 0.0
    flags: list = field(default_factory=list)
    missing_items: list = field(default_factory=list)


class PricingEngine:
    """Applies post-acquisition pricing to line items."""

    def __init__(self, pricing_csv: Optional[Path] = None, tax_rate: float = 0.0):
        """
        Args:
            pricing_csv: Path to pricing_reference.csv (default: data/pricing_reference.csv)
            tax_rate: Sales tax rate (0.0 = no tax, varies by item in Xactimate)
        """
        csv_path = pricing_csv or (DATA_DIR / 'pricing_reference.csv')
        self.pricing_df = pd.read_csv(csv_path)
        self.tax_rate = tax_rate

        # Build lookup by description (case-insensitive)
        self.pricing_lookup = {}
        for _, row in self.pricing_df.iterrows():
            key = row['desc'].strip().lower()
            self.pricing_lookup[key] = row

    def find_price(self, desc: str) -> Optional[pd.Series]:
        """Look up pricing for a line item description."""
        key = desc.strip().lower()

        # Exact match
        if key in self.pricing_lookup:
            return self.pricing_lookup[key]

        # Partial match: find best match by overlap
        best_match = None
        best_score = 0
        for stored_key, row in self.pricing_lookup.items():
            # Simple word overlap scoring
            desc_words = set(key.split())
            stored_words = set(stored_key.split())
            overlap = len(desc_words & stored_words)
            total = max(len(desc_words | stored_words), 1)
            score = overlap / total
            if score > best_score and score > 0.6:
                best_score = score
                best_match = row

        return best_match

    def price_line_item(self, item: LineItem) -> LineItem:
        """Apply pricing to a single line item."""
        ref = self.find_price(item.desc)

        if item.unit_cost is not None:
            # User-provided cost — check against reference
            item.applied_unit_cost = item.unit_cost
            item.cost_source = 'override'

            if ref is not None:
                median = ref['unit_cost_weighted_median']
                if median > 0:
                    item.deviation_pct = round(
                        (item.unit_cost - median) / median * 100, 1
                    )
                    if abs(item.deviation_pct) > 20:
                        item.is_flagged = True
                        item.flag_reason = (
                            f"Unit cost ${item.unit_cost:.2f} deviates "
                            f"{item.deviation_pct:+.1f}% from post-acq median "
                            f"${median:.2f}"
                        )
        elif ref is not None:
            # Use reference pricing
            item.applied_unit_cost = ref['unit_cost_weighted_median']
            item.unit = item.unit or ref.get('unit', '')
            item.cat = item.cat or ref.get('cat', '')
            item.sel = item.sel or ref.get('sel', '')
            item.group_desc = item.group_desc or ref.get('group_desc', '')
            item.cost_source = 'reference'
        else:
            # Not found in reference
            item.applied_unit_cost = 0.0
            item.cost_source = 'not_found'
            item.is_flagged = True
            item.flag_reason = f"No pricing reference found for: {item.desc}"

        # Compute RCV
        item.rcv = round(item.applied_unit_cost * item.qty, 2)
        item.tax = round(item.rcv * self.tax_rate, 2)
        item.rcv_with_tax = round(item.rcv + item.tax, 2)

        # Flag zero-quantity items
        if item.qty == 0 and item.cost_source != 'not_found':
            item.is_flagged = True
            item.flag_reason = "Zero quantity — template placeholder?"

        return item

    def price_estimate(self, items: list[LineItem]) -> EstimateResult:
        """Price all line items and compute totals."""
        result = EstimateResult()

        for item in items:
            priced = self.price_line_item(item)
            result.line_items.append(priced)

            if priced.is_flagged:
                result.flags.append({
                    'desc': priced.desc,
                    'reason': priced.flag_reason,
                    'unit_cost': priced.applied_unit_cost,
                    'deviation_pct': priced.deviation_pct,
                })
            if priced.cost_source == 'not_found':
                result.missing_items.append(priced.desc)

        result.subtotal_rcv = round(sum(i.rcv for i in result.line_items), 2)
        result.total_tax = round(sum(i.tax for i in result.line_items), 2)
        result.total_rcv_with_tax = round(result.subtotal_rcv + result.total_tax, 2)

        return result

    def format_estimate(self, result: EstimateResult) -> str:
        """Format estimate as a readable summary."""
        lines = []
        lines.append("=" * 80)
        lines.append("DRAFT ESTIMATE — 1-800-Packouts of the East Valley")
        lines.append("(Post-Acquisition Pricing as of 2025)")
        lines.append("=" * 80)
        lines.append("")
        lines.append(f"{'#':<4} {'Description':<55} {'Qty':>6} {'Unit':>4} {'Cost':>10} {'RCV':>12}")
        lines.append("-" * 95)

        for i, item in enumerate(result.line_items, 1):
            flag = " *" if item.is_flagged else ""
            lines.append(
                f"{i:<4} {item.desc[:54]:<55} {item.qty:>6.1f} {item.unit:>4} "
                f"${item.applied_unit_cost:>8,.2f} ${item.rcv:>10,.2f}{flag}"
            )

        lines.append("-" * 95)
        lines.append(f"{'SUBTOTAL RCV':>75} ${result.subtotal_rcv:>10,.2f}")
        if result.total_tax > 0:
            lines.append(f"{'TAX':>75} ${result.total_tax:>10,.2f}")
            lines.append(f"{'TOTAL':>75} ${result.total_rcv_with_tax:>10,.2f}")

        if result.flags:
            lines.append("")
            lines.append("FLAGS (* items above):")
            for flag in result.flags:
                lines.append(f"  - {flag['reason']}")

        return "\n".join(lines)


def build_standard_estimate(tag_count, box_count, cps_lab_hours, cps_labs_hours,
                            storage_months=3, moving_van_days=2, lg_boxes=0, xl_boxes=0):
    """Build a standard packout estimate from cartage calculator outputs."""
    items = [
        LineItem(desc="Inventory, Packing, Boxing, and Moving charge - per hour",
                 qty=cps_lab_hours, unit="HR"),
        LineItem(desc="Contents Evaluation and/or Supervisor/Admin - per hour",
                 qty=cps_labs_hours, unit="HR"),
        LineItem(desc="Evaluate, tag, & inventory miscellaneous - per item",
                 qty=tag_count, unit="EA"),
        LineItem(desc="Eval. pack & invent. misc items - per Med box-high density",
                 qty=box_count, unit="EA"),
    ]

    if lg_boxes > 0:
        items.append(LineItem(
            desc="Eval. pack & invent. misc items - per Lg box-high density",
            qty=lg_boxes, unit="EA"))
    if xl_boxes > 0:
        items.append(LineItem(
            desc="Eval. pack & invent. misc items - per Xlg box-high density",
            qty=xl_boxes, unit="EA"))

    items.extend([
        LineItem(desc="Provide furniture lightweight blanket/pad",
                 qty=tag_count, unit="EA"),
        LineItem(desc="Moving van (21'-27') and equipment (per day)",
                 qty=moving_van_days, unit="EA"),
        LineItem(desc="Off-site storage vault (per month)",
                 qty=storage_months, unit="MO"),
        LineItem(desc="Provide stretch film/wrap - 20\" x 1000' roll",
                 qty=max(1, box_count // 50), unit="RL"),
        LineItem(desc="Bubble wrap - 24\" wide - Add-on cost for fragile items",
                 qty=max(50, box_count * 3), unit="LF"),
        LineItem(desc="Haul debris - per pickup truck load - including dump fees",
                 qty=1, unit="EA"),
    ])

    return items


if __name__ == '__main__':
    from cartage_calculator import calculate_cartage

    # Example: Price a standard packout
    cartage = calculate_cartage(
        drive_time_min=25, truck_loads=2, crew_size=6,
        carry_time_min=8, tag_count=100, box_count=150,
    )

    items = build_standard_estimate(
        tag_count=100, box_count=150,
        cps_lab_hours=cartage.cps_lab_hours,
        cps_labs_hours=cartage.cps_labs_hours,
        storage_months=3, moving_van_days=2,
    )

    engine = PricingEngine()
    result = engine.price_estimate(items)
    print(engine.format_estimate(result))
