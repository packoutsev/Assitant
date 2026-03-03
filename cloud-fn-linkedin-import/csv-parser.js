/**
 * LinkedIn Sales Navigator CSV parser.
 *
 * Handles standard Sales Nav export format. Normalizes column names,
 * strips company suffixes for dedup matching.
 */

// Legal suffixes to strip when normalizing company names for matching
const COMPANY_SUFFIXES = /\s*,?\s*\b(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|Co\.?|P\.C\.?|LP|L\.P\.)\s*$/i;

/**
 * Normalize a company name for dedup matching.
 * @returns {{ normalized: string, display: string }}
 */
export function normalizeCompanyName(name) {
  if (!name) return { normalized: "", display: "" };
  const display = name.trim();
  const stripped = display.replace(COMPANY_SUFFIXES, "").trim();
  return { normalized: stripped.toLowerCase(), display };
}

/**
 * Parse a single CSV line, respecting quoted fields.
 * Handles commas inside double-quoted strings.
 */
function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Normalize a header name: lowercase, trim, replace spaces/special chars with underscores.
 * e.g. "First Name" → "first_name", "Person Linkedin Url" → "person_linkedin_url"
 */
function normalizeHeader(h) {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Map of normalized header names to our canonical field names.
 * Sales Nav exports vary slightly across versions — this handles common variants.
 */
const FIELD_MAP = {
  first_name: "firstName",
  last_name: "lastName",
  title: "title",
  company: "company",
  company_name: "company",
  company_name_for_selected_saved_search: "company",
  person_linkedin_url: "linkedinUrl",
  linkedin_member_profile_url: "linkedinUrl",
  profile_url: "linkedinUrl",
  company_linkedin_url: "companyLinkedinUrl",
  company_url: "companyLinkedinUrl",
  industry: "industry",
  city: "city",
  geography: "city", // Some exports use "Geography" for location
  state: "state",
  country: "country",
  email: "email",
  email_address: "email",
  phone: "phone",
  phone_number: "phone",
  connected_on: "connectedOn",
  tags: "tags",
  lists: "tags",
  notes: "notes",
};

/**
 * Parse a Sales Navigator CSV export string into normalized row objects.
 *
 * @param {string} csvString  raw CSV content
 * @param {string} fileName   original file name (used to derive list name)
 * @returns {{ rows: object[], listName: string }}
 */
export function parseSalesNavCsv(csvString, fileName) {
  const listName = fileName.replace(/\.csv$/i, "").trim();

  const lines = csvString
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], listName };
  }

  // Parse header row
  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const raw = {};

    for (let j = 0; j < headers.length; j++) {
      raw[headers[j]] = (fields[j] || "").trim();
    }

    // Map to canonical fields
    const row = { listName };
    for (const [csvKey, canonicalKey] of Object.entries(FIELD_MAP)) {
      if (raw[csvKey] && !row[canonicalKey]) {
        row[canonicalKey] = raw[csvKey];
      }
    }

    // Normalize email to lowercase
    if (row.email) row.email = row.email.toLowerCase();

    // Skip rows with no name at all
    if (!row.firstName && !row.lastName) continue;

    rows.push(row);
  }

  return { rows, listName };
}
