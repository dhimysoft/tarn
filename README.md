# TARN

**Wellness Intelligence Platform**

Originally developed during the BMCC AI Innovation Challenge 2025.
Independently re-architected and expanded into TARN by Dhimy Jean.
Powered by DHIMLUX Labs.

---

## Executive Summary

TARN converts six daily behavioral signals — sleep, stress, mood, energy, focus, and consistency — into a structured suite of deterministic wellness metrics. The platform surfaces these through an explainability layer, a confidence model, and an AI advisory insight system.

The result is a decision-support tool, not a tip generator. TARN answers questions that matter:

- Am I heading toward burnout?
- When should I do deep work today?
- Why is my productivity dropping?
- How is my wellness trending over the past week?

**Core principle:** AI provides insights. The platform makes recommendations. TARN does not diagnose, treat, or make health claims of any kind.

---

## Problem Statement

Students and professionals face compounding wellness challenges — chronic sleep debt, burnout cycles, fragmented recovery — yet most wellness tools are either too generic (daily affirmations) or too clinical (medical monitoring). There is no platform that:

- Quantifies wellness signals from subjective input
- Forecasts burnout before it peaks
- Explains *why* a score changed
- Separates AI inference from platform recommendations
- Scales with context (workload, time of day, streak history)

TARN fills this gap.

---

## Product Vision

TARN is the wellness intelligence layer between "how do you feel?" and "what should you actually do about it." It applies the same engineering rigor used across the DHIMLUX ecosystem — DHIMIX AI for music intelligence, BridgeAI for civic intelligence, DHIMLUX OS for workflow intelligence — to personal wellness.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER SIGNALS                                 │
│         Sleep · Stress · Mood · Energy · Focus · Consistency        │
│                       + Workload Context                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │  POST /api/wellness/score
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       WELLNESS ENGINE                               │
│         Deterministic scoring — fully auditable, no LLM             │
│                                                                     │
│   ┌──────────────┐  ┌───────────────┐  ┌──────────────┐            │
│   │ Wellness     │  │ Burnout Risk  │  │ Recovery     │            │
│   │ Score 0–100  │  │ Engine        │  │ Engine       │            │
│   │ + Tier       │  │ 3-Factor Gate │  │ 0–100        │            │
│   └──────────────┘  └───────────────┘  └──────────────┘            │
│                                                                     │
│   ┌──────────────┐  ┌───────────────┐  ┌──────────────┐            │
│   │ Focus        │  │ Explainability│  │ Confidence   │            │
│   │ Forecast     │  │ Layer         │  │ Layer        │            │
│   │ + Windows    │  │ Contributor Δ │  │ 0–100%       │            │
│   └──────────────┘  └───────────────┘  └──────────────┘            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AI INSIGHT LAYER                               │
│   Scored payload only → structured prompt → Gemini 2.0 Flash       │
│   Output: plain-language pattern summary (advisory only)            │
│   Model output does NOT influence scoring or recommendations        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   RECOMMENDATION LAYER                              │
│   Deterministic rules · time-aware · workload-aware · context-aware │
│   Intelligence Brief · Focus Windows · Ranked Recommendations       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DASHBOARD (HUMAN LAYER)                          │
│   Wellness Score · Burnout Risk · Recovery Index · Focus Readiness  │
│   Intelligence Brief · Why This Score? · 7-Day Trend · AI Insight  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## System Design Decisions

**1. Deterministic scoring in all critical paths.**
No LLM is involved in any scoring, burnout detection, or recommendation logic. Scores are reproducible, explainable, and not subject to model drift or hallucination.

**2. AI receives scored data only — never raw user input.**
The AI insight layer is passed a structured JSON payload of computed scores. It cannot interpret or reframe raw user-entered text. This prevents the model from producing clinical-sounding inferences from subjective input.

**3. Three-factor burnout gate.**
Burnout risk reaches "High" only when elevated stress AND sleep deficit AND sustained workload are all simultaneously present. A single stressful day does not trigger it. This prevents alarm fatigue.

**4. Explainability is computed, not described.**
The "Why This Score?" section derives contributor deltas mathematically from the scoring formula — it is not generated text. Each signal's delta from a neutral baseline (score = 50) is computed and displayed.

**5. Confidence is a function of data quality, not user sentiment.**
Confidence reflects streak length, history depth, and signal internal consistency. It decreases when signals contradict each other physiologically (e.g., 8h sleep + energy = 2).

**6. Afternoon dip is hardcoded.**
Focus readiness applies a 10% dip multiplier between 1–3 PM. Circadian science is well-established. Modeling this with ML would introduce variance without accuracy improvement.

**7. Separation of concerns across all layers.**
Signal ingestion → Wellness Engine → AI Insight → Recommendation Layer are strictly independent. No layer feeds results back into a prior layer.

---

## Wellness Engine

### Score Formula

```
WellnessScore = round((
  sleep       × 0.25 +
  mood        × 0.20 +
  energy      × 0.20 +
  focus       × 0.15 +
  (10–stress) × 0.15 +
  consistency × 0.05
) × 10)
```

Bounded: [0, 100]

### Tiers

| Range  | Tier     |
|--------|----------|
| 85–100 | Optimal  |
| 70–84  | Good     |
| 50–69  | Moderate |
| 30–49  | Low      |
| 0–29   | Critical |

### Explainability: Contributor Deltas

Each signal's deviation from a neutral baseline (all signals = 5 → score = 50):

```
sleepDelta        = round((sleep – 5) × 0.25 × 10)
moodDelta         = round((mood – 5) × 0.20 × 10)
energyDelta       = round((energy – 5) × 0.20 × 10)
focusDelta        = round((focus – 5) × 0.15 × 10)
stressDelta       = round((5 – stress) × 0.15 × 10)
consistencyDelta  = round((consistency – 5) × 0.05 × 10)
```

Sum of all deltas ≈ `wellness_score – 50`.

---

## Burnout Risk Engine

### 3-Factor Gate

All three conditions required for High/Critical classification:

| Factor         | Threshold     |
|----------------|---------------|
| Stress         | ≥ 7           |
| Sleep          | ≤ 5           |
| Workload hours | ≥ 8 hrs/day   |

| Conditions Met          | Risk Level |
|-------------------------|------------|
| All three               | Critical   |
| Stress + (Sleep or Load)| High       |
| Stress ≥ 5 + Sleep ≤ 6  | Moderate   |
| None                    | Low        |

### Explanation Text

The server generates a human-readable burnout explanation from signal values:

> "Burnout risk is high due to elevated stress and insufficient sleep."

---

## Recovery Engine

### Formula

```
RecoveryIndex = round((sleep × 0.50 + (10–stress) × 0.30 + mood × 0.20) × 10)
```

Bounded: [0, 100]. Weighted toward sleep quality as the primary recovery driver.

---

## Focus Forecast Engine

### Formula

```
FocusReadiness = round((
  sleep   × 0.35 +
  energy  × 0.30 +
  focus   × 0.25 +
  (10–stress) × 0.10
) × afternoonDip × 10)
```

`afternoonDip = 0.90` if `13:00 ≤ hour ≤ 15:00`, else `1.0`

### Focus Windows

Time-of-day windows generated from focus readiness and current hour:

- **Peak Focus Window** — when cognitive readiness is highest
- **Recommended Break** — optimal break timing to avoid diminishing returns
- **Recovery Window** — evening wind-down period

---

## Explainability Layer

The "Why This Score?" section shows each signal's contribution delta from the neutral baseline, sorted by absolute impact. Bars scale relative to the largest contributor.

This makes score changes transparent and traceable — users can see exactly which signal drove a change without reading a paragraph of text.

---

## Confidence Layer

```
confidence = 65                                   // base: all signals provided
           + min(streak, 7) / 7 × 15             // up to +15 for consistent tracking
           + min(history_length, 7) / 7 × 10     // up to +10 for historical depth
           ± signal_consistency_adjustment        // ±8 based on physiological coherence
```

Bounded: [50, 98]. A user's first check-in starts at ~65%. A week of consistent, coherent data reaches ~90%.

---

## Privacy & Ethics

**No medical claims.** TARN outputs are informational and advisory. The platform does not diagnose, treat, or replace professional health care. All AI-generated text is labeled "Advisory Only."

**Data minimization.** TARN does not collect biometrics, location, or passive behavioral data. Signals are self-reported.

**AI output boundaries.** The AI layer receives scored, structured data — not raw user input. Model outputs are advisory text only and do not influence scoring.

**Local persistence.** Wellness history is stored in the user's browser localStorage. No data is sent to external servers.

**Transparent scoring.** The scoring formula is published and auditable. Users can verify their score by hand.

---

## Tech Stack

| Layer      | Technology                                    |
|------------|-----------------------------------------------|
| Frontend   | HTML · CSS · JavaScript (→ Next.js + TS roadmap) |
| Backend    | Node.js · Express                             |
| AI Models  | Gemini 2.0 Flash (advisory layer only)        |
| Persistence| Browser localStorage (→ PostgreSQL roadmap)   |
| Deployment | Vercel                                        |

---

## API Design

### `POST /api/wellness/score`

**Request:**
```json
{
  "signals": {
    "sleep": 7, "stress": 5, "mood": 7, "energy": 6, "focus": 7, "consistency": 8
  },
  "context": {
    "workload_hours": 7, "hour": 10, "prior_score": 62,
    "streak": 4, "history_length": 4
  }
}
```

**Response:**
```json
{
  "wellness_score": 71,
  "tier": "Good",
  "burnout_risk": "Low",
  "burnout_text": "Burnout risk is low. Stress and recovery patterns are within a sustainable range.",
  "recovery_index": 74,
  "focus_readiness": 76,
  "delta": 9,
  "confidence": 84,
  "focus_windows": {
    "peak": "10:00 AM – 1:00 PM",
    "break_window": "1:00 PM – 2:00 PM",
    "recovery": "After 7:00 PM"
  },
  "explanation": [
    { "label": "Sleep Quality", "delta": 5, "impact": "positive" },
    { "label": "Stress",        "delta": 0, "impact": "positive" },
    { "label": "Focus",         "delta": 3, "impact": "positive" }
  ],
  "intelligence_brief": {
    "primary_strength": "Sleep Quality (contributing +5 to your score)",
    "primary_risk": "No critical risk signals today",
    "recommended_action": "Schedule demanding work before noon — focus readiness is high"
  },
  "recommendations": [...]
}
```

### `POST /api/wellness/insight`

Accepts the scored response object. Returns Gemini-generated advisory insight (2–3 sentences, advisory only).

---

## Roadmap

### Phase 1 — Foundation ✅
- [x] Six-signal check-in
- [x] Deterministic Wellness Scoring Engine
- [x] Burnout Risk Engine (3-factor gate)
- [x] Recovery Engine
- [x] Focus Forecast Engine + windows
- [x] Explainability Layer (contributor deltas)
- [x] Confidence Layer
- [x] Intelligence Brief
- [x] 7-day multi-trend chart
- [x] Gemini AI insight (advisory layer)
- [x] localStorage session persistence

### Phase 2 — Intelligence Layer
- [ ] Next.js + TypeScript frontend migration
- [ ] PostgreSQL session persistence
- [ ] Weekly digest with delta trend analysis
- [ ] Burnout trajectory forecasting (3-day projection)
- [ ] OpenAI-compatible model fallback routing

### Phase 3 — Platform Scale
- [ ] Google OAuth + user accounts
- [ ] REST API for third-party integrations
- [ ] Academic calendar context awareness
- [ ] FastAPI backend migration
- [ ] Team/cohort aggregation (privacy-preserving)

### Phase 4 — Research
- [ ] Longitudinal pattern analysis
- [ ] Opt-in anonymized cohort benchmarking
- [ ] Research partnership with institutional wellness services

---

## My Role

Dhimy Jean independently redesigned and expanded the original BMCC AI Innovation Challenge 2025 project into a Wellness Intelligence Platform featuring deterministic wellness scoring, burnout forecasting, recovery analysis, explainable AI insights, and modern full-stack architecture.

Contributions:

- Designed the full four-layer architecture: Signal Ingestion → Wellness Engine → AI Insight → Recommendation
- Implemented five deterministic engines: Wellness Score, Burnout Risk, Recovery Index, Focus Forecast, and Confidence
- Built the Explainability Layer: contributor delta computation showing each signal's impact on the score
- Integrated Gemini 2.0 Flash with structured prompt engineering to enforce advisory-only output
- Established the platform ethics framework: no medical claims, no diagnostic outputs, AI strictly advisory
- Built the full-stack Node.js/Express API with input validation and context-aware recommendation logic
- Designed the multi-trend analytics dashboard with 4-dataset Chart.js visualization
- Defined the separation-of-concerns principle: deterministic scoring is isolated from AI inference

---

## Project Evolution

TARN began as a team project developed during the BMCC AI Innovation Challenge 2025.

The original prototype focused on basic wellness tracking and AI-generated wellness suggestions.

Following the competition, the project was independently re-engineered and expanded by Dhimy Jean into TARN, a Wellness Intelligence Platform built around deterministic scoring engines, explainable recommendations, burnout forecasting, recovery analytics, and focus optimization.

The redesign introduced a modern full-stack architecture, wellness intelligence engine, protocol-based recommendation system, explainability layer, confidence scoring, and optional AI narrative generation.

Today, TARN serves as the wellness intelligence component of the broader DHIMLUX ecosystem.

---

## License

MIT License. See [LICENSE](LICENSE).

---

*TARN · Powered by DHIMLUX Labs · Built by Dhimy Jean · 2025*

## Gemini: staying free

The dashboard can show a short reflection written by Google's Gemini. It is
optional: with no key, TARN shows its built-in reflection, and everything else works.

**How this is kept free (and what you must do to keep it that way)**

1. **Get the key from [AI Studio](https://aistudio.google.com/apikey)** and check that it
   says **Free of charge** next to the key's project.
2. **Never add a billing account to that project.** This is the real guarantee: with no
   billing account Google cannot charge you. Past the free limit it answers "quota
   exceeded" and TARN quietly shows the built-in text.
3. The code adds its own safety on top (`backend/gemini.js`): it only ever calls models
   Google lists as free (a model named in `GEMINI_MODEL` that is not on the list is
   ignored), stops at 150 calls a day (`GEMINI_DAILY_CAP`), limits each visitor, caches
   repeated answers, and pauses everything for a while if Google says the key or quota is
   used up.

**Setup**
- Local: put the key in `backend/.env` as `GEMINI_API_KEY=...` and restart the server.
- Vercel: Project → Settings → Environment Variables → add `GEMINI_API_KEY`, then redeploy.
  The `api/wellness/insight.js` function does the rest.
- Never put the key in anything under `frontend/`; it would be visible to every visitor.

**Privacy.** On the free tier Google may use what you send to improve its products. So TARN
sends only a few numbers from the check-in (the scores) and never anything a person typed.
The dashboard says so, and marks AI text as AI-generated.

**Safety.** AI text is treated as untrusted. It is checked against `docs/AI_SAFETY.md`
(no diagnosis, medication, promised results, predictions about health, crisis language, and
so on). If it fails any check it is discarded and the built-in text is shown instead.
Tests: `npm test`.

