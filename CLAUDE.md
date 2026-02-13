# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Assitant** — a new project in early setup. The repository is hosted at https://github.com/packoutsev/Assitant.git.

## Important: Repository Location

This git repo is initialized in the Windows user home directory (`C:\Users\matth`). Many unrelated OS/profile files (AppData, NTUSER.DAT, OneDrive, etc.) are visible to git. A proper `.gitignore` should be added before committing to avoid tracking these files.

## Current State

- No source code, build system, or tests exist yet
- Only file tracked: `README.md`

## Architecture Decisions

### Video Pipeline — Encircle API Integration
- **Primary source**: Pull videos from the Encircle API (techs already document in Encircle — no workflow change needed)
- **Secondary source**: Direct upload as a fallback for non-Encircle videos (homeowner footage, adjuster clips, drone video)
- Encircle-first approach: pipeline polls or uses webhooks to trigger video processing

### AI Processing Pipeline

The pipeline processes restoration job videos through multiple AI models to extract structured documentation:

```
Encircle API (or direct upload)
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
│  - Room-by-room notes    │
│  - Damage assessments    │
│  - Recommended line items│
│  - Xactimate codes       │
└──────────────────────────┘
```

### AI Model Roles

| Model | Role | Why |
|-------|------|-----|
| **Whisper** (OpenAI) | Audio transcription | Best-in-class speech-to-text; handles noisy jobsite audio, tech narration |
| **Gemini** (Google) | Video visual analysis | Native video understanding — can process full video files, identify rooms, damage, materials, equipment, progress |
| **OpenAI GPT / Claude** | Structured summarization | Combines transcript + visual analysis into structured restoration documentation, Xactimate line items, room-by-room reports |

### Pipeline Flow (Detailed)

1. **Ingest** — Poll Encircle API for new videos on a claim, or accept direct upload
2. **Extract Audio** — Pull audio track from video (ffmpeg)
3. **Transcribe** — Send audio to Whisper API → raw transcript
4. **Visual Analysis** — Send video to Gemini API → room identification, damage types, materials observed, equipment spotted, progress observations
5. **Merge & Summarize** — Send transcript + visual analysis to OpenAI/Claude → structured output:
   - Room-by-room damage notes
   - Recommended Xactimate line items with codes
   - Moisture/drying equipment observations
   - Before/during/after progress tracking
6. **Output** — Store structured report; surface to estimator for review

### Tech Stack (Planned)

- **Language**: Python
- **Audio extraction**: ffmpeg
- **APIs**: Encircle REST API, OpenAI Whisper API, Google Gemini API, OpenAI/Claude API
- **Storage**: TBD (local filesystem for MVP, cloud storage later)
- **Orchestration**: Simple Python scripts for MVP; async job queue later
