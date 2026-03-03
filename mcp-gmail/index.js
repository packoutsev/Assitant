#!/usr/bin/env node

/**
 * MCP Server for Gmail (local stdio transport)
 *
 * Exposes Gmail search, labels, and message reading to Claude Code via
 * the Model Context Protocol.
 *
 * Token files:
 *   ~/.gmail_credentials.json  — client_id, client_secret
 *   ~/.gmail_tokens.json       — access/refresh tokens (auto-refreshed)
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
const CREDENTIALS_PATH = join(HOME, ".gmail_credentials.json");
const TOKENS_PATH = join(HOME, ".gmail_tokens.json");
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const log = (...args) => console.error("[mcp-gmail]", ...args);

// ---------------------------------------------------------------------------
// Credential & token helpers
// ---------------------------------------------------------------------------

function loadCredentials() {
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Gmail credentials from ${CREDENTIALS_PATH}. Run: node auth.js`
    );
  }
}

function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Gmail tokens from ${TOKENS_PATH}. Run: node auth.js`
    );
  }
}

function saveTokens(newTokens, oldTokens) {
  if (!newTokens.refresh_token && oldTokens.refresh_token) {
    newTokens.refresh_token = oldTokens.refresh_token;
  }
  newTokens.saved_at = Date.now() / 1000;
  writeFileSync(TOKENS_PATH, JSON.stringify(newTokens, null, 2));
}

async function refreshTokens(creds, tokens) {
  log("Refreshing access token...");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
// Gmail API helpers
// ---------------------------------------------------------------------------

async function gmailGet(path, params = {}, _retried = false) {
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
    return gmailGet(path, params, true);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gmail API error ${resp.status}: ${body}`);
  }

  return resp.json();
}

async function gmailPost(path, body, _retried = false) {
  const { accessToken, creds, tokens } = await getAccessToken();
  const url = `${API_BASE}${path}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": body instanceof URLSearchParams
        ? "application/x-www-form-urlencoded"
        : "application/json",
      Accept: "application/json",
    },
    body: body instanceof URLSearchParams ? body : JSON.stringify(body),
  });

  if (resp.status === 401 && !_retried) {
    log("Got 401, refreshing token and retrying...");
    await refreshTokens(creds, tokens);
    return gmailPost(path, body, true);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gmail API error ${resp.status}: ${text}`);
  }

  return resp.json();
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolListLabels() {
  const data = await gmailGet("/labels");
  return (data.labels || []).map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    messages_total: l.messagesTotal,
    messages_unread: l.messagesUnread,
  }));
}

async function toolSearchMessages({ query, label, max_results }) {
  const params = {};
  if (query) params.q = query;
  if (label) params.labelIds = label;
  params.maxResults = Math.min(max_results || 20, 100);

  const data = await gmailGet("/messages", params);
  const messages = data.messages || [];

  if (messages.length === 0) return [];

  // Fetch full message details for each result
  const details = await Promise.all(
    messages.slice(0, params.maxResults).map((m) =>
      gmailGet(`/messages/${m.id}`, { format: "metadata", metadataHeaders: "From,To,Subject,Date" })
    )
  );

  return details.map(formatMessage);
}

async function toolGetMessage({ message_id, format }) {
  const fmt = format || "full";
  const data = await gmailGet(`/messages/${message_id}`, { format: fmt });

  if (fmt === "full" || fmt === "raw") {
    return formatFullMessage(data);
  }
  return formatMessage(data);
}

async function toolGetThread({ thread_id, format }) {
  const fmt = format || "metadata";
  const params = { format: fmt };
  if (fmt === "metadata") params.metadataHeaders = "From,To,Subject,Date";

  const data = await gmailGet(`/threads/${thread_id}`, params);
  const messages = data.messages || [];

  if (fmt === "full") {
    return messages.map(formatFullMessage);
  }
  return messages.map(formatMessage);
}

async function toolSendMessage({ to, cc, bcc, subject, body, reply_to_message_id }) {
  // Build RFC 2822 email
  const headers = [];
  headers.push(`To: ${to}`);
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  headers.push(`Subject: ${subject}`);
  headers.push("Content-Type: text/plain; charset=utf-8");

  if (reply_to_message_id) {
    // Fetch original message to get Message-ID and threadId
    const original = await gmailGet(`/messages/${reply_to_message_id}`, { format: "metadata", metadataHeaders: "Message-ID,Subject" });
    const origMessageId = getHeader(original.payload?.headers, "Message-ID");
    if (origMessageId) {
      headers.push(`In-Reply-To: ${origMessageId}`);
      headers.push(`References: ${origMessageId}`);
    }

    const raw = [...headers, "", body].join("\r\n");
    const encoded = Buffer.from(raw).toString("base64url");
    const result = await gmailPost("/messages/send", { raw: encoded, threadId: original.threadId });
    return { id: result.id, threadId: result.threadId, labelIds: result.labelIds };
  }

  const raw = [...headers, "", body].join("\r\n");
  const encoded = Buffer.from(raw).toString("base64url");
  const result = await gmailPost("/messages/send", { raw: encoded });
  return { id: result.id, threadId: result.threadId, labelIds: result.labelIds };
}

async function toolModifyMessage({ message_id, add_labels, remove_labels }) {
  const body = {};
  if (add_labels) body.addLabelIds = add_labels;
  if (remove_labels) body.removeLabelIds = remove_labels;
  const result = await gmailPost(`/messages/${message_id}/modify`, body);
  return { id: result.id, threadId: result.threadId, labelIds: result.labelIds };
}

function getHeader(headers, name) {
  const h = (headers || []).find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return h ? h.value : null;
}

function formatMessage(msg) {
  const headers = msg.payload?.headers || [];
  return {
    id: msg.id,
    thread_id: msg.threadId,
    label_ids: msg.labelIds,
    snippet: msg.snippet,
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    internal_date: msg.internalDate
      ? new Date(parseInt(msg.internalDate)).toISOString()
      : null,
  };
}

function formatFullMessage(msg) {
  const base = formatMessage(msg);

  // Extract body text
  let bodyText = "";
  const payload = msg.payload;

  if (payload) {
    bodyText = extractTextBody(payload);
  }

  return { ...base, body: bodyText };
}

function extractTextBody(part) {
  // If this part has a text/plain body, decode it
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf-8");
  }

  // If multipart, recurse into parts — prefer text/plain
  if (part.parts) {
    // First try text/plain
    for (const p of part.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) {
        return Buffer.from(p.body.data, "base64url").toString("utf-8");
      }
    }
    // Then try recursion
    for (const p of part.parts) {
      const text = extractTextBody(p);
      if (text) return text;
    }
  }

  // Fallback: try html
  if (part.mimeType === "text/html" && part.body?.data) {
    const html = Buffer.from(part.body.data, "base64url").toString("utf-8");
    // Strip HTML tags for readability
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return "";
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "gmail",
  version: "1.0.0",
});

// --- list_labels ---
server.tool(
  "list_labels",
  "List all Gmail labels (folders) with message counts. Use this to find label IDs for filtering.",
  {},
  async () => {
    try {
      const result = await toolListLabels();
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
  "Search Gmail messages using Gmail query syntax (same as the Gmail search bar). Supports from:, to:, subject:, has:attachment, after:, before:, label:, is:unread, etc. Returns message metadata (from, to, subject, date, snippet).",
  {
    query: z
      .string()
      .optional()
      .describe(
        "Gmail search query (e.g., 'from:someone@example.com subject:fire after:2026/02/01'). Same syntax as Gmail search bar."
      ),
    label: z
      .string()
      .optional()
      .describe("Filter by label ID (use list_labels to find IDs). E.g., 'INBOX', 'SENT', or custom label IDs."),
    max_results: z
      .number()
      .optional()
      .describe("Max messages to return (default 20, max 100)."),
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

// --- get_message ---
server.tool(
  "get_message",
  "Get full details of a specific Gmail message by ID, including the message body text.",
  {
    message_id: z.string().describe("The Gmail message ID."),
    format: z
      .string()
      .optional()
      .describe("Response format: 'full' (default, includes body), 'metadata' (headers only), 'minimal'."),
  },
  async (args) => {
    try {
      const result = await toolGetMessage(args);
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
  "Get all messages in a Gmail thread/conversation by thread ID.",
  {
    thread_id: z.string().describe("The Gmail thread ID."),
    format: z
      .string()
      .optional()
      .describe("Response format: 'metadata' (default), 'full' (includes body text)."),
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

// --- send_message ---
server.tool(
  "send_message",
  "Send an email or reply to an existing email thread. For replies, provide reply_to_message_id to thread the conversation.",
  {
    to: z.string().describe("Recipient email address(es), comma-separated."),
    subject: z.string().describe("Email subject line."),
    body: z.string().describe("Plain text email body."),
    cc: z.string().optional().describe("CC recipients, comma-separated."),
    bcc: z.string().optional().describe("BCC recipients, comma-separated."),
    reply_to_message_id: z
      .string()
      .optional()
      .describe("Gmail message ID to reply to. Threads the reply in the same conversation."),
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

// --- modify_message ---
server.tool(
  "modify_message",
  "Modify a message's labels (archive, trash, mark read/unread, move to label). Use list_labels to find label IDs.",
  {
    message_id: z.string().describe("The Gmail message ID to modify."),
    add_labels: z
      .array(z.string())
      .optional()
      .describe("Label IDs to add (e.g., ['TRASH'], ['STARRED'])."),
    remove_labels: z
      .array(z.string())
      .optional()
      .describe("Label IDs to remove (e.g., ['INBOX'] to archive, ['UNREAD'] to mark read)."),
  },
  async (args) => {
    try {
      const result = await toolModifyMessage(args);
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
  try {
    loadCredentials();
    loadTokens();
  } catch (e) {
    log("ERROR:", e.message);
    process.exit(1);
  }

  log("Starting MCP server (Gmail)...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio.");
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
