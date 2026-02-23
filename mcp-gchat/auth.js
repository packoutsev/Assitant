#!/usr/bin/env node

/**
 * One-time OAuth consent flow for Google Chat API.
 *
 * Usage:
 *   1. Create OAuth 2.0 Desktop credentials in Google Cloud Console
 *   2. Enable Google Chat API in your GCP project
 *   3. Save credentials to ~/.gchat_credentials.json:
 *      { "client_id": "xxx.apps.googleusercontent.com", "client_secret": "xxx" }
 *   4. Run: node auth.js
 *   5. Browser opens → consent → tokens saved to ~/.gchat_tokens.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createServer } from "node:http";
import { URL } from "node:url";

const HOME = homedir();
const CREDENTIALS_PATH = join(HOME, ".gchat_credentials.json");
const TOKENS_PATH = join(HOME, ".gchat_tokens.json");

const SCOPES = [
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.memberships",
];

const REDIRECT_URI = "http://localhost:3000/oauth2callback";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Load credentials
let creds;
try {
  creds = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
} catch {
  console.error(`Cannot read credentials from ${CREDENTIALS_PATH}`);
  console.error('Create the file with: { "client_id": "...", "client_secret": "..." }');
  process.exit(1);
}

// Build consent URL
const consentUrl = new URL(AUTH_URL);
consentUrl.searchParams.set("client_id", creds.client_id);
consentUrl.searchParams.set("redirect_uri", REDIRECT_URI);
consentUrl.searchParams.set("response_type", "code");
consentUrl.searchParams.set("scope", SCOPES.join(" "));
consentUrl.searchParams.set("access_type", "offline");
consentUrl.searchParams.set("prompt", "consent");

console.log("\nOpen this URL in your browser:\n");
console.log(consentUrl.toString());
console.log("\nWaiting for OAuth callback on http://localhost:3000 ...\n");

// Start server to handle callback
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3000");

  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400);
    res.end(`OAuth error: ${error}`);
    console.error(`OAuth error: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end("No authorization code received");
    server.close();
    process.exit(1);
  }

  // Exchange code for tokens
  try {
    const tokenResp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const body = await tokenResp.text();
      throw new Error(`Token exchange failed (${tokenResp.status}): ${body}`);
    }

    const tokens = await tokenResp.json();
    tokens.saved_at = Date.now() / 1000;

    writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log(`Tokens saved to ${TOKENS_PATH}`);
    console.log(`  access_token: ${tokens.access_token?.slice(0, 20)}...`);
    console.log(`  refresh_token: ${tokens.refresh_token ? "present" : "MISSING"}`);
    console.log(`  expires_in: ${tokens.expires_in}s`);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Authorization successful!</h1><p>You can close this tab.</p>");
  } catch (err) {
    console.error("Token exchange failed:", err.message);
    res.writeHead(500);
    res.end(`Token exchange failed: ${err.message}`);
  }

  server.close();
});

server.listen(3000);

// Try to open browser automatically
try {
  const { exec } = await import("node:child_process");
  const cmd =
    process.platform === "win32"
      ? `start "" "${consentUrl.toString()}"`
      : process.platform === "darwin"
        ? `open "${consentUrl.toString()}"`
        : `xdg-open "${consentUrl.toString()}"`;
  exec(cmd);
} catch {
  // User can open manually
}
