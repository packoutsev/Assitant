/**
 * HubSpot API module for coaching agent.
 *
 * Fetches calls, notes, contacts (with phones), and deals for Anonno.
 *
 * Env: HUBSPOT_API_TOKEN
 */

const API_BASE = "https://api.hubapi.com";
const ANONNO_OWNER_ID = "161300089";

const log = (...args) => console.log("[hubspot]", ...args);

function getToken() {
  const token = process.env.HUBSPOT_API_TOKEN;
  if (!token) throw new Error("Missing HUBSPOT_API_TOKEN env var");
  return token;
}

async function hubspotGet(path) {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HubSpot GET ${path} failed (${resp.status}): ${body}`);
  }
  return resp.json();
}

async function hubspotPost(path, body) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HubSpot POST ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

// ── Date helpers (MST = America/Phoenix, UTC-7 year-round) ───────────────────

export function getTodayRangeMST() {
  const now = new Date();
  const mstStr = now.toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  const startUTC = new Date(`${mstStr}T00:00:00-07:00`);
  const endUTC = new Date(`${mstStr}T23:59:59.999-07:00`);
  return {
    startMs: startUTC.getTime(),
    endMs: endUTC.getTime(),
    startISO: startUTC.toISOString(),
    endISO: endUTC.toISOString(),
    dateStr: mstStr,
  };
}

export function getYesterdayRangeMST() {
  const now = new Date();
  const mstStr = now.toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  const todayStart = new Date(`${mstStr}T00:00:00-07:00`);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayEnd = new Date(todayStart.getTime() - 1);
  const yesterdayStr = yesterdayStart.toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  return {
    startMs: yesterdayStart.getTime(),
    endMs: yesterdayEnd.getTime(),
    startISO: yesterdayStart.toISOString(),
    endISO: yesterdayEnd.toISOString(),
    dateStr: yesterdayStr,
  };
}

function toMST(isoStr) {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(ms) {
  const totalSec = Math.round(Number(ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Fetch today's calls ──────────────────────────────────────────────────────

export async function fetchTodaysCalls(range) {
  const { startMs, endMs } = range;
  log(`Fetching calls for owner ${ANONNO_OWNER_ID}`);

  const data = await hubspotPost("/crm/v3/objects/calls/search", {
    filterGroups: [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ANONNO_OWNER_ID },
          { propertyName: "hs_timestamp", operator: "GTE", value: String(startMs) },
          { propertyName: "hs_timestamp", operator: "LTE", value: String(endMs) },
        ],
      },
    ],
    properties: [
      "hs_call_title",
      "hs_call_duration",
      "hs_timestamp",
      "hs_call_direction",
      "hs_call_status",
      "hs_call_body",
      "hs_call_to_number",
      "hs_call_from_number",
    ],
    sorts: [{ propertyName: "hs_timestamp", direction: "ASCENDING" }],
    limit: 100,
  });

  const calls = data.results || [];
  log(`Found ${calls.length} calls`);

  const enriched = await Promise.all(
    calls.map(async (call) => {
      const contactIds = await fetchAssociatedContacts("calls", call.id);
      const p = call.properties;
      return {
        id: call.id,
        title: p.hs_call_title,
        duration: formatDuration(p.hs_call_duration),
        durationMs: Number(p.hs_call_duration),
        time: toMST(p.hs_timestamp),
        timestamp: p.hs_timestamp,
        direction: (p.hs_call_direction || "").toLowerCase(),
        status: p.hs_call_status,
        toNumber: p.hs_call_to_number,
        fromNumber: p.hs_call_from_number,
        transcript: p.hs_call_body || null,
        contactIds,
      };
    })
  );

  return enriched;
}

// ── Fetch today's notes ─────────────────────────────────────────────────────

export async function fetchTodaysNotes(range) {
  const { startMs, endMs } = range;
  log("Fetching notes...");

  const data = await hubspotPost("/crm/v3/objects/notes/search", {
    filterGroups: [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ANONNO_OWNER_ID },
          { propertyName: "hs_timestamp", operator: "GTE", value: String(startMs) },
          { propertyName: "hs_timestamp", operator: "LTE", value: String(endMs) },
        ],
      },
    ],
    properties: ["hs_note_body", "hs_timestamp"],
    sorts: [{ propertyName: "hs_timestamp", direction: "ASCENDING" }],
    limit: 100,
  });

  const notes = data.results || [];
  log(`Found ${notes.length} notes`);

  const enriched = await Promise.all(
    notes.map(async (note) => {
      const contactIds = await fetchAssociatedContacts("notes", note.id);
      return {
        id: note.id,
        body: note.properties.hs_note_body || "",
        time: toMST(note.properties.hs_timestamp),
        contactIds,
      };
    })
  );

  return enriched;
}

// ── Fetch active contacts with phone numbers ────────────────────────────────

export async function fetchActiveContacts() {
  log("Fetching active contacts with phones...");

  // Get contacts owned by Anonno modified in last 90 days
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

  const data = await hubspotPost("/crm/v3/objects/contacts/search", {
    filterGroups: [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ANONNO_OWNER_ID },
          { propertyName: "lastmodifieddate", operator: "GTE", value: String(ninetyDaysAgo) },
          { propertyName: "phone", operator: "HAS_PROPERTY" },
        ],
      },
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ANONNO_OWNER_ID },
          { propertyName: "lastmodifieddate", operator: "GTE", value: String(ninetyDaysAgo) },
          { propertyName: "mobilephone", operator: "HAS_PROPERTY" },
        ],
      },
    ],
    properties: ["firstname", "lastname", "phone", "mobilephone", "company", "email", "hubspot_owner_id"],
    limit: 200,
  });

  const contacts = data.results || [];
  log(`Found ${contacts.length} contacts with phones`);

  // Build phone → contact map
  const phoneMap = new Map();
  for (const c of contacts) {
    const p = c.properties;
    const name = [p.firstname, p.lastname].filter(Boolean).join(" ") || "Unknown";
    const info = { contactId: String(c.id), name, company: p.company || "" };
    for (const prop of ["phone", "mobilephone"]) {
      const normalized = normalizePhone(p[prop]);
      if (normalized) {
        phoneMap.set(normalized, info);
      }
    }
  }

  log(`Phone map: ${phoneMap.size} phone numbers`);
  return { contacts, phoneMap };
}

// ── Fetch active deals ──────────────────────────────────────────────────────

export async function fetchActiveDeals() {
  log("Fetching active deals...");

  const data = await hubspotPost("/crm/v3/objects/deals/search", {
    filterGroups: [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ANONNO_OWNER_ID },
          { propertyName: "dealstage", operator: "NOT_IN", values: ["closedwon", "closedlost"] },
        ],
      },
    ],
    properties: ["dealname", "dealstage", "amount", "closedate"],
    limit: 100,
  });

  const deals = data.results || [];
  log(`Found ${deals.length} active deals`);

  // Fetch associated contacts for each deal
  const enriched = await Promise.all(
    deals.map(async (deal) => {
      const contactIds = await fetchAssociatedContacts("deals", deal.id);
      const p = deal.properties;
      return {
        id: deal.id,
        name: p.dealname,
        stage: p.dealstage,
        amount: p.amount,
        closedate: p.closedate,
        contactIds,
      };
    })
  );

  return enriched;
}

// ── Batch fetch contact details ─────────────────────────────────────────────

export async function fetchContactDetails(contactIds) {
  if (!contactIds || contactIds.length === 0) return new Map();

  const unique = [...new Set(contactIds)].slice(0, 100);
  const data = await hubspotPost("/crm/v3/objects/contacts/batch/read", {
    inputs: unique.map((id) => ({ id })),
    properties: ["firstname", "lastname", "company", "phone", "mobilephone", "email", "hubspot_owner_id"],
  });

  const map = new Map();
  for (const c of data.results || []) {
    const p = c.properties;
    map.set(String(c.id), {
      name: [p.firstname, p.lastname].filter(Boolean).join(" ") || "Unknown",
      company: p.company || "",
      phone: p.phone || "",
      email: p.email || "",
      ownerId: p.hubspot_owner_id || "",
    });
  }
  return map;
}

// ── Fetch prior week's call count (for scorecard context) ────────────────────

export async function fetchPriorWeekCallCount(range) {
  // Get the 7-day window ending yesterday
  const todayStart = new Date(`${range.dateStr}T00:00:00-07:00`);
  const priorEnd = todayStart.getTime() - 1;
  const priorStart = todayStart.getTime() - 7 * 24 * 60 * 60 * 1000;

  const startDate = new Date(priorStart);
  const endDate = new Date(priorEnd);
  const startStr = startDate.toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  const endStr = endDate.toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  log(`Fetching prior week calls: ${startStr} to ${endStr}`);

  const data = await hubspotPost("/crm/v3/objects/calls/search", {
    filterGroups: [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ANONNO_OWNER_ID },
          { propertyName: "hs_timestamp", operator: "GTE", value: String(priorStart) },
          { propertyName: "hs_timestamp", operator: "LTE", value: String(priorEnd) },
        ],
      },
    ],
    properties: ["hs_timestamp"],
    limit: 1,
  });

  const total = data.total || 0;
  log(`Prior week calls: ${total}`);
  return { total, startStr, endStr };
}

// ── Fetch all contacts for morning briefing (with last modified for stale detection) ──

export async function fetchAllContacts() {
  log("Fetching all contacts owned by Anonno...");

  // Get contacts modified in last 6 months (covers all active relationships)
  const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;

  const data = await hubspotPost("/crm/v3/objects/contacts/search", {
    filterGroups: [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ANONNO_OWNER_ID },
          { propertyName: "lastmodifieddate", operator: "GTE", value: String(sixMonthsAgo) },
        ],
      },
    ],
    properties: [
      "firstname", "lastname", "phone", "mobilephone", "company",
      "email", "jobtitle", "lastmodifieddate", "notes_last_updated",
      "num_associated_deals", "hubspot_owner_id",
    ],
    sorts: [{ propertyName: "lastmodifieddate", direction: "DESCENDING" }],
    limit: 200,
  });

  const contacts = data.results || [];
  log(`Found ${contacts.length} total contacts`);

  const now = Date.now();
  return contacts.map((c) => {
    const p = c.properties;
    const lastModified = p.lastmodifieddate ? new Date(p.lastmodifieddate).getTime() : 0;
    const daysSinceTouch = Math.floor((now - lastModified) / (24 * 60 * 60 * 1000));
    return {
      id: c.id,
      name: [p.firstname, p.lastname].filter(Boolean).join(" ") || "Unknown",
      company: p.company || "",
      phone: p.phone || p.mobilephone || "",
      email: p.email || "",
      title: p.jobtitle || "",
      daysSinceTouch,
      lastModified: p.lastmodifieddate || "",
      deals: Number(p.num_associated_deals) || 0,
    };
  });
}

// ── Create HubSpot task ──────────────────────────────────────────────────────

export async function createTask({ subject, body, dueDate, priority = "MEDIUM", contactId }) {
  log(`Creating task: ${subject}`);

  // Try CRM v3 API first, fall back to Engagements v1 if scope error
  try {
    return await createTaskV3({ subject, body, dueDate, priority, contactId });
  } catch (err) {
    if (err.message.includes("403") || err.message.includes("MISSING_SCOPES")) {
      log("CRM v3 tasks scope unavailable, falling back to Engagements v1...");
      return await createTaskV1({ subject, body, dueDate, priority, contactId });
    }
    throw err;
  }
}

async function createTaskV3({ subject, body, dueDate, priority, contactId }) {
  const properties = {
    hs_task_subject: subject,
    hs_task_body: body || "",
    hs_task_status: "NOT_STARTED",
    hs_task_priority: priority,
    hubspot_owner_id: ANONNO_OWNER_ID,
  };

  if (dueDate) {
    properties.hs_timestamp = new Date(dueDate).getTime().toString();
  }

  const payload = { properties };

  if (contactId) {
    payload.associations = [
      {
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }],
      },
    ];
  }

  const result = await hubspotPost("/crm/v3/objects/tasks", payload);
  log(`Task created (v3): ${result.id}`);
  return result;
}

async function createTaskV1({ subject, body, dueDate, priority, contactId }) {
  const timestamp = dueDate ? new Date(dueDate).getTime() : Date.now() + 24 * 60 * 60 * 1000;

  const payload = {
    engagement: {
      active: true,
      ownerId: Number(ANONNO_OWNER_ID),
      type: "TASK",
      timestamp,
    },
    associations: {
      contactIds: contactId ? [Number(contactId)] : [],
      companyIds: [],
      dealIds: [],
      ownerIds: [],
    },
    metadata: {
      body: body || "",
      subject: subject,
      status: "NOT_STARTED",
      forObjectType: "CONTACT",
      priority: priority,
    },
  };

  const result = await hubspotPost("/engagements/v1/engagements", payload);
  log(`Task created (v1): ${result.engagement?.id}`);
  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchAssociatedContacts(objectType, objectId) {
  try {
    const data = await hubspotGet(
      `/crm/v3/objects/${objectType}/${objectId}/associations/contacts`
    );
    return (data.results || []).map((r) => String(r.id));
  } catch {
    return [];
  }
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 10 ? `+${digits}` : null;
}

export { normalizePhone };
