/**
 * Coaching Agent — Daily AI Sales Coaching Review
 *
 * Express server triggered daily at 5pm MST by Cloud Scheduler.
 * Pulls HubSpot + Quo activity, sends to Anthropic for coaching review,
 * posts sections to Google Chat.
 *
 * Env vars:
 *   HUBSPOT_API_TOKEN, QUO_API_KEY, ANTHROPIC_API_KEY,
 *   GCHAT_CLIENT_ID, GCHAT_CLIENT_SECRET, GCS_BUCKET,
 *   GCHAT_SPACE_NAME, TRIGGER_SECRET, PORT
 */

import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getTodayRangeMST, getYesterdayRangeMST, fetchTodaysCalls, fetchTodaysNotes, fetchActiveContacts, fetchActiveDeals, fetchContactDetails, fetchPriorWeekCallCount, fetchAllContacts, createTask } from "./hubspot.js";
import { fetchQuoTexts } from "./quo.js";
import { generateCoaching } from "./anthropic.js";
import { splitIntoSections } from "./splitter.js";
import { postMultipleToChat } from "./gchat.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "8080", 10);
const log = (...args) => console.log("[server]", ...args);

// Load system prompt at startup
const SYSTEM_PROMPT = readFileSync(join(__dirname, "system-prompt.md"), "utf-8");
log(`System prompt loaded: ${SYSTEM_PROMPT.length} chars`);

const app = express();
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "coaching-agent" });
});

// ── Trigger endpoint ─────────────────────────────────────────────────────────

app.post("/trigger", async (req, res) => {
  const secret = process.env.TRIGGER_SECRET;
  if (secret) {
    const provided =
      req.headers["x-trigger-secret"] ||
      req.headers["x-cloudscheduler"] ||
      req.body?.secret;
    if (provided !== secret) {
      log("Unauthorized trigger attempt");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  log("Trigger received — starting coaching review...");
  const startTime = Date.now();
  const errors = [];

  try {
    const range = getTodayRangeMST();
    log(`Date: ${range.dateStr}, range: ${range.startISO} to ${range.endISO}`);

    // ── Step 1: Fetch all HubSpot data in parallel ─────────────────────────
    let calls = [];
    let notes = [];
    let contactData = { contacts: [], phoneMap: new Map() };
    let deals = [];

    const [callsR, notesR, contactsR, dealsR] = await Promise.allSettled([
      fetchTodaysCalls(range),
      fetchTodaysNotes(range),
      fetchActiveContacts(),
      fetchActiveDeals(),
    ]);

    if (callsR.status === "fulfilled") calls = callsR.value;
    else { errors.push(`Calls: ${callsR.reason.message}`); log("Calls failed:", callsR.reason.message); }

    if (notesR.status === "fulfilled") notes = notesR.value;
    else { errors.push(`Notes: ${notesR.reason.message}`); log("Notes failed:", notesR.reason.message); }

    if (contactsR.status === "fulfilled") contactData = contactsR.value;
    else { errors.push(`Contacts: ${contactsR.reason.message}`); log("Contacts failed:", contactsR.reason.message); }

    if (dealsR.status === "fulfilled") deals = dealsR.value;
    else { errors.push(`Deals: ${dealsR.reason.message}`); log("Deals failed:", dealsR.reason.message); }

    // ── Step 2: Fetch Quo texts + prior week stats (parallel) ──────────────
    let textThreads = [];
    let priorWeek = { total: 0, startStr: "", endStr: "" };

    const step2 = [];
    if (contactData.phoneMap.size > 0) {
      step2.push(
        fetchQuoTexts(contactData.phoneMap, range)
          .then((t) => { textThreads = t; })
          .catch((err) => { errors.push(`Quo texts: ${err.message}`); log("Quo texts failed:", err.message); })
      );
    }
    step2.push(
      fetchPriorWeekCallCount(range)
        .then((pw) => { priorWeek = pw; })
        .catch((err) => { errors.push(`Prior week: ${err.message}`); log("Prior week failed:", err.message); })
    );
    await Promise.all(step2);

    // ── Step 3: Enrich with contact details ────────────────────────────────
    const allContactIds = new Set();
    for (const c of calls) c.contactIds.forEach((id) => allContactIds.add(id));
    for (const n of notes) n.contactIds.forEach((id) => allContactIds.add(id));
    for (const d of deals) d.contactIds.forEach((id) => allContactIds.add(id));

    let contactMap = new Map();
    if (allContactIds.size > 0) {
      try {
        contactMap = await fetchContactDetails([...allContactIds]);
      } catch (err) {
        errors.push(`Contact details: ${err.message}`);
        log("Contact details failed:", err.message);
      }
    }

    // ── Step 4: Build context string ───────────────────────────────────────
    const context = buildContext(range.dateStr, calls, notes, deals, textThreads, contactMap, priorWeek);
    log(`Context built: ${context.length} chars`);

    // ── Step 5: Generate coaching review via Anthropic ──────────────────────
    const rawReview = await generateCoaching(SYSTEM_PROMPT, context);
    log(`Review generated: ${rawReview.length} chars`);

    // ── Step 5b: Extract actions JSON from review ────────────────────────
    const { reviewText, actions } = extractActions(rawReview);
    log(`Extracted ${actions.length} actions from review`);

    // ── Step 5c: Execute actions (create HubSpot tasks) ──────────────────
    let tasksCreated = 0;
    const taskErrors = [];

    if (actions.length > 0 && req.body?.dryRun !== true) {
      // Build name → contactId lookup from contactMap
      const nameLookup = new Map();
      for (const [id, info] of contactMap) {
        nameLookup.set(info.name.toLowerCase(), id);
      }

      // Tomorrow at 8:30 AM MST
      const tomorrow = new Date(`${range.dateStr}T08:30:00-07:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueDate = tomorrow.toISOString();

      for (const action of actions) {
        try {
          // Try to find the contact ID by name
          let contactId = null;
          if (action.contactName) {
            contactId = nameLookup.get(action.contactName.toLowerCase()) || null;
          }

          await createTask({
            subject: action.subject,
            body: action.body || "",
            dueDate,
            priority: action.priority || "MEDIUM",
            contactId,
          });
          tasksCreated++;
        } catch (err) {
          taskErrors.push(`Task "${action.subject}": ${err.message}`);
          log(`Task creation failed: ${err.message}`);
        }
      }
      log(`Created ${tasksCreated} of ${actions.length} tasks in HubSpot`);
    }
    if (taskErrors.length > 0) errors.push(...taskErrors);

    // ── Step 6: Split and optionally post to Google Chat ────────────────────
    const sections = splitIntoSections(reviewText);
    log(`Split into ${sections.length} sections`);

    const dryRun = req.body?.dryRun === true;
    let chatMessages = 0;

    if (dryRun) {
      log("Dry run — skipping Google Chat posting");
    } else {
      const chatResults = await postMultipleToChat(sections);
      chatMessages = chatResults.length;
      log(`Posted ${chatMessages} messages to Google Chat`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Coaching review complete in ${elapsed}s`);

    res.json({
      ok: true,
      elapsed: `${elapsed}s`,
      calls: calls.length,
      notes: notes.length,
      textThreads: textThreads.length,
      deals: deals.length,
      reviewChars: reviewText.length,
      chatMessages,
      tasksCreated,
      actions: dryRun ? actions : undefined,
      sections: dryRun ? sections : undefined,
      context: dryRun ? context : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Fatal error after ${elapsed}s:`, err);
    res.status(500).json({
      ok: false,
      error: err.message,
      elapsed: `${elapsed}s`,
    });
  }
});

// ── Morning briefing endpoint ─────────────────────────────────────────────────

app.post("/morning", async (req, res) => {
  const secret = process.env.TRIGGER_SECRET;
  if (secret) {
    const provided =
      req.headers["x-trigger-secret"] ||
      req.headers["x-cloudscheduler"] ||
      req.body?.secret;
    if (provided !== secret) {
      log("Unauthorized morning attempt");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  log("Morning briefing triggered...");
  const startTime = Date.now();
  const errors = [];

  try {
    const today = getTodayRangeMST();
    const yesterday = getYesterdayRangeMST();
    log(`Today: ${today.dateStr}, Yesterday: ${yesterday.dateStr}`);

    // ── Fetch all data in parallel ───────────────────────────────────────
    let yesterdayCalls = [];
    let yesterdayNotes = [];
    let allContacts = [];
    let deals = [];

    const [callsR, notesR, contactsR, dealsR] = await Promise.allSettled([
      fetchTodaysCalls(yesterday),
      fetchTodaysNotes(yesterday),
      fetchAllContacts(),
      fetchActiveDeals(),
    ]);

    if (callsR.status === "fulfilled") yesterdayCalls = callsR.value;
    else { errors.push(`Calls: ${callsR.reason.message}`); log("Calls failed:", callsR.reason.message); }

    if (notesR.status === "fulfilled") yesterdayNotes = notesR.value;
    else { errors.push(`Notes: ${notesR.reason.message}`); log("Notes failed:", notesR.reason.message); }

    if (contactsR.status === "fulfilled") allContacts = contactsR.value;
    else { errors.push(`Contacts: ${contactsR.reason.message}`); log("Contacts failed:", contactsR.reason.message); }

    if (dealsR.status === "fulfilled") deals = dealsR.value;
    else { errors.push(`Deals: ${dealsR.reason.message}`); log("Deals failed:", dealsR.reason.message); }

    // ── Enrich deals with contact names ──────────────────────────────────
    const allContactIds = new Set();
    for (const c of yesterdayCalls) c.contactIds.forEach((id) => allContactIds.add(id));
    for (const n of yesterdayNotes) n.contactIds.forEach((id) => allContactIds.add(id));
    for (const d of deals) d.contactIds.forEach((id) => allContactIds.add(id));

    let contactMap = new Map();
    if (allContactIds.size > 0) {
      try {
        contactMap = await fetchContactDetails([...allContactIds]);
      } catch (err) {
        errors.push(`Contact details: ${err.message}`);
        log("Contact details failed:", err.message);
      }
    }

    // ── Build morning context ────────────────────────────────────────────
    const context = buildMorningContext(today.dateStr, yesterday.dateStr, yesterdayCalls, yesterdayNotes, deals, allContacts, contactMap);
    log(`Morning context built: ${context.length} chars`);

    // ── Generate briefing via Anthropic ──────────────────────────────────
    const briefing = await generateCoaching(SYSTEM_PROMPT, context);
    log(`Morning briefing generated: ${briefing.length} chars`);

    // ── Split and post ──────────────────────────────────────────────────
    const sections = splitIntoSections(briefing);
    log(`Split into ${sections.length} sections`);

    const dryRun = req.body?.dryRun === true;
    let chatMessages = 0;

    if (dryRun) {
      log("Dry run — skipping Google Chat posting");
    } else {
      const chatResults = await postMultipleToChat(sections);
      chatMessages = chatResults.length;
      log(`Posted ${chatMessages} morning briefing messages to Google Chat`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Morning briefing complete in ${elapsed}s`);

    res.json({
      ok: true,
      elapsed: `${elapsed}s`,
      yesterdayCalls: yesterdayCalls.length,
      yesterdayNotes: yesterdayNotes.length,
      totalContacts: allContacts.length,
      deals: deals.length,
      briefingChars: briefing.length,
      chatMessages,
      sections: dryRun ? sections : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Fatal error after ${elapsed}s:`, err);
    res.status(500).json({
      ok: false,
      error: err.message,
      elapsed: `${elapsed}s`,
    });
  }
});

// ── Action extraction ────────────────────────────────────────────────────────

function extractActions(rawReview) {
  const actionsMatch = rawReview.match(/<<<ACTIONS>>>([\s\S]*?)<<<END_ACTIONS>>>/);
  let actions = [];
  let reviewText = rawReview;

  if (actionsMatch) {
    // Remove the actions block from the review text
    reviewText = rawReview.replace(/\n*<<<ACTIONS>>>[\s\S]*?<<<END_ACTIONS>>>\n*/g, "").trim();

    try {
      actions = JSON.parse(actionsMatch[1].trim());
      if (!Array.isArray(actions)) actions = [];
    } catch (err) {
      log(`Failed to parse actions JSON: ${err.message}`);
      actions = [];
    }
  }

  return { reviewText, actions };
}

// ── Context builder ──────────────────────────────────────────────────────────

function buildContext(dateStr, calls, notes, deals, textThreads, contactMap, priorWeek) {
  const dayOfWeek = new Date(dateStr + "T12:00:00-07:00")
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Phoenix" });

  // Pre-compute verified stats (model MUST use these, not recount)
  const totalCalls = calls.length;
  const connects = calls.filter((c) => c.durationMs > 60000).length;
  const voicemails = totalCalls - connects;
  const totalTalkMs = calls.reduce((sum, c) => sum + (c.durationMs || 0), 0);
  const totalTalkMin = Math.floor(totalTalkMs / 60000);
  const totalTalkSec = Math.round((totalTalkMs % 60000) / 1000);
  const firstCall = calls.length > 0 ? calls[0].time : "N/A";
  const lastCall = calls.length > 0 ? calls[calls.length - 1].time : "N/A";
  const callsWithTranscript = calls.filter((c) => c.transcript).length;

  const lines = [];
  lines.push(`## TODAY'S DATE: ${dateStr} (${dayOfWeek})`);
  lines.push("");

  // Verified scorecard stats (pre-computed — model must not recalculate)
  lines.push("## VERIFIED SCORECARD STATS (pre-computed — use these EXACTLY, do not recalculate)");
  lines.push(`Total calls logged: ${totalCalls}`);
  lines.push(`Connects (calls over 60 sec): ${connects}`);
  lines.push(`Voicemails/no-answer (calls under 60 sec): ${voicemails}`);
  lines.push(`Total talk time: ${totalTalkMin} min ${totalTalkSec} sec`);
  lines.push(`First call: ${firstCall}`);
  lines.push(`Last call: ${lastCall}`);
  lines.push(`Notes logged: ${notes.length}`);
  lines.push(`Text threads active: ${textThreads.length}`);
  lines.push(`Calls with transcript data: ${callsWithTranscript} of ${totalCalls}`);
  if (priorWeek && priorWeek.total > 0) {
    lines.push(`Prior week (${priorWeek.startStr} to ${priorWeek.endStr}): ${priorWeek.total} calls (target: 50)`);
  }
  lines.push("");

  // Calls
  lines.push(`## HUBSPOT CALLS (${calls.length} calls logged today)`);
  if (calls.length === 0) {
    lines.push("No calls logged.");
  }
  for (const call of calls) {
    lines.push(`- Time: ${call.time} | Duration: ${call.duration} | Direction: ${call.direction} | Status: ${call.status}`);
    lines.push(`  Title: ${call.title}`);
    if (call.contactIds.length > 0) {
      const names = call.contactIds.map((id) => {
        const c = contactMap.get(id);
        return c ? `${c.name}${c.company ? ` (${c.company})` : ""}${c.ownerId !== "161300089" ? " [OWNED BY MATT]" : ""}` : `Contact ${id}`;
      });
      lines.push(`  Associated contacts: ${names.join(", ")}`);
    }
    if (call.transcript) {
      const truncated = call.transcript.length > 2000
        ? call.transcript.slice(0, 2000) + "... [truncated]"
        : call.transcript;
      lines.push(`  Transcript: ${truncated}`);
    } else {
      lines.push(`  Transcript: [NO TRANSCRIPT AVAILABLE — do not quote or paraphrase what was said on this call]`);
    }
    lines.push("");
  }

  // Notes
  lines.push(`## HUBSPOT NOTES (${notes.length} notes logged today)`);
  if (notes.length === 0) {
    lines.push("No notes logged.");
  }
  for (const note of notes) {
    lines.push(`- Time: ${note.time}`);
    const body = note.body.replace(/<[^>]+>/g, "").trim(); // Strip HTML
    lines.push(`  Body: ${body}`);
    if (note.contactIds.length > 0) {
      const names = note.contactIds.map((id) => {
        const c = contactMap.get(id);
        return c ? c.name : `Contact ${id}`;
      });
      lines.push(`  Associated contacts: ${names.join(", ")}`);
    }
    lines.push("");
  }

  // Deals
  lines.push(`## ACTIVE DEALS (${deals.length} open deals)`);
  for (const deal of deals) {
    const contacts = deal.contactIds.map((id) => {
      const c = contactMap.get(id);
      return c ? c.name : `Contact ${id}`;
    });
    lines.push(`- ${deal.name} | Stage: ${deal.stage}${deal.amount ? ` | Amount: $${deal.amount}` : ""}`);
    if (contacts.length > 0) lines.push(`  Contacts: ${contacts.join(", ")}`);
    lines.push("");
  }

  // Text messages
  lines.push(`## TEXT MESSAGES FROM QUO (${textThreads.length} active threads today)`);
  if (textThreads.length === 0) {
    lines.push("No text conversations today.");
  }
  for (const thread of textThreads) {
    lines.push(`### ${thread.contactName} (${thread.phone})${thread.company ? ` — ${thread.company}` : ""}`);
    for (const msg of thread.messages) {
      const dir = msg.direction === "incoming" ? "INBOUND" : "OUTBOUND";
      lines.push(`  ${msg.time} [${dir}]: ${msg.text}`);
    }
    lines.push("");
  }

  // Instructions
  lines.push("## INSTRUCTIONS");
  lines.push("");
  lines.push("Generate a COMPREHENSIVE daily coaching review. This will be posted to Google Chat as separate messages (split at each ━━━ header line).");
  lines.push("");
  lines.push("FORMATTING RULES (critical — follow EXACTLY):");
  lines.push("- Use *text* for bold in Google Chat (single asterisk each side). Bold: contact names, company names, grades, key phrases, section sub-headers.");
  lines.push("- Do NOT use markdown double-asterisk **bold** or ## headers. Only use ``` code blocks for the SCORECARD section.");
  lines.push("- Use ━━━ SECTION TITLE ━━━ as section separators (three horizontal bar characters on each side).");
  lines.push("- Use 🔴 for critical issues, ⚠️ for warnings, ✅ for good things, ❌ for failures/missing items.");
  lines.push("- Use plain text with line breaks. Align columns with spaces in the scorecard.");
  lines.push("- Put BLANK LINES between each numbered item and between logical groups for visual breathing room.");
  lines.push("- Write in direct, punchy paragraphs. No sub-headers like 'What you did wrong:' — just write the coaching directly.");
  lines.push("- When coaching a call, provide EXACT scripted alternatives inline in the prose, not as separate blocks.");
  lines.push("- Reference CRM data by name — 'Matt documented the January conversation' not 'prior history exists'.");
  lines.push("");
  lines.push("GRADING: Use a *1-5 scale* (not letter grades):");
  lines.push("- *5/5*: Exceptional — great discovery, specific proposal, named decision-maker, time-bound next step");
  lines.push("- *4/5*: Solid — clear intel gathered, next step locked, minor misses");
  lines.push("- *3/5*: Adequate — connected but missed key opportunities, no specific ask, generic follow-up");
  lines.push("- *2/5*: Poor — no prep, missed obvious CRM context, 'sounds good' without locking down, voicemail with no message");
  lines.push("- *1/5*: Harmful — wrong name used, ownership violation, opportunity fumbled, weeks of nurturing with zero pipeline");
  lines.push("- Voicemails are NOT meaningful conversations. Grade them 2 or lower unless a strong message was left.");
  lines.push("- 'Sounds good' in response to an offered opportunity = automatic grade drop.");
  lines.push("");
  lines.push("NOTES AS CALLS: Some HubSpot notes may describe phone conversations that weren't logged as call activities. If a note clearly describes a phone call (mentions calling someone, conversation details, what was discussed), treat it as a call and coach it. Flag the logging gap.");
  lines.push("");
  lines.push("CRM DATA LIMITATION: You only see contacts associated with today's calls, notes, and deals. You do NOT have visibility into all HubSpot contacts. When someone is mentioned in a call or text (e.g., 'my boss Steven'), do NOT assume they are missing from HubSpot. Instead say 'verify [Name] has a HubSpot record and is linked to [contact/deal]' — not 'create [Name] in HubSpot.' Only flag contacts as definitively missing if the data explicitly says so.");
  lines.push("");
  lines.push("STRUCTURE (each ━━━ line starts a new Chat message):");
  lines.push("");
  lines.push("FIRST MESSAGE — HEADER + SCORECARD (combined as one message):");
  lines.push("📋 *DAILY COACHING REVIEW* — [Day], [Full Date like February 24, 2026]");
  lines.push("*Anonno Islam* | 1-800-Packouts East Valley");
  lines.push("");
  lines.push("━━━ SCORECARD ━━━");
  lines.push("Wrap the scorecard data in triple backticks (```) to render as a code block with offset background in Google Chat:");
  lines.push("```");
  lines.push("CALLS LOGGED:         [N] of 10 target        [MET or MISSED]");
  lines.push("CONVERSATIONS:        [N] ([count voicemails vs connects accurately])");
  lines.push("NEW CONTACTS CREATED: [N]");
  lines.push("NOTES LOGGED:         [N]");
  lines.push("FIRST CALL:           [time]                   [NOON DEADLINE BLOWN if after 12pm]");
  lines.push("LAST CALL:            [time]");
  lines.push("ACTIVE SELLING TIME:  [duration]");
  lines.push("Race to 1500 Pace:    [N] BD + [N] coordination = [X]% of 13/day target");
  lines.push("Last Week:            [prior week calls] logged vs target of 50");
  lines.push("```");
  lines.push("Do NOT use bold (*) or emoji INSIDE the code block — they won't render. Use plain text labels like MET/MISSED instead of ✅/❌ inside the code block. Put emoji/bold OUTSIDE the code block only.");
  lines.push("");
  lines.push("IMPORTANT: Count voicemails vs connects ACCURATELY. A call under 60 sec with status NO_ANSWER/BUSY or voicemail transcript = VOICEMAIL. Do not hallucinate counts.");
  lines.push("");
  lines.push("━━━ ESCALATION FLAGS ━━━");
  lines.push("Only real issues. Use 🔴 for critical, ⚠️ for medium. Bold the contact name and company.");
  lines.push("Include: Matt-owned contacts called without coordination, active deals without contact records, missed targets, mishandled opportunities.");
  lines.push("State RULES in all caps when a systemic issue needs a firm standard.");
  lines.push("");
  lines.push("━━━ CALL [N]: [Name] — [Company] ━━━  (ONE SECTION PER CALL)");
  lines.push("*[time]* | *[duration like 2 min 43 sec]* | *[outcome: Connected/Voicemail — no message left/Receptionist]* | *Grade: [1-5]/5*");
  lines.push("");
  lines.push("Write 150-300 words of direct, constructive COACHING paragraphs. NOT sub-headed blocks — just prose.");
  lines.push("Style: Start with what happened. Acknowledge what went well if anything did. Then coach on what to improve: what the better play was (exact scripted alternative in quotes inline), what CRM context was available, what to do next. Frame corrections as investments in growth.");
  lines.push("- Bold *contact names* and *company names* on first mention");
  lines.push("- If contact is OWNED BY MATT, flag with 🔴 prominently");
  lines.push("- Cross-reference related text threads if the same person was texted");
  lines.push("- End with *Next step:* as a bold label followed by the specific action");
  lines.push("");
  lines.push("━━━ TEXT COACHING ━━━");
  lines.push("For each text thread, bold the contact name and grade:");
  lines.push("*Jesse Dean — Flow State Restoration* | *Grade: 5/5*");
  lines.push("Then coaching paragraphs with cross-references to calls and CRM gaps.");
  lines.push("Put a blank line between each thread.");
  lines.push("🔴 Flag any active deal contacts not in HubSpot.");
  lines.push("");
  lines.push("━━━ CRM HYGIENE — *Grade: [1-5]/5* ━━━");
  lines.push("Organized with bold sub-headers and blank lines between groups:");
  lines.push("");
  lines.push("*Missing contact records for active deals:* (🔴 critical)");
  lines.push("RULE: EVERY HOMEOWNER OR POLICYHOLDER TIED TO A DEAL MUST HAVE A CONTACT PROFILE IN HUBSPOT LINKED TO THAT DEAL.");
  lines.push("");
  lines.push("*Verify in HubSpot:*");
  lines.push("• People mentioned in calls/texts who may need a record created or linked. Say 'verify' not 'create' — you can't see all contacts.");
  lines.push("");
  lines.push("*Incomplete records:*");
  lines.push("• each incomplete record");
  lines.push("");
  lines.push("*Stale contacts (14+ days, no touch):*");
  lines.push("• *Name* (Company) — [N] days ← note if decision-maker");
  lines.push("");
  lines.push("━━━ TOMORROW'S PRIORITIES ━━━");
  lines.push("This IS Anonno's call list for tomorrow. The morning briefing will build on this. Numbered priority list with specific people to call, in order. Put a BLANK LINE between each numbered item:");
  lines.push("");
  lines.push("1. *10 calls BEFORE NOON.* Block 8am-12pm. First dial by 8:30 AM. No excuses.");
  lines.push("");
  lines.push("2. *Call [Name]* at [Company] ([reason])");
  lines.push("   Reference: [what to mention from CRM]");
  lines.push("   Opening: \"[exact scripted opener]\"");
  lines.push("   Ask: \"[specific ask]\"");
  lines.push("");
  lines.push("[etc for each priority, with blank line between each]");
  lines.push("");
  lines.push("Then a separate bold header:");
  lines.push("*CRM CLEANUP* (at lunch, not during call block):");
  lines.push("• each cleanup item on its own line");
  lines.push("");
  lines.push("━━━ PATTERN OF THE DAY ━━━");
  lines.push("2-3 paragraph narrative synthesis. Identify the day's coaching theme.");
  lines.push("Track the score progression through the day (did he get better or worse?).");
  lines.push("Name the one behavioral change that would have the biggest impact on his results.");
  lines.push("End with tomorrow's focus: *10 calls before noon. Let's get it.*");
  lines.push("");
  lines.push("CRITICAL REQUIREMENTS:");
  lines.push("- This review should be 5000-10000 words. Do NOT summarize or abbreviate.");
  lines.push("- Every call gets 150-300 words of coaching. Every text thread gets full analysis.");
  lines.push("- Every CRM gap gets called out by name. Every tomorrow action gets a specific person and deadline.");
  lines.push("- Give scripted alternatives for what Anonno should have said — real sentences he can use.");
  lines.push("- TONE: You're a coach who's invested in Anonno's success. Be direct and specific, but not mean. Lead with what went well, then coach on what to improve. Frame corrections as 'here's the better play' not 'you failed.' BANNED PHRASES: 'amateur hour', 'botched', 'disaster', 'massive fumble', 'major violation', 'unacceptable', 'this is bad'. PREFERRED FRAMES: 'the better play', 'here's what great looks like', 'you left money on the table', 'let's fix this', 'you're capable of more'. Still be honest about real problems — ownership violations are serious, missed targets are real — but frame them as 'here's the rule and here's why it matters' not 'you messed up again.'");
  lines.push("- Use *bold* formatting generously for names, companies, grades, key phrases, and sub-headers.");
  lines.push("- Put blank lines between numbered items and between logical groups. White space is clarity.");
  lines.push("");
  lines.push("DATA INTEGRITY (non-negotiable — credibility depends on this):");
  lines.push("- Use the VERIFIED SCORECARD STATS exactly as provided. Do NOT recalculate or recount anything.");
  lines.push("- NEVER fabricate transcript quotes. If a call has no transcript data, say 'no transcript available' and coach based on the metadata (duration, status, associated contacts, notes).");
  lines.push("- NEVER invent phone numbers. Only include phone numbers that appear in the provided data.");
  lines.push("- NEVER claim someone said something specific unless it's in the transcript or note text provided.");
  lines.push("- NEVER assert a contact does or doesn't exist in HubSpot. You only see contacts associated with today's activity. Use 'verify' language.");
  lines.push("- NEVER fabricate names of people, companies, or stale contacts. Only reference names that appear in the provided data.");
  lines.push("- If you're not sure about a detail, omit it. A wrong fact is worse than no fact — it gives the reader ammunition to dismiss everything else.");
  lines.push("- Coaching opinions (grades, what should have been done, scripted alternatives) are fine. Factual claims (what was said, who exists, what numbers are) must come from the data.");
  lines.push("- TRANSCRIPT NAME ERRORS: The Quo AI transcription system frequently mishears how Anonno introduces himself — it may transcribe 'Nano' as 'Dana', 'Anna', or other wrong names. Do NOT coach on mispronouncing his own name or using the wrong company name based solely on transcript text. Ignore any name/company errors in Quo transcripts.");
  lines.push("");
  lines.push("━━━ READY TO SEND ━━━");
  lines.push("Include a section with pre-written text messages Anonno can copy and send immediately.");
  lines.push("For each text, format as:");
  lines.push("📱 *Text to [Name]* ([Company or context])");
  lines.push("\"[The exact message, ready to copy-paste. Write it in Anonno's voice — casual, professional, specific.]\"");
  lines.push("");
  lines.push("Include texts for: follow-ups from today's calls, coordination with Matt on ownership issues, locking down open loops (fire leads, vendor packets, etc.).");
  lines.push("These should be 1-3 sentences each. Short, direct, actionable.");
  lines.push("CRITICAL RULE FOR TEXTS TO MATT: Never draft a message that pushes a decision up without a recommendation. 'How should I proceed?' is NOT acceptable. Every message to Matt must include a proposed solution: 'I'd like to do X — does that work?' not 'What do you want me to do?' Anonno should think first, propose a plan, and ask for approval — not dump the decision on his boss.");
  lines.push("");
  lines.push("ACTIONS JSON — CRITICAL:");
  lines.push("After the full coaching review (after the PATTERN OF THE DAY and READY TO SEND sections), output a JSON block on its own line starting with <<<ACTIONS>>> and ending with <<<END_ACTIONS>>>.");
  lines.push("This JSON array contains automated follow-up tasks that will be created in HubSpot. Each task object:");
  lines.push('{ "subject": "Call Rich Campos — ATI Restoration", "body": "Reference Mike Dominguez. Ask about overflow packout needs.", "priority": "HIGH", "contactName": "Rich Campos" }');
  lines.push("Priority: HIGH for revenue opportunities and ownership violations, MEDIUM for follow-ups, LOW for CRM cleanup.");
  lines.push("Generate 3-8 tasks from your Next Steps and Tomorrow's Priorities. Only include tasks with specific, actionable subjects.");
  lines.push("The contactName should match a name from the provided data exactly (for association lookup).");

  return lines.join("\n");
}

// ── Morning context builder ──────────────────────────────────────────────────

function buildMorningContext(todayStr, yesterdayStr, yesterdayCalls, yesterdayNotes, deals, allContacts, contactMap) {
  const dayOfWeek = new Date(todayStr + "T12:00:00-07:00")
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Phoenix" });

  const lines = [];
  lines.push(`## TODAY'S DATE: ${todayStr} (${dayOfWeek})`);
  lines.push("");

  // Yesterday's recap — pre-computed stats
  const totalDurationMs = yesterdayCalls.reduce((sum, c) => sum + (c.durationMs || 0), 0);
  const totalMin = Math.floor(totalDurationMs / 60000);
  const totalSec = Math.round((totalDurationMs % 60000) / 1000);
  const connects = yesterdayCalls.filter((c) => c.durationMs > 60000).length;
  const voicemails = yesterdayCalls.length - connects;

  lines.push(`## VERIFIED YESTERDAY STATS (pre-computed — use EXACTLY, do not recalculate)`);
  lines.push(`Calls logged: ${yesterdayCalls.length} (target: 10)`);
  lines.push(`Connects: ${connects}`);
  lines.push(`Voicemails/no-answer: ${voicemails}`);
  lines.push(`Total talk time: ${totalMin} min ${totalSec} sec`);
  lines.push(`Notes logged: ${yesterdayNotes.length}`);
  lines.push("");

  lines.push(`## YESTERDAY'S ACTIVITY (${yesterdayStr})`);

  if (yesterdayCalls.length > 0) {
    lines.push("Yesterday's calls:");
    for (const call of yesterdayCalls) {
      const names = call.contactIds.map((id) => {
        const c = contactMap.get(id);
        return c ? `${c.name}${c.company ? ` (${c.company})` : ""}` : `Contact ${id}`;
      });
      lines.push(`- ${call.time} | ${call.duration} | ${call.direction} | ${names.join(", ") || "Unknown"}`);
      if (call.title) lines.push(`  Title: ${call.title}`);
    }
  }
  lines.push("");

  // Yesterday's notes (for follow-up context)
  if (yesterdayNotes.length > 0) {
    lines.push("Yesterday's notes:");
    for (const note of yesterdayNotes) {
      const body = note.body.replace(/<[^>]+>/g, "").trim();
      const truncated = body.length > 500 ? body.slice(0, 500) + "..." : body;
      const names = note.contactIds.map((id) => {
        const c = contactMap.get(id);
        return c ? c.name : `Contact ${id}`;
      });
      lines.push(`- ${note.time} | ${names.join(", ") || "No contact"}`);
      lines.push(`  ${truncated}`);
    }
    lines.push("");
  }

  // Active deals
  lines.push(`## ACTIVE DEALS (${deals.length} open deals)`);
  for (const deal of deals) {
    const contacts = deal.contactIds.map((id) => {
      const c = contactMap.get(id);
      return c ? c.name : `Contact ${id}`;
    });
    lines.push(`- ${deal.name} | Stage: ${deal.stage}${deal.amount ? ` | Amount: $${deal.amount}` : ""}`);
    if (contacts.length > 0) lines.push(`  Contacts: ${contacts.join(", ")}`);
  }
  lines.push("");

  // All contacts with stale detection
  const staleContacts = allContacts.filter((c) => c.daysSinceTouch >= 14);
  const recentContacts = allContacts.filter((c) => c.daysSinceTouch < 14);

  lines.push(`## STALE CONTACTS (${staleContacts.length} contacts not touched in 14+ days)`);
  for (const c of staleContacts.slice(0, 30)) {
    lines.push(`- ${c.name}${c.company ? ` (${c.company})` : ""}${c.title ? ` — ${c.title}` : ""} | ${c.daysSinceTouch} days stale${c.deals > 0 ? ` | ${c.deals} active deal(s)` : ""}`);
  }
  lines.push("");

  lines.push(`## RECENT CONTACTS (${recentContacts.length} contacts touched in last 14 days)`);
  for (const c of recentContacts.slice(0, 30)) {
    lines.push(`- ${c.name}${c.company ? ` (${c.company})` : ""}${c.title ? ` — ${c.title}` : ""} | ${c.daysSinceTouch} day(s) ago${c.deals > 0 ? ` | ${c.deals} active deal(s)` : ""}`);
  }
  lines.push("");

  // Morning briefing instructions
  lines.push("## INSTRUCTIONS");
  lines.push("");
  lines.push("Generate a MORNING BRIEFING for Anonno. This will be posted to Google Chat as separate messages (split at each ━━━ header line).");
  lines.push("");
  lines.push("FORMATTING RULES:");
  lines.push("- Use *text* for bold in Google Chat (single asterisk each side).");
  lines.push("- Do NOT use markdown double-asterisk **bold** or ## headers. Only use ``` code blocks for the RECAP section.");
  lines.push("- Use ━━━ SECTION TITLE ━━━ as section separators.");
  lines.push("- Use 🔴 for critical, ⚠️ for warnings, 🎯 for targets, 📞 for calls.");
  lines.push("- Put blank lines between numbered items for readability.");
  lines.push("- Be direct and specific. Every contact on the call list needs a reason and an opening line.");
  lines.push("");
  lines.push("STRUCTURE:");
  lines.push("");
  lines.push("FIRST MESSAGE — HEADER + YESTERDAY RECAP:");
  lines.push("📋 *MORNING BRIEFING* — [Day], [Full Date]");
  lines.push("*Anonno Islam* | 1-800-Packouts East Valley");
  lines.push("");
  lines.push("━━━ YESTERDAY RECAP ━━━");
  lines.push("Wrap in ``` code block:");
  lines.push("CALLS:          [N] of 10 target");
  lines.push("CONVERSATIONS:  [N connects] of 13/day Race to 1500 target");
  lines.push("NOTES LOGGED:   [N]");
  lines.push("VERDICT:        [one-line assessment]");
  lines.push("");
  lines.push("━━━ TODAY'S CALL LIST ━━━");
  lines.push("This is the core of the briefing. Prioritized numbered list of AT LEAST 10 contacts TODAY (must match or exceed the 10-call target — never give him a list shorter than the target).");
  lines.push("FUNNEL GROWTH IS CRITICAL: Do NOT just recycle the same 5-6 names from yesterday. Maximum 3-4 should be follow-ups from previous days. The rest MUST be contacts he hasn't talked to recently — stale contacts (14+ days), or contacts he's never called. The goal is to EXPAND the pipeline, not circle the same warm relationships.");
  lines.push("CHANNEL MIX: Not every outreach needs to be a phone call. For some contacts, a strategic text is the better first move — especially for initial re-engagement of stale contacts or confirming meetings. Mark each item as 📞 (call) or 📱 (text) based on what makes sense for that contact and situation. Calls for discovery, relationship building, and closing. Texts for quick confirmations, re-engagement, and setting up calls.");
  lines.push("SEQUENCE: Order the list strategically. High-priority revenue calls first (8:30-10am). Stale re-engagement texts can go out early to warm them up for calls later. New outreach in the late morning. Don't front-load all the easy texts — the hard calls need to happen first.");
  lines.push("Pull from: committed follow-ups (max 3-4), stale high-value contacts, and new outreach targets from the contact list.");
  lines.push("Order by priority: (1) committed follow-ups from yesterday, (2) active deal contacts needing attention, (3) stale high-value contacts, (4) new outreach targets.");
  lines.push("");
  lines.push("For each contact:");
  lines.push("1. *[Name]* — [Company] ([phone if available])");
  lines.push("   *Why:* [specific reason — not 'follow up']");
  lines.push("   *Reference:* [what to look up in CRM before calling]");
  lines.push("   *Opening:* \"[exact scripted opening line]\"");
  lines.push("   *Ask:* \"[the specific ask or close]\"");
  lines.push("");
  lines.push("Put a blank line between each contact for readability.");
  lines.push("");
  lines.push("━━━ DEAL WATCH ━━━");
  lines.push("Active deals that need attention today. For each:");
  lines.push("- Deal name, stage, amount");
  lines.push("- What action is needed and by whom");
  lines.push("- Any risks or blockers");
  lines.push("");
  lines.push("━━━ STALE CONTACTS — WAKE THESE UP ━━━");
  lines.push("List 5-8 highest-priority stale contacts (14+ days) that should get a call this week.");
  lines.push("For each: name, company, days since last touch, and a specific reason/hook to re-engage.");
  lines.push("");
  lines.push("━━━ TODAY'S TARGETS ━━━");
  lines.push("🎯 *10 calls before noon.* First dial by 8:30 AM.");
  lines.push("🎯 *13 meaningful conversations* for Race to 1500 pace.");
  lines.push("🎯 *CRM cleanup:* [specific items from yesterday that need fixing]");
  lines.push("🎯 *One commercial conversion ask* — at least one call today must end with a quote request or vendor list submission.");
  lines.push("");
  lines.push("End with: *Clock starts NOW. First dial by 8:30. Go.*");
  lines.push("");
  lines.push("CRITICAL: Reference real data. Use actual contact names, companies, and CRM context from yesterday's activity and the contact lists provided. Be specific with opening lines and asks. This briefing should be actionable the moment Anonno reads it.");
  lines.push("");
  lines.push("DATA INTEGRITY (non-negotiable):");
  lines.push("- NEVER invent phone numbers. Only include numbers that appear in the provided data.");
  lines.push("- NEVER fabricate names or companies. Only reference contacts from the provided data.");
  lines.push("- NEVER assert a contact does or doesn't exist in HubSpot. Use 'verify' language.");
  lines.push("- NEVER claim something was said unless it appears in the notes or call data.");
  lines.push("- Use the pre-computed stats for yesterday's recap EXACTLY as provided.");
  lines.push("- If you're not sure about a detail, omit it. A wrong fact destroys credibility.");

  return lines.join("\n");
}

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  log(`Coaching agent listening on port ${PORT}`);
  log(`POST /trigger to run coaching review`);
  log(`POST /morning for morning briefing`);
  log(`GET /health for health check`);
});
