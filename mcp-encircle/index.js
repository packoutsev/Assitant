#!/usr/bin/env node

/**
 * MCP Server for Encircle (Restoration Field Documentation)
 *
 * Exposes Encircle claims, media, rooms, moisture readings, contents,
 * notes, and reports to Claude Code via the Model Context Protocol.
 *
 * Auth: Bearer token from ~/.encircle_credentials.json
 * API:  https://api.encircleapp.com
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOME = homedir();
const CREDENTIALS_PATH = join(HOME, ".encircle_credentials.json");
const API_BASE = "https://api.encircleapp.com";

const log = (...args) => console.error("[mcp-encircle]", ...args);

// ---------------------------------------------------------------------------
// Credential helper
// ---------------------------------------------------------------------------

function loadCredentials() {
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  } catch {
    throw new Error(
      `Cannot read Encircle credentials from ${CREDENTIALS_PATH}. ` +
        `Create the file with: {"api_token": "your-bearer-token-uuid"}`
    );
  }
}

// ---------------------------------------------------------------------------
// Encircle API helpers
// ---------------------------------------------------------------------------

/**
 * Make an authenticated GET request to Encircle API.
 */
async function encircleGet(path, params = {}) {
  const { api_token } = loadCredentials();
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

/**
 * Paginate through Encircle cursor-based API.
 * Handles multiple response formats:
 *   {"list": [...], "cursor": {"after": "..."}}   (most endpoints)
 *   {"data": [...], "paging": {"cursors": {"after": "..."}}}
 *   [...]   (plain array)
 */
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
      // Single object response
      allItems.push(data);
      break;
    }
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Tool implementations
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
  // Encircle API supports server-side filter on policyholder_name & identifiers
  const params = {};
  if (policyholder_name) params.policyholder_name = policyholder_name;
  if (assignment_identifier)
    params.assignment_identifier = assignment_identifier;

  let claims = await encirclePaginate("/v1/property_claims", params);

  // Client-side filters for fields the API doesn't support server-side
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
  // Try multiple known/possible endpoint patterns for contents
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
      // Non-404 errors (auth, server error) — stop trying
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

  // Filter to photos only (not videos)
  let photos = media.filter((m) => {
    const sourceType = m.source?.type || "";
    const contentType = m.content_type || "";
    return (
      sourceType.includes("Picture") ||
      sourceType.includes("Photo") ||
      contentType.startsWith("image/")
    );
  });

  // Optional room filter
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
  // Try multiple known/possible endpoint patterns for reports
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

// -- Bonus tools (from existing Python client knowledge) --

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

  // Claim-level notes
  try {
    const data = await encircleGet(`/v2/property_claims/${claim_id}/notes`);
    result.claim_notes = data.list || (Array.isArray(data) ? data : []);
  } catch (e) {
    result.claim_notes_error = e.message;
  }

  // Room-level notes (iterate structures → rooms → notes)
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

        // v2 notes
        try {
          const data = await encircleGet(
            `/v2/property_claims/${claim_id}/structures/${struct.id}/rooms/${room.id}/notes`
          );
          const items = data.list || (Array.isArray(data) ? data : []);
          notes.push(...items);
        } catch {
          /* endpoint may not exist for all rooms */
        }

        // v1 text notes
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
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "encircle",
  version: "1.0.0",
});

// --- list_claims ---
server.tool(
  "list_claims",
  "List all claims/jobs with policyholder name, address, loss type, dates, and status. Returns newest first by default.",
  {
    limit: z
      .number()
      .optional()
      .describe("Max claims to return (1-100, default 50)"),
    order: z
      .enum(["newest", "oldest"])
      .optional()
      .describe("Sort order (default: newest)"),
  },
  async (args) => {
    try {
      const result = await toolListClaims(args);
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

// --- get_claim ---
server.tool(
  "get_claim",
  "Get full claim detail by ID — policyholder, address, loss type, dates, adjuster, all fields.",
  {
    claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
  },
  async (args) => {
    try {
      const result = await toolGetClaim(args);
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

// --- search_claims ---
server.tool(
  "search_claims",
  "Search claims by policyholder name, address, claim number, or date range. Policyholder name and assignment_identifier use server-side filtering; address and dates use client-side filtering.",
  {
    policyholder_name: z
      .string()
      .optional()
      .describe("Filter by policyholder name (server-side filter)"),
    address: z
      .string()
      .optional()
      .describe("Filter by loss address (partial match, case-insensitive)"),
    assignment_identifier: z
      .string()
      .optional()
      .describe("Filter by assignment/claim number"),
    start_date: z
      .string()
      .optional()
      .describe("Claims created on or after this date (YYYY-MM-DD)"),
    end_date: z
      .string()
      .optional()
      .describe("Claims created on or before this date (YYYY-MM-DD)"),
  },
  async (args) => {
    try {
      const result = await toolSearchClaims(args);
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

// --- get_contents_inventory ---
server.tool(
  "get_contents_inventory",
  "Get contents inventory for a claim — items, boxes, dispositions, pricing. Auto-discovers the correct API endpoint.",
  {
    claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
  },
  async (args) => {
    try {
      const result = await toolGetContentsInventory(args);
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

// --- get_photos ---
server.tool(
  "get_photos",
  "Get photos for a claim with room names, timestamps, and download URIs. Optionally filter by room name.",
  {
    claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
    room_filter: z
      .string()
      .optional()
      .describe("Filter photos by room name (partial match, case-insensitive)"),
  },
  async (args) => {
    try {
      const result = await toolGetPhotos(args);
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

// --- get_moisture_readings ---
server.tool(
  "get_moisture_readings",
  "Get atmosphere/moisture readings for a claim — temperature, humidity, moisture content, timestamps. Optionally filter by room.",
  {
    claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
    room_id: z
      .string()
      .optional()
      .describe("Filter readings by room ID"),
  },
  async (args) => {
    try {
      const result = await toolGetMoistureReadings(args);
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

// --- get_claim_report ---
server.tool(
  "get_claim_report",
  "Get the report/document for a claim (PDF link or report data). Auto-discovers the correct API endpoint.",
  {
    claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
  },
  async (args) => {
    try {
      const result = await toolGetClaimReport(args);
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

// --- get_rooms ---
server.tool(
  "get_rooms",
  "Get all structures and rooms for a claim. Returns the building/room hierarchy with room names, IDs, and structure associations.",
  {
    claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
  },
  async (args) => {
    try {
      const result = await toolGetRooms(args);
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

// --- get_notes ---
server.tool(
  "get_notes",
  "Get all notes for a claim — both claim-level notes and per-room notes (scope notes, adjuster comments, special instructions).",
  {
    claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
  },
  async (args) => {
    try {
      const result = await toolGetNotes(args);
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

// --- get_media ---
server.tool(
  "get_media",
  "Get all media (photos + videos) for a claim with counts and download URIs. Optionally filter by type.",
  {
    claim_id: z.string().describe("The Encircle property claim ID (UUID)"),
    type_filter: z
      .enum(["all", "photos", "videos"])
      .optional()
      .describe("Filter by media type (default: all)"),
  },
  async (args) => {
    try {
      const result = await toolGetMedia(args);
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

// --- get_equipment ---
server.tool(
  "get_equipment",
  "Get drying equipment (dehumidifiers, air movers, air scrubbers) placed on a claim or across the organization.",
  {
    claim_id: z
      .string()
      .optional()
      .describe("Filter to equipment currently placed on this claim ID"),
    equipment_type: z
      .string()
      .optional()
      .describe("Filter by equipment type (e.g., dehumidifier, air_mover, air_scrubber)"),
  },
  async (args) => {
    try {
      const result = await toolGetEquipment(args);
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
  } catch (e) {
    log("ERROR:", e.message);
    process.exit(1);
  }

  log("Starting MCP server (Encircle)...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio.");
}

main().catch((e) => {
  log("Fatal error:", e);
  process.exit(1);
});
