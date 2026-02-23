#!/usr/bin/env node

/**
 * Remote MCP Server for QuickBooks Online (Cloud Run deployment)
 *
 * Streamable HTTP transport for use with claude.ai browser interface.
 * Tokens persisted in Google Cloud Storage bucket.
 * Credentials passed as environment variables.
 *
 * Environment variables:
 *   QBO_CLIENT_ID      — Intuit OAuth client ID
 *   QBO_CLIENT_SECRET   — Intuit OAuth client secret
 *   QBO_REALM_ID        — QuickBooks company ID
 *   GCS_BUCKET          — GCS bucket name for token storage
 *   AUTH_TOKEN           — Bearer token for authenticating requests
 *   QBO_INITIAL_TOKENS  — Base64-encoded JSON tokens (fallback for first deploy)
 *   PORT                — HTTP port (default 8080, set by Cloud Run)
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "8080", 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const GCS_BUCKET = process.env.GCS_BUCKET || "packouts-qbo-tokens";
const GCS_TOKEN_PATH = "tokens.json";

const API_BASE = "https://quickbooks.api.intuit.com";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "75";

const log = (...args) => console.log("[mcp-qbo]", ...args);

// ---------------------------------------------------------------------------
// Credentials (from env vars — never change)
// ---------------------------------------------------------------------------

function getCredentials() {
  const client_id = process.env.QBO_CLIENT_ID;
  const client_secret = process.env.QBO_CLIENT_SECRET;
  const realm_id = process.env.QBO_REALM_ID;

  if (!client_id || !client_secret || !realm_id) {
    throw new Error(
      "Missing QBO_CLIENT_ID, QBO_CLIENT_SECRET, or QBO_REALM_ID environment variable"
    );
  }

  return { client_id, client_secret, realm_id };
}

// ---------------------------------------------------------------------------
// Token persistence via GCS
// ---------------------------------------------------------------------------

const storage = new Storage();
let cachedTokens = null;

async function loadTokensFromGCS() {
  try {
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(GCS_TOKEN_PATH);
    const [contents] = await file.download();
    const tokens = JSON.parse(contents.toString("utf-8"));
    log("Loaded tokens from GCS");
    return tokens;
  } catch (err) {
    log("GCS token load failed:", err.message);
    return null;
  }
}

async function saveTokensToGCS(tokens) {
  try {
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(GCS_TOKEN_PATH);
    await file.save(JSON.stringify(tokens, null, 2), {
      contentType: "application/json",
    });
    log("Saved tokens to GCS");
  } catch (err) {
    log("GCS token save failed:", err.message);
  }
}

async function loadTokens() {
  if (cachedTokens) return cachedTokens;

  // Try GCS first
  cachedTokens = await loadTokensFromGCS();
  if (cachedTokens) return cachedTokens;

  // Fallback: base64-encoded env var (first deploy)
  const initial = process.env.QBO_INITIAL_TOKENS;
  if (initial) {
    try {
      cachedTokens = JSON.parse(Buffer.from(initial, "base64").toString("utf-8"));
      log("Loaded tokens from QBO_INITIAL_TOKENS env var");
      // Persist to GCS immediately
      await saveTokensToGCS(cachedTokens);
      return cachedTokens;
    } catch (err) {
      log("Failed to parse QBO_INITIAL_TOKENS:", err.message);
    }
  }

  throw new Error("No QBO tokens available — upload to GCS or set QBO_INITIAL_TOKENS");
}

async function saveTokens(tokens) {
  tokens.saved_at = Date.now() / 1000;
  cachedTokens = tokens;
  await saveTokensToGCS(tokens);
}

// ---------------------------------------------------------------------------
// QBO API helpers (same logic as index.js)
// ---------------------------------------------------------------------------

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
  await saveTokens(newTokens);
  log("Token refreshed successfully.");
  return newTokens;
}

async function getAccessToken() {
  const creds = getCredentials();
  let tokens = await loadTokens();

  const savedAt = tokens.saved_at || 0;
  const expiresIn = tokens.expires_in || 3600;
  const elapsed = Date.now() / 1000 - savedAt;

  if (elapsed >= expiresIn - 120) {
    tokens = await refreshTokens(creds, tokens);
  }

  return { accessToken: tokens.access_token, realmId: creds.realm_id, creds, tokens };
}

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

async function qboQuery(sql) {
  const allEntities = [];
  let startPosition = 1;
  const pageSize = 1000;

  while (true) {
    const pagedSql = `${sql} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
    const data = await qboGet("/query", { query: pagedSql });

    const qr = data.QueryResponse || {};
    const entityKey = Object.keys(qr).find((k) => Array.isArray(qr[k]));
    if (!entityKey) break;

    const entities = qr[entityKey];
    allEntities.push(...entities);

    if (entities.length < pageSize) break;
    startPosition += pageSize;
  }

  return allEntities;
}

async function qboReport(reportName, params = {}) {
  return qboGet(`/reports/${reportName}`, params);
}

// ---------------------------------------------------------------------------
// Tool implementations (same as index.js)
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

  for (const b of Object.values(buckets)) {
    b.sort((a, b) => b.days_outstanding - a.days_outstanding);
  }

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
  if (as_of_date) params.date_macro = undefined;
  if (as_of_date) params.end_date = as_of_date;
  if (accounting_method) params.accounting_method = accounting_method;
  return qboReport("BalanceSheet", params);
}

async function toolSearchInvoices({ customer_name, start_date, end_date, status, min_amount, max_amount }) {
  const clauses = [];

  if (start_date) clauses.push(`TxnDate >= '${start_date}'`);
  if (end_date) clauses.push(`TxnDate <= '${end_date}'`);

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

  if (customer_name) {
    const needle = customer_name.toLowerCase();
    invoices = invoices.filter((inv) =>
      (inv.CustomerRef?.name || "").toLowerCase().includes(needle)
    );
  }

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

async function toolQboQuery({ sql }) {
  return qboQuery(sql);
}

// ---------------------------------------------------------------------------
// Register all tools on an MCP server instance
// ---------------------------------------------------------------------------

function registerTools(server) {
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
        const result = await toolQboQuery(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Express app + Streamable HTTP transport
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// --- CORS for claude.ai browser client ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// --- Health check (no auth required) ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mcp-qbo" });
});

// --- Bearer token auth middleware ---
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) {
    return next();
  }

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

  // No session ID — new initialization request
  log("New Streamable HTTP session");

  const id = randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => id,
  });

  const server = new McpServer({
    name: "qbo",
    version: "1.0.0",
  });
  registerTools(server);

  await server.connect(transport);
  sessions.set(id, { transport, server });

  transport.onclose = () => {
    log(`Session closed: ${id}`);
    sessions.delete(id);
  };

  await transport.handleRequest(req, res, req.body);
});

// --- Legacy SSE endpoint (backward compat) ---
app.get("/sse", requireAuth, async (req, res) => {
  log("Legacy SSE redirect → use /mcp endpoint");
  res.status(404).json({
    error: "Legacy SSE endpoint removed. Use /mcp with Streamable HTTP transport.",
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  getCredentials();

  await loadTokens();
  log("Tokens loaded successfully");

  app.listen(PORT, () => {
    log(`Remote MCP server listening on port ${PORT}`);
    log(`Streamable HTTP endpoint: /mcp`);
    log(`Health check: GET /health`);
  });
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
