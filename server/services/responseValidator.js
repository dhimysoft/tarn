/**
 * services/responseValidator.js — the last gate before anything reaches a user.
 *
 * Every generated response passes through here on the server. If it fails, it
 * is DISCARDED and a fixed, safe fallback is sent instead — the invalid text is
 * never repaired, never partially shown, and never logged verbatim.
 *
 * Two independent checks, because they fail differently:
 *
 *   1. SHAPE   — is this the object we asked for? A model can return prose, or
 *                JSON missing a field, or an array where an object belongs.
 *   2. CONTENT — even a well-formed response can say something prohibited. This
 *                is where "I'm your therapist" or "this will cure your anxiety"
 *                is caught.
 *
 * A model prompt is guidance, not a guarantee. This is the guarantee.
 */

const { CATEGORY } = require("./safetyRouter");

/** The only shape a companion response may take. */
const RESPONSE_FIELDS = Object.freeze({
  acknowledgment: "string",
  reflection: "string",
  followUpQuestion: "string",
  suggestedActions: "array",
  activityId: "string|null",
  safetyCategory: "string",
  requiresCrisisInterruption: "boolean",
  saveableSummary: "string|null",
  disclaimerRequired: "boolean",
});

const MAX_LENGTHS = Object.freeze({
  acknowledgment: 300,
  reflection: 800,
  followUpQuestion: 300,
  saveableSummary: 600,
});

/**
 * Phrases a wellness product must never produce.
 *
 * Each entry says WHY, so a future reader can judge whether a new phrasing
 * belongs here rather than guessing at the intent.
 */
const PROHIBITED = [
  { re: /\b(i am|i'm|as) (your|a) (therapist|psychologist|psychiatrist|counselor|counsellor|doctor|clinician)\b/i,
    why: "Claims a clinical role it does not have." },
  { re: /\byou (have|are suffering from|are experiencing) (anxiety disorder|depression|ptsd|bipolar|ocd)\b/i,
    why: "Diagnoses a condition." },
  { re: /\b(you|this) (are|is) (clinically|medically) \w+/i,
    why: "Frames output as a clinical finding." },
  // Inflections matter here as much as in the safety router: an earlier
  // version matched "reduce your antidepressants" but not "reducing" them.
  { re: /\b(stop|stopping|start|starting|chang(e|ing)|adjust(ing)?|reduc(e|ing)|increas(e|ing)|lower(ing)?|skip(ping)?) (taking |your )?(your )?(medication|meds|antidepressants|prescription|pills)\b/i,
    why: "Advises on medication." },
  { re: /\bthis (will|can) (cure|treat|fix|heal)\b/i,
    why: "Promises a therapeutic outcome." },
  { re: /\b(will|going to) (make you feel better|reduce your anxiety|stop your panic)\b/i,
    why: "Promises a result it cannot deliver." },
  { re: /\byou (are|will be) safe\b/i,
    why: "Asserts safety, which the app cannot know." },
  { re: /\byou (are|might be|may be) (heading toward|at risk of) (burnout|a breakdown|crisis)\b/i,
    why: "Predicts a health outcome." },
  { re: /\bi'?m the only one who (understands|gets) you\b/i,
    why: "Encourages emotional dependency." },
  { re: /\b(don'?t|do not) (tell|talk to|contact) (anyone|your|the) (doctor|therapist|family|friends|police)\b/i,
    why: "Discourages contact with support or emergency services." },
  { re: /\byou don'?t need (therapy|a therapist|professional help|medication)\b/i,
    why: "Discourages professional care." },
  { re: /\bdiagnos(e|is|ed|ing)\b/i,
    why: "Diagnostic language. Use descriptive wording instead." },
  { re: /\b(studies|research) (show|prove)s? that (this app|tarn)\b/i,
    why: "Fabricated evidence about this product." },
];

/** Recognised action types the model may suggest. Anything else is rejected. */
const ALLOWED_ACTION_TYPES = new Set([
  "breathing", "grounding", "thought_record", "journal", "coping_strategy", "crisis_support", "none",
]);

function typeMatches(value, spec) {
  return spec.split("|").some((t) => {
    if (t === "null") return value === null;
    if (t === "array") return Array.isArray(value);
    if (t === "string") return typeof value === "string";
    if (t === "boolean") return typeof value === "boolean";
    return false;
  });
}

/**
 * @returns {{valid:boolean, reason:string|null, violations:string[]}}
 */
function validateResponse(response, { allowedActivityIds = new Set() } = {}) {
  const violations = [];

  // ---- 1. shape ----
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return { valid: false, reason: "Response was not an object.", violations };
  }

  for (const [field, spec] of Object.entries(RESPONSE_FIELDS)) {
    if (!(field in response)) {
      return { valid: false, reason: `Missing field: ${field}`, violations };
    }
    if (!typeMatches(response[field], spec)) {
      return { valid: false, reason: `Field ${field} has the wrong type.`, violations };
    }
  }

  for (const [field, max] of Object.entries(MAX_LENGTHS)) {
    const value = response[field];
    if (typeof value === "string" && value.length > max) {
      return { valid: false, reason: `Field ${field} exceeds ${max} characters.`, violations };
    }
  }

  if (!Object.values(CATEGORY).includes(response.safetyCategory)) {
    return { valid: false, reason: `Unknown safetyCategory: ${response.safetyCategory}`, violations };
  }

  // ---- 2. suggested actions ----
  for (const action of response.suggestedActions) {
    if (!action || typeof action !== "object") {
      return { valid: false, reason: "A suggested action was not an object.", violations };
    }
    if (typeof action.label !== "string" || !action.label.trim()) {
      return { valid: false, reason: "A suggested action had no label.", violations };
    }
    if (!ALLOWED_ACTION_TYPES.has(action.type)) {
      return { valid: false, reason: `Unknown action type: ${action.type}`, violations };
    }
  }

  // The model may only point at activities that already exist in the reviewed
  // library. This is what stops it inventing a coping exercise.
  if (response.activityId && allowedActivityIds.size && !allowedActivityIds.has(response.activityId)) {
    return { valid: false, reason: `Unknown activityId: ${response.activityId}`, violations };
  }

  // ---- 3. content ----
  const prose = [
    response.acknowledgment,
    response.reflection,
    response.followUpQuestion,
    response.saveableSummary || "",
    ...response.suggestedActions.map((a) => a.label),
  ].join("\n");

  for (const { re, why } of PROHIBITED) {
    if (re.test(prose)) violations.push(why);
  }

  if (violations.length) {
    return { valid: false, reason: "Prohibited content.", violations };
  }

  return { valid: true, reason: null, violations: [] };
}

/**
 * What is sent when validation fails, or when the model is unreachable.
 *
 * Deliberately useful rather than an error: the person still gets an
 * acknowledgement and a real choice of activity, and the app stays usable with
 * no model at all.
 */
function safeFallbackResponse() {
  return {
    acknowledgment: "Thank you for writing that down.",
    reflection:
      "I'm not able to offer a reflection on this one. That is a limitation of " +
      "this feature, not a judgement about what you wrote.",
    followUpQuestion: "Would you like to try one of these instead?",
    suggestedActions: [
      { label: "Try a paced-breathing exercise", type: "breathing" },
      { label: "Write a private journal entry", type: "journal" },
      { label: "Start a CBT-informed thought record", type: "thought_record" },
    ],
    activityId: null,
    safetyCategory: CATEGORY.NONE,
    requiresCrisisInterruption: false,
    saveableSummary: null,
    disclaimerRequired: true,
    isFallback: true,
  };
}

module.exports = { validateResponse, safeFallbackResponse, PROHIBITED, RESPONSE_FIELDS, ALLOWED_ACTION_TYPES };
