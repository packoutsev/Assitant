#!/usr/bin/env node

/**
 * Remote MCP Server for Google Chat (Cloud Run deployment)
 *
 * Streamable HTTP transport for use with claude.ai browser interface.
 * Tokens persisted in Google Cloud Storage bucket.
 * Credentials passed as environment variables.
 *
 * Environment variables:
 *   GCHAT_CLIENT_ID      — Google OAuth client ID
 *   GCHAT_CLIENT_SECRET   — Google OAuth client secret
 *   GCS_BUCKET            — GCS bucket name for token storage
 *   GCHAT_INITIAL_TOKENS  — Base64-encoded JSON tokens (fallback for first deploy)
 *   PORT                  — HTTP port (default 8080, set by Cloud Run)
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
const GCS_BUCKET = process.env.GCS_BUCKET || "packouts-gchat-tokens";
const GCS_TOKEN_PATH = "tokens.json";

const API_BASE = "https://chat.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const log = (...args) => console.log("[mcp-gchat]", ...args);

// ---------------------------------------------------------------------------
// Credentials (from env vars — never change)
// ---------------------------------------------------------------------------

function getCredentials() {
  const client_id = process.env.GCHAT_CLIENT_ID;
  const client_secret = process.env.GCHAT_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    throw new Error(
      "Missing GCHAT_CLIENT_ID or GCHAT_CLIENT_SECRET environment variable"
    );
  }

  return { client_id, client_secret };
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
  const initial = process.env.GCHAT_INITIAL_TOKENS;
  if (initial) {
    try {
      cachedTokens = JSON.parse(Buffer.from(initial, "base64").toString("utf-8"));
      log("Loaded tokens from GCHAT_INITIAL_TOKENS env var");
      // Persist to GCS immediately
      await saveTokensToGCS(cachedTokens);
      return cachedTokens;
    } catch (err) {
      log("Failed to parse GCHAT_INITIAL_TOKENS:", err.message);
    }
  }

  throw new Error("No Google Chat tokens available — upload to GCS or set GCHAT_INITIAL_TOKENS");
}

async function saveTokens(newTokens, oldTokens) {
  // Google does NOT return refresh_token on refresh — preserve original
  if (!newTokens.refresh_token && oldTokens.refresh_token) {
    newTokens.refresh_token = oldTokens.refresh_token;
  }
  newTokens.saved_at = Date.now() / 1000;
  cachedTokens = newTokens;
  await saveTokensToGCS(newTokens);
}

// ---------------------------------------------------------------------------
// Google Chat API helpers (same logic as index.js)
// ---------------------------------------------------------------------------

async function refreshTokens(creds, tokens) {
  log("Refreshing access token...");

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${body}`);
  }

  const newTokens = await resp.json();
  await saveTokens(newTokens, tokens);
  log("Token refreshed successfully.");
  return { ...tokens, ...newTokens, saved_at: Date.now() / 1000 };
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

  return { accessToken: tokens.access_token, creds, tokens };
}

async function chatGet(path, params = {}, _retried = false) {
  const { accessToken, creds, tokens } = await getAccessToken();
  const url = new URL(`${API_BASE}${path}`);
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
    return chatGet(path, params, true);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Chat API error ${resp.status}: ${body}`);
  }

  return resp.json();
}

async function chatPost(path, body, _retried = false) {
  const { accessToken, creds, tokens } = await getAccessToken();
  const url = `${API_BASE}${path}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 && !_retried) {
    log("Got 401, refreshing token and retrying...");
    const creds2 = getCredentials();
    await refreshTokens(creds2, tokens);
    return chatPost(path, body, true);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Chat API error ${resp.status}: ${text}`);
  }

  return resp.json();
}

async function chatPaginate(path, params = {}, resultKey, maxResults = 500) {
  const allResults = [];
  let pageToken = null;

  while (true) {
    const queryParams = { ...params };
    if (pageToken) queryParams.pageToken = pageToken;

    const data = await chatGet(path, queryParams);
    const items = data[resultKey] || [];
    allResults.push(...items);

    if (allResults.length >= maxResults) {
      return allResults.slice(0, maxResults);
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// Tool implementations (same as index.js)
// ---------------------------------------------------------------------------

async function toolListSpaces({ filter, limit }) {
  const params = {};
  if (filter) params.filter = filter;
  params.pageSize = Math.min(limit || 100, 1000);

  const spaces = await chatPaginate("/spaces", params, "spaces", limit || 100);

  return spaces.map((s) => ({
    name: s.name,
    display_name: s.displayName,
    type: s.type,
    space_type: s.spaceType,
    single_user_bot_dm: s.singleUserBotDm,
    threaded: s.threaded,
    external_user_allowed: s.externalUserAllowed,
    space_threading_state: s.spaceThreadingState,
    member_count: s.membershipCount,
  }));
}

async function toolGetMessages({ space_name, start_date, end_date, thread_name, limit, order }) {
  const params = {};
  params.pageSize = Math.min(limit || 100, 1000);

  const filterParts = [];
  if (start_date) filterParts.push(`createTime > "${start_date}T00:00:00Z"`);
  if (end_date) filterParts.push(`createTime < "${end_date}T23:59:59Z"`);
  if (thread_name) filterParts.push(`thread.name = "${thread_name}"`);
  if (filterParts.length > 0) params.filter = filterParts.join(" AND ");

  if (order) params.orderBy = order;

  const messages = await chatPaginate(
    `/${space_name}/messages`,
    params,
    "messages",
    limit || 100
  );

  return messages.map(formatMessage);
}

async function toolSearchMessages({ space_name, keyword, sender_name, start_date, end_date, limit }) {
  const params = {};
  params.pageSize = 1000;

  const filterParts = [];
  if (start_date) filterParts.push(`createTime > "${start_date}T00:00:00Z"`);
  if (end_date) filterParts.push(`createTime < "${end_date}T23:59:59Z"`);
  if (filterParts.length > 0) params.filter = filterParts.join(" AND ");

  const maxFetch = Math.max((limit || 50) * 5, 500);
  let messages = await chatPaginate(
    `/${space_name}/messages`,
    params,
    "messages",
    maxFetch
  );

  if (keyword) {
    const needle = keyword.toLowerCase();
    messages = messages.filter((m) => {
      const text = (m.text || m.formattedText || "").toLowerCase();
      return text.includes(needle);
    });
  }

  if (sender_name) {
    const needle = sender_name.toLowerCase();
    messages = messages.filter((m) => {
      const senderDisplay = (m.sender?.displayName || "").toLowerCase();
      const senderN = (m.sender?.name || "").toLowerCase();
      return senderDisplay.includes(needle) || senderN.includes(needle);
    });
  }

  return messages.slice(0, limit || 50).map(formatMessage);
}

async function toolGetThread({ space_name, thread_name }) {
  const params = {
    filter: `thread.name = "${thread_name}"`,
    pageSize: 1000,
  };

  const messages = await chatPaginate(
    `/${space_name}/messages`,
    params,
    "messages",
    1000
  );

  return messages.map(formatMessage);
}

async function toolSendMessage({ space_name, text, thread_name }) {
  const body = { text };
  if (thread_name) {
    body.thread = { name: thread_name };
  }

  const params = thread_name ? `?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD` : "";
  const result = await chatPost(`/${space_name}/messages${params}`, body);

  return {
    name: result.name,
    sender: result.sender?.displayName || result.sender?.name,
    text: result.text,
    create_time: result.createTime,
    thread: result.thread?.name,
    space: result.space?.name,
  };
}

function formatMessage(m) {
  return {
    name: m.name,
    sender: m.sender?.displayName || m.sender?.name,
    sender_type: m.sender?.type,
    text: m.text || m.formattedText,
    create_time: m.createTime,
    thread: m.thread?.name,
    space: m.space?.name,
    attachment_count: m.attachment?.length || 0,
    emoji_reaction_count: m.emojiReactionSummaries?.length || 0,
  };
}

// ---------------------------------------------------------------------------
// Register all tools on an MCP server instance
// ---------------------------------------------------------------------------

function registerTools(server) {
  server.tool(
    "list_spaces",
    "List Google Chat spaces (rooms, DMs, group chats). Returns space names, types, and member counts.",
    {
      filter: z
        .string()
        .optional()
        .describe(
          "Optional Chat API filter. Example: 'spaceType = \"SPACE\"' for rooms only, 'spaceType = \"DIRECT_MESSAGE\"' for DMs."
        ),
      limit: z
        .number()
        .optional()
        .describe("Max spaces to return (default 100)."),
    },
    async (args) => {
      try {
        const result = await toolListSpaces(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_messages",
    "Get messages from a Google Chat space. Supports date range and thread filtering. Provide a space name like 'spaces/AAAA...'.",
    {
      space_name: z
        .string()
        .describe("The space resource name (e.g., 'spaces/AAAAxyz123')."),
      start_date: z
        .string()
        .optional()
        .describe("Messages after this date (YYYY-MM-DD). Highly recommended for performance."),
      end_date: z
        .string()
        .optional()
        .describe("Messages before this date (YYYY-MM-DD)."),
      thread_name: z
        .string()
        .optional()
        .describe("Filter to a specific thread (e.g., 'spaces/AAAAxyz123/threads/BBBBabc456')."),
      limit: z
        .number()
        .optional()
        .describe("Max messages to return (default 100)."),
      order: z
        .string()
        .optional()
        .describe("Sort order. Use 'createTime desc' for newest first, 'createTime asc' for oldest first."),
    },
    async (args) => {
      try {
        const result = await toolGetMessages(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "search_messages",
    "Search messages in a Google Chat space by keyword and/or sender. IMPORTANT: Google Chat API has no server-side full-text search — date filtering is done server-side, but keyword and sender are filtered client-side. Always provide a date range to avoid fetching all messages.",
    {
      space_name: z
        .string()
        .describe("The space resource name (e.g., 'spaces/AAAAxyz123')."),
      keyword: z
        .string()
        .optional()
        .describe("Search keyword (case-insensitive, matches message text). Client-side filter."),
      sender_name: z
        .string()
        .optional()
        .describe("Filter by sender display name (partial match, case-insensitive). Client-side filter."),
      start_date: z
        .string()
        .optional()
        .describe("Messages after this date (YYYY-MM-DD). STRONGLY recommended — without a date range, all messages are fetched."),
      end_date: z
        .string()
        .optional()
        .describe("Messages before this date (YYYY-MM-DD)."),
      limit: z
        .number()
        .optional()
        .describe("Max results to return after filtering (default 50)."),
    },
    async (args) => {
      try {
        const result = await toolSearchMessages(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "send_message",
    "Send a message to a Google Chat space. Optionally reply to a specific thread.",
    {
      space_name: z
        .string()
        .describe("The space resource name (e.g., 'spaces/AAAAxyz123')."),
      text: z
        .string()
        .describe("The message text to send."),
      thread_name: z
        .string()
        .optional()
        .describe("Optional thread to reply to (e.g., 'spaces/AAAAxyz123/threads/BBBBabc456'). If omitted, creates a new thread."),
    },
    async (args) => {
      try {
        const result = await toolSendMessage(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_thread",
    "Get all messages in a specific Google Chat thread. Useful for reading full conversation threads.",
    {
      space_name: z
        .string()
        .describe("The space resource name (e.g., 'spaces/AAAAxyz123')."),
      thread_name: z
        .string()
        .describe("The thread resource name (e.g., 'spaces/AAAAxyz123/threads/BBBBabc456')."),
    },
    async (args) => {
      try {
        const result = await toolGetThread(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        };
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
  res.json({ status: "ok", service: "mcp-gchat" });
});

// --- Session tracking ---
const sessions = new Map();

// --- Streamable HTTP endpoint (handles POST, GET, DELETE) ---
app.all("/mcp", async (req, res) => {
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
    name: "gchat",
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
app.get("/sse", async (req, res) => {
  log("Legacy SSE redirect → use /mcp endpoint");
  res.status(404).json({
    error: "Legacy SSE endpoint removed. Use /mcp with Streamable HTTP transport.",
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  // Validate credentials
  getCredentials();

  // Pre-load tokens to fail fast if none available
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
