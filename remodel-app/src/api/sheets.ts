const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

interface FetchTabParams {
  tab: string;
}

interface UpdateCellParams {
  tab: string;
  row: number;
  col: number;
  value: string;
}

interface AppendRowParams {
  tab: string;
  values: string[];
}

export function parseRows<T extends Record<string, unknown>>(raw: string[][]): (T & { _row: number })[] {
  if (!raw || raw.length < 2) return [];
  const headers = raw[0];
  return raw.slice(1).map((row, i) => {
    const obj: Record<string, unknown> = { _row: i + 2 };
    headers.forEach((h, j) => {
      obj[h] = row[j] ?? '';
    });
    return obj as T & { _row: number };
  });
}

export async function fetchTab({ tab }: FetchTabParams): Promise<string[][] | null> {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const url = `${APPS_SCRIPT_URL}?tab=${encodeURIComponent(tab)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    console.error(`Failed to fetch tab: ${tab}`);
    return null;
  }
}

export async function updateCell({ tab, row, col, value }: UpdateCellParams): Promise<boolean> {
  if (!APPS_SCRIPT_URL) return false;
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'updateCell', tab, row, col, value }),
    });
    return res.ok;
  } catch {
    console.error(`Failed to update cell: ${tab} R${row}C${col}`);
    return false;
  }
}

export async function appendRow({ tab, values }: AppendRowParams): Promise<boolean> {
  if (!APPS_SCRIPT_URL) return false;
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'appendRow', tab, values }),
    });
    return res.ok;
  } catch {
    console.error(`Failed to append row to: ${tab}`);
    return false;
  }
}

export function isLiveMode(): boolean {
  return !!APPS_SCRIPT_URL;
}
