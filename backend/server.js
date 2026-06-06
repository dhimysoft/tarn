// AURA Intelligence — Wellness Intelligence Platform
// Powered by DHIMLUX Labs
// Author: Dhimy Jean
//
// Principle: AI provides insights. The platform makes recommendations.
// AI must never make medical decisions, diagnoses, or health claims.

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, "../frontend-aura");
app.use(express.static(frontendPath));

// Load GEMINI_API_KEY from environment or .env file
let GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  try {
    const env = readFileSync(path.join(__dirname, ".env"), "utf8");
    const match = env.match(/GEMINI_API_KEY=(.+)/);
    if (match) GEMINI_API_KEY = match[1].trim();
  } catch (_) {}
}

/* ============================================================
   UTILITIES
   ============================================================ */

function clamp(v, min = 0, max = 100) {
  return Math.min(max, Math.max(min, v));
}

function toTier(score) {
  if (score >= 85) return "Optimal";
  if (score >= 70) return "Good";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Low";
  return "Critical";
}

function formatHour(h) {
  const clamped = Math.max(0, Math.min(23, h));
  const ampm = clamped >= 12 ? "PM" : "AM";
  const display = clamped % 12 === 0 ? 12 : clamped % 12;
  return `${display}:00 ${ampm}`;
}

/* ============================================================
   WELLNESS ENGINE
   Deterministic. No LLM. Fully auditable.
   ============================================================ */

const WEIGHTS = {
  sleep: 0.25,
  mood: 0.20,
  energy: 0.20,
  focus: 0.15,
  stress_inv: 0.15,   // inverted: (10 - stress)
  consistency: 0.05,
};

function computeWellnessScore(signals) {
  const raw =
    signals.sleep       * WEIGHTS.sleep +
    signals.mood        * WEIGHTS.mood +
    signals.energy      * WEIGHTS.energy +
    signals.focus       * WEIGHTS.focus +
    (10 - signals.stress) * WEIGHTS.stress_inv +
    signals.consistency * WEIGHTS.consistency;
  return clamp(Math.round(raw * 10));
}

/* ============================================================
   BURNOUT RISK ENGINE
   3-factor gate prevents false positives from single stressor.
   ============================================================ */

function computeBurnoutRisk(signals, workload_hours = 0) {
  const highStress      = signals.stress >= 7;
  const sleepDeficit    = signals.sleep  <= 5;
  const heavyWorkload   = workload_hours >= 8;

  if (highStress && sleepDeficit && heavyWorkload) return "Critical";
  if (highStress && (sleepDeficit || heavyWorkload)) return "High";
  if (signals.stress >= 5 && signals.sleep <= 6)    return "Moderate";
  return "Low";
}

function buildBurnoutText(signals, burnout_risk) {
  const reasons = [];
  if (signals.stress >= 7)   reasons.push("elevated stress");
  else if (signals.stress >= 5) reasons.push("moderate stress");
  if (signals.sleep  <= 5)   reasons.push("insufficient sleep");
  else if (signals.sleep <= 6)  reasons.push("below-optimal sleep");
  if (signals.mood   <= 4)   reasons.push("low mood");

  if (burnout_risk === "Low")
    return "Burnout risk is low. Stress and recovery patterns are within a sustainable range.";
  if (!reasons.length)
    return `Burnout risk is ${burnout_risk.toLowerCase()}. Monitor compounding factors over the coming days.`;
  return `Burnout risk is ${burnout_risk.toLowerCase()} due to ${reasons.join(" and ")}.`;
}

/* ============================================================
   RECOVERY ENGINE
   ============================================================ */

function computeRecoveryIndex(signals) {
  const raw =
    signals.sleep * 0.50 +
    (10 - signals.stress) * 0.30 +
    signals.mood  * 0.20;
  return clamp(Math.round(raw * 10));
}

/* ============================================================
   FOCUS FORECAST ENGINE
   Time-of-day aware. Afternoon dip hardcoded (circadian science).
   ============================================================ */

function computeFocusReadiness(signals, hour = 9) {
  const dip = (hour >= 13 && hour <= 15) ? 0.90 : 1.0;
  const raw = (
    signals.sleep  * 0.35 +
    signals.energy * 0.30 +
    signals.focus  * 0.25 +
    (10 - signals.stress) * 0.10
  ) * dip;
  return clamp(Math.round(raw * 10));
}

function computeFocusWindows(focusReadiness, hour) {
  let peak;
  if (focusReadiness >= 70) {
    if (hour >= 6  && hour <= 11) peak = `${formatHour(hour)} – ${formatHour(Math.min(12, hour + 3))}`;
    else if (hour >= 12 && hour <= 13) peak = `${formatHour(hour)} – ${formatHour(hour + 2)}`;
    else if (hour >= 15 && hour <= 19) peak = `${formatHour(hour)} – ${formatHour(hour + 2)}`;
    else peak = "Tomorrow morning (8:00 – 11:00 AM)";
  } else if (focusReadiness >= 50) {
    peak = hour < 14 ? `${formatHour(hour + 1)} – ${formatHour(hour + 3)}` : "Tomorrow morning";
  } else {
    peak = "Tomorrow — prioritize sleep tonight";
  }

  const breakStart = (hour < 12) ? 13 : Math.max(hour + 1, 13);
  const break_window = `${formatHour(breakStart)} – ${formatHour(breakStart + 1)}`;
  const recoveryStart = Math.max(19, hour + 3);
  const recovery = `After ${formatHour(recoveryStart)}`;

  return { peak, break_window, recovery };
}

/* ============================================================
   EXPLAINABILITY LAYER
   Shows each signal's contribution delta from the neutral baseline (score=50).
   ============================================================ */

function computeExplanation(signals) {
  // Neutral baseline: all signals = 5 → score = 50
  const contributions = [
    {
      label: "Sleep Quality",
      signal: "sleep",
      delta: Math.round((signals.sleep - 5) * WEIGHTS.sleep * 10),
    },
    {
      label: "Mood",
      signal: "mood",
      delta: Math.round((signals.mood - 5) * WEIGHTS.mood * 10),
    },
    {
      label: "Energy",
      signal: "energy",
      delta: Math.round((signals.energy - 5) * WEIGHTS.energy * 10),
    },
    {
      label: "Focus",
      signal: "focus",
      delta: Math.round((signals.focus - 5) * WEIGHTS.focus * 10),
    },
    {
      label: "Stress",
      signal: "stress",
      // stress is inverted: higher stress → negative delta
      delta: Math.round((5 - signals.stress) * WEIGHTS.stress_inv * 10),
    },
    {
      label: "Consistency",
      signal: "consistency",
      delta: Math.round((signals.consistency - 5) * WEIGHTS.consistency * 10),
    },
  ].map((c) => ({ ...c, impact: c.delta >= 0 ? "positive" : "negative" }))
   .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return contributions;
}

/* ============================================================
   CONFIDENCE LAYER
   Reflects data completeness, internal consistency, and history depth.
   ============================================================ */

function computeConfidence(signals, context) {
  let score = 65; // base: all 6 signals provided

  // Streak bonus (up to +15)
  const streak = Math.min(context.streak || 0, 7);
  score += Math.round((streak / 7) * 15);

  // History depth bonus (up to +10)
  const historyLen = Math.min(context.history_length || 0, 7);
  score += Math.round((historyLen / 7) * 10);

  // Internal consistency check (signals should tell a coherent story)
  const highSleepLowEnergy  = signals.sleep  >= 8 && signals.energy <= 3;
  const highStressHighMood  = signals.stress >= 8 && signals.mood   >= 8;
  const highFocusHighStress = signals.focus  >= 8 && signals.stress >= 8;

  if (highSleepLowEnergy || highStressHighMood || highFocusHighStress) score -= 8;

  // Coherent signals get a small bonus
  const lowSleepLowEnergy = signals.sleep <= 4 && signals.energy <= 4;
  const highSleepHighEnergy = signals.sleep >= 7 && signals.energy >= 7;
  if (lowSleepLowEnergy || highSleepHighEnergy) score += 5;

  return clamp(score, 50, 98);
}

/* ============================================================
   INTELLIGENCE BRIEF
   Synthesizes signals into a 3-part human summary.
   ============================================================ */

function computeIntelligenceBrief(signals, scores, explanation) {
  const positives = explanation.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
  const negatives = explanation.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta);

  const primary_strength = positives.length
    ? `${positives[0].label} (contributing +${positives[0].delta} to your score)`
    : "Consistent daily tracking";

  const primary_risk = negatives.length
    ? `${negatives[0].label} (dragging score by ${negatives[0].delta})`
    : "No critical risk signals today";

  // Time-aware recommended action
  const hour = new Date().getHours();
  let recommended_action;
  if (scores.focus_readiness >= 70 && hour < 13) {
    recommended_action = "Schedule demanding work before noon — focus readiness is high";
  } else if (scores.burnout_risk === "High" || scores.burnout_risk === "Critical") {
    recommended_action = "Protect recovery time today — reduce discretionary commitments";
  } else if (scores.recovery_index < 50) {
    recommended_action = "Prioritize passive recovery tonight — early sleep will compound positively";
  } else if (signals.stress >= 7) {
    recommended_action = "Insert a deliberate 10-minute break every 90 minutes today";
  } else if (scores.focus_readiness >= 65) {
    recommended_action = "Use the current focus window for your highest-priority task";
  } else {
    recommended_action = "Maintain your current rhythm — signals are in a stable range";
  }

  return { primary_strength, primary_risk, recommended_action };
}

/* ============================================================
   RECOMMENDATION ENGINE — Deterministic rules
   ============================================================ */

function buildRecommendations(signals, scores) {
  const hour = new Date().getHours();
  const { burnout_risk, recovery_index, focus_readiness } = scores;
  const pool = [];

  if (signals.sleep <= 5)
    pool.push({ icon: "💤", title: "Address Sleep Deficit", body: "Sleep debt compounds daily. Even one extra hour tonight will measurably improve tomorrow's wellness and focus scores." });
  else if (signals.sleep <= 7)
    pool.push({ icon: "🌙", title: "Optimize Sleep Window", body: "Sleep is slightly below optimal. A consistent sleep schedule — same time each night — improves recovery quality more than total hours alone." });

  if (signals.stress >= 7)
    pool.push({ icon: "🧘", title: "Activate Recovery Mode", body: "Stress is in the high range. Schedule a deliberate 10-minute break every 90 minutes. Sustained high stress accelerates burnout faster than workload alone." });
  else if (signals.stress >= 5)
    pool.push({ icon: "🌿", title: "Reduce Cognitive Load", body: "Moderate stress detected. Batch similar tasks together and defer low-priority decisions — cognitive switching cost adds up under stress." });

  if (burnout_risk === "Critical" || burnout_risk === "High")
    pool.push({ icon: "⚠️", title: "Burnout Risk Is Elevated", body: "Multiple compounding stress factors are active simultaneously. Protect recovery time today — reduce discretionary commitments and prioritize sleep tonight." });

  if (focus_readiness >= 75 && hour >= 8 && hour <= 11)
    pool.push({ icon: "🎯", title: "Peak Focus Window — Act Now", body: "High focus readiness and morning prime window. Tackle your most cognitively demanding task in the next 90 minutes before the afternoon dip arrives." });
  else if (focus_readiness >= 70)
    pool.push({ icon: "🎯", title: "High Focus Readiness", body: "Your cognitive resources are strong right now. Use this window for deep work — analysis, writing, or complex problem-solving." });
  else if (focus_readiness < 45)
    pool.push({ icon: "🔄", title: "Route to Lower-Demand Tasks", body: "Focus readiness is low today. Assign administrative, routine, or collaborative work to this period — save demanding tasks for when readiness recovers." });

  if (signals.energy <= 4)
    pool.push({ icon: "⚡", title: "Restore Energy — Movement Over Caffeine", body: "Energy is depleted. A 20-minute walk or 10 minutes of movement is more effective at this level than caffeine, which may increase anxiety." });

  if (recovery_index < 50)
    pool.push({ icon: "🔋", title: "Recovery Is Insufficient", body: "Your recovery index indicates incomplete restoration between sessions. Prioritize passive recovery: no screens before bed, hydration, and an earlier sleep time." });

  if (signals.mood <= 3)
    pool.push({ icon: "🎧", title: "Mood Support", body: "Low mood affects decision-making and cognitive performance. Physical movement — even a 10-minute walk — has documented, immediate mood-elevating effects." });
  else if (signals.mood >= 8)
    pool.push({ icon: "✨", title: "High Mood — Leverage It", body: "You are in a positive affective state. Use this window for creative or high-stakes work that benefits from elevated mood." });

  if (hour >= 13 && hour <= 15)
    pool.push({ icon: "☕", title: "Afternoon Dip Window", body: "You are in the natural 1–3 PM energy and focus dip. A 10–20 minute rest is physiologically more effective than pushing through with stimulants." });

  return pool.slice(0, 3);
}

/* ============================================================
   PROTOCOL ENGINE
   Named protocol assigned by signal constellation.
   Every recommendation belongs to a named protocol.
   ============================================================ */

function computeProtocol(signals, scores) {
  const { burnout_risk, recovery_index, focus_readiness, wellness_score } = scores;

  if (burnout_risk === "Critical" && recovery_index < 40)
    return { id: "Recovery Protocol A", trigger: "Critical burnout + severe recovery deficit", priority: "critical" };
  if (burnout_risk === "Critical")
    return { id: "Recovery Protocol B", trigger: "Critical burnout risk", priority: "critical" };
  if (burnout_risk === "High" && recovery_index < 50)
    return { id: "Recovery Protocol B", trigger: "High burnout risk + insufficient recovery", priority: "high" };
  if (signals.stress >= 7 || burnout_risk === "High")
    return { id: "Stress Management Protocol A", trigger: "Elevated chronic stress pattern", priority: "high" };
  if (wellness_score >= 80 && focus_readiness >= 75)
    return { id: "Optimal Performance Protocol", trigger: "High wellness + strong focus readiness", priority: "low" };
  if (focus_readiness >= 75)
    return { id: "Focus Optimization Protocol", trigger: "High focus readiness available", priority: "low" };
  if (wellness_score >= 80)
    return { id: "Maintenance Protocol", trigger: "Strong baseline wellness", priority: "low" };
  return { id: "Stability Protocol", trigger: "Balanced signal baseline", priority: "low" };
}

/* ============================================================
   TREND INTELLIGENCE ENGINE
   Requires history array (last 7 sessions) from client.
   Computes % change across recent vs. prior sessions.
   ============================================================ */

function computeTrendIntelligence(history) {
  if (!history || history.length < 3) return null;

  const recent = history.slice(0, 3);
  const older  = history.slice(3, Math.min(history.length, 6));
  if (!older.length) return null;

  function avgSignal(sessions, key) {
    const vals = sessions.map((s) => s?.signals?.[key]).filter((v) => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  function avgScore(sessions, key) {
    const vals = sessions.map((s) => s?.scores?.[key]).filter((v) => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  const TRACKED = [
    { key: "stress",         label: "Stress",   type: "signal", inverse: true  },
    { key: "sleep",          label: "Sleep",    type: "signal", inverse: false },
    { key: "energy",         label: "Energy",   type: "signal", inverse: false },
    { key: "mood",           label: "Mood",     type: "signal", inverse: false },
    { key: "recovery_index", label: "Recovery", type: "score",  inverse: false },
  ];

  const insights = [];
  for (const f of TRACKED) {
    const recentVal = f.type === "signal" ? avgSignal(recent, f.key) : avgScore(recent, f.key);
    const olderVal  = f.type === "signal" ? avgSignal(older,  f.key) : avgScore(older,  f.key);
    if (recentVal == null || olderVal == null || olderVal === 0) continue;

    const pctChange = Math.round(((recentVal - olderVal) / olderVal) * 100);
    if (Math.abs(pctChange) < 8) continue;

    const direction  = pctChange > 0 ? "increased" : "decreased";
    const concerning = (f.inverse && pctChange > 0) || (!f.inverse && pctChange < 0);

    insights.push({
      metric:      f.label,
      signal_key:  f.key,
      direction,
      pct_change:  Math.abs(pctChange),
      concerning,
      text: `${f.label} ${direction} ${Math.abs(pctChange)}% over recent sessions.`,
    });
  }

  return insights.length
    ? insights.sort((a, b) => b.pct_change - a.pct_change)
    : null;
}

/* ============================================================
   BURNOUT TRAJECTORY ENGINE
   Answers: "Am I heading toward burnout?"
   Trend-aware when history is available.
   ============================================================ */

function computeBurnoutTrajectory(burnout_risk, trend_intelligence) {
  const stressUp   = trend_intelligence?.find((t) => t.metric === "Stress"   && t.direction === "increased");
  const sleepDown  = trend_intelligence?.find((t) => t.metric === "Sleep"    && t.direction === "decreased");
  const recovDown  = trend_intelligence?.find((t) => t.metric === "Recovery" && t.direction === "decreased");
  const energyDown = trend_intelligence?.find((t) => t.metric === "Energy"   && t.direction === "decreased");

  if (burnout_risk === "Critical") {
    const reasons = [];
    if (stressUp)   reasons.push(`stress up ${stressUp.pct_change}%`);
    if (sleepDown)  reasons.push(`sleep down ${sleepDown.pct_change}%`);
    if (recovDown)  reasons.push(`recovery down ${recovDown.pct_change}%`);
    return {
      heading_toward_burnout: true, urgency: "critical",
      answer: "Yes — critical burnout conditions are active.",
      reason: reasons.length
        ? `Compounding factors: ${reasons.join(", ")}.`
        : "All three burnout triggers (stress, sleep, workload) are simultaneously active.",
    };
  }

  const trendEscalating = stressUp && (sleepDown || energyDown || recovDown);

  if (burnout_risk === "High" || trendEscalating) {
    const reasons = [];
    if (stressUp)   reasons.push(`stress up ${stressUp.pct_change}%`);
    if (sleepDown)  reasons.push(`sleep down ${sleepDown.pct_change}%`);
    if (recovDown)  reasons.push(`recovery down ${recovDown.pct_change}%`);
    if (energyDown && !sleepDown && !recovDown) reasons.push(`energy down ${energyDown.pct_change}%`);
    return {
      heading_toward_burnout: true, urgency: "high",
      answer: "Trending toward elevated risk.",
      reason: reasons.length
        ? `Pattern detected: ${reasons.join(", ")}.`
        : `Burnout risk is ${burnout_risk.toLowerCase()} — compounding factors are active.`,
    };
  }

  if (burnout_risk === "Moderate") {
    return {
      heading_toward_burnout: false, urgency: "moderate",
      answer: "Moderate risk — monitor over the next 2–3 days.",
      reason: "Current signals are manageable but recovery is not at full capacity.",
    };
  }

  return {
    heading_toward_burnout: false, urgency: "low",
    answer: "No — signals are within a sustainable range.",
    reason: trend_intelligence
      ? "Trend data shows no escalating pattern across recent sessions."
      : "Stress, sleep, and workload signals are not triggering burnout conditions.",
  };
}

/* ============================================================
   WORKLOAD FEASIBILITY ENGINE
   Answers: "Can I realistically accomplish today's workload?"
   ============================================================ */

function computeWorkloadFeasibility(signals, scores, workload_hours) {
  if (!workload_hours || workload_hours === 0)
    return { feasible: true, rating: "N/A", answer: "No workload scheduled today.", reason: "No study or work hours were entered." };

  const { focus_readiness, recovery_index, burnout_risk } = scores;

  // Cognitive capacity: weighted composite of focus, recovery, and stress tolerance
  const capacity = Math.round(
    focus_readiness * 0.45 +
    recovery_index  * 0.30 +
    (10 - signals.stress) * 10 * 0.25
  );

  const sustainableHours = capacity >= 78 ? 8 : capacity >= 62 ? 6 : capacity >= 45 ? 4 : 2;

  if (burnout_risk === "Critical") {
    return {
      feasible: false, rating: "High Risk",
      answer: "Not advisable at full capacity today.",
      reason: `Critical burnout conditions are active. Limit to ${sustainableHours} hours of essential tasks only.`,
    };
  }
  if (workload_hours > sustainableHours + 2) {
    return {
      feasible: false, rating: "Overloaded",
      answer: `Scheduled load (${workload_hours}h) exceeds current capacity.`,
      reason: `Wellness signals support approximately ${sustainableHours} focused hours today. Defer low-priority tasks.`,
    };
  }
  if (workload_hours > sustainableHours) {
    return {
      feasible: true, rating: "Stretched",
      answer: "Achievable — at the edge of current capacity.",
      reason: `${workload_hours}h is at your upper limit. Prioritize ruthlessly and protect your recovery window.`,
    };
  }
  return {
    feasible: true, rating: "Achievable",
    answer: `Yes — ${workload_hours}h is within current capacity.`,
    reason: "Today's workload aligns with your wellness signals. Protect your peak focus windows.",
  };
}

/* ============================================================
   CONFIDENCE REASON
   ============================================================ */

function buildConfidenceReason(context) {
  const streak  = context.streak || 0;
  const histLen = context.history_length || 0;
  if (streak >= 7)  return `Based on ${streak} consecutive days of wellness data.`;
  if (streak >= 4)  return `${streak}-day streak. Continue daily check-ins for higher accuracy.`;
  if (streak >= 2)  return `${streak} consecutive days logged.`;
  if (histLen > 1)  return `${histLen} sessions on record — streak was broken. Daily consistency improves accuracy.`;
  return "First check-in. Accuracy grows after 3–7 consecutive days.";
}

/* ============================================================
   INPUT VALIDATION
   ============================================================ */

function validateSignals(signals) {
  const required = ["sleep", "stress", "mood", "energy", "focus", "consistency"];
  for (const key of required) {
    const v = signals[key];
    if (typeof v !== "number" || v < 1 || v > 10) {
      return `Signal "${key}" must be a number 1–10. Got: ${v}`;
    }
  }
  return null;
}

/* ============================================================
   API: POST /api/wellness/score
   ============================================================ */

app.post("/api/wellness/score", (req, res) => {
  const { signals, context = {} } = req.body;

  if (!signals || typeof signals !== "object") {
    return res.status(400).json({ error: "signals object is required" });
  }

  const validationError = validateSignals(signals);
  if (validationError) return res.status(400).json({ error: validationError });

  context.hour = context.hour ?? new Date().getHours();

  // Wellness Engine
  const wellness_score = computeWellnessScore(signals);
  const tier           = toTier(wellness_score);

  // Burnout Engine
  const burnout_risk  = computeBurnoutRisk(signals, context.workload_hours);
  const burnout_text  = buildBurnoutText(signals, burnout_risk);

  // Recovery Engine
  const recovery_index = computeRecoveryIndex(signals);

  // Focus Forecast Engine
  const focus_readiness = computeFocusReadiness(signals, context.hour);
  const focus_windows   = computeFocusWindows(focus_readiness, context.hour);

  // Delta
  const delta = context.prior_score != null ? wellness_score - context.prior_score : null;

  const scores = { wellness_score, tier, burnout_risk, burnout_text, recovery_index, focus_readiness, delta };

  // Explainability Layer
  const explanation = computeExplanation(signals);

  // Confidence Layer
  const confidence        = computeConfidence(signals, context);
  const confidence_reason = buildConfidenceReason(context);

  // Intelligence Brief
  const intelligence_brief = computeIntelligenceBrief(signals, scores, explanation);

  // Trend Intelligence Engine (requires history from client)
  const trend_intelligence = computeTrendIntelligence(context.history || []);

  // Burnout Trajectory Engine
  const burnout_trajectory = computeBurnoutTrajectory(burnout_risk, trend_intelligence);

  // Workload Feasibility Engine
  const workload_feasibility = computeWorkloadFeasibility(signals, scores, context.workload_hours || 0);

  // Protocol Engine
  const protocol = computeProtocol(signals, scores);

  // Recommendations
  const recommendations = buildRecommendations(signals, scores);

  res.json({
    ...scores,
    focus_windows,
    explanation,
    confidence,
    confidence_reason,
    intelligence_brief,
    trend_intelligence,
    burnout_trajectory,
    workload_feasibility,
    protocol,
    recommendations,
  });
});

/* ============================================================
   API: POST /api/wellness/insight  (AI Layer)
   ============================================================ */

app.post("/api/wellness/insight", async (req, res) => {
  const { wellness_score, tier, burnout_risk, recovery_index, focus_readiness, delta, confidence } = req.body;

  if (!GEMINI_API_KEY) {
    return res.json({ insight: "AI insight is unavailable — GEMINI_API_KEY is not configured.", advisory: true, model: "unavailable" });
  }

  const deltaText =
    delta != null
      ? delta >= 0 ? `improved by ${delta} points` : `declined by ${Math.abs(delta)} points`
      : "no prior session to compare";

  const prompt = `You are an advisory wellness intelligence system. You do not provide medical advice, diagnoses, or treatment recommendations. Your role is to provide concise, factual, pattern-based observations.

Wellness data:
- Wellness Score: ${wellness_score}/100 (${tier})
- Burnout Risk: ${burnout_risk}
- Recovery Index: ${recovery_index}/100
- Focus Readiness: ${focus_readiness}/100
- Confidence: ${confidence}%
- Change from prior session: ${deltaText}

Write exactly 2–3 sentences. Describe the pattern in neutral, factual language. Do not diagnose. Do not recommend medical action. End with one general behavioral suggestion.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 160 },
        }),
      }
    );

    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Insight unavailable.";
    res.json({ insight: text.trim(), advisory: true, model: "gemini-2.0-flash" });
  } catch (err) {
    console.error("Gemini error:", err.message);
    res.json({ insight: "AI insight temporarily unavailable.", advisory: true, model: "unavailable" });
  }
});

/* ============================================================
   SERVE FRONTEND
   ============================================================ */

app.get("/", (req, res) => res.sendFile(path.join(frontendPath, "index.html")));
app.use((req, res) => res.sendFile(path.join(frontendPath, "index.html")));

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () =>
  console.log(`AURA Intelligence running at http://localhost:${PORT}`)
);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[AURA] Port ${PORT} is already in use.\nRun: pkill -f "node backend/server.js"\nThen: npm run dev\n`);
  } else {
    console.error("[AURA] Server error:", err.message);
  }
  process.exit(1);
});
