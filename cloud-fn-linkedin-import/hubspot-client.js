/**
 * HubSpot CRM operations — dedupe, batch create, associate.
 *
 * Uses HubSpot CRM v3 REST API with a private app token.
 * Rate-limited to stay under 10 req/sec for private apps.
 */

import { normalizeCompanyName } from "./csv-parser.js";

const API_BASE = "https://api.hubapi.com";
const BATCH_SIZE = 100;
const SEARCH_CONCURRENCY = 5;
const RATE_DELAY_MS = 150;
const MAX_RETRIES = 3;
const DEFAULT_OWNER_ID = "161300089"; // Anonno Islam

const log = (...args) => console.log("[hubspot]", ...args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP helpers with 429 retry ─────────────────────────────────────────────

async function hubspotFetch(url, options, retries = MAX_RETRIES) {
  const res = await fetch(url, options);

  if (res.status === 429 && retries > 0) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "1", 10);
    log(`Rate limited, waiting ${retryAfter}s (${retries} retries left)...`);
    await sleep(retryAfter * 1000);
    return hubspotFetch(url, options, retries - 1);
  }

  return res;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function hubspotPost(token, path, body) {
  const res = await hubspotFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function hubspotPut(token, path) {
  const res = await hubspotFetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot PUT ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Search operations ───────────────────────────────────────────────────────

async function searchContactByEmail(token, email) {
  if (!email) return null;
  try {
    const data = await hubspotPost(token, "/crm/v3/objects/contacts/search", {
      filterGroups: [
        { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
      ],
      properties: ["firstname", "lastname", "email", "company", "jobtitle"],
      limit: 1,
    });
    return data.results?.[0] || null;
  } catch {
    return null;
  }
}

async function searchContactByName(token, firstName, lastName, company) {
  if (!firstName && !lastName) return null;
  const query = [firstName, lastName].filter(Boolean).join(" ");
  try {
    const data = await hubspotPost(token, "/crm/v3/objects/contacts/search", {
      query,
      properties: ["firstname", "lastname", "email", "company", "jobtitle"],
      limit: 10,
    });

    if (!data.results?.length) return null;

    // Client-side match: same company (normalized)
    const { normalized: targetCompany } = normalizeCompanyName(company);
    if (!targetCompany) return data.results[0]; // No company to match on, take first name match

    return data.results.find((c) => {
      const { normalized } = normalizeCompanyName(c.properties?.company);
      return normalized === targetCompany;
    }) || null;
  } catch {
    return null;
  }
}

async function searchCompanyByName(token, companyName) {
  if (!companyName) return null;
  const { normalized: target } = normalizeCompanyName(companyName);
  if (!target) return null;

  try {
    const data = await hubspotPost(token, "/crm/v3/objects/companies/search", {
      query: companyName,
      properties: ["name", "domain", "linkedin_company_page", "industry"],
      limit: 5,
    });

    if (!data.results?.length) return null;

    // Client-side match on normalized name
    return data.results.find((c) => {
      const { normalized } = normalizeCompanyName(c.properties?.name);
      return normalized === target;
    }) || null;
  } catch {
    return null;
  }
}

// ── Batch create operations ─────────────────────────────────────────────────

async function batchCreateCompanies(token, companies) {
  const created = [];

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((c) => ({
      properties: {
        name: c.display,
        linkedin_company_page: c.companyLinkedinUrl || "",
        industry: c.industry || "",
        city: c.city || "",
        state: c.state || "",
        country: c.country || "",
        hubspot_owner_id: DEFAULT_OWNER_ID,
        hs_lead_status: "NEW",
      },
    }));

    try {
      const data = await hubspotPost(token, "/crm/v3/objects/companies/batch/create", { inputs });
      if (data.results) created.push(...data.results);
      if (data.errors?.length) {
        log(`Batch create companies: ${data.errors.length} errors`);
      }
    } catch (err) {
      log(`Batch create companies failed: ${err.message}`);
    }

    if (i + BATCH_SIZE < companies.length) await sleep(RATE_DELAY_MS);
  }

  return created;
}

async function batchCreateContacts(token, contacts) {
  const created = [];

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((c) => ({
      properties: {
        firstname: c.firstName || "",
        lastname: c.lastName || "",
        email: c.email || "",
        phone: c.phone || "",
        jobtitle: c.title || "",
        company: c.company || "",
        city: c.city || "",
        state: c.state || "",
        country: c.country || "",
        hs_linkedin_url: c.linkedinUrl || "",
        hubspot_owner_id: DEFAULT_OWNER_ID,
        hs_lead_status: "NEW",
      },
    }));

    try {
      const data = await hubspotPost(token, "/crm/v3/objects/contacts/batch/create", { inputs });
      if (data.results) created.push(...data.results);
      if (data.errors?.length) {
        log(`Batch create contacts: ${data.errors.length} errors`);
      }
    } catch (err) {
      log(`Batch create contacts failed: ${err.message}`);
    }

    if (i + BATCH_SIZE < contacts.length) await sleep(RATE_DELAY_MS);
  }

  return created;
}

// ── Association ─────────────────────────────────────────────────────────────

async function associateContactToCompany(token, contactId, companyId) {
  try {
    await hubspotPut(
      token,
      `/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`
    );
  } catch (err) {
    log(`Association failed (contact ${contactId} → company ${companyId}): ${err.message}`);
  }
}

// ── Master orchestrator ─────────────────────────────────────────────────────

/**
 * Deduplicate CSV rows against HubSpot and create new records.
 *
 * @param {string} token   HubSpot private app token
 * @param {object[]} rows  parsed CSV rows from csv-parser.js
 * @returns {object} stats: totalRows, newContacts, skippedContacts, newCompanies, matchedCompanies, errors
 */
export async function dedupeAndImport(token, rows) {
  const stats = {
    totalRows: rows.length,
    newContacts: 0,
    skippedContacts: 0,
    newCompanies: 0,
    matchedCompanies: 0,
    errors: 0,
  };

  // Phase 1: Build company cache — search each unique company once
  const companyCache = new Map(); // normalized name → { hubspotId, display, ...row fields }
  const uniqueCompanies = new Map(); // normalized → first row with that company

  for (const row of rows) {
    if (!row.company) continue;
    const { normalized, display } = normalizeCompanyName(row.company);
    if (normalized && !uniqueCompanies.has(normalized)) {
      uniqueCompanies.set(normalized, { display, ...row });
    }
  }

  log(`Searching ${uniqueCompanies.size} unique companies...`);
  const companyEntries = [...uniqueCompanies.entries()];

  for (let i = 0; i < companyEntries.length; i += SEARCH_CONCURRENCY) {
    const batch = companyEntries.slice(i, i + SEARCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ([normalized, info]) => {
        const existing = await searchCompanyByName(token, info.display);
        return [normalized, existing, info];
      })
    );

    for (const [normalized, existing, info] of results) {
      if (existing) {
        companyCache.set(normalized, { hubspotId: existing.id, display: info.display, existing: true });
        stats.matchedCompanies++;
      } else {
        companyCache.set(normalized, {
          hubspotId: null,
          display: info.display,
          companyLinkedinUrl: info.companyLinkedinUrl,
          industry: info.industry,
          city: info.city,
          state: info.state,
          country: info.country,
          existing: false,
        });
      }
    }

    if (i + SEARCH_CONCURRENCY < companyEntries.length) await sleep(RATE_DELAY_MS);
  }

  // Phase 2: Dedupe contacts
  log(`Deduping ${rows.length} contacts...`);
  const newContactRows = [];

  for (let i = 0; i < rows.length; i += SEARCH_CONCURRENCY) {
    const batch = rows.slice(i, i + SEARCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (row) => {
        // Try email first, then name+company
        let existing = await searchContactByEmail(token, row.email);
        if (!existing) {
          existing = await searchContactByName(token, row.firstName, row.lastName, row.company);
        }
        return { row, existing };
      })
    );

    for (const { row, existing } of results) {
      if (existing) {
        stats.skippedContacts++;
      } else {
        newContactRows.push(row);
      }
    }

    if (i + SEARCH_CONCURRENCY < rows.length) await sleep(RATE_DELAY_MS);
  }

  // Phase 3: Batch create new companies
  const newCompanyList = [...companyCache.values()].filter((c) => !c.existing);
  if (newCompanyList.length > 0) {
    log(`Creating ${newCompanyList.length} new companies...`);
    const created = await batchCreateCompanies(token, newCompanyList);

    // Update cache with new IDs
    for (const result of created) {
      const { normalized } = normalizeCompanyName(result.properties?.name);
      if (normalized && companyCache.has(normalized)) {
        companyCache.get(normalized).hubspotId = result.id;
      }
    }
    stats.newCompanies = created.length;
  }

  // Phase 4: Batch create new contacts
  if (newContactRows.length > 0) {
    log(`Creating ${newContactRows.length} new contacts...`);
    const created = await batchCreateContacts(token, newContactRows);
    stats.newContacts = created.length;

    // Phase 5: Associate contacts to companies
    log("Creating contact → company associations...");
    for (let i = 0; i < created.length; i++) {
      const contact = created[i];
      const row = newContactRows[i];
      if (!row?.company) continue;

      const { normalized } = normalizeCompanyName(row.company);
      const cached = companyCache.get(normalized);
      if (cached?.hubspotId) {
        await associateContactToCompany(token, contact.id, cached.hubspotId);
        await sleep(RATE_DELAY_MS);
      }
    }
  }

  stats.errors = stats.totalRows - stats.newContacts - stats.skippedContacts;
  if (stats.errors < 0) stats.errors = 0;

  log(`Done: ${stats.newContacts} created, ${stats.skippedContacts} skipped, ${stats.newCompanies} new companies`);
  return stats;
}
