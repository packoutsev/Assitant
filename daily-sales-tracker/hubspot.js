/**
 * HubSpot API module.
 *
 * Fetches today's calls for Anonno (owner ID 161300089) and builds the
 * active-deal contact set used for BD vs Coordination classification.
 *
 * Environment variables:
 *   HUBSPOT_API_TOKEN — HubSpot Private App token
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

function getTodayRangeMST() {
  const now = new Date();
  // Get today's date in MST
  const mstStr = now.toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  // Start of day MST = midnight MST = 07:00 UTC
  const startUTC = new Date(`${mstStr}T00:00:00-07:00`);
  const endUTC = new Date(`${mstStr}T23:59:59.999-07:00`);
  return {
    startMs: startUTC.getTime(),
    endMs: endUTC.getTime(),
    dateStr: mstStr,
  };
}

// ── Fetch today's calls ──────────────────────────────────────────────────────

export async function fetchTodaysCalls() {
  const { startMs, endMs } = getTodayRangeMST();
  log(`Fetching calls for owner ${ANONNO_OWNER_ID}, range ${startMs}-${endMs}`);

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
    ],
    sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
    limit: 100,
  });

  const calls = data.results || [];
  log(`Found ${calls.length} calls`);

  // Fetch associated contacts for each call
  const callsWithContacts = await Promise.all(
    calls.map(async (call) => {
      const contactIds = await fetchCallContacts(call.id);
      return {
        id: call.id,
        title: call.properties.hs_call_title,
        duration: call.properties.hs_call_duration,
        timestamp: call.properties.hs_timestamp,
        direction: call.properties.hs_call_direction,
        status: call.properties.hs_call_status,
        contactIds,
        source: "hubspot",
      };
    })
  );

  return callsWithContacts;
}

async function fetchCallContacts(callId) {
  try {
    const data = await hubspotGet(
      `/crm/v3/objects/calls/${callId}/associations/contacts`
    );
    return (data.results || []).map((r) => String(r.id));
  } catch {
    return [];
  }
}

// ── Fetch active-deal contact IDs (for BD classification) ────────────────────

export async function fetchActiveDealContactIds() {
  log("Fetching active deals for BD classification...");

  // Search for deals owned by Anonno that are NOT in closed stages
  // HubSpot closed stages: closedwon, closedlost
  const data = await hubspotPost("/crm/v3/objects/deals/search", {
    filterGroups: [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "EQ", value: ANONNO_OWNER_ID },
          { propertyName: "dealstage", operator: "NOT_IN", values: ["closedwon", "closedlost"] },
        ],
      },
    ],
    properties: ["dealname", "dealstage"],
    limit: 100,
  });

  const deals = data.results || [];
  log(`Found ${deals.length} active deals`);

  // For each deal, get associated contacts
  const contactIdSet = new Set();
  const dealNames = new Map(); // contactId -> dealName for display

  await Promise.all(
    deals.map(async (deal) => {
      try {
        const assocData = await hubspotGet(
          `/crm/v3/objects/deals/${deal.id}/associations/contacts`
        );
        for (const r of assocData.results || []) {
          const cid = String(r.id);
          contactIdSet.add(cid);
          dealNames.set(cid, deal.properties.dealname);
        }
      } catch {
        // Skip deals where association fetch fails
      }
    })
  );

  log(`Active deal contact IDs: ${contactIdSet.size}`);
  return { contactIdSet, dealNames };
}

// ── Fetch contact phone numbers (for OpenPhone matching) ─────────────────────

export async function fetchContactPhones(contactIds) {
  if (contactIds.size === 0) return new Map();

  const ids = [...contactIds].slice(0, 100);
  const phoneMap = new Map(); // phone -> contactId

  // Batch fetch contacts
  const data = await hubspotPost("/crm/v3/objects/contacts/batch/read", {
    inputs: ids.map((id) => ({ id })),
    properties: ["phone", "mobilephone", "firstname", "lastname"],
  });

  for (const contact of data.results || []) {
    const cid = String(contact.id);
    const name = [contact.properties.firstname, contact.properties.lastname]
      .filter(Boolean)
      .join(" ");
    for (const prop of ["phone", "mobilephone"]) {
      const phone = normalizePhone(contact.properties[prop]);
      if (phone) {
        phoneMap.set(phone, { contactId: cid, name });
      }
    }
  }

  return phoneMap;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 10 ? `+${digits}` : null;
}

export { getTodayRangeMST };
