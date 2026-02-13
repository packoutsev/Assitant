# Overnight Session Plan — Packout Estimating Assistant

## Context

You are building an AI-powered estimating assistant for 1-800-Packouts of the East Valley, a contents packout/restoration company. Read `C:\Users\matth\CLAUDE.md` for full business context.

### What the business does
Insurance restoration jobs: when a home has water/fire/smoke damage, this company packs out all the contents (furniture, kitchenware, clothing, electronics, etc.), stores them in climate-controlled vaults, cleans them, and packs them back when the home is repaired.

### What the tool does
Takes walk-through photos of a home's contents (room-by-room photos taken on a phone during the initial scoping visit) and generates a draft Xactimate estimate — line items, quantities, unit costs, and totals. Photos only, no text narrative from the estimator.

### Owner context
Matthew Roumain acquired this business on **April 15, 2025**. All data before that date is previous ownership with different pricing, processes, and standards. **Post-acquisition data (April 15, 2025+) is the training set. Pre-acquisition data is background context only — do NOT use old pricing or rates.**

---

## What Previous Sessions Discovered

### Data Sources
| Source | Location | Count | Notes |
|---|---|---|---|
| Xactimate Excel exports | `C:\Users\matth\Downloads\Spreadsheets\Xactimate Estimates\` | 338 files | 89 post-acquisition, 235 pre-acquisition, 14 undated |
| Xactimate FINAL_DRAFT PDFs | `C:\Users\matth\Downloads\PDFs\` (search for FINAL_DRAFT) | 71 files | 68 post-acquisition |
| Customer Record folders | `C:\Users\matth\Downloads\Customer Records\` | 82 folders | 39 have matched Encircle + Xactimate pairs |
| Paired data index | `C:\Users\matth\Downloads\Spreadsheets\customer_paired_data_index.csv` | 549 records | Master index of all classified files by customer |
| PDF pricing extract | `C:\Users\matth\Downloads\Spreadsheets\xactimate_pdf_pricing_extract.csv` | 71 records | Line-item data extracted from PDFs |
| Excel date analysis | `C:\Users\matth\Downloads\Spreadsheets\xactimate_excel_date_analysis.csv` | 338 records | Dates and RCV totals per Excel file |
| Encircle item-level CSV | `C:\Users\matth\Downloads\Spreadsheets\Final_Packout___Items__All_.csv` | 330 records | Structured Encircle data (one job) |
| Encircle detailed CSV | `C:\Users\matth\Downloads\Spreadsheets\packout_detailed.csv` | 1150 records | Raw Encircle export (one job) |
| Google Drive | MCP server `gdrive` | ~45+ reports | Re-auth may be needed — try it first |

### Key Finding: The Estimating Pipeline
The actual process used today:
1. **Walk-through**: Estimator visits home, takes room-by-room photos in Encircle app
2. **Count**: Estimator counts TAG items (large furniture needing individual tags) and estimates box count per room
3. **Cartage Calculator**: Excel spreadsheet takes 6 inputs → computes CPS LAB (packing labor) and CPS LABS (supervisor) hours for Xactimate
4. **Xactimate Entry**: Estimator enters line items with quantities and unit costs from the current Xactimate price list

### The 6 Cartage Calculator Inputs
| Input | What it is | Typical range |
|---|---|---|
| Drive time | One-way minutes from warehouse to job site | 15-40 min |
| Truck loads | Number of full truck loads needed | 1-4 |
| Crew size | Number of staff on the transport team | 5-8 |
| Carry time | Minutes to move one load from inside house to truck | 5-10 min |
| TAG items | Total tagged large items (furniture, appliances, etc.) | 30-200 |
| Boxes | Total packed boxes of smaller items | 30-250 |

### Factory Standards (fixed, same every job)
- Pad wrap TAG item: 8 min
- Load TAG into truck: 3 min
- Unload TAG at dock: 3 min
- Move TAG into storage: 5 min
- Load dolly (3 boxes) into truck: 3 min
- Unload 3 boxes at dock: 2 min
- Move 3 boxes into storage: 6 min

### Key Patterns from Estimate vs. Final Analysis (7 jobs)
- **TAGs are under-estimated** in 5 of 7 cases (avg +22% in finals)
- **Boxes are over-estimated** in 6 of 7 cases (avg -26% in finals)
- **Labor hours track well** — Cartage Calculator formula is accurate when inputs are right
- **Materials get more specific** in finals (wardrobe boxes, packing paper, peanuts added)
- **Cleaning scope is missing** from 86% of packout estimates

### Post-Acquisition Pricing (from FINAL_DRAFT PDFs with post-April price lists)
Common rates seen (but these MUST be verified by parsing all 89 post-acq Excel files):
- Packing labor (CPS LAB): ~$58.70/hr
- Supervisor (CPS LABS): ~$79.31/hr
- Storage vault: $150-$350/month
- Moving van: $155-$202.42/day
- Evaluate/tag/inventory: ~$11.81/EA
- Med box high-density packing: ~$17.46/EA
- Rack storage per SF: ~$1.31-$4.25/SF

---

## DELIVERABLES — Build in This Order

### Deliverable 1: Post-Acquisition Pricing Database
**Time budget: ~60 min**

Parse ALL 89 post-acquisition Xactimate Excel exports (files where Date column >= 2025-04-15, per `xactimate_excel_date_analysis.csv`).

For every unique line item (by `Desc` field), compute:
- Frequency (how many estimates include it)
- Median unit cost, P25, P75, min, max
- Median quantity
- Total RCV contributed
- Xactimate category code (Cat + Sel columns)

Also extract from the 68 post-acquisition FINAL_DRAFT PDFs to supplement.

**Output files:**
- `C:\Users\matth\estimator\data\pricing_reference.csv` — every line item with stats
- `C:\Users\matth\estimator\data\standard_line_items.json` — the "template" of line items that appear in 50%+ of estimates, with default quantities and pricing
- `C:\Users\matth\estimator\data\post_acq_estimates_full.csv` — all line items from all 89 post-acq estimates in one flat table (filename, line_num, desc, qty, unit, unit_cost, rcv, group_desc, cat, sel, date)

### Deliverable 2: Estimate vs. Final Correction Factors
**Time budget: ~45 min**

Expand the comparison to EVERY customer that has both an ESTIMATE and FINAL version in the Excel exports or Customer Records. Not just 7 — all of them.

For each paired comparison, track:
- TAG count: estimate vs. final
- Box count: estimate vs. final
- Labor hours: estimate vs. final
- Total RCV: estimate vs. final
- Line items added in final that weren't in estimate
- Line items removed

Compute correction factors with confidence intervals. Weight post-acquisition jobs more heavily.

**Output files:**
- `C:\Users\matth\estimator\data\estimate_vs_final_comparisons.csv`
- `C:\Users\matth\estimator\data\correction_factors.json` — e.g., `{"tag_multiplier": 1.22, "box_multiplier": 0.74, "confidence": 0.85}`

### Deliverable 3: Walk-Through Visual Training Data
**Time budget: ~90 min**

For every customer with an Encircle Initial Walk-Through PDF in Customer Records (~25 reports):

1. Render each page at **scale=0.8** (keeps images under 2000px on both dimensions — CRITICAL, do not skip this)
2. View each room photo and record:
   - Room type (kitchen, bedroom, living room, garage, etc.)
   - Contents density (light / medium / heavy)
   - Contents types visible (furniture, electronics, kitchenware, clothing, books, toys, etc.)
   - Estimated TAG items visible (large items that would need individual tags)
   - Estimated box count (how many boxes the visible smaller items would fill)
   - Special items (fragile, oversized, high-value)
   - Any visible damage indicators
3. Cross-reference with the ACTUAL TAG and box counts from the corresponding Xactimate estimate/final

This creates the training data: photo observations → actual scope. This is the core intelligence of the tool.

**IMPORTANT**: Save rendered images to `C:\Users\matth\Downloads\temp_pdf_images\` and clean up after analysis. Don't accumulate hundreds of PNGs.

**Output files:**
- `C:\Users\matth\estimator\data\walkthrough_visual_training.json` — structured data per room per customer
- `C:\Users\matth\estimator\data\room_scope_lookup.json` — aggregated: room type + density → median TAGs, median boxes, range

### Deliverable 4: Cartage Calculator Engine
**Time budget: ~30 min**

Python module that exactly replicates the Cartage Labor Process Calculator spreadsheet. Validate against the actual spreadsheet outputs for Adler, Qaqish, Katz, and Cash (we have the exact numbers).

Inputs: drive_time_min, truck_loads, crew_size, carry_time_min, tag_count, box_count
Outputs: cps_lab_hours, cps_labs_hours, total_hours

Also include the TLI (Total Loss Item) disposal calculator from Sheet 2.

**Output file:**
- `C:\Users\matth\estimator\cartage_calculator.py`
- Include validation tests at the bottom that confirm outputs match the 4 known spreadsheets

### Deliverable 5: Pricing & Scope Engine
**Time budget: ~45 min**

Python modules for:

**pricing_engine.py:**
- Takes a list of line items with quantities
- Applies unit costs from the pricing reference (Deliverable 1)
- Flags any unit cost that deviates >20% from post-acquisition median
- Computes total RCV with tax
- Outputs formatted estimate

**scope_checker.py:**
- Takes a draft estimate
- Checks against the standard line items template
- Flags: missing cleaning scope, missing materials (wardrobe boxes, packing paper, stretch wrap, bubble wrap), zero-quantity placeholders, missing phases (packback, storage)
- Suggests commonly-missed line items based on job size

**estimate_adjuster.py:**
- Applies correction factors from Deliverable 2
- Takes initial TAG/box estimates and adjusts for known systematic biases
- Provides confidence range (low/expected/high estimate)

**Output files:**
- `C:\Users\matth\estimator\pricing_engine.py`
- `C:\Users\matth\estimator\scope_checker.py`
- `C:\Users\matth\estimator\estimate_adjuster.py`

### Deliverable 6: Working Prototype — Photo-to-Estimate Generator
**Time budget: ~60 min**

The main script. Takes a folder of walk-through photos (JPG/PNG) and generates a draft estimate.

**Pipeline:**
1. Load photos from input folder
2. For each photo, use Claude's vision to analyze:
   - What room is this?
   - What contents are visible?
   - Estimated TAG items (large items needing individual tags)
   - Estimated boxes (how many boxes would the smaller items fill)
   - Contents density and type classification
3. Aggregate across all rooms
4. Add drive time (user input or default)
5. Run through Cartage Calculator → labor hours
6. Map to Xactimate line items using pricing reference
7. Run scope checker to flag missing items
8. Apply correction factors
9. Output draft estimate as CSV and formatted summary

**Output files:**
- `C:\Users\matth\estimator\generate_estimate.py` — the main script
- `C:\Users\matth\estimator\photo_analyzer.py` — the vision analysis module (Claude API calls with structured prompts)
- `C:\Users\matth\estimator\README.md` — how to use it

**Note on API usage:** The photo_analyzer module should be designed to work with the Claude API. Include the prompt templates but make actual API calls configurable (the user will add their API key). For this session, the visual analysis for training data (Deliverable 3) uses your built-in vision capability directly.

---

## DELIVERABLE 7: BACKTESTING (Critical Validation)
**Time budget: ~60 min**

This is the most important deliverable. Without this, we don't know if the tool works.

For 10-15 customers where we have BOTH:
- Walk-through photos (Encircle Initial Walk-Through PDFs)
- Actual final estimate (Xactimate FINAL)

Run the prototype tool against the walk-through photos and compare:
- Predicted TAG count vs. actual TAG count
- Predicted box count vs. actual box count
- Predicted labor hours vs. actual labor hours
- Predicted total RCV vs. actual total RCV
- Predicted line items vs. actual line items

Calculate accuracy metrics:
- Mean Absolute Percentage Error (MAPE) for each metric
- Which rooms/content types the tool gets right vs. wrong
- Systematic biases to feed back into correction factors

**Output files:**
- `C:\Users\matth\estimator\backtest_results.csv` — per-job comparison
- `C:\Users\matth\estimator\backtest_summary.md` — accuracy report with MAPE scores, examples of best/worst predictions, and recommendations for improvement

This is the proof that the tool works. If MAPE on total RCV is under 25%, that's a usable first draft. If it's under 15%, that's genuinely good.

---

## STRETCH GOALS (if time remains)

### S1: Video Frame Extraction
Build a module that takes a walk-through VIDEO file (MP4), extracts key frames (1 per second or on scene changes), and feeds them into the photo analysis pipeline. This enables the "pull an estimate from a video walkthrough" workflow the owner wants.

**Output:** `C:\Users\matth\estimator\video_extractor.py`

### S2: Crew Sizing Recommendations
Based on historical data, recommend optimal crew size given the estimated TAG/box counts. Factor in home size, number of floors, and distance from warehouse.

### S3: Storage Duration Predictor
Analyze the relationship between loss type, scope size, and actual storage duration. Flag jobs where storage is likely to extend beyond initial estimate.

### S4: Historical Job Similarity Search
Given a new walk-through, find the 3-5 most similar past jobs by room count, TAG/box ratio, and loss type. Show the estimator "jobs like this one billed $X-$Y."

### S5: Supplement Predictor
Based on estimate-vs-final patterns, predict which line items are most likely to be added as supplements and pre-populate them as suggestions.

---

## Technical Notes

- **Python**: `C:\Users\matth\AppData\Local\Programs\Python\Python312\python.exe`
- **Installed packages**: pandas, openpyxl, pdfplumber, pypdfium2
- **Install if needed**: `pip install Pillow` for image handling
- **Image rendering**: ALWAYS use `scale=0.8` when rendering PDF pages to PNG. Default scale produces 1700x2200 images that exceed the 2000px multi-image limit and will crash the session.
- **Working directory for outputs**: `C:\Users\matth\estimator\` — create subdirectories as needed (`data\`, `tests\`, etc.)
- **Google Drive MCP**: Try `mcp__gdrive__search` first. If it errors with `invalid_request`, auth has expired. Re-auth instructions are in CLAUDE.md. If auth is not available, work with local data only.
- **Git repo**: `C:\Users\matth` — commit significant deliverables as you complete them
- **Post-acquisition filter**: Use the `Date` column (index 26) in Excel exports. Dates >= 2025-04-15 are post-acquisition. For PDFs, price lists with month codes MAY25+ are post-acquisition.

## Critical Reminders
- **DO NOT use pre-acquisition pricing as training data.** Old owner had different rates ($85/hr vs $58.70/hr, $600/day vans vs $202/day, etc.)
- **ALWAYS render PDFs at scale=0.8.** The previous session crashed permanently because images exceeded 2000px.
- **Clean up temp images** after analyzing them. Don't accumulate hundreds of PNGs.
- **Weight recent jobs most heavily.** A December 2025 estimate is more relevant than a May 2025 estimate.
- **The tool is PHOTOS ONLY.** No text narrative input from the estimator. The AI looks at room photos and makes the scope determination autonomously.
