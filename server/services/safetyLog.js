/**
 * services/safetyLog.js — records THAT safety routing happened, never WHAT was said.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE
 *   A safety event may contain: which category fired, which PATTERNS matched,
 *   a timestamp, and a hashed user reference.
 *
 *   It may never contain: the user's message, any excerpt of it, journal text,
 *   conversation transcript, or anything derived from the content beyond its
 *   length.
 *
 * WHY LOG AT ALL
 *   Without any record there is no way to know whether the router is firing far
 *   too often, or never — which is exactly what you need to see to improve it.
 *   The counts are the useful part; the words are not.
 *
 * WHY THE USER REFERENCE IS HASHED
 *   So the log can answer "is one person hitting this repeatedly?" without the
 *   log itself becoming a list of who disclosed what. The hash is salted with
 *   SESSION_SECRET, so it cannot be reversed by anyone holding only the log.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require("node:crypto");

/** Fields that may appear in a safety event. Anything else is dropped. */
const ALLOWED_FIELDS = Object.freeze([
  "at", "category", "matchedPatterns", "userRef", "messageLength", "countryCode", "interrupted",
]);

function hashUserRef(userId) {
  if (!userId) return null;
  const salt = process.env.SESSION_SECRET || "";
  return crypto.createHash("sha256").update(`${salt}:${userId}`).digest("hex").slice(0, 16);
}

/**
 * Build a safety event.
 *
 * Note the signature: it takes the ROUTING RESULT, not the message. The message
 * is never passed in, so it cannot be logged by accident — the only thing
 * derived from it is its length, which the caller supplies.
 */
function buildSafetyEvent({ routing, userId = null, messageLength = 0, countryCode = "US" }) {
  const event = {
    at: new Date().toISOString(),
    category: routing.category,
    // Pattern SOURCES, not the text they matched.
    matchedPatterns: Array.isArray(routing.matched) ? [...routing.matched] : [],
    userRef: hashUserRef(userId),
    messageLength: Number.isFinite(messageLength) ? messageLength : 0,
    countryCode,
    interrupted: Boolean(routing.requiresCrisisInterruption),
  };

  // Belt and braces: drop anything not on the allow-list, so a future edit that
  // adds a field cannot quietly start logging content.
  for (const key of Object.keys(event)) {
    if (!ALLOWED_FIELDS.includes(key)) delete event[key];
  }

  return event;
}

/**
 * Write the event.
 *
 * Currently stderr, which in production is the container log. Deliberately not
 * sent anywhere else: the privacy rules forbid conversation content reaching
 * analytics, and the simplest way to guarantee that is to have no analytics
 * destination at all.
 */
function recordSafetyEvent(input) {
  const event = buildSafetyEvent(input);
  if (process.env.NODE_ENV !== "test") {
    console.warn("[safety-routing]", JSON.stringify(event));
  }
  return event;
}

module.exports = { recordSafetyEvent, buildSafetyEvent, hashUserRef, ALLOWED_FIELDS };
