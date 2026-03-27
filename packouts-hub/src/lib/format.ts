/** Format an ISO date string as "Mar 27, 2026". Returns fallback for missing dates. */
export function formatDate(dateStr?: string, fallback = ''): string {
  if (!dateStr) return fallback;
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/** Format an ISO date string as "Mar 27" (no year) */
export function formatDateShort(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/** Format currency as "$1,234.56" */
export function formatCurrency(amount?: number | null): string {
  if (amount == null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
