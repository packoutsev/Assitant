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
    encircle_claim_id: d.encircle_claim_id || null,
    qbo_customer_name: d.qbo_customer_name || null,
    gdrive_doc_id: d.gdrive_doc_id || null,
    gdrive_folder_id: d.gdrive_folder_id || null,
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

  query = query.limit((limit || 25) + 10); // over-fetch to account for filtered docs
  const snap = await query.get();
  return snap.docs
    .map(formatJob)
    .filter((j) => j.status !== "_DELETED_TEST_" && j.customer_name !== "_TEST_DELETE_")
    .slice(0, limit || 25);
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

async function toolLinkJob(db, { job_id, encircle_claim_id, qbo_customer_name, gdrive_doc_id, gdrive_folder_id }) {
  const jobRef = db.collection("jobs").doc(job_id);
  const jobDoc = await jobRef.get();
  if (!jobDoc.exists) throw new Error(`Job ${job_id} not found`);

  const update = { updated_at: Firestore.Timestamp.now() };
  if (encircle_claim_id !== undefined) update.encircle_claim_id = String(encircle_claim_id);
  if (qbo_customer_name !== undefined) update.qbo_customer_name = qbo_customer_name;
  if (gdrive_doc_id !== undefined) update.gdrive_doc_id = gdrive_doc_id;
  if (gdrive_folder_id !== undefined) update.gdrive_folder_id = gdrive_folder_id;

  await jobRef.set(update, { merge: true });
  return { linked: true, job_id, ...update, updated_at: undefined };
}

// ---------------------------------------------------------------------------
// Fire Leads
// ---------------------------------------------------------------------------

function formatFireLead(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    incident_number: d.incident_number || null,
    incident_type: d.incident_type || null,
    address: d.address || null,
    city: d.city || null,
    state: d.state || "AZ",
    zip: d.zip || null,
    county: d.county || null,
    date: d.date || null,
    time: d.time || null,
    fire_department: d.fire_department || null,
    notes: d.notes || null,
    owner_name: d.owner_name || null,
    owner_phone: d.owner_phone || null,
    owner_address: d.owner_address || null,
    occupancy: d.occupancy || null,
    renter_name: d.renter_name || null,
    renter_phone: d.renter_phone || null,
    commercial_name: d.commercial_name || null,
    commercial_phone: d.commercial_phone || null,
    property_details: d.property_details || null,
    property_value: d.property_value || null,
    services: d.services || [],
    status: d.status || "new",
    assigned_to: d.assigned_to || null,
    assigned_team: d.assigned_team || null,
    source_email_id: d.source_email_id || null,
    received_at: d.received_at?.toDate?.().toISOString() || d.received_at || null,
    updated_at: d.updated_at?.toDate?.().toISOString() || d.updated_at || null,
    contacted_at: d.contacted_at?.toDate?.().toISOString() || d.contacted_at || null,
    call_notes: (d.call_notes || []).map(n => ({
      text: n.text,
      author: n.author || null,
      created_at: n.created_at?.toDate?.().toISOString() || n.created_at || null,
    })),
  };
}

async function toolListFireLeads(db, { limit, status, assigned_to, assigned_team }) {
  let query = db.collection("fireleads").orderBy("received_at", "desc");
  if (status) query = query.where("status", "==", status);
  if (assigned_to) query = query.where("assigned_to", "==", assigned_to);
  if (assigned_team) query = query.where("assigned_team", "==", assigned_team);
  query = query.limit(limit || 50);
  const snap = await query.get();
  return snap.docs.map(formatFireLead);
}

async function toolGetFireLead(db, { lead_id }) {
  const doc = await db.collection("fireleads").doc(lead_id).get();
  if (!doc.exists) throw new Error(`Fire lead ${lead_id} not found`);
  return formatFireLead(doc);
}

async function toolUpdateFireLeadStatus(db, { lead_id, status, notes, assigned_to, assigned_team, add_note }) {
  const ref = db.collection("fireleads").doc(lead_id);
  const doc = await ref.get();
  if (!doc.exists) throw new Error(`Fire lead ${lead_id} not found`);

  const update = { updated_at: Firestore.Timestamp.now() };
  if (status !== undefined) {
    update.status = status;
    // Track first contact timestamp
    if (status === "contacted" && !doc.data().contacted_at) {
      update.contacted_at = Firestore.Timestamp.now();
    }
  }
  if (notes !== undefined) update.notes = notes;
  if (assigned_to !== undefined) update.assigned_to = assigned_to;
  if (assigned_team !== undefined) update.assigned_team = assigned_team;

  // Append a timestamped note to call_notes array
  if (add_note && add_note.text) {
    update.call_notes = Firestore.FieldValue.arrayUnion({
      text: add_note.text,
      author: add_note.author || null,
      created_at: new Date().toISOString(),
    });
  }

  await ref.set(update, { merge: true });
  return { updated: true, lead_id };
}

async function toolIngestFireLead(db, lead) {
  const { incident_number, source_email_id, ...rest } = lead;
  if (!incident_number) throw new Error("incident_number is required");

  // Upsert by incident_number (idempotent)
  const existing = await db.collection("fireleads")
    .where("incident_number", "==", incident_number)
    .limit(1)
    .get();

  const data = {
    incident_number,
    source_email_id: source_email_id || null,
    ...rest,
    updated_at: Firestore.Timestamp.now(),
  };

  if (existing.empty) {
    // New lead
    data.status = "new";
    data.received_at = Firestore.Timestamp.now();
    const ref = await db.collection("fireleads").add(data);
    return { ingested: true, lead_id: ref.id, incident_number, new: true };
  } else {
    // Existing — update fields but don't overwrite status/assigned_to
    const docRef = existing.docs[0].ref;
    const { status, assigned_to, received_at, ...safeUpdate } = data;
    await docRef.set(safeUpdate, { merge: true });
    return { ingested: true, lead_id: docRef.id, incident_number, new: false };
  }
}

// ---------------------------------------------------------------------------
// Wiki
// ---------------------------------------------------------------------------

async function toolGetWikiPage(db, { page_id }) {
  const id = page_id || "main";
  const doc = await db.collection("wiki").doc(id).get();
  if (!doc.exists) return null;
  const d = doc.data();
  return {
    id: doc.id,
    content: d.content || "",
    updated_at: d.updated_at?.toDate?.().toISOString() || d.updated_at || null,
    updated_by: d.updated_by || null,
    version: d.version || 1,
  };
}

async function toolUpdateWikiPage(db, { page_id, content, updated_by }) {
  const id = page_id || "main";
  const ref = db.collection("wiki").doc(id);
  const existing = await ref.get();

  const currentVersion = existing.exists ? (existing.data().version || 1) : 0;
  const newVersion = currentVersion + 1;

  // Save current content as a version before overwriting
  if (existing.exists && existing.data().content) {
    const d = existing.data();
    await ref.collection("versions").doc(String(currentVersion)).set({
      content: d.content,
      updated_at: d.updated_at || null,
      updated_by: d.updated_by || null,
      version: currentVersion,
      archived_at: Firestore.Timestamp.now(),
    });
  }

  // Write new content
  await ref.set({
    content,
    updated_at: Firestore.Timestamp.now(),
    updated_by: updated_by || "system",
    version: newVersion,
  });

  return { updated: true, page_id: id, version: newVersion };
}

async function toolListWikiVersions(db, { page_id, limit }) {
  const id = page_id || "main";
  const snap = await db
    .collection("wiki")
    .doc(id)
    .collection("versions")
    .orderBy("version", "desc")
    .limit(limit || 20)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      version: d.version,
      updated_at: d.updated_at?.toDate?.().toISOString() || d.updated_at || null,
      updated_by: d.updated_by || null,
      archived_at: d.archived_at?.toDate?.().toISOString() || null,
      content_length: (d.content || "").length,
    };
  });
}

async function toolGetWikiVersion(db, { page_id, version }) {
  const id = page_id || "main";
  const doc = await db
    .collection("wiki")
    .doc(id)
    .collection("versions")
    .doc(String(version))
    .get();
  if (!doc.exists) throw new Error(`Version ${version} not found for wiki page "${id}"`);
  const d = doc.data();
  return {
    version: d.version,
    content: d.content || "",
    updated_at: d.updated_at?.toDate?.().toISOString() || d.updated_at || null,
    updated_by: d.updated_by || null,
  };
}

// ---------------------------------------------------------------------------
// Build Journal
// ---------------------------------------------------------------------------

function formatJournalEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    date: d.date || null,
    title: d.title || "",
    body: d.body || "",
    tags: d.tags || [],
    created_by: d.created_by || null,
    created_at: d.created_at?.toDate?.().toISOString() || d.created_at || null,
    updated_at: d.updated_at?.toDate?.().toISOString() || d.updated_at || null,
  };
}

async function toolCreateJournalEntry(db, { date, title, body, tags, created_by }) {
  const ref = db.collection("journal_entries").doc();
  await ref.set({
    date,
    title,
    body,
    tags: tags || [],
    created_by: created_by || "claude",
    created_at: Firestore.Timestamp.now(),
    updated_at: Firestore.Timestamp.now(),
  });
  return { created: true, id: ref.id, date, title };
}

async function toolListJournal(db, { limit, tag }) {
  let query = db.collection("journal_entries").orderBy("date", "desc");
  if (tag) query = query.where("tags", "array-contains", tag);
  query = query.limit(limit || 50);
  const snap = await query.get();
  return snap.docs.map(formatJournalEntry);
}

async function toolGetJournalEntry(db, { entry_id }) {
  const doc = await db.collection("journal_entries").doc(entry_id).get();
  if (!doc.exists) throw new Error(`Journal entry "${entry_id}" not found`);
  return formatJournalEntry(doc);
}

async function toolUpdateJournalEntry(db, { entry_id, title, body, tags }) {
  const ref = db.collection("journal_entries").doc(entry_id);
  const doc = await ref.get();
  if (!doc.exists) throw new Error(`Journal entry "${entry_id}" not found`);
  const update = { updated_at: Firestore.Timestamp.now() };
  if (title !== undefined) update.title = title;
  if (body !== undefined) update.body = body;
  if (tags !== undefined) update.tags = tags;
  await ref.update(update);
  return { updated: true, id: entry_id };
}

// ---------------------------------------------------------------------------
// Google Drive — list files in a folder
// ---------------------------------------------------------------------------

let driveAccessToken = null;
let driveTokenExpiry = 0;

async function getDriveAccessToken() {
  if (driveAccessToken && Date.now() < driveTokenExpiry - 60000) return driveAccessToken;

  const clientId = process.env.GDRIVE_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Drive credentials not configured (GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN)");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Drive token refresh failed: " + JSON.stringify(data));

  driveAccessToken = data.access_token;
  driveTokenExpiry = Date.now() + (data.expires_in * 1000);
  return driveAccessToken;
}

async function toolListDriveFiles({ folder_id }) {
  const token = await getDriveAccessToken();
  const allFiles = [];

  // Recursively list folder contents
  async function listFolder(folderId, pathPrefix = "") {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: "100",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,createdTime)",
      orderBy: "name",
    });

    let pageToken = null;
    do {
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch("https://www.googleapis.com/drive/v3/files?" + params, {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      for (const f of data.files || []) {
        const isFolder = f.mimeType === "application/vnd.google-apps.folder";
        const displayName = pathPrefix ? `${pathPrefix}/${f.name}` : f.name;

        allFiles.push({
          id: f.id,
          name: displayName,
          mime_type: f.mimeType,
          size: f.size ? parseInt(f.size) : null,
          modified: f.modifiedTime || null,
          created: f.createdTime || null,
          url: f.webViewLink || null,
          is_folder: isFolder,
        });

        // Recurse into subfolders (max 3 levels deep to avoid runaway)
        if (isFolder && pathPrefix.split("/").length < 3) {
          await listFolder(f.id, displayName);
        }
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);
  }

  await listFolder(folder_id);
  return allFiles;
}

// ---------------------------------------------------------------------------
// Google Analytics — GA4 Data API
// ---------------------------------------------------------------------------

let gaAccessToken = null;
let gaTokenExpiry = 0;

async function getAnalyticsAccessToken() {
  if (gaAccessToken && Date.now() < gaTokenExpiry - 60000) return gaAccessToken;

  const clientId = process.env.GDRIVE_CLIENT_ID;
  const clientSecret = process.env.GA4_CLIENT_SECRET || process.env.GDRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GA4_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GA4 credentials not configured (GDRIVE_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN)");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("GA4 token refresh failed: " + JSON.stringify(data));

  gaAccessToken = data.access_token;
  gaTokenExpiry = Date.now() + (data.expires_in * 1000);
  return gaAccessToken;
}

async function ga4RunReport(propertyId, body) {
  const token = await getAnalyticsAccessToken();
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 runReport failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function toolGetWebsiteAnalytics({ property_id }) {
  // 3 parallel GA4 Data API calls
  const [summaryRes, topPagesRes, trendRes] = await Promise.all([
    // Call 1: Summary KPIs (7d + 28d)
    ga4RunReport(property_id, {
      dateRanges: [
        { startDate: "7daysAgo", endDate: "yesterday", name: "last7" },
        { startDate: "28daysAgo", endDate: "yesterday", name: "last28" },
      ],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
      ],
    }),
    // Call 2: Top pages (28d)
    ga4RunReport(property_id, {
      dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 5,
    }),
    // Call 3: Daily trend (7d)
    ga4RunReport(property_id, {
      dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
  ]);

  // Parse summary — rows[0] = totals, dateRangeValues[0] = 7d, [1] = 28d
  const summaryRow = summaryRes.rows?.[0];
  const parse7d = (idx) => parseInt(summaryRow?.metricValues?.[idx]?.value || "0", 10);
  // For multi-date-range, GA4 returns separate row sets; totals row has metricValues in order
  // With no dimensions, each date range produces one row
  const rows = summaryRes.rows || [];
  const r7d = rows[0]?.metricValues || [];
  const r28d = rows[1]?.metricValues || rows[0]?.metricValues || [];

  const last_7_days = {
    users: parseInt(r7d[0]?.value || "0", 10),
    sessions: parseInt(r7d[1]?.value || "0", 10),
    pageviews: parseInt(r7d[2]?.value || "0", 10),
  };
  const last_28_days = {
    users: parseInt(r28d[0]?.value || "0", 10),
    sessions: parseInt(r28d[1]?.value || "0", 10),
    pageviews: parseInt(r28d[2]?.value || "0", 10),
  };

  // Parse top pages
  const top_pages = (topPagesRes.rows || []).map((row) => ({
    path: row.dimensionValues?.[0]?.value || "/",
    views: parseInt(row.metricValues?.[0]?.value || "0", 10),
  }));

  // Parse daily trend
  const daily_trend = (trendRes.rows || []).map((row) => {
    const dateStr = row.dimensionValues?.[0]?.value || "";
    // Format YYYYMMDD → YYYY-MM-DD
    const formatted = dateStr.length === 8
      ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      : dateStr;
    return {
      date: formatted,
      users: parseInt(row.metricValues?.[0]?.value || "0", 10),
      sessions: parseInt(row.metricValues?.[1]?.value || "0", 10),
      pageviews: parseInt(row.metricValues?.[2]?.value || "0", 10),
    };
  });

  return { property_id, last_7_days, last_28_days, top_pages, daily_trend };
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

  server.tool(
    "link_job",
    "Link a job to external system IDs (Encircle claim ID, QBO customer name, Google Drive doc/folder ID). Persists to Firestore for fast future lookups.",
    {
      job_id: z.string().describe("The Xcelerate job ID."),
      encircle_claim_id: z.string().optional().describe("The Encircle property claim ID to link."),
      qbo_customer_name: z.string().optional().describe("The QBO customer name used to find invoices."),
      gdrive_doc_id: z.string().optional().describe("The Google Drive document ID for the job's Notes & Documentation doc."),
      gdrive_folder_id: z.string().optional().describe("The Google Drive folder ID for the job's project folder."),
    },
    async (args) => {
      try {
        const result = await toolLinkJob(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "list_drive_files",
    "List files in a Google Drive folder. Returns file names, types, sizes, and view URLs.",
    {
      folder_id: z.string().describe("The Google Drive folder ID to list files from."),
    },
    async (args) => {
      try {
        const result = await toolListDriveFiles(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // --- Website Analytics (GA4) ---

  server.tool(
    "get_website_analytics",
    "Get Google Analytics 4 data for a website — users, sessions, pageviews (7d + 28d), top pages, and daily trend.",
    {
      property_id: z.string().describe("GA4 property ID (e.g., '480498498')."),
    },
    async (args) => {
      try {
        const result = await toolGetWebsiteAnalytics(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // --- Wiki ---

  server.tool(
    "get_wiki_page",
    "Get a wiki page by ID. Returns the current content, version number, and last-updated metadata. Defaults to the 'main' page.",
    {
      page_id: z.string().optional().describe("Wiki page ID (default: 'main')."),
    },
    async (args) => {
      try {
        const result = await toolGetWikiPage(db, args);
        if (!result) return { content: [{ type: "text", text: "null" }] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "update_wiki_page",
    "Update a wiki page. Automatically archives the previous version before writing. Each save increments the version number.",
    {
      page_id: z.string().optional().describe("Wiki page ID (default: 'main')."),
      content: z.string().describe("Full markdown content for the wiki page."),
      updated_by: z.string().optional().describe("Who is making the update (default: 'system')."),
    },
    async (args) => {
      try {
        const result = await toolUpdateWikiPage(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "list_wiki_versions",
    "List version history for a wiki page. Shows version number, timestamp, author, and content length (not full content).",
    {
      page_id: z.string().optional().describe("Wiki page ID (default: 'main')."),
      limit: z.number().optional().describe("Max versions to return (default 20)."),
    },
    async (args) => {
      try {
        const result = await toolListWikiVersions(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_wiki_version",
    "Get a specific historical version of a wiki page (full content). Useful for rollback or comparison.",
    {
      page_id: z.string().optional().describe("Wiki page ID (default: 'main')."),
      version: z.number().describe("Version number to retrieve."),
    },
    async (args) => {
      try {
        const result = await toolGetWikiVersion(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // --- Build Journal ---

  server.tool(
    "create_journal_entry",
    "Create a new Build Journal entry. Used to log what was built/shipped on a given day.",
    {
      date: z.string().describe("Date this entry covers (YYYY-MM-DD)."),
      title: z.string().describe("Short headline, e.g. 'Estimator backtest pipeline'."),
      body: z.string().describe("Markdown body with details of what was built."),
      tags: z.array(z.string()).optional().describe("Project tags: 'estimator', 'packouts-hub', 'mcp-servers', etc."),
      created_by: z.string().optional().describe("Who created this entry (default: 'claude')."),
    },
    async (args) => {
      try {
        const result = await toolCreateJournalEntry(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "list_journal",
    "List Build Journal entries, newest first. Optionally filter by tag.",
    {
      limit: z.number().optional().describe("Max entries to return (default 50)."),
      tag: z.string().optional().describe("Filter by a single tag (uses Firestore array-contains)."),
    },
    async (args) => {
      try {
        const result = await toolListJournal(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_journal_entry",
    "Get a single Build Journal entry by ID.",
    {
      entry_id: z.string().describe("The Firestore document ID of the journal entry."),
    },
    async (args) => {
      try {
        const result = await toolGetJournalEntry(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "update_journal_entry",
    "Update an existing Build Journal entry. Only provided fields are changed.",
    {
      entry_id: z.string().describe("The Firestore document ID of the journal entry."),
      title: z.string().optional().describe("New title."),
      body: z.string().optional().describe("New markdown body."),
      tags: z.array(z.string()).optional().describe("New tags array (replaces existing)."),
    },
    async (args) => {
      try {
        const result = await toolUpdateJournalEntry(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // --- Fire Leads ---

  server.tool(
    "list_fireleads",
    "List fire leads from fireleads.com, newest first. Filter by status or assigned SDR.",
    {
      limit: z.number().optional().describe("Max results (default 50)."),
      status: z.enum(["new", "contacted", "pursuing", "not_interested", "converted", "no_answer"]).optional().describe("Filter by lead status."),
      assigned_to: z.string().optional().describe("Filter by assigned SDR name."),
      assigned_team: z.string().optional().describe("Filter by assigned team ID (e.g., 'team-1')."),
    },
    async (args) => {
      try {
        const result = await toolListFireLeads(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_firelead",
    "Get a single fire lead by ID.",
    {
      lead_id: z.string().describe("The Firestore document ID of the fire lead."),
    },
    async (args) => {
      try {
        const result = await toolGetFireLead(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "update_firelead_status",
    "Update a fire lead's status, notes, assignment, or add a timestamped call note.",
    {
      lead_id: z.string().describe("The Firestore document ID of the fire lead."),
      status: z.enum(["new", "contacted", "pursuing", "not_interested", "converted", "no_answer"]).optional().describe("New status."),
      notes: z.string().optional().describe("Update the incident notes field."),
      assigned_to: z.string().optional().describe("Assign to an SDR (e.g., 'Vanessa', 'Diana', 'Matt')."),
      assigned_team: z.string().optional().describe("Assign to a team (e.g., 'team-1', 'team-2', 'team-3')."),
      add_note: z.object({
        text: z.string().describe("The note text."),
        author: z.string().optional().describe("Who wrote the note (e.g., 'Matt', 'Vanessa')."),
      }).optional().describe("Append a timestamped note to the call_notes array."),
    },
    async (args) => {
      try {
        const result = await toolUpdateFireLeadStatus(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ingest_firelead",
    "Ingest a parsed fire lead into Firestore. Upserts by incident_number (safe to re-run). Used by the fire-leads-processor pipeline.",
    {
      incident_number: z.string().describe("Fireleads.com incident number (e.g., '02.16.2026.006')."),
      incident_type: z.string().optional().describe("Type of incident (e.g., 'STRUCTURE FIRE')."),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      county: z.string().optional(),
      date: z.string().optional().describe("Incident date (YYYY-MM-DD)."),
      time: z.string().optional().describe("Incident time."),
      fire_department: z.string().optional(),
      notes: z.string().optional(),
      owner_name: z.string().optional(),
      owner_phone: z.string().optional(),
      owner_address: z.string().optional(),
      occupancy: z.string().optional(),
      renter_name: z.string().optional(),
      renter_phone: z.string().optional(),
      commercial_name: z.string().optional(),
      commercial_phone: z.string().optional(),
      property_details: z.string().optional(),
      property_value: z.string().optional(),
      services: z.array(z.string()).optional(),
      source_email_id: z.string().optional().describe("Gmail message ID for traceability."),
    },
    async (args) => {
      try {
        const result = await toolIngestFireLead(db, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );
}
