/**
 * Formats the daily sales summary as a Google Chat message.
 */

export function formatSummary(dateStr, classified) {
  const { bdCalls, coordCalls } = classified;

  const total = bdCalls.length + coordCalls.length;
  const hitMinimum = bdCalls.length >= 10;

  const lines = [];
  lines.push(`\u{1F4CA} *Daily Sales Report — Anonno* (${formatDate(dateStr)})`);
  lines.push("");
  lines.push(
    `*BD Calls: ${bdCalls.length}* | *Coordination: ${coordCalls.length}* | *Total: ${total}*`
  );
  lines.push(hitMinimum ? "\u2705 Hit 10-call BD minimum" : `\u274C Missed 10-call BD minimum (${bdCalls.length}/10)`);
  lines.push("");

  // BD Calls
  lines.push("\u2501\u2501\u2501 Business Development \u2501\u2501\u2501");
  if (bdCalls.length === 0) {
    lines.push("  No BD calls logged today.");
  } else {
    for (const call of bdCalls) {
      lines.push(formatCallLine(call));
    }
  }
  lines.push("");

  // Coordination
  lines.push("\u2501\u2501\u2501 Job Coordination \u2501\u2501\u2501");
  if (coordCalls.length === 0) {
    lines.push("  No coordination calls logged today.");
  } else {
    for (const call of coordCalls) {
      const dealTag = call.dealName ? ` [${call.dealName}]` : "";
      lines.push(`${formatCallLine(call)}${dealTag}`);
    }
  }

  return lines.join("\n");
}

function formatCallLine(call) {
  const time = formatTime(call.timestamp);
  const title = call.title || "Unknown";
  const dur = formatDuration(call.duration);
  const dir = call.direction === "INBOUND" || call.direction === "incoming"
    ? "inbound"
    : "outbound";
  return `\u2022 ${time} — ${title} (${dur}) — ${dir}`;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function formatTime(timestamp) {
  if (!timestamp) return "??:??";
  const ts = typeof timestamp === "string" ? parseInt(timestamp, 10) : timestamp;
  let date;
  if (typeof timestamp === "string" && timestamp.includes("T")) {
    date = new Date(timestamp);
  } else {
    date = new Date(ts);
  }
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(seconds) {
  if (!seconds || seconds === "0") return "0s";
  const s = parseInt(seconds, 10);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem.toString().padStart(2, "0")}s` : `${m}m`;
}
