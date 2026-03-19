#!/usr/bin/env node

/**
 * QBO OAuth2 re-auth flow.
 * Opens browser for authorization, captures the callback, saves tokens.
 *
 * Usage: node auth.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createServer } from "node:http";

const HOME = homedir();
const CREDS = JSON.parse(readFileSync(join(HOME, ".qbo_credentials.json"), "utf-8"));
const TOKENS_PATH = join(HOME, ".qbo_tokens.json");
const REDIRECT_URI = "http://localhost:8765/callback";
const PORT = 8765;

const AUTH_URL = `https://appcenter.intuit.com/connect/oauth2?client_id=${CREDS.client_id}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=qbo`;

console.log("\nOpening browser for QBO authorization...\n");
console.log("If the browser doesn't open, go to:");
console.log(AUTH_URL);
console.log("");

// Open browser
import("child_process").then(cp => {
  cp.exec(`start "${AUTH_URL}"`);
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (!url.pathname.startsWith("/callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");

  if (!code) {
    res.writeHead(400);
    res.end("No authorization code received");
    return;
  }

  console.log(`Got auth code. Realm: ${realmId || CREDS.realm_id}`);

  // Exchange code for tokens
  const basicAuth = Buffer.from(`${CREDS.client_id}:${CREDS.client_secret}`).toString("base64");
  const tokenResp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    console.error(`Token exchange failed: ${tokenResp.status} ${body}`);
    res.writeHead(500);
    res.end("Token exchange failed. Check console.");
    server.close();
    return;
  }

  const tokens = await tokenResp.json();
  tokens.saved_at = Date.now() / 1000;

  // Update realm_id if it changed
  if (realmId && realmId !== CREDS.realm_id) {
    CREDS.realm_id = realmId;
    writeFileSync(join(HOME, ".qbo_credentials.json"), JSON.stringify(CREDS, null, 2));
    console.log(`Updated realm_id to ${realmId}`);
  }

  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  console.log("Tokens saved to", TOKENS_PATH);
  console.log("Done! You can close this window.");

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h2>QBO authorized successfully!</h2><p>You can close this tab.</p>");

  server.close();
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT} for callback...`);
});
