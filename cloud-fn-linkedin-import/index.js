/**
 * LinkedIn Sales Navigator → HubSpot Import — Cloud Function entry point.
 *
 * Watches a Google Drive folder for Sales Nav CSV exports, dedupes against
 * HubSpot, creates companies + contacts with associations, and posts a
 * summary to Google Chat #Sales.
 *
 * Triggered by Cloud Scheduler every 30 minutes.
 */

import functions from "@google-cloud/functions-framework";
import { callTool } from "./mcp-client.js";
import { listCsvFiles, readCsvContent, getOrCreateProcessedFolder, moveToProcessed } from "./drive-client.js";
import { parseSalesNavCsv } from "./csv-parser.js";
import { dedupeAndImport } from "./hubspot-client.js";
import { buildSummary } from "./report-builder.js";

// MCP server URL (Cloud Run, no auth needed)
const GCHAT_MCP = "https://mcp-gchat-326811155221.us-central1.run.app";

// Google Chat space for #Sales
const SALES_SPACE = "spaces/AAQAtaq4A6c";

/**
 * Parse the SA_KEY secret (injected as env var by Cloud Functions).
 */
function getServiceAccountKey() {
  const raw = process.env.SA_KEY;
  if (!raw) throw new Error("SA_KEY secret not configured");
  return JSON.parse(raw);
}

function getHubSpotToken() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN not configured");
  return token;
}

function getDriveFolderId() {
  const id = process.env.DRIVE_FOLDER_ID;
  if (!id) throw new Error("DRIVE_FOLDER_ID not configured");
  return id;
}

/**
 * Main orchestrator.
 */
async function run() {
  const saKey = getServiceAccountKey();
  const hsToken = getHubSpotToken();
  const watchFolderId = getDriveFolderId();

  // Step 1: List CSV files in watch folder
  console.log("Checking Drive folder for new CSVs...");
  const csvFiles = await listCsvFiles(saKey, watchFolderId);

  if (csvFiles.length === 0) {
    console.log("No new CSV files found.");
    return { ok: true, filesProcessed: 0, results: [] };
  }

  console.log(`Found ${csvFiles.length} CSV file(s) to process.`);

  // Step 2: Get or create Processed subfolder
  const processedFolderId = await getOrCreateProcessedFolder(saKey, watchFolderId);

  const allResults = [];

  // Step 3: Process each CSV file (sequential, with per-file error isolation)
  for (const file of csvFiles) {
    console.log(`\n--- Processing: ${file.name} ---`);

    try {
      // 3a: Read CSV content
      const csvContent = await readCsvContent(saKey, file.id);

      // 3b: Parse and normalize
      const { rows, listName } = parseSalesNavCsv(csvContent, file.name);
      console.log(`Parsed ${rows.length} contacts from "${listName}"`);

      if (rows.length === 0) {
        console.log("No contacts in CSV, skipping.");
        await moveToProcessed(saKey, file.id, watchFolderId, processedFolderId);
        allResults.push({
          fileName: file.name,
          listName,
          status: "success",
          stats: { totalRows: 0, newContacts: 0, skippedContacts: 0, newCompanies: 0, matchedCompanies: 0, errors: 0 },
        });
        continue;
      }

      // 3c: Dedupe and import into HubSpot
      const stats = await dedupeAndImport(hsToken, rows);

      // 3d: Move CSV to Processed folder
      await moveToProcessed(saKey, file.id, watchFolderId, processedFolderId);

      allResults.push({ fileName: file.name, listName, status: "success", stats });
    } catch (err) {
      console.error(`Failed to process ${file.name}:`, err);
      // Do NOT move to Processed — leave for retry on next run
      allResults.push({ fileName: file.name, listName: file.name, status: "error", error: err.message });
    }
  }

  // Step 4: Post summary to Google Chat #Sales
  const message = buildSummary(allResults);
  console.log("\nPosting summary to #Sales...");
  await callTool(GCHAT_MCP, "send_message", {
    space_name: SALES_SPACE,
    text: message,
  });
  console.log("Summary posted.");

  return { ok: true, filesProcessed: allResults.length, results: allResults };
}

/**
 * Cloud Function HTTP handler.
 */
functions.http("linkedinImport", async (req, res) => {
  try {
    const result = await run();
    res.status(200).json(result);
  } catch (err) {
    console.error("LinkedIn import failed:", err);

    // Try to send error notification to Chat
    try {
      await callTool(GCHAT_MCP, "send_message", {
        space_name: SALES_SPACE,
        text: `*LinkedIn Sales Nav Import FAILED*\n\nError: ${err.message}\n\nCheck Cloud Function logs for details.`,
      });
    } catch (chatErr) {
      console.error("Failed to send error notification:", chatErr.message);
    }

    res.status(500).json({ error: err.message });
  }
});
