#!/usr/bin/env node

/**
 * MCP Server for Google Chat (local stdio transport)
 *
 * Exposes Google Chat spaces and messages to Claude Code via
 * the Model Context Protocol.
 *
 * Token files:
 *   ~/.gchat_credentials.json  — client_id, client_secret
 *   ~/.gchat_tokens.json       — access/refresh tokens (auto-refreshed)
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
const CREDENTIALS_PATH = join(HOME, ".gchat_credentials.json");
const TOKENS_PATH = join(HOME, ".gchat_tokens.json");
const API_BASE = "https://chat.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const log = (...args) => console.error("[mcp-gchat]", ...args);

// ---------------------------------------------------------------------------
// Credential & token helpers
// ---------------------------------------------------------------------------

function loadCredentials() {
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Google Chat credentials from ${CREDENTIALS_PATH}. Run: node auth.js`
    );
  }
}

function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Google Chat tokens from ${TOKENS_PATH}. Run: node auth.js`
    );
  }
}

function saveTokens(newTokens, oldTokens) {
  // Google does NOT return refresh_token on refresh — preserve original
  if (!newTokens.refresh_token && oldTokens.refresh_token) {
    newTokens.refresh_token = oldTokens.refresh_token;
  }
  newTokens.saved_at = Date.now() / 1000;
  writeFileSync(TOKENS_PATH, JSON.stringify(newTokens, null, 2));
}

async function refreshTokens(creds, tokens) {
  log("Refreshing access token...");

  // Google uses POST body params (not Basic Auth)
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
  saveTokens(newTokens, tokens);
  log("Token refreshed successfully.");
  return { ...tokens, ...newTokens, saved_at: Date.now() / 1000 };
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

  return { accessToken: tokens.access_token, creds, tokens };
}

// ---------------------------------------------------------------------------
// Google Chat API helpers
// ---------------------------------------------------------------------------

/**
 * Make an authenticated GET request to Google Chat API.
 * Auto-retries once on 401 after refreshing the token.
 */
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

/**
 * Make an authenticated POST request to Google Chat API.
 */
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
    const creds2 = loadCredentials();
    await refreshTokens(creds2, tokens);
    return chatPost(path, body, true);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Chat API error ${resp.status}: ${text}`);
  }

  return resp.json();
}

/**
 * Paginate through Google Chat API results.
 * Follows nextPageToken until all results are fetched or maxResults reached.
 */
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
// Tool implementations
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

  // Build filter for date range
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
  // Google Chat REST API has NO full-text search.
  // Strategy: use date filter server-side, then filter keyword/sender client-side.
  const params = {};
  params.pageSize = 1000; // fetch more to filter client-side

  const filterParts = [];
  if (start_date) filterParts.push(`createTime > "${start_date}T00:00:00Z"`);
  if (end_date) filterParts.push(`createTime < "${end_date}T23:59:59Z"`);
  if (filterParts.length > 0) params.filter = filterParts.join(" AND ");

  const maxFetch = Math.max((limit || 50) * 5, 500); // fetch extra for client-side filtering
  let messages = await chatPaginate(
    `/${space_name}/messages`,
    params,
    "messages",
    maxFetch
  );

  // Client-side keyword filter
  if (keyword) {
    const needle = keyword.toLowerCase();
    messages = messages.filter((m) => {
      const text = (m.text || m.formattedText || "").toLowerCase();
      return text.includes(needle);
    });
  }

  // Client-side sender filter
  if (sender_name) {
    const needle = sender_name.toLowerCase();
    messages = messages.filter((m) => {
      const senderDisplay = (m.sender?.displayName || "").toLowerCase();
      const senderName = (m.sender?.name || "").toLowerCase();
      return senderDisplay.includes(needle) || senderName.includes(needle);
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
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "gchat",
  version: "1.0.0",
});

// --- list_spaces ---
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

// --- get_messages ---
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

// --- search_messages ---
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

// --- send_message ---
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

// --- get_thread ---
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

  log("Starting MCP server (Google Chat)...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio.");
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
