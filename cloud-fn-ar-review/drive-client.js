/**
 * Google Sheets + Drive via service account with domain-wide delegation.
 *
 * Creates a native Google Sheet in the "Weekly A/R Reviews" folder,
 * populates it with summary + detail data, and applies formatting.
 */

import { google } from "googleapis";

const IMPERSONATE_USER = "matt@encantobuilders.com";
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
];
const FOLDER_NAME = "Weekly A/R Reviews";

function buildAuth(saKey) {
  return new google.auth.JWT({
    email: saKey.client_email,
    key: saKey.private_key,
    scopes: SCOPES,
    subject: IMPERSONATE_USER,
  });
}

async function getOrCreateFolder(drive) {
  const res = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });
  if (res.data.files?.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
  });
  return folder.data.id;
}

/**
 * Create a Google Sheet, populate it, format it, and move to the right folder.
 *
 * @param {object} saKey        parsed service account JSON
 * @param {object} sheetData    from sheets-builder.js buildSheetData()
 * @returns {{ spreadsheetId: string, webViewLink: string }}
 */
export async function createReport(saKey, sheetData) {
  const auth = buildAuth(saKey);
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  // 1. Create spreadsheet with two sheets
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: sheetData.title },
      sheets: [
        { properties: { title: "Summary", index: 0 } },
        { properties: { title: "Detail", index: 1 } },
      ],
    },
  });

  const ssId = spreadsheet.data.spreadsheetId;
  const summarySheetId = spreadsheet.data.sheets[0].properties.sheetId;
  const detailSheetId = spreadsheet.data.sheets[1].properties.sheetId;

  // 2. Write data to both sheets
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: ssId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "Summary!A1", values: sheetData.summaryRows },
        { range: "Detail!A1", values: sheetData.detailRows },
      ],
    },
  });

  // 3. Apply formatting
  const requests = [
    // --- Summary sheet ---
    // Title row: bold, large
    formatRange(summarySheetId, 0, 1, 0, 4, {
      textFormat: { bold: true, fontSize: 14 },
    }),
    // Aging table header
    formatRange(summarySheetId, sheetData.summaryHeaderRow, sheetData.summaryHeaderRow + 1, 0, 4, headerStyle()),
    // Aging total row: bold
    formatRange(summarySheetId, sheetData.summaryTotalRow, sheetData.summaryTotalRow + 1, 0, 4, {
      textFormat: { bold: true },
    }),
    // Currency columns in aging table (C column)
    formatRange(summarySheetId, sheetData.summaryHeaderRow + 1, sheetData.summaryTotalRow + 1, 2, 3, {
      numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" },
    }),
    // Percent column in aging table (D column)
    formatRange(summarySheetId, sheetData.summaryHeaderRow + 1, sheetData.summaryTotalRow + 1, 3, 4, {
      numberFormat: { type: "PERCENT", pattern: "0.0%" },
    }),
    // KPI header
    ...(sheetData.kpiStartRow >= 0
      ? [formatRange(summarySheetId, sheetData.kpiStartRow, sheetData.kpiStartRow + 1, 0, 2, headerStyle())]
      : []),
    // Concentration risks header
    ...(sheetData.riskStartRow >= 0
      ? [
          formatRange(summarySheetId, sheetData.riskStartRow, sheetData.riskStartRow + 1, 0, 2, headerStyle()),
          // Risk values as currency
          formatRange(summarySheetId, sheetData.riskStartRow + 1, sheetData.riskStartRow + 20, 1, 2, {
            numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" },
          }),
        ]
      : []),
    // Auto-resize summary columns
    autoResize(summarySheetId, 0, 4),

    // --- Detail sheet ---
    // Header row
    formatRange(detailSheetId, 0, 1, 0, 8, headerStyle()),
    // Freeze header row
    freezeRows(detailSheetId, 1),
    // Balance column (D) as currency
    formatRange(detailSheetId, 1, sheetData.detailRows.length, 3, 4, {
      numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" },
    }),
    // Auto-resize detail columns
    autoResize(detailSheetId, 0, 8),
    // Conditional: red text for 90+ bucket
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: detailSheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 }],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "90+" }] },
            format: { textFormat: { foregroundColor: { red: 0.8, green: 0, blue: 0 } } },
          },
        },
        index: 0,
      },
    },
    // Conditional: bold for HIGH PRIORITY in action column
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: detailSheetId, startRowIndex: 1, startColumnIndex: 7, endColumnIndex: 8 }],
          booleanRule: {
            condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "HIGH PRIORITY" }] },
            format: {
              textFormat: { bold: true, foregroundColor: { red: 0.8, green: 0, blue: 0 } },
              backgroundColor: { red: 1, green: 0.93, blue: 0.93 },
            },
          },
        },
        index: 0,
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ssId,
    requestBody: { requests },
  });

  // 4. Share — anyone with the link can view
  await drive.permissions.create({
    fileId: ssId,
    requestBody: { role: "reader", type: "anyone" },
  });

  // 5. Move to the Weekly A/R Reviews folder
  const folderId = await getOrCreateFolder(drive);

  // Get current parents so we can remove them
  const fileInfo = await drive.files.get({
    fileId: ssId,
    fields: "parents",
  });
  const prevParents = (fileInfo.data.parents || []).join(",");

  await drive.files.update({
    fileId: ssId,
    addParents: folderId,
    removeParents: prevParents,
    fields: "id, webViewLink",
  });

  const updated = await drive.files.get({
    fileId: ssId,
    fields: "webViewLink",
  });

  return {
    spreadsheetId: ssId,
    webViewLink: updated.data.webViewLink,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatRange(sheetId, startRow, endRow, startCol, endCol, format) {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: endRow,
        startColumnIndex: startCol,
        endColumnIndex: endCol,
      },
      cell: { userEnteredFormat: format },
      fields: `userEnteredFormat(${Object.keys(format).join(",")})`,
    },
  };
}

function headerStyle() {
  return {
    backgroundColor: { red: 0.18, green: 0.25, blue: 0.34 },
    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
    horizontalAlignment: "CENTER",
  };
}

function freezeRows(sheetId, count) {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: count } },
      fields: "gridProperties.frozenRowCount",
    },
  };
}

function autoResize(sheetId, startCol, endCol) {
  return {
    autoResizeDimensions: {
      dimensions: { sheetId, dimension: "COLUMNS", startIndex: startCol, endIndex: endCol },
    },
  };
}
