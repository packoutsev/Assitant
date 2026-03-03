#!/usr/bin/env node

/**
 * Remote MCP Server for Quo/OpenPhone (Cloud Run deployment)
 *
 * Streamable HTTP transport for use with claude.ai browser interface.
 * Credentials passed as environment variables.
 *
 * Environment variables:
 *   QUO_API_KEY   — OpenPhone/Quo API key
 *   AUTH_TOKEN     — Bearer token for authenticating requests (optional)
 *   PORT           — HTTP port (default 8080, set by Cloud Run)
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "8080", 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const API_BASE = "https://api.openphone.com/v1";

const log = (...args) => console.log("[mcp-quo]", ...args);

// ---------------------------------------------------------------------------
// Credential helper (from env var)
// ---------------------------------------------------------------------------

function getApiKey() {
  const key = process.env.QUO_API_KEY;
  if (!key) {
    throw new Error("Missing QUO_API_KEY environment variable");
  }
  return key;
}

// ---------------------------------------------------------------------------
// Quo API helpers
// ---------------------------------------------------------------------------

async function quoGet(path, params = {}) {
  const api_key = getApiKey();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(`${k}[]`, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: api_key,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Quo API ${resp.status}: ${body}`);
  }

  return resp.json();
}

async function quoPaginate(path, params = {}, maxPages = 10) {
  const allItems = [];
  const pageParams = { ...params };
  if (!pageParams.maxResults) pageParams.maxResults = 50;

  for (let page = 0; page < maxPages; page++) {
    const data = await quoGet(path, pageParams);

    if (data.data && Array.isArray(data.data)) {
      allItems.push(...data.data);
      if (!data.nextPageToken || data.data.length < pageParams.maxResults) break;
      pageParams.pageToken = data.nextPageToken;
    } else if (Array.isArray(data)) {
      allItems.push(...data);
      break;
    } else {
      allItems.push(data);
      break;
    }
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Phone number ID lookup (cache per session)
// ---------------------------------------------------------------------------

let _phoneNumbers = null;

async function getPhoneNumbers() {
  if (_phoneNumbers) return _phoneNumbers;
  const data = await quoGet("/phone-numbers");
  _phoneNumbers = data.data || [];
  return _phoneNumbers;
}

async function resolvePhoneNumberId(nameOrNumber) {
  const phones = await getPhoneNumbers();
  const needle = nameOrNumber.toLowerCase();
  const match = phones.find(
    (p) =>
      p.name?.toLowerCase().includes(needle) ||
      p.number?.includes(nameOrNumber) ||
      p.formattedNumber?.includes(nameOrNumber) ||
      p.id === nameOrNumber
  );
  return match?.id || null;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolListPhoneNumbers() {
  const phones = await getPhoneNumbers();
  return phones.map((p) => ({
    id: p.id,
    name: p.name,
    number: p.formattedNumber || p.number,
    symbol: p.symbol,
    users: (p.users || []).map((u) => ({
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      role: u.role,
    })),
  }));
}

async function toolListCalls({ phone_number_id, phone_number_name, participant, start_date, end_date, direction, limit }) {
  let phoneId = phone_number_id;
  if (!phoneId && phone_number_name) {
    phoneId = await resolvePhoneNumberId(phone_number_name);
    if (!phoneId) throw new Error(`Phone number not found: ${phone_number_name}`);
  }
  if (!phoneId) throw new Error("Provide phone_number_id or phone_number_name");

  if (participant) {
    const params = { phoneNumberId: phoneId, participants: [participant] };
    if (limit) params.maxResults = Math.min(limit, 100);
    if (start_date) params.createdAfter = new Date(start_date).toISOString();
    if (end_date) params.createdBefore = new Date(end_date + "T23:59:59").toISOString();

    const calls = await quoPaginate("/calls", params);
    let filtered = calls;
    if (direction) filtered = calls.filter((c) => c.direction?.toLowerCase() === direction.toLowerCase());
    return filtered.map(formatCall);
  }

  const convoParams = { phoneNumberId: phoneId, maxResults: 50 };
  const convos = await quoPaginate("/conversations", convoParams);

  let filteredConvos = convos;
  if (start_date) {
    filteredConvos = filteredConvos.filter((c) => (c.lastActivityAt || "") >= new Date(start_date).toISOString());
  }

  const allCalls = [];
  const seen = new Set();
  for (const conv of filteredConvos) {
    for (const num of (conv.participants || [])) {
      const callParams = { phoneNumberId: phoneId, participants: [num] };
      if (limit) callParams.maxResults = Math.min(limit, 100);
      if (start_date) callParams.createdAfter = new Date(start_date).toISOString();
      if (end_date) callParams.createdBefore = new Date(end_date + "T23:59:59").toISOString();

      try {
        const calls = await quoPaginate("/calls", callParams);
        for (const c of calls) {
          if (!seen.has(c.id)) { seen.add(c.id); allCalls.push(c); }
        }
      } catch { /* skip */ }
    }
  }

  allCalls.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  let result = allCalls;
  if (direction) result = allCalls.filter((c) => c.direction?.toLowerCase() === direction.toLowerCase());
  return result.map(formatCall);
}

function formatCall(c) {
  return {
    id: c.id,
    direction: c.direction,
    status: c.status,
    duration: c.duration,
    participants: c.participants,
    createdAt: c.createdAt,
    answeredAt: c.answeredAt,
    completedAt: c.completedAt,
    userId: c.userId,
    initiatedBy: c.initiatedBy,
    phoneNumberId: c.phoneNumberId,
  };
}

async function toolGetCallTranscript({ call_id }) {
  return quoGet(`/call-transcripts/${call_id}`);
}

async function toolGetCallSummary({ call_id }) {
  return quoGet(`/call-summaries/${call_id}`);
}

async function toolGetCallRecording({ call_id }) {
  return quoGet(`/call-recordings/${call_id}`);
}

async function toolListMessages({ phone_number_id, phone_number_name, participant, start_date, end_date, limit }) {
  let phoneId = phone_number_id;
  if (!phoneId && phone_number_name) {
    phoneId = await resolvePhoneNumberId(phone_number_name);
    if (!phoneId) throw new Error(`Phone number not found: ${phone_number_name}`);
  }
  if (!phoneId) throw new Error("Provide phone_number_id or phone_number_name");

  if (participant) {
    const params = { phoneNumberId: phoneId, participants: [participant] };
    if (limit) params.maxResults = Math.min(limit, 100);
    if (start_date) params.createdAfter = new Date(start_date).toISOString();
    if (end_date) params.createdBefore = new Date(end_date + "T23:59:59").toISOString();

    const messages = await quoPaginate("/messages", params);
    return messages.map(formatMessage);
  }

  const convoParams = { phoneNumberId: phoneId, maxResults: 50 };
  const convos = await quoPaginate("/conversations", convoParams);

  let filteredConvos = convos;
  if (start_date) {
    filteredConvos = filteredConvos.filter((c) => (c.lastActivityAt || "") >= new Date(start_date).toISOString());
  }

  const allMsgs = [];
  const seen = new Set();
  for (const conv of filteredConvos) {
    for (const num of (conv.participants || [])) {
      const msgParams = { phoneNumberId: phoneId, participants: [num] };
      if (limit) msgParams.maxResults = Math.min(limit, 100);
      if (start_date) msgParams.createdAfter = new Date(start_date).toISOString();
      if (end_date) msgParams.createdBefore = new Date(end_date + "T23:59:59").toISOString();

      try {
        const msgs = await quoPaginate("/messages", msgParams);
        for (const m of msgs) {
          if (!seen.has(m.id)) { seen.add(m.id); allMsgs.push(m); }
        }
      } catch { /* skip */ }
    }
  }

  allMsgs.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return allMsgs.map(formatMessage);
}

function formatMessage(m) {
  return {
    id: m.id,
    direction: m.direction,
    status: m.status,
    body: m.body || m.text,
    participants: m.participants,
    createdAt: m.createdAt,
    userId: m.userId,
    phoneNumberId: m.phoneNumberId,
  };
}

async function toolGetConversation({ phone_number_id, phone_number_name, external_number }) {
  let phoneId = phone_number_id;
  if (!phoneId && phone_number_name) {
    phoneId = await resolvePhoneNumberId(phone_number_name);
    if (!phoneId) throw new Error(`Phone number not found: ${phone_number_name}`);
  }

  const params = {};
  if (phoneId) params.phoneNumberId = phoneId;
  if (external_number) params.participants = external_number;

  return quoPaginate("/conversations", params);
}

async function toolListConversations({ phone_number_id, phone_number_name, limit }) {
  let phoneId = phone_number_id;
  if (!phoneId && phone_number_name) {
    phoneId = await resolvePhoneNumberId(phone_number_name);
    if (!phoneId) throw new Error(`Phone number not found: ${phone_number_name}`);
  }
  if (!phoneId) throw new Error("Provide phone_number_id or phone_number_name");

  const params = { phoneNumberId: phoneId };
  if (limit) params.maxResults = Math.min(limit, 100);

  return quoPaginate("/conversations", params);
}

async function toolSendMessage({ phone_number_id, phone_number_name, to, text }) {
  let phoneId = phone_number_id;
  if (!phoneId && phone_number_name) {
    phoneId = await resolvePhoneNumberId(phone_number_name);
    if (!phoneId) throw new Error(`Phone number not found: ${phone_number_name}`);
  }
  if (!phoneId) throw new Error("Provide phone_number_id or phone_number_name");

  const api_key = getApiKey();
  const resp = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: {
      Authorization: api_key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: phoneId,
      to: [to],
      content: text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Quo API ${resp.status}: ${body}`);
  }

  return resp.json();
}

// ---------------------------------------------------------------------------
// Register all tools on an MCP server instance
// ---------------------------------------------------------------------------

function registerTools(server) {
  server.tool(
    "list_phone_numbers",
    "List all phone numbers in the Quo workspace with names, numbers, and assigned users.",
    {},
    async () => {
      try {
        const result = await toolListPhoneNumbers();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "list_calls",
    "List calls for a phone number. Filter by date range, direction, or specific participant. Without participant, finds all calls via conversations. Use phone_number_name (e.g., 'Sales', 'Diana') or phone_number_id.",
    {
      phone_number_id: z.string().optional().describe("Quo phone number ID (e.g., 'PNU43av5o0')"),
      phone_number_name: z.string().optional().describe("Phone line name to search (e.g., 'Sales', 'Diana', 'Main'). Resolved to ID automatically."),
      participant: z.string().optional().describe("External phone number to filter calls by (E.164 format, e.g., '+16027867267'). Faster than listing all."),
      start_date: z.string().optional().describe("Calls after this date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("Calls before this date (YYYY-MM-DD)"),
      direction: z.enum(["inbound", "outbound"]).optional().describe("Filter by call direction"),
      limit: z.number().optional().describe("Max results (default 50, max 100)"),
    },
    async (args) => {
      try {
        const result = await toolListCalls(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_call_transcript",
    "Get the full transcript for a call by call ID. Includes speaker labels and timestamps. Requires Business or Scale plan.",
    {
      call_id: z.string().describe("The Quo call ID"),
    },
    async (args) => {
      try {
        const result = await toolGetCallTranscript(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_call_summary",
    "Get the AI-generated summary for a call by call ID. Requires Business or Scale plan.",
    {
      call_id: z.string().describe("The Quo call ID"),
    },
    async (args) => {
      try {
        const result = await toolGetCallSummary(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_call_recording",
    "Get the recording URL for a call by call ID.",
    {
      call_id: z.string().describe("The Quo call ID"),
    },
    async (args) => {
      try {
        const result = await toolGetCallRecording(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "list_messages",
    "List text messages for a phone number. Filter by date range or specific participant. Without participant, finds messages via conversations.",
    {
      phone_number_id: z.string().optional().describe("Quo phone number ID"),
      phone_number_name: z.string().optional().describe("Phone line name (e.g., 'Sales', 'Diana', 'Main')"),
      participant: z.string().optional().describe("External phone number to get messages with (E.164 format, e.g., '+16024724990'). Faster than listing all."),
      start_date: z.string().optional().describe("Messages after this date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("Messages before this date (YYYY-MM-DD)"),
      limit: z.number().optional().describe("Max results (default 50, max 100)"),
    },
    async (args) => {
      try {
        const result = await toolListMessages(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "list_conversations",
    "List conversation threads for a phone number. Each conversation represents a thread with an external contact.",
    {
      phone_number_id: z.string().optional().describe("Quo phone number ID"),
      phone_number_name: z.string().optional().describe("Phone line name (e.g., 'Sales', 'Diana', 'Main')"),
      limit: z.number().optional().describe("Max results (default 50, max 100)"),
    },
    async (args) => {
      try {
        const result = await toolListConversations(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_conversation",
    "Find a conversation thread by phone number and external contact number. Useful for finding the thread with a specific person.",
    {
      phone_number_id: z.string().optional().describe("Quo phone number ID"),
      phone_number_name: z.string().optional().describe("Phone line name (e.g., 'Sales', 'Diana', 'Main')"),
      external_number: z.string().optional().describe("External phone number to find conversation with (e.g., '+16024724990')"),
    },
    async (args) => {
      try {
        const result = await toolGetConversation(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "send_message",
    "Send an SMS text message from a Quo phone number. IMPORTANT: Always confirm with the user before sending. Costs $0.01 per SMS segment.",
    {
      phone_number_id: z.string().optional().describe("Quo phone number ID to send from"),
      phone_number_name: z.string().optional().describe("Phone line name to send from (e.g., 'Sales', 'Main')"),
      to: z.string().describe("Recipient phone number in E.164 format (e.g., '+16024724990')"),
      text: z.string().describe("Message text to send"),
    },
    async (args) => {
      try {
        const result = await toolSendMessage(args);
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
  res.json({ status: "ok", service: "mcp-quo" });
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

  log("New Streamable HTTP session");

  const id = randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => id,
  });

  const server = new McpServer({
    name: "quo",
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

// --- Legacy SSE endpoint ---
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
  getApiKey(); // Fail fast if key missing

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
