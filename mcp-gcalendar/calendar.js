/**
 * Google Calendar API v3 helpers — direct REST calls with fetch.
 *
 * Shared by both index.js (local stdio) and server.js (Cloud Run).
 * Callers must provide getAccessToken() and refreshTokens() via init().
 */

const API_BASE = "https://www.googleapis.com/calendar/v3";

let _getAccessToken = null;
let _refreshTokens = null;
let _log = (...args) => console.error("[mcp-gcalendar]", ...args);

/**
 * Initialize the module with auth helpers from the caller.
 */
export function init({ getAccessToken, refreshTokens, log }) {
  _getAccessToken = getAccessToken;
  _refreshTokens = refreshTokens;
  if (log) _log = log;
}

// ---------------------------------------------------------------------------
// Low-level HTTP helper
// ---------------------------------------------------------------------------

async function calGet(path, params = {}, _retried = false) {
  const { accessToken, creds, tokens } = await _getAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (resp.status === 401 && !_retried) {
    _log("Got 401, refreshing token and retrying...");
    await _refreshTokens(creds, tokens);
    return calGet(path, params, true);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Calendar API error ${resp.status}: ${body}`);
  }

  return resp.json();
}

// ---------------------------------------------------------------------------
// Google Calendar color map (event colorId → hex)
// ---------------------------------------------------------------------------

const EVENT_COLORS = {
  "1": "#7986CB",  // Lavender
  "2": "#33B679",  // Sage
  "3": "#8E24AA",  // Grape
  "4": "#E67C73",  // Flamingo
  "5": "#F6BF26",  // Banana
  "6": "#F4511E",  // Tangerine
  "7": "#039BE5",  // Peacock
  "8": "#616161",  // Graphite
  "9": "#3F51B5",  // Blueberry
  "10": "#0B8043", // Basil
  "11": "#D50000", // Tomato
};

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/**
 * List all calendars the user has access to.
 */
export async function toolListCalendars() {
  const data = await calGet("/users/me/calendarList", {
    maxResults: 250,
  });

  return (data.items || []).map((cal) => ({
    id: cal.id,
    name: cal.summary || cal.id,
    description: cal.description || null,
    color: cal.backgroundColor || null,
    foreground_color: cal.foregroundColor || null,
    primary: cal.primary || false,
    access_role: cal.accessRole,
    selected: cal.selected || false,
  }));
}

/**
 * List events from one or more calendars within a date range.
 */
export async function toolListEvents({ calendar_ids, start_date, end_date }) {
  const timeMin = new Date(`${start_date}T00:00:00`).toISOString();
  const timeMax = new Date(`${end_date}T23:59:59`).toISOString();

  const allEvents = [];

  for (const calId of calendar_ids) {
    try {
      let pageToken = null;
      do {
        const params = {
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await calGet(
          `/calendars/${encodeURIComponent(calId)}/events`,
          params
        );

        for (const evt of data.items || []) {
          allEvents.push({
            id: evt.id,
            calendar_id: calId,
            title: evt.summary || "(No title)",
            start: evt.start?.dateTime || evt.start?.date || null,
            end: evt.end?.dateTime || evt.end?.date || null,
            all_day: !evt.start?.dateTime,
            location: evt.location || null,
            description: evt.description || null,
            status: evt.status,
            color: evt.colorId ? EVENT_COLORS[evt.colorId] || null : null,
            html_link: evt.htmlLink || null,
          });
        }

        pageToken = data.nextPageToken || null;
      } while (pageToken);
    } catch (err) {
      _log(`Error fetching events from ${calId}: ${err.message}`);
    }
  }

  // Sort all events by start time
  allEvents.sort((a, b) => {
    const aTime = new Date(a.start || 0).getTime();
    const bTime = new Date(b.start || 0).getTime();
    return aTime - bTime;
  });

  return allEvents;
}

/**
 * Get a single event by calendar ID + event ID.
 */
export async function toolGetEvent({ calendar_id, event_id }) {
  const evt = await calGet(
    `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`
  );

  return {
    id: evt.id,
    calendar_id,
    title: evt.summary || "(No title)",
    start: evt.start?.dateTime || evt.start?.date || null,
    end: evt.end?.dateTime || evt.end?.date || null,
    all_day: !evt.start?.dateTime,
    location: evt.location || null,
    description: evt.description || null,
    status: evt.status,
    color: evt.colorId ? EVENT_COLORS[evt.colorId] || null : null,
    html_link: evt.htmlLink || null,
    creator: evt.creator?.email || null,
    organizer: evt.organizer?.email || null,
    attendees: (evt.attendees || []).map((a) => ({
      email: a.email,
      name: a.displayName || null,
      response: a.responseStatus,
    })),
    recurrence: evt.recurrence || null,
    conference: evt.conferenceData
      ? {
          type: evt.conferenceData.conferenceSolution?.name || null,
          uri: evt.conferenceData.entryPoints?.[0]?.uri || null,
        }
      : null,
  };
}
