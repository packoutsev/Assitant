import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 32000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

const systemPrompt = readFileSync(join(__dirname, "system-prompt.md"), "utf-8");
const context = readFileSync(join(__dirname, "today-context.txt"), "utf-8");

console.log(`Sending ${context.length} chars to ${MODEL}...`);
const start = Date.now();

const resp = await fetch(API_URL, {
  method: "POST",
  headers: {
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: context }],
  }),
});

if (!resp.ok) {
  const body = await resp.text();
  console.error(`API failed (${resp.status}): ${body}`);
  process.exit(1);
}

const data = await resp.json();
const text = data.content?.[0]?.text || "";
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const usage = data.usage || {};

console.log(`Generated ${text.length} chars in ${elapsed}s (input: ${usage.input_tokens}, output: ${usage.output_tokens} tokens)`);

writeFileSync(join(__dirname, "today-sonnet-output.txt"), text, "utf-8");
console.log("Saved to today-sonnet-output.txt");
