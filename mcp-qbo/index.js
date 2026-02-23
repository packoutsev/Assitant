#!/usr/bin/env node

/**
 * MCP Server for QuickBooks Online
 *
 * Exposes QBO data (invoices, reports, customers) to Claude Code via
 * the Model Context Protocol. Reuses existing credential/token files
 * from qbo_aging.py — no re-auth needed.
 *
 * Token files:
 *   ~/.qbo_credentials.json  — client_id, client_secret, realm_id
 *   ~/.qbo_tokens.json       — access/refresh tokens (auto-refreshed)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOME = homedir();
const CREDENTIALS_PATH = join(HOME, ".qbo_credentials.json");
const TOKENS_PATH = join(HOME, ".qbo_tokens.json");
const API_BASE = "https://quickbooks.api.intuit.com";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "75";

const log = (...args) => console.error("[mcp-qbo]", ...args);

// ---------------------------------------------------------------------------
// Credential & token helpers
// ---------------------------------------------------------------------------

function loadCredentials() {
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read QBO credentials from ${CREDENTIALS_PATH}. Run qbo_aging.py --setup first.`
    );
  }
}

function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read QBO tokens from ${TOKENS_PATH}. Run qbo_aging.py --auth first.`
    );
  }
}

function saveTokens(tokens) {
  tokens.saved_at = Date.now() / 1000;
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

async function refreshTokens(creds, tokens) {
  log("Refreshing access token...");
  const basicAuth = Buffer.from(
    `${creds.client_id}:${creds.client_secret}`
  ).toString("base64");

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${body}`);
  }

  const newTokens = await resp.json();
  saveTokens(newTokens);
  log("Token refreshed successfully.");
  return newTokens;
}

/** Return a valid access token, refreshing if within 2 min of expiry. */
async function getAccessToken() {
  const creds = loadCredentials();
  let tokens = loadTokens();

  const savedAt = tokens.saved_at || 0;
  const expiresIn = tokens.expires_in || 3600;
  const elapsed = Date.now() / 1000 - savedAt;

  if (elapsed >= expiresIn - 120) {
    tokens = await refreshTokens(creds, tokens);
  }

  return { accessToken: tokens.access_token, realmId: creds.realm_id, creds, tokens };
}

// ---------------------------------------------------------------------------
// QBO API helpers
// ---------------------------------------------------------------------------

/**
 * Make an authenticated GET request to QBO API.
 * Auto-retries once on 401 after refreshing the token.
 */
async function qboGet(path, params = {}, _retried = false) {
  const { accessToken, realmId, creds, tokens } = await getAccessToken();
  const url = new URL(`${API_BASE}/v3/company/${realmId}${path}`);
  url.searchParams.set("minorversion", MINOR_VERSION);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (resp.status === 401 && !_retried) {
    log("Got 401, refreshing token and retrying...");
    await refreshTokens(creds, tokens);
    return qboGet(path, params, true);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`QBO API error ${resp.status}: ${body}`);
  }

  return resp.json();
}

/**
 * Run a QBO SQL query with auto-pagination.
 * Returns all matching entities.
 */
async function qboQuery(sql) {
  const allEntities = [];
  let startPosition = 1;
  const pageSize = 1000;

  while (true) {
    const pagedSql = `${sql} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
    const data = await qboGet("/query", { query: pagedSql });

    const qr = data.QueryResponse || {};
    // QBO nests results under the entity type key — grab the first array found
    const entityKey = Object.keys(qr).find(
      (k) => Array.isArray(qr[k])
    );
    if (!entityKey) break;

    const entities = qr[entityKey];
    allEntities.push(...entities);

    if (entities.length < pageSize) break;
    startPosition += pageSize;
  }

  return allEntities;
}

/**
 * Fetch a QBO report (P&L, Balance Sheet, etc.)
 */
async function qboReport(reportName, params = {}) {
  return qboGet(`/reports/${reportName}`, params);
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function agingBucket(daysOutstanding) {
  if (daysOutstanding <= 0) return "Current";
  if (daysOutstanding <= 30) return "1-30";
  if (daysOutstanding <= 60) return "31-60";
  if (daysOutstanding <= 90) return "61-90";
  return "90+";
}

async function toolGetArAging() {
  const invoices = await qboQuery(
    "SELECT * FROM Invoice WHERE Balance > '0' ORDERBY DueDate"
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = { Current: [], "1-30": [], "31-60": [], "61-90": [], "90+": [] };

  for (const inv of invoices) {
    const customer = inv.CustomerRef?.name || "Unknown";
    const docNumber = inv.DocNumber || "N/A";
    const txnDate = inv.TxnDate || "";
    const dueDate = inv.DueDate || txnDate;
    const balance = parseFloat(inv.Balance || 0);

    const dueDateObj = dueDate ? new Date(dueDate + "T00:00:00") : today;
    const daysOutstanding = Math.floor(
      (today - dueDateObj) / (1000 * 60 * 60 * 24)
    );

    const bucket = agingBucket(daysOutstanding);
    buckets[bucket].push({
      customer,
      invoice_num: docNumber,
      invoice_date: txnDate,
      due_date: dueDate,
      balance,
      days_outstanding: daysOutstanding,
      bucket,
    });
  }

  // Sort each bucket by days outstanding descending
  for (const b of Object.values(buckets)) {
    b.sort((a, b) => b.days_outstanding - a.days_outstanding);
  }

  // Compute summary
  const summary = {};
  let grandTotal = 0;
  let grandCount = 0;
  for (const [name, items] of Object.entries(buckets)) {
    const total = items.reduce((s, i) => s + i.balance, 0);
    summary[name] = { count: items.length, total: Math.round(total * 100) / 100 };
    grandTotal += total;
    grandCount += items.length;
  }
  summary.grand_total = { count: grandCount, total: Math.round(grandTotal * 100) / 100 };

  return { as_of: today.toISOString().slice(0, 10), summary, buckets };
}

async function toolGetProfitAndLoss({ start_date, end_date, accounting_method }) {
  const params = {};
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;
  if (accounting_method) params.accounting_method = accounting_method;
  return qboReport("ProfitAndLoss", params);
}

async function toolGetBalanceSheet({ as_of_date, accounting_method }) {
  const params = {};
  if (as_of_date) params.date_macro = undefined; // clear default
  if (as_of_date) params.end_date = as_of_date;
  if (accounting_method) params.accounting_method = accounting_method;
  return qboReport("BalanceSheet", params);
}

async function toolSearchInvoices({ customer_name, start_date, end_date, status, min_amount, max_amount }) {
  const clauses = [];

  if (customer_name) {
    // QBO doesn't support LIKE on CustomerRef.name directly, so we fetch and filter
  }
  if (start_date) clauses.push(`TxnDate >= '${start_date}'`);
  if (end_date) clauses.push(`TxnDate <= '${end_date}'`);

  // Status filter: map friendly names to QBO balance filters
  if (status === "open" || status === "unpaid") {
    clauses.push("Balance > '0'");
  } else if (status === "paid" || status === "closed") {
    clauses.push("Balance = '0'");
  }

  if (min_amount) clauses.push(`TotalAmt >= '${min_amount}'`);
  if (max_amount) clauses.push(`TotalAmt <= '${max_amount}'`);

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const sql = `SELECT * FROM Invoice${where} ORDERBY TxnDate DESC`;
  let invoices = await qboQuery(sql);

  // Client-side customer name filter if specified
  if (customer_name) {
    const needle = customer_name.toLowerCase();
    invoices = invoices.filter((inv) =>
      (inv.CustomerRef?.name || "").toLowerCase().includes(needle)
    );
  }

  // Return a clean summary for each invoice
  return invoices.map((inv) => ({
    id: inv.Id,
    doc_number: inv.DocNumber,
    customer: inv.CustomerRef?.name,
    txn_date: inv.TxnDate,
    due_date: inv.DueDate,
    total: parseFloat(inv.TotalAmt || 0),
    balance: parseFloat(inv.Balance || 0),
    status: parseFloat(inv.Balance || 0) > 0 ? "Open" : "Paid",
    email_status: inv.EmailStatus,
  }));
}

async function toolGetInvoice({ invoice_id }) {
  const data = await qboGet(`/invoice/${invoice_id}`);
  const inv = data.Invoice;
  if (!inv) throw new Error(`Invoice ${invoice_id} not found`);

  const lines = (inv.Line || [])
    .filter((l) => l.DetailType === "SalesItemLineDetail")
    .map((l) => ({
      description: l.Description,
      quantity: l.SalesItemLineDetail?.Qty,
      unit_price: l.SalesItemLineDetail?.UnitPrice,
      amount: l.Amount,
      item: l.SalesItemLineDetail?.ItemRef?.name,
    }));

  return {
    id: inv.Id,
    doc_number: inv.DocNumber,
    customer: inv.CustomerRef?.name,
    txn_date: inv.TxnDate,
    due_date: inv.DueDate,
    total: parseFloat(inv.TotalAmt || 0),
    balance: parseFloat(inv.Balance || 0),
    status: parseFloat(inv.Balance || 0) > 0 ? "Open" : "Paid",
    email_status: inv.EmailStatus,
    billing_email: inv.BillEmail?.Address,
    ship_address: inv.ShipAddr,
    bill_address: inv.BillAddr,
    line_items: lines,
    memo: inv.PrivateNote,
    customer_memo: inv.CustomerMemo?.value,
  };
}

async function toolListCustomers() {
  const customers = await qboQuery(
    "SELECT * FROM Customer ORDERBY DisplayName"
  );

  return customers.map((c) => ({
    id: c.Id,
    display_name: c.DisplayName,
    company_name: c.CompanyName,
    balance: parseFloat(c.Balance || 0),
    primary_email: c.PrimaryEmailAddr?.Address,
    primary_phone: c.PrimaryPhone?.FreeFormNumber,
    mobile: c.Mobile?.FreeFormNumber,
    billing_address: c.BillAddr
      ? [c.BillAddr.Line1, c.BillAddr.City, c.BillAddr.CountrySubDivisionCode, c.BillAddr.PostalCode]
          .filter(Boolean)
          .join(", ")
      : null,
    active: c.Active,
    notes: c.Notes,
  }));
}

async function toolQuery({ sql }) {
  return qboQuery(sql);
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "qbo",
  version: "1.0.0",
});

// --- get_ar_aging ---
server.tool(
  "get_ar_aging",
  "A/R aging report with buckets (Current, 1-30, 31-60, 61-90, 90+). Returns all open invoices grouped by aging bucket with a summary.",
  {},
  async () => {
    try {
      const result = await toolGetArAging();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// --- get_profit_and_loss ---
server.tool(
  "get_profit_and_loss",
  "Profit & Loss report for a date range. Defaults to current fiscal year if no dates provided.",
  {
    start_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to start of fiscal year."),
    end_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    accounting_method: z
      .enum(["Accrual", "Cash"])
      .optional()
      .describe("Accounting method. Defaults to company setting."),
  },
  async (args) => {
    try {
      const result = await toolGetProfitAndLoss(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// --- get_balance_sheet ---
server.tool(
  "get_balance_sheet",
  "Balance Sheet report as of a specific date. Defaults to today if no date provided.",
  {
    as_of_date: z.string().optional().describe("Report as-of date (YYYY-MM-DD). Defaults to today."),
    accounting_method: z
      .enum(["Accrual", "Cash"])
      .optional()
      .describe("Accounting method. Defaults to company setting."),
  },
  async (args) => {
    try {
      const result = await toolGetBalanceSheet(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// --- search_invoices ---
server.tool(
  "search_invoices",
  "Search invoices with filters. Returns a summary list of matching invoices.",
  {
    customer_name: z.string().optional().describe("Filter by customer name (partial match, case-insensitive)."),
    start_date: z.string().optional().describe("Invoices on or after this date (YYYY-MM-DD)."),
    end_date: z.string().optional().describe("Invoices on or before this date (YYYY-MM-DD)."),
    status: z
      .enum(["open", "paid", "all"])
      .optional()
      .describe("Filter by status: 'open' (unpaid), 'paid', or 'all'. Defaults to all."),
    min_amount: z.number().optional().describe("Minimum invoice total."),
    max_amount: z.number().optional().describe("Maximum invoice total."),
  },
  async (args) => {
    try {
      const result = await toolSearchInvoices(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// --- get_invoice ---
server.tool(
  "get_invoice",
  "Get full invoice detail by ID, including line items, addresses, and memo.",
  {
    invoice_id: z.string().describe("The QBO Invoice ID (numeric string)."),
  },
  async (args) => {
    try {
      const result = await toolGetInvoice(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// --- list_customers ---
server.tool(
  "list_customers",
  "List all customers with balances and contact info.",
  {},
  async () => {
    try {
      const result = await toolListCustomers();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// --- query ---
server.tool(
  "query",
  "Run an arbitrary QBO SQL query. Use for anything not covered by the other tools. Example: SELECT * FROM Estimate WHERE TotalAmt > '5000'",
  {
    sql: z
      .string()
      .describe(
        "QBO SQL query. Supported entities: Invoice, Estimate, Customer, Payment, Bill, Vendor, Item, Account, etc. " +
        "Syntax: SELECT * FROM EntityName WHERE field operator 'value' ORDERBY field [ASC|DESC]. " +
        "Do NOT include STARTPOSITION/MAXRESULTS — pagination is automatic."
      ),
  },
  async (args) => {
    try {
      const result = await toolQuery(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  // Validate credentials exist before starting
  try {
    loadCredentials();
    loadTokens();
  } catch (e) {
    log("ERROR:", e.message);
    process.exit(1);
  }

  log("Starting MCP server (QBO)...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio.");
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
