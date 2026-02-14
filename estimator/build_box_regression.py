"""
TAG-to-Box Regression from Diana's Historical Estimates.

Photos count TAGs well but miss boxes (hidden inside drawers/cabinets/closets).
This script builds a training dataset and fits a regression for calibration.

The regression itself (R²=0.61) is NOT used as the primary predictor — it's too
coarse (single slope ignores room type). The actual predictor in estimate.py uses:
  1. Room-type density lookup (room_scope_lookup.json)
  2. TAG density ratio to detect under-labeled houses
  3. Implicit closet/pantry allocation for hidden contents

This script is useful for:
  - Building the tag_box_dataset.csv training data
  - Analyzing box/TAG ratio distributions across historical estimates
  - Calibrating the room_scope_lookup.json baselines

Usage:
    python estimator/build_box_regression.py
"""

import pandas as pd
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).parent / 'data'


# ── Phase filtering ──────────────────────────────────────────────────

EXCLUDE_PHASES = [
    'packback', 'pack back', 'pack-back', 'take back',
    'phase 3', 'phase 4', 'phase 5',
    'cleaning', 'clean', 'textiles',
    'storage',
    'load out', 'load-out',
    'total loss',
    'unbox', 'unpack', 'reset',
]


def is_packout_phase(group_desc):
    """Return True if this group_desc is a packout phase (not packback/storage/cleaning)."""
    if pd.isna(group_desc):
        return True  # Keep rows with no group — likely packout
    lower = str(group_desc).lower()
    return not any(kw in lower for kw in EXCLUDE_PHASES)


# ── Box selector classification ──────────────────────────────────────

# Supply-only box selectors (not actual packed boxes)
SUPPLY_ONLY_SELS = {'BX', 'BX>', 'BX>>', 'BXP', 'BX<'}


def is_packed_box(sel):
    """Return True if this sel code represents an actual packed box (not supply-only)."""
    if pd.isna(sel):
        return False
    s = str(sel).strip()
    if s in SUPPLY_ONLY_SELS:
        return False
    return s.startswith('BX')


# ── Build dataset ────────────────────────────────────────────────────

def build_dataset():
    """Parse post_acq_estimates_full.csv and extract per-estimate TAG/box/pad totals."""
    csv_path = DATA_DIR / 'post_acq_estimates_full.csv'
    print(f"Loading {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"  {len(df)} rows, {df['filename'].nunique()} estimates")

    # Filter to packout phases only
    packout_mask = df['group_desc'].apply(is_packout_phase)
    packout = df[packout_mask].copy()
    print(f"  {len(packout)} rows after phase filter (excluded packback/storage/cleaning/etc.)")

    records = []
    for fname, fdf in packout.groupby('filename'):
        # TAGs
        tag_rows = fdf[fdf['sel'] == 'TAG']
        total_tags = int(tag_rows['qty'].sum())

        # Packed boxes (exclude supply-only)
        box_mask = fdf['sel'].apply(is_packed_box)
        box_rows = fdf[box_mask]
        total_boxes = int(box_rows['qty'].sum())

        # Box breakdown by type
        med_boxes = int(box_rows[box_rows['sel'].str.startswith('BXMM', na=False)]['qty'].sum())
        lrg_boxes = int(box_rows[box_rows['sel'].str.startswith('BXML', na=False)]['qty'].sum())
        xlg_boxes = int(box_rows[box_rows['sel'].str.startswith('BXMX', na=False)]['qty'].sum())
        bab_boxes = int(box_rows[box_rows['sel'].str.startswith('BXB', na=False)]['qty'].sum())
        wdr_boxes = int(box_rows[box_rows['sel'].str.startswith('BXW', na=False)]['qty'].sum())
        tv_boxes = int(box_rows[box_rows['sel'].str.startswith('BXT', na=False)]['qty'].sum())
        mat_boxes = int(box_rows[box_rows['sel'].str.contains('^BXMAT', na=False, regex=True)]['qty'].sum())

        # PADs
        pad_rows = fdf[fdf['sel'] == 'PAD']
        total_pads = int(pad_rows['qty'].sum())

        # Total packout RCV
        total_rcv = fdf['rcv'].sum()

        records.append({
            'filename': fname,
            'tags': total_tags,
            'boxes': total_boxes,
            'med_boxes': med_boxes,
            'lrg_boxes': lrg_boxes,
            'xlg_boxes': xlg_boxes,
            'bab_boxes': bab_boxes,
            'wdr_boxes': wdr_boxes,
            'tv_boxes': tv_boxes,
            'mat_boxes': mat_boxes,
            'pads': total_pads,
            'packout_rcv': round(total_rcv, 2),
        })

    dataset = pd.DataFrame(records)
    out_path = DATA_DIR / 'tag_box_dataset.csv'
    dataset.to_csv(out_path, index=False)
    print(f"\nSaved {len(dataset)} estimates to {out_path}")

    return dataset


# ── Analysis & regression ────────────────────────────────────────────

def analyze_and_fit(dataset):
    """Fit TAG->box regression and report results."""
    print(f"\n{'='*60}")
    print("TAG-to-Box Regression Analysis")
    print(f"{'='*60}")

    # Summary stats
    print(f"\nDataset: {len(dataset)} estimates")
    print(f"  Tags:  mean={dataset['tags'].mean():.0f}, "
          f"median={dataset['tags'].median():.0f}, "
          f"range=[{dataset['tags'].min()}, {dataset['tags'].max()}]")
    print(f"  Boxes: mean={dataset['boxes'].mean():.0f}, "
          f"median={dataset['boxes'].median():.0f}, "
          f"range=[{dataset['boxes'].min()}, {dataset['boxes'].max()}]")

    # Filter to valid estimates (both tags > 0 and boxes > 0)
    valid = dataset[(dataset['tags'] > 0) & (dataset['boxes'] > 0)].copy()
    print(f"\nValid estimates (tags > 0 AND boxes > 0): {len(valid)} of {len(dataset)}")

    # Compute box/tag ratio
    valid = valid.copy()
    valid['box_tag_ratio'] = valid['boxes'] / valid['tags']
    print(f"\nBox/TAG ratio: mean={valid['box_tag_ratio'].mean():.2f}, "
          f"median={valid['box_tag_ratio'].median():.2f}, "
          f"std={valid['box_tag_ratio'].std():.2f}")
    print(f"  Range: [{valid['box_tag_ratio'].min():.2f}, {valid['box_tag_ratio'].max():.2f}]")

    # --- Simple linear regression: boxes = a * tags + b ---
    from numpy.polynomial.polynomial import polyfit

    x = valid['tags'].values.astype(float)
    y = valid['boxes'].values.astype(float)

    # polyfit returns [intercept, slope]
    coeffs = polyfit(x, y, 1)
    intercept, slope = coeffs[0], coeffs[1]

    y_pred = slope * x + intercept
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r_squared = 1 - (ss_res / ss_tot)

    residuals = y - y_pred
    mae = np.mean(np.abs(residuals))
    mape = np.mean(np.abs(residuals) / np.maximum(y, 1)) * 100

    print(f"\n--- Linear Regression: boxes = {slope:.3f} * tags + {intercept:.1f} ---")
    print(f"  R²:   {r_squared:.4f}")
    print(f"  MAE:  {mae:.1f} boxes")
    print(f"  MAPE: {mape:.1f}%")
    print(f"  Slope:     {slope:.3f} (each TAG predicts ~{slope:.1f} boxes)")
    print(f"  Intercept: {intercept:.1f}")

    # --- Check if pads improve the model ---
    valid_with_pads = valid[valid['pads'] > 0].copy()
    if len(valid_with_pads) > 10:
        X_multi = np.column_stack([valid_with_pads['tags'].values,
                                    valid_with_pads['pads'].values])
        y_multi = valid_with_pads['boxes'].values.astype(float)

        # Manual OLS: y = X @ beta
        X_design = np.column_stack([np.ones(len(X_multi)), X_multi])
        beta = np.linalg.lstsq(X_design, y_multi, rcond=None)[0]
        y_pred_multi = X_design @ beta
        ss_res_m = np.sum((y_multi - y_pred_multi) ** 2)
        ss_tot_m = np.sum((y_multi - np.mean(y_multi)) ** 2)
        r2_multi = 1 - (ss_res_m / ss_tot_m)

        print(f"\n--- With PADs added (n={len(valid_with_pads)}): ---")
        print(f"  boxes = {beta[1]:.3f}*tags + {beta[2]:.3f}*pads + {beta[0]:.1f}")
        print(f"  R²: {r2_multi:.4f} (vs {r_squared:.4f} tags-only)")
        if r2_multi > r_squared + 0.05:
            print(f"  >> PADs improve R² by {r2_multi - r_squared:.3f} — consider using")
        else:
            print(f"  >> PADs add minimal improvement — sticking with tags-only")

    # --- Predictions for known jobs ---
    print(f"\n{'='*60}")
    print("Predictions for known jobs")
    print(f"{'='*60}")

    known_jobs = [
        ('TONILOVEFINAL.xlsx', 'Love (Toni)', 233),
        ('FLORENCE_SMITH-ESTIM.xlsx', 'Smith (Florence)', None),
    ]

    for fname, label, actual_boxes in known_jobs:
        row = dataset[dataset['filename'] == fname]
        if len(row) == 0:
            print(f"\n  {label}: not found in dataset")
            continue
        row = row.iloc[0]
        predicted = slope * row['tags'] + intercept
        print(f"\n  {label}: {int(row['tags'])} TAGs, {int(row['boxes'])} actual boxes")
        print(f"    Predicted: {predicted:.0f} boxes")
        if actual_boxes:
            print(f"    Target:    {actual_boxes} boxes")
        print(f"    Box/TAG ratio: {row['boxes'] / max(row['tags'], 1):.2f}")

    # --- Prediction helper values ---
    print(f"\n{'='*60}")
    print("Regression coefficients for estimate.py")
    print(f"{'='*60}")
    print(f"  SLOPE = {slope:.4f}")
    print(f"  INTERCEPT = {intercept:.2f}")
    print(f"  R_SQUARED = {r_squared:.4f}")
    print(f"  MEDIAN_RATIO = {valid['box_tag_ratio'].median():.4f}")

    # --- Distribution of box/tag ratios for fallback ---
    percentiles = [10, 25, 50, 75, 90]
    print(f"\nBox/TAG ratio percentiles:")
    for p in percentiles:
        val = np.percentile(valid['box_tag_ratio'].values, p)
        print(f"  P{p}: {val:.2f}")

    return {
        'slope': slope,
        'intercept': intercept,
        'r_squared': r_squared,
        'median_ratio': valid['box_tag_ratio'].median(),
        'mae': mae,
        'mape': mape,
        'n_valid': len(valid),
    }


# ── Main ─────────────────────────────────────────────────────────────

def main():
    dataset = build_dataset()
    results = analyze_and_fit(dataset)

    # Print sample predictions
    print(f"\n{'='*60}")
    print("Sample predictions (boxes = slope * tags + intercept)")
    print(f"{'='*60}")
    for tags in [20, 40, 60, 80, 90, 100, 120, 150]:
        predicted = results['slope'] * tags + results['intercept']
        print(f"  {tags:>3d} TAGs -> {predicted:>5.0f} predicted boxes")


if __name__ == '__main__':
    main()
