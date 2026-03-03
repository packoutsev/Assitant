/**
 * Builds Google Sheets API request data for the A/R review.
 *
 * Returns spreadsheet create payload with three sheets:
 *   1. Summary — aging buckets, KPIs, concentration risks
 *   2. Detail  — every invoice, sorted worst-bucket-first
 *   3. Data    — raw data for reference
 */

const BUCKET_ORDER = ["90+", "61-90", "31-60", "1-30", "Current"];

const fmt = (n) => Number(n).toFixed(2);
const pct = (n) => Number((n * 100).toFixed(1));

// Colors
const DARK_BLUE = { red: 0.18, green: 0.25, blue: 0.34 }; // #2E4057
const WHITE = { red: 1, green: 1, blue: 1 };
const LIGHT_GRAY = { red: 0.95, green: 0.95, blue: 0.95 };
const RED = { red: 0.8, green: 0, blue: 0 };

function headerFormat() {
  return {
    backgroundColor: DARK_BLUE,
    textFormat: { bold: true, foregroundColor: WHITE, fontSize: 10 },
    horizontalAlignment: "CENTER",
  };
}

function currencyFormat() {
  return { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } };
}

function pctFormat() {
  return { numberFormat: { type: "PERCENT", pattern: "0.0%" } };
}

/**
 * Build the full spreadsheet create payload.
 *
 * @param {object} agingData       raw return from QBO get_ar_aging
 * @param {Map} contactDates       customer name → last contact ISO date or null
 * @param {Function} getAction     action-rules getAction function
 * @returns {object}               { title, sheets payload for Sheets API }
 */
export function buildSheetData(agingData, contactDates, getAction) {
  const today = new Date().toISOString().slice(0, 10);
  const summary = agingData.summary;
  const buckets = agingData.buckets;
  const grandTotal = summary.grand_total?.total || 0;
  const totalCount = summary.grand_total?.count || 0;

  // ---- Summary sheet ----
  const summaryRows = [];

  // Title
  summaryRows.push([`Weekly A/R Review — ${today}`]);
  summaryRows.push([]);

  // Aging table
  summaryRows.push(["Bucket", "Invoices", "Total", "% of Total"]);
  for (const b of BUCKET_ORDER) {
    if (!summary[b]) continue;
    summaryRows.push([
      b,
      summary[b].count,
      Number(fmt(summary[b].total)),
      grandTotal > 0 ? summary[b].total / grandTotal : 0,
    ]);
  }
  summaryRows.push([
    "Grand Total",
    totalCount,
    Number(fmt(grandTotal)),
    1,
  ]);

  summaryRows.push([]);

  // KPIs
  const currentCount = (summary["Current"]?.count || 0) + (summary["1-30"]?.count || 0);
  const currentTotal = (summary["Current"]?.total || 0) + (summary["1-30"]?.total || 0);
  const over90Total = summary["90+"]?.total || 0;

  summaryRows.push(["KPI", "Value"]);
  summaryRows.push(["Under 30 days (% of invoices)", totalCount > 0 ? currentCount / totalCount : 0]);
  summaryRows.push(["Under 30 days ($)", Number(fmt(currentTotal))]);
  summaryRows.push(["Over 90 days (% of dollars)", grandTotal > 0 ? over90Total / grandTotal : 0]);
  summaryRows.push(["Over 90 days ($)", Number(fmt(over90Total))]);
  summaryRows.push(["Total Outstanding", Number(fmt(grandTotal))]);
  summaryRows.push(["Total Invoices", totalCount]);

  summaryRows.push([]);

  // Concentration risks
  const customerTotals = new Map();
  for (const bucket of Object.values(buckets)) {
    for (const inv of bucket) {
      const name = inv.customer || inv.Customer || "Unknown";
      customerTotals.set(name, (customerTotals.get(name) || 0) + (inv.balance || inv.Balance || 0));
    }
  }
  const risks = [...customerTotals.entries()]
    .filter(([, total]) => total >= 10000)
    .sort((a, b) => b[1] - a[1]);

  if (risks.length > 0) {
    summaryRows.push(["Concentration Risks (>$10K)", "Total"]);
    for (const [name, total] of risks) {
      summaryRows.push([name, Number(fmt(total))]);
    }
  }

  // ---- Detail sheet ----
  const detailRows = [];
  detailRows.push([
    "Bucket",
    "Customer",
    "Invoice #",
    "Balance",
    "Days Outstanding",
    "Last Contact",
    "Days Since Contact",
    "Recommended Action",
  ]);

  for (const bucket of BUCKET_ORDER) {
    const invoices = buckets[bucket];
    if (!invoices || invoices.length === 0) continue;

    const sorted = [...invoices].sort(
      (a, b) => (b.balance || b.Balance || 0) - (a.balance || a.Balance || 0)
    );

    for (const inv of sorted) {
      const name = inv.customer || inv.Customer || "Unknown";
      const balance = inv.balance || inv.Balance || 0;
      const daysOut = inv.days_outstanding || inv.DaysOutstanding || 0;
      const lastContact = contactDates.get(name) || null;
      const daysSinceContact = lastContact
        ? Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000)
        : null;
      const action = getAction(bucket, balance, daysSinceContact);

      detailRows.push([
        bucket,
        name,
        inv.doc_number || inv.DocNumber || "",
        Number(fmt(balance)),
        daysOut,
        lastContact || "",
        daysSinceContact !== null ? daysSinceContact : "",
        action,
      ]);
    }
  }

  return {
    title: `AR_Review_${today}`,
    summaryRows,
    detailRows,
    // Formatting metadata for applying after creation
    summaryHeaderRow: 2, // 0-indexed row of aging table header
    summaryTotalRow: 2 + BUCKET_ORDER.filter((b) => summary[b]).length + 1,
    detailHeaderRow: 0,
    kpiStartRow: summaryRows.findIndex((r) => r[0] === "KPI"),
    riskStartRow: summaryRows.findIndex((r) => r[0] === "Concentration Risks (>$10K)"),
  };
}
