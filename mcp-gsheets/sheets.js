/**
 * Google Sheets API v4 helpers — direct REST calls with fetch.
 *
 * Shared by both index.js (local stdio) and server.js (Cloud Run).
 * Callers must provide getAccessToken() and refreshTokens() via init().
 */

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

let _getAccessToken = null;
let _refreshTokens = null;
let _log = (...args) => console.error("[mcp-gsheets]", ...args);

/**
 * Initialize the module with auth helpers from the caller.
 * @param {Object} opts
 * @param {Function} opts.getAccessToken - async () => { accessToken, creds, tokens }
 * @param {Function} opts.refreshTokens  - async (creds, tokens) => newTokens
 * @param {Function} [opts.log]          - logging function
 */
export function init({ getAccessToken, refreshTokens, log }) {
  _getAccessToken = getAccessToken;
  _refreshTokens = refreshTokens;
  if (log) _log = log;
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

async function sheetsGet(path, params = {}, _retried = false) {
  const { accessToken, creds, tokens } = await _getAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (resp.status === 401 && !_retried) {
    _log("Got 401, refreshing token and retrying...");
    await _refreshTokens(creds, tokens);
    return sheetsGet(path, params, true);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sheets API error ${resp.status}: ${body}`);
  }

  return resp.json();
}

async function sheetsPut(path, body, params = {}, _retried = false) {
  const { accessToken, creds, tokens } = await _getAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const resp = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 && !_retried) {
    _log("Got 401, refreshing token and retrying...");
    await _refreshTokens(creds, tokens);
    return sheetsPut(path, body, params, true);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets API error ${resp.status}: ${text}`);
  }

  return resp.json();
}

async function sheetsPost(path, body, params = {}, _retried = false) {
  const { accessToken, creds, tokens } = await _getAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 && !_retried) {
    _log("Got 401, refreshing token and retrying...");
    await _refreshTokens(creds, tokens);
    return sheetsPost(path, body, params, true);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets API error ${resp.status}: ${text}`);
  }

  return resp.json();
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export async function toolOpenSpreadsheet({ spreadsheet_id }) {
  const data = await sheetsGet(`/${spreadsheet_id}`, {
    fields: "spreadsheetId,properties.title,sheets.properties",
  });

  return {
    spreadsheet_id: data.spreadsheetId,
    title: data.properties?.title,
    sheets: (data.sheets || []).map((s) => ({
      sheet_id: s.properties?.sheetId,
      title: s.properties?.title,
      index: s.properties?.index,
      row_count: s.properties?.gridProperties?.rowCount,
      column_count: s.properties?.gridProperties?.columnCount,
    })),
  };
}

export async function toolListSheets({ spreadsheet_id }) {
  const data = await sheetsGet(`/${spreadsheet_id}`, {
    fields: "sheets.properties(sheetId,title,index)",
  });

  return (data.sheets || []).map((s) => ({
    sheet_id: s.properties?.sheetId,
    title: s.properties?.title,
    index: s.properties?.index,
  }));
}

export async function toolReadRange({ spreadsheet_id, range }) {
  const data = await sheetsGet(
    `/${spreadsheet_id}/values/${encodeURIComponent(range)}`
  );

  return {
    range: data.range,
    major_dimension: data.majorDimension,
    values: data.values || [],
  };
}

export async function toolReadSheet({ spreadsheet_id, sheet_name }) {
  const data = await sheetsGet(
    `/${spreadsheet_id}/values/${encodeURIComponent(sheet_name)}`
  );

  return {
    range: data.range,
    major_dimension: data.majorDimension,
    values: data.values || [],
  };
}

export async function toolWriteRange({ spreadsheet_id, range, values }) {
  const data = await sheetsPut(
    `/${spreadsheet_id}/values/${encodeURIComponent(range)}`,
    {
      range,
      majorDimension: "ROWS",
      values,
    },
    { valueInputOption: "USER_ENTERED" }
  );

  return {
    spreadsheet_id: data.spreadsheetId,
    updated_range: data.updatedRange,
    updated_rows: data.updatedRows,
    updated_columns: data.updatedColumns,
    updated_cells: data.updatedCells,
  };
}

export async function toolAppendRows({ spreadsheet_id, range, values }) {
  const data = await sheetsPost(
    `/${spreadsheet_id}/values/${encodeURIComponent(range)}:append`,
    {
      range,
      majorDimension: "ROWS",
      values,
    },
    { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" }
  );

  const updates = data.updates || {};
  return {
    spreadsheet_id: updates.spreadsheetId || data.spreadsheetId,
    updated_range: updates.updatedRange,
    updated_rows: updates.updatedRows,
    updated_columns: updates.updatedColumns,
    updated_cells: updates.updatedCells,
  };
}

export async function toolCreateSpreadsheet({ title, sheet_names }) {
  const sheets = (sheet_names || ["Sheet1"]).map((name, i) => ({
    properties: { title: name, index: i },
  }));

  const data = await sheetsPost("", {
    properties: { title },
    sheets,
  });

  return {
    spreadsheet_id: data.spreadsheetId,
    title: data.properties?.title,
    url: data.spreadsheetUrl,
    sheets: (data.sheets || []).map((s) => ({
      sheet_id: s.properties?.sheetId,
      title: s.properties?.title,
      index: s.properties?.index,
    })),
  };
}

export async function toolClearRange({ spreadsheet_id, range }) {
  const data = await sheetsPost(
    `/${spreadsheet_id}/values/${encodeURIComponent(range)}:clear`,
    {}
  );

  return {
    spreadsheet_id: data.spreadsheetId,
    cleared_range: data.clearedRange,
  };
}
