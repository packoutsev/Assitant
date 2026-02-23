#!/usr/bin/env node

/**
 * Remote MCP Server for Encircle (Cloud Run deployment)
 *
 * Streamable HTTP transport for use with claude.ai browser interface.
 * Credentials passed as environment variables.
 *
 * Environment variables:
 *   ENCIRCLE_API_TOKEN  — Encircle API bearer token
 *   AUTH_TOKEN           — Bearer token for authenticating requests
 *   PORT                 — HTTP port (default 8080, set by Cloud Run)
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
const API_BASE = "https://api.encircleapp.com";

const log = (...args) => console.log("[mcp-encircle]", ...args);

// ---------------------------------------------------------------------------
// Credential helper (from env var)
// ---------------------------------------------------------------------------

function getApiToken() {
  const token = process.env.ENCIRCLE_API_TOKEN;
  if (!token) {
    throw new Error("Missing ENCIRCLE_API_TOKEN environment variable");
  }
  return token;
}

// ---------------------------------------------------------------------------
// Encircle API helpers
// ---------------------------------------------------------------------------

async function encircleGet(path, params = {}) {
  const api_token = getApiToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${api_token}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Encircle API ${resp.status}: ${body}`);
  }

  return resp.json();
}

async function encirclePaginate(path, params = {}, maxPages = 20) {
  const allItems = [];
  const pageParams = { ...params };
  if (!pageParams.limit) pageParams.limit = 100;

  for (let page = 0; page < maxPages; page++) {
    const data = await encircleGet(path, pageParams);

    if (Array.isArray(data)) {
      allItems.push(...data);
      break;
    }

    if (data.list) {
      allItems.push(...data.list);
      const after = data.cursor?.after;
      if (!after || data.list.length < pageParams.limit) break;
      pageParams.after = after;
    } else if (data.data) {
      allItems.push(...data.data);
      const after = data.paging?.cursors?.after;
      if (!after || data.data.length < pageParams.limit) break;
      pageParams.after = after;
    } else {
      allItems.push(data);
      break;
    }
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Tool implementations (same as index.js)
// ---------------------------------------------------------------------------

async function toolListClaims({ limit, order }) {
  const params = {};
  if (limit) params.limit = Math.min(limit, 100);
  if (order) params.order = order;

  const claims = await encirclePaginate("/v1/property_claims", params);

  return claims.map((c) => ({
    id: c.id,
    policyholder_name: c.policyholder_name,
    type_of_loss: c.type_of_loss,
    full_address: c.full_address || c.loss_address,
    date_of_loss: c.date_of_loss,
    date_claim_created: c.date_claim_created || c.created,
    assignment_identifier: c.assignment_identifier,
    contractor_identifier: c.contractor_identifier,
    insurer_identifier: c.insurer_identifier,
    adjuster_name: c.adjuster_name,
    project_manager_name: c.project_manager_name,
    status: c.status,
    loss_details: c.loss_details,
  }));
}

async function toolGetClaim({ claim_id }) {
  return encircleGet(`/v1/property_claims/${claim_id}`);
}

async function toolSearchClaims({
  policyholder_name,
  address,
  assignment_identifier,
  start_date,
  end_date,
}) {
  const params = {};
  if (policyholder_name) params.policyholder_name = policyholder_name;
  if (assignment_identifier)
    params.assignment_identifier = assignment_identifier;

  let claims = await encirclePaginate("/v1/property_claims", params);

  if (address) {
    const needle = address.toLowerCase();
    claims = claims.filter((c) => {
      const addr = (c.full_address || c.loss_address || "").toLowerCase();
      return addr.includes(needle);
    });
  }

  if (start_date) {
    claims = claims.filter((c) => {
      const d = c.date_claim_created || c.date_of_loss || c.created || "";
      return d >= start_date;
    });
  }

  if (end_date) {
    claims = claims.filter((c) => {
      const d = c.date_claim_created || c.date_of_loss || c.created || "";
      return d && d <= end_date;
    });
  }

  return claims.map((c) => ({
    id: c.id,
    policyholder_name: c.policyholder_name,
    type_of_loss: c.type_of_loss,
    full_address: c.full_address || c.loss_address,
    date_of_loss: c.date_of_loss,
    date_claim_created: c.date_claim_created || c.created,
    assignment_identifier: c.assignment_identifier,
    contractor_identifier: c.contractor_identifier,
    insurer_identifier: c.insurer_identifier,
    status: c.status,
  }));
}

async function toolGetContentsInventory({ claim_id }) {
  const endpoints = [
    `/v1/property_claims/${claim_id}/contents`,
    `/v2/property_claims/${claim_id}/contents`,
    `/v1/property_claims/${claim_id}/content_items`,
    `/v2/property_claims/${claim_id}/content_items`,
    `/v1/property_claims/${claim_id}/inventory`,
    `/v2/property_claims/${claim_id}/inventory_items`,
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const data = await encirclePaginate(endpoint);
      return { endpoint_used: endpoint, items: data };
    } catch (e) {
      errors.push(`${endpoint}: ${e.message}`);
      if (e.message.includes("404") || e.message.includes("Not Found")) continue;
      throw e;
    }
  }

  throw new Error(
    "Contents inventory endpoint not found. Tried:\n" +
      errors.join("\n") +
      "\n\nThe Encircle API may require a different endpoint or plan level."
  );
}

async function toolGetPhotos({ claim_id, room_filter }) {
  const media = await encirclePaginate(
    `/v1/property_claims/${claim_id}/media`
  );

  let photos = media.filter((m) => {
    const sourceType = m.source?.type || "";
    const contentType = m.content_type || "";
    return (
      sourceType.includes("Picture") ||
      sourceType.includes("Photo") ||
      contentType.startsWith("image/")
    );
  });

  if (room_filter) {
    const needle = room_filter.toLowerCase();
    photos = photos.filter((p) => {
      const labels = p.labels || [];
      return labels.some((l) => l.toLowerCase().includes(needle));
    });
  }

  return photos.map((p) => ({
    id: p.id,
    source_type: p.source?.type,
    source_id: p.source?.primary_id,
    filename: p.filename || p.file_name,
    content_type: p.content_type,
    labels: p.labels,
    room_name: (p.labels || [])[1] || null,
    structure_name: (p.labels || [])[0] || null,
    creator: p.creator?.actor_identifier,
    created: p.primary_client_created || p.primary_server_created,
    download_uri: p.download_uri || p.download_url,
  }));
}

async function toolGetMoistureReadings({ claim_id, room_id }) {
  const params = {};
  if (room_id) params.room_id = room_id;

  return encirclePaginate(
    `/v2/property_claims/${claim_id}/affected_atmosphere_readings`,
    params
  );
}

async function toolGetClaimReport({ claim_id }) {
  const endpoints = [
    `/v1/property_claims/${claim_id}/report`,
    `/v1/property_claims/${claim_id}/reports`,
    `/v2/property_claims/${claim_id}/report`,
    `/v2/property_claims/${claim_id}/reports`,
    `/v1/property_claims/${claim_id}/documents`,
    `/v2/property_claims/${claim_id}/documents`,
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const data = await encircleGet(endpoint);
      return { endpoint_used: endpoint, report: data };
    } catch (e) {
      errors.push(`${endpoint}: ${e.message}`);
      if (e.message.includes("404") || e.message.includes("Not Found")) continue;
      throw e;
    }
  }

  throw new Error(
    "Report endpoint not found. Tried:\n" +
      errors.join("\n") +
      "\n\nPDF reports may need to be accessed through the Encircle web UI or Google Drive."
  );
}

async function toolGetRooms({ claim_id }) {
  const structures = await encirclePaginate(
    `/v1/property_claims/${claim_id}/structures`
  );

  const allRooms = [];
  for (const struct of structures) {
    if (!struct.id) continue;
    const rooms = await encirclePaginate(
      `/v1/property_claims/${claim_id}/structures/${struct.id}/rooms`
    );
    for (const room of rooms) {
      room._structure_id = struct.id;
      room._structure_name = struct.name || "";
    }
    allRooms.push(...rooms);
  }

  return {
    structures: structures.map((s) => ({ id: s.id, name: s.name })),
    rooms: allRooms,
  };
}

async function toolGetNotes({ claim_id }) {
  const result = { claim_notes: [], room_notes: {} };

  try {
    const data = await encircleGet(`/v2/property_claims/${claim_id}/notes`);
    result.claim_notes = data.list || (Array.isArray(data) ? data : []);
  } catch (e) {
    result.claim_notes_error = e.message;
  }

  try {
    const structures = await encirclePaginate(
      `/v1/property_claims/${claim_id}/structures`
    );
    for (const struct of structures) {
      if (!struct.id) continue;
      const rooms = await encirclePaginate(
        `/v1/property_claims/${claim_id}/structures/${struct.id}/rooms`
      );
      for (const room of rooms) {
        if (!room.id) continue;
        const roomName = room.name || `room_${room.id}`;
        const notes = [];

        try {
          const data = await encircleGet(
            `/v2/property_claims/${claim_id}/structures/${struct.id}/rooms/${room.id}/notes`
          );
          const items = data.list || (Array.isArray(data) ? data : []);
          notes.push(...items);
        } catch {
          /* endpoint may not exist for all rooms */
        }

        try {
          const data = await encircleGet(
            `/v1/property_claims/${claim_id}/structures/${struct.id}/rooms/${room.id}/text_notes`
          );
          const items = Array.isArray(data)
            ? data
            : data.list || [];
          notes.push(...items);
        } catch {
          /* endpoint may not exist for all rooms */
        }

        if (notes.length > 0) {
          result.room_notes[roomName] = notes;
        }
      }
    }
  } catch (e) {
    result.room_notes_error = e.message;
  }

  return result;
}

async function toolGetMedia({ claim_id, type_filter }) {
  const media = await encirclePaginate(
    `/v1/property_claims/${claim_id}/media`
  );

  let filtered = media;
  if (type_filter === "videos") {
    filtered = media.filter((m) => m.source?.type === "VideoFile");
  } else if (type_filter === "photos") {
    filtered = media.filter((m) => {
      const st = m.source?.type || "";
      const ct = m.content_type || "";
      return (
        st.includes("Picture") || st.includes("Photo") || ct.startsWith("image/")
      );
    });
  }

  return {
    total: media.length,
    total_videos: media.filter((m) => m.source?.type === "VideoFile").length,
    total_photos: media.filter((m) => {
      const st = m.source?.type || "";
      const ct = m.content_type || "";
      return st.includes("Picture") || st.includes("Photo") || ct.startsWith("image/");
    }).length,
    filtered_count: filtered.length,
    items: filtered.map((m) => ({
      id: m.id,
      source_type: m.source?.type,
      source_id: m.source?.primary_id,
      filename: m.filename || m.file_name,
      content_type: m.content_type,
      labels: m.labels,
      room_name: (m.labels || [])[1] || null,
      structure_name: (m.labels || [])[0] || null,
      creator: m.creator?.actor_identifier,
      created: m.primary_client_created || m.primary_server_created,
      download_uri: m.download_uri || m.download_url,
    })),
  };
}

async function toolGetEquipment({ claim_id, equipment_type }) {
  const params = {};
  if (claim_id) params.currently_placed_in_claim_id = claim_id;
  if (equipment_type) params.equipment_type = equipment_type;

  return encirclePaginate("/v2/equipment", params);
}

// ---------------------------------------------------------------------------
// Register all tools on an MCP server instance
// ---------------------------------------------------------------------------

function registerTools(server) {
  server.tool(
    "list_claims",
    "List all claims/jobs with policyholder name, address, loss type, dates, and status. Returns newest first by default.",
    {
      limit: z.number().optional().describe("Max claims to return (1-100, default 50)"),
      order: z.enum(["newest", "oldest"]).optional().describe("Sort order (default: newest)"),
    },
    async (args) => {
      try {
        const result = await toolListClaims(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_claim",
    "Get full claim detail by ID — policyholder, address, loss type, dates, adjuster, all fields.",
    {
      claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
    },
    async (args) => {
      try {
        const result = await toolGetClaim(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "search_claims",
    "Search claims by policyholder name, address, claim number, or date range.",
    {
      policyholder_name: z.string().optional().describe("Filter by policyholder name (server-side filter)"),
      address: z.string().optional().describe("Filter by loss address (partial match, case-insensitive)"),
      assignment_identifier: z.string().optional().describe("Filter by assignment/claim number"),
      start_date: z.string().optional().describe("Claims created on or after this date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("Claims created on or before this date (YYYY-MM-DD)"),
    },
    async (args) => {
      try {
        const result = await toolSearchClaims(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_contents_inventory",
    "Get contents inventory for a claim — items, boxes, dispositions, pricing.",
    {
      claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
    },
    async (args) => {
      try {
        const result = await toolGetContentsInventory(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_photos",
    "Get photos for a claim with room names, timestamps, and download URIs. Optionally filter by room name.",
    {
      claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
      room_filter: z.string().optional().describe("Filter photos by room name (partial match, case-insensitive)"),
    },
    async (args) => {
      try {
        const result = await toolGetPhotos(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_moisture_readings",
    "Get atmosphere/moisture readings for a claim — temperature, humidity, moisture content, timestamps.",
    {
      claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
      room_id: z.string().optional().describe("Filter readings by room ID"),
    },
    async (args) => {
      try {
        const result = await toolGetMoistureReadings(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_claim_report",
    "Get the report/document for a claim (PDF link or report data).",
    {
      claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
    },
    async (args) => {
      try {
        const result = await toolGetClaimReport(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_rooms",
    "Get all structures and rooms for a claim. Returns the building/room hierarchy.",
    {
      claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
    },
    async (args) => {
      try {
        const result = await toolGetRooms(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_notes",
    "Get all notes for a claim — claim-level and per-room notes.",
    {
      claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
    },
    async (args) => {
      try {
        const result = await toolGetNotes(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_media",
    "Get all media (photos + videos) for a claim with counts and download URIs.",
    {
      claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
      type_filter: z.enum(["all", "photos", "videos"]).optional().describe("Filter by media type (default: all)"),
    },
    async (args) => {
      try {
        const result = await toolGetMedia(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_equipment",
    "Get drying equipment (dehumidifiers, air movers, air scrubbers) placed on a claim or across the organization.",
    {
      claim_id: z.string().optional().describe("Filter to equipment currently placed on this claim ID"),
      equipment_type: z.string().optional().describe("Filter by equipment type (e.g., dehumidifier, air_mover, air_scrubber)"),
    },
    async (args) => {
      try {
        const result = await toolGetEquipment(args);
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
  res.json({ status: "ok", service: "mcp-encircle" });
});

// --- Bearer token auth middleware ---
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) {
    return next();
  }

  // Check Authorization header first, then query parameter fallback
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
    // Existing session — route to its transport
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (sessionId && !sessions.has(sessionId)) {
    // Session expired or unknown
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
    name: "encircle",
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
  getApiToken(); // Fail fast if token missing

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
