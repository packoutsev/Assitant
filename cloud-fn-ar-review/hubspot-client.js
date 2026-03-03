/**
 * HubSpot CRM lookup — last contact date per company.
 *
 * Uses HubSpot's CRM v3 search API with a private app token.
 * For each customer name, searches companies and pulls `notes_last_contacted`.
 */

const API_BASE = "https://api.hubapi.com";
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

/**
 * Search HubSpot for a company by name and return its last contacted date.
 * @param {string} token   HubSpot private app token
 * @param {string} name    customer/company name
 * @returns {string|null}  ISO date string or null
 */
async function searchCompany(token, name) {
  try {
    const res = await fetch(`${API_BASE}/crm/v3/objects/companies/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: name,
        properties: ["name", "notes_last_contacted"],
        limit: 1,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const company = data.results?.[0];
    if (!company) return null;

    const lastContacted = company.properties?.notes_last_contacted;
    if (!lastContacted) return null;

    const parsed = new Date(lastContacted);
    return isNaN(parsed) ? null : parsed.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Look up last contact dates for a list of unique customer names.
 *
 * @param {string} token          HubSpot private app token
 * @param {string[]} customerNames unique customer names
 * @returns {Promise<Map<string, string|null>>}  name → ISO date or null
 */
export async function getLastContactDates(token, customerNames) {
  const results = new Map();

  for (let i = 0; i < customerNames.length; i += BATCH_SIZE) {
    const batch = customerNames.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (name) => {
        const date = await searchCompany(token, name);
        return [name, date];
      })
    );

    for (const [name, date] of batchResults) {
      results.set(name, date);
    }

    if (i + BATCH_SIZE < customerNames.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return results;
}
