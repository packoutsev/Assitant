# Packouts Hub — Technical Wiki

> **Last updated**: 2026-02-28
> **Owner**: Matthew Roumain (matt@encantobuilders.com)
> **GCP Project**: `packouts-assistant-1800` (region: `us-central1`)
> **Firebase Project**: `packouts-assistant-1800`

This document is a complete technical reference for rebuilding, maintaining, or extending the Packouts Hub ecosystem. It covers the React dashboard, all MCP backend servers, deployment infrastructure, credentials, and data flows.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Frontend — packouts-hub](#2-frontend--packouts-hub)
3. [MCP Protocol & McpClient](#3-mcp-protocol--mcpclient)
4. [Backend — MCP Servers](#4-backend--mcp-servers)
   - [mcp-xcelerate](#41-mcp-xcelerate)
   - [mcp-encircle](#42-mcp-encircle)
   - [mcp-qbo](#43-mcp-qbo)
   - [mcp-gchat](#44-mcp-gchat)
   - [mcp-gsheets](#45-mcp-gsheets)
   - [mcp-gmail](#46-mcp-gmail-local-only)
   - [mcp-quo](#47-mcp-quo-local-only)
5. [Google Cloud Run Deployment](#5-google-cloud-run-deployment)
6. [Firebase Hosting](#6-firebase-hosting)
7. [Credentials & Token Storage](#7-credentials--token-storage)
8. [Data Model — Firestore](#8-data-model--firestore)
9. [External APIs](#9-external-apis)
10. [Zapier Webhook Integration](#10-zapier-webhook-integration)
11. [Key Workflows & Data Flows](#11-key-workflows--data-flows)
12. [Troubleshooting](#12-troubleshooting)
13. [File Index](#13-file-index)
14. [Hub Apps](#14-hub-apps)
    - [SDR Dashboard](#141-sdr-dashboard)
    - [Vault Manager](#142-vault-manager)
    - [GTD Capture](#143-gtd-capture)
    - [AZ Fire Help](#144-az-fire-help)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (React)                     │
│              packouts-hub.web.app                       │
│  ┌──────┐ ┌───────────┐ ┌───────┐ ┌──────────────────┐ │
│  │ Jobs │ │ FireLeads │ │ Sites │ │ Hub (App.tsx)     │ │
│  └──┬───┘ └─────┬─────┘ └───────┘ └──────────────────┘ │
│     │           │                                       │
│     └─────┬─────┘                                       │
│           │  McpClient (JSON-RPC over HTTP)              │
└───────────┼─────────────────────────────────────────────┘
            │
   ┌────────┼────────────────────────────────┐
   │        ▼        Cloud Run (/mcp)        │
   │  ┌───────────┐ ┌──────────┐ ┌────────┐ │
   │  │ xcelerate │ │ encircle │ │  qbo   │ │
   │  │ (Firestore│ │ (REST)   │ │(OAuth) │ │
   │  │ +Drive)   │ │          │ │        │ │
   │  └───────────┘ └──────────┘ └────────┘ │
   │  ┌───────────┐ ┌──────────┐            │
   │  │  gchat    │ │ gsheets  │            │
   │  │ (OAuth)   │ │ (OAuth)  │            │
   │  └───────────┘ └──────────┘            │
   └─────────────────────────────────────────┘

   ┌─────────── Local Only (stdio) ──────────┐
   │  ┌───────┐  ┌───────┐  ┌────────────┐   │
   │  │ gmail │  │  quo  │  │ gdrive     │   │
   │  └───────┘  └───────┘  └────────────┘   │
   └──────────────────────────────────────────┘

   ┌────── External Webhooks ───────┐
   │  Zapier → POST /webhook        │
   │  (Xcelerate → Firestore sync)  │
   └────────────────────────────────┘
```

**Key principles**:
- Frontend is a static React SPA hosted on Firebase Hosting
- All backend data flows through MCP servers (JSON-RPC 2.0 over Streamable HTTP)
- 5 MCP servers deployed to Cloud Run (no auth on `/mcp` — Claude.ai custom connectors don't support bearer tokens)
- 2 MCP servers are local-only (Gmail, Quo/OpenPhone) — used via Claude Code stdio
- Google Drive access goes through `mcp-xcelerate` (which holds Drive OAuth credentials as env vars)
- Xcelerate data originates from Zapier webhooks and is stored in Firestore

---

## 2. Frontend — packouts-hub

### Tech Stack

| Layer | Tool | Version |
|-------|------|---------|
| Framework | React | 19.1.0 |
| Router | react-router-dom | 7.13.1 |
| Icons | lucide-react | 0.511.0 |
| Styling | Tailwind CSS (v4, Vite plugin) | 4.2.1 |
| Build | Vite | 7.3.1 |
| TypeScript | | ~5.9.3 |
| Hosting | Firebase Hosting | — |

### Directory Structure

```
packouts-hub/
├── src/
│   ├── main.tsx          # BrowserRouter + all routes
│   ├── App.tsx           # Hub home — card grid (Operations, Apps, Marketing)
│   ├── App.css           # Tailwind import
│   ├── Websites.tsx      # Marketing sites page (azfirehelp, azfloodhelp, packoutsaz)
│   ├── AZFireHelp.tsx    # AZ Fire Help site preview/builder
│   ├── jobs/
│   │   ├── McpClient.ts  # MCP Streamable HTTP client singleton
│   │   ├── types.ts      # All TypeScript interfaces
│   │   ├── JobList.tsx    # Jobs list page
│   │   ├── JobDetail.tsx  # Job detail page (5 tabs)
│   │   ├── StatusBadge.tsx
│   │   ├── PhotoGrid.tsx
│   │   ├── InvoiceTable.tsx
│   │   └── NoteTimeline.tsx
│   └── fireleads/
│       └── FireLeadList.tsx  # Fire leads page (leads + training tabs)
├── firebase.json         # Hosting config (public: dist, SPA rewrite)
├── .firebaserc           # Project: packouts-assistant-1800, target: packouts-hub
├── package.json
├── vite.config.ts        # React + Tailwind v4 Vite plugins
├── tsconfig.json
└── tsconfig.app.json
```

### Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `App` | Hub home — card grid linking to all features |
| `/jobs` | `JobList` | List of Xcelerate jobs with status filters |
| `/jobs/:jobId` | `JobDetail` | Job detail — overview, docs, photos, invoices, notes |
| `/fire-leads` | `FireLeadList` | Fire leads feed + training resources |
| `/websites` | `Websites` | Marketing sites dashboard |
| `/az-fire-help` | `AZFireHelp` | AZ Fire Help site builder |

### Hub Cards (App.tsx)

Three sections on the home page:

**Operations**:
- **Jobs** → `/jobs` — Xcelerate + Encircle + QBO unified job view
- **Fire Leads** → `/fire-leads` — Live fire lead feed & SDR tracking

**Apps** (external links):
- **SDR Onboarding** → `https://sdr-onboard.web.app`
- **Vault Manager** → `https://packouts-vault.web.app`
- **GTD Capture** → `https://gtd-capture.web.app`

**Marketing**:
- **AZ Fire Help** → `/az-fire-help`
- **Websites** → `/websites`

### JobDetail Tabs

| Tab | Data Source | Key Features |
|-----|------------|--------------|
| **Overview** | Xcelerate + Encircle + QBO | Job info, status, contacts, Encircle claim details, QBO invoices summary |
| **Docs** | Google Drive + Encircle | Individual Drive files from job's project folder + Encircle PDF reports |
| **Photos** | Encircle `get_photos` | Photo grid grouped by room, full-res lightbox |
| **Invoices** | QBO `search_invoices` | Invoice table with status, amounts, links |
| **Notes** | Xcelerate + Encircle | Combined timeline of Xcelerate job notes + Encircle claim/room notes |

### Job Data Linking

Jobs connect to external systems via fields stored in Firestore:

| Field | Links To | How Set |
|-------|----------|---------|
| `encircle_claim_id` | Encircle claim | `link_job` tool or auto-matched by customer name |
| `qbo_customer_name` | QuickBooks customer | `link_job` tool |
| `gdrive_folder_id` | Google Drive project folder | `link_job` tool (batch-linked via script) |
| `gdrive_doc_id` | Google Drive doc (unused) | `link_job` tool |

**Self-healing Encircle links**: If a linked claim returns 404 (merged/deleted in Encircle), `JobDetail.tsx` automatically searches by customer name, re-resolves to the new claim, and persists the updated link via `link_job`.

### Fire Leads Page

Two tabs: **Leads** (live feed) and **Training** (onboarding resources).

Lead cards display: incident type badge, address, contact info (owner/renter/commercial with click-to-call), property details, Google Maps embed, status dropdown, assignee selector.

Status flow: `new` → `contacted` → `pursuing` → `converted` | `no_answer` | `not_interested`

Assignees: Matt, Vanessa, Diana

### TypeScript Interfaces (types.ts)

Key types:
- `XcelerateJob` — 30+ fields including `encircle_claim_id`, `qbo_customer_name`, `gdrive_folder_id`
- `XcelerateNote` — id, type, text, created_at, author
- `ScheduleEntry` — id, event_type, scheduled_date, assigned_to, etc.
- `EncircleRoom`, `EncircleClaim`, `EncircleClaimDetail`, `EncirclePhoto`, `EncircleNote`, `EncircleEquipment`, `MoistureReading`
- `QBOInvoice` — id, doc_number, customer, total, balance, status
- `FireLead` — 25+ fields (incident_number, address, contacts, services, status, assigned_to)
- `FireLeadStatus` — union type: `'new' | 'contacted' | 'pursuing' | 'not_interested' | 'converted' | 'no_answer'`
- `JobTab` — `'overview' | 'docs' | 'photos' | 'invoices' | 'notes'`
- `StatusFilter` — `'all' | 'active' | 'storage' | 'closed'`

---

## 3. MCP Protocol & McpClient

### Protocol

All MCP communication uses **JSON-RPC 2.0** over **Streamable HTTP** (`POST /mcp`).

Request format:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_jobs",
    "arguments": { "limit": 50 }
  }
}
```

Response format:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "[{\"id\":\"1\", ...}]" }
    ]
  }
}
```

### McpClient (src/jobs/McpClient.ts)

Browser-side MCP client. Key details:

**Hardcoded endpoints**:
```typescript
const MCP_URLS = {
  xcelerate: 'https://xceleratewebhook-326811155221.us-central1.run.app/mcp',
  encircle:  'https://mcp-encircle-326811155221.us-central1.run.app/mcp',
  qbo:       'https://mcp-qbo-326811155221.us-central1.run.app/mcp',
}
```

**Session management**:
1. First call sends `initialize` request (protocol version `2024-11-05`)
2. Captures `Mcp-Session-Id` from response header
3. All subsequent requests include this session ID header

**Response parsing**:
- Handles both `application/json` and `text/event-stream` (SSE)
- For SSE, extracts the last `data:` line and parses it
- Tool results are JSON strings inside `content[0].text`

**Usage**: `getMcpClient('xcelerate').callTool<T>('tool_name', { args })`

---

## 4. Backend — MCP Servers

All Cloud Run servers share a common pattern:
- Express app on `PORT` (default 8080)
- CORS: `Access-Control-Allow-Origin: *`, exposes `Mcp-Session-Id`
- `GET /health` → `{ status: "ok", service: "..." }`
- `app.all("/mcp", ...)` → `StreamableHTTPServerTransport`
- In-memory session map (UUID → transport+server), cleaned on transport close
- `GET /sse` → returns 404 with redirect message
- MCP SDK: `@modelcontextprotocol/sdk` ^1.12.1

Each server has two entry points:
- `index.js` — stdio transport for Claude Code / local use
- `server.js` — HTTP transport for Cloud Run

### 4.1 mcp-xcelerate

**Location**: `C:\Users\matth\mcp-xcelerate\`
**Cloud Run service**: `xceleratewebhook`
**URL**: `https://xceleratewebhook-326811155221.us-central1.run.app/mcp`
**Data store**: Google Cloud Firestore (project `packouts-assistant-1800`)

**Tools (11)**:

| Tool | Inputs | Description |
|------|--------|-------------|
| `list_jobs` | `limit?`, `status?` | List jobs from Firestore, newest first |
| `get_job` | `job_id` | Get single job by ID |
| `search_jobs` | `customer_name?`, `address?`, `status?`, `assignee?`, `start_date?`, `end_date?` | Search jobs with filters |
| `get_schedule` | `job_id?`, `start_date?`, `end_date?` | Get schedule entries |
| `get_job_notes` | `job_id`, `type?` | Get job notes (internal/customer/adjuster/scope) |
| `link_job` | `job_id`, `encircle_claim_id?`, `qbo_customer_name?`, `gdrive_doc_id?`, `gdrive_folder_id?` | Link job to external systems |
| `list_drive_files` | `folder_id` | List files in a Google Drive folder |
| `list_fireleads` | `limit?`, `status?`, `assigned_to?` | List fire leads from Firestore |
| `get_firelead` | `lead_id` | Get single fire lead |
| `update_firelead_status` | `lead_id`, `status?`, `notes?`, `assigned_to?` | Update lead status/assignment |
| `ingest_firelead` | `incident_number` + 20 optional fields | Upsert fire lead (idempotent by incident_number) |

**Environment variables**:
| Variable | Purpose |
|----------|---------|
| `AUTH_TOKEN` | Optional bearer token for `/mcp` auth |
| `WEBHOOK_SECRET` | Zapier webhook secret (for `POST /webhook`) |
| `GDRIVE_CLIENT_ID` | Google Drive OAuth client ID |
| `GDRIVE_CLIENT_SECRET` | Google Drive OAuth client secret |
| `GDRIVE_REFRESH_TOKEN` | Google Drive refresh token |
| `GOOGLE_CLOUD_PROJECT` | Firestore project (auto-set on Cloud Run) |

**Additional endpoint**: `POST /webhook` — Zapier webhook receiver (see [section 10](#10-zapier-webhook-integration)).

**Dependencies**: `@google-cloud/firestore`, `@modelcontextprotocol/sdk`, `express`, `zod`

### 4.2 mcp-encircle

**Location**: `C:\Users\matth\mcp-encircle\`
**Cloud Run service**: `mcp-encircle`
**URL**: `https://mcp-encircle-326811155221.us-central1.run.app/mcp`
**API**: `https://api.encircleapp.com`

**Tools (11)**:

| Tool | Inputs | Description |
|------|--------|-------------|
| `list_claims` | `limit?`, `order?` | List claims (newest/oldest) |
| `get_claim` | `claim_id` | Get claim details |
| `search_claims` | `policyholder_name?`, `address?`, `assignment_identifier?`, `start_date?`, `end_date?` | Search claims |
| `get_contents_inventory` | `claim_id` | Get contents inventory (may 404) |
| `get_photos` | `claim_id`, `room_filter?` | Get photos, optionally filtered by room |
| `get_moisture_readings` | `claim_id`, `room_id?` | Get moisture/atmosphere readings |
| `get_claim_report` | `claim_id` | Get claim report (may 404) |
| `get_rooms` | `claim_id` | Get rooms for a claim |
| `get_notes` | `claim_id` | Get claim + room notes |
| `get_media` | `claim_id`, `type_filter?` | Get all media (photos, videos, PDFs) |
| `get_equipment` | `claim_id?`, `equipment_type?` | Get equipment placed on claim |

**Pagination**: `encirclePaginate()` handles cursor-based and array responses, up to 2000 items (20 pages × 100).

**Environment variables**:
| Variable | Purpose |
|----------|---------|
| `ENCIRCLE_API_TOKEN` | Encircle API bearer token (required) |
| `AUTH_TOKEN` | Optional bearer token for `/mcp` auth |

**Known limitations**:
- `get_claim_report` returns 404 for most claims
- `get_contents_inventory` returns 404 (API plan limitation)
- PDFs are available through `get_media` with `source_type: "ClaimPdfReport"`

### 4.3 mcp-qbo

**Location**: `C:\Users\matth\mcp-qbo\`
**Cloud Run service**: `mcp-qbo`
**URL**: `https://mcp-qbo-326811155221.us-central1.run.app/mcp`
**API**: `https://quickbooks.api.intuit.com/v3/company/{realmId}`

**Tools (7)**:

| Tool | Inputs | Description |
|------|--------|-------------|
| `get_ar_aging` | _(none)_ | Accounts receivable aging report |
| `get_profit_and_loss` | `start_date?`, `end_date?`, `accounting_method?` | P&L report |
| `get_balance_sheet` | `as_of_date?`, `accounting_method?` | Balance sheet |
| `search_invoices` | `customer_name?`, `start_date?`, `end_date?`, `status?`, `min_amount?`, `max_amount?` | Search invoices |
| `get_invoice` | `invoice_id` | Get single invoice detail |
| `list_customers` | _(none)_ | List all QBO customers |
| `query` | `sql` | Run arbitrary QBO query (SQL-like) |

**Environment variables**:
| Variable | Purpose |
|----------|---------|
| `QBO_CLIENT_ID` | Intuit OAuth client ID |
| `QBO_CLIENT_SECRET` | Intuit OAuth client secret |
| `QBO_REALM_ID` | QuickBooks company ID |
| `GCS_BUCKET` | Token storage bucket (default: `packouts-qbo-tokens`) |
| `QBO_INITIAL_TOKENS` | Base64 JSON tokens for first deploy |
| `AUTH_TOKEN` | Optional bearer token for `/mcp` auth |

**Token management**: OAuth 2.0 refresh tokens stored in GCS `packouts-qbo-tokens/tokens.json`. Auto-refreshes within 120s of expiry. QBO API minor version: `75`.

### 4.4 mcp-gchat

**Location**: `C:\Users\matth\mcp-gchat\`
**Cloud Run service**: `mcp-gchat`
**URL**: `https://mcp-gchat-326811155221.us-central1.run.app/mcp`
**API**: `https://chat.googleapis.com/v1`

**Tools (5)**:

| Tool | Inputs | Description |
|------|--------|-------------|
| `list_spaces` | `filter?`, `limit?` | List Google Chat spaces |
| `get_messages` | `space_name`, `start_date?`, `end_date?`, `thread_name?`, `limit?`, `order?` | Get messages from a space |
| `search_messages` | `space_name`, `keyword?`, `sender_name?`, `start_date?`, `end_date?`, `limit?` | Search messages (client-side filter) |
| `send_message` | `space_name`, `text`, `thread_name?` | Send a message to a space |
| `get_thread` | `space_name`, `thread_name` | Get all messages in a thread |

**Environment variables**:
| Variable | Purpose |
|----------|---------|
| `GCHAT_CLIENT_ID` | Google OAuth client ID |
| `GCHAT_CLIENT_SECRET` | Google OAuth client secret |
| `GCS_BUCKET` | Token storage bucket (default: `packouts-gchat-tokens`) |
| `GCHAT_INITIAL_TOKENS` | Base64 JSON tokens for first deploy |

**Token management**: GCS `packouts-gchat-tokens/tokens.json`. Google does not return a new refresh_token on refresh — old one is preserved.

**Note**: No `AUTH_TOKEN` check on `/mcp` endpoint (unauthenticated).

### 4.5 mcp-gsheets

**Location**: `C:\Users\matth\mcp-gsheets\`
**Cloud Run service**: `mcp-gsheets`
**URL**: `https://mcp-gsheets-326811155221.us-central1.run.app/mcp`
**API**: Google Sheets API v4

**Tools (8)**:

| Tool | Inputs | Description |
|------|--------|-------------|
| `open_spreadsheet` | `spreadsheet_id` | Get spreadsheet metadata |
| `list_sheets` | `spreadsheet_id` | List tabs in a spreadsheet |
| `read_range` | `spreadsheet_id`, `range` | Read cells (A1 notation) |
| `read_sheet` | `spreadsheet_id`, `sheet_name` | Read entire sheet/tab |
| `write_range` | `spreadsheet_id`, `range`, `values` | Write cells (2D array) |
| `append_rows` | `spreadsheet_id`, `range`, `values` | Append rows |
| `create_spreadsheet` | `title`, `sheet_names?` | Create new spreadsheet |
| `clear_range` | `spreadsheet_id`, `range` | Clear cells |

**Environment variables**:
| Variable | Purpose |
|----------|---------|
| `GSHEETS_CLIENT_ID` | Google OAuth client ID |
| `GSHEETS_CLIENT_SECRET` | Google OAuth client secret |
| `GCS_BUCKET` | Token storage bucket (default: `packouts-gchat-tokens` — shared!) |
| `GCS_TOKEN_PATH` | Token file path (default: `gsheets-tokens.json`) |
| `GSHEETS_INITIAL_TOKENS` | Base64 JSON tokens for first deploy |

**Token management**: GCS `packouts-gchat-tokens/gsheets-tokens.json` (same bucket as gchat, different file).

**Note**: Tool implementations live in a separate `sheets.js` module.

### 4.6 mcp-gmail (Local Only)

**Location**: `C:\Users\matth\mcp-gmail\`
**Deployment**: Local only — no Cloud Run
**Entry point**: `index.js` (stdio only)
**API**: `https://gmail.googleapis.com/gmail/v1/users/me`

**Tools (6)**:

| Tool | Inputs | Description |
|------|--------|-------------|
| `list_labels` | _(none)_ | List Gmail labels |
| `search_messages` | `query?`, `label?`, `max_results?` | Search messages |
| `get_message` | `message_id`, `format?` | Get single message |
| `get_thread` | `thread_id`, `format?` | Get thread |
| `send_message` | `to`, `subject`, `body`, `cc?`, `bcc?`, `reply_to_message_id?` | Send email |
| `modify_message` | `message_id`, `add_labels?`, `remove_labels?` | Add/remove labels |

**Credentials**: File-based — `~/.gmail_credentials.json` (client_id/secret) + `~/.gmail_tokens.json` (OAuth tokens). Auto-refreshes when within 120s of expiry.

**Also contains**: `fire-leads-processor.js` — Polls Gmail "Fire Leads" label, parses LIVE LEAD emails (25+ fields), posts formatted call sheets to Google Chat, and ingests to Firestore via xcelerate MCP.

### 4.7 mcp-quo (Local Only)

**Location**: `C:\Users\matth\mcp-quo\`
**Deployment**: Local only — no Cloud Run
**Entry point**: `index.js` (stdio only)
**API**: `https://api.openphone.com/v1` (OpenPhone/Quo)

**Tools (9)**:

| Tool | Inputs | Description |
|------|--------|-------------|
| `list_phone_numbers` | _(none)_ | List phone numbers |
| `list_calls` | `phone_number_id?`, `phone_number_name?`, `participant?`, `start_date?`, `end_date?`, `direction?`, `limit?` | List calls with filters |
| `get_call_transcript` | `call_id` | Get call transcript |
| `get_call_summary` | `call_id` | Get AI call summary |
| `get_call_recording` | `call_id` | Get recording URL |
| `list_messages` | `phone_number_id?`, `phone_number_name?`, `participant?`, `start_date?`, `end_date?`, `limit?` | List text messages |
| `list_conversations` | `phone_number_id?`, `phone_number_name?`, `limit?` | List conversations |
| `get_conversation` | `phone_number_id?`, `phone_number_name?`, `external_number?` | Get conversation details |
| `send_message` | `phone_number_id?`, `phone_number_name?`, `to`, `text` | Send SMS/text |

**Credentials**: File-based — `~/.quo_credentials.json` containing `{ "api_key": "..." }`. Auth header: `Authorization: <api_key>` (no "Bearer" prefix).

---

## 5. Google Cloud Run Deployment

### Services

| Service Name | Source Dir | URL |
|-------------|-----------|-----|
| `xceleratewebhook` | `mcp-xcelerate/` | `https://xceleratewebhook-326811155221.us-central1.run.app` |
| `mcp-encircle` | `mcp-encircle/` | `https://mcp-encircle-326811155221.us-central1.run.app` |
| `mcp-qbo` | `mcp-qbo/` | `https://mcp-qbo-326811155221.us-central1.run.app` |
| `mcp-gchat` | `mcp-gchat/` | `https://mcp-gchat-326811155221.us-central1.run.app` |
| `mcp-gsheets` | `mcp-gsheets/` | `https://mcp-gsheets-326811155221.us-central1.run.app` |

### Deploy Command

From each `mcp-*/` directory:

```bash
gcloud run deploy <service-name> --source . --region us-central1 --no-invoker-iam-check --quiet
```

`--no-invoker-iam-check` bypasses the GCP org policy that blocks `allUsers` IAM binding. Without this flag, deploy fails because Cloud Run won't allow unauthenticated access.

### Setting Environment Variables

```bash
gcloud run services update <service-name> \
  --region us-central1 \
  --set-env-vars "KEY1=val1,KEY2=val2"
```

Or during deploy:

```bash
gcloud run deploy <service-name> --source . --region us-central1 \
  --set-env-vars "KEY=value" --no-invoker-iam-check --quiet
```

### GCP CLI

- Installed at `C:\Users\matth\google-cloud-sdk\` (v557.0.0)
- Authenticated as `matt@encantobuilders.com`
- Path: `C:\Users\matth\google-cloud-sdk\bin\gcloud.cmd`
- On Windows Git Bash, use: `"C:/Users/matth/google-cloud-sdk/bin/gcloud.cmd"` with quotes

---

## 6. Firebase Hosting

### Configuration

**Project**: `packouts-assistant-1800`
**Hosting target**: `packouts-hub`
**Live URL**: `https://packouts-hub.web.app`

**firebase.json**:
```json
{
  "hosting": {
    "target": "packouts-hub",
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

### Build & Deploy

```bash
cd packouts-hub
npm run build          # tsc -b && vite build → dist/
npx firebase deploy --only hosting:packouts-hub
```

### Other Firebase-Hosted Apps

| App | URL | Source |
|-----|-----|--------|
| SDR Onboarding | `https://sdr-onboard.web.app` | `sdr-dashboard/` |
| Vault Manager | `https://packouts-vault.web.app` | `vault-manager/` |
| GTD Capture | `https://gtd-capture.web.app` | `gtd-capture/` |

---

## 7. Credentials & Token Storage

### Cloud-Based (GCS Buckets)

| Bucket | File | Used By | Content |
|--------|------|---------|---------|
| `packouts-qbo-tokens` | `tokens.json` | mcp-qbo | QBO OAuth access+refresh tokens |
| `packouts-gchat-tokens` | `tokens.json` | mcp-gchat | Google Chat OAuth tokens |
| `packouts-gchat-tokens` | `gsheets-tokens.json` | mcp-gsheets | Google Sheets OAuth tokens |

### Cloud Run Environment Variables

| Service | Key Variables |
|---------|-------------|
| `xceleratewebhook` | `WEBHOOK_SECRET`, `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN` |
| `mcp-encircle` | `ENCIRCLE_API_TOKEN` |
| `mcp-qbo` | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REALM_ID` |
| `mcp-gchat` | `GCHAT_CLIENT_ID`, `GCHAT_CLIENT_SECRET` |
| `mcp-gsheets` | `GSHEETS_CLIENT_ID`, `GSHEETS_CLIENT_SECRET` |

### Local Credential Files

| File | Purpose |
|------|---------|
| `~/.gmail_credentials.json` | Gmail OAuth client_id + client_secret |
| `~/.gmail_tokens.json` | Gmail OAuth access + refresh tokens |
| `~/.quo_credentials.json` | OpenPhone/Quo API key |
| `~/.encircle_credentials.json` | Encircle API token (local backup) |
| `~/.qbo_credentials.json` | QBO client_id + client_secret (local backup) |
| `~/.qbo_tokens.json` | QBO OAuth tokens (local backup) |
| `~/.gchat_credentials.json` | Google Chat client_id + client_secret (local backup) |
| `~/.gchat_tokens.json` | Google Chat OAuth tokens (local backup) |
| `~/.gsheets_credentials.json` | Google Sheets client_id + client_secret (local backup) |
| `~/.gsheets_tokens.json` | Google Sheets OAuth tokens (local backup) |
| `~/mcp-gdrive-setup/.gdrive-server-credentials.json` | Google Drive OAuth tokens |

### Token Refresh Patterns

**QBO**: Server auto-refreshes within 120s of expiry. On refresh, writes updated tokens to GCS. If refresh fails, logs error but doesn't crash.

**Google (Chat/Sheets/Drive)**: Same pattern. Google does NOT return a new refresh_token on refresh — the old one is preserved. If refresh token is revoked, manual re-auth is required.

**Gmail**: Same auto-refresh pattern, writes to local `~/.gmail_tokens.json`.

### Bootstrap Pattern (First Deploy)

QBO, GChat, GSheets all support `*_INITIAL_TOKENS` env var (base64 JSON) for bootstrapping tokens on first deploy before GCS files exist:

```bash
# Encode tokens
echo '{"access_token":"...","refresh_token":"..."}' | base64

# Set on deploy
gcloud run deploy mcp-qbo --source . --region us-central1 \
  --set-env-vars "QBO_INITIAL_TOKENS=<base64>" --no-invoker-iam-check
```

---

## 8. Data Model — Firestore

**Project**: `packouts-assistant-1800`

### Collections

#### `jobs` (top-level)

Core job records, created/updated by Zapier webhooks.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Firestore document ID |
| `job_number` | string | Xcelerate job number |
| `customer_name` | string | Full name |
| `property_address` | string | Job site address |
| `property_city` | string | |
| `property_state` | string | |
| `property_zip` | string | |
| `customer_phone` | string | |
| `customer_email` | string | |
| `status` | string | Active, Storage, Closed, etc. |
| `substatus` | string | |
| `loss_type` | string | |
| `date_of_loss` | string (ISO) | |
| `date_received` | string (ISO) | |
| `date_scheduled` | string (ISO) | |
| `date_started` | string (ISO) | |
| `date_completed` | string (ISO) | |
| `updated_at` | string (ISO) | |
| `project_manager` | string | |
| `assigned_crew` | array | |
| `estimator` | string | |
| `estimated_amount` | number | |
| `insurance_company` | string | |
| `claim_number` | string | |
| `encircle_claim_id` | string/number | Link to Encircle |
| `qbo_customer_name` | string | Link to QuickBooks |
| `gdrive_folder_id` | string | Google Drive project folder ID |
| `gdrive_doc_id` | string | Google Drive doc ID (unused) |

**Subcollections**:
- `jobs/{id}/notes` — Job notes (type: internal/customer/adjuster/scope)
- `jobs/{id}/schedule` — Schedule entries
- `jobs/{id}/events` — Webhook event audit log

#### `fireleads` (top-level)

Fire leads ingested from Gmail via `fire-leads-processor.js`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Firestore doc ID |
| `incident_number` | string | Unique key (upsert target) |
| `incident_type` | string | STRUCTURE FIRE, etc. |
| `address` | string | |
| `city` | string | |
| `state` | string | |
| `zip` | string | |
| `county` | string | |
| `date` | string | |
| `time` | string | |
| `fire_department` | string | |
| `notes` | string | |
| `owner_name` | string | |
| `owner_phone` | string | |
| `owner_address` | string | |
| `renter_name` | string | |
| `renter_phone` | string | |
| `commercial_name` | string | |
| `commercial_phone` | string | |
| `occupancy` | string | |
| `property_details` | string | |
| `property_value` | string | |
| `services` | array | |
| `status` | string | new/contacted/pursuing/converted/no_answer/not_interested |
| `assigned_to` | string | |
| `source_email_id` | string | Gmail message ID |
| `received_at` | string (ISO) | |
| `updated_at` | string (ISO) | |

---

## 9. External APIs

### Encircle

- **Base URL**: `https://api.encircleapp.com`
- **Auth**: `Authorization: Bearer <ENCIRCLE_API_TOKEN>`
- **Rate limits**: Standard (pagination handles large results)
- **Key endpoints used**: `/property-claims`, `/property-claims/{id}`, `/property-claims/{id}/photos`, `/property-claims/{id}/rooms`, `/property-claims/{id}/media`, `/property-claims/{id}/notes`, `/property-claims/{id}/moisture-readings`, `/property-claims/{id}/equipment`

### QuickBooks Online

- **Base URL**: `https://quickbooks.api.intuit.com/v3/company/{realmId}`
- **Auth**: OAuth 2.0 (access token refreshed from GCS)
- **Minor version**: `75`
- **Token refresh**: `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`

### Google Chat

- **Base URL**: `https://chat.googleapis.com/v1`
- **Auth**: OAuth 2.0 (scopes: `chat.spaces.readonly`, `chat.messages`, `chat.messages.create`)
- **Limitation**: No server-side full-text search — keyword/sender filtering is done client-side

### Google Sheets

- **Base URL**: `https://sheets.googleapis.com/v4/spreadsheets`
- **Auth**: OAuth 2.0 (scopes: `spreadsheets`)

### Google Drive

- **Base URL**: `https://www.googleapis.com/drive/v3`
- **Auth**: OAuth 2.0 via `mcp-xcelerate` (refresh token as env var)
- **Scopes**: `drive.readonly`
- **Used for**: Listing files in job project folders

### Gmail

- **Base URL**: `https://gmail.googleapis.com/gmail/v1/users/me`
- **Auth**: OAuth 2.0 (scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`)
- **Account**: `matthew.roumain@1800packouts.com`

### OpenPhone (Quo)

- **Base URL**: `https://api.openphone.com/v1`
- **Auth**: API key (no Bearer prefix)

---

## 10. Zapier Webhook Integration

Xcelerate job data flows into Firestore via Zapier:

```
Xcelerate CRM → Zapier → POST /webhook → Firestore
```

**Endpoint**: `POST https://xceleratewebhook-326811155221.us-central1.run.app/webhook`

**Auth**: `X-Webhook-Secret` header must match `WEBHOOK_SECRET` env var.

**Event types**:

| `event_type` | Action |
|-------------|--------|
| `new_job` | Creates doc in `jobs/` collection |
| `job_updated` | Merges fields into existing doc |
| `status_change` | Updates `status` and `substatus` fields |
| `schedule_change` | Adds entry to `jobs/{id}/schedule` subcollection |
| `notes_added` | Adds entry to `jobs/{id}/notes` subcollection |

All events are appended to `jobs/{id}/events` as an audit log.

**Webhook payload format**:
```json
{
  "event_type": "new_job",
  "job_id": "123",
  "data": {
    "customer_name": "John Smith",
    "property_address": "123 Main St",
    ...
  }
}
```

---

## 11. Key Workflows & Data Flows

### Job Detail Page Load

```
1. User navigates to /jobs/:jobId
2. McpClient calls xcelerate.get_job(jobId)
3. In parallel, resolves:
   a. Encircle claim (via encircle_claim_id or name search)
   b. QBO invoices (via qbo_customer_name or name match)
4. With Encircle claim resolved, fetches:
   - get_claim (detail)
   - get_photos
   - get_notes
   - get_media (for PDFs)
5. If job has gdrive_folder_id and Docs tab is selected:
   - xcelerate.list_drive_files(folder_id)
6. Self-healing: if linked claim returns 404 → search by name → re-link
```

### Fire Lead Ingestion

```
1. fireleads.com sends "LIVE LEAD" email to matthew.roumain@1800packouts.com
2. Email lands in Gmail with "Fire Leads" label (Label_255036435287786768)
3. fire-leads-processor.js polls Gmail for new messages
4. Parser extracts 25+ fields (address, contacts, property, services)
5. Posts formatted call sheet to Google Chat (#fire-leads space)
6. Calls xcelerate.ingest_firelead() → upserts to Firestore by incident_number
7. Lead appears in /fire-leads page with status "new"
8. SDR updates status/assignment via dropdown → calls update_firelead_status
```

### Google Drive → Job Linking

```
1. Google Drive has project folders at:
   https://drive.google.com/drive/folders/1JIV2OEzO3wQ66PpIXp2__6ZDR1riQAPF
2. Folder naming convention: "LastName, FirstName" (e.g., "Hart, Frank")
3. Jobs are linked via link_job(job_id, gdrive_folder_id)
4. 23 of 31 jobs were batch-linked via name matching
5. On Docs tab, list_drive_files shows individual files from the folder
```

---

## 12. Troubleshooting

### "Session not found" errors from MCP

The Cloud Run MCP servers use in-memory session storage. If the server instance is recycled (cold start, scale-to-zero, or new deploy), all sessions are lost. The McpClient will re-initialize automatically on the next call.

### Encircle claim returns 404

The claim was likely merged in Encircle. The self-healing logic in `JobDetail.tsx` handles this automatically by searching by customer name and re-linking. If manual intervention is needed:

```
xcelerate.link_job({ job_id: "XXX", encircle_claim_id: "NEW_CLAIM_ID" })
```

### QBO/Google token expired

Tokens auto-refresh. If the refresh token itself is revoked:

1. Re-authenticate using the OAuth flow for that service
2. Get new access + refresh tokens
3. Update via:
   ```bash
   # For GCS-stored tokens
   echo '{"access_token":"...","refresh_token":"...","expiry_date":...}' | \
     gsutil cp - gs://packouts-qbo-tokens/tokens.json

   # Or via env var bootstrap
   gcloud run services update <service> --region us-central1 \
     --set-env-vars "QBO_INITIAL_TOKENS=$(echo '...' | base64)"
   ```

### Google Drive refresh token revoked

The Drive refresh token is stored as a Cloud Run env var (`GDRIVE_REFRESH_TOKEN`) on the xcelerate service. If revoked:

1. Re-authenticate via OAuth (use the custom flow at `mcp-gdrive-setup/` or manually)
2. Update the env var:
   ```bash
   gcloud run services update xceleratewebhook --region us-central1 \
     --set-env-vars "GDRIVE_REFRESH_TOKEN=<new_token>"
   ```

### Build fails

```bash
cd packouts-hub
npm run build   # tsc -b && vite build
```

Common issues:
- TypeScript errors — fix in the source files
- Missing dependencies — `npm install`
- Tailwind v4 uses Vite plugin, no `tailwind.config.js` or `postcss.config.js`

### Deploy fails with IAM error

```
ERROR: Binding for allUsers is not allowed by organization policy
```

Fix: Add `--no-invoker-iam-check` to the deploy command.

### gcloud path issues on Windows

```bash
# In Git Bash, use:
CLOUDSDK_PYTHON="" "C:/Users/matth/google-cloud-sdk/bin/gcloud.cmd" run deploy ...
```

---

## 13. File Index

### Frontend (packouts-hub/)

| File | Purpose |
|------|---------|
| `src/main.tsx` | Routes |
| `src/App.tsx` | Hub home page |
| `src/App.css` | Tailwind import |
| `src/Websites.tsx` | Marketing sites dashboard |
| `src/AZFireHelp.tsx` | AZ Fire Help page |
| `src/jobs/McpClient.ts` | MCP HTTP client |
| `src/jobs/types.ts` | TypeScript interfaces |
| `src/jobs/JobList.tsx` | Job list page |
| `src/jobs/JobDetail.tsx` | Job detail (5 tabs) |
| `src/jobs/StatusBadge.tsx` | Status badge component |
| `src/jobs/PhotoGrid.tsx` | Photo grid component |
| `src/jobs/InvoiceTable.tsx` | Invoice table component |
| `src/jobs/NoteTimeline.tsx` | Note timeline component |
| `src/fireleads/FireLeadList.tsx` | Fire leads page |
| `firebase.json` | Firebase Hosting config |
| `.firebaserc` | Firebase project config |
| `vite.config.ts` | Vite + Tailwind v4 config |
| `package.json` | Dependencies + scripts |

### MCP Servers

| Directory | Entry Points | Cloud Run Service |
|-----------|-------------|-------------------|
| `mcp-xcelerate/` | `index.js`, `server.js`, `tools.js` | `xceleratewebhook` |
| `mcp-encircle/` | `index.js`, `server.js` | `mcp-encircle` |
| `mcp-qbo/` | `index.js`, `server.js` | `mcp-qbo` |
| `mcp-gchat/` | `index.js`, `server.js` | `mcp-gchat` |
| `mcp-gsheets/` | `index.js`, `server.js`, `sheets.js` | `mcp-gsheets` |
| `mcp-gmail/` | `index.js`, `fire-leads-processor.js` | _(local only)_ |
| `mcp-quo/` | `index.js` | _(local only)_ |
| `mcp-gdrive-setup/` | MCP gdrive server (patched) | _(local only)_ |

### Other Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI assistant instructions |
| `sdr-onboarding.md` | SDR onboarding guide |
| `sdr-playbook.md` | SDR playbook |
| `estimator/` | Xactimate estimation pipeline |
| `cloud-fn-ar-review/` | Cloud Function for AR review |
| `cloud-fn-linkedin-import/` | Cloud Function for LinkedIn import |
| `coaching-agent/` | Coaching agent |
| `daily-sales-tracker/` | Sales tracking |
| `azfirehelp/` | AZ Fire Help site source |
| `sdr-dashboard/` | SDR dashboard app |
| `vault-manager/` | Vault manager app |
| `gtd-capture/` | GTD capture app |

---

## Quick Reference — Common Operations

### Deploy an MCP server update
```bash
cd mcp-xcelerate  # or whichever server
gcloud run deploy xceleratewebhook --source . --region us-central1 --no-invoker-iam-check --quiet
```

### Build and deploy the dashboard
```bash
cd packouts-hub
npm run build && npx firebase deploy --only hosting:packouts-hub
```

### Link a job to external systems
```
xcelerate.link_job({
  job_id: "123",
  encircle_claim_id: "4370340",
  qbo_customer_name: "Hart, Frank",
  gdrive_folder_id: "1abc..."
})
```

### Check Cloud Run logs
```bash
gcloud run services logs read xceleratewebhook --region us-central1 --limit 50
```

### View Firestore data
```
https://console.firebase.google.com/project/packouts-assistant-1800/firestore
```

### Re-run fire leads processor
```bash
cd mcp-gmail
node fire-leads-processor.js
```

---

## 14. Hub Apps

Four standalone apps are linked from the hub as external tiles. Each is independently deployed to Firebase Hosting under the same GCP project (`packouts-assistant-1800`), except GTD Capture which has its own project.

| App | URL | Source Dir | Hosting Target | Framework |
|-----|-----|-----------|---------------|-----------|
| SDR Dashboard | `sdr-onboard.web.app` | `sdr-dashboard/` | `sdr-onboard` | React 19 + Vite + Tailwind v4 |
| Vault Manager | `packouts-vault.web.app` | `vault-manager/` | `packouts-vault` | React 19 + Vite + Tailwind v4 + Three.js |
| GTD Capture | `gtd-capture.web.app` | `gtd-capture/` | (default) | Vanilla JS PWA (no build step) |
| AZ Fire Help | `azfirehelp.com` | `azfirehelp/` | `azfirehelp` | Astro 5 + Tailwind v3 |

### 14.1 SDR Dashboard

**Purpose**: Vanessa Rivas's 4-week SDR onboarding portal — daily tasks, call scripts, KPI tracking, training modules, and industry education.

**URL**: `https://sdr-onboard.web.app`
**Source**: `C:\Users\matth\sdr-dashboard\`

#### Tech Stack

| Layer | Tool | Version |
|-------|------|---------|
| Framework | React | 19.2.0 |
| Build | Vite | 7.3 |
| Styling | Tailwind CSS v4 (Vite plugin) | 4.2.1 |
| Icons | lucide-react | 0.575.0 |
| TypeScript | | 5.9 |

#### Auth

Two-tier client-side PIN check (no backend auth):
- Regular PIN: `1800` (or `VITE_ACCESS_PIN` env var)
- Admin PIN: `admin1800` (or `VITE_ADMIN_PIN` env var)
- Stored in `sessionStorage` (clears on tab close)

#### Data Sources

**Primary**: Google Sheets via Google Apps Script
- Sheet ID: `11FojZ8VoxD9UlsEqm4pbELDWGNZEzSI-9Zok4Xt7MM4`
- Apps Script Web App URL stored in `VITE_APPS_SCRIPT_URL` env var
- `GET ?tab=<TabName>` → returns tab as 2D JSON array
- `POST {tab, row, col, value}` → writes single cell
- Tabs: `Daily Plan`, `Tool Access Checklist`, `KPI Ramp`, `Training Log`, `Quick Reference`

**Fallback**: Full mock dataset in `src/api/mockData.ts` (used when no Apps Script URL)

**Static content** (baked into TypeScript):
- `src/content/lessons.ts` — 7 industry education lessons
- `src/content/playbook.ts` — 5 call scripts, voicemail/text rules, templates, daily schedule
- `src/content/adminPrep.ts` — Pre-launch checklist + 17 scheduled meetings

**Audio files**: `public/audio/` — 8 MP3s (full course + per-lesson podcasts)

#### Views

| View | Description |
|------|-------------|
| **Today** | Daily task list filtered by current date, progress bar, step numbers, "START HERE" highlight, Google Meet join buttons |
| **Learn** | 7 industry lessons — embedded Google Slides, audio player, written content, completion tracking |
| **Playbook** | 4 tabs — Scripts (5 call scripts), Rules (voicemail/text/escalation), Templates (copy-to-clipboard), Schedule (daily time blocks) |
| **Training** | 30 training modules by category with check/uncheck (syncs to sheet), progress ring, live session banner |
| **KPIs** | 3-section table across 4 weeks, inline editable actuals, hero metric card (Meaningful Conversations/Day) |
| **Progress** | Overall progress rings, week-by-week cards, key milestone tracker |
| **Admin** | Matt-only (admin PIN) — pre-launch checklist, scheduled meetings with join buttons |

#### Navigation

No React Router — uses `useState<ViewId>` for 7 views. Desktop sidebar + mobile bottom nav.

#### Deploy

```bash
cd sdr-dashboard
npm run build
firebase deploy --only hosting:sdr-onboard
```

Env vars needed at build time: `VITE_APPS_SCRIPT_URL`, `VITE_ACCESS_PIN`, `VITE_ADMIN_PIN`

---

### 14.2 Vault Manager

**Purpose**: 3D warehouse management for the 1-800-Packouts storage vault — vault assignments, QR scanning, customer tracking, billing status.

**URL**: `https://packouts-vault.web.app`
**Source**: `C:\Users\matth\vault-manager\`

#### Tech Stack

| Layer | Tool | Version |
|-------|------|---------|
| Framework | React | 19.2.0 |
| Build | Vite | 7.3 |
| Styling | Tailwind CSS v4 (dark theme) | 4.2.1 |
| 3D Engine | Three.js via @react-three/fiber + drei | 0.183 |
| Drag-and-drop | @dnd-kit | 6.3 |
| QR Scanning | html5-qrcode | 2.3.8 |
| QR Generation | qrcode.react | 4.2.0 |
| Icons | lucide-react | 0.575.0 |

#### Auth

None. Open to anyone with the URL (internal warehouse tool).

#### Data Sources

**No backend** — fully client-side:
- Seed data: `src/data/seedData.ts` — real warehouse layout from 2/24/26 audit (5 customers, 4 zones, actual vault numbers and billing dates)
- State: `useReducer` + `WarehouseContext` persisted to `localStorage` (`vault-manager-state`, `vault-manager-boxes`)
- No Encircle, QBO, or Xcelerate integration

#### Features

**Primary views** (toggle in header):
- **3D Warehouse Map** (default) — Full Three.js canvas: procedurally textured brick walls, concrete floor, pendant lights, ACES tone mapping. Each vault is a 3D wooden box with status color strip, flag sphere, HTML overlay label. Camera presets: Top/Iso/Front/Back/Floor.
- **2D Grid Map** — dnd-kit drag-and-drop grid by zone/row. Drag to swap or move vaults.

**Panels**:
- **VaultDetail** — Edit customer, status, flag, claim ID, notes. Shows billing info (date received, billed through, past due), A/R balance, scanned contents.
- **CustomerSidebar** — Customer directory with vault counts, click to highlight on map.
- **ActivityLog** — Timestamped audit trail of all changes.
- **QRLabelGenerator** — Brother QL 62mm continuous roll labels. Fields: customer, project #, packout date, box/TAG qty. QR format: `1800PO|BOX|1|Hart, Frank|4221766|2026-02-24`.
- **QuickScan** — Fullscreen camera QR scanner with IN/OUT mode, live feed, 2s debounce.
- **LayoutEditor** — Add/remove zones, rows, vaults. Zone types: back-wall, center, floor, offsite (GYMO). Row types: vault (7x7x5), large-pallet (7x2x5), small-pallet (4x2x4).

**Dashboard strip**: Occupied / Empty / Pallets / Mold / Utilization % / Flags (A/R Due, Escalated, Hazard, Verify)

#### File Structure

```
src/
  App.tsx                    # Root layout + header + toolbar
  types/index.ts             # All types + QR encode/decode
  contexts/WarehouseContext.tsx  # Global state (useReducer + localStorage)
  data/seedData.ts           # Real 2/24/26 audit data
  components/
    WarehouseMap3D.tsx       # 3D Three.js view
    WarehouseMap.tsx          # 2D grid view
    Vault3D.tsx              # 3D vault box component
    VaultCard.tsx            # 2D vault card (sortable)
    VaultDetail.tsx          # Vault editor panel
    VaultInventory.tsx       # Box/TAG list
    CustomerSidebar.tsx      # Customer directory
    ActivityLog.tsx          # Change audit trail
    QRLabelGenerator.tsx     # Print labels
    QRScanner.tsx            # Per-vault scanner
    QuickScan.tsx            # Fullscreen IN/OUT scanner
    LayoutEditor.tsx         # Zone/row editor
    Dashboard.tsx            # Stats bar
    SearchBar.tsx            # Search
    ProceduralTextures.ts    # Canvas textures (brick, wood, concrete)
    CameraControls.tsx       # Three.js camera presets
```

#### Deploy

```bash
cd vault-manager
npm run build
firebase deploy --only hosting:packouts-vault
```

---

### 14.3 GTD Capture

**Purpose**: Full-featured Getting Things Done productivity app — inbox capture, action lists, projects, weekly review, AI-assisted processing, team delegation.

**URL**: `https://gtd-capture.web.app`
**Source**: `C:\Users\matth\gtd-capture\`
**Firebase Project**: `gtd-capture` (separate from packouts-assistant-1800)

#### Tech Stack

| Layer | Tool | Notes |
|-------|------|-------|
| Framework | Vanilla JS | No React, no build step — `GTDApp` class ~15,000+ lines |
| Styling | Hand-written CSS | Dark theme (#1a1a2e), accent #6366f1 (indigo) |
| Database | IndexedDB (offline) + Firestore (authenticated) | Dual-storage, seamless switch |
| Auth | Firebase Auth | Google OAuth + email/password |
| AI | Anthropic Claude API | User-provided API key |
| Speech | Web Speech API | Voice capture |
| Geo | Geolocation API | Errand proximity alerts |
| Docs | docx.js + FileSaver | Word document export |
| Google | Drive + Gmail + Calendar | Optional integrations via Google APIs |
| PWA | Service worker v14 | Installable, offline capable |

**No npm, no bundler** — all dependencies loaded via CDN `<script>` tags. All source lives flat in `public/`.

#### Auth

Firebase Authentication:
- Google OAuth sign-in
- Email/password sign-in
- Admin check: `admins/{email}` Firestore doc (Matt is owner)
- Post-auth: switches from IndexedDB to Firestore, sets up real-time listeners

#### Data

**Unauthenticated**: IndexedDB (`GTDCaptureDB`, schema v6)
- Stores: `inbox`, `nextActions`, `waitingFor`, `reference`, `archived`, `trash`, `projects`, `contacts`, `settings`, `templates`, `areas`, etc.

**Authenticated**: Firestore (`users/{userId}/{collection}/{docId}`)
- Same collections as IndexedDB
- Real-time listeners on inbox, actions, waiting-for, projects
- Firebase Storage for file attachments (50MB limit)
- Teams at `teams/{teamId}/`

**Firestore security**: Users can only read/write their own `users/{userId}/**` docs. Admins can read any user.

#### Key Source Files

| File | Purpose |
|------|---------|
| `public/app.js` | Main GTDApp class (~627KB, all views and logic) |
| `public/features.js` | Kanban, Pomodoro, Habits, Timeline, Achievements, swipe gestures |
| `public/evernote-features.js` | Markdown parser, rich text editor |
| `public/power-features.js` | Brain Dump, AI auto-categorization, document export |
| `public/db.js` | IndexedDB wrapper |
| `public/firestore-db.js` | Firestore mirror of db.js API |
| `public/ai-service.js` | Anthropic Claude API client |
| `public/ai-chat.js` | AI chat panel UI |
| `public/speech.js` | Web Speech API wrapper |
| `public/geo.js` | Geolocation service |
| `public/nlp.js` | NLP parser (context/date/priority extraction) |
| `public/google-integration.js` | Drive/Gmail/Calendar integration |

#### Views

Core GTD: Today, Inbox, Next Actions (with Kanban toggle), Waiting For, Projects, Areas, Someday/Maybe, Reference (with rich text/markdown), Weekly Review, Archive, Trash

Features: Dashboard, Habits (heatmap/streaks), Timeline, Achievements

Team: Team Dashboard, Members, Shared Projects, Activity

Admin: User directory, view any user's data

**Processing flow**: Quick capture (text/voice) → NLP extracts contexts/dates/priority → step-by-step GTD wizard → action/waiting/reference/someday

**AI features**: Chat panel, Brain Dump (paste text → AI categorizes into GTD buckets), auto-categorization, action suggestions

#### Deploy

```bash
cd gtd-capture
firebase deploy    # deploys hosting + Firestore rules
```

No build step — serves `public/` directly. JS/CSS have no-cache headers so updates propagate immediately.

---

### 14.4 AZ Fire Help

**Purpose**: Public-facing homeowner resource site for fire damage recovery — insurance claim guide, recovery checklist, and local service area pages for SEO.

**URL**: `https://azfirehelp.com`
**Source**: `C:\Users\matth\azfirehelp\`

#### Tech Stack

| Layer | Tool | Version |
|-------|------|---------|
| Framework | Astro (SSG) | 5.17.1 |
| Styling | Tailwind CSS (v3, config file) | 3.4.17 |
| Sitemap | @astrojs/sitemap | 3.3.1 |
| PDF gen | Puppeteer (dev only) | 24.37.5 |

#### Analytics

- **GA4**: `G-2F8K16X9MZ` (injected via SEOHead.astro)
- **Google Search Console**: Verified via HTML file + meta tag

#### Pages

| URL | Description | Schema |
|-----|-------------|--------|
| `/` | Homepage — "Your house just caught fire. Here's what to do next." | LocalBusiness |
| `/about` | About 1-800-Packouts + Matthew bio | — |
| `/fire-damage-insurance-claim-guide` | Deep insurance claim guide | FAQPage (6 Q&As) |
| `/fire-recovery-checklist` | 4-phase interactive checklist (first 24h → month 2+) | HowTo (32 steps) |
| `/who-does-what-after-a-fire` | 9-role breakdown (adjuster, GC, contents company, etc.) | — |
| `/tools` | Free tools (2 Google Sheets + checklist link) | — |
| `/mesa` `/gilbert` `/chandler` `/scottsdale` `/tempe` | City-specific landing pages (from `cities.json`) | LocalBusiness per city |

All pages have: unique title/description, OG + Twitter cards, canonical URLs, breadcrumb JSON-LD.

#### SEO

- Sitemap auto-generated at `/sitemap-index.xml`
- `robots.txt` allows all, references sitemap
- JSON-LD structured data on every page
- Print styles for checklist page
- Mobile CTA bar (fixed bottom phone number strip)

#### File Structure

```
src/
  config/site.ts          # Central config (name, phone, GA ID, nav, service areas)
  data/cities.json        # 5 city page definitions
  data/roles.json         # 9 role cards
  layouts/BaseLayout.astro  # Wraps all pages (SEOHead, Header, Footer, MobileCTA)
  components/             # SEOHead, Header, Footer, Breadcrumbs, CalloutBox, etc.
  pages/                  # All page files including [city].astro dynamic route
  styles/global.css       # Tailwind + print styles
```

#### Deploy

```bash
cd azfirehelp
npm run build              # astro build → dist/
firebase deploy --only hosting:azfirehelp
```

Firebase config includes: `cleanUrls: true`, 1-year immutable cache for static assets, security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`).

#### Related Sites (planned)

- **azfloodhelp.com** — Water damage resource site (not yet built)
- **packoutsaz.com** — Contents restoration site (not yet built)
