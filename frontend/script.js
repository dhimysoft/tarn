// TARN — Wellness Reflection Platform
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

// Minimum distinct days of check-ins before any trend, streak-based or
// day-over-day claim is shown. Below this there is not enough data to make a
// comparison that means anything.
const MIN_HISTORY_DAYS = 3;

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
  // A signal is only named here when it is an actual NEGATIVE contributor in
  // computeExplanation(), which scores every signal against a neutral midpoint
  // of 5. These thresholds previously ran ahead of the score: sleep 6 is
  // "Above Avg" and contributes +3, yet it was reported as "below-optimal
  // sleep" — the reflection contradicted the breakdown directly above it.
  if (signals.stress >= 7)       reasons.push("elevated stress");
  else if (signals.stress === 6) reasons.push("moderate stress");
  if (signals.sleep  <= 3)       reasons.push("insufficient sleep");
  else if (signals.sleep === 4)  reasons.push("below-optimal sleep");
  if (signals.mood   <= 4)       reasons.push("low mood");
  if (burnout_risk === "Low")
    return "Your recent check-ins show stress and rest in a steady range.";
  if (!reasons.length)
    return `Your recent check-ins show a ${burnout_risk.toLowerCase()} stress pattern. This is based only on what you reported.`;
  return `You reported ${reasons.join(" and ")}. This describes your entries, not a health assessment.`;
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
  // A break needs a full hour that still ends by the cutoff. Later than that
  // there is no sensible window to suggest, and formatHour() clamps anything
  // past 23 back to 23 — which rendered "11:00 PM – 11:00 PM", a zero-length window.
  const BREAK_CUTOFF_HOUR = 23;
  const breakStart = (hour < 12) ? 13 : Math.max(hour + 1, 13);
  const break_window = (breakStart + 1 <= BREAK_CUTOFF_HOUR)
    ? `${formatHour(breakStart)} – ${formatHour(breakStart + 1)}`
    : "Wind down — rest is your next step";
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

/* ─────────────────────────────────────────────────────────────────────────
   REMOVED: computeConfidence() and buildConfidenceReason().

   The old dashboard showed a "Confidence" percentage with a progress bar. It
   was not a confidence interval or any statistical quantity — it began at a
   hardcoded 65 and moved with the length of your check-in streak:

       let score = 65;
       score += Math.round((streak / 7) * 15);

   Presenting that next to a wellness summary tells someone their reading is
   "68% reliable". Nothing supported it, so it is deleted rather than renamed —
   there is no honest version of a fabricated confidence figure.

   See docs/CLAIMS_REGISTER.md.
   ───────────────────────────────────────────────────────────────────────── */

function computeIntelligenceBrief(signals, scores, explanation) {
  const positives = explanation.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
  const negatives = explanation.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta);
  const primary_strength = positives.length
    ? `${positives[0].label} (contributing +${positives[0].delta} to your score)`
    : "Consistent daily tracking";
  const primary_risk = negatives.length
    ? `${negatives[0].label} (dragging score by ${negatives[0].delta})`
    : "Nothing to flag today";
  const hour = new Date().getHours();
  let recommended_action;
  if (scores.focus_readiness >= 70 && hour < 13) {
    recommended_action = "You reported high focus — you may want to use the morning for demanding work";
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
    return { id: "Recovery Protocol B", trigger: "You reported very high stress", priority: "critical" };
  if (burnout_risk === "High" && recovery_index < 50)
    return { id: "Recovery Protocol B", trigger: "You reported high stress and low rest", priority: "high" };
  if (signals.stress >= 7 || burnout_risk === "High")
    return { id: "Stress Management Protocol A", trigger: "Elevated chronic stress pattern", priority: "high" };
  if (wellness_score >= 80 && focus_readiness >= 75)
    return { id: "Optimal Performance Protocol", trigger: "You reported feeling well and focused", priority: "low" };
  if (focus_readiness >= 75)
    return { id: "Focus Optimization Protocol", trigger: "You reported strong focus", priority: "low" };
  if (wellness_score >= 80)
    return { id: "Maintenance Protocol", trigger: "Strong baseline wellness", priority: "low" };
  return { id: "Stability Protocol", trigger: "Balanced signal baseline", priority: "low" };
}

function buildRecommendations(signals, scores) {
  const hour = new Date().getHours();
  const { burnout_risk, recovery_index, focus_readiness } = scores;
  const pool = [];
  if (signals.sleep <= 3)
    pool.push({ icon: "💤", title: "Address Sleep Deficit", body: "Sleep debt compounds daily. Even one extra hour tonight will measurably improve tomorrow's wellness and focus scores." });
  else if (signals.sleep === 4)
    pool.push({ icon: "🌙", title: "Optimize Sleep Window", body: "Sleep is slightly below optimal. A consistent sleep schedule — same time each night — improves recovery quality more than total hours alone." });
  if (signals.stress >= 7)
    pool.push({ icon: "🧘", title: "Activate Recovery Mode", body: "Stress is in the high range. Schedule a deliberate 10-minute break every 90 minutes. Sustained high stress accelerates burnout faster than workload alone." });
  else if (signals.stress === 6)
    pool.push({ icon: "🌿", title: "Reduce Cognitive Load", body: "Moderate stress detected. Batch similar tasks together and defer low-priority decisions — cognitive switching cost adds up under stress." });
  if (burnout_risk === "Critical" || burnout_risk === "High")
    pool.push({ icon: "⚠️", title: "Current Stress Pattern Is Elevated", body: "Multiple compounding stress factors are active simultaneously. Protect recovery time today — reduce discretionary commitments and prioritize sleep tonight." });
  if (focus_readiness >= 75 && hour >= 8 && hour <= 11)
    pool.push({ icon: "🎯", title: "Peak Focus Window — Act Now", body: "You reported strong focus this morning window. Tackle your most cognitively demanding task in the next 90 minutes before the afternoon dip arrives." });
  else if (focus_readiness >= 70)
    pool.push({ icon: "🎯", title: "High Self-Reported Focus", body: "Your cognitive resources are strong right now. Use this window for deep work — analysis, writing, or complex problem-solving." });
  else if (focus_readiness < 45)
    pool.push({ icon: "🔄", title: "Route to Lower-Demand Tasks", body: "You reported lower focus today. You may want to consider administrative, routine, or collaborative work to this period — save demanding tasks for when readiness recovers." });
  if (signals.energy <= 4)
    pool.push({ icon: "⚡", title: "Restore Energy — Movement Over Caffeine", body: "Energy is depleted. A 20-minute walk or 10 minutes of movement is more effective at this level than caffeine, which may increase anxiety." });
  if (recovery_index < 50)
    pool.push({ icon: "🔋", title: "Recovery Is Insufficient", body: "You reported lower rest than usualoration between sessions. Prioritize passive recovery: no screens before bed, hydration, and an earlier sleep time." });
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
        : `Your recent entries show a ${burnout_risk.toLowerCase()} stress pattern.`,
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

/* How does today's workload feel?

   REPLACES computeEngineWorkloadFeasibility(), which told users how many hours
   they could work:

       const sustainableHours = capacity >= 78 ? 8 : capacity >= 62 ? 6 : ... ;
       "Wellness signals support approximately 4 focused hours today."

   That is a prediction about a person's capacity derived from five slider
   positions. It has no evidential basis and is exactly the claim a wellness
   product must not make.

   This version asserts nothing about capacity. It reflects back what the user
   entered, compares it only to their OWN recent average, and leaves the
   judgement with them. */
function describeWorkload(workload_hours, history) {
  if (!workload_hours || workload_hours === 0) {
    return {
      answer: "No study or work hours entered today.",
      reason: "Add them on your next check-in if you would like to see them here.",
    };
  }

  // Compare only against this user's own recent entries — never a population norm.
  const priorHours = (history || [])
    .map((h) => h?.context?.workload_hours)
    .filter((n) => typeof n === "number" && n > 0);

  if (priorHours.length < 3) {
    return {
      answer: `You planned ${workload_hours} ${workload_hours === 1 ? "hour" : "hours"} today.`,
      reason: "After a few more check-ins you will be able to see how this compares with your own usual pattern.",
    };
  }

  const average = priorHours.reduce((a, b) => a + b, 0) / priorHours.length;
  const rounded = Math.round(average * 10) / 10;
  const difference = workload_hours - average;

  let comparison;
  if (Math.abs(difference) < 1) {
    comparison = `That is close to your recent average of ${rounded} hours.`;
  } else if (difference > 0) {
    comparison = `That is more than your recent average of ${rounded} hours.`;
  } else {
    comparison = `That is less than your recent average of ${rounded} hours.`;
  }

  return {
    answer: `You planned ${workload_hours} ${workload_hours === 1 ? "hour" : "hours"} today.`,
    reason: `${comparison} Only you can judge how that feels alongside how you are doing today.`,
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
  const intelligence_brief = computeIntelligenceBrief(signals, scores, explanation);
  const trend_intelligence = computeEngineTrendIntelligence(context.history || []);
  const burnout_trajectory = computeEngineBurnoutTrajectory(burnout_risk, trend_intelligence);
  const workload_reflection = describeWorkload(context.workload_hours || 0, context.history || []);
  const protocol           = computeProtocol(signals, scores);
  const recommendations    = buildRecommendations(signals, scores);

  return {
    ...scores,
    focus_windows,
    explanation,
    intelligence_brief,
    trend_intelligence,
    burnout_trajectory,
    workload_reflection,
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
    parts.push(`Your recent entries show a ${burnout_risk.toLowerCase()} stress pattern, based only on what you reported.`);
  } else if (recovery_index >= 70) {
    parts.push(`Your rest and recovery check-in is ${recovery_index}/100 — a summary of the sleep, stress and mood values you entered.`);
  } else if (recovery_index < 50) {
    parts.push(`Your rest and recovery check-in is ${recovery_index}/100. You may want to consider what would help you rest.`);
  } else {
    parts.push(`Recovery capacity is moderate — consistent sleep timing will compound positively over the next 2–3 days.`);
  }

  if (focus_readiness >= 70) {
    parts.push("You reported feeling focused today.");
  } else if (delta != null && delta >= 5) {
    parts.push(`Wellness improved ${delta} points from the previous session — maintain current patterns.`);
  } else if (delta != null && delta <= -5) {
    parts.push(`Wellness declined ${Math.abs(delta)} points — monitor sleep and stress signals over the next 2 days.`);
  } else {
    parts.push(`Track signals over the next 2–3 days to build your wellness pattern history.`);
  }

  return parts.join(" ");
}

/* ============================================================
   LOCAL STORAGE
   ============================================================ */

const STORAGE_KEY = "tarn_sessions_v2";
const LEGACY_STORAGE_KEY = "aura_sessions_v2"; // the old name: carried over once, then removed

function getSessions() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw !== null) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    return JSON.parse(raw || "[]");
  } catch { return []; }
}

function saveSessions(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function getTodaySession() { return getSessions().find((s) => s.date === getTodayStr()) || null; }

function saveTodaySession(data) {
  const all = getSessions().filter((s) => s.date !== getTodayStr());
  all.unshift({ date: getTodayStr(), timestamp: Date.now(), ...data });
  saveSessions(all.slice(0, 30));
}

// The app has no name field yet. If one is added, write it to this key and the
// greeting picks it up; with no name stored the greeting renders without a comma.
function getUserName() {
  try { return (localStorage.getItem("tarn_user_name") || "").trim(); }
  catch { return ""; }
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
    // Read the colour from the theme token instead of hardcoding it, so the
    // particles dim correctly in light mode rather than staying near-invisible.
    ctx.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--particle").trim() ||
      "rgba(139,92,246,0.11)";
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
  if (el) {
    const timeOfDay = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const name = getUserName();
    // The comma belongs to the name, not to the greeting. It used to be
    // hardcoded in index.html and was left dangling as "Good evening,".
    el.textContent = name ? `${timeOfDay}, ${name}` : timeOfDay;
  }

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
  // Consistency can only be measured once there is a history to measure it
  // against. Below MIN_HISTORY_DAYS it stays at the neutral midpoint of 5,
  // which contributes exactly 0 in computeExplanation() — a new user is no
  // longer penalised for not yet having a streak.
  const historyDays = getSessions().filter((x) => x.date !== getTodayStr()).length + 1;
  const consistency = historyDays >= MIN_HISTORY_DAYS
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
    explanation, intelligence_brief, focus_windows,
    trend_intelligence, burnout_trajectory, workload_reflection, protocol,
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

  // Where "-5 from yesterday" came from on a day-1 streak: `prior` in
  // handleCheckin() is simply the most recent session that is not today, at ANY
  // age. Leftover check-ins from earlier testing sit in localStorage for 30
  // days, so a fresh streak still found a "prior" score days or weeks old and
  // labelled the difference "yesterday". The comparison is now withheld until
  // MIN_HISTORY_DAYS and no longer claims to know when the last one was.
  const deltaEl = document.getElementById("score-delta");
  const dayCount = getSessions().length;
  if (dayCount < MIN_HISTORY_DAYS) {
    deltaEl.textContent = "Check in a few more days to see your patterns";
    deltaEl.className = "score-delta neutral";
  } else if (delta != null) {
    deltaEl.textContent = `${delta >= 0 ? "+" : ""}${delta} pts from your last check-in`;
    deltaEl.className = `score-delta ${delta >= 0 ? "positive" : "negative"}`;
  } else {
    deltaEl.textContent = "First session"; deltaEl.className = "score-delta neutral";
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

  // ── Wellness Summary ───────────────────────────────────
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

  // ── Wellness Pattern History Section ────────────────────────────
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
  // Same gate as the delta chip — the narrative must not narrate a
  // comparison the dashboard is withholding, nor call an older session
  // "yesterday".
  if (delta != null && getSessions().length >= MIN_HISTORY_DAYS) {
    if (delta >= 5)
      parts.push(`Wellness improved <strong>+${delta} pts</strong> since your last check-in — a meaningful positive shift.`);
    else if (delta <= -5)
      parts.push(`Wellness declined <strong>${delta} pts</strong> since your last check-in. If this continues for 2+ days, consider adjusting your schedule.`);
    else if (delta !== 0)
      parts.push(`Score is stable (${delta > 0 ? "+" : ""}${delta} pts from your last check-in).`);
  }
  if (focus_readiness >= 75)
    parts.push("You reported feeling focused today.");
  else if (focus_readiness < 45)
    parts.push("You reported lower focus today. You may want to consider lighter tasks.");
  if (recovery_index < 50)
    parts.push("Your reported rest has been lower than usual. You may want to consider an earlier night.");
  return parts.join(" ");
}

/* ============================================================
   TREND INTELLIGENCE ENGINE
   ============================================================ */

const BURNOUT_NUM = { Low: 20, Moderate: 50, High: 72, Critical: 92 };

function computeTrendSummary(sessions) {
  if (sessions.length < MIN_HISTORY_DAYS) return null;

  // Recent and baseline must not overlap. The previous split compared
  // sessions.slice(0, 3) against [the oldest session] — with exactly three
  // check-ins the "recent" window CONTAINED the baseline, so one low early
  // score made every metric look like a huge gain ("Wellness +70%" on day 3).
  const split    = Math.max(1, Math.floor(sessions.length / 2));
  const recent   = sessions.slice(0, split);
  const baseline = sessions.slice(split);

  const avg = (arr, fn) => {
    const vals = arr.map(fn).filter((v) => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  // Absolute point difference, not percent change. A percentage taken over a
  // handful of self-reported scores is unstable and implies a precision the
  // data does not have — a stress baseline of 20 moving to 40 reads "+100%".
  const pts = (r, o) => (r == null || o == null) ? null : Math.round(r - o);

  const wellnessPts = pts(avg(recent,   (x) => x?.scores?.wellness_score),
                          avg(baseline, (x) => x?.scores?.wellness_score));
  const recoveryPts = pts(avg(recent,   (x) => x?.scores?.recovery_index),
                          avg(baseline, (x) => x?.scores?.recovery_index));
  const focusPts    = pts(avg(recent,   (x) => x?.scores?.focus_readiness),
                          avg(baseline, (x) => x?.scores?.focus_readiness));
  const burnoutPts  = pts(avg(recent,   (x) => BURNOUT_NUM[x?.scores?.burnout_risk] ?? null),
                          avg(baseline, (x) => BURNOUT_NUM[x?.scores?.burnout_risk] ?? null));

  // Primary Insight is derived from exactly the values the chips render, so the
  // two can no longer disagree. The old version picked its label from a
  // fallback chain that ended at "Focus" regardless of what focus actually did
  // — which is how "Focus is declining" appeared beside a Focus chip of +82%.
  const metrics = [
    { label: "Wellness",               pts: wellnessPts, invert: false },
    { label: "Recovery",               pts: recoveryPts, invert: false },
    { label: "Focus",                  pts: focusPts,    invert: false },
    { label: "Current Stress Pattern", pts: burnoutPts,  invert: true  },
  ];
  const MOVED_PTS = 3;
  const moved = metrics.filter((m) => m.pts != null && Math.abs(m.pts) >= MOVED_PTS);

  let primaryInsight;
  if (!moved.length) {
    primaryInsight = "Your self-reported signals are holding steady.";
  } else {
    const top  = moved.reduce((a, b) => (Math.abs(b.pts) > Math.abs(a.pts) ? b : a));
    const good = top.invert ? top.pts < 0 : top.pts > 0;
    const dir  = top.invert ? (good ? "easing" : "rising")
                            : (good ? "improving" : "declining");
    const sign = top.pts > 0 ? "+" : "";
    primaryInsight = `${top.label} is ${dir} — ${sign}${top.pts} pts versus your earlier check-ins.`;
  }

  return { wellnessPts, recoveryPts, focusPts, burnoutPts, primaryInsight };
}

function computeWhyThisTrend(sessions, serverInsights) {
  if (sessions.length < MIN_HISTORY_DAYS) return [];
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
    // Descriptive only: "alongside", never "due to". Two self-reported numbers
    // moving together is not evidence that one caused the other
    // (docs/CLAIMS_REGISTER.md: correlation only, never causal).
    if (recovPct > 5) {
      const reason = sleepPct > 5 ? "higher sleep ratings" : stressPct < -5 ? "lower stress ratings" : "better sleep and stress ratings";
      explanations.push({ type: "positive", text: `Your rest check-in went up, alongside ${reason}.` });
    } else {
      const reason = sleepPct < -5 ? "lower sleep ratings" : stressPct > 5 ? "higher stress ratings" : "lower sleep and higher stress ratings";
      explanations.push({ type: "negative", text: `Your rest check-in went down, alongside ${reason}.` });
    }
  }

  const focusPct = pctOf(avgScore(recent, "focus_readiness"), avgScore(baseline, "focus_readiness"));
  if (Math.abs(focusPct) > 5) {
    const energyPct = pctOf(avgSig(recent, "energy"), avgSig(baseline, "energy"));
    if (focusPct > 5) {
      const reason = energyPct > 5 ? "higher energy levels" : "reduced stress and better sleep";
      explanations.push({ type: "positive", text: `You reported better focus, alongside ${reason}.` });
    } else {
      explanations.push({ type: "negative", text: "You reported lower focus, energy and sleep than before." });
    }
  }

  const rBurn = recent.map((s) => BURNOUT_NUM[s?.scores?.burnout_risk]).filter((v) => v != null);
  const oBurn = baseline.map((s) => BURNOUT_NUM[s?.scores?.burnout_risk]).filter((v) => v != null);
  if (rBurn.length && oBurn.length) {
    const avgRB = rBurn.reduce((a, b) => a + b, 0) / rBurn.length;
    const avgOB = oBurn.reduce((a, b) => a + b, 0) / oBurn.length;
    const burnPct = pctOf(avgRB, avgOB);
    if (burnPct < -10)
      explanations.push({ type: "positive", text: "You reported steadier workload and stress than in earlier entries." });
    else if (burnPct > 10)
      explanations.push({ type: "negative", text: "You have reported higher stress across several recent check-ins." });
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

  if (count < MIN_HISTORY_DAYS) {
    container.className = "trend-block";
    container.innerHTML = `
      <div class="block-title">Wellness Pattern History</div>
      <div class="trend-empty">
        <div class="trend-empty-icon">📊</div>
        <div class="trend-empty-title">Check in a few more days to see your patterns.</div>
        <p class="trend-empty-msg">Complete ${MIN_HISTORY_DAYS} daily check-ins to unlock:</p>
        <ul class="trend-unlock-list">
          <li>Wellness Trends</li>
          <li>Wellness Pattern History</li>
          <li>Recovery Analytics</li>
          <li>Focus Intelligence</li>
        </ul>
        <div class="trend-gate-progress">
          <div class="trend-gate-label">Data points collected: <strong>${count} of ${MIN_HISTORY_DAYS}</strong></div>
          <div class="trend-gate-bar-wrap">
            <div class="trend-gate-bar-fill" style="width:${Math.round((count / MIN_HISTORY_DAYS) * 100)}%"></div>
          </div>
        </div>
      </div>`;
    return;
  }

  const summary = computeTrendSummary(sessionsFwd);
  const why     = computeWhyThisTrend(sessionsFwd, serverInsights);

  const pillData = [
    { label: "Wellness",               pts: summary.wellnessPts, invert: false },
    { label: "Recovery",               pts: summary.recoveryPts, invert: false },
    { label: "Focus",                  pts: summary.focusPts,    invert: false },
    { label: "Current Stress Pattern", pts: summary.burnoutPts,  invert: true  },
  ];

  const pillsHTML = pillData.map(({ label, pts, invert }) => {
    if (pts == null) return "";
    const good  = invert ? pts < 0 : pts > 0;
    const flat  = pts === 0;
    const cls   = flat ? "pill-flat" : good ? "pill-good" : "pill-bad";
    const arrow = pts > 0 ? "↑" : pts < 0 ? "↓" : "→";
    const sign  = pts > 0 ? "+" : "";
    return `<div class="trend-pill ${cls}">
      <span class="pill-arrow">${arrow}</span>
      <span class="pill-label">${label}</span>
      <span class="pill-pct">${sign}${pts} pts</span>
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
    <div class="block-title">Wellness Pattern History</div>
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
      <span class="legend-dot" style="background:#ef4444"></span>Current Stress Pattern
    </div>
    <canvas id="trend-chart" height="180"></canvas>
    ${whyHTML}`;

  renderTrendChart();
}

// Chart.js draws on a canvas, so it cannot see the page's CSS colours. Read them
// at draw time so the axis text matches the current theme, and redraw when the
// theme switch is pressed.
function chartColors() {
  const root = document.documentElement;
  const explicit = root.getAttribute("data-theme");
  const light = explicit ? explicit === "light" : window.matchMedia("(prefers-color-scheme: light)").matches;
  const css = getComputedStyle(root);
  return {
    tick: css.getPropertyValue("--text-3").trim() || (light ? "#51456d" : "#bdb2dc"),
    grid: light ? "rgba(36,22,64,0.12)" : "rgba(255,255,255,0.09)",
    pointRim: light ? "rgba(255,255,255,0.95)" : "rgba(7,3,22,0.8)",
  };
}

function renderTrendChart() {
  const ctx = document.getElementById("trend-chart");
  if (!ctx) return;
  if (!window._trendThemeWired) {
    window._trendThemeWired = true;
    const toggle = document.getElementById("theme-toggle");
    if (toggle) toggle.addEventListener("click", () => setTimeout(renderTrendChart, 60));
  }
  const colors = chartColors();

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
    tension: 0, // straight lines: a smooth curve would imply data between check-ins that does not exist
    fill: false,
    pointBackgroundColor: color,
    pointBorderColor: chartColors().pointRim,
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

  // The x axis lists check-ins one after another, not days on a calendar. If
  // days were skipped, say so rather than let the spacing imply otherwise.
  const oldNote = document.getElementById("trend-gap-note");
  if (oldNote) oldNote.remove();
  const gapDays = sessions.slice(1).map((s, i) => (new Date(s.date) - new Date(sessions[i].date)) / 86400000);
  if (gapDays.some((d) => d > 3)) {
    ctx.insertAdjacentHTML("afterend", '<p id="trend-gap-note" class="trend-gap-note">Days without a check-in are skipped, so the points are not evenly spaced in time.</p>');
  }

  if (window._trendChart) { window._trendChart.destroy(); window._trendChart = null; }

  window._trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        mkDataset("Wellness",     wellnessData, "#8b5cf6"),
        mkDataset("Recovery",     recoveryData, "#10b981"),
        mkDataset("Focus",        focusData,    "#0ea5e9"),
        mkDataset("Current Stress Pattern", burnoutData,  "#ef4444", true),
      ],
    },
    options: {
      responsive: true,
      animation: { duration: 1000, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { color: colors.tick, stepSize: 25, font: { size: 13 } },
          grid: { color: colors.grid, drawBorder: false },
          border: { display: false },
        },
        x: {
          ticks: { color: colors.tick, font: { size: 13 }, maxRotation: 0 },
          grid: { color: colors.grid, drawBorder: false },
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
  const { burnout_trajectory, workload_reflection, focus_windows, intelligence_brief } = scores;

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

  if (workload_reflection) {
    const aEl = document.getElementById("qa-workload");
    const rEl = document.getElementById("qr-workload");
    // Deliberately no urgency styling and no ok/high colour. This card describes
    // what you entered; it does not grade it, so nothing here should read as a
    // verdict on whether your day is achievable.
    if (aEl) { aEl.textContent = workload_reflection.answer; aEl.className = "question-a"; }
    if (rEl) rEl.textContent = workload_reflection.reason;
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

  // The built-in text is shown at once, so the page never waits on a network
  // call and never shows an empty box. It is also what stays if the AI is off,
  // over its limit, unreachable, or says something the safety rules reject.
  textEl.textContent = computeLocalInsight(scores);
  if (modelEl) modelEl.textContent = "Built-in · Advisory Only";

  fetchAiInsight(scores).then((ai) => {
    if (!ai) return;
    textEl.textContent = ai.insight;
    if (modelEl) modelEl.textContent = "AI-generated · Gemini · Advisory Only";
  });
}

// Asks the server for a Gemini reflection. Only numbers and category names are
// sent: nothing you typed ever leaves this page. Resolves to null on ANY problem.
async function fetchAiInsight(scores) {
  if (!/^https?:$/.test(location.protocol)) return null;
  try {
    const res = await fetch("/api/wellness/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wellness_score: scores.wellness_score,
        tier: scores.tier,
        burnout_risk: scores.burnout_risk,
        recovery_index: scores.recovery_index,
        focus_readiness: scores.focus_readiness,
        delta: scores.delta ?? null,
      }),
      signal: AbortSignal.timeout(16000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.source === "gemini" && typeof data.insight === "string" && data.insight ? data : null;
  } catch (_) {
    return null;
  }
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
