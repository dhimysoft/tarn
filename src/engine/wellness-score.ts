/**
 * AURA Wellness Scoring Engine
 * Deterministic — no LLM involvement. Fully auditable.
 */

export interface WellnessSignals {
  sleep: number;       // 1–10 (hours normalized or subjective quality)
  stress: number;      // 1–10 (higher = more stressed)
  mood: number;        // 1–10
  energy: number;      // 1–10
  focus: number;       // 1–10
  consistency: number; // 1–10 (streak / regularity)
}

export interface WellnessScore {
  wellness_score: number;       // 0–100
  tier: WellnessTier;
  burnout_risk: RiskLevel;
  recovery_index: number;       // 0–100
  focus_readiness: number;      // 0–100
  delta?: number;               // change from prior session
}

export type WellnessTier = "Critical" | "Low" | "Moderate" | "High" | "Optimal";
export type RiskLevel = "Low" | "Moderate" | "High" | "Critical";

export interface ScoringContext {
  hour?: number;              // 0–23, used for time-of-day adjustments
  workload_hours?: number;    // class + work hours today
  prior_score?: number;       // previous session wellness_score
}

const WEIGHTS = {
  sleep: 0.25,
  mood: 0.20,
  energy: 0.20,
  focus: 0.15,
  stress_inverse: 0.15,
  consistency: 0.05,
} as const;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function toTier(score: number): WellnessTier {
  if (score >= 85) return "Optimal";
  if (score >= 70) return "High";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Low";
  return "Critical";
}

/**
 * Burnout risk requires ALL THREE conditions to be present.
 * This prevents false positives from a single stressful day.
 */
function computeBurnoutRisk(
  signals: WellnessSignals,
  workload_hours = 0
): RiskLevel {
  const highStress = signals.stress >= 7;
  const sleepDeficit = signals.sleep <= 5;
  const sustainedWorkload = workload_hours >= 8;

  if (highStress && sleepDeficit && sustainedWorkload) return "Critical";
  if (highStress && (sleepDeficit || sustainedWorkload)) return "High";
  if (signals.stress >= 5 && signals.sleep <= 6) return "Moderate";
  return "Low";
}

/**
 * Recovery index reflects the body's ability to restore baseline.
 * Weighted toward sleep quality and stress reduction.
 */
function computeRecoveryIndex(signals: WellnessSignals): number {
  const raw =
    signals.sleep * 0.50 +
    (10 - signals.stress) * 0.30 +
    signals.mood * 0.20;
  return clamp(Math.round(raw * 10));
}

/**
 * Focus readiness is time-of-day aware.
 * Afternoon dip (13:00–15:00) applies a small penalty.
 */
function computeFocusReadiness(
  signals: WellnessSignals,
  hour = 9
): number {
  const afternoonDip = hour >= 13 && hour <= 15 ? 0.9 : 1.0;
  const raw =
    (signals.sleep * 0.35 +
      signals.energy * 0.30 +
      signals.focus * 0.25 +
      (10 - signals.stress) * 0.10) *
    afternoonDip;
  return clamp(Math.round(raw * 10));
}

export function computeWellnessScore(
  signals: WellnessSignals,
  context: ScoringContext = {}
): WellnessScore {
  validateSignals(signals);

  const raw =
    signals.sleep * WEIGHTS.sleep +
    signals.mood * WEIGHTS.mood +
    signals.energy * WEIGHTS.energy +
    signals.focus * WEIGHTS.focus +
    (10 - signals.stress) * WEIGHTS.stress_inverse +
    signals.consistency * WEIGHTS.consistency;

  const wellness_score = clamp(Math.round(raw * 10));
  const tier = toTier(wellness_score);
  const burnout_risk = computeBurnoutRisk(signals, context.workload_hours);
  const recovery_index = computeRecoveryIndex(signals);
  const focus_readiness = computeFocusReadiness(signals, context.hour);
  const delta =
    context.prior_score !== undefined
      ? wellness_score - context.prior_score
      : undefined;

  return { wellness_score, tier, burnout_risk, recovery_index, focus_readiness, delta };
}

function validateSignals(signals: WellnessSignals): void {
  const fields = Object.entries(signals) as [keyof WellnessSignals, number][];
  for (const [key, value] of fields) {
    if (typeof value !== "number" || value < 1 || value > 10) {
      throw new RangeError(
        `Signal "${key}" must be a number between 1 and 10. Received: ${value}`
      );
    }
  }
}
