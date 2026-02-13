"""
Deliverable 1: Post-Acquisition Pricing Database
Parses all post-acquisition Xactimate Excel exports and builds pricing reference data.

Post-acquisition file = latest_date >= 2025-04-15 (per date analysis CSV).
Uses all line items from post-acq files, since the Date column is the price list date,
not the estimate creation date. The file itself being post-acquisition means the company
used these prices after Matthew acquired the business April 15, 2025.
"""

import pandas as pd
import numpy as np
import json
import sys
from pathlib import Path
from datetime import datetime

# Paths
ESTIMATES_DIR = Path(r'C:\Users\matth\Downloads\Spreadsheets\Xactimate Estimates')
DATE_ANALYSIS = Path(r'C:\Users\matth\Downloads\Spreadsheets\xactimate_excel_date_analysis.csv')
OUTPUT_DIR = Path(r'C:\Users\matth\estimator\data')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ACQUISITION_DATE = pd.Timestamp('2025-04-15')

# Known column names to look for (column order varies between files)
COL_NAMES = {
    'desc': 'Desc',
    'qty': 'Qty',
    'unit': 'Unit',
    'unit_cost': 'Unit Cost',
    'rcv': 'RCV',
    'cat': 'Cat',
    'sel': 'Sel',
    'date': 'Date',
    'group_code': 'Group Code',
    'group_desc': 'Group Description',
    'line_num': '#',
    'excluded': 'Excluded',
}


def identify_post_acq_files():
    """Find all Excel files with latest_date >= acquisition date."""
    date_df = pd.read_csv(DATE_ANALYSIS)
    date_df['latest_date'] = pd.to_datetime(date_df['latest_date'], errors='coerce')
    post_acq = date_df[date_df['latest_date'] >= ACQUISITION_DATE]
    # Also get date info for weighting
    file_dates = dict(zip(date_df['filename'], date_df['latest_date']))
    print(f"Found {len(post_acq)} files with latest_date >= {ACQUISITION_DATE.date()}")
    return post_acq['filename'].tolist(), file_dates


def find_columns(df):
    """Dynamically find column indices from header row."""
    header = df.iloc[0]
    col_map = {}
    for key, name in COL_NAMES.items():
        for i, val in enumerate(header):
            if str(val).strip() == name:
                col_map[key] = i
                break
    return col_map


def parse_excel_file(filepath, file_latest_date):
    """Parse a single Xactimate Excel export and return line items as dicts."""
    try:
        df = pd.read_excel(filepath, header=None)
    except Exception as e:
        print(f"  ERROR reading {filepath.name}: {e}")
        return []

    if len(df) < 2:
        return []

    # Find columns by header names
    col_map = find_columns(df)
    required = ['desc', 'qty', 'unit_cost', 'rcv']
    missing = [k for k in required if k not in col_map]
    if missing:
        print(f"  WARN: {filepath.name} missing columns: {missing}")
        return []

    # Skip header row (row 0)
    data_rows = df.iloc[1:]
    items = []
    for _, row in data_rows.iterrows():
        try:
            desc = str(row.iloc[col_map['desc']]).strip() if pd.notna(row.iloc[col_map['desc']]) else ''
            if not desc or desc == 'nan':
                continue

            qty = pd.to_numeric(row.iloc[col_map['qty']], errors='coerce')
            unit_cost = pd.to_numeric(row.iloc[col_map['unit_cost']], errors='coerce')
            rcv = pd.to_numeric(row.iloc[col_map['rcv']], errors='coerce')

            # Parse date if available
            date_str = ''
            if 'date' in col_map:
                date_val = row.iloc[col_map['date']]
                if pd.notna(date_val):
                    try:
                        date_parsed = pd.to_datetime(date_val, errors='coerce')
                        if pd.notna(date_parsed):
                            date_str = date_parsed.strftime('%Y-%m-%d')
                    except:
                        date_str = str(date_val)
            # Fallback: use file's latest_date
            if not date_str and pd.notna(file_latest_date):
                date_str = pd.Timestamp(file_latest_date).strftime('%Y-%m-%d')

            items.append({
                'filename': filepath.name,
                'line_num': row.iloc[col_map.get('line_num', 1)] if 'line_num' in col_map else 0,
                'desc': desc,
                'qty': float(qty) if pd.notna(qty) else 0.0,
                'unit': str(row.iloc[col_map['unit']]).strip() if 'unit' in col_map and pd.notna(row.iloc[col_map['unit']]) else '',
                'unit_cost': float(unit_cost) if pd.notna(unit_cost) else 0.0,
                'rcv': float(rcv) if pd.notna(rcv) else 0.0,
                'group_code': str(row.iloc[col_map['group_code']]).strip() if 'group_code' in col_map and pd.notna(row.iloc[col_map['group_code']]) else '',
                'group_desc': str(row.iloc[col_map['group_desc']]).strip() if 'group_desc' in col_map and pd.notna(row.iloc[col_map['group_desc']]) else '',
                'cat': str(row.iloc[col_map['cat']]).strip() if 'cat' in col_map and pd.notna(row.iloc[col_map['cat']]) else '',
                'sel': str(row.iloc[col_map['sel']]).strip() if 'sel' in col_map and pd.notna(row.iloc[col_map['sel']]) else '',
                'date': date_str,
            })
        except Exception:
            continue

    return items


def deduplicate_files(post_acq_files, file_dates):
    """
    Some files are iterative versions of the same estimate (e.g., CHAD_MULVANEY1112,
    CHAD_MULVANEY1115, etc.). Keep only the latest version per customer.
    Also deduplicate exact copies (e.g., CHRISTINESANDOVAL.xlsx and CHRISTINESANDOVAL (1).xlsx).
    """
    # Group by customer name prefix (strip trailing digits, version markers)
    import re
    groups = {}
    for f in post_acq_files:
        base = f.replace('.xlsx', '')
        # Normalize: remove trailing digits, spaces, (1) suffixes
        # But keep distinct estimate types (PACKOUT, CLEANING, STORAGE, etc.)
        clean = re.sub(r'\s*\(\d+\)$', '', base)  # Remove " (1)" suffixes
        groups.setdefault(clean, []).append(f)

    deduped = []
    skipped = []
    for key, files in groups.items():
        if len(files) == 1:
            deduped.append(files[0])
        else:
            # Keep the one with latest date
            best = max(files, key=lambda f: file_dates.get(f, pd.NaT) or pd.NaT)
            deduped.append(best)
            for f in files:
                if f != best:
                    skipped.append(f)

    if skipped:
        print(f"  Deduplicated: kept {len(deduped)}, skipped {len(skipped)} duplicate files")
    return deduped


def build_pricing_reference(all_items_df, total_estimates):
    """Compute per-line-item pricing statistics."""
    priced = all_items_df[all_items_df['unit_cost'] > 0].copy()

    stats = []
    for desc, group in priced.groupby('desc'):
        est_count = group['filename'].nunique()
        freq_pct = round(est_count / total_estimates * 100, 1)

        costs = group['unit_cost']
        qtys = group['qty']

        cat = group['cat'].mode().iloc[0] if len(group['cat'].mode()) > 0 else ''
        sel = group['sel'].mode().iloc[0] if len(group['sel'].mode()) > 0 else ''
        unit = group['unit'].mode().iloc[0] if len(group['unit'].mode()) > 0 else ''
        group_desc_val = group['group_desc'].mode().iloc[0] if len(group['group_desc'].mode()) > 0 else ''

        # Recency-weighted median
        dates = pd.to_datetime(group['date'], errors='coerce')
        valid_dates = dates.dropna()
        if len(valid_dates) > 1:
            max_date = valid_dates.max()
            days_from_latest = (max_date - valid_dates).dt.days
            weights = np.exp(-days_from_latest / 180.0)
            # Align weights to costs
            aligned_costs = costs.loc[valid_dates.index]
            sorted_idx = aligned_costs.argsort()
            sorted_costs = aligned_costs.iloc[sorted_idx].values
            sorted_weights = weights.iloc[sorted_idx].values
            cum_weight = np.cumsum(sorted_weights)
            median_idx = np.searchsorted(cum_weight, cum_weight[-1] / 2)
            weighted_median_cost = sorted_costs[min(median_idx, len(sorted_costs) - 1)]
        else:
            weighted_median_cost = costs.median()

        stats.append({
            'desc': desc,
            'group_desc': group_desc_val,
            'cat': cat,
            'sel': sel,
            'unit': unit,
            'estimate_count': est_count,
            'frequency_pct': freq_pct,
            'unit_cost_median': round(costs.median(), 2),
            'unit_cost_weighted_median': round(float(weighted_median_cost), 2),
            'unit_cost_p25': round(costs.quantile(0.25), 2),
            'unit_cost_p75': round(costs.quantile(0.75), 2),
            'unit_cost_min': round(costs.min(), 2),
            'unit_cost_max': round(costs.max(), 2),
            'unit_cost_std': round(costs.std(), 2) if len(costs) > 1 else 0.0,
            'qty_median': round(qtys.median(), 1),
            'qty_mean': round(qtys.mean(), 1),
            'total_rcv': round(group['rcv'].sum(), 2),
        })

    stats_df = pd.DataFrame(stats)
    stats_df = stats_df.sort_values('total_rcv', ascending=False)
    return stats_df


def build_standard_line_items(pricing_df, total_estimates):
    """Items appearing frequently become the standard template."""
    threshold_count = max(total_estimates * 0.10, 3)
    standard = pricing_df[pricing_df['estimate_count'] >= threshold_count].copy()

    items = []
    for _, row in standard.iterrows():
        items.append({
            'desc': row['desc'],
            'cat': row['cat'],
            'sel': row['sel'],
            'unit': row['unit'],
            'group_desc': row['group_desc'],
            'default_unit_cost': row['unit_cost_weighted_median'],
            'unit_cost_range': [row['unit_cost_p25'], row['unit_cost_p75']],
            'default_qty': row['qty_median'],
            'frequency_pct': row['frequency_pct'],
            'estimate_count': int(row['estimate_count']),
            'is_core': row['frequency_pct'] >= 50.0,
        })

    return items


def main():
    print("=" * 70)
    print("DELIVERABLE 1: Post-Acquisition Pricing Database")
    print("=" * 70)

    # Step 1: Identify post-acquisition files
    post_acq_files, file_dates = identify_post_acq_files()

    # Step 2: Deduplicate files
    post_acq_files = deduplicate_files(post_acq_files, file_dates)
    print(f"After dedup: {len(post_acq_files)} unique files")

    # Step 3: Parse all post-acquisition Excel files
    all_items = []
    files_parsed = 0
    files_skipped = 0

    for filename in sorted(post_acq_files):
        filepath = ESTIMATES_DIR / filename
        if not filepath.exists():
            print(f"  MISSING: {filename}")
            files_skipped += 1
            continue

        latest_date = file_dates.get(filename)
        items = parse_excel_file(filepath, latest_date)
        if items:
            all_items.extend(items)
            files_parsed += 1
            print(f"  OK {filename}: {len(items)} items")
        else:
            print(f"  EMPTY: {filename}")
            files_skipped += 1

    print(f"\nParsed {files_parsed} files, {files_skipped} skipped/empty")
    print(f"Total line items: {len(all_items)}")

    if not all_items:
        print("ERROR: No items found!")
        sys.exit(1)

    # Step 4: Build flat table of all line items
    all_items_df = pd.DataFrame(all_items)

    # Save full flat table
    full_output = OUTPUT_DIR / 'post_acq_estimates_full.csv'
    all_items_df.to_csv(full_output, index=False)
    print(f"\nSaved {len(all_items_df)} line items to {full_output}")

    # Step 5: Build pricing reference
    total_estimates = all_items_df['filename'].nunique()
    print(f"\nUnique estimates with data: {total_estimates}")

    pricing_df = build_pricing_reference(all_items_df, total_estimates)
    pricing_output = OUTPUT_DIR / 'pricing_reference.csv'
    pricing_df.to_csv(pricing_output, index=False)
    print(f"Saved {len(pricing_df)} unique line items to {pricing_output}")

    # Step 6: Build standard line items template
    standard_items = build_standard_line_items(pricing_df, total_estimates)
    standard_output = OUTPUT_DIR / 'standard_line_items.json'
    with open(standard_output, 'w') as f:
        json.dump({
            'metadata': {
                'generated': datetime.now().isoformat(),
                'source_estimates': total_estimates,
                'acquisition_date': '2025-04-15',
                'total_unique_line_items': len(pricing_df),
                'standard_items_count': len(standard_items),
                'core_items_count': sum(1 for i in standard_items if i['is_core']),
            },
            'items': standard_items,
        }, f, indent=2)
    print(f"Saved {len(standard_items)} standard items ({sum(1 for i in standard_items if i['is_core'])} core) to {standard_output}")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    total_rcv = all_items_df['rcv'].sum()
    print(f"Total post-acq RCV: ${total_rcv:,.2f}")
    print(f"Unique line item descriptions: {len(pricing_df)}")
    print(f"Date range: {all_items_df['date'].min()} to {all_items_df['date'].max()}")

    print("\nTop 20 line items by total RCV:")
    for _, row in pricing_df.head(20).iterrows():
        print(f"  ${row['total_rcv']:>10,.2f} | {row['estimate_count']:>3} est | "
              f"${row['unit_cost_weighted_median']:>8,.2f}/{row['unit']:<4} | {row['desc'][:60]}")

    print("\nTop 15 most frequent items:")
    freq_sorted = pricing_df.sort_values('estimate_count', ascending=False)
    for _, row in freq_sorted.head(15).iterrows():
        print(f"  {row['estimate_count']:>3} estimates ({row['frequency_pct']:>5.1f}%) | "
              f"${row['unit_cost_weighted_median']:>8,.2f}/{row['unit']:<4} | {row['desc'][:55]}")

    # Key pricing summary for Cartage Calculator validation
    print("\nKey rates (weighted median):")
    key_items = {
        'CPS LAB': 'Inventory, Packing, Boxing, and Moving charge - per hour',
        'CPS LABS': 'Contents Evaluation and/or Supervisor/Admin - per hour',
        'TAG': 'Evaluate, tag, & inventory miscellaneous - per item',
        'MED BOX': 'Eval. pack & invent. misc items - per Med box-high density',
        'STORAGE': 'Off-site storage vault (per month)',
        'MOVING VAN': "Moving van (21'-27') and equipment (per day)",
    }
    for label, desc_match in key_items.items():
        import re
        match = pricing_df[pricing_df['desc'].str.contains(re.escape(desc_match[:30]), case=False, na=False)]
        if not match.empty:
            row = match.iloc[0]
            print(f"  {label:<12}: ${row['unit_cost_weighted_median']:>8,.2f}/{row['unit']} "
                  f"(range ${row['unit_cost_min']:.2f}-${row['unit_cost_max']:.2f}, n={row['estimate_count']})")


if __name__ == '__main__':
    main()
