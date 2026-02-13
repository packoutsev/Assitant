"""
Deliverable 2: Estimate vs. Final Correction Factors
Compares ESTIMATE and FINAL versions of the same job to find systematic biases.
"""

import pandas as pd
import numpy as np
import json
import re
from pathlib import Path
from datetime import datetime

ESTIMATES_DIR = Path(r'C:\Users\matth\Downloads\Spreadsheets\Xactimate Estimates')
DATE_ANALYSIS = Path(r'C:\Users\matth\Downloads\Spreadsheets\xactimate_excel_date_analysis.csv')
OUTPUT_DIR = Path(r'C:\Users\matth\estimator\data')
ACQUISITION_DATE = pd.Timestamp('2025-04-15')

# Column names (dynamic lookup)
COL_NAMES = {
    'desc': 'Desc', 'qty': 'Qty', 'unit': 'Unit', 'unit_cost': 'Unit Cost',
    'rcv': 'RCV', 'cat': 'Cat', 'sel': 'Sel', 'date': 'Date',
    'group_code': 'Group Code', 'group_desc': 'Group Description',
    'line_num': '#',
}

# Manually verified estimate -> final pairs
PAIRS = [
    # (customer_name, estimate_file, final_file, is_post_acquisition)
    ('Cash', 'CASH_PO_ESTIMATE.xlsx', 'CASH_PO_FINAL.xlsx', False),
    ('Emmons', 'EMMONS_PO_ESTIMATE.xlsx', 'EMMONS_PO_FINAL.xlsx', False),
    ('Francis', 'FRANCIS_PO_ESTIMATE.xlsx', 'FRANCIS_PO_FINAL.xlsx', False),
    ('Harmon', 'HARMON_ESTIMATE.xlsx', 'HARMON_FINAL.xlsx', True),
    ('Maran', 'MARAN_PO_ESTIMATE.xlsx', 'MARAN_PO_FINAL.xlsx', False),
    ('Murphy', 'MURPHY_PO_ESTIMATE.xlsx', 'MURPHY_PO_FINAL.xlsx', False),
    ('Odeum', 'ODEUM_ESTIMATE.xlsx', 'ODEUM_FINAL.xlsx', False),
    ('Oliver', 'OLIVER_ESTIMATE.xlsx', 'OLIVER_PO_FINAL.xlsx', True),
    ('RoyalOaks', 'ROYALOAKS#1005_EST.xlsx', 'ROYALOAKS#1005_FINAL.xlsx', False),
    ('Shipman', 'SHIPMAN_PO_ESTIMATE.xlsx', 'SHIPMAN_PO_FINAL.xlsx', False),
    ('Strong', 'STRONG_ESTIMATE.xlsx', 'STRONG_PO_FINAL.xlsx', False),
    ('Watts', 'WATTS_PO_ESTIMATE.xlsx', 'WATTS_PO_FINAL.xlsx', False),
    ('Clark', 'CLARK-DRAFT1.xlsx', 'CLARK-POST.xlsx', True),
    ('Beckmann', 'BECKMANN_ESTIMATE.xlsx', 'BECKMANN_PO_PB_FINAL.xlsx', False),
    ('Sanders', 'SANDERS_JACKLYN_EST.xlsx', 'SANDERS_JACLYN_FINAL.xlsx', True),
    ('Stout', 'STOUT_MICAHELPACKOUT.xlsx', 'STOUT_PACKOUTFINAL.xlsx', False),
    ('Susank', 'SUSANK-ESTIMATE.xlsx', 'SUSANK_PO_FNL.xlsx', True),
    ('TonyLove', 'TONYLOVE-EST1-0.xlsx', 'TONILOVEFINAL.xlsx', True),
    ('Strapoli', 'STRAPOLI_PACKBACKEST.xlsx', 'STRAPOLI_PO_FINAL.xlsx', True),
    ('Sagewood', 'SAGEWOOD_57102_EST.xlsx', 'SAGEWOOD_57102_PO_F.xlsx', False),
    ('Kuhn', 'KUHN_PB_ESTIMATE.xlsx', 'KUHN_PO_FINAL.xlsx', False),
    ('Dodd', 'DODD_SPACKOUT.xlsx', 'DODD_FINALPACKOUT.xlsx', False),
    ('Thompson', 'THOMPSON_BPACKOUT.xlsx', 'THOMPSON_POFINAL.xlsx', False),
]


def find_columns(df):
    header = df.iloc[0]
    col_map = {}
    for key, name in COL_NAMES.items():
        for i, val in enumerate(header):
            if str(val).strip() == name:
                col_map[key] = i
                break
    return col_map


def parse_file(filepath):
    """Parse an Excel file and return DataFrame of line items."""
    try:
        df = pd.read_excel(filepath, header=None)
    except Exception as e:
        print(f"  ERROR reading {filepath.name}: {e}")
        return None

    if len(df) < 2:
        return None

    col_map = find_columns(df)
    required = ['desc', 'qty', 'unit_cost', 'rcv']
    if any(k not in col_map for k in required):
        return None

    rows = []
    for _, row in df.iloc[1:].iterrows():
        desc = str(row.iloc[col_map['desc']]).strip() if pd.notna(row.iloc[col_map['desc']]) else ''
        if not desc or desc == 'nan':
            continue

        qty = pd.to_numeric(row.iloc[col_map['qty']], errors='coerce')
        unit_cost = pd.to_numeric(row.iloc[col_map['unit_cost']], errors='coerce')
        rcv = pd.to_numeric(row.iloc[col_map['rcv']], errors='coerce')
        unit = str(row.iloc[col_map.get('unit', 0)]).strip() if 'unit' in col_map and pd.notna(row.iloc[col_map['unit']]) else ''
        sel = str(row.iloc[col_map.get('sel', 0)]).strip() if 'sel' in col_map and pd.notna(row.iloc[col_map['sel']]) else ''
        group_desc = str(row.iloc[col_map.get('group_desc', 0)]).strip() if 'group_desc' in col_map and pd.notna(row.iloc[col_map['group_desc']]) else ''

        rows.append({
            'desc': desc,
            'qty': float(qty) if pd.notna(qty) else 0.0,
            'unit_cost': float(unit_cost) if pd.notna(unit_cost) else 0.0,
            'rcv': float(rcv) if pd.notna(rcv) else 0.0,
            'unit': unit,
            'sel': sel,
            'group_desc': group_desc,
        })

    return pd.DataFrame(rows) if rows else None


def extract_tag_count(df):
    """Extract TAG item count from line items."""
    tag_rows = df[df['desc'].str.contains('tag.*inventory|evaluate.*tag', case=False, na=False)]
    if tag_rows.empty:
        tag_rows = df[df['sel'].str.contains('TAG', case=False, na=False)]
    return tag_rows['qty'].sum() if not tag_rows.empty else 0


def extract_box_count(df):
    """Extract box count (medium box high density packing) from line items."""
    box_rows = df[df['desc'].str.contains('Med box.*high density|per Med box', case=False, na=False)]
    if box_rows.empty:
        box_rows = df[df['sel'].str.contains('BXMME', case=False, na=False)]
    return box_rows['qty'].sum() if not box_rows.empty else 0


def extract_labor_hours(df):
    """Extract total packing labor hours (CPS LAB)."""
    labor_rows = df[df['desc'].str.contains('Packing.*Boxing.*Moving.*per hour|Moving charge.*per hour', case=False, na=False)]
    if labor_rows.empty:
        labor_rows = df[df['sel'].str.contains('LAB$', case=False, na=False)]
    return labor_rows['qty'].sum() if not labor_rows.empty else 0


def extract_supervisor_hours(df):
    """Extract supervisor hours (CPS LABS)."""
    sup_rows = df[df['desc'].str.contains('Supervisor.*Admin.*per hour', case=False, na=False)]
    if sup_rows.empty:
        sup_rows = df[df['sel'].str.contains('LABS$', case=False, na=False)]
    return sup_rows['qty'].sum() if not sup_rows.empty else 0


def compare_pair(customer, est_file, fnl_file, is_post_acq):
    """Compare estimate vs final for a single customer."""
    est_path = ESTIMATES_DIR / est_file
    fnl_path = ESTIMATES_DIR / fnl_file

    if not est_path.exists() or not fnl_path.exists():
        print(f"  SKIP {customer}: file(s) not found")
        return None

    est_df = parse_file(est_path)
    fnl_df = parse_file(fnl_path)

    if est_df is None or fnl_df is None:
        print(f"  SKIP {customer}: could not parse")
        return None

    # Extract key metrics
    est_tags = extract_tag_count(est_df)
    fnl_tags = extract_tag_count(fnl_df)
    est_boxes = extract_box_count(est_df)
    fnl_boxes = extract_box_count(fnl_df)
    est_labor = extract_labor_hours(est_df)
    fnl_labor = extract_labor_hours(fnl_df)
    est_sup = extract_supervisor_hours(est_df)
    fnl_sup = extract_supervisor_hours(fnl_df)
    est_rcv = est_df['rcv'].sum()
    fnl_rcv = fnl_df['rcv'].sum()

    # Find added/removed line items
    est_descs = set(est_df['desc'].unique())
    fnl_descs = set(fnl_df['desc'].unique())
    added = fnl_descs - est_descs
    removed = est_descs - fnl_descs

    result = {
        'customer': customer,
        'estimate_file': est_file,
        'final_file': fnl_file,
        'is_post_acquisition': is_post_acq,
        'est_tags': est_tags,
        'fnl_tags': fnl_tags,
        'tag_change_pct': round((fnl_tags - est_tags) / max(est_tags, 1) * 100, 1),
        'est_boxes': est_boxes,
        'fnl_boxes': fnl_boxes,
        'box_change_pct': round((fnl_boxes - est_boxes) / max(est_boxes, 1) * 100, 1),
        'est_labor_hrs': round(est_labor, 2),
        'fnl_labor_hrs': round(fnl_labor, 2),
        'labor_change_pct': round((fnl_labor - est_labor) / max(est_labor, 0.01) * 100, 1),
        'est_supervisor_hrs': round(est_sup, 2),
        'fnl_supervisor_hrs': round(fnl_sup, 2),
        'est_rcv': round(est_rcv, 2),
        'fnl_rcv': round(fnl_rcv, 2),
        'rcv_change_pct': round((fnl_rcv - est_rcv) / max(est_rcv, 0.01) * 100, 1),
        'est_line_items': len(est_df),
        'fnl_line_items': len(fnl_df),
        'items_added': len(added),
        'items_removed': len(removed),
        'added_items': '; '.join(sorted(added)[:10]),
        'removed_items': '; '.join(sorted(removed)[:10]),
    }

    print(f"  {customer}: TAGs {est_tags}->{fnl_tags} ({result['tag_change_pct']:+.0f}%), "
          f"Boxes {est_boxes}->{fnl_boxes} ({result['box_change_pct']:+.0f}%), "
          f"RCV ${est_rcv:,.0f}->${fnl_rcv:,.0f} ({result['rcv_change_pct']:+.0f}%)")

    return result


def compute_correction_factors(comparisons_df):
    """Compute correction factors with confidence intervals."""
    # Overall correction factors
    def safe_ratio(fnl_col, est_col, df):
        mask = df[est_col] > 0
        if mask.sum() == 0:
            return 1.0, 0.0, 0
        ratios = df.loc[mask, fnl_col] / df.loc[mask, est_col]
        return round(ratios.median(), 3), round(ratios.std(), 3), int(mask.sum())

    # Post-acquisition weighted more heavily
    post_acq = comparisons_df[comparisons_df['is_post_acquisition'] == True]
    all_data = comparisons_df

    factors = {}
    for label, fnl_col, est_col in [
        ('tag_multiplier', 'fnl_tags', 'est_tags'),
        ('box_multiplier', 'fnl_boxes', 'est_boxes'),
        ('labor_multiplier', 'fnl_labor_hrs', 'est_labor_hrs'),
        ('rcv_multiplier', 'fnl_rcv', 'est_rcv'),
    ]:
        all_med, all_std, all_n = safe_ratio(fnl_col, est_col, all_data)
        post_med, post_std, post_n = safe_ratio(fnl_col, est_col, post_acq)

        # Use post-acq if we have enough data, otherwise blend
        if post_n >= 3:
            best = post_med
            confidence = min(0.95, 0.5 + post_n * 0.05)
        elif post_n >= 1:
            best = round(0.6 * post_med + 0.4 * all_med, 3)
            confidence = min(0.80, 0.4 + all_n * 0.03)
        else:
            best = all_med
            confidence = min(0.80, 0.3 + all_n * 0.03)

        factors[label] = {
            'value': best,
            'confidence': round(confidence, 2),
            'all_estimates': {'median': all_med, 'std': all_std, 'n': all_n},
            'post_acquisition': {'median': post_med, 'std': post_std, 'n': post_n},
        }

    # Commonly added items in finals
    all_added = []
    for _, row in comparisons_df.iterrows():
        if row['added_items']:
            for item in row['added_items'].split('; '):
                if item.strip():
                    all_added.append(item.strip())

    from collections import Counter
    added_counts = Counter(all_added).most_common(15)

    factors['commonly_added_items'] = [
        {'desc': desc, 'frequency': count}
        for desc, count in added_counts
    ]

    return factors


def main():
    print("=" * 70)
    print("DELIVERABLE 2: Estimate vs. Final Correction Factors")
    print("=" * 70)

    comparisons = []
    for customer, est_file, fnl_file, is_post_acq in PAIRS:
        result = compare_pair(customer, est_file, fnl_file, is_post_acq)
        if result:
            comparisons.append(result)

    if not comparisons:
        print("ERROR: No comparisons completed!")
        return

    comp_df = pd.DataFrame(comparisons)

    # Save comparisons
    comp_output = OUTPUT_DIR / 'estimate_vs_final_comparisons.csv'
    comp_df.to_csv(comp_output, index=False)
    print(f"\nSaved {len(comp_df)} comparisons to {comp_output}")

    # Compute correction factors
    factors = compute_correction_factors(comp_df)

    factors_output = OUTPUT_DIR / 'correction_factors.json'
    with open(factors_output, 'w') as f:
        json.dump({
            'metadata': {
                'generated': datetime.now().isoformat(),
                'total_pairs': len(comp_df),
                'post_acquisition_pairs': int(comp_df['is_post_acquisition'].sum()),
            },
            **factors,
        }, f, indent=2)
    print(f"Saved correction factors to {factors_output}")

    # Summary
    print("\n" + "=" * 70)
    print("CORRECTION FACTORS SUMMARY")
    print("=" * 70)

    for key in ['tag_multiplier', 'box_multiplier', 'labor_multiplier', 'rcv_multiplier']:
        f = factors[key]
        print(f"  {key:<20}: {f['value']:.3f} (confidence: {f['confidence']:.0%})")
        print(f"    All: median={f['all_estimates']['median']:.3f}, n={f['all_estimates']['n']}")
        if f['post_acquisition']['n'] > 0:
            print(f"    Post-acq: median={f['post_acquisition']['median']:.3f}, n={f['post_acquisition']['n']}")

    print("\nKey insights:")
    mask_tags = comp_df['est_tags'] > 0
    if mask_tags.any():
        tag_ratios = comp_df.loc[mask_tags, 'fnl_tags'] / comp_df.loc[mask_tags, 'est_tags']
        pct_higher = (tag_ratios > 1.0).sum() / len(tag_ratios) * 100
        print(f"  TAGs: Finals are higher in {pct_higher:.0f}% of cases (avg change: {comp_df['tag_change_pct'].mean():+.1f}%)")

    mask_boxes = comp_df['est_boxes'] > 0
    if mask_boxes.any():
        box_ratios = comp_df.loc[mask_boxes, 'fnl_boxes'] / comp_df.loc[mask_boxes, 'est_boxes']
        pct_lower = (box_ratios < 1.0).sum() / len(box_ratios) * 100
        print(f"  Boxes: Finals are lower in {pct_lower:.0f}% of cases (avg change: {comp_df['box_change_pct'].mean():+.1f}%)")

    print(f"  RCV: Avg change estimate->final: {comp_df['rcv_change_pct'].mean():+.1f}%")

    if factors['commonly_added_items']:
        print("\nMost commonly added items in finals:")
        for item in factors['commonly_added_items'][:8]:
            print(f"  {item['frequency']}x: {item['desc'][:70]}")


if __name__ == '__main__':
    main()
