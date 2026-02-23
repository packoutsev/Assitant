/**
 * MCP tool definitions for Xcelerate job management.
 *
 * Shared between server.js (SSE/Cloud Run) and index.js (stdio/local).
 */

import { z } from "zod";
import { Firestore } from "@google-cloud/firestore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatJob(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    job_number: d.job_number || null,
    claim_number: d.claim_number || null,
    customer_name: d.customer_name || null,
    property_address: d.property_address || null,
    property_city: d.property_city || null,
    property_state: d.property_state || null,
    property_zip: d.property_zip || null,
    status: d.status || null,
    substatus: d.substatus || null,
    job_type: d.job_type || null,
    loss_type: d.loss_type || null,
    project_manager: d.project_manager || null,
    assigned_crew: d.assigned_crew || [],
    estimator: d.estimator || null,
    estimated_amount: d.estimated_amount || null,
    date_of_loss: d.date_of_loss || null,
    date_received: d.date_received || null,
    date_scheduled: d.date_scheduled || null,
    date_started: d.date_started || null,
    date_completed: d.date_completed || null,
    updated_at: d.updated_at ? d.updated_at.toDate?.().toISOString() || d.updated_at : null,
  };
}

function formatJobFull(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    ...d,
    created_at: d.created_at?.toDate?.().toISOString() || d.created_at || null,
    updated_at: d.updated_at?.toDate?.().toISOString() || d.updated_at || null,
    raw: undefined, // strip raw payload from tool output
  };
}

function formatNote(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    text: d.text || "",
    author: d.author || null,
    type: d.type || "internal",
    created_at: d.created_at?.toDate?.().toISOString() || d.created_at || null,
  };
}

function formatSchedule(doc, jobContext) {
  const d = doc.data();
  return {
    id: doc.id,
    job_id: d.job_id || jobContext?.id || null,
    customer_name: jobContext?.customer_name || null,
    property_address: jobContext?.property_address || null,
    event_type: d.event_type || null,
    scheduled_date: d.scheduled_date || null,
    scheduled_time: d.scheduled_time || null,
    end_time: d.end_time || null,
    assigned_to: d.assigned_to || [],
    location: d.location || null,
    notes: d.notes || null,
    status: d.status || null,
    created_at: d.created_at?.toDate?.().toISOString() || d.created_at || null,
  };
}

function partialMatch(value, needle) {
  if (!value || !needle) return false;
  return String(value).toLowerCase().includes(needle.toLowerCase());
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolListJobs(db, { limit, status }) {
  let query = db.collection("jobs").orderBy("updated_at", "desc");

  if (status) {
    query = query.where("status", "==", status);
  }

  query = query.limit(limit || 25);
  const snap = await query.get();
  return snap.docs.map(formatJob);
}

async function toolGetJob(db, { job_id }) {
  const jobRef = db.collection("jobs").doc(job_id);
  const jobDoc = await jobRef.get();

  if (!jobDoc.exists) {
    throw new Error(`Job ${job_id} not found`);
  }

  const job = formatJobFull(jobDoc);

  // Fetch notes
  const notesSnap = await jobRef.collection("notes").orderBy("created_at", "desc").get();
  job.notes = notesSnap.docs.map(formatNote);

  // Fetch schedule
  const scheduleSnap = await jobRef.collection("schedule").orderBy("scheduled_date", "desc").get();
  job.schedule = scheduleSnap.docs.map((d) => formatSchedule(d));

  return job;
}

async function toolSearchJobs(db, { customer_name, address, status, assignee, start_date, end_date }) {
  // Start with base query — we can apply at most one inequality range in Firestore,
  // so we pick the most selective server-side filter.
  let results = [];

  if (assignee) {
    // Two queries: project_manager == assignee, OR assigned_crew array-contains assignee
    const [pmSnap, crewSnap] = await Promise.all([
      db.collection("jobs").where("project_manager", "==", assignee).get(),
      db.collection("jobs").where("assigned_crew", "array-contains", assignee).get(),
    ]);

    const seen = new Set();
    for (const doc of [...pmSnap.docs, ...crewSnap.docs]) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        results.push(doc);
      }
    }
  } else if (status && (start_date || end_date)) {
    // Status + date range: filter status server-side, date client-side
    const snap = await db.collection("jobs").where("status", "==", status).get();
    results = snap.docs;
  } else if (status) {
    const snap = await db.collection("jobs").where("status", "==", status).get();
    results = snap.docs;
  } else if (start_date || end_date) {
    let query = db.collection("jobs").orderBy("date_received", "desc");
    if (start_date) query = query.where("date_received", ">=", start_date);
    if (end_date) query = query.where("date_received", "<=", end_date);
    const snap = await query.get();
    results = snap.docs;
  } else {
    // No server-side filters — get recent jobs
    const snap = await db.collection("jobs").orderBy("updated_at", "desc").limit(100).get();
    results = snap.docs;
  }

  // Client-side filters
  let filtered = results;

  if (customer_name) {
    filtered = filtered.filter((doc) => partialMatch(doc.data().customer_name, customer_name));
  }
  if (address) {
    filtered = filtered.filter((doc) => {
      const d = doc.data();
      const full = [d.property_address, d.property_city, d.property_state, d.property_zip]
        .filter(Boolean)
        .join(" ");
      return partialMatch(full, address);
    });
  }
  if (status && assignee) {
    // assignee branch didn't filter by status
    filtered = filtered.filter((doc) => doc.data().status === status);
  }
  if (start_date && (assignee || (!start_date && !end_date))) {
    filtered = filtered.filter((doc) => (doc.data().date_received || "") >= start_date);
  }
  if (end_date && (assignee || (!start_date && !end_date))) {
    filtered = filtered.filter((doc) => (doc.data().date_received || "") <= end_date);
  }

  return filtered.map(formatJob);
}

async function toolGetSchedule(db, { job_id, start_date, end_date }) {
  const today = new Date().toISOString().slice(0, 10);
  const effectiveStart = start_date || today;
  const effectiveEnd = end_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  if (job_id) {
    // Query single job's schedule subcollection
    const snap = await db
      .collection("jobs")
      .doc(job_id)
      .collection("schedule")
      .where("scheduled_date", ">=", effectiveStart)
      .where("scheduled_date", "<=", effectiveEnd)
      .orderBy("scheduled_date", "asc")
      .get();

    // Get parent job context
    const jobDoc = await db.collection("jobs").doc(job_id).get();
    const jobData = jobDoc.exists ? jobDoc.data() : {};

    return snap.docs.map((d) =>
      formatSchedule(d, { id: job_id, customer_name: jobData.customer_name, property_address: jobData.property_address })
    );
  }

  // Collection group query across all jobs
  const snap = await db
    .collectionGroup("schedule")
    .where("scheduled_date", ">=", effectiveStart)
    .where("scheduled_date", "<=", effectiveEnd)
    .orderBy("scheduled_date", "asc")
    .get();

  // Enrich with parent job context
  const jobCache = {};
  const entries = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const parentJobId = data.job_id || doc.ref.parent.parent?.id;

    if (parentJobId && !jobCache[parentJobId]) {
      const jobDoc = await db.collection("jobs").doc(parentJobId).get();
      jobCache[parentJobId] = jobDoc.exists ? jobDoc.data() : {};
    }

    const jobData = jobCache[parentJobId] || {};
    entries.push(
      formatSchedule(doc, {
        id: parentJobId,
        customer_name: jobData.customer_name,
        property_address: jobData.property_address,
      })
    );
  }

  return entries;
}

async function toolGetJobNotes(db, { job_id, type }) {
  const jobRef = db.collection("jobs").doc(job_id);
  const jobDoc = await jobRef.get();
  if (!jobDoc.exists) {
    throw new Error(`Job ${job_id} not found`);
  }

  let query = jobRef.collection("notes").orderBy("created_at", "desc");
  if (type) {
    query = query.where("type", "==", type);
  }

  const snap = await query.get();
  return snap.docs.map(formatNote);
}

// ---------------------------------------------------------------------------
// Register tools on an MCP server
// ---------------------------------------------------------------------------

export function registerTools(server, db) {
  server.tool(
    "list_jobs",
    "List Xcelerate jobs, newest-updated first. Optionally filter by status.",
    {
      limit: z.number().optional().describe("Max results to return (default 25, max 100)."),
      status: z.string().optional().describe("Filter by job status (e.g., 'Scheduled', 'In Progress', 'Completed')."),
    },
    async (args) => {
      try {
        const result = await toolListJobs(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_job",
    "Get full Xcelerate job detail by ID, including all notes and schedule entries.",
    {
      job_id: z.string().describe("The Xcelerate job ID."),
    },
    async (args) => {
      try {
        const result = await toolGetJob(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "search_jobs",
    "Search Xcelerate jobs by customer name, address, status, assignee, or date range.",
    {
      customer_name: z.string().optional().describe("Filter by customer name (partial match, case-insensitive)."),
      address: z.string().optional().describe("Filter by property address (partial match, case-insensitive)."),
      status: z.string().optional().describe("Filter by job status."),
      assignee: z.string().optional().describe("Filter by project manager or crew member name (exact match)."),
      start_date: z.string().optional().describe("Jobs received on or after this date (YYYY-MM-DD)."),
      end_date: z.string().optional().describe("Jobs received on or before this date (YYYY-MM-DD)."),
    },
    async (args) => {
      try {
        const result = await toolSearchJobs(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_schedule",
    "Get schedule entries across all jobs or for a specific job. Defaults to today + 14 days.",
    {
      job_id: z.string().optional().describe("Filter to a specific job's schedule. If omitted, returns schedule across all jobs."),
      start_date: z.string().optional().describe("Start of date range (YYYY-MM-DD). Defaults to today."),
      end_date: z.string().optional().describe("End of date range (YYYY-MM-DD). Defaults to 14 days from today."),
    },
    async (args) => {
      try {
        const result = await toolGetSchedule(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_job_notes",
    "Get notes for a specific Xcelerate job. Optionally filter by note type.",
    {
      job_id: z.string().describe("The Xcelerate job ID."),
      type: z
        .enum(["internal", "customer", "adjuster", "scope"])
        .optional()
        .describe("Filter by note type."),
    },
    async (args) => {
      try {
        const result = await toolGetJobNotes(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );
}
