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
