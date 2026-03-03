/**
 * Quo (OpenPhone) API module.
 *
 * Contact-driven approach: given a phone→contact map from HubSpot,
 * queries the Quo messages API per-contact for the current day.
 *
 * Env: QUO_API_KEY
 */

const API_BASE = "https://api.openphone.com/v1";
const ANONNO_PHONE_ID = "PNU43av5o0"; // Anonno's sales line

const log = (...args) => console.log("[quo]", ...args);

function getToken() {
  const token = process.env.QUO_API_KEY;
  if (!token) throw new Error("Missing QUO_API_KEY env var");
  return token;
}

async function quoGet(path) {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: getToken() },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Quo GET ${path} failed (${resp.status}): ${body}`);
  }
  return resp.json();
}

function toMST(isoStr) {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Fetch today's text messages for all contacts in phoneMap.
 *
 * @param {Map} phoneMap  phone → { contactId, name, company }
 * @param {object} range  { startISO, endISO }
 * @returns {Array} threads with messages
 */
export async function fetchQuoTexts(phoneMap, range) {
  const phones = [...phoneMap.keys()];
  log(`Querying Quo texts for ${phones.length} phone numbers...`);

  const threads = [];
  const BATCH_SIZE = 5;
  const BATCH_DELAY = 200; // ms between batches

  for (let i = 0; i < phones.length; i += BATCH_SIZE) {
    const batch = phones.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((phone) => fetchMessagesForPhone(phone, range))
    );

    for (let j = 0; j < batch.length; j++) {
      const phone = batch[j];
      const result = results[j];
      if (result.status === "fulfilled" && result.value.length > 0) {
        const contact = phoneMap.get(phone);
        threads.push({
          contactId: contact.contactId,
          contactName: contact.name,
          company: contact.company,
          phone,
          messages: result.value,
        });
      }
      // Silently skip failures and empty threads
    }

    // Delay between batches to avoid rate limits
    if (i + BATCH_SIZE < phones.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  log(`Found ${threads.length} active text threads`);
  return threads;
}

async function fetchMessagesForPhone(phone, range) {
  const encoded = encodeURIComponent(phone);
  const path = `/messages?phoneNumberId=${ANONNO_PHONE_ID}`
    + `&participants%5B0%5D=${encoded}`
    + `&createdAfter=${range.startISO}`
    + `&createdBefore=${range.endISO}`
    + `&maxResults=50`;

  const data = await quoGet(path);
  const messages = (data.data || []).map((m) => ({
    direction: m.direction,
    text: m.text || "",
    time: toMST(m.createdAt),
    timestamp: m.createdAt,
  }));

  // Sort chronologically (API returns newest first)
  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return messages;
}
