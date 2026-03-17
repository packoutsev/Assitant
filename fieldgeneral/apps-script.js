function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
  var data = JSON.parse(e.parameter.data);

  sheet.appendRow([
    new Date().toISOString(),
    data.email,
    data.jobs,
    data.invoice,
    data.days,
    data.cutFreq,
    data.annualRevenue,
    data.collectionDrag,
    data.recoverableCuts,
    data.annualAdminCost,
    data.totalLeakage,
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}
