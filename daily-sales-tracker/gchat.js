/**
 * Google Chat posting module.
 *
 * Reuses the OAuth2 token management pattern from mcp-gchat/server.js:
 *   - Tokens persisted in Google Cloud Storage bucket
 *   - Automatic refresh when expired
 *   - Retry on 401
 *
 * Environment variables:
 *   GCHAT_CLIENT_ID      — Google OAuth client ID
 *   GCHAT_CLIENT_SECRET   — Google OAuth client secret
 *   GCS_BUCKET            — GCS bucket name for token storage
 *   GCHAT_SPACE_NAME      — Target space (e.g., "spaces/AAAAxyz123")
 */

import { Storage } from "@google-cloud/storage";

const GCS_BUCKET = process.env.GCS_BUCKET || "packouts-gchat-tokens";
const GCS_TOKEN_PATH = "tokens.json";
const API_BASE = "https://chat.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const log = (...args) => console.log("[gchat]", ...args);

// ── Credentials ──────────────────────────────────────────────────────────────

function getCredentials() {
  const client_id = process.env.GCHAT_CLIENT_ID;
  const client_secret = process.env.GCHAT_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error("Missing GCHAT_CLIENT_ID or GCHAT_CLIENT_SECRET");
  }
  return { client_id, client_secret };
}

// ── Token persistence via GCS ────────────────────────────────────────────────

const storage = new Storage();
let cachedTokens = null;

async function loadTokensFromGCS() {
  try {
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(GCS_TOKEN_PATH);
    const [contents] = await file.download();
    const tokens = JSON.parse(contents.toString("utf-8"));
    log("Loaded tokens from GCS");
    return tokens;
  } catch (err) {
    log("GCS token load failed:", err.message);
    return null;
  }
}

async function saveTokensToGCS(tokens) {
  try {
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(GCS_TOKEN_PATH);
    await file.save(JSON.stringify(tokens, null, 2), {
      contentType: "application/json",
    });
    log("Saved tokens to GCS");
  } catch (err) {
    log("GCS token save failed:", err.message);
  }
}

async function loadTokens() {
  if (cachedTokens) return cachedTokens;
  cachedTokens = await loadTokensFromGCS();
  if (cachedTokens) return cachedTokens;
  throw new Error("No Google Chat tokens available in GCS");
}

async function saveTokens(newTokens, oldTokens) {
  if (!newTokens.refresh_token && oldTokens.refresh_token) {
    newTokens.refresh_token = oldTokens.refresh_token;
  }
  newTokens.saved_at = Date.now() / 1000;
  cachedTokens = newTokens;
  await saveTokensToGCS(newTokens);
}

// ── OAuth2 refresh ───────────────────────────────────────────────────────────

async function refreshTokens(creds, tokens) {
  log("Refreshing access token...");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${body}`);
  }
  const newTokens = await resp.json();
  await saveTokens(newTokens, tokens);
  log("Token refreshed successfully.");
  return { ...tokens, ...newTokens, saved_at: Date.now() / 1000 };
}

async function getAccessToken() {
  const creds = getCredentials();
  let tokens = await loadTokens();
  const savedAt = tokens.saved_at || 0;
  const expiresIn = tokens.expires_in || 3600;
  const elapsed = Date.now() / 1000 - savedAt;
  if (elapsed >= expiresIn - 120) {
    tokens = await refreshTokens(creds, tokens);
  }
  return { accessToken: tokens.access_token, creds, tokens };
}

// ── Chat API posting ─────────────────────────────────────────────────────────

async function chatPost(path, body, _retried = false) {
  const { accessToken, creds, tokens } = await getAccessToken();
  const url = `${API_BASE}${path}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 && !_retried) {
    log("Got 401, refreshing token and retrying...");
    await refreshTokens(creds, tokens);
    return chatPost(path, body, true);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Chat API error ${resp.status}: ${text}`);
  }

  return resp.json();
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function postToChat(message) {
  const spaceName = process.env.GCHAT_SPACE_NAME;
  if (!spaceName) throw new Error("Missing GCHAT_SPACE_NAME env var");

  const result = await chatPost(`/${spaceName}/messages`, { text: message });
  log(`Posted message to ${spaceName}: ${result.name}`);
  return result;
}
