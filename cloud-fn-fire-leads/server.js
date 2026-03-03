/**
 * Fire Leads Processor — Cloud Run Scheduled Service
 *
 * HTTP endpoints:
 *   POST /run    — Process new fire leads (called by Cloud Scheduler)
 *   GET  /health — Health check
 *
 * Reads Gmail for "Fire Leads" emails, parses them, ingests to Firestore
 * via Xcelerate MCP, and posts call sheets to Google Chat.
 *
 * Credentials: Gmail + GChat OAuth tokens stored in GCS bucket.
 */

import express from "express";
import { Storage } from "@google-cloud/storage";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "8080", 10);
const GCS_BUCKET = process.env.GCS_BUCKET || "packouts-gchat-tokens";
const RUN_SECRET = process.env.RUN_SECRET || "";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CHAT_API = "https://chat.googleapis.com/v1";

const FIRE_LEADS_LABEL = "Label_255036435287786768";
const XCELERATE_MCP_URL = "https://xceleratewebhook-326811155221.us-central1.run.app/mcp";
const XCELERATE_API_KEY = process.env.XCELERATE_API_KEY || "";

const SPACES = {
  leads: "spaces/AAQALDdcYZU",
};

const storage = new Storage();
const log = (...args) => console.log("[fire-leads]", ...args);

// ---------------------------------------------------------------------------
// GCS token persistence
// ---------------------------------------------------------------------------

const tokenCache = {};

async function loadFromGCS(path) {
  try {
    const [contents] = await storage.bucket(GCS_BUCKET).file(path).download();
    return JSON.parse(contents.toString("utf-8"));
  } catch (err) {
    log(`GCS load failed for ${path}:`, err.message);
    return null;
  }
}

async function saveToGCS(path, data) {
  try {
    await storage.bucket(GCS_BUCKET).file(path).save(
      JSON.stringify(data, null, 2),
      { contentType: "application/json" }
    );
    log(`Saved ${path} to GCS`);
  } catch (err) {
    log(`GCS save failed for ${path}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Processed tracking (GCS-backed)
// ---------------------------------------------------------------------------

const PROCESSED_PATH = "fireleads-processed.json";
let processedData = null;

async function loadProcessed() {
  if (processedData) return processedData;
  processedData = await loadFromGCS(PROCESSED_PATH);
  if (!processedData) processedData = { ids: [], incidents: [] };
  return processedData;
}

async function saveProcessed() {
  if (processedData) await saveToGCS(PROCESSED_PATH, processedData);
}

function isProcessed(msgId) {
  return processedData?.ids?.includes(msgId);
}

function isIncidentProcessed(incidentNumber) {
  if (!incidentNumber) return false;
  return (processedData?.incidents || []).includes(incidentNumber);
}

function markProcessed(msgId, incidentNumber) {
  if (!processedData.incidents) processedData.incidents = [];
  processedData.ids.push(msgId);
  if (incidentNumber && !processedData.incidents.includes(incidentNumber)) {
    processedData.incidents.push(incidentNumber);
  }
  if (processedData.ids.length > 500) processedData.ids = processedData.ids.slice(-500);
  if (processedData.incidents.length > 500) processedData.incidents = processedData.incidents.slice(-500);
}

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

async function getAccessToken(service) {
  const credsPath = `${service}-credentials.json`;
  const tokensPath = `${service}-tokens.json`;

  if (!tokenCache[service]) {
    const creds = await loadFromGCS(credsPath);
    const tokens = await loadFromGCS(tokensPath);
    if (!creds || !tokens) throw new Error(`Missing ${service} credentials in GCS`);
    tokenCache[service] = { creds, tokens };
  }

  const { creds, tokens } = tokenCache[service];
  const savedAt = tokens.saved_at || 0;
  const expiresIn = tokens.expires_in || 3600;
  const elapsed = Date.now() / 1000 - savedAt;

  if (elapsed < expiresIn - 120) {
    return tokens.access_token;
  }

  // Refresh
  log(`Refreshing ${service} token...`);
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) throw new Error(`Token refresh failed for ${service}: ${await resp.text()}`);

  const newTokens = await resp.json();
  if (!newTokens.refresh_token) newTokens.refresh_token = tokens.refresh_token;
  newTokens.saved_at = Date.now() / 1000;
  tokenCache[service].tokens = newTokens;
  await saveToGCS(tokensPath, newTokens);
  return newTokens.access_token;
}

async function apiGet(base, path, params = {}, service) {
  const token = await getAccessToken(service);
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function apiPost(base, path, body, service) {
  const token = await getAccessToken(service);
  const resp = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

async function searchGmail(query, maxResults = 20) {
  const data = await apiGet(GMAIL_API, "/messages", { q: query, maxResults }, "gmail");
  return data.messages || [];
}

async function getGmailMessage(id) {
  return apiGet(GMAIL_API, `/messages/${id}`, { format: "full" }, "gmail");
}

function extractBody(payload) {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) {
        return Buffer.from(p.body.data, "base64url").toString("utf-8");
      }
    }
    for (const p of payload.parts) {
      const text = extractBody(p);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n");
  }
  return "";
}

function getHeader(headers, name) {
  const h = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}

// ---------------------------------------------------------------------------
// Fireleads parser
// ---------------------------------------------------------------------------

function parseFireleadsEmail(subject, body) {
  const result = {
    type: null, incident_number: null, incident_type: null,
    address: null, city: null, state: "AZ", zip: null, county: null,
    date: null, time: null, fire_department: null, notes: null,
    owner_name: null, owner_address: null, owner_phone: null,
    occupancy: null, renter_name: null, renter_phone: null,
    commercial_name: null, commercial_phone: null,
    property_details: null, property_value: null, services: [],
  };

  if (/LIVE LEAD/i.test(subject)) {
    result.type = "LIVE LEAD";
  } else if (/DAILY REPORT/i.test(subject)) {
    result.type = "DAILY REPORT";
    return result;
  }

  const typeMatch = subject.match(/LIVE LEAD\s+[\d.]+\s+(.*?)\s*-\s*\w+\s*$/i);
  if (typeMatch) result.incident_type = typeMatch[1].trim();

  const cityFromSubject = subject.match(/-\s*(\w[\w\s]*?)\s*$/);
  if (cityFromSubject) result.city = cityFromSubject[1].trim();

  const incMatch = body.match(/Incident Number:\s*\*?([\d.]+)\s*([\d:]+\s*(?:am|pm)?)\s*\*?/i);
  if (incMatch) {
    result.incident_number = incMatch[1].trim();
    let rawTime = incMatch[2].trim();
    if (rawTime.startsWith(":")) rawTime = "12" + rawTime;
    result.time = rawTime;
    const parts = incMatch[1].split(".");
    if (parts.length >= 3) {
      result.date = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
  }

  const addrMatch = body.match(/Incident Address:\s*\*?\s*(?:AREA OF:\s*)?(.*?)(?:\s*<|\s*\*|\n)/i);
  if (addrMatch) {
    result.address = addrMatch[1].trim().replace(/\s+/g, " ");
    const zipMatch = result.address.match(/(\d{5})\s*$/);
    if (zipMatch) result.zip = zipMatch[1];
    const cityZipMatch = result.address.match(/,\s*([A-Za-z\s]+),\s*AZ/i);
    if (cityZipMatch) result.city = cityZipMatch[1].trim();
  }

  const countyMatch = body.match(/Incident County:\s*\*?\s*(.*?)\s*\*?(?:\n|$)/i);
  if (countyMatch) result.county = countyMatch[1].trim();

  const notesMatch = body.match(/Incident Notes\/Report:\s*\*?([\s\S]*?)(?=Owner Information:|Property Occupancy:|$)/i);
  if (notesMatch) {
    let notes = notesMatch[1].trim().replace(/\*/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const fdMatch = notes.match(/([\w\s]+(?:Fire|fire)\s+(?:Department|Dept))/i);
    if (fdMatch) result.fire_department = fdMatch[1].trim();
    result.notes = notes.slice(0, 500);
  }

  const ownerBlock = body.match(/Owner Information:\s*\*?([\s\S]*?)(?=Property Occupancy:|Commercial\/Business|$)/i);
  if (ownerBlock) {
    const raw = ownerBlock[1].replace(/\*/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const allPhones = raw.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
    const namePairs = raw.match(/(\w+)~(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/g);
    if (namePairs) {
      result.owner_phone_detail = namePairs.map((p) => {
        const tildeIdx = p.indexOf("~");
        return `${p.slice(0, tildeIdx)}: ${p.slice(tildeIdx + 1)}`;
      });
    }
    result.owner_phone = allPhones.join(" & ") || null;
    let cleaned = raw;
    for (const ph of allPhones) cleaned = cleaned.replace(ph, "___PHONE___");
    cleaned = cleaned.replace(/\w+~___PHONE___/g, "").replace(/\s*&\s*$/, "").replace(/\s+/g, " ").trim();
    const fields = cleaned.split(/\s+-\s+/).map((f) => f.trim()).filter(Boolean);
    if (fields.length >= 1) {
      result.owner_name = fields[0].replace(/___PHONE___/g, "").trim();
      if (fields.length >= 2) result.owner_address = fields[1].replace(/___PHONE___/g, "").trim();
    }
    if (/unlisted/i.test(raw)) result.owner_phone = null;
  }

  const occMatch = body.match(/Property Occupancy:\s*\*?(.*?)\*?(?:\n|$)/i);
  if (occMatch) {
    result.occupancy = occMatch[1].trim();
    const renterMatch = result.occupancy.match(/RENTER\s+OCCUPIED\s*-\s*(.*?)\s*-\s*([\d\-\s/]+)/i);
    if (renterMatch) {
      result.renter_name = renterMatch[1].trim();
      result.renter_phone = renterMatch[2].trim().split(/\s*\/\/\s*/)[0].trim();
    }
  }

  const commMatch = body.match(/Commercial\/Business Name\/Number:\s*\*?(.*?)\*?(?:\n|$)/i);
  if (commMatch) {
    const val = commMatch[1].trim();
    if (!/^NA$/i.test(val)) {
      const parts = val.split(/\s*\/\/\s*/);
      result.commercial_name = parts[0]?.trim() || null;
      result.commercial_phone = parts[1]?.trim() || null;
    }
  }

  const propMatch = body.match(/Property Details:\s*\*?(.*?)\*?(?:\n|$)/i);
  if (propMatch) result.property_details = propMatch[1].trim();

  const valMatch = body.match(/Property Value:\s*\*?(.*?)\*?(?:\n|$)/i);
  if (valMatch) {
    const val = valMatch[1].trim();
    if (!/^NA$/i.test(val)) result.property_value = val;
  }

  const svcMatch = body.match(/Possible Needed Services:\s*([\s\S]*?)(?=FIRELEADS|This message|$)/i);
  if (svcMatch) {
    result.services = svcMatch[1].split(/\n|\*/)
      .map((s) => s.replace(/<[^>]+>/g, "").trim())
      .filter((s) => s.length > 3 && !/fireleads|click|unsubscribe/i.test(s));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Format call sheet for Google Chat
// ---------------------------------------------------------------------------

function formatCallSheet(lead) {
  const lines = [];
  lines.push("*NEW FIRE LEAD — CALL SHEET*", "");
  lines.push(`*Incident #*: ${lead.incident_number || "Unknown"}`);
  lines.push(`*Type*: ${lead.incident_type || "Structure Fire"}`);
  lines.push(`*Date/Time*: ${lead.date || "?"} at ${lead.time || "?"}`);
  lines.push(`*Address*: ${lead.address || "Unknown"}`);
  if (lead.fire_department) lines.push(`*Fire Dept*: ${lead.fire_department}`);
  lines.push("", "*— WHO TO CALL —*");

  if (lead.renter_name) {
    lines.push(`*Renter*: ${lead.renter_name}`);
    if (lead.renter_phone) lines.push(`*Renter Phone*: ${lead.renter_phone}`);
  }
  if (lead.owner_name) {
    lines.push(`*Owner*: ${lead.owner_name}`);
    if (lead.owner_phone_detail?.length > 0) {
      for (const detail of lead.owner_phone_detail) lines.push(`*Phone*: ${detail}`);
    } else if (lead.owner_phone) {
      lines.push(`*Owner Phone*: ${lead.owner_phone}`);
    }
    if (lead.owner_address && !/^Same Address/i.test(lead.owner_address)) {
      lines.push(`*Owner Address*: ${lead.owner_address}`);
    }
  }
  if (lead.commercial_name) {
    lines.push(`*Business*: ${lead.commercial_name}`);
    if (lead.commercial_phone) lines.push(`*Business Phone*: ${lead.commercial_phone}`);
  }
  if (!lead.renter_name && !lead.owner_name && !lead.commercial_name) {
    lines.push("_No contact info available — door knock recommended_");
  } else if (!lead.renter_phone && !lead.owner_phone && !lead.commercial_phone) {
    lines.push("_No phone numbers — door knock recommended_");
  }
  lines.push("");

  if (lead.occupancy) lines.push(`*Occupancy*: ${lead.occupancy.split("-")[0].trim()}`);
  if (lead.property_details) lines.push(`*Property*: ${lead.property_details}`);
  if (lead.property_value) lines.push(`*Value*: ${lead.property_value}`);
  lines.push("");

  if (lead.services.length > 0) {
    lines.push("*Recommended Services*:");
    for (const svc of lead.services) lines.push(`• ${svc}`);
    lines.push("");
  }

  if (lead.notes) {
    lines.push(`*Notes*: ${lead.notes.length > 300 ? lead.notes.slice(0, 300) + "..." : lead.notes}`, "");
  }

  const isFire = /fire/i.test(lead.incident_type || "");
  const isWater = /water|flood/i.test(lead.incident_type || "");
  const incident = isFire ? "a fire" : isWater ? "water damage" : "an incident";
  lines.push(`*Script*: _"Hi, this is [NAME] with 1-800-Packouts. We saw there was ${incident} near your property and wanted to make sure you had access to some free recovery resources we put together. Can I text you the link?"_`);
  lines.push("*Send*: azfirehelp.com");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Firestore ingest via MCP
// ---------------------------------------------------------------------------

let mcpSessionId = null;
let mcpRpcId = 1;

async function mcpCall(method, params = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "X-API-Key": XCELERATE_API_KEY,
  };
  if (mcpSessionId) headers["Mcp-Session-Id"] = mcpSessionId;

  const resp = await fetch(XCELERATE_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: mcpRpcId++, method, params }),
  });

  const sid = resp.headers.get("Mcp-Session-Id");
  if (sid) mcpSessionId = sid;

  if (!resp.ok) throw new Error(`MCP ${method} failed: ${resp.status}`);

  const ct = resp.headers.get("Content-Type") || "";
  if (ct.includes("text/event-stream")) {
    const text = await resp.text();
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("data:")) {
        try {
          const json = JSON.parse(line.slice(5).trim());
          if (json.error) throw new Error(json.error.message);
          if (json.result !== undefined) return json.result;
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
    throw new Error("No valid response in SSE stream");
  }

  const json = await resp.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function ensureMcpInit() {
  if (mcpSessionId) return;
  await mcpCall("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "fire-leads-processor", version: "2.0.0" },
  });
}

async function ingestToFirestore(lead, emailId) {
  await ensureMcpInit();
  const args = {
    incident_number: lead.incident_number, incident_type: lead.incident_type,
    address: lead.address, city: lead.city, state: lead.state, zip: lead.zip,
    county: lead.county, date: lead.date, time: lead.time,
    fire_department: lead.fire_department, notes: lead.notes,
    owner_name: lead.owner_name, owner_phone: lead.owner_phone,
    owner_address: lead.owner_address, occupancy: lead.occupancy,
    renter_name: lead.renter_name, renter_phone: lead.renter_phone,
    commercial_name: lead.commercial_name, commercial_phone: lead.commercial_phone,
    property_details: lead.property_details, property_value: lead.property_value,
    services: lead.services, source_email_id: emailId,
  };
  for (const k of Object.keys(args)) {
    if (args[k] === undefined || args[k] === null) delete args[k];
  }
  const result = await mcpCall("tools/call", { name: "ingest_firelead", arguments: args });
  const text = result?.content?.[0]?.text;
  return text ? JSON.parse(text) : result;
}

// ---------------------------------------------------------------------------
// Main processing logic
// ---------------------------------------------------------------------------

async function processLeads() {
  // Reset MCP session each run
  mcpSessionId = null;
  mcpRpcId = 1;

  await loadProcessed();

  const query = `from:leads@fireleads.com subject:"LIVE LEAD" newer_than:3d`;
  log(`Searching Gmail: ${query}`);
  const messages = await searchGmail(query, 10);
  log(`Found ${messages.length} messages`);

  if (messages.length === 0) {
    log("No new fire leads found.");
    return { processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const msg of messages) {
    if (isProcessed(msg.id)) { skipped++; continue; }

    log(`Processing message ${msg.id}...`);
    const fullMsg = await getGmailMessage(msg.id);
    const subject = getHeader(fullMsg.payload?.headers, "Subject") || "";
    const body = extractBody(fullMsg.payload);

    if (!body) { log("  Skipping — empty body"); continue; }

    const lead = parseFireleadsEmail(subject, body);

    if (lead.type === "DAILY REPORT") { log("  Skipping — daily report"); continue; }
    if (!lead.address) { log("  Skipping — no address found"); continue; }

    if (isIncidentProcessed(lead.incident_number)) {
      log(`  Skipping — incident ${lead.incident_number} already posted`);
      markProcessed(msg.id, null);
      skipped++;
      continue;
    }

    log(`  Incident: ${lead.incident_number} — ${lead.address}`);
    log(`  Owner: ${lead.owner_name || "Unknown"} | Phone: ${lead.owner_phone || lead.renter_phone || "None"}`);

    // Ingest to Firestore
    try {
      const ingestResult = await ingestToFirestore(lead, msg.id);
      log(`  Firestore: ${ingestResult.new ? "created" : "updated"} (${ingestResult.lead_id})`);
    } catch (e) {
      log(`  Firestore ingest failed (non-blocking): ${e.message}`);
    }

    // Post to Google Chat
    try {
      const callSheet = formatCallSheet(lead);
      await apiPost(CHAT_API, `/${SPACES.leads}/messages`, { text: callSheet }, "gchat");
      log("  Posted to Chat!");
    } catch (e) {
      log(`  Chat post failed (non-blocking): ${e.message}`);
    }

    markProcessed(msg.id, lead.incident_number);
    processed++;
  }

  await saveProcessed();
  log(`Done. Processed: ${processed}, Skipped: ${skipped}`);
  return { processed, skipped };
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "fire-leads-processor" });
});

app.post("/run", async (req, res) => {
  // Optional secret check for Cloud Scheduler
  if (RUN_SECRET) {
    const provided = req.headers["x-run-secret"] || req.query.secret;
    if (provided !== RUN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const result = await processLeads();
    res.json({ ok: true, ...result });
  } catch (err) {
    log("Error processing leads:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Also allow GET /run for easy testing
app.get("/run", async (req, res) => {
  if (RUN_SECRET) {
    const provided = req.query.secret;
    if (provided !== RUN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const result = await processLeads();
    res.json({ ok: true, ...result });
  } catch (err) {
    log("Error processing leads:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
});
