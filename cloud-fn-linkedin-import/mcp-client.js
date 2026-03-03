/**
 * Lightweight MCP Streamable HTTP client.
 *
 * Handles the JSON-RPC initialize → tools/call flow against our Cloud Run
 * MCP servers (QBO, GChat). No SDK needed — just fetch.
 *
 * The MCP SDK's StreamableHTTPServerTransport may respond with either
 * application/json or text/event-stream (SSE). This client handles both.
 */

let _idCounter = 0;
const nextId = () => ++_idCounter;

/**
 * Parse a response that may be JSON or SSE.
 * SSE format: lines like "event: message\ndata: {...json...}\n\n"
 * We extract the JSON-RPC response from the last `data:` line.
 */
async function parseResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (contentType.includes("text/event-stream")) {
    // Parse SSE — find data: lines containing our JSON-RPC response
    const dataLines = raw
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6));

    // The last data line should be our JSON-RPC response
    for (let i = dataLines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(dataLines[i]);
      } catch {
        continue;
      }
    }
    throw new Error(`No valid JSON in SSE response: ${raw.slice(0, 200)}`);
  }

  return JSON.parse(raw);
}

/**
 * Open an MCP session and call a tool in two round-trips.
 *
 * @param {string} baseUrl  e.g. "https://mcp-qbo-326811155221.us-central1.run.app"
 * @param {string} toolName e.g. "get_ar_aging"
 * @param {object} args     tool arguments (may be empty {})
 * @returns {object} parsed JSON from the tool's text content
 */
export async function callTool(baseUrl, toolName, args = {}) {
  const endpoint = `${baseUrl}/mcp`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  // 1. Initialize — get session ID
  const initRes = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ar-review", version: "1.0.0" },
      },
    }),
  });

  if (!initRes.ok) {
    throw new Error(`MCP init failed: ${initRes.status} ${await initRes.text()}`);
  }

  const sessionId = initRes.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("No Mcp-Session-Id in init response");

  // 2. Call the tool
  const callRes = await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, "Mcp-Session-Id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!callRes.ok) {
    throw new Error(`MCP tools/call failed: ${callRes.status} ${await callRes.text()}`);
  }

  const body = await parseResponse(callRes);

  if (body.error) {
    throw new Error(`MCP error: ${JSON.stringify(body.error)}`);
  }

  const text = body.result?.content?.[0]?.text;
  if (!text) throw new Error("Empty tool response");

  if (body.result?.isError) {
    throw new Error(`Tool error: ${text}`);
  }

  return JSON.parse(text);
}
