"""
Stretch Goal S2: Crew Sizing Recommendations

Based on historical data, recommends optimal crew size given estimated TAG/box counts.
Factors in home size, total items, and distance from warehouse.

Uses walkthrough_visual_training.json and cartage calculator patterns.
"""

import json
import math
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

DATA_DIR = Path(__file__).parent / 'data'


@dataclass
class CrewRecommendation:
    """Crew sizing recommendation."""
    crew_size: int = 6
    truck_loads: int = 2
    estimated_pack_days: float = 1.0
    moving_van_days: int = 2
    confidence: str = 'medium'
    rationale: str = ''

    # Range
    crew_min: int = 5
    crew_max: int = 8
    loads_min: int = 1
    loads_max: int = 4


# Historical calibration from actual jobs
# Derived from estimate-vs-final data + cartage calculator files
CREW_BENCHMARKS = [
    # (tag_range, box_range, crew, loads, pack_days, notes)
    ((0, 50), (0, 75), 5, 1, 1.0, "Small job - 1 truck, 1 day"),
    ((50, 100), (75, 150), 6, 2, 1.0, "Medium job - standard 6-person crew"),
    ((100, 150), (150, 250), 6, 2, 1.5, "Medium-large - may need 1.5 days"),
    ((150, 250), (200, 400), 7, 3, 2.0, "Large job - bigger crew, 2 days"),
    ((250, 400), (400, 800), 8, 4, 2.5, "Very large - full crew, multiple days"),
    ((400, 999), (800, 9999), 8, 5, 3.0, "Extra-large estate - max crew"),
]


class CrewOptimizer:
    """Recommends crew sizing based on job scope."""

    def __init__(self):
        """Load historical patterns."""
        self.historical_jobs = []
        self._load_historical()

    def _load_historical(self):
        """Load actual crew/load data from historical jobs."""
        json_path = DATA_DIR / 'walkthrough_visual_training.json'
        with open(json_path) as f:
            data = json.load(f)

        for wt in data['walkthroughs']:
            actual = wt.get('actual_data') or wt.get('final_data')
            if not actual:
                continue
            self.historical_jobs.append({
                'customer': wt['customer'],
                'tags': actual.get('tag_count', 0),
                'boxes': actual.get('total_boxes', 0),
                'labor': actual.get('labor_hours', 0) + actual.get('supervisor_hours', 0),
                'van_days': actual.get('moving_van_days', 0),
                'rcv': actual.get('total_rcv', 0),
            })

    def recommend(self, tag_count: float, box_count: float,
                  room_count: int = 0,
                  drive_time_min: float = 25.0,
                  is_multi_story: bool = False) -> CrewRecommendation:
        """
        Recommend crew size and truck loads.

        Args:
            tag_count: Estimated TAG items
            box_count: Estimated box count
            room_count: Number of rooms (0 = not known)
            drive_time_min: One-way drive time in minutes
            is_multi_story: Whether home has multiple floors

        Returns:
            CrewRecommendation with sizing details
        """
        result = CrewRecommendation()

        # Find matching benchmark
        matched = None
        for tag_range, box_range, crew, loads, days, notes in CREW_BENCHMARKS:
            if tag_range[0] <= tag_count < tag_range[1]:
                matched = (crew, loads, days, notes)
                break

        if not matched:
            # Default based on tag count
            if tag_count < 50:
                matched = (5, 1, 1.0, "Small job")
            else:
                matched = (8, 5, 3.0, "Extra-large job")

        result.crew_size = matched[0]
        result.truck_loads = matched[1]
        result.estimated_pack_days = matched[2]
        result.moving_van_days = matched[1]

        # Adjustments
        rationale_parts = [matched[3]]

        # Multi-story adjustment
        if is_multi_story:
            result.estimated_pack_days *= 1.25
            rationale_parts.append("+25% time for multi-story")

        # Long drive adjustment
        if drive_time_min > 45:
            # Longer drives favor bigger loads (fewer trips)
            result.truck_loads = max(result.truck_loads, 2)
            rationale_parts.append(f"Long drive ({drive_time_min:.0f} min) - consolidate loads")

        # Box-heavy adjustment
        if box_count > 0 and tag_count > 0:
            box_tag_ratio = box_count / tag_count
            if box_tag_ratio > 3:
                result.estimated_pack_days *= 1.2
                rationale_parts.append(f"Box-heavy ({box_tag_ratio:.1f} box/tag ratio)")
            elif box_tag_ratio < 0.5:
                rationale_parts.append("Furniture-heavy (low box/tag ratio)")

        # Set ranges
        result.crew_min = max(4, result.crew_size - 1)
        result.crew_max = min(10, result.crew_size + 1)
        result.loads_min = max(1, result.truck_loads - 1)
        result.loads_max = result.truck_loads + 1

        # Confidence based on how well we match benchmarks
        total_items = tag_count + box_count
        if 50 <= total_items <= 500:
            result.confidence = 'high'
        elif 30 <= total_items <= 800:
            result.confidence = 'medium'
        else:
            result.confidence = 'low'

        result.rationale = "; ".join(rationale_parts)
        result.estimated_pack_days = round(result.estimated_pack_days, 1)

        return result

    def format_recommendation(self, rec: CrewRecommendation,
                              tag_count: float = 0, box_count: float = 0) -> str:
        """Format crew recommendation as readable report."""
        lines = []
        lines.append("=" * 55)
        lines.append("CREW SIZING RECOMMENDATION")
        lines.append("=" * 55)

        if tag_count or box_count:
            lines.append(f"\nJob scope: {tag_count:.0f} TAGs, {box_count:.0f} boxes")

        lines.append(f"\nRecommended crew: {rec.crew_size} staff "
                     f"(range: {rec.crew_min}-{rec.crew_max})")
        lines.append(f"Truck loads: {rec.truck_loads} "
                     f"(range: {rec.loads_min}-{rec.loads_max})")
        lines.append(f"Estimated pack time: {rec.estimated_pack_days} day(s)")
        lines.append(f"Moving van days: {rec.moving_van_days}")
        lines.append(f"Confidence: {rec.confidence}")
        lines.append(f"\nRationale: {rec.rationale}")

        # Show historical reference
        lines.append(f"\nHistorical reference (similar-sized jobs):")
        similar = [j for j in self.historical_jobs
                   if 0.5 * tag_count <= j['tags'] <= 2.0 * tag_count and j['tags'] > 0]
        if similar:
            for j in sorted(similar, key=lambda x: x['rcv'])[:3]:
                lines.append(f"  {j['customer']}: {j['tags']:.0f} tags, "
                             f"{j['boxes']:.0f} boxes, {j['van_days']:.0f} van days, "
                             f"${j['rcv']:,.0f} RCV")
        else:
            lines.append("  No similar jobs in database")

        return "\n".join(lines)


if __name__ == '__main__':
    optimizer = CrewOptimizer()

    # Test various job sizes
    tests = [
        ("Small job (30 tags, 40 boxes)", 30, 40, 5),
        ("Medium job (90 tags, 120 boxes)", 90, 120, 9),
        ("Large job (150 tags, 300 boxes)", 150, 300, 14),
        ("XL job (300 tags, 500 boxes)", 300, 500, 17),
    ]

    for label, tags, boxes, rooms in tests:
        print(f"\n--- {label} ---")
        rec = optimizer.recommend(tag_count=tags, box_count=boxes, room_count=rooms)
        print(optimizer.format_recommendation(rec, tag_count=tags, box_count=boxes))
