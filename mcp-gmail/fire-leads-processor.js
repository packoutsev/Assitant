#!/usr/bin/env node

/**
 * Fire Leads Processor
 *
 * Polls Gmail "Fire Leads" label for new LIVE LEAD emails from Fireleads.com,
 * parses incident details, and posts a formatted call sheet to Google Chat.
 *
 * Usage:
 *   node fire-leads-processor.js                  # Process new leads
 *   node fire-leads-processor.js --test           # Process latest lead, post to test space
 *   node fire-leads-processor.js --dry-run        # Parse only, no posting
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CHAT_API = "https://chat.googleapis.com/v1";

const FIRE_LEADS_LABEL = "Label_255036435287786768";
const PROCESSED_FILE = join(HOME, ".fireleads_processed.json");
const XCELERATE_MCP_URL = "https://xceleratewebhook-326811155221.us-central1.run.app/mcp";
const XCELERATE_API_KEY = "ee30f26088697fd9e1f8e8857d90aba60e6fc8422f05a0c79b5c06791c809a51";

// Google Chat spaces
const SPACES = {
  test: "spaces/AAQAk9aHqLc",       // Matt's test space
  leads: "spaces/AAQALDdcYZU",      // Fire Leads space
  sales: "spaces/AAQAtaq4A6c",      // #Sales - Packouts
  diana: "spaces/-n7biCAAAAE",      // Diana DM
};

const log = (...args) => console.log("[fire-leads]", ...args);

// ---------------------------------------------------------------------------
// Auth helpers (reuse Gmail + GChat credentials)
// ---------------------------------------------------------------------------

function loadAuth(service) {
  const credsPath = join(HOME, `.${service}_credentials.json`);
  const tokensPath = join(HOME, `.${service}_tokens.json`);
  const creds = JSON.parse(readFileSync(credsPath, "utf-8"));
  const tokens = JSON.parse(readFileSync(tokensPath, "utf-8"));
  return { creds, tokens, tokensPath };
}

async function getAccessToken(service) {
  const { creds, tokens, tokensPath } = loadAuth(service);
  const savedAt = tokens.saved_at || 0;
  const expiresIn = tokens.expires_in || 3600;
  const elapsed = Date.now() / 1000 - savedAt;

  if (elapsed < expiresIn - 120) {
    return tokens.access_token;
  }

  // Refresh
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
  writeFileSync(tokensPath, JSON.stringify(newTokens, null, 2));
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
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
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
    type: null,          // "LIVE LEAD" or "DAILY REPORT"
    incident_number: null,
    incident_type: null, // from subject: STRUCTURE FIRE, WATER, etc.
    address: null,
    city: null,
    state: "AZ",
    zip: null,
    county: null,
    date: null,
    time: null,
    fire_department: null,
    notes: null,
    owner_name: null,
    owner_address: null,
    owner_phone: null,
    occupancy: null,
    renter_name: null,
    renter_phone: null,
    commercial_name: null,
    commercial_phone: null,
    property_details: null,
    property_value: null,
    services: [],
  };

  // Determine type from subject
  if (/LIVE LEAD/i.test(subject)) {
    result.type = "LIVE LEAD";
  } else if (/DAILY REPORT/i.test(subject)) {
    result.type = "DAILY REPORT";
    return result; // Skip daily reports for now
  }

  // Incident type from subject
  const typeMatch = subject.match(/LIVE LEAD\s+[\d.]+\s+(.*?)\s*-\s*\w+\s*$/i);
  if (typeMatch) result.incident_type = typeMatch[1].trim();

  // City from subject
  const cityFromSubject = subject.match(/-\s*(\w[\w\s]*?)\s*$/);
  if (cityFromSubject) result.city = cityFromSubject[1].trim();

  // Incident number + time
  const incMatch = body.match(/Incident Number:\s*\*?([\d.]+)\s*([\d:]+\s*(?:am|pm)?)\s*\*?/i);
  if (incMatch) {
    result.incident_number = incMatch[1].trim();
    let rawTime = incMatch[2].trim();
    // Fix missing leading digit (e.g., ":07pm" → "12:07pm")
    if (rawTime.startsWith(":")) rawTime = "12" + rawTime;
    result.time = rawTime;
    // Parse date from incident number: MM.DD.YYYY.NNN
    const parts = incMatch[1].split(".");
    if (parts.length >= 3) {
      const mm = parts[0].padStart(2, "0");
      const dd = parts[1].padStart(2, "0");
      const yyyy = parts[2];
      result.date = `${yyyy}-${mm}-${dd}`;
    }
  }

  // Address
  const addrMatch = body.match(/Incident Address:\s*\*?\s*(?:AREA OF:\s*)?(.*?)(?:\s*<|\s*\*|\n)/i);
  if (addrMatch) {
    let addr = addrMatch[1].trim().replace(/\s+/g, " ");
    result.address = addr;
    // Extract zip
    const zipMatch = addr.match(/(\d{5})\s*$/);
    if (zipMatch) result.zip = zipMatch[1];
    // Extract city from address if not from subject
    const cityZipMatch = addr.match(/,\s*([A-Za-z\s]+),\s*AZ/i);
    if (cityZipMatch) result.city = cityZipMatch[1].trim();
  }

  // County
  const countyMatch = body.match(/Incident County:\s*\*?\s*(.*?)\s*\*?(?:\n|$)/i);
  if (countyMatch) result.county = countyMatch[1].trim();

  // Notes - grab text between Notes/Report and Owner Information
  const notesMatch = body.match(/Incident Notes\/Report:\s*\*?([\s\S]*?)(?=Owner Information:|Property Occupancy:|$)/i);
  if (notesMatch) {
    let notes = notesMatch[1].trim()
      .replace(/\*/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    // Extract fire department
    const fdMatch = notes.match(/([\w\s]+(?:Fire|fire)\s+(?:Department|Dept))/i);
    if (fdMatch) result.fire_department = fdMatch[1].trim();
    result.notes = notes.slice(0, 500); // cap length
  }

  // Owner information — multi-line block between "Owner Information:" and "Property Occupancy:"
  const ownerBlock = body.match(/Owner Information:\s*\*?([\s\S]*?)(?=Property Occupancy:|Commercial\/Business|$)/i);
  if (ownerBlock) {
    const raw = ownerBlock[1].replace(/\*/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();

    // Extract all phone numbers first (before splitting on dashes)
    const allPhones = raw.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];

    // Extract name~phone pairs (e.g., "Marla~623-570-1382")
    const namePairs = raw.match(/(\w+)~(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/g);
    if (namePairs) {
      result.owner_phone_detail = namePairs.map((p) => {
        const tildeIdx = p.indexOf("~");
        return `${p.slice(0, tildeIdx)}: ${p.slice(tildeIdx + 1)}`;
      });
    }
    result.owner_phone = allPhones.join(" & ") || null;

    // Now parse name and address: split on " - " but protect phone numbers
    // Replace phone numbers temporarily to avoid dash confusion
    let cleaned = raw;
    for (const ph of allPhones) {
      cleaned = cleaned.replace(ph, "___PHONE___");
    }
    // Also remove name~phone patterns
    cleaned = cleaned.replace(/\w+~___PHONE___/g, "").replace(/\s*&\s*$/, "").replace(/\s+/g, " ").trim();

    // Split on " - " (field separator has spaces around the dash)
    const fields = cleaned.split(/\s+-\s+/).map((f) => f.trim()).filter(Boolean);
    if (fields.length >= 1) {
      result.owner_name = fields[0].replace(/___PHONE___/g, "").trim();
      if (fields.length >= 2) {
        result.owner_address = fields[1].replace(/___PHONE___/g, "").trim();
      }
    }

    if (/unlisted/i.test(raw)) result.owner_phone = null;
  }

  // Property occupancy
  const occMatch = body.match(/Property Occupancy:\s*\*?(.*?)\*?(?:\n|$)/i);
  if (occMatch) {
    result.occupancy = occMatch[1].trim();
    // Check for renter info
    const renterMatch = result.occupancy.match(/RENTER\s+OCCUPIED\s*-\s*(.*?)\s*-\s*([\d\-\s/]+)/i);
    if (renterMatch) {
      result.renter_name = renterMatch[1].trim();
      result.renter_phone = renterMatch[2].trim().split(/\s*\/\/\s*/)[0].trim();
    }
  }

  // Commercial/Business
  const commMatch = body.match(/Commercial\/Business Name\/Number:\s*\*?(.*?)\*?(?:\n|$)/i);
  if (commMatch) {
    const val = commMatch[1].trim();
    if (!/^NA$/i.test(val)) {
      const parts = val.split(/\s*\/\/\s*/);
      result.commercial_name = parts[0]?.trim() || null;
      result.commercial_phone = parts[1]?.trim() || null;
    }
  }

  // Property details
  const propMatch = body.match(/Property Details:\s*\*?(.*?)\*?(?:\n|$)/i);
  if (propMatch) result.property_details = propMatch[1].trim();

  // Property value
  const valMatch = body.match(/Property Value:\s*\*?(.*?)\*?(?:\n|$)/i);
  if (valMatch) {
    const val = valMatch[1].trim();
    if (!/^NA$/i.test(val)) result.property_value = val;
  }

  // Services
  const svcMatch = body.match(/Possible Needed Services:\s*([\s\S]*?)(?=FIRELEADS|This message|$)/i);
  if (svcMatch) {
    result.services = svcMatch[1]
      .split(/\n|\*/)
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

  lines.push("*NEW FIRE LEAD — CALL SHEET*");
  lines.push("");
  lines.push(`*Incident #*: ${lead.incident_number || "Unknown"}`);
  lines.push(`*Type*: ${lead.incident_type || "Structure Fire"}`);
  lines.push(`*Date/Time*: ${lead.date || "?"} at ${lead.time || "?"}`);
  lines.push(`*Address*: ${lead.address || "Unknown"}`);
  if (lead.fire_department) lines.push(`*Fire Dept*: ${lead.fire_department}`);
  lines.push("");

  // Contact info — who to call
  lines.push("*— WHO TO CALL —*");

  if (lead.renter_name) {
    lines.push(`*Renter*: ${lead.renter_name}`);
    if (lead.renter_phone) lines.push(`*Renter Phone*: ${lead.renter_phone}`);
  }

  if (lead.owner_name) {
    lines.push(`*Owner*: ${lead.owner_name}`);
    if (lead.owner_phone_detail && lead.owner_phone_detail.length > 0) {
      for (const detail of lead.owner_phone_detail) {
        lines.push(`*Phone*: ${detail}`);
      }
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

  // Property info
  if (lead.occupancy) lines.push(`*Occupancy*: ${lead.occupancy.split("-")[0].trim()}`);
  if (lead.property_details) lines.push(`*Property*: ${lead.property_details}`);
  if (lead.property_value) lines.push(`*Value*: ${lead.property_value}`);
  lines.push("");

  // Services needed
  if (lead.services.length > 0) {
    lines.push("*Recommended Services*:");
    for (const svc of lead.services) {
      lines.push(`• ${svc}`);
    }
    lines.push("");
  }

  // Notes excerpt
  if (lead.notes) {
    const shortNotes = lead.notes.length > 300 ? lead.notes.slice(0, 300) + "..." : lead.notes;
    lines.push(`*Notes*: ${shortNotes}`);
    lines.push("");
  }

  // CTA — adapt script based on incident type
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
    clientInfo: { name: "fire-leads-processor", version: "1.0.0" },
  });
}

async function ingestToFirestore(lead, emailId) {
  await ensureMcpInit();
  const args = {
    incident_number: lead.incident_number,
    incident_type: lead.incident_type,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    zip: lead.zip,
    county: lead.county,
    date: lead.date,
    time: lead.time,
    fire_department: lead.fire_department,
    notes: lead.notes,
    owner_name: lead.owner_name,
    owner_phone: lead.owner_phone,
    owner_address: lead.owner_address,
    occupancy: lead.occupancy,
    renter_name: lead.renter_name,
    renter_phone: lead.renter_phone,
    commercial_name: lead.commercial_name,
    commercial_phone: lead.commercial_phone,
    property_details: lead.property_details,
    property_value: lead.property_value,
    services: lead.services,
    source_email_id: emailId,
  };
  // Strip undefined/null values
  for (const k of Object.keys(args)) {
    if (args[k] === undefined || args[k] === null) delete args[k];
  }
  const result = await mcpCall("tools/call", { name: "ingest_firelead", arguments: args });
  const text = result?.content?.[0]?.text;
  return text ? JSON.parse(text) : result;
}

// ---------------------------------------------------------------------------
// Processed tracking
// ---------------------------------------------------------------------------

function loadProcessed() {
  try {
    return JSON.parse(readFileSync(PROCESSED_FILE, "utf-8"));
  } catch {
    return { ids: [], incidents: [] };
  }
}

function saveProcessed(data) {
  writeFileSync(PROCESSED_FILE, JSON.stringify(data, null, 2));
}

function isProcessed(msgId) {
  const data = loadProcessed();
  return data.ids.includes(msgId);
}

function isIncidentProcessed(incidentNumber) {
  if (!incidentNumber) return false;
  const data = loadProcessed();
  return (data.incidents || []).includes(incidentNumber);
}

function markProcessed(msgId, incidentNumber) {
  const data = loadProcessed();
  if (!data.incidents) data.incidents = [];
  data.ids.push(msgId);
  if (incidentNumber && !data.incidents.includes(incidentNumber)) {
    data.incidents.push(incidentNumber);
  }
  // Keep last 500 entries
  if (data.ids.length > 500) data.ids = data.ids.slice(-500);
  if (data.incidents.length > 500) data.incidents = data.incidents.slice(-500);
  saveProcessed(data);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes("--test");
  const isDryRun = args.includes("--dry-run");
  const isReingest = args.includes("--reingest"); // Firestore-only, skip Chat + dedup
  const targetSpace = isTest ? SPACES.test : SPACES.leads;

  log(`Mode: ${isReingest ? "REINGEST (Firestore only)" : isDryRun ? "DRY RUN" : isTest ? "TEST" : "PRODUCTION"}`);
  log(`Target space: ${targetSpace}`);

  // Search for recent live leads
  const isBackfill = args.includes("--backfill");
  const lookback = isTest ? "30d" : isBackfill ? "30d" : "2d";
  const query = `from:leads@fireleads.com subject:"LIVE LEAD" newer_than:${lookback}`;
  log(`Searching Gmail: ${query}`);
  const maxResults = isBackfill ? 50 : 10;
  const messages = await searchGmail(query, maxResults);
  log(`Found ${messages.length} messages`);

  if (messages.length === 0) {
    log("No new fire leads found.");
    return;
  }

  let processed = 0;
  let skipped = 0;

  for (const msg of messages) {
    if (!isTest && !isReingest && isProcessed(msg.id)) {
      skipped++;
      continue;
    }

    // Quick-check: peek at subject for incident number to dedupe before full fetch
    // (full dedupe happens after parsing too)

    log(`Processing message ${msg.id}...`);
    const fullMsg = await getGmailMessage(msg.id);
    const subject = getHeader(fullMsg.payload?.headers, "Subject") || "";
    const body = extractBody(fullMsg.payload);

    if (!body) {
      log(`  Skipping — empty body`);
      continue;
    }

    const lead = parseFireleadsEmail(subject, body);

    if (lead.type === "DAILY REPORT") {
      log(`  Skipping — daily report`);
      continue;
    }

    if (!lead.address) {
      log(`  Skipping — no address found`);
      continue;
    }

    // Deduplicate by incident number (Fireleads sends updates for same incident)
    if (!isTest && !isReingest && isIncidentProcessed(lead.incident_number)) {
      log(`  Skipping — incident ${lead.incident_number} already posted`);
      markProcessed(msg.id, null); // Mark message ID but don't re-add incident
      skipped++;
      continue;
    }

    log(`  Incident: ${lead.incident_number} — ${lead.address}`);
    log(`  Owner: ${lead.owner_name || "Unknown"} | Phone: ${lead.owner_phone || lead.renter_phone || "None"}`);

    // Persist to Firestore via MCP
    try {
      const ingestResult = await ingestToFirestore(lead, msg.id);
      log(`  Firestore: ${ingestResult.new ? "created" : "updated"} (${ingestResult.lead_id})`);
    } catch (e) {
      log(`  Firestore ingest failed (non-blocking): ${e.message}`);
    }

    // Reingest mode: skip Chat posting, just ingest to Firestore
    if (isReingest) {
      markProcessed(msg.id, lead.incident_number);
      processed++;
      continue;
    }

    const callSheet = formatCallSheet(lead);

    if (isDryRun) {
      console.log("\n" + "=".repeat(60));
      console.log(callSheet);
      console.log("=".repeat(60) + "\n");
    } else {
      log(`  Posting to Chat...`);
      await apiPost(CHAT_API, `/${targetSpace}/messages`, { text: callSheet }, "gchat");
      log(`  Posted!`);
      markProcessed(msg.id, lead.incident_number);
    }

    processed++;

    // In test mode, only process the first one
    if (isTest) break;
  }

  log(`Done. Processed: ${processed}, Skipped: ${skipped}`);
}

main().catch((e) => {
  log("Error:", e.message);
  process.exit(1);
});
