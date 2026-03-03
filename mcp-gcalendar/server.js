#!/usr/bin/env node

/**
 * Remote MCP Server for Google Calendar (Cloud Run deployment)
 *
 * Streamable HTTP transport for use with claude.ai and Packouts Hub.
 * Tokens persisted in Google Cloud Storage bucket.
 * Credentials passed as environment variables.
 *
 * Environment variables:
 *   GCALENDAR_CLIENT_ID       — Google OAuth client ID
 *   GCALENDAR_CLIENT_SECRET   — Google OAuth client secret
 *   GCS_BUCKET                — GCS bucket name for token storage
 *   GCS_TOKEN_PATH            — GCS file path for tokens (default: gcalendar-tokens.json)
 *   GCALENDAR_INITIAL_TOKENS  — Base64-encoded JSON tokens (fallback for first deploy)
 *   PORT                      — HTTP port (default 8080, set by Cloud Run)
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
import {
  init as initCalendar,
  toolListCalendars,
  toolListEvents,
  toolGetEvent,
} from "./calendar.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "8080", 10);
const GCS_BUCKET = process.env.GCS_BUCKET || "packouts-gchat-tokens";
const GCS_TOKEN_PATH = process.env.GCS_TOKEN_PATH || "gcalendar-tokens.json";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

const log = (...args) => console.log("[mcp-gcalendar]", ...args);

// ---------------------------------------------------------------------------
// Credentials (from env vars)
// ---------------------------------------------------------------------------

function getCredentials() {
  const client_id = process.env.GCALENDAR_CLIENT_ID;
  const client_secret = process.env.GCALENDAR_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    throw new Error(
      "Missing GCALENDAR_CLIENT_ID or GCALENDAR_CLIENT_SECRET environment variable"
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
  const initial = process.env.GCALENDAR_INITIAL_TOKENS;
  if (initial) {
    try {
      cachedTokens = JSON.parse(Buffer.from(initial, "base64").toString("utf-8"));
      log("Loaded tokens from GCALENDAR_INITIAL_TOKENS env var");
      await saveTokensToGCS(cachedTokens);
      return cachedTokens;
    } catch (err) {
      log("Failed to parse GCALENDAR_INITIAL_TOKENS:", err.message);
    }
  }

  throw new Error("No Google Calendar tokens available — upload to GCS or set GCALENDAR_INITIAL_TOKENS");
}

async function saveTokens(newTokens, oldTokens) {
  if (!newTokens.refresh_token && oldTokens.refresh_token) {
    newTokens.refresh_token = oldTokens.refresh_token;
  }
  newTokens.saved_at = Date.now() / 1000;
  cachedTokens = newTokens;
  await saveTokensToGCS(newTokens);
}

// ---------------------------------------------------------------------------
// Google Calendar auth helpers
// ---------------------------------------------------------------------------

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

// Initialize calendar module with Cloud Run auth helpers
initCalendar({ getAccessToken, refreshTokens, log });

// ---------------------------------------------------------------------------
// Register all tools on an MCP server instance
// ---------------------------------------------------------------------------

function registerTools(server) {
  server.tool(
    "list_calendars",
    "List all Google Calendars the user has access to. Returns calendar IDs, names, colors, and whether each is primary.",
    {},
    async () => {
      try {
        const result = await toolListCalendars();
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
    "list_events",
    "List events from one or more calendars within a date range. Returns events with title, times, location, description, and color.",
    {
      calendar_ids: z
        .array(z.string())
        .describe("Array of Google Calendar IDs to fetch events from."),
      start_date: z
        .string()
        .describe("Start of date range (YYYY-MM-DD)."),
      end_date: z
        .string()
        .describe("End of date range (YYYY-MM-DD)."),
    },
    async (args) => {
      try {
        const result = await toolListEvents(args);
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
    "get_event",
    "Get full details of a single calendar event by calendar ID and event ID.",
    {
      calendar_id: z
        .string()
        .describe("The Google Calendar ID the event belongs to."),
      event_id: z
        .string()
        .describe("The event ID."),
    },
    async (args) => {
      try {
        const result = await toolGetEvent(args);
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

// --- CORS ---
const ALLOWED_ORIGINS = [
  "https://packouts-hub.web.app",
  "https://sdr-onboard.web.app",
  "https://packouts-vault.web.app",
  "http://localhost:5173",
  "http://localhost:5174",
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, X-API-Key");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// --- Auth middleware (X-API-Key) ---
const API_KEY = process.env.API_KEY;
function requireAuth(req, res, next) {
  if (API_KEY && req.headers["x-api-key"] === API_KEY) return next();
  if (!API_KEY) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mcp-gcalendar" });
});

// --- Session tracking ---
const sessions = new Map();

// --- Streamable HTTP endpoint ---
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
    name: "gcalendar",
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
app.get("/sse", async (req, res) => {
  log("Legacy SSE redirect -> use /mcp endpoint");
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
