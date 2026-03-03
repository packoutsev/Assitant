/**
 * Anthropic API client for coaching review generation.
 *
 * Sends structured activity data + system prompt to Claude,
 * returns the coaching review text.
 *
 * Env: ANTHROPIC_API_KEY
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-20250514";
const MAX_TOKENS = 32000;

const log = (...args) => console.log("[anthropic]", ...args);

function getKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY env var");
  return key;
}

/**
 * Generate a coaching review from structured context data.
 *
 * @param {string} systemPrompt  The full coaching agent system prompt
 * @param {string} contextData   Structured activity data (calls, notes, texts, deals)
 * @returns {string} The coaching review text
 */
export async function generateCoaching(systemPrompt, contextData) {
  log(`Sending ${contextData.length} chars of context to ${MODEL}...`);
  const start = Date.now();

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": getKey(),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: contextData,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Anthropic API failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || "";
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const usage = data.usage || {};

  log(`Generated ${text.length} chars in ${elapsed}s (input: ${usage.input_tokens}, output: ${usage.output_tokens} tokens)`);
  return text;
}
