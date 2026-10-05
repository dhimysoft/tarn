/**
 * services/safetyRouter.js — decides whether a message must leave the ordinary
 * reflection flow and go straight to crisis resources.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS
 *   A deterministic phrase matcher. Given text, it returns a CATEGORY.
 *
 * WHAT THIS IS NOT
 *   It is not a risk assessment, a classifier, or a prediction about a person.
 *   It produces no score and no judgement, and its output is never stored as an
 *   attribute of a user or shown to them as a conclusion about themselves.
 *
 * WHY IT IS DELIBERATELY BLUNT
 *   A model could catch more phrasings. It could also be wrong in ways nobody
 *   can inspect, and it would put the most safety-critical decision in the app
 *   behind a network call that can time out. This runs first, offline, in
 *   microseconds, and its behaviour can be read off the page and tested
 *   exhaustively. When it matches, no generative response is produced at all.
 *
 * HONEST LIMITATION
 *   This WILL miss things. Distress is often expressed obliquely, in metaphor,
 *   in another language, or not at all. Passing these tests does not mean every
 *   unsafe situation is detected, and the product must never claim it does. The
 *   crisis resources are reachable from every screen precisely because this
 *   cannot be relied upon as the only route to help.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CATEGORY = Object.freeze({
  NONE: "none",
  SUICIDE_SELF_HARM: "suicide_self_harm",
  IMMEDIATE_DANGER: "immediate_danger",
  HARM_TO_OTHERS: "harm_to_others",
});

/**
 * Normalise before matching, so trivial obfuscation does not slip past:
 * case, accents, repeated letters, punctuation between words, and the common
 * leetspeak substitutions.
 */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")     // strip accents
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/(.)\1{2,}/g, "$1")           // "kiiiill" -> "kill", "myselffff" -> "myself"
    .replace(/[^a-z0-9\s']/g, " ")        // punctuation to space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phrases that indicate the person may be at risk themselves.
 * Written as regexes over the NORMALISED text.
 */
const SUICIDE_SELF_HARM = [
  // Verb inflections matter: "ending my life" and "thinking about killing
  // myself" are the same disclosure as the bare infinitive, and an earlier
  // version of these patterns missed both.
  /\bkill(ing|ed)? myself\b/,
  /\b(want|wish|need)(s|ing)? (someone )?to kill me\b/,
  /\b(want|going|plan|planning|ready|about|thinking) to die\b/,
  /\bwant to be dead\b/,
  /\bend(ing|ed)? (my life|it all|things)\b/,
  /\btak(e|ing) my (own )?life\b/,
  /\bsuicid(e|al)\b/,
  /\bkms\b/,                                  // common shorthand
  /\bhurt(ing)? myself\b/,
  /\bharm(ing)? myself\b/,
  /\bself harm\b/,
  /\bcut(ting)? myself\b/,
  /\boverdose\b/,
  /\bno reason to (live|go on|be here)\b/,
  /\bbetter off (dead|without me)\b/,
  /\bdon'?t want to (live|be here|wake up)\b/,
  /\bcan'?t go on\b/,
  /\bwant it to (end|stop) forever\b/,
];

/** Phrases indicating danger right now. */
const IMMEDIATE_DANGER = [
  /\bin danger\b/,
  /\bgoing to hurt me\b/,
  /\bthreatening (me|to kill)\b/,
  /\bbeing (attacked|abused|assaulted)\b/,
  /\bnot safe (right now|at home|here)\b/,
];

/** Phrases indicating intent to harm someone else. */
const HARM_TO_OTHERS = [
  /\bkill (him|her|them|someone|everyone|people)\b/,
  /\bhurt (him|her|them|someone|everyone)\b/,
  /\bwant (him|her|them|someone) (dead|to die)\b/,
  /\bshoot (up|someone|everyone|them)\b/,
];

/**
 * Phrases that CONTAIN crisis words but are not a disclosure of risk.
 *
 * Without these, "my exam is killing me" or "I'm reading about suicide
 * prevention" would interrupt the conversation. A false positive is not
 * harmless: it interrupts someone mid-thought, and if it happens often people
 * learn to route around the feature.
 */
const NOT_A_DISCLOSURE = [
  /\b(killing|kills|killed) me\b(?!.*\bmyself\b)/,   // "this deadline is killing me"
  /\bdying (of|to) (laughter|laugh|know|see|try)\b/,
  /\bdead (tired|serious|line|lines)\b/,
  /\bsuicide (prevention|hotline|lifeline|awareness|research|statistics)\b/,
  /\bkill (time|the mood|it)\b/,                     // "kill time", "killed it"
  /\bmy (phone|battery|laptop) (is )?(dying|died|dead)\b/,
  /\bdie (my|your|his|her|their) hair\b/,
];

/**
 * Decide what to do with a message.
 *
 * @param {string} text
 * @returns {{category:string, requiresCrisisInterruption:boolean, matched:string[]}}
 *   `matched` names the PATTERNS that fired, never the user's words — the
 *   safety log records that routing happened without copying sensitive text.
 */
function routeMessage(text) {
  const normalized = normalize(text);

  if (!normalized) {
    return { category: CATEGORY.NONE, requiresCrisisInterruption: false, matched: [] };
  }

  // Remove known figures of speech and non-disclosure contexts BEFORE matching.
  //
  // Doing it this way rather than trying to un-match afterwards is what lets
  // both of these behave correctly in the same sentence:
  //   "I was reading about suicide prevention"        -> the phrase is removed, no match
  //   "this deadline is killing me, I want to die"    -> the idiom is removed,
  //                                                      "want to die" still matches
  let searchable = normalized;
  for (const pattern of NOT_A_DISCLOSURE) {
    searchable = searchable.replace(new RegExp(pattern.source, "g"), " ");
  }

  // Word boundaries fail on "KILLMYSELF" and on letters spaced apart, so the
  // most severe phrases are also checked against a copy with all whitespace
  // removed and the \b anchors dropped.
  const compact = searchable.replace(/\s+/g, "");

  const check = (patterns, category) => {
    const hits = patterns.filter((p) => {
      if (p.test(searchable)) return true;
      const unanchored = p.source.replace(/\\b/g, "").replace(/ /g, "");
      try {
        return new RegExp(unanchored).test(compact);
      } catch {
        return false;
      }
    });
    return hits.length ? { category, matched: hits.map((p) => p.source) } : null;
  };

  // Order matters: risk to the person comes first.
  const result =
    check(SUICIDE_SELF_HARM, CATEGORY.SUICIDE_SELF_HARM) ||
    check(IMMEDIATE_DANGER, CATEGORY.IMMEDIATE_DANGER) ||
    check(HARM_TO_OTHERS, CATEGORY.HARM_TO_OTHERS);

  if (!result) {
    return { category: CATEGORY.NONE, requiresCrisisInterruption: false, matched: [] };
  }

  return { ...result, requiresCrisisInterruption: true };
}

/**
 * The response shown instead of a generated one. Prewritten and fixed — no
 * model is called, so there is nothing to go wrong in the moment it matters.
 *
 * Note what it does NOT say: it does not tell the person they are safe, does
 * not assess their risk, and does not imply anyone is watching.
 */
/** Object.freeze only freezes the top level. Without this the nested US object
 *  stays mutable and `crisisResponseFor("US").message = "..."` both succeeds
 *  and persists for every later caller. */
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

const CRISIS_RESPONSE = deepFreeze({
  US: {
    message:
      "I'm sorry you're going through this. TARN is not a crisis service, " +
      "and this conversation is not monitored. Please call or text 988 to connect " +
      "with a trained crisis counselor. If you or someone else is in immediate " +
      "danger, call 911 or go to the nearest emergency department.",
    actions: [
      { label: "Call 988", href: "tel:988" },
      { label: "Text 988", href: "sms:988" },
      { label: "Visit 988lifeline.org", href: "https://988lifeline.org" },
      { label: "Call 911", href: "tel:911" },
    ],
    countryCode: "US",
  },
  // Shown where no verified local resource exists. Saying so is better than
  // giving someone a number that will not connect.
  UNKNOWN_REGION: {
    message:
      "TARN is not a crisis service, and this conversation is not monitored. " +
      "We do not yet have verified crisis resources for your region. " +
      "findahelpline.com lists verified crisis lines by country.",
    actions: [{ label: "Find a helpline", href: "https://findahelpline.com" }],
    countryCode: null,
  },
});

function crisisResponseFor(countryCode = "US") {
  const template = countryCode === "US" ? CRISIS_RESPONSE.US : CRISIS_RESPONSE.UNKNOWN_REGION;

  // Return a frozen COPY. Even if a caller tries to edit what it receives, the
  // stored template is untouched for everyone else.
  return deepFreeze({
    ...template,
    actions: template.actions.map((a) => ({ ...a })),
    // Present on every crisis response, so the UI can never render one of these
    // without the Get Immediate Help route being available.
    crisisSupportHref: "/crisis.html",
    isStatic: true,
  });
}

/**
 * The user has told us they are not in immediate danger.
 *
 * This exists because the alternative is worse: without it, someone who
 * mentioned a hard thing once is stuck behind a crisis screen with no way to
 * say "I hear you, I'm okay, I'd like to carry on". That teaches people to
 * avoid saying the honest thing next time.
 *
 * What it does NOT do:
 *   - It does not assess or clear the person. The app cannot know they are safe
 *     and must never say so.
 *   - It does not remove access to crisis resources. `crisisSupportHref` stays
 *     on the response and the Get Immediate Help control stays in the nav.
 *   - It does not suppress future routing. The next message is matched from
 *     scratch, so a later disclosure interrupts again.
 */
function acknowledgeNotInDanger(countryCode = "US") {
  return deepFreeze({
    message:
      "Thank you for telling me. You can keep using the reflection tools whenever " +
      "you would like. The crisis resources stay available at any time. Nothing " +
      "here is monitored, so please reach out to a person if things change.",
    // Deliberately still present.
    crisisSupportHref: "/crisis.html",
    actions: crisisResponseFor(countryCode).actions,
    acknowledgedNotInDanger: true,
    // Explicitly NOT a determination about the person.
    isRiskAssessment: false,
    suppressesFutureRouting: false,
  });
}

module.exports = {
  routeMessage,
  crisisResponseFor,
  acknowledgeNotInDanger,
  normalize,
  CATEGORY,
  CRISIS_RESPONSE,
};
