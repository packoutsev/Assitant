#!/usr/bin/env node

/**
 * Remote MCP Server for Xcelerate Job Management (Cloud Run deployment)
 *
 * Dual-purpose Express server:
 *   1. POST /webhook — Zapier webhook ingestion into Cloud Firestore
 *   2. GET /sse + POST /messages — MCP SSE transport for claude.ai
 *
 * Environment variables:
 *   AUTH_TOKEN       — Bearer token for MCP SSE auth
 *   WEBHOOK_SECRET   — Shared secret for Zapier webhook auth (X-Webhook-Secret header)
 *   GOOGLE_CLOUD_PROJECT — Firestore project (auto-set on Cloud Run)
 *   PORT             — HTTP port (default 8080)
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Firestore } from "@google-cloud/firestore";
import { registerTools } from "./tools.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "8080", 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const log = (...args) => console.log("[mcp-xcelerate]", ...args);

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

const db = new Firestore();

// ---------------------------------------------------------------------------
// Field mapping — normalize Zapier payload field names
// ---------------------------------------------------------------------------

const FIELD_ALIASES = {
  // customer_name
  customerName: "customer_name",
  policyholder: "customer_name",
  insured_name: "customer_name",
  insuredName: "customer_name",
  // customer_phone
  customerPhone: "customer_phone",
  phone: "customer_phone",
  // customer_email
  customerEmail: "customer_email",
  email: "customer_email",
  // property_address
  propertyAddress: "property_address",
  address: "property_address",
  loss_address: "property_address",
  lossAddress: "property_address",
  // property_city
  propertyCity: "property_city",
  city: "property_city",
  // property_state
  propertyState: "property_state",
  state: "property_state",
  // property_zip
  propertyZip: "property_zip",
  zip: "property_zip",
  zipCode: "property_zip",
  zip_code: "property_zip",
  // insurance_company
  insuranceCompany: "insurance_company",
  carrier: "insurance_company",
  insurance_carrier: "insurance_company",
  // adjuster_name
  adjusterName: "adjuster_name",
  adjuster: "adjuster_name",
  // job_type
  jobType: "job_type",
  // loss_type
  lossType: "loss_type",
  loss_category: "loss_type",
  // status
  job_status: "status",
  jobStatus: "status",
  // substatus
  sub_status: "substatus",
  subStatus: "substatus",
  // date_of_loss
  dateOfLoss: "date_of_loss",
  dol: "date_of_loss",
  // date_received
  dateReceived: "date_received",
  // date_scheduled
  dateScheduled: "date_scheduled",
  // date_started
  dateStarted: "date_started",
  // date_completed
  dateCompleted: "date_completed",
  // project_manager
  projectManager: "project_manager",
  pm: "project_manager",
  // assigned_crew
  assignedCrew: "assigned_crew",
  crew: "assigned_crew",
  // estimator
  estimator_name: "estimator",
  // estimated_amount
  estimatedAmount: "estimated_amount",
  estimate_amount: "estimated_amount",
  // claim_number
  claimNumber: "claim_number",
  claim: "claim_number",
  // job_number
  jobNumber: "job_number",
  // job_id / xcelerate_id
  xcelerate_id: "xcelerate_id",
  xcelerateId: "xcelerate_id",
};

// Known job-level fields (canonical names)
const JOB_FIELDS = new Set([
  "xcelerate_id", "job_number", "claim_number", "customer_name", "customer_phone",
  "customer_email", "property_address", "property_city", "property_state", "property_zip",
  "insurance_company", "adjuster_name", "job_type", "loss_type", "status", "substatus",
  "date_of_loss", "date_received", "date_scheduled", "date_started", "date_completed",
  "project_manager", "assigned_crew", "estimator", "estimated_amount",
]);

function normalizePayload(raw) {
  const mapped = {};
  const unmapped = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === "event_type" || key === "job_id") continue; // envelope fields
    const canonical = FIELD_ALIASES[key] || key;
    if (JOB_FIELDS.has(canonical)) {
      mapped[canonical] = value;
    } else {
      unmapped[key] = value;
    }
  }

  // Ensure assigned_crew is always an array
  if (mapped.assigned_crew && !Array.isArray(mapped.assigned_crew)) {
    mapped.assigned_crew = String(mapped.assigned_crew)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Parse estimated_amount to number if string
  if (mapped.estimated_amount && typeof mapped.estimated_amount === "string") {
    const parsed = parseFloat(mapped.estimated_amount.replace(/[^0-9.-]/g, ""));
    if (!isNaN(parsed)) mapped.estimated_amount = parsed;
  }

  return { mapped, unmapped };
}

// ---------------------------------------------------------------------------
// Webhook event handlers
// ---------------------------------------------------------------------------

async function handleNewJob(jobId, payload) {
  const { mapped, unmapped } = normalizePayload(payload);
  const now = Firestore.Timestamp.now();

  const jobData = {
    ...mapped,
    xcelerate_id: jobId,
    created_at: now,
    updated_at: now,
    source: "zapier",
    raw: payload,
  };

  await db.collection("jobs").doc(jobId).set(jobData);
  log(`Created job ${jobId}`);
}

async function handleJobUpdated(jobId, payload) {
  const { mapped } = normalizePayload(payload);
  const now = Firestore.Timestamp.now();

  await db.collection("jobs").doc(jobId).set(
    { ...mapped, updated_at: now, raw: payload },
    { merge: true }
  );
  log(`Updated job ${jobId}`);
}

async function handleStatusChange(jobId, payload) {
  const { mapped } = normalizePayload(payload);
  const now = Firestore.Timestamp.now();

  const update = { updated_at: now, raw: payload };
  if (mapped.status) update.status = mapped.status;
  if (mapped.substatus) update.substatus = mapped.substatus;

  await db.collection("jobs").doc(jobId).set(update, { merge: true });
  log(`Status change for job ${jobId}: ${mapped.status || "?"} / ${mapped.substatus || "?"}`);
}

async function handleScheduleChange(jobId, payload) {
  const { mapped } = normalizePayload(payload);
  const now = Firestore.Timestamp.now();

  const scheduleData = {
    event_type: payload.schedule_type || payload.event_subtype || "unknown",
    scheduled_date: mapped.date_scheduled || payload.scheduled_date || null,
    scheduled_time: payload.scheduled_time || null,
    end_time: payload.end_time || null,
    assigned_to: mapped.assigned_crew || [],
    location: mapped.property_address || null,
    notes: payload.schedule_notes || payload.notes || null,
    status: payload.schedule_status || "scheduled",
    job_id: jobId,
    created_at: now,
    updated_at: now,
    raw: payload,
  };

  await db.collection("jobs").doc(jobId).collection("schedule").add(scheduleData);

  // Also update the job's date_scheduled if provided
  if (scheduleData.scheduled_date) {
    await db.collection("jobs").doc(jobId).set(
      { date_scheduled: scheduleData.scheduled_date, updated_at: now },
      { merge: true }
    );
  }

  log(`Schedule entry added for job ${jobId}`);
}

async function handleNotesAdded(jobId, payload) {
  const now = Firestore.Timestamp.now();

  const noteData = {
    text: payload.note_text || payload.notes || payload.text || "",
    author: payload.note_author || payload.author || null,
    type: payload.note_type || payload.type || "internal",
    created_at: now,
    raw: payload,
  };

  await db.collection("jobs").doc(jobId).collection("notes").add(noteData);
  log(`Note added for job ${jobId}`);
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// --- CORS for claude.ai browser client ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, X-Webhook-Secret");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mcp-xcelerate" });
});

// --- Webhook endpoint ---
app.post("/webhook", async (req, res) => {
  // Auth: validate shared secret
  if (WEBHOOK_SECRET) {
    const secret = req.headers["x-webhook-secret"];
    if (secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }
  }

  const payload = req.body;
  const eventType = payload.event_type;
  const jobId = String(payload.job_id || "");

  if (!eventType || !jobId) {
    return res.status(400).json({ error: "Missing event_type or job_id" });
  }

  // Respond immediately
  res.status(200).json({ received: true, event_type: eventType, job_id: jobId });

  // Process async
  try {
    // Always append to audit log
    const now = Firestore.Timestamp.now();
    await db.collection("jobs").doc(jobId).collection("events").add({
      event_type: eventType,
      received_at: now,
      payload,
    });

    // Route to handler
    switch (eventType) {
      case "new_job":
        await handleNewJob(jobId, payload);
        break;
      case "job_updated":
        await handleJobUpdated(jobId, payload);
        break;
      case "status_change":
        await handleStatusChange(jobId, payload);
        break;
      case "schedule_change":
        await handleScheduleChange(jobId, payload);
        break;
      case "notes_added":
        await handleNotesAdded(jobId, payload);
        break;
      default:
        log(`Unknown event type: ${eventType}, logged to audit`);
    }
  } catch (err) {
    log(`Error processing ${eventType} for job ${jobId}:`, err.message);
  }
});

// --- Bearer token auth middleware (for MCP) ---
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next();

  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header or token parameter" });
  }

  if (token !== AUTH_TOKEN) {
    return res.status(403).json({ error: "Invalid bearer token" });
  }

  next();
}

// --- Session tracking ---
const sessions = new Map();

// --- Streamable HTTP endpoint (handles POST, GET, DELETE) ---
app.all("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (sessionId && !sessions.has(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  log("New Streamable HTTP session");

  const id = randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => id,
  });

  const server = new McpServer({
    name: "xcelerate",
    version: "1.0.0",
  });
  registerTools(server, db);

  await server.connect(transport);
  sessions.set(id, { transport, server });

  transport.onclose = () => {
    log(`Session closed: ${id}`);
    sessions.delete(id);
  };

  await transport.handleRequest(req, res, req.body);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  if (!WEBHOOK_SECRET) {
    log("WARNING: WEBHOOK_SECRET not set — webhook endpoint is unauthenticated");
  }

  app.listen(PORT, () => {
    log(`Server listening on port ${PORT}`);
    log(`Webhook: POST /webhook`);
    log(`Streamable HTTP: /mcp`);
    log(`Health: GET /health`);
  });
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
