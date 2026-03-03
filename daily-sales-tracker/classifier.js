/**
 * BD vs Coordination classifier.
 *
 * Classifies each HubSpot call as:
 *   - "BD" (Business Development) — contact NOT associated with an active deal
 *   - "COORD" (Job Coordination) — contact IS associated with an active deal
 */

const log = (...args) => console.log("[classifier]", ...args);

/**
 * @param {Array} hubspotCalls — calls with contactIds[]
 * @param {Set} activeDealContactIds — contact IDs from active deals
 * @param {Map} dealNames — contactId -> deal name
 */
export function classifyTouches(hubspotCalls, activeDealContactIds, dealNames) {
  const bdCalls = [];
  const coordCalls = [];

  for (const call of hubspotCalls) {
    const matchedContactId = call.contactIds.find((cid) =>
      activeDealContactIds.has(cid)
    );
    if (matchedContactId) {
      call.classification = "COORD";
      call.dealName = dealNames.get(matchedContactId) || null;
      coordCalls.push(call);
    } else {
      call.classification = "BD";
      bdCalls.push(call);
    }
  }

  log(`Classified: BD=${bdCalls.length} COORD=${coordCalls.length}`);
  return { bdCalls, coordCalls };
}
