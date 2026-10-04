/**
 * lib/snapshot.js — the ONE place a Daily Wellness Snapshot is calculated.
 *
 * WHAT THIS IS
 *   Weighted arithmetic on the five numbers the user chose, plus a consistency
 *   value derived from their check-in streak. Nothing is measured, inferred or
 *   diagnosed.
 *
 * WHAT THIS IS NOT
 *   Not a measure of anxiety, burnout, recovery, mental health, or fitness to
 *   work. It is a summary of self-reported answers and the interface must never
 *   imply otherwise. See docs/PRODUCT_BOUNDARIES.md.
 *
 * WHY IT LIVES ON THE SERVER
 *   The previous version had this same formula in three places — the backend,
 *   the browser bundle, and an unused TypeScript file that had already drifted
 *   (it returned a tier the other two did not have). One copy, on the server,
 *   with tests.
 */

// Weights sum to 1.00. Chosen by the developer for balance; NOT empirically
// derived and NOT validated against any clinical instrument.
const WEIGHTS = Object.freeze({
  sleepQuality: 0.25,
  mood: 0.20,
  energy: 0.20,
  focus: 0.15,
  stressLevel: 0.15,   // applied inverted — see below
  consistency: 0.05,
});

// Bands are labels for ranges of the same number, not categories of person.
const TIERS = Object.freeze([
  { min: 85, label: "Optimal" },
  { min: 70, label: "Good" },
  { min: 50, label: "Moderate" },
  { min: 30, label: "Low" },
  { min: 0, label: "Very low" },
]);

function clamp(value, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

/**
 * Consistency is DERIVED, not reported.
 *
 * The user never sets it — it comes from how many days in a row they have
 * checked in. The interface must not present it as a sixth self-reported
 * signal, because it is not one.
 */
function consistencyFromStreak(streak = 0) {
  if (!streak || streak < 1) return 5; // neutral on a first check-in
  return clamp(Math.round((Math.min(streak, 7) / 7) * 9) + 1, 1, 10);
}

/**
 * @param {object} signals   the five reported values, each 1-10
 * @param {number} streak    consecutive days checked in
 * @returns {{score:number, tier:string, contributions:Array, formula:string}}
 */
function calculateSnapshot(signals, streak = 0) {
  for (const key of ["sleepQuality", "mood", "energy", "focus", "stressLevel"]) {
    const v = signals[key];
    if (!Number.isInteger(v) || v < 1 || v > 10) {
      throw new Error(`Cannot calculate a snapshot: ${key} must be 1-10.`);
    }
  }

  const consistency = consistencyFromStreak(streak);

  // Stress is inverted: a high reported stress level should lower the number,
  // so it enters as (10 - stress).
  const raw =
    signals.sleepQuality * WEIGHTS.sleepQuality +
    signals.mood * WEIGHTS.mood +
    signals.energy * WEIGHTS.energy +
    signals.focus * WEIGHTS.focus +
    (10 - signals.stressLevel) * WEIGHTS.stressLevel +
    consistency * WEIGHTS.consistency;

  const score = clamp(Math.round(raw * 10));

  // Each signal's distance from the neutral midpoint (5), weighted. This is
  // what the "Why this number?" panel shows, so a person can see exactly which
  // of their own answers moved it and by how much.
  const contributions = [
    { key: "sleepQuality", label: "Sleep quality", delta: Math.round((signals.sleepQuality - 5) * WEIGHTS.sleepQuality * 10) },
    { key: "mood", label: "Mood", delta: Math.round((signals.mood - 5) * WEIGHTS.mood * 10) },
    { key: "energy", label: "Energy", delta: Math.round((signals.energy - 5) * WEIGHTS.energy * 10) },
    { key: "focus", label: "Focus", delta: Math.round((signals.focus - 5) * WEIGHTS.focus * 10) },
    { key: "stressLevel", label: "Stress", delta: Math.round((5 - signals.stressLevel) * WEIGHTS.stressLevel * 10) },
    { key: "consistency", label: "Check-in consistency", delta: Math.round((consistency - 5) * WEIGHTS.consistency * 10), derived: true },
  ].sort((a, b) => b.delta - a.delta);

  return {
    score,
    tier: TIERS.find((t) => score >= t.min).label,
    consistency,
    contributions,
    formula:
      "(sleep×0.25 + mood×0.20 + energy×0.20 + focus×0.15 + (10−stress)×0.15 + consistency×0.05) × 10",
    isClinical: false,
  };
}

module.exports = { calculateSnapshot, consistencyFromStreak, WEIGHTS, TIERS };
