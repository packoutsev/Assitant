/**
 * Google Apps Script Web App — SDR Onboarding Dashboard API
 *
 * SETUP:
 * 1. Open Google Sheets: https://docs.google.com/spreadsheets/d/11FojZ8VoxD9UlsEqm4pbELDWGNZEzSI-9Zok4Xt7MM4/edit
 * 2. Extensions → Apps Script
 * 3. Paste this code into Code.gs
 * 4. Deploy → New Deployment → Web App
 *    - Execute as: Me (matt@encantobuilders.com)
 *    - Who has access: Anyone
 * 5. Copy the deployment URL
 * 6. Set VITE_APPS_SCRIPT_URL in sdr-dashboard/.env to the deployment URL
 */

const SHEET_ID = '11FojZ8VoxD9UlsEqm4pbELDWGNZEzSI-9Zok4Xt7MM4';

function doGet(e) {
  const tab = (e && e.parameter && e.parameter.tab) || 'Daily Plan';

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tab);
    if (!sheet) {
      return jsonResponse({ error: 'Tab not found: ' + tab }, 404);
    }

    const data = sheet.getDataRange().getValues();
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { tab, row, col, value } = body;

    if (!tab || !row || !col) {
      return jsonResponse({ error: 'Missing required fields: tab, row, col' }, 400);
    }

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tab);
    if (!sheet) {
      return jsonResponse({ error: 'Tab not found: ' + tab }, 404);
    }

    sheet.getRange(row, col).setValue(value);
    return jsonResponse({ ok: true, tab: tab, row: row, col: col, value: value });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function jsonResponse(data, code) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
