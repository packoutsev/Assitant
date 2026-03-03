/**
 * Recommended action logic per aging bucket.
 *
 * @param {string} bucket         "Current", "1-30", "31-60", "61-90", "90+"
 * @param {number} balance        invoice balance
 * @param {number|null} daysSinceContact  days since last Gmail contact (null = unknown)
 * @returns {string} recommended action text
 */
export function getAction(bucket, balance, daysSinceContact) {
  const highPriority = balance >= 10000;
  let action;

  switch (bucket) {
    case "Current":
      action = "No action needed";
      break;

    case "1-30":
      if (daysSinceContact === null || daysSinceContact > 7) {
        action = "Send payment reminder";
      } else {
        action = "Recently contacted — monitor";
      }
      break;

    case "31-60":
      action = "Phone follow-up + adjuster escalation";
      break;

    case "61-90":
      action = "Formal demand letter + carrier escalation";
      break;

    case "90+":
      if (balance < 500) {
        action = "Collections review — consider write-off";
      } else {
        action = "Collections review — attorney letter";
      }
      break;

    default:
      action = "Review manually";
  }

  return highPriority ? `HIGH PRIORITY: ${action}` : action;
}
