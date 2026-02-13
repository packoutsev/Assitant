"""
Deliverable 5b: Scope Checker
Takes a draft estimate and checks for missing/incomplete scope items.
Flags: missing cleaning, missing materials, zero-qty placeholders,
missing phases, and suggests commonly-missed line items.
"""

import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

DATA_DIR = Path(__file__).parent / 'data'


@dataclass
class ScopeFlag:
    """A single scope issue found."""
    severity: str  # 'critical', 'warning', 'info'
    category: str  # 'missing_phase', 'missing_material', 'zero_qty', 'missing_cleaning', etc.
    message: str
    suggested_item: Optional[str] = None
    suggested_qty: Optional[float] = None


@dataclass
class ScopeCheckResult:
    """Results of scope checking."""
    flags: list = field(default_factory=list)
    missing_phases: list = field(default_factory=list)
    missing_materials: list = field(default_factory=list)
    suggested_additions: list = field(default_factory=list)
    score: float = 100.0  # Completeness score (100 = all good)

    @property
    def critical_count(self):
        return sum(1 for f in self.flags if f.severity == 'critical')

    @property
    def warning_count(self):
        return sum(1 for f in self.flags if f.severity == 'warning')


# Standard scope elements that should be present in most packout estimates
REQUIRED_ELEMENTS = {
    'packing_labor': {
        'patterns': ['packing.*boxing.*moving.*per hour', 'moving charge.*per hour',
                     'inventory.*packing.*boxing'],
        'severity': 'critical',
        'message': 'Missing packing labor (CPS LAB)',
    },
    'supervisor': {
        'patterns': ['supervisor.*admin.*per hour', 'contents evaluation.*per hour'],
        'severity': 'critical',
        'message': 'Missing supervisor hours (CPS LABS)',
    },
    'tag_inventory': {
        'patterns': ['evaluate.*tag.*inventory', 'tag.*inventory.*per item'],
        'severity': 'critical',
        'message': 'Missing TAG item inventory line',
    },
    'box_packing': {
        'patterns': ['med box.*high density', 'per med box'],
        'severity': 'critical',
        'message': 'Missing box packing line (med box high density)',
    },
    'moving_van': {
        'patterns': ['moving van.*per day', 'moving van.*equipment'],
        'severity': 'critical',
        'message': 'Missing moving van rental',
    },
    'storage': {
        'patterns': ['storage vault.*per month', 'off-site storage'],
        'severity': 'warning',
        'message': 'Missing storage — most packouts need at least 3 months',
    },
    'furniture_pads': {
        'patterns': ['furniture.*blanket.*pad', 'lightweight blanket'],
        'severity': 'warning',
        'message': 'Missing furniture pads/blankets',
    },
    'stretch_wrap': {
        'patterns': ['stretch film.*wrap', 'stretch wrap'],
        'severity': 'warning',
        'message': 'Missing stretch film/wrap',
    },
    'haul_debris': {
        'patterns': ['haul debris.*pickup', 'dump fee'],
        'severity': 'warning',
        'message': 'Missing debris haul',
    },
}

# Materials that are commonly missed (from correction factor analysis)
COMMONLY_MISSED = [
    {'desc': 'Provide box, packing paper & tape - medium size',
     'when': 'box_count > 20', 'suggested_qty_factor': 0.1},
    {'desc': 'Provide wardrobe box & tape - large size',
     'when': 'has_bedroom', 'suggested_qty': 4},
    {'desc': 'Bubble wrap - 24" wide - Add-on cost for fragile items',
     'when': 'has_kitchen_or_dining', 'suggested_qty_factor': 3.0},
    {'desc': 'Provide box & tape - medium size',
     'when': 'box_count > 50', 'suggested_qty_factor': 0.05},
]

# Phases that should be considered
PHASES = {
    'packout': ['packing.*boxing.*moving', 'inventory.*packing', 'evaluate.*tag'],
    'storage': ['storage vault', 'off-site storage', 'storage.*insur'],
    'packback': ['unpack.*invent', 'unpack.*reset', 'packback'],
    'cleaning': ['clean misc items', 'clean bric-a-brac', 'clean.*med box'],
}


class ScopeChecker:
    """Checks estimate scope for completeness."""

    def __init__(self, standard_items_path: Optional[Path] = None):
        """Load standard line items template."""
        json_path = standard_items_path or (DATA_DIR / 'standard_line_items.json')
        with open(json_path) as f:
            data = json.load(f)
        self.standard_items = data['items']
        self.metadata = data['metadata']

    def check(self, line_items: list, job_context: Optional[dict] = None) -> ScopeCheckResult:
        """
        Check an estimate for scope completeness.

        Args:
            line_items: List of dicts with at least 'desc' and 'qty' keys
            job_context: Optional dict with keys like 'has_bedroom', 'has_kitchen',
                        'box_count', 'tag_count', 'is_packback', etc.

        Returns:
            ScopeCheckResult with flags and suggestions
        """
        import re
        result = ScopeCheckResult()
        context = job_context or {}

        # Normalize line item descriptions
        descs = [str(item.get('desc', '')).lower() for item in line_items]
        desc_text = ' | '.join(descs)

        # Check required elements
        for element_id, element in REQUIRED_ELEMENTS.items():
            found = False
            for pattern in element['patterns']:
                if re.search(pattern, desc_text, re.IGNORECASE):
                    found = True
                    break

            if not found:
                flag = ScopeFlag(
                    severity=element['severity'],
                    category='missing_element',
                    message=element['message'],
                )
                result.flags.append(flag)
                result.score -= 15 if element['severity'] == 'critical' else 5

        # Check for zero-quantity placeholders
        for item in line_items:
            qty = item.get('qty', 0)
            desc = item.get('desc', '')
            if qty == 0 and desc:
                result.flags.append(ScopeFlag(
                    severity='warning',
                    category='zero_qty',
                    message=f"Zero quantity: {desc[:60]}",
                ))
                result.score -= 2

        # Check phases
        phase_present = {}
        for phase, patterns in PHASES.items():
            found = False
            for pattern in patterns:
                if re.search(pattern, desc_text, re.IGNORECASE):
                    found = True
                    break
            phase_present[phase] = found

        if not phase_present.get('packout'):
            result.missing_phases.append('packout')
            result.flags.append(ScopeFlag(
                severity='critical', category='missing_phase',
                message='No packout scope found',
            ))

        if not phase_present.get('storage'):
            result.missing_phases.append('storage')
            result.flags.append(ScopeFlag(
                severity='warning', category='missing_phase',
                message='No storage scope — 86% of packouts include storage',
            ))

        if not phase_present.get('cleaning'):
            result.missing_phases.append('cleaning')
            result.flags.append(ScopeFlag(
                severity='info', category='missing_phase',
                message='No cleaning scope — only 14% of estimates include cleaning '
                        '(commonly added later as supplement)',
            ))

        # Suggest commonly missed items based on job size
        tag_count = context.get('tag_count', 0)
        box_count = context.get('box_count', 0)

        if tag_count > 50 and not re.search(r'wardrobe box', desc_text, re.IGNORECASE):
            result.suggested_additions.append({
                'desc': 'Provide wardrobe box & tape - large size',
                'suggested_qty': max(2, tag_count // 20),
                'reason': f'Large job ({tag_count} TAGs) — wardrobe boxes commonly needed',
            })

        if box_count > 100 and not re.search(r'packing paper', desc_text, re.IGNORECASE):
            result.suggested_additions.append({
                'desc': 'Provide box, packing paper & tape - medium size',
                'suggested_qty': max(5, box_count // 20),
                'reason': f'{box_count} boxes — packing paper commonly needed',
            })

        # Check if large box and XL box lines are present for bigger jobs
        if box_count > 50:
            if not re.search(r'lg box.*high density|per lg box', desc_text, re.IGNORECASE):
                result.suggested_additions.append({
                    'desc': 'Eval. pack & invent. misc items - per Lg box-high density',
                    'suggested_qty': max(1, box_count // 20),
                    'reason': 'Large boxes commonly needed for oversized items',
                })

        result.score = max(0, result.score)
        return result

    def format_report(self, result: ScopeCheckResult) -> str:
        """Format scope check as readable report."""
        lines = []
        lines.append("=" * 60)
        lines.append(f"SCOPE CHECK REPORT — Score: {result.score:.0f}/100")
        lines.append("=" * 60)

        if result.critical_count > 0:
            lines.append(f"\nCRITICAL ({result.critical_count}):")
            for f in result.flags:
                if f.severity == 'critical':
                    lines.append(f"  [!] {f.message}")

        if result.warning_count > 0:
            lines.append(f"\nWARNINGS ({result.warning_count}):")
            for f in result.flags:
                if f.severity == 'warning':
                    lines.append(f"  [?] {f.message}")

        info_flags = [f for f in result.flags if f.severity == 'info']
        if info_flags:
            lines.append(f"\nINFO ({len(info_flags)}):")
            for f in info_flags:
                lines.append(f"  [i] {f.message}")

        if result.missing_phases:
            lines.append(f"\nMISSING PHASES: {', '.join(result.missing_phases)}")

        if result.suggested_additions:
            lines.append("\nSUGGESTED ADDITIONS:")
            for s in result.suggested_additions:
                lines.append(f"  + {s['desc']} (qty: {s['suggested_qty']})")
                lines.append(f"    Reason: {s['reason']}")

        if result.score >= 90:
            lines.append("\nScope looks complete.")
        elif result.score >= 70:
            lines.append("\nScope is mostly complete — review warnings above.")
        else:
            lines.append("\nScope has significant gaps — review critical items above.")

        return "\n".join(lines)


if __name__ == '__main__':
    # Test with a minimal estimate missing several items
    checker = ScopeChecker()

    test_items = [
        {'desc': 'Inventory, Packing, Boxing, and Moving charge - per hour', 'qty': 50},
        {'desc': 'Contents Evaluation and/or Supervisor/Admin - per hour', 'qty': 10},
        {'desc': 'Evaluate, tag, & inventory miscellaneous - per item', 'qty': 80},
        {'desc': 'Eval. pack & invent. misc items - per Med box-high density', 'qty': 120},
        {'desc': 'Moving van (21\'-27\') and equipment (per day)', 'qty': 2},
        {'desc': 'Provide furniture lightweight blanket/pad', 'qty': 80},
        # Missing: storage, stretch wrap, haul debris, cleaning
    ]

    result = checker.check(test_items, job_context={'tag_count': 80, 'box_count': 120})
    print(checker.format_report(result))
