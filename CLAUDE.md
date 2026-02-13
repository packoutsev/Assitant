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

## Google Drive MCP Server

- Configured in `.claude.json` under `mcpServers.gdrive`
- Server code (patched for Windows path bug): `C:\Users\matth\mcp-gdrive-setup\`
- OAuth credentials: `C:\Users\matth\.config\mcp-gdrive\gcp-oauth.keys.json`
- Server credentials: `C:\Users\matth\mcp-gdrive-setup\.gdrive-server-credentials.json`
- If auth expires, re-run from `C:\Users\matth\mcp-gdrive-setup`: `node node_modules\@modelcontextprotocol\server-gdrive\dist\index.js auth`

## Tech Stack

- **Python 3.12**: `C:\Users\matth\AppData\Local\Programs\Python\Python312\python.exe` — pandas, openpyxl installed
- **Node.js**: Available globally (npx 11.10.0)
- **Platform**: Windows 11

## Repository Location Note

Git repo is in Windows home directory (`C:\Users\matth`). `.gitignore` excludes OS/profile files.
