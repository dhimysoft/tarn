// The Daily Wellness Snapshot calculation.
//
// Pure arithmetic with no database and no network, so it is the cheapest thing
// here to test — and the most important to get right, because it is the number
// the whole dashboard is built around.

const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateSnapshot, consistencyFromStreak, WEIGHTS } = require("../lib/snapshot");

const NEUTRAL = { sleepQuality: 5, stressLevel: 5, mood: 5, energy: 5, focus: 5 };

test("the weights sum to exactly 1.00", () => {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}, not 1`);
});

test("all-neutral answers land at the midpoint", () => {
  assert.equal(calculateSnapshot(NEUTRAL, 0).score, 50);
});

test("the score stays within 0-100 at both extremes", () => {
  const best = calculateSnapshot({ sleepQuality: 10, stressLevel: 1, mood: 10, energy: 10, focus: 10 }, 7);
  const worst = calculateSnapshot({ sleepQuality: 1, stressLevel: 10, mood: 1, energy: 1, focus: 1 }, 0);

  assert.ok(best.score <= 100 && best.score >= 0);
  assert.ok(worst.score <= 100 && worst.score >= 0);
  assert.ok(best.score > worst.score);
});

// Stress is the one inverted signal, and getting it backwards would invert the
// meaning of the whole dashboard.
test("higher reported stress lowers the score", () => {
  const calm = calculateSnapshot({ ...NEUTRAL, stressLevel: 1 }, 0).score;
  const stressed = calculateSnapshot({ ...NEUTRAL, stressLevel: 10 }, 0).score;

  assert.ok(calm > stressed, `calm ${calm} should exceed stressed ${stressed}`);
});

test("every other signal raises the score as it increases", () => {
  for (const key of ["sleepQuality", "mood", "energy", "focus"]) {
    const low = calculateSnapshot({ ...NEUTRAL, [key]: 1 }, 0).score;
    const high = calculateSnapshot({ ...NEUTRAL, [key]: 10 }, 0).score;
    assert.ok(high > low, `${key}: 10 (${high}) should score above 1 (${low})`);
  }
});

test("sleep moves the score more than focus, matching its weight", () => {
  const bySleep = calculateSnapshot({ ...NEUTRAL, sleepQuality: 10 }, 0).score - 50;
  const byFocus = calculateSnapshot({ ...NEUTRAL, focus: 10 }, 0).score - 50;

  assert.ok(bySleep > byFocus, "sleep is weighted 0.25 against focus at 0.15");
});

test("the same input always produces the same score", () => {
  const a = calculateSnapshot(NEUTRAL, 3);
  const b = calculateSnapshot(NEUTRAL, 3);
  assert.equal(a.score, b.score);
  assert.deepEqual(a.contributions, b.contributions);
});

test("consistency is derived from the streak, not reported", () => {
  assert.equal(consistencyFromStreak(0), 5, "a first check-in is neutral");
  assert.ok(consistencyFromStreak(7) > consistencyFromStreak(1));
  assert.equal(consistencyFromStreak(30), consistencyFromStreak(7), "capped at 7 days");

  // It must be labelled as derived so the UI cannot present it as a sixth
  // self-reported signal.
  const derived = calculateSnapshot(NEUTRAL, 5).contributions.find((c) => c.key === "consistency");
  assert.equal(derived.derived, true);
});

test("an out-of-range signal throws rather than producing a wrong number", () => {
  assert.throws(() => calculateSnapshot({ ...NEUTRAL, mood: 0 }, 0));
  assert.throws(() => calculateSnapshot({ ...NEUTRAL, mood: 11 }, 0));
  assert.throws(() => calculateSnapshot({ ...NEUTRAL, mood: undefined }, 0));
});

test("the result carries its formula and is flagged non-clinical", () => {
  const result = calculateSnapshot(NEUTRAL, 0);

  assert.match(result.formula, /sleep/);
  assert.equal(result.isClinical, false);
  assert.ok(result.tier, "a readable band is returned alongside the number");
});

test("contributions explain the score and are ordered by influence", () => {
  const { contributions } = calculateSnapshot({ sleepQuality: 10, stressLevel: 9, mood: 5, energy: 5, focus: 5 }, 0);

  assert.equal(contributions.length, 6);
  for (let i = 1; i < contributions.length; i++) {
    assert.ok(contributions[i - 1].delta >= contributions[i].delta, "sorted high to low");
  }
  assert.equal(contributions[0].key, "sleepQuality");
});
