# Overnight Session: Study Real Estimates & Rebuild the Estimating Model

Read `C:\Users\matth\CLAUDE.md` for business context first.

## YOUR MISSION

You are rebuilding the AI packout estimating tool for 1-800-Packouts. The current tool uses **lookup tables** for TAG and box counts by room type/density — this is fundamentally wrong. Diana (the company's estimator) doesn't use lookup tables. She **counts actual items** from walk-through photos:
- **TAGs** = items too large to fit in a box (furniture, appliances, large art, rugs)
- **Boxes** = she estimates how many medium boxes the smaller items in each room would fill
- **Pads** = furniture pads, NOT 1:1 with TAGs (pictures/small art don't need pads)

The tool also was only generating a packout phase. Real estimates have **5 phases**:
1. **Packout** — boxes, TAGs, pads, materials (bubble wrap, stretch film)
2. **Handling to Storage** — transport labor + moving van
3. **Storage** — vault-months
4. **Handling from Storage** — same as #2 (return trip)
5. **Pack back** — boxes/TAGs at reduced rate (no materials), debris haul

## PHASE 1: DEEP STUDY (Spend at least 60-90 minutes here before changing ANY code)

Your biggest mistake last session was building before understanding. This time, **study first**.

### 1A. Access the Google Drive folder
Try `mcp__gdrive__search` for "IWT Estimate" or "Packout Estimate". The target folder is:
`https://drive.google.com/drive/u/1/folders/1JIV2OEzO3wQ66PpIXp2__6ZDR1riQAPF`

If MCP auth is expired, re-auth per CLAUDE.md instructions, then restart Claude Code if needed.

The newer jobs in this folder are the most dialed-in — they represent how Diana ACTUALLY estimates now. Focus on the most recent ones first.

### 1B. Study these matched local estimate+walkthrough+cartage sets (newest first)

**DO NOT use Customer Records folder — those are old jobs from previous ownership.**

Study each of these complete job packages. For each one, read the Xactimate estimate PDF, the walk-through photo report, AND the cartage calculator worksheet. Map exactly how the estimator went from photos → counts → line items → total.

**Schafer, Tyler** (Feb 2026 — newest, most important):
- Xactimate estimate: `C:\Users\matth\Downloads\TYLER_SCHAFER_(26-11_IWT Estimate (1).pdf`
- Walk-through photos: `C:\Users\matth\Downloads\PDFs\Schafer_IWT_Photo_Report.pdf`
- Excel export: `C:\Users\matth\Downloads\Spreadsheets\Xactimate Estimates\TYLER_SCHAFER_(26-11.xlsx`
- Hart takeoff notes: `C:\Users\matth\Downloads\Images\Frank Hart - Estimate Takeoff.jpeg` (shows how Frank does manual counts)

**Hart, Frank** (recent):
- Walk-through: `C:\Users\matth\Downloads\PDFs\Hart_IWT_Photo_Report.pdf`
- Takeoff image: `C:\Users\matth\Downloads\Images\Frank Hart - Estimate Takeoff.jpeg`

**Clark, Stephen** (complete 5-phase job with packout report, cartage, cleaning):
- Xactimate estimate: `C:\Users\matth\Downloads\PDFs\Xactimate - Packout, Storage & Packback Estimate - Clark.pdf`
- Packout photo report: `C:\Users\matth\Downloads\PDFs\Stephen_Clark_-_Pack_Out_Photo_Inventory_Report_-_1-800_Packouts.pdf`
- Cartage calculator: `C:\Users\matth\Downloads\PDFs\Clark - Cartage Caculator - JOB CARTAGE WORKSHEET.pdf`
- Total loss report: `C:\Users\matth\Downloads\PDFs\Clark - Total Loss Report.pdf`

**Goldman** (complete set):
- Xactimate estimate: `C:\Users\matth\Downloads\PDFs\Goldman - Packout Xactimate Estimate.pdf`
- Packout report: `C:\Users\matth\Downloads\PDFs\Goldman - Packout Report.pdf`
- Walk-through photos: `C:\Users\matth\Downloads\PDFs\Goldman_-_Photo_Report.pdf`

**Curtis Harvey** (complete walkthrough + estimate + cartage):
- Xactimate estimate: `C:\Users\matth\Downloads\PDFs\Curtis_Harvey_Residence_-_Packout__Packback__and_Storage_-_Estimate_-_Walkthrough.pdf`
- Cartage calculator: `C:\Users\matth\Downloads\PDFs\Copy of Curtis Harvet Cartage.xlsx - JOB CARTAGE WORKSHEET.pdf`
- Packout report: `C:\Users\matth\Downloads\PDFs\Curtis_Harvey_-_Packout_Report.pdf`

**Szymanski** (complete set):
- Estimate: `C:\Users\matth\Downloads\PDFs\Szymanski - Estimate.pdf`
- Walk-through: `C:\Users\matth\Downloads\PDFs\Szymanski - Walk Thru - Photo Report.pdf`
- Final: `C:\Users\matth\Downloads\PDFs\Szymanski - POPBST FINAL - 10.1.25.pdf`

**Huttie** (complete set):
- Estimate: `C:\Users\matth\Downloads\PDFs\Huttie Xactimate Estimate.pdf`
- Photo report: `C:\Users\matth\Downloads\PDFs\Huttie Photo Report.pdf`
- Cartage: `C:\Users\matth\Downloads\PDFs\Huttie-Capitan Cartage.xlsx - JOB CARTAGE WORKSHEET.pdf`

**Bryant** (complete set with multiple cartage versions):
- Walk-through: `C:\Users\matth\Downloads\PDFs\Bryant_Residence_-_Pack_Out_Walk_Through.pdf`
- Cartage: `C:\Users\matth\Downloads\PDFs\Michael Bryant.xlsx - JOB CARTAGE WORKSHEET - Packout.pdf`
- Packout report: `C:\Users\matth\Downloads\PDFs\Bryant_-_Packout_Photo_Report.pdf`

**Proskell** (recent):
- Estimate: `C:\Users\matth\Downloads\PDFs\Proskell_Austin_Con - Xactimate Initial Estimate 11.20.25.pdf`

### 1C. What to extract from each job

For EACH job, document in a structured format:
1. **Home details**: rooms, size, loss type
2. **Room-by-room TAG count**: What specific items were tagged? List them. (e.g., "kitchen table, 4 chairs, rug" = 6 TAGs)
3. **Room-by-room box count**: How many boxes per room?
4. **Pad count**: How many furniture pads? Which TAGs got pads vs not?
5. **Cartage inputs**: drive time, crew size, truck loads, carry time
6. **Cartage outputs**: CPS LAB hours, CPS LABS hours
7. **Storage**: How many vaults? How many months?
8. **Materials**: bubble wrap (24" or 48"?), stretch film, wardrobe boxes, packing paper, peanuts
9. **Phase structure**: Which phases are present? What % of total is each?
10. **Unit costs**: What rate did Diana use for each line item? Compare to Xactimate price list.
11. **Total RCV**: Final number including tax

### 1D. Key questions to answer through study

- How does Diana decide how many TAGs a room has? Is it literally counting visible furniture?
- How does Diana decide box count? Is there a per-room heuristic or is she counting shelf feet / drawer count / cabinet count?
- What's the relationship between TAG count and pad count? Which items get pads?
- How does she decide on vault count? Is it TAG+box driven or square footage?
- Does she use 24" or 48" bubble wrap? How does she decide quantity?
- What's the packback discount on box rates? Is it always ~14%?
- Does she bill handling at a flat rate or CPS LAB/LABS split?
- How many van days does she use? Is it always = truck_loads?
- What carry time does she use? Does it vary by house type (single story vs two story)?

Save all findings to: `C:\Users\matth\estimator\data\diana_study_notes.json`

## PHASE 2: REBUILD THE ESTIMATION MODEL

After (and ONLY after) completing the study, rebuild these modules:

### 2A. Replace lookup tables with item-counting logic

The current `photo_analyzer.py` and `data/room_scope_lookup.json` use static lookup tables:
```
kitchen + heavy = 15 TAGs, 45 boxes
```

This is wrong. Replace with a model that:
- TAGs = count of specific item types visible (furniture pieces, large appliances, rugs, large art)
- Boxes = estimate based on cabinet/shelf/drawer volume + loose items
- Pads = count of items that actually need padding (furniture, not pictures)

### 2B. Update the 5-phase estimate generator

File: `C:\Users\matth\estimator\generate_estimate.py` (function `generate_5phase_estimate`)

The 5-phase structure was added last session but needs refinement based on what you learn from studying Diana's actual estimates:
- Handling rate: currently $79.04/hr (65% margin). Verify Diana's actual rate and discuss tradeoff.
- Packback discount: currently 14%. Verify from actual estimates.
- Bubble wrap: currently defaults to 48" at $0.40/LF. Verify.
- Storage vaults: need a formula from TAGs+boxes → vault count
- Van days: need logic for when it's 1 vs 2 vs 3

### 2C. Labor rates module

File: `C:\Users\matth\estimator\labor_rates.py`

Already built. Crew of 3 (2 techs @ $21 + 1 supervisor @ $24), burdened rate = $79.04/hr for 65% margin. Verify this makes sense against what Diana bills.

### 2D. Backtest the rebuilt model

Run the rebuilt model against ALL the jobs you studied. Compare:
- AI TAGs vs Diana's TAGs
- AI boxes vs Diana's boxes
- AI total RCV vs Diana's total RCV
- AI phase breakdowns vs Diana's phase breakdowns

Calculate MAPE for each metric. Target: <20% error on total RCV.

Save results to: `C:\Users\matth\estimator\output\backtest\`

## EXISTING CODE TO READ

All code is in `C:\Users\matth\estimator\`. Read ALL of these before making changes:

| File | What it does |
|---|---|
| `generate_estimate.py` | Main pipeline — has both `generate_estimate()` and `generate_5phase_estimate()` |
| `pricing_engine.py` | Prices line items from reference DB, has `build_5phase_estimate()` and `PricingEngine.price_5phase_estimate()` |
| `cartage_calculator.py` | Replicates Diana's cartage calculator spreadsheet |
| `photo_analyzer.py` | Room analysis (currently uses lookup tables — needs rebuild) |
| `labor_rates.py` | Burdened labor rate calculator |
| `scope_checker.py` | Flags missing line items |
| `estimate_adjuster.py` | Applies correction factors |
| `job_similarity.py` | Finds similar historical jobs |
| `supplement_predictor.py` | Predicts likely supplements |
| `crew_optimizer.py` | Crew size recommendations |
| `run_schafer_5phase.py` | Test case: Schafer with 5-phase (compare to Diana's $11,873) |
| `run_schafer.py` | Test case: Schafer with old 1-phase model |
| `run_campbell_packout.py` | Test case: Campbell (old model) |

Also read the data files:
- `C:\Users\matth\estimator\data\pricing_reference.csv` — unit cost database
- `C:\Users\matth\estimator\data\room_scope_lookup.json` — the lookup tables that need replacing
- `C:\Users\matth\estimator\data\correction_factors.json`
- `C:\Users\matth\estimator\data\standard_line_items.json`

## KEY RESULTS FROM LAST SESSION (Schafer comparison)

Diana's actual Schafer estimate: $11,872.91
- 74 med boxes, 1 lg box, 31 TAGs, 20 pads
- 4 vaults x 2 months storage = 8 vault-months @ $195/mo = $1,560
- 22.4 hr handling each direction @ $75/hr
- 2 van days each direction
- 500 LF of 48" bubble wrap @ $0.40/LF = $200
- Packback boxes at ~$28.93 (vs $33.48 packout = 13.6% discount)

AI 5-phase estimate: $15,203 (+29% error)
- 73 med boxes (nearly perfect), 58 TAGs (way too many — 87% over)
- Storage matched perfectly at $1,560
- Handling hours too high (35.3 vs 22.4) because TAG overcount inflates cartage
- Handling rate $79/hr vs Diana's $75/hr (intentional — our margin target)

**The #1 problem is TAG overestimation from lookup tables. Fix this.**

## CONSTRAINTS

- Post-acquisition data only (April 15, 2025+) for pricing/training. Pre-acq = background only.
- PDF rendering: ALWAYS use scale=0.8 to stay under 2000px
- Clean up temp images after analysis
- Weight newest jobs most heavily
- Commit meaningful progress to git as you go
- All output to `C:\Users\matth\estimator\`

## PRIORITY ORDER

1. Study (60-90 min minimum — DO NOT skip or rush this)
2. Document findings in `data/diana_study_notes.json`
3. Rebuild TAG/box estimation logic
4. Update 5-phase generator with learned parameters
5. Backtest against all studied jobs
6. Commit to git
