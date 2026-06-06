// AURA Intelligence — Wellness Intelligence Platform
// Powered by DHIMLUX Labs · Author: Dhimy Jean
//
// Architecture: fully deterministic, runs entirely in the browser.
// No backend, no external API calls, no network dependency.

/* ============================================================
   SIGNAL LABELS
   ============================================================ */

const SIGNAL_LABELS = {
  sleep:  ["Very Poor","Poor","Below Avg","Average","Average","Above Avg","Good","Good","Excellent","Perfect"],
  stress: ["Calm","Relaxed","Mild","Mild","Moderate","Moderate","Elevated","High","Very High","Overwhelmed"],
  mood:   ["Very Low","Low","Below Avg","Average","Average","Above Avg","Good","Good","High","Excellent"],
  energy: ["Depleted","Very Low","Low","Below Avg","Average","Average","Good","High","Very High","Peak"],
  focus:  ["Scattered","Very Scattered","Unfocused","Below Avg","Average","Average","Good","Sharp","Very Sharp","Laser Sharp"],
};

/* ============================================================
   WELLNESS ENGINE — Deterministic. No LLM. Fully auditable.
   Ported from backend/server.js. Runs entirely in the browser.
   ============================================================ */

const WEIGHTS = {
  sleep:       0.25,
  mood:        0.20,
  energy:      0.20,
  focus:       0.15,
  stress_inv:  0.15,
  consistency: 0.05,
};

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
  const c = Math.max(0, Math.min(23, h));
  const ampm = c >= 12 ? "PM" : "AM";
  const display = c % 12 === 0 ? 12 : c % 12;
  return `${display}:00 ${ampm}`;
}

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

function computeBurnoutRisk(signals, workload_hours = 0) {
  const highStress    = signals.stress >= 7;
  const sleepDeficit  = signals.sleep  <= 5;
  const heavyWorkload = workload_hours >= 8;
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

function computeRecoveryIndex(signals) {
  const raw =
    signals.sleep * 0.50 +
    (10 - signals.stress) * 0.30 +
    signals.mood  * 0.20;
  return clamp(Math.round(raw * 10));
}

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

function computeExplanation(signals) {
  return [
    { label: "Sleep Quality", signal: "sleep",
      delta: Math.round((signals.sleep - 5) * WEIGHTS.sleep * 10) },
    { label: "Mood",          signal: "mood",
      delta: Math.round((signals.mood - 5) * WEIGHTS.mood * 10) },
    { label: "Energy",        signal: "energy",
      delta: Math.round((signals.energy - 5) * WEIGHTS.energy * 10) },
    { label: "Focus",         signal: "focus",
      delta: Math.round((signals.focus - 5) * WEIGHTS.focus * 10) },
    { label: "Stress",        signal: "stress",
      delta: Math.round((5 - signals.stress) * WEIGHTS.stress_inv * 10) },
    { label: "Consistency",   signal: "consistency",
      delta: Math.round((signals.consistency - 5) * WEIGHTS.consistency * 10) },
  ]
  .map((c) => ({ ...c, impact: c.delta >= 0 ? "positive" : "negative" }))
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function computeConfidence(signals, context) {
  let score = 65;
  const streak = Math.min(context.streak || 0, 7);
  score += Math.round((streak / 7) * 15);
  const historyLen = Math.min(context.history_length || 0, 7);
  score += Math.round((historyLen / 7) * 10);
  const highSleepLowEnergy  = signals.sleep  >= 8 && signals.energy <= 3;
  const highStressHighMood  = signals.stress >= 8 && signals.mood   >= 8;
  const highFocusHighStress = signals.focus  >= 8 && signals.stress >= 8;
  if (highSleepLowEnergy || highStressHighMood || highFocusHighStress) score -= 8;
  const lowSleepLowEnergy   = signals.sleep <= 4 && signals.energy <= 4;
  const highSleepHighEnergy = signals.sleep >= 7 && signals.energy >= 7;
  if (lowSleepLowEnergy || highSleepHighEnergy) score += 5;
  return clamp(score, 50, 98);
}

function buildConfidenceReason(context) {
  const streak  = context.streak || 0;
  const histLen = context.history_length || 0;
  if (streak >= 7)  return `Based on ${streak} consecutive days of wellness data.`;
  if (streak >= 4)  return `${streak}-day streak. Continue daily check-ins for higher accuracy.`;
  if (streak >= 2)  return `${streak} consecutive days logged.`;
  if (histLen > 1)  return `${histLen} sessions on record — streak was broken. Daily consistency improves accuracy.`;
  return "First check-in. Accuracy grows after 3–7 consecutive days.";
}

function computeIntelligenceBrief(signals, scores, explanation) {
  const positives = explanation.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
  const negatives = explanation.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta);
  const primary_strength = positives.length
    ? `${positives[0].label} (contributing +${positives[0].delta} to your score)`
    : "Consistent daily tracking";
  const primary_risk = negatives.length
    ? `${negatives[0].label} (dragging score by ${negatives[0].delta})`
    : "No critical risk signals today";
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

function computeEngineTrendIntelligence(history) {
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
      metric: f.label, signal_key: f.key, direction,
      pct_change: Math.abs(pctChange), concerning,
      text: `${f.label} ${direction} ${Math.abs(pctChange)}% over recent sessions.`,
    });
  }
  return insights.length ? insights.sort((a, b) => b.pct_change - a.pct_change) : null;
}

function computeEngineBurnoutTrajectory(burnout_risk, trend_intelligence) {
  const stressUp   = trend_intelligence?.find((t) => t.metric === "Stress"   && t.direction === "increased");
  const sleepDown  = trend_intelligence?.find((t) => t.metric === "Sleep"    && t.direction === "decreased");
  const recovDown  = trend_intelligence?.find((t) => t.metric === "Recovery" && t.direction === "decreased");
  const energyDown = trend_intelligence?.find((t) => t.metric === "Energy"   && t.direction === "decreased");
  if (burnout_risk === "Critical") {
    const reasons = [];
    if (stressUp)  reasons.push(`stress up ${stressUp.pct_change}%`);
    if (sleepDown) reasons.push(`sleep down ${sleepDown.pct_change}%`);
    if (recovDown) reasons.push(`recovery down ${recovDown.pct_change}%`);
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
    if (stressUp)  reasons.push(`stress up ${stressUp.pct_change}%`);
    if (sleepDown) reasons.push(`sleep down ${sleepDown.pct_change}%`);
    if (recovDown) reasons.push(`recovery down ${recovDown.pct_change}%`);
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

function computeEngineWorkloadFeasibility(signals, scores, workload_hours) {
  if (!workload_hours || workload_hours === 0)
    return { feasible: true, rating: "N/A", answer: "No workload scheduled today.", reason: "No study or work hours were entered." };
  const { focus_readiness, recovery_index, burnout_risk } = scores;
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

// Master function: computes the full scored payload from signals + context.
function computeAllScores(signals, context) {
  const hour = context.hour ?? new Date().getHours();

  const wellness_score = computeWellnessScore(signals);
  const tier           = toTier(wellness_score);
  const burnout_risk   = computeBurnoutRisk(signals, context.workload_hours);
  const burnout_text   = buildBurnoutText(signals, burnout_risk);
  const recovery_index = computeRecoveryIndex(signals);
  const focus_readiness = computeFocusReadiness(signals, hour);
  const focus_windows   = computeFocusWindows(focus_readiness, hour);
  const delta = context.prior_score != null ? wellness_score - context.prior_score : null;

  const scores = { wellness_score, tier, burnout_risk, burnout_text, recovery_index, focus_readiness, delta };

  const explanation        = computeExplanation(signals);
  const confidence         = computeConfidence(signals, context);
  const confidence_reason  = buildConfidenceReason(context);
  const intelligence_brief = computeIntelligenceBrief(signals, scores, explanation);
  const trend_intelligence = computeEngineTrendIntelligence(context.history || []);
  const burnout_trajectory = computeEngineBurnoutTrajectory(burnout_risk, trend_intelligence);
  const workload_feasibility = computeEngineWorkloadFeasibility(signals, scores, context.workload_hours || 0);
  const protocol           = computeProtocol(signals, scores);
  const recommendations    = buildRecommendations(signals, scores);

  return {
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
  };
}

// Deterministic advisory insight — replaces Gemini API call.
function computeLocalInsight({ wellness_score, tier, burnout_risk, recovery_index, focus_readiness, delta }) {
  const parts = [];

  if (wellness_score >= 80) {
    parts.push(`Wellness signals are strong at ${wellness_score}/100 (${tier}).`);
  } else if (wellness_score >= 60) {
    parts.push(`Wellness is in the moderate range at ${wellness_score}/100 (${tier}).`);
  } else {
    parts.push(`Wellness signals indicate a challenging period at ${wellness_score}/100 (${tier}).`);
  }

  if (burnout_risk === "Critical" || burnout_risk === "High") {
    parts.push(`Burnout risk is ${burnout_risk.toLowerCase()} — compounding stress and recovery factors are active.`);
  } else if (recovery_index >= 70) {
    parts.push(`Recovery index is strong at ${recovery_index}/100, indicating good restoration capacity.`);
  } else if (recovery_index < 50) {
    parts.push(`Recovery index is below threshold at ${recovery_index}/100 — prioritize sleep and passive recovery.`);
  } else {
    parts.push(`Recovery capacity is moderate — consistent sleep timing will compound positively over the next 2–3 days.`);
  }

  if (focus_readiness >= 70) {
    parts.push(`Focus readiness is high — use current cognitive capacity for demanding work.`);
  } else if (delta != null && delta >= 5) {
    parts.push(`Wellness improved ${delta} points from the previous session — maintain current patterns.`);
  } else if (delta != null && delta <= -5) {
    parts.push(`Wellness declined ${Math.abs(delta)} points — monitor sleep and stress signals over the next 2 days.`);
  } else {
    parts.push(`Track signals over the next 2–3 days to enable trend intelligence and burnout forecasting.`);
  }

  return parts.join(" ");
}

/* ============================================================
   LOCAL STORAGE
   ============================================================ */

const STORAGE_KEY = "aura_sessions_v2";

function getSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveSessions(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function getTodaySession() { return getSessions().find((s) => s.date === getTodayStr()) || null; }

function saveTodaySession(data) {
  const all = getSessions().filter((s) => s.date !== getTodayStr());
  all.unshift({ date: getTodayStr(), timestamp: Date.now(), ...data });
  saveSessions(all.slice(0, 30));
}

function getStreak() {
  const sessions = getSessions();
  if (!sessions.length) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (sessions.find((s) => s.date === d.toISOString().slice(0, 10))) streak++;
    else break;
  }
  return streak;
}

/* ============================================================
   PARTICLE BACKGROUND
   ============================================================ */

function initParticles() {
  const c = document.getElementById("particle-bg");
  if (!c) return;
  const ctx = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;

  const pts = Array.from({ length: 50 }, () => ({
    x: Math.random() * c.width, y: Math.random() * c.height,
    r: Math.random() * 1.4 + 0.4,
    dx: (Math.random() - 0.5) * 0.38, dy: (Math.random() - 0.5) * 0.38,
  }));

  (function animate() {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(139,92,246,0.11)";
    pts.forEach((p) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > c.width) p.dx *= -1;
      if (p.y < 0 || p.y > c.height) p.dy *= -1;
    });
    requestAnimationFrame(animate);
  })();

  window.addEventListener("resize", () => { c.width = innerWidth; c.height = innerHeight; });
}

/* ============================================================
   CHECK-IN PAGE
   ============================================================ */

function initCheckinPage() {
  if (!document.getElementById("checkin-form")) return;

  const h = new Date().getHours();
  const el = document.getElementById("greeting");
  if (el) el.textContent = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

  const streak = getStreak();
  const streakEl = document.getElementById("streak-display");
  if (streakEl) {
    if (streak > 0) { streakEl.innerHTML = `🔥 Day ${streak} streak`; streakEl.classList.add("active"); }
    else streakEl.textContent = "Start your streak — check in daily";
  }

  ["sleep","stress","mood","energy","focus"].forEach((name) => {
    const slider = document.getElementById(`${name}-slider`);
    const label  = document.getElementById(`${name}-label`);
    if (!slider || !label) return;
    const update = () => {
      label.textContent = SIGNAL_LABELS[name][parseInt(slider.value) - 1];
      slider.setAttribute("aria-valuenow", slider.value);
    };
    slider.addEventListener("input", update);
    update();
  });

  document.getElementById("checkin-form").addEventListener("submit", handleCheckin);
}

function handleCheckin(e) {
  e.preventDefault();
  const btn = document.getElementById("analyze-btn");
  btn.textContent = "Analyzing..."; btn.disabled = true;

  const streak = getStreak();
  const consistency = streak > 0
    ? Math.min(10, Math.max(1, Math.round((Math.min(streak, 7) / 7) * 9) + 1))
    : 5;

  const signals = {
    sleep:       parseInt(document.getElementById("sleep-slider").value),
    stress:      parseInt(document.getElementById("stress-slider").value),
    mood:        parseInt(document.getElementById("mood-slider").value),
    energy:      parseInt(document.getElementById("energy-slider").value),
    focus:       parseInt(document.getElementById("focus-slider").value),
    consistency,
  };

  const study    = parseInt(document.getElementById("study-input").value) || 0;
  const work     = parseInt(document.getElementById("work-input").value)  || 0;
  const sessions = getSessions();
  const prior    = sessions.find((s) => s.date !== getTodayStr());

  const context = {
    workload_hours:  study + work,
    hour:            new Date().getHours(),
    prior_score:     prior?.scores?.wellness_score ?? null,
    streak,
    history_length:  sessions.length,
    history:         sessions.slice(0, 7),
  };

  const scores = computeAllScores(signals, context);
  saveTodaySession({ signals, scores, recommendations: scores.recommendations });
  window.location.href = "dashboard.html";
}

/* ============================================================
   DASHBOARD PAGE
   ============================================================ */

function initDashboard() {
  if (!document.getElementById("dashboard-root")) return;

  const session = getTodaySession();
  if (!session) { window.location.href = "index.html"; return; }

  renderDashboard(session);
  renderInsight(session.scores);
}

function renderDashboard(session) {
  const { scores, recommendations } = session;
  const {
    wellness_score, tier, burnout_risk, burnout_text,
    recovery_index, focus_readiness, delta,
    confidence, confidence_reason, explanation, intelligence_brief, focus_windows,
    trend_intelligence, burnout_trajectory, workload_feasibility, protocol,
  } = scores;

  // ── Header ──────────────────────────────────────────────
  document.getElementById("today-date").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const streak = getStreak();
  document.getElementById("streak-count").textContent = `${streak} day${streak !== 1 ? "s" : ""}`;

  // ── Score Hero ───────────────────────────────────────────
  animateNumber("score-value", wellness_score, 1200);

  const tierEl = document.getElementById("score-tier");
  tierEl.textContent = tier;
  tierEl.className = `tier-badge tier-${tier.toLowerCase()}`;

  const deltaEl = document.getElementById("score-delta");
  if (delta != null) {
    deltaEl.textContent = delta >= 0 ? `+${delta} from yesterday` : `${delta} from yesterday`;
    deltaEl.className = `score-delta ${delta >= 0 ? "positive" : "negative"}`;
  } else {
    deltaEl.textContent = "First session"; deltaEl.className = "score-delta neutral";
  }

  // ── Confidence ───────────────────────────────────────────
  if (confidence != null) {
    animateNumberSuffix("confidence-value", confidence, "%", 1000);
    setTimeout(() => {
      const bar = document.getElementById("confidence-bar");
      if (bar) bar.style.width = `${confidence}%`;
    }, 200);
    setText("confidence-reason", confidence_reason || "");
  }

  // ── Metrics ───────────────────────────────────────────────
  const burnoutCard = document.getElementById("burnout-card");
  const burnoutVal  = document.getElementById("burnout-value");
  if (burnoutVal) burnoutVal.textContent = burnout_risk;
  if (burnoutCard) burnoutCard.className = `metric-card risk-${burnout_risk.toLowerCase()}`;

  animateNumber("ri-value", recovery_index, 1000);
  setTimeout(() => animateBar("ri-bar", recovery_index, barColor(recovery_index)), 200);

  animateNumber("fr-value", focus_readiness, 1000);
  setTimeout(() => animateBar("fr-bar", focus_readiness, barColor(focus_readiness)), 300);

  // ── Intelligence Brief ───────────────────────────────────
  if (intelligence_brief) {
    setText("brief-strength", intelligence_brief.primary_strength);
    setText("brief-risk",     intelligence_brief.primary_risk);
    setText("brief-action",   intelligence_brief.recommended_action);
  }

  // ── Focus Windows ────────────────────────────────────────
  if (focus_windows) {
    setText("focus-peak",     focus_windows.peak);
    setText("focus-break",    focus_windows.break_window);
    setText("focus-recovery", focus_windows.recovery);
  }

  // ── Intelligence Narrative ───────────────────────────────
  const narr = document.getElementById("burnout-narrative");
  if (narr) narr.innerHTML = buildNarrative(scores);

  // ── Explainability ───────────────────────────────────────
  renderExplanation(explanation || []);

  // ── Recommendations ──────────────────────────────────────
  const recEl = document.getElementById("recommendations");
  if (recEl) {
    if (recommendations?.length) {
      recEl.innerHTML = recommendations.map((r) => `
        <div class="rec-card">
          <div class="rec-icon">${r.icon}</div>
          <div class="rec-content">
            <div class="rec-title">${r.title}</div>
            <div class="rec-body">${r.body}</div>
          </div>
        </div>`).join("");
    } else {
      recEl.innerHTML = `<p class="no-recs">Wellness signals look balanced — no specific interventions flagged.</p>`;
    }
  }

  // ── Protocol Badge ────────────────────────────────────────
  const protoBadge = document.getElementById("protocol-badge");
  if (protoBadge && protocol) {
    protoBadge.textContent = protocol.id;
    protoBadge.className = `protocol-badge priority-${protocol.priority}`;
  }

  // ── Trend Intelligence Section ────────────────────────────
  renderTrendSection(trend_intelligence);

  // ── Key Questions ─────────────────────────────────────────
  renderKeyQuestions(scores, trend_intelligence);
}

/* ============================================================
   EXPLAINABILITY RENDERER
   ============================================================ */

function renderExplanation(contributors) {
  const container = document.getElementById("contributors");
  if (!container) return;

  const maxDelta = Math.max(...contributors.map((c) => Math.abs(c.delta)), 1);

  container.innerHTML = contributors.map((c) => {
    const pct  = Math.round((Math.abs(c.delta) / maxDelta) * 100);
    const sign = c.delta > 0 ? "+" : c.delta < 0 ? "" : "±";
    const cls  = c.delta > 0 ? "positive" : c.delta < 0 ? "negative" : "zero";
    return `
      <div class="contributor-row">
        <div class="contributor-label">${c.label}</div>
        <div class="contributor-bar-wrap">
          <div class="contributor-bar ${cls}" style="width:${pct}%"></div>
        </div>
        <div class="contributor-delta ${cls}">${sign}${c.delta}</div>
      </div>`;
  }).join("");
}

/* ============================================================
   NARRATIVE BUILDER
   ============================================================ */

function buildNarrative({ wellness_score, tier, burnout_risk, burnout_text, recovery_index, focus_readiness, delta }) {
  const parts = [];
  const riskClass = `risk-${burnout_risk.toLowerCase()}`;
  parts.push(
    burnout_risk === "Low"
      ? burnout_text
      : `<strong class="${riskClass}">${burnout_text}</strong>`
  );
  if (delta != null) {
    if (delta >= 5)
      parts.push(`Wellness improved <strong>+${delta} points</strong> since your last check-in — a meaningful positive shift.`);
    else if (delta <= -5)
      parts.push(`Wellness declined <strong>${delta} points</strong> since your last session. If this continues for 2+ days, consider adjusting your schedule.`);
    else if (delta !== 0)
      parts.push(`Score is stable (${delta > 0 ? "+" : ""}${delta} from yesterday).`);
  }
  if (focus_readiness >= 75)
    parts.push(`Focus readiness is high — cognitive resources are available for demanding work.`);
  else if (focus_readiness < 45)
    parts.push(`Focus readiness is low — route today's work toward lighter tasks.`);
  if (recovery_index < 50)
    parts.push(`Recovery index is below threshold. Prioritize passive recovery tonight.`);
  return parts.join(" ");
}

/* ============================================================
   TREND INTELLIGENCE ENGINE
   ============================================================ */

const BURNOUT_NUM = { Low: 20, Moderate: 50, High: 72, Critical: 92 };

function computeTrendSummary(sessions) {
  if (sessions.length < 3) return null;
  const recent   = sessions.slice(0, Math.min(3, sessions.length));
  const baseline = sessions.length >= 6
    ? sessions.slice(3, 6)
    : [sessions[sessions.length - 1]];

  const avg = (arr, fn) => {
    const vals = arr.map(fn).filter((v) => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const pct = (r, o) =>
    r == null || o == null || o === 0 ? null : Math.round(((r - o) / o) * 100);

  const rW = avg(recent,   (s) => s?.scores?.wellness_score);
  const oW = avg(baseline, (s) => s?.scores?.wellness_score);
  const rR = avg(recent,   (s) => s?.scores?.recovery_index);
  const oR = avg(baseline, (s) => s?.scores?.recovery_index);
  const rF = avg(recent,   (s) => s?.scores?.focus_readiness);
  const oF = avg(baseline, (s) => s?.scores?.focus_readiness);
  const rB = avg(recent,   (s) => BURNOUT_NUM[s?.scores?.burnout_risk] ?? null);
  const oB = avg(baseline, (s) => BURNOUT_NUM[s?.scores?.burnout_risk] ?? null);

  const wellnessPct = pct(rW, oW);
  const recoveryPct = pct(rR, oR);
  const focusPct    = pct(rF, oF);
  const burnoutPct  = pct(rB, oB);

  const improving = [wellnessPct, recoveryPct, focusPct].filter((p) => p != null && p > 3).length;
  const declining = [wellnessPct, recoveryPct, focusPct].filter((p) => p != null && p < -3).length;
  const burnoutImproving = burnoutPct != null && burnoutPct < -5;
  const burnoutWorsening = burnoutPct != null && burnoutPct > 5;

  let primaryInsight;
  if (improving >= 2 && burnoutImproving)
    primaryInsight = "Multiple wellness metrics are trending positively with declining burnout risk.";
  else if (recoveryPct != null && recoveryPct > 3 && burnoutImproving)
    primaryInsight = "Recovery is improving while burnout risk continues to decline.";
  else if (declining >= 2 || burnoutWorsening) {
    const label = recoveryPct != null && recoveryPct < -3 ? "Recovery" : wellnessPct != null && wellnessPct < -3 ? "Wellness" : "Focus";
    primaryInsight = `${label} is declining — multiple compounding factors require attention.`;
  } else if (improving >= 1) {
    const label = recoveryPct != null && recoveryPct > 3 ? "Recovery" : wellnessPct != null && wellnessPct > 3 ? "Wellness" : "Focus";
    primaryInsight = `${label} is on an upward trend. Maintain current patterns.`;
  } else if (declining >= 1) {
    const label = recoveryPct != null && recoveryPct < -3 ? "Recovery" : wellnessPct != null && wellnessPct < -3 ? "Wellness" : "Focus";
    primaryInsight = `${label} shows a declining trend — review recent sleep and stress signals.`;
  } else {
    primaryInsight = "Wellness signals are holding steady across all tracked metrics.";
  }

  return { wellnessPct, recoveryPct, focusPct, burnoutPct, primaryInsight };
}

function computeWhyThisTrend(sessions, serverInsights) {
  if (sessions.length < 3) return [];
  const recent   = sessions.slice(0, Math.min(3, sessions.length));
  const baseline = sessions.length >= 4
    ? sessions.slice(-Math.min(3, sessions.length - 1))
    : [sessions[sessions.length - 1]];

  const avgSig   = (arr, k) => { const v = arr.map((s) => s?.signals?.[k]).filter((x) => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const avgScore = (arr, k) => { const v = arr.map((s) => s?.scores?.[k]).filter((x) => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const pctOf    = (r, o)   => (r == null || o == null || o === 0) ? 0 : ((r - o) / o) * 100;

  const explanations = [];

  const recovPct = pctOf(avgScore(recent, "recovery_index"), avgScore(baseline, "recovery_index"));
  if (Math.abs(recovPct) > 5) {
    const sleepPct  = pctOf(avgSig(recent, "sleep"),  avgSig(baseline, "sleep"));
    const stressPct = pctOf(avgSig(recent, "stress"), avgSig(baseline, "stress"));
    if (recovPct > 5) {
      const reason = sleepPct > 5 ? "improved sleep quality" : stressPct < -5 ? "reduced stress" : "improved sleep and stress balance";
      explanations.push({ type: "positive", text: `Recovery improved due to ${reason}.` });
    } else {
      const reason = sleepPct < -5 ? "declining sleep quality" : stressPct > 5 ? "rising stress levels" : "reduced sleep quality and elevated stress";
      explanations.push({ type: "negative", text: `Recovery declined due to ${reason}.` });
    }
  }

  const focusPct = pctOf(avgScore(recent, "focus_readiness"), avgScore(baseline, "focus_readiness"));
  if (Math.abs(focusPct) > 5) {
    const energyPct = pctOf(avgSig(recent, "energy"), avgSig(baseline, "energy"));
    if (focusPct > 5) {
      const reason = energyPct > 5 ? "higher energy levels" : "reduced stress and better sleep";
      explanations.push({ type: "positive", text: `Focus readiness improved due to ${reason}.` });
    } else {
      explanations.push({ type: "negative", text: `Focus readiness declined — energy and sleep signals dropped.` });
    }
  }

  const rBurn = recent.map((s) => BURNOUT_NUM[s?.scores?.burnout_risk]).filter((v) => v != null);
  const oBurn = baseline.map((s) => BURNOUT_NUM[s?.scores?.burnout_risk]).filter((v) => v != null);
  if (rBurn.length && oBurn.length) {
    const avgRB = rBurn.reduce((a, b) => a + b, 0) / rBurn.length;
    const avgOB = oBurn.reduce((a, b) => a + b, 0) / oBurn.length;
    const burnPct = pctOf(avgRB, avgOB);
    if (burnPct < -10)
      explanations.push({ type: "positive", text: "Burnout risk declined because workload and stress patterns stabilized." });
    else if (burnPct > 10)
      explanations.push({ type: "negative", text: "Burnout risk increased — stress signals are compounding across recent sessions." });
  }

  if (!explanations.length && serverInsights?.length) {
    serverInsights.slice(0, 2).forEach((ins) => {
      explanations.push({ type: ins.concerning ? "negative" : "positive", text: ins.text });
    });
  }

  if (!explanations.length)
    explanations.push({ type: "neutral", text: "Signal patterns are consistent. No significant changes detected across the tracking period." });

  return explanations.slice(0, 3);
}

/* ============================================================
   TREND SECTION RENDERER
   ============================================================ */

function renderTrendSection(serverInsights) {
  const container = document.getElementById("trend-section");
  if (!container) return;

  const sessionsFwd = getSessions().slice(0, 7);
  const count = sessionsFwd.length;

  if (count < 3) {
    container.className = "trend-block";
    container.innerHTML = `
      <div class="block-title">Trend Intelligence</div>
      <div class="trend-empty">
        <div class="trend-empty-icon">📊</div>
        <div class="trend-empty-title">Not enough wellness history yet.</div>
        <p class="trend-empty-msg">Complete 3 daily check-ins to unlock:</p>
        <ul class="trend-unlock-list">
          <li>Wellness Trends</li>
          <li>Burnout Forecasting</li>
          <li>Recovery Analytics</li>
          <li>Focus Intelligence</li>
        </ul>
        <div class="trend-gate-progress">
          <div class="trend-gate-label">Data points collected: <strong>${count} of 3</strong></div>
          <div class="trend-gate-bar-wrap">
            <div class="trend-gate-bar-fill" style="width:${Math.round((count / 3) * 100)}%"></div>
          </div>
        </div>
      </div>`;
    return;
  }

  const summary = computeTrendSummary(sessionsFwd);
  const why     = computeWhyThisTrend(sessionsFwd, serverInsights);

  const pillData = [
    { label: "Wellness",     pct: summary.wellnessPct, invert: false },
    { label: "Recovery",     pct: summary.recoveryPct, invert: false },
    { label: "Focus",        pct: summary.focusPct,    invert: false },
    { label: "Burnout Risk", pct: summary.burnoutPct,  invert: true  },
  ];

  const pillsHTML = pillData.map(({ label, pct, invert }) => {
    if (pct == null) return "";
    const good  = invert ? pct < 0 : pct > 0;
    const flat  = pct === 0;
    const cls   = flat ? "pill-flat" : good ? "pill-good" : "pill-bad";
    const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
    const sign  = pct > 0 ? "+" : "";
    return `<div class="trend-pill ${cls}">
      <span class="pill-arrow">${arrow}</span>
      <span class="pill-label">${label}</span>
      <span class="pill-pct">${sign}${pct}%</span>
    </div>`;
  }).join("");

  const whyHTML = why.length ? `
    <div class="why-trend-block">
      <div class="why-trend-title">Why This Trend?</div>
      ${why.map((e) => `
        <div class="why-trend-item ${e.type}">
          <div class="why-dot"></div>
          <div class="why-text">${e.text}</div>
        </div>`).join("")}
    </div>` : "";

  container.className = "trend-block";
  container.innerHTML = `
    <div class="block-title">Trend Intelligence</div>
    <div class="trend-summary-card">
      <div class="trend-pills">${pillsHTML}</div>
      <div class="trend-primary-insight">
        <span class="trend-insight-label">Primary Insight</span>
        <span class="trend-insight-body">${summary.primaryInsight}</span>
      </div>
    </div>
    <div class="trend-legend">
      <span class="legend-dot" style="background:#8b5cf6"></span>Wellness
      <span class="legend-dot" style="background:#10b981"></span>Recovery
      <span class="legend-dot" style="background:#0ea5e9"></span>Focus
      <span class="legend-dot" style="background:#ef4444"></span>Burnout Risk
    </div>
    <canvas id="trend-chart" height="180"></canvas>
    ${whyHTML}`;

  renderTrendChart();
}

function renderTrendChart() {
  const ctx = document.getElementById("trend-chart");
  if (!ctx) return;

  const sessions = getSessions().slice(0, 7).reverse();
  if (!sessions.length) return;

  const labels = sessions.map((s) =>
    new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  );

  const mkDataset = (label, data, color, dashed = false) => ({
    label, data,
    borderColor: color,
    borderWidth: dashed ? 1.5 : 2.5,
    borderDash: dashed ? [5, 4] : [],
    tension: 0.42,
    fill: false,
    pointBackgroundColor: color,
    pointBorderColor: "rgba(7,3,22,0.8)",
    pointBorderWidth: 1.5,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointHoverBackgroundColor: color,
    spanGaps: true,
  });

  const wellnessData = sessions.map((s) => s.scores?.wellness_score  ?? null);
  const recoveryData = sessions.map((s) => s.scores?.recovery_index  ?? null);
  const focusData    = sessions.map((s) => s.scores?.focus_readiness ?? null);
  const burnoutData  = sessions.map((s) => BURNOUT_NUM[s.scores?.burnout_risk] ?? null);

  if (window._trendChart) { window._trendChart.destroy(); window._trendChart = null; }

  window._trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        mkDataset("Wellness",     wellnessData, "#8b5cf6"),
        mkDataset("Recovery",     recoveryData, "#10b981"),
        mkDataset("Focus",        focusData,    "#0ea5e9"),
        mkDataset("Burnout Risk", burnoutData,  "#ef4444", true),
      ],
    },
    options: {
      responsive: true,
      animation: { duration: 1000, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { color: "#7c6fa0", stepSize: 25, font: { size: 11 } },
          grid: { color: "rgba(255,255,255,0.05)", drawBorder: false },
          border: { display: false },
        },
        x: {
          ticks: { color: "#7c6fa0", font: { size: 11 }, maxRotation: 0 },
          grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(12,8,32,0.96)",
          borderColor: "rgba(139,92,246,0.3)",
          borderWidth: 1,
          titleColor: "#c4b5fd",
          bodyColor: "#e0e7ff",
          padding: 12,
          displayColors: true,
          boxWidth: 10, boxHeight: 10,
          callbacks: { label: (c) => `  ${c.dataset.label}: ${c.raw ?? "—"}` },
        },
      },
    },
  });
}

/* ============================================================
   KEY QUESTIONS RENDERER
   ============================================================ */

function renderKeyQuestions(scores, trendIntelligence) {
  const { burnout_trajectory, workload_feasibility, focus_windows, intelligence_brief } = scores;

  if (burnout_trajectory) {
    const urgency = burnout_trajectory.urgency || "low";
    const qItem = document.getElementById("q-burnout");
    if (qItem) qItem.className = `question-item urgency-${urgency}`;
    const answerClass =
      urgency === "critical" ? "answer-critical" :
      urgency === "high"     ? "answer-high" :
      urgency === "moderate" ? "answer-moderate" : "answer-ok";
    const aEl = document.getElementById("qa-burnout");
    const rEl = document.getElementById("qr-burnout");
    if (aEl) { aEl.textContent = burnout_trajectory.answer; aEl.className = `question-a ${answerClass}`; }
    if (rEl) rEl.textContent = burnout_trajectory.reason;
  }

  if (workload_feasibility) {
    const aEl = document.getElementById("qa-workload");
    const rEl = document.getElementById("qr-workload");
    const qItem = document.getElementById("q-workload");
    const answerClass = workload_feasibility.feasible ? "answer-ok" : "answer-high";
    if (aEl) { aEl.textContent = workload_feasibility.answer; aEl.className = `question-a ${answerClass}`; }
    if (rEl) rEl.textContent = workload_feasibility.reason;
    if (qItem && !workload_feasibility.feasible) qItem.className = "question-item urgency-high";
  }

  if (focus_windows) {
    const aEl = document.getElementById("qa-focus");
    const rEl = document.getElementById("qr-focus");
    if (aEl) { aEl.textContent = focus_windows.peak; aEl.className = "question-a answer-ok"; }
    if (rEl) rEl.textContent = `Recovery window: ${focus_windows.recovery}`;
  }

  const perfEl     = document.getElementById("qa-performance");
  const perfReason = document.getElementById("qr-performance");
  if (perfEl) {
    if (trendIntelligence && trendIntelligence.length) {
      const top = trendIntelligence[0];
      const color = top.concerning ? "answer-high" : "answer-ok";
      perfEl.textContent = `${top.metric} ${top.direction} ${top.pct_change}%`;
      perfEl.className = `question-a ${color}`;
      if (perfReason && trendIntelligence[1]) perfReason.textContent = trendIntelligence[1].text;
      else if (perfReason) perfReason.textContent = top.text;
    } else {
      perfEl.textContent = "Insufficient trend data.";
      perfEl.className = "question-a";
      if (perfReason) perfReason.textContent = "Check in daily for 3+ days to enable trend analysis.";
    }
  }

  if (intelligence_brief) {
    const aEl = document.getElementById("qa-tomorrow");
    const rEl = document.getElementById("qr-tomorrow");
    if (aEl) { aEl.textContent = intelligence_brief.recommended_action; aEl.className = "question-a"; }
    if (rEl) rEl.textContent = `Primary risk today: ${intelligence_brief.primary_risk}`;
  }
}

/* ============================================================
   INTELLIGENCE SUMMARY (replaces Gemini API call)
   Deterministic advisory text generated from scored payload.
   ============================================================ */

function renderInsight(scores) {
  const textEl  = document.getElementById("ai-insight-text");
  const modelEl = document.getElementById("ai-model-badge");
  if (!textEl) return;
  textEl.textContent = computeLocalInsight(scores);
  if (modelEl) modelEl.textContent = "Deterministic · Advisory Only";
}

/* ============================================================
   ANIMATION HELPERS
   ============================================================ */

function animateNumber(id, target, duration = 1000) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  (function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * ease);
    if (t < 1) requestAnimationFrame(tick);
  })(performance.now());
}

function animateNumberSuffix(id, target, suffix, duration = 1000) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  (function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * ease) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  })(performance.now());
}

function animateBar(id, target, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.background = color;
  el.style.transition = "width 1s cubic-bezier(0.25,0.46,0.45,0.94)";
  el.style.width = `${target}%`;
}

function barColor(v) {
  if (v >= 70) return "#10b981";
  if (v >= 50) return "#f59e0b";
  return "#ef4444";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ============================================================
   INIT
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initParticles();
  initCheckinPage();
  initDashboard();
});
