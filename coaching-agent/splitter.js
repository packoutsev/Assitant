/**
 * Splits a coaching review into chunks safe for Google Chat (max 4096 chars).
 *
 * Strategy:
 * 1. Split at ━━━ section header lines (e.g., "━━━ SCORECARD ━━━")
 * 2. The header line before the first ━━━ stays with the first section
 * 3. If a section exceeds 4000 chars, split at paragraph boundaries (\n\n)
 */

const MAX_CHARS = 4000; // Leave 96 char buffer under Google Chat's 4096 limit

export function splitIntoSections(text) {
  if (!text) return [];

  // Split at ━━━ header lines — each header starts a new section
  // The regex captures the ━━━ line so we can keep it with its section
  const parts = text.split(/\n(?=━━━)/);
  let rawSections = parts.map((s) => s.trim()).filter(Boolean);

  // Merge the header block (before first ━━━) with the first ━━━ section (SCORECARD)
  if (rawSections.length >= 2 && !rawSections[0].startsWith("━━━")) {
    rawSections[1] = rawSections[0] + "\n\n" + rawSections[1];
    rawSections = rawSections.slice(1);
  }

  // Ensure each section is under the char limit
  const chunks = [];
  for (const section of rawSections) {
    if (section.length <= MAX_CHARS) {
      chunks.push(section);
    } else {
      chunks.push(...splitAtParagraphs(section));
    }
  }

  return chunks.filter((c) => c.trim().length > 0);
}

function splitAtParagraphs(text) {
  const paragraphs = text.split("\n\n");
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? current + "\n\n" + para : para;
    if (candidate.length <= MAX_CHARS) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      if (para.length > MAX_CHARS) {
        // Hard split long paragraphs at line breaks
        const lines = para.split("\n");
        let lineChunk = "";
        for (const line of lines) {
          const next = lineChunk ? lineChunk + "\n" + line : line;
          if (next.length <= MAX_CHARS) {
            lineChunk = next;
          } else {
            if (lineChunk) chunks.push(lineChunk);
            lineChunk = line.length > MAX_CHARS ? line.slice(0, MAX_CHARS) : line;
          }
        }
        if (lineChunk) chunks.push(lineChunk);
        current = "";
      } else {
        current = para;
      }
    }
  }
  if (current) chunks.push(current);

  return chunks;
}
