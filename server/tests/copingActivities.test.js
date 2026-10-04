/**
 * The coping-activity library.
 *
 * The point of these tests is that unreviewed, unavailable or invented
 * activities can never reach a user — and that the library fails CLOSED, so
 * the safe state is the default rather than something to remember.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAvailableActivities, getAllowedActivityIds, getActivityById, recommendActivities,
  APPROVAL, EVIDENCE_TYPE, REQUIRED_FIELDS, _ALL_ACTIVITIES_INCLUDING_UNAPPROVED: ALL,
} = require("../services/copingActivities");

const { validateResponse } = require("../services/responseValidator");

// ── every entry is complete ──────────────────────────────────────────────────

test("every activity has all required fields", () => {
  for (const activity of ALL) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(field in activity, `${activity.id} is missing "${field}"`);
    }
  }
});

test("every activity has real content, not placeholders", () => {
  for (const a of ALL) {
    assert.ok(a.title?.trim(), `${a.id}: title`);
    assert.ok(a.purpose?.trim(), `${a.id}: purpose`);
    assert.ok(Array.isArray(a.steps) && a.steps.length >= 2, `${a.id}: needs real steps`);
    assert.ok(Number.isFinite(a.estimatedMinutes) && a.estimatedMinutes > 0, `${a.id}: duration`);
    assert.ok(Array.isArray(a.cautions) && a.cautions.length >= 1, `${a.id}: at least one caution`);
  }
});

// ── sources are real and honestly scoped ─────────────────────────────────────

test("every activity cites a source with an identifier", () => {
  for (const a of ALL) {
    assert.ok(a.source && typeof a.source === "object", `${a.id}: source must be an object`);
    assert.ok(a.source.title?.trim(), `${a.id}: source needs a title`);
    assert.ok(a.source.authors?.trim(), `${a.id}: source needs authors`);
    assert.ok(Number.isInteger(a.source.year), `${a.id}: source needs a year`);

    // A citation that cannot be looked up is not a citation.
    const locatable = a.source.doi || a.source.url || a.source.isbn;
    assert.ok(locatable, `${a.id}: source needs a DOI, URL or ISBN so it can be checked`);
  }
});

test("no activity claims evidence about this product", () => {
  for (const a of ALL) {
    assert.ok(Object.values(EVIDENCE_TYPE).includes(a.evidenceType), `${a.id}: evidenceType`);
    // No study of TARN exists, so nothing may claim one.
    assert.notEqual(
      a.evidenceType,
      EVIDENCE_TYPE.THIS_PRODUCT,
      `${a.id} claims evidence about this app, of which there is none`,
    );
    assert.ok(a.evidenceLimitations?.trim(), `${a.id}: limitations must be stated`);
  }
});

test("no activity promises an outcome", () => {
  const promises = [/\bwill (cure|treat|fix|heal|stop)\b/i, /\bguarantee/i, /\bproven to\b/i, /\bclinically proven\b/i];

  for (const a of ALL) {
    const prose = [a.title, a.purpose, ...a.steps, ...a.cautions].join(" ");
    for (const pattern of promises) {
      assert.doesNotMatch(prose, pattern, `${a.id} promises an outcome`);
    }
  }
});

test("the CBT-derived activity carries the required qualifier", () => {
  const thought = ALL.find((a) => a.id === "balanced-thought-note");
  const cautions = thought.cautions.join(" ");

  assert.match(cautions, /inspired by common cognitive behavioral therapy techniques/i);
  assert.match(cautions, /not CBT treatment|not a substitute/i);
});

test("the breathing activity warns about discomfort and claims no treatment", () => {
  const breathing = ALL.find((a) => a.id === "paced-breathing-4-6");
  const cautions = breathing.cautions.join(" ");

  assert.match(cautions, /dizzy|light-headed/i);
  assert.match(cautions, /not a treatment/i);
  assert.doesNotMatch(breathing.purpose, /prevent(s)? (a )?panic/i);
});

// ── nothing unreviewed reaches a user ────────────────────────────────────────

test("nothing is available until a qualified professional has reviewed it", () => {
  // Every entry is currently pending, so this must be empty. If a future change
  // exposes unapproved content, this test fails.
  for (const a of ALL) {
    if (a.approvalStatus !== APPROVAL.APPROVED) {
      assert.equal(
        getAvailableActivities().some((v) => v.id === a.id),
        false,
        `${a.id} is ${a.approvalStatus} and must not be available`,
      );
    }
  }
});

test("the library fails closed — no reviewer means nothing is served", () => {
  assert.deepEqual(getAvailableActivities(), [], "nothing is approved yet, so nothing may be served");
  assert.equal(getAllowedActivityIds().size, 0);
});

test("clinical review fields are unfilled, not invented", () => {
  for (const a of ALL) {
    assert.equal(a.reviewer, null, `${a.id}: reviewer must not be fabricated`);
    assert.equal(a.reviewedOn, null, `${a.id}: review date must not be fabricated`);
    assert.equal(a.approvalStatus, APPROVAL.PENDING, `${a.id}: must remain pending`);
  }
});

test("looking up an unapproved activity returns null", () => {
  for (const a of ALL) {
    assert.equal(getActivityById(a.id), null, `${a.id} must not be retrievable while unapproved`);
  }
});

test("an unknown or fabricated id returns null", () => {
  for (const id of ["hold-your-breath-3-minutes", "cold-plunge-cure", "", null, undefined, "../../etc/passwd"]) {
    assert.equal(getActivityById(id), null, `fabricated id "${id}" must return null`);
  }
});

// ── deterministic recommendations ────────────────────────────────────────────

test("recommendations need no model and never exceed the limit", () => {
  const results = recommendActivities({ stressLevel: 9, mood: 2, focus: 3, energy: 3 }, 3);

  assert.ok(Array.isArray(results));
  assert.ok(results.length <= 3);
  // Empty today because nothing is approved — the honest result.
  for (const r of results) {
    assert.equal(r.source, "deterministic");
    assert.ok(r.because, "every recommendation must say why it was chosen");
  }
});

test("recommendations only ever return approved activities", () => {
  const approvedIds = getAllowedActivityIds();

  for (const signals of [
    { stressLevel: 10, mood: 1, focus: 1, energy: 1 },
    { stressLevel: 1, mood: 10, focus: 10, energy: 10 },
    {},
  ]) {
    for (const r of recommendActivities(signals)) {
      assert.ok(approvedIds.has(r.activity.id), `recommended an unapproved activity: ${r.activity.id}`);
    }
  }
});

// ── the model cannot invent an exercise ──────────────────────────────────────

test("the validator rejects any activityId outside the approved set", () => {
  const base = {
    acknowledgment: "ok", reflection: "ok", followUpQuestion: "ok",
    suggestedActions: [], safetyCategory: "none",
    requiresCrisisInterruption: false, saveableSummary: null, disclaimerRequired: true,
  };

  const allowed = getAllowedActivityIds();

  for (const invented of ["hold-your-breath-3-minutes", "paced-breathing-4-6", "ice-bath-protocol"]) {
    const result = validateResponse({ ...base, activityId: invented }, { allowedActivityIds: allowed });
    // Nothing is approved, so EVERY id is rejected right now — including real
    // ones. That is the correct behaviour while the library is unreviewed.
    assert.equal(result.valid, false, `"${invented}" must be rejected while unapproved`);
  }
});

test("activity ids are stable, unique and URL-safe", () => {
  const ids = ALL.map((a) => a.id);

  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  for (const id of ids) {
    assert.match(id, /^[a-z0-9-]+$/, `id "${id}" must be lowercase, digits and hyphens only`);
  }
});
