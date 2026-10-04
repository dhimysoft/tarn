/**
 * Adversarial tests for the crisis safety router.
 *
 * ⚠️ READ THIS BEFORE TRUSTING THE RESULTS
 *
 * Passing every test here does NOT mean every unsafe situation will be
 * detected. It means these specific phrasings behave as intended. Distress is
 * often expressed obliquely, in metaphor, in another language, or not at all,
 * and a phrase matcher cannot see any of that.
 *
 * The product must never claim it detects crises or monitors conversations.
 * Crisis resources are reachable from every screen precisely because this
 * cannot be the only route to help.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { routeMessage, crisisResponseFor, CATEGORY } = require("../services/safetyRouter");

// ── must interrupt ───────────────────────────────────────────────────────────

const MUST_ROUTE = [
  // direct
  "I want to kill myself",
  "i want to die",
  "I'm going to end my life",
  "thinking about ending my life",
  "I've been thinking about killing myself",
  "I want to take my own life",
  "I am suicidal",
  "having suicidal thoughts",
  // indirect but clear
  "I don't want to be here anymore",
  "there's no reason to live",
  "everyone would be better off without me",
  "I can't go on",
  "I don't want to wake up",
  "I want to be dead",
  // self-harm
  "I've been hurting myself",
  "I want to harm myself",
  "I have been cutting myself",
  "thinking about an overdose",
  // obfuscated
  "kms",
  "K1LL MYS3LF",
  "kiiiill myselffff",
  "K I L L   M Y S E L F".replace(/ /g, ""),
  // buried in a longer message
  "I had a rough week at work and honestly I want to die",
  "this deadline is killing me and I want to die",
];

for (const message of MUST_ROUTE) {
  test(`routes to crisis: ${JSON.stringify(message).slice(0, 52)}`, () => {
    const result = routeMessage(message);
    assert.equal(
      result.requiresCrisisInterruption,
      true,
      `"${message}" must interrupt the ordinary flow`,
    );
    assert.equal(result.category, CATEGORY.SUICIDE_SELF_HARM);
  });
}

// ── must NOT interrupt ───────────────────────────────────────────────────────
//
// A false positive is not harmless. It interrupts someone mid-thought, and if
// it happens often people stop using the feature — or stop being honest in it.

const MUST_NOT_ROUTE = [
  "I feel overwhelmed because I have an interview tomorrow",
  "this deadline is killing me",
  "my back is killing me",
  "I'm dying to know how it went",
  "I'm dead tired today",
  "my phone battery is dying",
  "I killed it in the presentation",
  "just trying to kill time before class",
  "I was reading about suicide prevention for a class",
  "I volunteer for a suicide hotline",
  "we studied suicide statistics in sociology",
  "I ended my shift early",
  "I want to die my hair blue",
  "I'm stressed about my exam",
  "I feel anxious and tired",
  "work has been really hard lately",
  "",
];

for (const message of MUST_NOT_ROUTE) {
  test(`does NOT route: ${JSON.stringify(message).slice(0, 52)}`, () => {
    const result = routeMessage(message);
    assert.equal(
      result.requiresCrisisInterruption,
      false,
      `"${message}" must not interrupt — it is not a disclosure`,
    );
  });
}

// ── other categories ─────────────────────────────────────────────────────────

test("danger to the person routes as immediate danger", () => {
  for (const m of ["someone is threatening to kill me", "I am not safe at home", "I'm being abused"]) {
    const r = routeMessage(m);
    assert.equal(r.requiresCrisisInterruption, true, m);
    assert.equal(r.category, CATEGORY.IMMEDIATE_DANGER, m);
  }
});

test("intent to harm someone else routes as harm to others", () => {
  for (const m of ["I want to hurt him", "I'm going to kill them"]) {
    const r = routeMessage(m);
    assert.equal(r.requiresCrisisInterruption, true, m);
    assert.equal(r.category, CATEGORY.HARM_TO_OTHERS, m);
  }
});

test("risk to the person takes priority over other categories", () => {
  const r = routeMessage("I want to kill myself and I want to hurt him too");
  assert.equal(r.category, CATEGORY.SUICIDE_SELF_HARM);
});

// ── the routing record ───────────────────────────────────────────────────────

test("the router reports which PATTERNS matched, never the user's words", () => {
  const message = "I want to kill myself because of what happened at work on Tuesday";
  const result = routeMessage(message);

  const record = JSON.stringify(result);
  assert.equal(record.includes("Tuesday"), false, "the user's text must not appear in the routing record");
  assert.equal(record.includes("work"), false);
  assert.ok(result.matched.length, "the matched patterns are recorded so routing is auditable");
});

// ── the crisis response itself ───────────────────────────────────────────────

test("the US crisis response gives working actions and claims nothing", () => {
  const response = crisisResponseFor("US");

  assert.match(response.message, /not a crisis service/i);
  assert.match(response.message, /not monitored/i);
  assert.match(response.message, /988/);
  assert.match(response.message, /911/);

  const hrefs = response.actions.map((a) => a.href);
  assert.ok(hrefs.includes("tel:988"));
  assert.ok(hrefs.includes("sms:988"));
  assert.ok(hrefs.includes("tel:911"));

  // It must never reassure or assess.
  assert.doesNotMatch(response.message, /you are safe/i);
  assert.doesNotMatch(response.message, /we have determined/i);
  assert.doesNotMatch(response.message, /your risk/i);
});

test("outside the US it says so instead of showing numbers that will not connect", () => {
  const response = crisisResponseFor("HT");

  assert.doesNotMatch(response.message, /988/, "US numbers must not be shown as worldwide");
  assert.match(response.message, /do not yet have verified crisis resources/i);
  assert.equal(response.countryCode, null);
});

test("the crisis response is a fixed string, not generated", () => {
  // Called twice, byte-identical: there is no model in this path, so there is
  // nothing to go wrong at the moment it matters most.
  assert.deepEqual(crisisResponseFor("US"), crisisResponseFor("US"));
});
