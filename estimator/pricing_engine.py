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

    def price_5phase_estimate(self, items: list, packback_box_discount: float = 0.14) -> EstimateResult:
        """Price a 5-phase estimate, applying packback discount to box items."""
        result = EstimateResult()

        for item in items:
            phase = getattr(item, 'phase', '')

            # Apply packback discount to box line items
            if phase == 'Pack back' and 'box' in item.desc.lower() and item.unit_cost is None:
                # Look up standard price, then apply discount
                ref = self.find_price(item.desc)
                if ref is not None:
                    full_price = ref['unit_cost_weighted_median']
                    item.unit_cost = round(full_price * (1 - packback_box_discount), 2)
                    item.cost_source = 'packback_discount'

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

    def format_5phase_estimate(self, result: EstimateResult) -> str:
        """Format estimate grouped by phase."""
        lines = []
        lines.append("=" * 95)
        lines.append("DRAFT ESTIMATE -- 1-800-Packouts of the East Valley")
        lines.append("(5-Phase Structure with 65% Labor Margin Target)")
        lines.append("=" * 95)

        current_phase = None
        item_num = 0
        phase_totals = {}

        for item in result.line_items:
            phase = getattr(item, 'phase', 'Other')

            if phase != current_phase:
                if current_phase is not None:
                    # Print phase subtotal
                    lines.append(f"{'':>4} {'Phase subtotal:':>55} {'':>6} {'':>4} {'':>10} "
                                f"${phase_totals.get(current_phase, 0):>10,.2f}")
                    lines.append("")
                current_phase = phase
                lines.append(f"--- {phase} ---")
                lines.append(f"{'#':<4} {'Description':<55} {'Qty':>6} {'Unit':>4} {'Cost':>10} {'RCV':>12}")
                lines.append("-" * 95)

            item_num += 1
            flag = " *" if item.is_flagged else ""
            lines.append(
                f"{item_num:<4} {item.desc[:54]:<55} {item.qty:>6.1f} {item.unit:>4} "
                f"${item.applied_unit_cost:>8,.2f} ${item.rcv:>10,.2f}{flag}"
            )

            phase_totals[phase] = phase_totals.get(phase, 0) + item.rcv

        # Final phase subtotal
        if current_phase:
            lines.append(f"{'':>4} {'Phase subtotal:':>55} {'':>6} {'':>4} {'':>10} "
                        f"${phase_totals.get(current_phase, 0):>10,.2f}")

        lines.append("")
        lines.append("=" * 95)

        # Phase summary
        lines.append("PHASE SUMMARY:")
        for phase, total in phase_totals.items():
            pct = total / result.subtotal_rcv * 100 if result.subtotal_rcv > 0 else 0
            lines.append(f"  {phase:<30} ${total:>10,.2f}  ({pct:>5.1f}%)")
        lines.append(f"  {'':->50}")
        lines.append(f"  {'SUBTOTAL RCV':<30} ${result.subtotal_rcv:>10,.2f}")

        if result.flags:
            lines.append("")
            lines.append("FLAGS (* items above):")
            for flag in result.flags:
                lines.append(f"  - {flag['reason']}")

        return "\n".join(lines)

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
    """Build a standard packout estimate from cartage calculator outputs (legacy)."""
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


@dataclass
class PhaseLineItem(LineItem):
    """A line item with phase grouping."""
    phase: str = ''  # Packout, Handling to Storage, Storage, Handling from Storage, Pack back


def calculate_storage_vaults(tag_count: int, box_count: int) -> dict:
    """
    Auto-derive number of storage vaults from TAG and box counts.

    Two-method approach, takes the higher:
    1. Component method: ceil(boxes/60) box vaults + ceil(tags/20) TAG vaults
       (furniture doesn't stack, boxes do — from Schafer validation)
    2. Total capacity method: ceil(total_items/50)
       (empirical fit from master project spreadsheet, MAE=1.3 across 9 jobs)

    Method 1 is more accurate for smaller jobs where furniture takes full vaults.
    Method 2 is more accurate for larger jobs where packing is more efficient.
    We take the LOWER of the two to avoid over-prediction (user can always override).

    Validated against master spreadsheet ('Projects 1-800-Packouts.xlsx'):
    - Schafer: 31 TAGs + 74 boxes → component=4, capacity=3, min=3 (actual 4, explicit override used)
    - Most jobs: 4 vaults is most common default
    """
    import math
    box_vaults = math.ceil(box_count / 60) if box_count > 0 else 0
    tag_vaults = math.ceil(tag_count / 20) if tag_count > 0 else 0
    component_total = box_vaults + tag_vaults

    total_items = tag_count + box_count
    capacity_total = math.ceil(total_items / 50) if total_items > 0 else 0

    # Take the lower to avoid over-prediction; user can always override
    total = max(1, min(component_total, capacity_total))
    return {
        'total': total,
        'box_vaults': box_vaults,
        'tag_vaults': tag_vaults,
        'capacity_vaults': capacity_total,
        'method': 'component' if component_total <= capacity_total else 'capacity',
    }


def _adaptive_pad_count(tag_count: int) -> int:
    """
    Calculate furniture pad count using two-anchor interpolation.

    Anchors from real data:
    - Schafer: 20 pads / 31 TAGs = 0.645 ratio (modest home)
    - Huttie:  103 pads / 84 TAGs = 1.226 ratio (luxury home)

    Linear interpolation between anchors, capped at 1.25.
    Manual pad_count override in build_5phase_estimate() bypasses this entirely.
    """
    if tag_count <= 0:
        return 1
    if tag_count <= 31:
        ratio = 0.645
    elif tag_count >= 84:
        ratio = 1.226
    else:
        # Linear interpolation between anchors
        ratio = 0.645 + (tag_count - 31) / (84 - 31) * (1.226 - 0.645)
    ratio = min(ratio, 1.25)
    return max(1, round(tag_count * ratio))


def build_5phase_estimate(
    tag_count: int,
    box_count: int,
    handling_hours: float,
    moving_van_days: int = 2,
    storage_months: int = 8,
    storage_vaults: int = 4,
    lg_boxes: int = 0,
    xl_boxes: int = 0,
    pad_count: int = None,
    handling_rate: float = 79.04,
    packback_box_discount: float = 0.14,
    bubble_wrap_width: int = 48,
    climate_storage_sf: int = None,
) -> list:
    """
    Build a full 5-phase estimate matching Diana's structure:
      1. Packout - boxes, TAGs, pads, materials (labor embedded in per-unit rates)
      2. Handling to Storage - transport labor + van
      3. Storage - vault months
      4. Handling from Storage - transport labor + van (same as #2)
      5. Pack back - boxes/TAGs at reduced rate (no materials) + debris

    Args:
        tag_count: Number of tagged large items
        box_count: Medium boxes
        handling_hours: Total person-hours for handling (from cartage calculator)
        moving_van_days: Van days per direction (applied to both handling phases)
        storage_months: Total vault-months (e.g., 4 vaults x 2 months = 8)
        storage_vaults: Number of vaults (for documentation, months = vaults * duration)
        lg_boxes: Large boxes
        xl_boxes: Extra-large boxes
        pad_count: Furniture pads (defaults to tag_count if None)
        handling_rate: Billing rate per hour for handling labor (default $79.04 for 65% margin)
        packback_box_discount: Fraction discount on box rates for packback (no materials)
        bubble_wrap_width: 24 or 48 inch bubble wrap
    """
    if pad_count is None:
        pad_count = _adaptive_pad_count(tag_count)

    items = []

    # ── PHASE 1: PACKOUT ──
    # Boxes (labor + materials included in per-unit rate)
    items.append(PhaseLineItem(
        desc="Eval. pack & invent. misc items - per Med box-high density",
        qty=box_count, unit="EA", phase="Packout"))
    if lg_boxes > 0:
        items.append(PhaseLineItem(
            desc="Eval. pack & invent. misc items - per Lg box-high density",
            qty=lg_boxes, unit="EA", phase="Packout"))
    if xl_boxes > 0:
        items.append(PhaseLineItem(
            desc="Eval. pack & invent. misc items - per Xlg box-high density",
            qty=xl_boxes, unit="EA", phase="Packout"))

    # TAGs
    items.append(PhaseLineItem(
        desc="Evaluate, tag, & inventory miscellaneous - per item",
        qty=tag_count, unit="EA", phase="Packout"))

    # Furniture pads
    items.append(PhaseLineItem(
        desc="Provide furniture lightweight blanket/pad",
        qty=pad_count, unit="EA", phase="Packout"))

    # Materials
    if bubble_wrap_width == 48:
        items.append(PhaseLineItem(
            desc="Bubble wrap - 48\" wide - Add-on cost for fragile items",
            qty=max(100, box_count * 7), unit="LF",
            unit_cost=0.40, phase="Packout"))
    else:
        items.append(PhaseLineItem(
            desc="Bubble wrap - 24\" wide - Add-on cost for fragile items",
            qty=max(50, box_count * 3), unit="LF", phase="Packout"))

    items.append(PhaseLineItem(
        desc="Provide stretch film/wrap - 20\" x 1000' roll",
        qty=max(2, box_count // 35), unit="RL", phase="Packout"))

    # ── PHASE 2: HANDLING TO STORAGE ──
    items.append(PhaseLineItem(
        desc="Inventory, Packing, Boxing, and Moving charge - per hour",
        qty=handling_hours, unit="HR",
        unit_cost=handling_rate, phase="Handling to Storage"))
    items.append(PhaseLineItem(
        desc="Moving van (21'-27') and equipment (per day)",
        qty=moving_van_days, unit="EA", phase="Handling to Storage"))

    # ── PHASE 3: STORAGE ──
    items.append(PhaseLineItem(
        desc="Off-site storage vault (per month)",
        qty=storage_months, unit="MO", phase="Storage"))
    if climate_storage_sf is not None and climate_storage_sf > 0:
        items.append(PhaseLineItem(
            desc="Off-site storage & insur. - climate control. (per month)",
            qty=climate_storage_sf, unit="SF", phase="Storage"))

    # ── PHASE 4: HANDLING FROM STORAGE ──
    items.append(PhaseLineItem(
        desc="Moving van (21'-27') and equipment (per day)",
        qty=moving_van_days, unit="EA", phase="Handling from Storage"))
    items.append(PhaseLineItem(
        desc="Inventory, Packing, Boxing, and Moving charge - per hour",
        qty=handling_hours, unit="HR",
        unit_cost=handling_rate, phase="Handling from Storage"))

    # ── PHASE 5: PACK BACK ──
    # Same box/TAG quantities but at reduced rate (no materials cost)
    # We use unit_cost override with the discount applied
    items.append(PhaseLineItem(
        desc="Eval. pack & invent. misc items - per Med box-high density",
        qty=box_count, unit="EA", phase="Pack back"))
    if lg_boxes > 0:
        items.append(PhaseLineItem(
            desc="Eval. pack & invent. misc items - per Lg box-high density",
            qty=lg_boxes, unit="EA", phase="Pack back"))

    items.append(PhaseLineItem(
        desc="Evaluate, tag, & inventory miscellaneous - per item",
        qty=tag_count, unit="EA", phase="Pack back"))

    items.append(PhaseLineItem(
        desc="Haul debris - per pickup truck load - including dump fees",
        qty=1, unit="EA", phase="Pack back"))

    return items, packback_box_discount


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
