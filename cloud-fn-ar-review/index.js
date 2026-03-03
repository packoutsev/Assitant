/**
 * Weekly A/R Review — Cloud Function entry point.
 *
 * Orchestrates: QBO aging → HubSpot last-contact → enrich → .docx → Drive → Chat
 *
 * Triggered by Cloud Scheduler every Monday at 6 AM MST.
 */

import functions from "@google-cloud/functions-framework";
import { callTool } from "./mcp-client.js";
import { getLastContactDates } from "./hubspot-client.js";
import { buildSheetData } from "./sheets-builder.js";
import { createReport } from "./drive-client.js";
import { getAction } from "./action-rules.js";

// MCP server URLs (Cloud Run, no auth needed)
const QBO_MCP = "https://mcp-qbo-326811155221.us-central1.run.app";
const GCHAT_MCP = "https://mcp-gchat-326811155221.us-central1.run.app";

// Google Chat space for #Billing - Packouts
const BILLING_SPACE = "spaces/AAQAE_9n11w";

/**
 * Parse the SA_KEY secret. Cloud Functions injects secrets as env vars.
 * The value is the raw JSON string of the service account key file.
 */
function getServiceAccountKey() {
  const raw = process.env.SA_KEY;
  if (!raw) throw new Error("SA_KEY secret not configured");
  return JSON.parse(raw);
}

/**
 * Format currency for chat message.
 */
const fmt = (n) =>
  "$" +
  Number(n)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Build the Google Chat notification message.
 */
function buildChatMessage(agingData, driveLink) {
  const today = new Date().toISOString().slice(0, 10);
  const s = agingData.summary;
  const bucketOrder = ["Current", "1-30", "31-60", "61-90", "90+"];

  const lines = [`*Weekly A/R Review — ${today}*`, "", "*Aging Summary:*"];

  for (const b of bucketOrder) {
    if (s[b]) {
      const label = s[b].count === 1 ? "invoice" : "invoices";
      lines.push(`• ${b}: ${s[b].count} ${label} (${fmt(s[b].total)})`);
    }
  }

  const gt = s.grand_total || {};
  lines.push(`• *Total: ${fmt(gt.total || 0)} (${gt.count || 0} invoices)*`);

  // Key metrics
  const totalCount = gt.count || 0;
  const currentCount = (s["Current"]?.count || 0) + (s["1-30"]?.count || 0);
  const over90Total = s["90+"]?.total || 0;
  const grandTotal = gt.total || 0;

  lines.push("", "*Key Metrics:*");
  lines.push(
    `• Under 30 days: ${totalCount > 0 ? ((currentCount / totalCount) * 100).toFixed(1) : "0.0"}%`
  );
  lines.push(
    `• Over 90 days: ${grandTotal > 0 ? ((over90Total / grandTotal) * 100).toFixed(1) : "0.0"}%`
  );

  if (driveLink) {
    lines.push("", `*Full report:* ${driveLink}`);
  }

  return lines.join("\n");
}

/**
 * Main orchestrator.
 */
async function run() {
  console.log("Starting weekly A/R review...");

  // Step 1: Fetch QBO aging data via MCP
  console.log("Fetching QBO aging data...");
  const agingData = await callTool(QBO_MCP, "get_ar_aging", {});
  console.log(
    `Got aging data: ${agingData.summary?.grand_total?.count || 0} invoices, ${fmt(agingData.summary?.grand_total?.total || 0)}`
  );

  // Step 2: Extract unique customer names from all buckets
  const customerNames = new Set();
  for (const invoices of Object.values(agingData.buckets || {})) {
    for (const inv of invoices) {
      const name = inv.customer || inv.Customer;
      if (name) customerNames.add(name);
    }
  }
  console.log(`Found ${customerNames.size} unique customers`);

  // Step 3: HubSpot last-contact lookup
  let contactDates = new Map();
  try {
    const hsToken = process.env.HUBSPOT_TOKEN;
    if (!hsToken) throw new Error("HUBSPOT_TOKEN not configured");
    console.log("Looking up last contact dates in HubSpot...");
    contactDates = await getLastContactDates(hsToken, [...customerNames]);
    const found = [...contactDates.values()].filter(Boolean).length;
    console.log(`HubSpot: found dates for ${found}/${customerNames.size} customers`);
  } catch (err) {
    console.warn(`HubSpot lookup failed (continuing without): ${err.message}`);
  }

  // Step 4: Build sheet data
  console.log("Building report data...");
  const sheetData = buildSheetData(agingData, contactDates, getAction);

  // Step 5: Create Google Sheet in Drive
  let driveLink = null;
  try {
    const saKey = getServiceAccountKey();
    console.log("Creating Google Sheet...");
    const { webViewLink } = await createReport(saKey, sheetData);
    driveLink = webViewLink;
    console.log(`Sheet created: ${driveLink}`);
  } catch (err) {
    console.warn(`Sheet creation failed (continuing without link): ${err.message}`);
  }

  // Step 6: Send Google Chat notification
  console.log("Sending Chat notification...");
  const chatMessage = buildChatMessage(agingData, driveLink);
  await callTool(GCHAT_MCP, "send_message", {
    space_name: BILLING_SPACE,
    text: chatMessage,
  });
  console.log("Chat notification sent to #Billing - Packouts");

  return { ok: true, invoices: agingData.summary?.grand_total?.count, driveLink };
}

/**
 * Cloud Function HTTP handler.
 */
functions.http("arReview", async (req, res) => {
  try {
    const result = await run();
    res.status(200).json(result);
  } catch (err) {
    console.error("A/R review failed:", err);

    // Try to send error notification to Chat
    try {
      await callTool(GCHAT_MCP, "send_message", {
        space_name: BILLING_SPACE,
        text: `*Weekly A/R Review FAILED*\n\nError: ${err.message}\n\nCheck Cloud Function logs for details.`,
      });
    } catch (chatErr) {
      console.error("Failed to send error notification:", chatErr.message);
    }

    res.status(500).json({ error: err.message });
  }
});
