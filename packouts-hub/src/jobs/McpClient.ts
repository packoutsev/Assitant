const MCP_URLS = {
  xcelerate: 'https://xceleratewebhook-326811155221.us-central1.run.app/mcp',
  encircle: 'https://mcp-encircle-326811155221.us-central1.run.app/mcp',
  qbo: 'https://mcp-qbo-326811155221.us-central1.run.app/mcp',
  gcalendar: 'https://mcp-gcalendar-326811155221.us-central1.run.app/mcp',
} as const;

export type McpServer = keyof typeof MCP_URLS;

const MCP_API_KEY = import.meta.env.VITE_MCP_API_KEY || '';

let nextId = 1;

class McpClient {
  private sessionId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private baseUrl: string;

  constructor(server: McpServer) {
    this.baseUrl = MCP_URLS[server];
  }

  private resetSession(): void {
    this.sessionId = null;
    this.initPromise = null;
  }

  private async rpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    if (MCP_API_KEY) headers['X-API-Key'] = MCP_API_KEY;

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    });

    // Capture session ID from first response
    const sid = res.headers.get('Mcp-Session-Id');
    if (sid) this.sessionId = sid;

    // Session expired (Cloud Run recycled) — reset and let caller retry
    if (res.status === 404) {
      this.resetSession();
      throw new SessionExpiredError();
    }

    if (!res.ok) throw new Error(`MCP ${method} failed: ${res.status}`);

    const contentType = res.headers.get('Content-Type') || '';

    // Server may respond with SSE instead of plain JSON
    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      // Parse SSE: find last "data:" line that contains a JSON-RPC response with our id
      const lines = text.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('data:')) {
          try {
            const json = JSON.parse(line.slice(5).trim());
            if (json.error) throw new Error(json.error.message || 'MCP error');
            if (json.result !== undefined) return json.result;
          } catch (e) {
            if (e instanceof SyntaxError) continue; // not valid JSON, try next
            throw e;
          }
        }
      }
      throw new Error(`No valid JSON-RPC response in SSE stream`);
    }

    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'MCP error');
    return json.result;
  }

  private async ensureInit(): Promise<void> {
    if (this.sessionId) return;
    this.initPromise = null; // Clear any failed/stale init promise
    this.initPromise = this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'packouts-hub', version: '1.0.0' },
    }).then(() => { /* initialized */ });
    return this.initPromise;
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    // Try once, and if session expired, re-init and retry
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.ensureInit();
      try {
        const result = await this.rpc('tools/call', { name, arguments: args }) as {
          content: { type: string; text: string }[];
          isError?: boolean;
        };
        const text = result.content?.[0]?.text;
        if (!text) throw new Error(`Empty response from ${name}`);
        if (result.isError) throw new Error(text);
        return JSON.parse(text) as T;
      } catch (e) {
        if (e instanceof SessionExpiredError && attempt === 0) continue; // retry
        throw e;
      }
    }
    throw new Error(`Failed to call ${name} after retry`);
  }
}

class SessionExpiredError extends Error {
  constructor() { super('Session expired'); }
}

// Singleton clients per server
const clients: Partial<Record<McpServer, McpClient>> = {};

export function getMcpClient(server: McpServer): McpClient {
  if (!clients[server]) clients[server] = new McpClient(server);
  return clients[server];
}
