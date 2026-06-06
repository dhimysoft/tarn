// AURA Intelligence — Wellness Intelligence Platform
// Powered by DHIMLUX Labs · Author: Dhimy Jean
//
// Principle: AI provides insights. The platform makes recommendations.

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

async function handleCheckin(e) {
  e.preventDefault();
  const btn = document.getElementById("analyze-btn");
  btn.textContent = "Analyzing..."; btn.disabled = true;

  const streak = getStreak();
  const consistency = streak > 0 ? Math.min(10, Math.max(1, Math.round((Math.min(streak, 7) / 7) * 9) + 1)) : 5;

  const signals = {
    sleep:       parseInt(document.getElementById("sleep-slider").value),
    stress:      parseInt(document.getElementById("stress-slider").value),
    mood:        parseInt(document.getElementById("mood-slider").value),
    energy:      parseInt(document.getElementById("energy-slider").value),
    focus:       parseInt(document.getElementById("focus-slider").value),
    consistency,
  };

  const study   = parseInt(document.getElementById("study-input").value) || 0;
  const work    = parseInt(document.getElementById("work-input").value)  || 0;
  const sessions = getSessions();
  const prior   = sessions.find((s) => s.date !== getTodayStr());

  const context = {
    workload_hours: study + work,
    hour: new Date().getHours(),
    prior_score: prior?.scores?.wellness_score ?? null,
    streak,
    history_length: sessions.length,
    history: sessions.slice(0, 7),
  };

  try {
    const res = await fetch("/api/wellness/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signals, context }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const scores = await res.json();
    saveTodaySession({ signals, scores, recommendations: scores.recommendations });
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    btn.textContent = "Analyze My Wellness →"; btn.disabled = false;
    let errEl = document.getElementById("checkin-error");
    if (!errEl) {
      errEl = document.createElement("div");
      errEl.id = "checkin-error"; errEl.className = "error-toast";
      document.querySelector(".checkin-card").prepend(errEl);
    }
    errEl.textContent = "Could not reach the server. Make sure it's running on port 5001.";
  }
}

/* ============================================================
   DASHBOARD PAGE
   ============================================================ */

function initDashboard() {
  if (!document.getElementById("dashboard-root")) return;

  const session = getTodaySession();
  if (!session) { window.location.href = "index.html"; return; }

  renderDashboard(session);
  fetchAndRenderInsight(session.scores);
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
    const pct    = Math.round((Math.abs(c.delta) / maxDelta) * 100);
    const sign   = c.delta > 0 ? "+" : c.delta < 0 ? "" : "±";
    const cls    = c.delta > 0 ? "positive" : c.delta < 0 ? "negative" : "zero";
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

  // Burnout text comes from server's engine
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
   All computations are deterministic. No AI required.
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
  const burnoutPct  = pct(rB, oB);  // positive = risk increased (bad)

  const improving = [wellnessPct, recoveryPct, focusPct].filter((p) => p != null && p > 3).length;
  const declining = [wellnessPct, recoveryPct, focusPct].filter((p) => p != null && p < -3).length;
  const burnoutImproving = burnoutPct != null && burnoutPct < -5;
  const burnoutWorsening = burnoutPct != null && burnoutPct > 5;

  let primaryInsight;
  if (improving >= 2 && burnoutImproving) {
    primaryInsight = "Multiple wellness metrics are trending positively with declining burnout risk.";
  } else if (recoveryPct != null && recoveryPct > 3 && burnoutImproving) {
    primaryInsight = "Recovery is improving while burnout risk continues to decline.";
  } else if (declining >= 2 || burnoutWorsening) {
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

  const rRecov = avgScore(recent, "recovery_index");
  const oRecov = avgScore(baseline, "recovery_index");
  const recovPct = pctOf(rRecov, oRecov);
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

  const rFocus = avgScore(recent, "focus_readiness");
  const oFocus = avgScore(baseline, "focus_readiness");
  const focusPct = pctOf(rFocus, oFocus);
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
   Handles empty state and full analytics view.
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
          callbacks: {
            label: (c) => `  ${c.dataset.label}: ${c.raw ?? "—"}`,
          },
        },
      },
    },
  });
}

/* ============================================================
   KEY QUESTIONS RENDERER
   ============================================================ */

function renderKeyQuestions(scores, trendIntelligence) {
  const {
    burnout_trajectory, workload_feasibility, focus_windows,
    intelligence_brief,
  } = scores;

  // Q1 — Burnout trajectory
  if (burnout_trajectory) {
    const urgency = burnout_trajectory.urgency || "low";
    const qItem = document.getElementById("q-burnout");
    if (qItem) {
      qItem.className = `question-item urgency-${urgency}`;
    }
    const answerClass =
      urgency === "critical" ? "answer-critical" :
      urgency === "high"     ? "answer-high" :
      urgency === "moderate" ? "answer-moderate" : "answer-ok";
    const aEl = document.getElementById("qa-burnout");
    const rEl = document.getElementById("qr-burnout");
    if (aEl) { aEl.textContent = burnout_trajectory.answer; aEl.className = `question-a ${answerClass}`; }
    if (rEl) rEl.textContent = burnout_trajectory.reason;
  }

  // Q2 — Workload feasibility
  if (workload_feasibility) {
    const aEl = document.getElementById("qa-workload");
    const rEl = document.getElementById("qr-workload");
    const qItem = document.getElementById("q-workload");
    const answerClass = workload_feasibility.feasible ? "answer-ok" : "answer-high";
    if (aEl) { aEl.textContent = workload_feasibility.answer; aEl.className = `question-a ${answerClass}`; }
    if (rEl) rEl.textContent = workload_feasibility.reason;
    if (qItem && !workload_feasibility.feasible) qItem.className = "question-item urgency-high";
  }

  // Q3 — When should I focus?
  if (focus_windows) {
    const aEl = document.getElementById("qa-focus");
    const rEl = document.getElementById("qr-focus");
    if (aEl) { aEl.textContent = focus_windows.peak; aEl.className = "question-a answer-ok"; }
    if (rEl) rEl.textContent = `Recovery window: ${focus_windows.recovery}`;
  }

  // Q4 — Why is my performance changing?
  const perfEl = document.getElementById("qa-performance");
  const perfReason = document.getElementById("qr-performance");
  if (perfEl) {
    if (trendIntelligence && trendIntelligence.length) {
      const top = trendIntelligence[0];
      const color = top.concerning ? "answer-high" : "answer-ok";
      perfEl.textContent = `${top.metric} ${top.direction} ${top.pct_change}%`;
      perfEl.className = `question-a ${color}`;
      if (perfReason && trendIntelligence[1]) {
        perfReason.textContent = trendIntelligence[1].text;
      } else if (perfReason) {
        perfReason.textContent = top.text;
      }
    } else {
      perfEl.textContent = "Insufficient trend data.";
      perfEl.className = "question-a";
      if (perfReason) perfReason.textContent = "Check in daily for 3+ days to enable trend analysis.";
    }
  }

  // Q5 — What should I adjust tomorrow?
  if (intelligence_brief) {
    const aEl = document.getElementById("qa-tomorrow");
    const rEl = document.getElementById("qr-tomorrow");
    if (aEl) { aEl.textContent = intelligence_brief.recommended_action; aEl.className = "question-a"; }
    if (rEl) rEl.textContent = `Primary risk today: ${intelligence_brief.primary_risk}`;
  }
}

/* ============================================================
   AI INSIGHT
   ============================================================ */

async function fetchAndRenderInsight(scores) {
  const textEl  = document.getElementById("ai-insight-text");
  const modelEl = document.getElementById("ai-model-badge");
  if (!textEl) return;

  textEl.textContent = "Generating insight...";

  try {
    const res  = await fetch("/api/wellness/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scores),
    });
    const data = await res.json();
    textEl.textContent = data.insight;
    if (modelEl) modelEl.textContent = data.model === "unavailable" ? "Unavailable" : "Gemini 2.0 · Advisory Only";
  } catch {
    textEl.textContent = "AI insight temporarily unavailable.";
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
