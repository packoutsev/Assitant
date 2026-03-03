#!/usr/bin/env node

/**
 * MCP Server for Google Sheets (local stdio transport)
 *
 * Exposes Google Sheets read/write to Claude Code via
 * the Model Context Protocol.
 *
 * Token files:
 *   ~/.gsheets_credentials.json  — client_id, client_secret
 *   ~/.gsheets_tokens.json       — access/refresh tokens (auto-refreshed)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  init as initSheets,
  toolOpenSpreadsheet,
  toolListSheets,
  toolReadRange,
  toolReadSheet,
  toolWriteRange,
  toolAppendRows,
  toolCreateSpreadsheet,
  toolClearRange,
} from "./sheets.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOME = homedir();
const CREDENTIALS_PATH = join(HOME, ".gsheets_credentials.json");
const TOKENS_PATH = join(HOME, ".gsheets_tokens.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const log = (...args) => console.error("[mcp-gsheets]", ...args);

// ---------------------------------------------------------------------------
// Credential & token helpers
// ---------------------------------------------------------------------------

function loadCredentials() {
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Google Sheets credentials from ${CREDENTIALS_PATH}. Run: node auth.js`
    );
  }
}

function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Google Sheets tokens from ${TOKENS_PATH}. Run: node auth.js`
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

// Initialize sheets module with local auth helpers
initSheets({ getAccessToken, refreshTokens, log });

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "gsheets",
  version: "1.0.0",
});

// --- open_spreadsheet ---
server.tool(
  "open_spreadsheet",
  "Get spreadsheet metadata — title, all sheet/tab names, IDs, row/column counts.",
  {
    spreadsheet_id: z
      .string()
      .describe("The Google Sheets spreadsheet ID (from the URL)."),
  },
  async (args) => {
    try {
      const result = await toolOpenSpreadsheet(args);
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

// --- list_sheets ---
server.tool(
  "list_sheets",
  "List just the tab names and IDs for a spreadsheet.",
  {
    spreadsheet_id: z
      .string()
      .describe("The Google Sheets spreadsheet ID."),
  },
  async (args) => {
    try {
      const result = await toolListSheets(args);
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

// --- read_range ---
server.tool(
  "read_range",
  "Read cell values from a range (e.g., 'Sheet1!A1:D10').",
  {
    spreadsheet_id: z
      .string()
      .describe("The Google Sheets spreadsheet ID."),
    range: z
      .string()
      .describe("A1 notation range (e.g., 'Sheet1!A1:D10')."),
  },
  async (args) => {
    try {
      const result = await toolReadRange(args);
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

// --- read_sheet ---
server.tool(
  "read_sheet",
  "Read an entire tab's data (all values).",
  {
    spreadsheet_id: z
      .string()
      .describe("The Google Sheets spreadsheet ID."),
    sheet_name: z
      .string()
      .describe("The tab/sheet name (e.g., 'Sheet1')."),
  },
  async (args) => {
    try {
      const result = await toolReadSheet(args);
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

// --- write_range ---
server.tool(
  "write_range",
  "Write values to a range. Overwrites existing data in the specified range.",
  {
    spreadsheet_id: z
      .string()
      .describe("The Google Sheets spreadsheet ID."),
    range: z
      .string()
      .describe("A1 notation range (e.g., 'Sheet1!A1:D10')."),
    values: z
      .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .describe("2D array of values (rows of cells). Example: [['Name','Age'],['Alice',30]]"),
  },
  async (args) => {
    try {
      const result = await toolWriteRange(args);
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

// --- append_rows ---
server.tool(
  "append_rows",
  "Append rows after the last row of data in a sheet.",
  {
    spreadsheet_id: z
      .string()
      .describe("The Google Sheets spreadsheet ID."),
    range: z
      .string()
      .describe("The tab or range to append to (e.g., 'Sheet1' or 'Sheet1!A:D')."),
    values: z
      .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .describe("2D array of rows to append. Example: [['Alice',30],['Bob',25]]"),
  },
  async (args) => {
    try {
      const result = await toolAppendRows(args);
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

// --- create_spreadsheet ---
server.tool(
  "create_spreadsheet",
  "Create a new Google Sheets spreadsheet with optional tab names.",
  {
    title: z
      .string()
      .describe("Title for the new spreadsheet."),
    sheet_names: z
      .array(z.string())
      .optional()
      .describe("Tab names to create (default: ['Sheet1']). Example: ['Data','Summary']"),
  },
  async (args) => {
    try {
      const result = await toolCreateSpreadsheet(args);
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

// --- clear_range ---
server.tool(
  "clear_range",
  "Clear all values from a range (keeps formatting). Use a sheet name to clear an entire tab.",
  {
    spreadsheet_id: z
      .string()
      .describe("The Google Sheets spreadsheet ID."),
    range: z
      .string()
      .describe("A1 notation range to clear (e.g., 'Sheet1!A1:D10' or 'Sheet1' for entire tab)."),
  },
  async (args) => {
    try {
      const result = await toolClearRange(args);
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

  log("Starting MCP server (Google Sheets)...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio.");
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
