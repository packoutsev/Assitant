"""
Stretch Goal S4: Historical Job Similarity Search

Given a new walk-through (room count, estimated tags/boxes), finds the 3-5 most
similar past jobs and shows their actual outcomes. Helps the estimator see
"jobs like this one billed $X-$Y" for calibration.

Uses the walkthrough_visual_training.json and post_acq_estimates_full.csv data.
"""

import json
import math
import csv
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

DATA_DIR = Path(__file__).parent / 'data'


@dataclass
class HistoricalJob:
    """A historical job record for similarity matching."""
    customer: str
    is_post_acquisition: bool = False
    room_count: int = 0
    tag_count: float = 0.0
    box_count: float = 0.0
    labor_hours: float = 0.0
    total_rcv: float = 0.0
    loss_type: str = ''
    home_size: str = ''  # small, medium, large, xlarge
    rooms: list = field(default_factory=list)  # room category list


@dataclass
class SimilarityResult:
    """A match result with similarity score."""
    job: HistoricalJob
    similarity_score: float = 0.0  # 0-1, higher = more similar
    distance: float = 0.0  # Lower = more similar


class JobSimilarityEngine:
    """Finds similar historical jobs for estimate calibration."""

    def __init__(self):
        """Load all historical job data."""
        self.jobs = []
        self._load_training_data()

    def _load_training_data(self):
        """Load historical jobs from walkthrough training data."""
        json_path = DATA_DIR / 'walkthrough_visual_training.json'
        with open(json_path) as f:
            data = json.load(f)

        for wt in data['walkthroughs']:
            actual = wt.get('actual_data') or wt.get('final_data') or wt.get('estimate_data')
            if not actual or actual.get('total_rcv', 0) == 0:
                continue

            rooms = [r['room_category'] for r in wt.get('rooms', [])
                     if r.get('room_category') != 'exterior']

            # Classify home size
            room_count = len(rooms)
            if room_count <= 5:
                home_size = 'small'
            elif room_count <= 9:
                home_size = 'medium'
            elif room_count <= 14:
                home_size = 'large'
            else:
                home_size = 'xlarge'

            job = HistoricalJob(
                customer=wt['customer'],
                is_post_acquisition=wt.get('is_post_acquisition', False),
                room_count=room_count,
                tag_count=actual.get('tag_count', 0),
                box_count=actual.get('total_boxes', 0),
                labor_hours=actual.get('labor_hours', 0) + actual.get('supervisor_hours', 0),
                total_rcv=actual.get('total_rcv', 0),
                loss_type=wt.get('loss_type', ''),
                home_size=home_size,
                rooms=rooms,
            )
            self.jobs.append(job)

    def find_similar(self, room_count: int, tag_estimate: float, box_estimate: float,
                     loss_type: str = '', top_n: int = 5,
                     post_acq_only: bool = False) -> list:
        """
        Find the most similar historical jobs.

        Similarity is based on:
        - Room count (normalized, weight=0.3)
        - TAG count (normalized, weight=0.3)
        - Box count (normalized, weight=0.25)
        - Loss type match (bonus, weight=0.15)

        Returns list of SimilarityResult sorted by similarity (best first).
        """
        candidates = self.jobs
        if post_acq_only:
            candidates = [j for j in candidates if j.is_post_acquisition]

        if not candidates:
            return []

        # Compute max values for normalization
        max_rooms = max(j.room_count for j in candidates) or 1
        max_tags = max(j.tag_count for j in candidates) or 1
        max_boxes = max(j.box_count for j in candidates) or 1

        results = []
        for job in candidates:
            # Euclidean distance in normalized feature space
            room_diff = (room_count - job.room_count) / max_rooms
            tag_diff = (tag_estimate - job.tag_count) / max_tags
            box_diff = (box_estimate - job.box_count) / max_boxes

            distance = math.sqrt(
                0.3 * room_diff**2 +
                0.3 * tag_diff**2 +
                0.25 * box_diff**2
            )

            # Loss type bonus
            loss_bonus = 0.0
            if loss_type and job.loss_type:
                if 'water' in loss_type.lower() and 'water' in job.loss_type.lower():
                    loss_bonus = 0.15
                elif 'fire' in loss_type.lower() and 'fire' in job.loss_type.lower():
                    loss_bonus = 0.15

            # Convert distance to similarity score (0-1)
            similarity = max(0, 1.0 - distance) + loss_bonus
            similarity = min(1.0, similarity)

            results.append(SimilarityResult(
                job=job,
                similarity_score=round(similarity, 3),
                distance=round(distance, 4),
            ))

        # Sort by similarity (highest first)
        results.sort(key=lambda r: r.similarity_score, reverse=True)
        return results[:top_n]

    def format_similar_jobs(self, results: list, predicted_rcv: float = 0) -> str:
        """Format similarity results as readable report."""
        lines = []
        lines.append("=" * 70)
        lines.append("SIMILAR HISTORICAL JOBS")
        lines.append("=" * 70)

        if not results:
            lines.append("No similar jobs found.")
            return "\n".join(lines)

        lines.append(f"\n{'#':<3} {'Customer':<22} {'Rooms':>5} {'TAGs':>6} {'Boxes':>6} "
                     f"{'RCV':>10} {'Match':>6}")
        lines.append("-" * 65)

        rcv_values = []
        for i, r in enumerate(results, 1):
            j = r.job
            post = " *" if j.is_post_acquisition else ""
            lines.append(f"{i:<3} {j.customer[:21]:<22} {j.room_count:>5} "
                         f"{j.tag_count:>6.0f} {j.box_count:>6.0f} "
                         f"${j.total_rcv:>9,.0f} {r.similarity_score:>5.0%}{post}")
            rcv_values.append(j.total_rcv)

        if rcv_values:
            min_rcv = min(rcv_values)
            max_rcv = max(rcv_values)
            avg_rcv = sum(rcv_values) / len(rcv_values)
            lines.append(f"\nSimilar jobs billed: ${min_rcv:,.0f} - ${max_rcv:,.0f} "
                         f"(avg ${avg_rcv:,.0f})")

            if predicted_rcv > 0:
                if predicted_rcv < min_rcv * 0.7:
                    lines.append(f"WARNING: Your estimate (${predicted_rcv:,.0f}) is significantly "
                                 f"below similar jobs.")
                elif predicted_rcv > max_rcv * 1.3:
                    lines.append(f"WARNING: Your estimate (${predicted_rcv:,.0f}) is significantly "
                                 f"above similar jobs.")
                else:
                    lines.append(f"Your estimate (${predicted_rcv:,.0f}) is within the range "
                                 f"of similar jobs.")

        lines.append("\n* = post-acquisition job")
        return "\n".join(lines)


if __name__ == '__main__':
    engine = JobSimilarityEngine()

    print(f"Loaded {len(engine.jobs)} historical jobs\n")

    # Test: Find jobs similar to a medium 9-room home
    print("--- Test 1: Medium home (9 rooms, ~90 tags, ~100 boxes) ---")
    results = engine.find_similar(room_count=9, tag_estimate=90, box_estimate=100)
    print(engine.format_similar_jobs(results, predicted_rcv=10000))

    print("\n\n--- Test 2: Large home (15 rooms, ~150 tags, ~200 boxes) ---")
    results = engine.find_similar(room_count=15, tag_estimate=150, box_estimate=200)
    print(engine.format_similar_jobs(results, predicted_rcv=20000))

    print("\n\n--- Test 3: Small home (5 rooms, ~40 tags, ~50 boxes, water loss) ---")
    results = engine.find_similar(room_count=5, tag_estimate=40, box_estimate=50,
                                  loss_type='Water')
    print(engine.format_similar_jobs(results, predicted_rcv=6000))
