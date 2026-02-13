"""
Deliverable 4: Cartage Calculator Engine
Replicates the Cartage Labor Process Calculator spreadsheet.

Calculates CPS LAB (packing labor) and CPS LABS (supervisor) hours
for Xactimate line item entry based on job-specific inputs and factory standards.

Exact replication of the Excel formula:
- TAG cartage = (pad_wrap + load_tag + unload_tag + move_tag + carry_time) * tag_count / 60
- BOX cartage = ((load_3box + unload_3box + move_3box + carry_time) / 3) * box_count / 60
- CREW cartage = drive_time * 2 * crew_size * truck_loads / 60
- TOTAL hours = TAG + BOX + CREW
- CPS LABS = TOTAL * (1 / crew_size)
- CPS LAB = TOTAL - CPS LABS
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class FactoryStandards:
    """Fixed time standards (minutes) — common to all jobs unless overridden."""
    pad_wrap_tag: float = 8.0        # Minutes to pad wrap a TAG item
    load_tag: float = 3.0            # Minutes to load & secure TAG into truck
    unload_tag: float = 3.0          # Minutes to unload TAG onto receiving dock
    move_tag_to_storage: float = 5.0 # Minutes to move TAG into storage and return
    load_3box: float = 3.0           # Minutes to load dolly with 3 boxes into truck
    unload_3box: float = 2.0         # Minutes to unload 3 boxes from truck
    move_3box_to_storage: float = 6.0 # Minutes to move 3 boxes into storage and return


@dataclass
class CartageResult:
    """Output of the cartage calculation."""
    # Component hours
    tag_hours: float = 0.0
    box_hours: float = 0.0
    crew_hours: float = 0.0
    total_hours: float = 0.0

    # Xactimate line entries
    cps_lab_hours: float = 0.0   # Packing labor (unskilled)
    cps_labs_hours: float = 0.0  # Supervisor/admin

    # Per-item rates
    minutes_per_tag: float = 0.0
    minutes_per_box: float = 0.0

    # Input echo
    drive_time_min: float = 0.0
    truck_loads: int = 0
    crew_size: int = 0
    carry_time_min: float = 0.0
    tag_count: int = 0
    box_count: int = 0


def calculate_cartage(
    drive_time_min: float,
    truck_loads: int,
    crew_size: int,
    carry_time_min: float,
    tag_count: int,
    box_count: int,
    standards: Optional[FactoryStandards] = None,
) -> CartageResult:
    """
    Calculate cartage labor hours for a packout job.

    Args:
        drive_time_min: One-way drive time from warehouse to job site (minutes)
        truck_loads: Number of full truck loads needed
        crew_size: Number of staff on the transport team
        carry_time_min: Minutes to carry one load from inside house to truck
        tag_count: Total tagged large items (furniture, appliances, etc.)
        box_count: Total packed boxes of smaller items
        standards: Factory time standards (uses defaults if None)

    Returns:
        CartageResult with CPS LAB and CPS LABS hours for Xactimate entry
    """
    if standards is None:
        standards = FactoryStandards()

    # TAG cartage: time per tagged item
    minutes_per_tag = (
        standards.pad_wrap_tag +
        standards.load_tag +
        standards.unload_tag +
        standards.move_tag_to_storage +
        carry_time_min
    )
    tag_total_minutes = minutes_per_tag * tag_count
    tag_hours = tag_total_minutes / 60.0

    # BOX cartage: time per 3-box dolly load, then per individual box
    minutes_per_3box = (
        standards.load_3box +
        standards.unload_3box +
        standards.move_3box_to_storage +
        carry_time_min
    )
    minutes_per_box = minutes_per_3box / 3.0
    box_total_minutes = minutes_per_box * box_count
    box_hours = box_total_minutes / 60.0

    # CREW cartage: round-trip drive time * crew * loads
    round_trip_minutes = drive_time_min * 2
    crew_total_minutes = round_trip_minutes * crew_size * truck_loads
    crew_hours = crew_total_minutes / 60.0

    # Total hours
    total_hours = tag_hours + box_hours + crew_hours

    # Split into CPS LAB and CPS LABS based on crew size
    # Supervisor fraction = 1 / crew_size
    # Labor fraction = (crew_size - 1) / crew_size
    if crew_size > 0:
        cps_labs_hours = total_hours * (1.0 / crew_size)
        cps_lab_hours = total_hours - cps_labs_hours
    else:
        cps_lab_hours = total_hours
        cps_labs_hours = 0.0

    return CartageResult(
        tag_hours=round(tag_hours, 4),
        box_hours=round(box_hours, 4),
        crew_hours=round(crew_hours, 4),
        total_hours=round(total_hours, 4),
        cps_lab_hours=round(cps_lab_hours, 4),
        cps_labs_hours=round(cps_labs_hours, 4),
        minutes_per_tag=round(minutes_per_tag, 2),
        minutes_per_box=round(minutes_per_box, 2),
        drive_time_min=drive_time_min,
        truck_loads=truck_loads,
        crew_size=crew_size,
        carry_time_min=carry_time_min,
        tag_count=tag_count,
        box_count=box_count,
    )


@dataclass
class TLIResult:
    """Output of the TLI (Total Loss Item) disposal cartage calculation."""
    total_minutes: float = 0.0
    cps_lab_hours: float = 0.0
    cps_labs_hours: float = 0.0  # Time supervisor spends with owner


def calculate_tli_cartage(
    round_trip_minutes: float,
    single_person_loads: int,
    two_person_loads: int,
    supervisor_owner_hours: float = 1.5,
) -> TLIResult:
    """
    Calculate TLI (Total Loss Item) disposal cartage labor.

    Args:
        round_trip_minutes: Minutes for one round trip from loss center to dumpster
        single_person_loads: Number of 1-person loads
        two_person_loads: Number of 2-person loads (each requires 2 staff)
        supervisor_owner_hours: Hours supervisor spends with owner reviewing items

    Returns:
        TLIResult with CPS LAB and CPS LABS hours
    """
    single_minutes = round_trip_minutes * single_person_loads
    two_person_minutes = round_trip_minutes * 2 * two_person_loads
    total_minutes = single_minutes + two_person_minutes
    cps_lab_hours = total_minutes / 60.0

    return TLIResult(
        total_minutes=round(total_minutes, 2),
        cps_lab_hours=round(cps_lab_hours, 4),
        cps_labs_hours=round(supervisor_owner_hours, 4),
    )


# ============================================================================
# VALIDATION TESTS
# ============================================================================

def test_cash_estimate():
    """Validate against Cash PO ESTIMATE cartage calculator."""
    result = calculate_cartage(
        drive_time_min=33, truck_loads=4, crew_size=8,
        carry_time_min=10, tag_count=165, box_count=200,
    )
    assert abs(result.tag_hours - 79.75) < 0.01, f"TAG hrs: {result.tag_hours} != 79.75"
    assert abs(result.box_hours - 23.3333) < 0.01, f"BOX hrs: {result.box_hours} != 23.3333"
    assert abs(result.crew_hours - 35.2) < 0.01, f"CREW hrs: {result.crew_hours} != 35.2"
    assert abs(result.cps_lab_hours - 120.9979) < 0.01, f"CPS LAB: {result.cps_lab_hours} != 120.998"
    assert abs(result.cps_labs_hours - 17.2854) < 0.01, f"CPS LABS: {result.cps_labs_hours} != 17.285"
    print("  PASS: Cash ESTIMATE")


def test_cash_final():
    """Validate against Cash PO FINAL cartage calculator."""
    result = calculate_cartage(
        drive_time_min=33, truck_loads=4, crew_size=8,
        carry_time_min=10, tag_count=202, box_count=188,
    )
    assert abs(result.cps_lab_hours - 135.4208) < 0.01, f"CPS LAB: {result.cps_lab_hours} != 135.421"
    assert abs(result.cps_labs_hours - 19.3458) < 0.01, f"CPS LABS: {result.cps_labs_hours} != 19.346"
    print("  PASS: Cash FINAL")


def test_harmon_estimate():
    """Validate against Harmon ESTIMATE — uses move_tag=0 (non-standard)."""
    standards = FactoryStandards(move_tag_to_storage=0)
    result = calculate_cartage(
        drive_time_min=48, truck_loads=1, crew_size=8,
        carry_time_min=7, tag_count=100, box_count=100,
        standards=standards,
    )
    assert abs(result.tag_hours - 35.0) < 0.01, f"TAG hrs: {result.tag_hours} != 35.0"
    assert abs(result.box_hours - 10.0) < 0.01, f"BOX hrs: {result.box_hours} != 10.0"
    assert abs(result.crew_hours - 12.8) < 0.01, f"CREW hrs: {result.crew_hours} != 12.8"
    assert abs(result.cps_lab_hours - 50.575) < 0.01, f"CPS LAB: {result.cps_lab_hours} != 50.575"
    assert abs(result.cps_labs_hours - 7.225) < 0.01, f"CPS LABS: {result.cps_labs_hours} != 7.225"
    print("  PASS: Harmon ESTIMATE (move_tag=0)")


def test_qaqish_estimate():
    """Validate against Qaqish ESTIMATE cartage calculator."""
    result = calculate_cartage(
        drive_time_min=32, truck_loads=2, crew_size=7,
        carry_time_min=6, tag_count=125, box_count=150,
    )
    assert abs(result.tag_hours - 52.0833) < 0.01, f"TAG hrs: {result.tag_hours} != 52.083"
    assert abs(result.box_hours - 14.1667) < 0.01, f"BOX hrs: {result.box_hours} != 14.167"
    assert abs(result.crew_hours - 14.9333) < 0.01, f"CREW hrs: {result.crew_hours} != 14.933"
    assert abs(result.cps_lab_hours - 69.5857) < 0.02, f"CPS LAB: {result.cps_lab_hours} != 69.586"
    assert abs(result.cps_labs_hours - 11.5976) < 0.01, f"CPS LABS: {result.cps_labs_hours} != 11.598"
    print("  PASS: Qaqish ESTIMATE")


def test_harmon_garage():
    """Validate against Harmon GARAGE ESTIMATE — crew size 3, move_tag=0."""
    standards = FactoryStandards(move_tag_to_storage=0)
    result = calculate_cartage(
        drive_time_min=48, truck_loads=1, crew_size=3,
        carry_time_min=5, tag_count=59, box_count=15,
        standards=standards,
    )
    assert abs(result.cps_lab_hours - 16.5444) < 0.01, f"CPS LAB: {result.cps_lab_hours} != 16.544"
    assert abs(result.cps_labs_hours - 8.2722) < 0.01, f"CPS LABS: {result.cps_labs_hours} != 8.272"
    print("  PASS: Harmon GARAGE (crew=3, move_tag=0)")


def run_all_tests():
    print("Running validation tests...")
    test_cash_estimate()
    test_cash_final()
    test_harmon_estimate()
    test_qaqish_estimate()
    test_harmon_garage()
    print("All tests passed!")


if __name__ == '__main__':
    run_all_tests()

    # Example usage
    print("\n--- Example: Medium-sized packout job ---")
    result = calculate_cartage(
        drive_time_min=25, truck_loads=2, crew_size=6,
        carry_time_min=8, tag_count=100, box_count=150,
    )
    print(f"  TAG hours:  {result.tag_hours:.2f}")
    print(f"  BOX hours:  {result.box_hours:.2f}")
    print(f"  CREW hours: {result.crew_hours:.2f}")
    print(f"  TOTAL:      {result.total_hours:.2f}")
    print(f"  CPS LAB:    {result.cps_lab_hours:.2f} hours")
    print(f"  CPS LABS:   {result.cps_labs_hours:.2f} hours")
    print(f"  (at $58.70/hr LAB, $79.31/hr LABS)")
    lab_cost = result.cps_lab_hours * 58.70
    labs_cost = result.cps_labs_hours * 79.31
    print(f"  LAB cost:   ${lab_cost:,.2f}")
    print(f"  LABS cost:  ${labs_cost:,.2f}")
    print(f"  Total labor: ${lab_cost + labs_cost:,.2f}")
