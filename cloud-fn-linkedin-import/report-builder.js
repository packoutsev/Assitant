/**
 * Build Google Chat summary message for the import run.
 */

/**
 * @param {object[]} results  array of per-file result objects with stats
 * @returns {string} formatted Google Chat message
 */
export function buildSummary(results) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  const lines = [`*LinkedIn Sales Nav Import — ${today}*`];

  if (results.length === 0) {
    lines.push("", "No CSV files found to process.");
    return lines.join("\n");
  }

  for (const r of results) {
    lines.push("");

    if (r.status === "error") {
      lines.push(`*File:* ${r.fileName}`);
      lines.push(`  Failed: ${r.error}`);
      continue;
    }

    lines.push(`*File:* ${r.fileName}`);
    lines.push(`• ${r.stats.totalRows} contacts in CSV`);
    lines.push(`• ${r.stats.newContacts} new contacts created`);
    lines.push(`• ${r.stats.skippedContacts} already existed (skipped)`);
    lines.push(`• ${r.stats.newCompanies} new companies created`);
    lines.push(`• ${r.stats.matchedCompanies} existing companies matched`);

    if (r.stats.errors > 0) {
      lines.push(`• ${r.stats.errors} errors`);
    }

    lines.push(`*List:* ${r.listName} | *Owner:* Anonno Islam`);
  }

  return lines.join("\n");
}
