# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Assitant** — a Xactimate expert assistant app for 1-800-Packouts (packout/contents restoration company). Repository: https://github.com/packoutsev/Assitant.git

## Business Context

- **Company**: 1-800-Packouts of the East Valley (Encanto Builders DBA)
- **Owner**: Matthew Roumain, acquired the business **April 15, 2025** — anything before that date was previous ownership
- **What they do**: Contents packout, cleaning, storage, and pack-back for insurance restoration jobs
- **Xactimate**: Industry-standard estimating software used for all job estimates (initial, supplement, final)
- **Encircle**: Photo documentation/inventory app — Encircle reports directly correlate to Xactimate estimates (same customers/jobs)

## Xactimate Data Analysis (338 estimates, $4.53M total RCV)

Key findings from initial analysis of exported Excel estimates:
- **Labor is 38% of all revenue** — packing labor at ~$59/hr and supervisor at ~$81/hr dominate
- **Storage is #2 revenue driver** — ~$407K across 161 estimates
- **Huge unit cost variation** on same line items (e.g., moving vans range $0-$600/day, storage $145-$425/month) — pricing inconsistency
- **Med box high-density packing** ($320K) is a bigger revenue item than most realize
- **Cleaning is underrepresented** — only 34 of 243 packout estimates include cleaning scope
- **Zero depreciation** across all estimates — everything at full RCV
- **5.5% of line items have zero quantity** (template placeholders never filled in)
- Estimate values range from $0 to $167K, median ~$10K

## Data Locations

- **Xactimate Excel exports**: `C:\Users\matth\Downloads\Spreadsheets\Xactimate Estimates\` (338 files)
- **Other spreadsheets**: `C:\Users\matth\Downloads\Spreadsheets\`
- **Downloads organized into**: PDFs/, Images/, Spreadsheets/, Documents/, Videos/, Archives/, Installers/, Emails/, ESX/
- **Xactimate PDF reports & Encircle photo reports**: Available via Google Drive MCP server

## MCP Servers

Six MCP servers provide tool access to external systems. Five are deployed to **Google Cloud Run** (project `packouts-assistant-1800`, region `us-central1`) for use as custom connectors in claude.ai. Each has two entry points: `index.js` (stdio for Claude Code) and `server.js` (Streamable HTTP for Cloud Run).

### Cloud Run Deployments

| Server | URL | Tools |
|--------|-----|-------|
| **mcp-encircle** | `https://mcp-encircle-326811155221.us-central1.run.app/mcp` | Claims, photos, rooms, moisture readings, media, equipment, notes |
| **mcp-qbo** | `https://mcp-qbo-326811155221.us-central1.run.app/mcp` | Invoices, A/R aging, P&L, balance sheet, customers, QBO SQL |
| **mcp-xcelerate** | `https://xceleratewebhook-326811155221.us-central1.run.app/mcp` | Jobs, schedule, notes, status (Zapier webhook → Firestore + MCP) |
| **mcp-gchat** | `https://mcp-gchat-326811155221.us-central1.run.app/mcp` | Google Chat spaces, messages, threads, search, send messages (read+write) |
| **mcp-gsheets** | `https://mcp-gsheets-326811155221.us-central1.run.app/mcp` | Google Sheets read/write — open spreadsheet, list tabs, read/write ranges, append rows |

**Transport**: Streamable HTTP (`POST /mcp`) via MCP SDK v1.26.0 `StreamableHTTPServerTransport`. Legacy SSE not supported — claude.ai requires Streamable HTTP for custom connectors.

**Auth**: No bearer token required (claude.ai custom connectors don't support simple bearer tokens — only OAuth or no-auth). API credentials (Encircle API token, QBO OAuth, Google Chat/Sheets OAuth) are server-side env vars on Cloud Run. Google Chat and Sheets tokens stored in GCS bucket `packouts-gchat-tokens` (different file paths: `tokens.json` for Chat, `gsheets-tokens.json` for Sheets).

**Deploying updates**: From each `mcp-*/` directory:
```bash
gcloud run deploy <service-name> --source . --region us-central1 --no-invoker-iam-check --quiet
```
The `--no-invoker-iam-check` flag bypasses the GCP org policy that blocks `allUsers` IAM binding.

### Local-Only MCP Servers

| Server | Location | Notes |
|--------|----------|-------|
| **mcp-gdrive** | `C:\Users\matth\mcp-gdrive-setup\` | Google Drive file search (patched for Windows). If auth expires, re-run: `node node_modules\@modelcontextprotocol\server-gdrive\dist\index.js auth` |

### Google Cloud CLI

- Installed at `C:\Users\matth\google-cloud-sdk\` (v557.0.0)
- Authenticated as `matt@encantobuilders.com`
- Added to Windows PATH permanently

## Estimator Tool (Built)

The back half of the pipeline is built and validated:
- **`estimator/photo_analyzer.py`** — Room-level TAG/box counting (lookup tables + per-room overrides)
- **`estimator/pricing_engine.py`** — Xactimate line item generation with CPS codes
- **`estimator/generate_estimate.py`** — Full 5-phase estimate pipeline (Packout → Storage → Pack back)
- **`estimator/cartage_calculator.py`** — Handling labor hours from drive time, crew, truck loads
- **Backtest results**: 8.6% MAPE with photo overrides, 13.6% overall (target <20%)
- **Key insight**: Pricing engine is accurate — the bottleneck is input quality (getting accurate per-room TAG/box counts)

## Architecture — AI Video Pipeline

### Overview
The video pipeline is the **front half** that replaces manual room entry. It feeds structured room data into the existing estimator.

```
Encircle video (or direct upload)
        │
        ▼
  ┌─────────────┐
  │  Video File  │
  └──────┬──────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────────┐
│ Whisper│ │   Gemini     │
│ (Audio)│ │  (Visual)    │
│        │ │              │
│ Speech │ │ Room IDs,    │
│ to text│ │ damage type, │
│        │ │ materials,   │
│        │ │ progress     │
└───┬────┘ └──────┬───────┘
    │              │
    ▼              ▼
┌──────────────────────────┐
│     Combined Context     │
│  (transcript + visual)   │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│    OpenAI / Claude       │
│   Structured Summary     │
│                          │
│  - Room-by-room JSON     │
│  - TAG/box counts        │
│  - Scope notes           │
│  - Xactimate codes       │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Existing Estimator      │
│  (pricing_engine +       │
│   generate_estimate)     │
│                          │
│  → 5-phase estimate CSV  │
└──────────────────────────┘
```

### AI Model Roles

| Model | Role | Why |
|-------|------|-----|
| **Whisper** (OpenAI) | Audio transcription | Best-in-class speech-to-text; handles noisy jobsite audio, tech narration, scope notes ("only pack under sink") |
| **Gemini** (Google) | Video visual analysis | Native video understanding — processes full video files, identifies rooms, damage, materials, counts furniture/boxes |
| **OpenAI GPT / Claude** | Structured summarization | Combines transcript + visual analysis into structured room JSON that feeds directly into `generate_estimate.py` |

### Pipeline Steps

1. **Ingest** — Poll Encircle API for new videos on a claim, or accept direct upload
2. **Extract Audio** — Pull audio track from video (ffmpeg)
3. **Transcribe** — Send audio to Whisper API → raw transcript with scope notes
4. **Visual Analysis** — Send video to Gemini API → room identification, TAG counts, box estimates, damage types, density
5. **Merge & Summarize** — Send transcript + visual analysis to OpenAI/Claude → structured rooms JSON with override_tags, override_boxes per room
6. **Estimate** — Feed rooms JSON into existing `generate_estimate.py` → Xactimate-ready 5-phase CSV

### Data Sources

- **Primary**: Encircle API — techs already document in Encircle (no workflow change needed)
- **Secondary**: Direct upload fallback for non-Encircle videos (homeowner footage, adjuster clips, drone video)
- Encircle-first approach: pipeline polls or uses webhooks to trigger video processing

## Tech Stack

- **Python 3.12**: `C:\Users\matth\AppData\Local\Programs\Python\Python312\python.exe` — pandas, openpyxl installed
- **Node.js**: Available globally (npx 11.10.0)
- **Platform**: Windows 11
- **APIs (planned)**: Encircle REST API, OpenAI Whisper API, Google Gemini API, OpenAI/Claude API
- **Audio extraction**: ffmpeg
- **Storage**: Local filesystem for MVP, cloud storage later
- **Orchestration**: Simple Python scripts for MVP; async job queue later

## Repository Location Note

Git repo is in Windows home directory (`C:\Users\matth`). `.gitignore` excludes OS/profile files.
