/**
 * Daily Sales Activity Tracker
 *
 * Express server with a single POST /trigger endpoint that Cloud Scheduler
 * hits daily at 1pm MST. Pulls call data from HubSpot, classifies BD vs
 * Coordination, and posts a summary to Google Chat.
 *
 * Environment variables:
 *   HUBSPOT_API_TOKEN    — HubSpot Service Key
 *   GCHAT_CLIENT_ID      — Google OAuth client ID
 *   GCHAT_CLIENT_SECRET  — Google OAuth client secret
 *   GCS_BUCKET           — GCS bucket for token storage
 *   GCHAT_SPACE_NAME     — Target Google Chat space
 *   TRIGGER_SECRET       — Shared secret for auth
 *   PORT                 — HTTP port (default 8080)
 */

import express from "express";
import { fetchTodaysCalls, fetchActiveDealContactIds, getTodayRangeMST } from "./hubspot.js";
import { classifyTouches } from "./classifier.js";
import { formatSummary } from "./formatter.js";
import { postToChat } from "./gchat.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const log = (...args) => console.log("[server]", ...args);

const app = express();
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "daily-sales-tracker" });
});

// ── Trigger endpoint ─────────────────────────────────────────────────────────

app.post("/trigger", async (req, res) => {
  // Auth: check trigger secret
  const secret = process.env.TRIGGER_SECRET;
  if (secret) {
    const provided =
      req.headers["x-trigger-secret"] ||
      req.headers["x-cloudscheduler"] ||
      req.body?.secret;
    if (provided !== secret) {
      log("Unauthorized trigger attempt");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  log("Trigger received — starting daily sales report...");
  const startTime = Date.now();
  const errors = [];

  try {
    const { dateStr } = getTodayRangeMST();

    // Fetch HubSpot calls + active deal contacts in parallel
    let hubspotCalls = [];
    let activeDealContactIds = new Set();
    let dealNames = new Map();

    const [callsResult, dealsResult] = await Promise.allSettled([
      fetchTodaysCalls(),
      fetchActiveDealContactIds(),
    ]);

    if (callsResult.status === "fulfilled") {
      hubspotCalls = callsResult.value;
    } else {
      errors.push(`HubSpot calls: ${callsResult.reason.message}`);
      log("HubSpot calls failed:", callsResult.reason.message);
    }

    if (dealsResult.status === "fulfilled") {
      activeDealContactIds = dealsResult.value.contactIdSet;
      dealNames = dealsResult.value.dealNames;
    } else {
      errors.push(`HubSpot deals: ${dealsResult.reason.message}`);
      log("HubSpot deals failed:", dealsResult.reason.message);
    }

    // Classify BD vs Coordination
    const classified = classifyTouches(
      hubspotCalls,
      activeDealContactIds,
      dealNames
    );

    // Format and post
    let summary = formatSummary(dateStr, classified);
    if (errors.length > 0) {
      summary += `\n\n\u26A0\uFE0F _Partial data — ${errors.length} error(s): ${errors.join("; ")}_`;
    }

    const chatResult = await postToChat(summary);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Report posted successfully in ${elapsed}s`);

    res.json({
      ok: true,
      elapsed: `${elapsed}s`,
      totalCalls: hubspotCalls.length,
      bdCalls: classified.bdCalls.length,
      coordCalls: classified.coordCalls.length,
      chatMessage: chatResult.name,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Fatal error after ${elapsed}s:`, err);
    res.status(500).json({
      ok: false,
      error: err.message,
      elapsed: `${elapsed}s`,
    });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  log(`Daily sales tracker listening on port ${PORT}`);
  log(`POST /trigger to run report`);
  log(`GET /health for health check`);
});
