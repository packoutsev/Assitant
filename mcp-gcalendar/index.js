#!/usr/bin/env node

/**
 * MCP Server for Google Calendar (local stdio transport)
 *
 * Exposes Google Calendar read to Claude Code via
 * the Model Context Protocol.
 *
 * Token files:
 *   ~/.gcalendar_credentials.json  — client_id, client_secret
 *   ~/.gcalendar_tokens.json       — access/refresh tokens (auto-refreshed)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  init as initCalendar,
  toolListCalendars,
  toolListEvents,
  toolGetEvent,
} from "./calendar.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOME = homedir();
const CREDENTIALS_PATH = join(HOME, ".gcalendar_credentials.json");
const TOKENS_PATH = join(HOME, ".gcalendar_tokens.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const log = (...args) => console.error("[mcp-gcalendar]", ...args);

// ---------------------------------------------------------------------------
// Credential & token helpers
// ---------------------------------------------------------------------------

function loadCredentials() {
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Google Calendar credentials from ${CREDENTIALS_PATH}. Run: node auth.js`
    );
  }
}

function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Google Calendar tokens from ${TOKENS_PATH}. Run: node auth.js`
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

// Initialize calendar module with local auth helpers
initCalendar({ getAccessToken, refreshTokens, log });

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "gcalendar",
  version: "1.0.0",
});

// --- list_calendars ---
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

// --- list_events ---
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

// --- get_event ---
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

  log("Starting MCP server (Google Calendar)...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio.");
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
