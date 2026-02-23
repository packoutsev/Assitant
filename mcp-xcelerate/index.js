#!/usr/bin/env node

/**
 * Local MCP Server for Xcelerate Job Management (stdio transport)
 *
 * For use with Claude Code CLI. Reads Firestore credentials from:
 *   1. ~/.xcelerate_credentials.json (GCP service account key)
 *   2. Application Default Credentials (gcloud auth application-default login)
 *
 * Set GOOGLE_CLOUD_PROJECT env var if not using a service account key.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Firestore } from "@google-cloud/firestore";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { registerTools } from "./tools.js";

const HOME = homedir();
const CREDENTIALS_PATH = join(HOME, ".xcelerate_credentials.json");

const log = (...args) => console.error("[mcp-xcelerate]", ...args);

// ---------------------------------------------------------------------------
// Firestore initialization
// ---------------------------------------------------------------------------

function initFirestore() {
  if (existsSync(CREDENTIALS_PATH)) {
    log(`Using service account key: ${CREDENTIALS_PATH}`);
    const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
    return new Firestore({
      projectId: creds.project_id,
      credentials: creds,
    });
  }

  // Fall back to Application Default Credentials
  log("No service account key found, using Application Default Credentials");
  return new Firestore();
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const db = initFirestore();

  // Verify connectivity
  try {
    await db.collection("jobs").limit(1).get();
    log("Firestore connection verified");
  } catch (e) {
    log("WARNING: Firestore connectivity check failed:", e.message);
    log("Tools will attempt to connect on first use");
  }

  const server = new McpServer({
    name: "xcelerate",
    version: "1.0.0",
  });

  registerTools(server, db);

  log("Starting MCP server (Xcelerate)...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio.");
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
