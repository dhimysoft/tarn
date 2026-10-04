/**
 * The ten safety guarantees, as permanent tests.
 *
 * These exist so a future change cannot quietly break a property that was
 * deliberately chosen. Each test names the guarantee it protects.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { routeMessage, crisisResponseFor, acknowledgeNotInDanger, CRISIS_RESPONSE } = require("../services/safetyRouter");
const { buildSafetyEvent, ALLOWED_FIELDS } = require("../services/safetyLog");

const SERVER_DIR = path.join(__dirname, "..");

// ── 1. crisis responses are static and unreachable by a model ────────────────

test("GUARANTEE 1: a crisis response cannot be modified", () => {
  const first = crisisResponseFor("US");

  // Attempt to mutate what the caller received.
  try { first.message = "HACKED"; } catch { /* frozen throws in strict mode */ }
  try { first.actions[0].href = "tel:000"; } catch { /* ignore */ }
  try { first.actions.push({ label: "x", href: "y" }); } catch { /* ignore */ }

  const second = crisisResponseFor("US");
  assert.doesNotMatch(second.message, /HACKED/, "the stored template must be untouched");
  assert.equal(second.actions[0].href, "tel:988");
  assert.equal(second.actions.length, 4);
});

test("GUARANTEE 1: the crisis path contains no model call", () => {
  const source = fs.readFileSync(path.join(SERVER_DIR, "services/safetyRouter.js"), "utf8");

  for (const forbidden of ["@google/genai", "openai", "anthropic", "fetch(", "axios"]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `safetyRouter must not reach a model or the network (found: ${forbidden})`,
    );
  }
});

test("GUARANTEE 1: the same input always returns byte-identical text", () => {
  assert.equal(crisisResponseFor("US").message, crisisResponseFor("US").message);
  assert.equal(CRISIS_RESPONSE.US.message, crisisResponseFor("US").message);
});

// ── 2 & 3. the user's message never reaches a safety log ─────────────────────

test("GUARANTEE 2+3: a safety event contains no part of the message", () => {
  const message =
    "I want to kill myself because of what happened at work on Tuesday with Sarah and my landlord";
  const routing = routeMessage(message);

  const event = buildSafetyEvent({ routing, userId: "user-abc-123", messageLength: message.length });
  const serialized = JSON.stringify(event);

  for (const fragment of ["Tuesday", "Sarah", "landlord", "work", "kill myself", "because"]) {
    assert.equal(serialized.includes(fragment), false, `the log leaked: "${fragment}"`);
  }

  // The raw user id must not be there either — only a salted hash.
  assert.equal(serialized.includes("user-abc-123"), false, "the raw user id must be hashed");
});

test("GUARANTEE 3: only allow-listed fields can appear in an event", () => {
  const routing = routeMessage("I want to die");

  const event = buildSafetyEvent({
    routing,
    userId: "u1",
    messageLength: 13,
    // Anything extra must be dropped, not passed through.
    transcript: "the whole conversation",
    journalEntry: "private text",
    message: "I want to die",
  });

  for (const key of Object.keys(event)) {
    assert.ok(ALLOWED_FIELDS.includes(key), `unexpected field in safety event: ${key}`);
  }
  assert.equal("transcript" in event, false);
  assert.equal("journalEntry" in event, false);
  assert.equal("message" in event, false);
});

test("GUARANTEE 3: the event records pattern sources, not matched text", () => {
  const routing = routeMessage("I have been thinking about ending my life");
  const event = buildSafetyEvent({ routing, userId: "u1", messageLength: 40 });

  assert.ok(event.matchedPatterns.length > 0, "the pattern that fired must be recorded");
  // A regex source, not a sentence.
  assert.match(event.matchedPatterns[0], /\\b/, "matchedPatterns should hold regex sources");
});

// ── 4. crisis actions stay reachable ─────────────────────────────────────────

test("GUARANTEE 4: every routed response carries the Get Immediate Help route", () => {
  for (const country of ["US", "HT", "FR", undefined]) {
    const response = crisisResponseFor(country);
    assert.ok(response.crisisSupportHref, `${country}: crisisSupportHref must be present`);
    assert.ok(response.actions.length > 0, `${country}: at least one action must be offered`);
  }
});

// ── 5. non-US users are not given US instructions ────────────────────────────

test("GUARANTEE 5: non-US responses do not present US numbers as universal", () => {
  for (const country of ["HT", "FR", "NG", "JP"]) {
    const response = crisisResponseFor(country);
    assert.doesNotMatch(response.message, /988/, `${country} must not be told to call 988`);
    assert.doesNotMatch(response.message, /\b911\b/, `${country} must not be told to call 911`);
    assert.match(response.message, /do not yet have verified crisis resources/i);
  }

  // The US response still says what it should.
  assert.match(crisisResponseFor("US").message, /988/);
});

// ── 6. false-positive regressions are permanent ──────────────────────────────

test("GUARANTEE 6: figures of speech stay out of the crisis path", () => {
  const mustNotRoute = [
    "this deadline is killing me",
    "my back is killing me",
    "I'm dying to know",
    "I'm dead tired",
    "my phone battery is dying",
    "I was reading about suicide prevention",
    "I volunteer for a suicide hotline",
    "I want to die my hair blue",
    "I killed it in the presentation",
    "just killing time",
  ];

  for (const message of mustNotRoute) {
    assert.equal(
      routeMessage(message).requiresCrisisInterruption,
      false,
      `false positive on: "${message}"`,
    );
  }
});

// ── 7. the "I'm not in immediate danger" path ────────────────────────────────

test("GUARANTEE 7: saying 'not in danger' keeps crisis resources available", () => {
  const ack = acknowledgeNotInDanger("US");

  assert.ok(ack.crisisSupportHref, "resources must remain reachable");
  assert.ok(ack.actions.length > 0, "the crisis actions must remain");
  assert.equal(ack.acknowledgedNotInDanger, true);
});

test("GUARANTEE 7: acknowledging is not a risk determination", () => {
  const ack = acknowledgeNotInDanger("US");

  assert.equal(ack.isRiskAssessment, false);
  // It must never tell the person they are safe — the app cannot know that.
  assert.doesNotMatch(ack.message, /you are safe/i);
  assert.doesNotMatch(ack.message, /you'?re fine/i);
  assert.doesNotMatch(ack.message, /no longer at risk/i);
});

test("GUARANTEE 7: acknowledging does not suppress later routing", () => {
  const ack = acknowledgeNotInDanger("US");
  assert.equal(ack.suppressesFutureRouting, false);

  // The next message is matched from scratch.
  assert.equal(routeMessage("actually I want to kill myself").requiresCrisisInterruption, true);
});

// ── 8 & 9. the documentation is honest ───────────────────────────────────────

test("GUARANTEE 8: the docs state which expressions this will miss", () => {
  const doc = fs.readFileSync(path.join(SERVER_DIR, "..", "docs", "AI_SAFETY.md"), "utf8");

  for (const word of ["obliquely", "metaphor", "another language"]) {
    assert.ok(doc.includes(word), `AI_SAFETY.md must mention "${word}" as a known miss`);
  }
  assert.match(doc, /does not mean every unsafe situation is detected/i);
});

test("GUARANTEE 9: the docs describe the router as one layer, not an assessment", () => {
  const doc = fs.readFileSync(path.join(SERVER_DIR, "..", "docs", "AI_SAFETY.md"), "utf8");

  assert.match(doc, /layered/i);
  assert.match(doc, /not a risk assessment/i);
  assert.match(doc, /never claim it detects crises or monitors conversations/i);
  assert.match(doc, /Not yet clinically reviewed — public release blocked/);
});

// ── 10. no analytics anywhere near a message ─────────────────────────────────

test("GUARANTEE 10: no analytics or telemetry destination exists in the server", () => {
  const dirs = ["services", "routes", "middleware", "lib"];
  const offenders = [];

  for (const dir of dirs) {
    const full = path.join(SERVER_DIR, dir);
    if (!fs.existsSync(full)) continue;

    for (const file of fs.readdirSync(full).filter((f) => f.endsWith(".js"))) {
      const source = fs.readFileSync(path.join(full, file), "utf8");
      for (const pattern of [/posthog/i, /mixpanel/i, /segment\.io/i, /gtag\(/, /amplitude/i, /datadog/i]) {
        if (pattern.test(source)) offenders.push(`${dir}/${file}`);
      }
    }
  }

  assert.deepEqual(offenders, [], "no analytics SDK may exist where messages are handled");
});
