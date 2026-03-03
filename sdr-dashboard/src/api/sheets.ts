const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

interface FetchTabOptions {
  tab: string;
}

interface UpdateCellOptions {
  tab: string;
  row: number;
  col: number;
  value: string;
}

export async function fetchTab({ tab }: FetchTabOptions): Promise<unknown[][]> {
  if (!APPS_SCRIPT_URL) {
    throw new Error('VITE_APPS_SCRIPT_URL is not configured. Set it in .env');
  }
  const url = `${APPS_SCRIPT_URL}?tab=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${tab}: ${res.statusText}`);
  return res.json();
}

export async function updateCell({ tab, row, col, value }: UpdateCellOptions): Promise<void> {
  if (!APPS_SCRIPT_URL) {
    throw new Error('VITE_APPS_SCRIPT_URL is not configured');
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // Apps Script requires text/plain for CORS
    body: JSON.stringify({ tab, row, col, value }),
  });
  if (!res.ok) throw new Error(`Failed to update cell: ${res.statusText}`);
}

// Parse raw 2D array into objects using first row as headers
export function parseRows<T>(raw: unknown[][], startRow = 1): (T & { _row: number })[] {
  if (!raw || raw.length < 2) return [];
  const headers = raw[0] as string[];
  return raw.slice(1).map((row, i) => {
    const obj: Record<string, unknown> = { _row: startRow + 1 + i };
    headers.forEach((h, j) => {
      obj[h] = (row as string[])[j] ?? '';
    });
    return obj as T & { _row: number };
  });
}
