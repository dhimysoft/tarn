# TARN — Architecture Reference

## Layer Map

```
╔══════════════════════════════════════════════════════════════════════╗
║                      USER WELLNESS SIGNALS                          ║
║                                                                      ║
║   Sleep ·· Stress ·· Mood ·· Energy ·· Focus ·· Consistency         ║
║   (Self-reported · 1–10 scale · Validated at API boundary)          ║
╚═══════════════════════════╦══════════════════════════════════════════╝
                            ║  POST /api/wellness/score
                            ▼
╔══════════════════════════════════════════════════════════════════════╗
║                   WELLNESS PROFILE ENGINE                            ║
║                                                                      ║
║   ┌─────────────────┐   ┌──────────────────────┐   ┌─────────────┐  ║
║   │ Signal Validator │──▶│  Scoring Engine (TS) │──▶│  PostgreSQL │  ║
║   │ (API boundary)  │   │  Deterministic · Pure │   │  Profile DB │  ║
║   └─────────────────┘   └──────────┬───────────┘   └─────────────┘  ║
║                                    │                                 ║
║              ┌─────────────────────┼────────────────────┐            ║
║              ▼                     ▼                    ▼            ║
║       Wellness Score          Burnout Risk        Recovery Index     ║
║       (0–100 · Tier)      (Low/Mod/High/Crit)       (0–100)         ║
║                                                                      ║
║                          Focus Readiness                             ║
║                          (time-of-day aware)                         ║
╚═══════════════════════════╦══════════════════════════════════════════╝
                            ║  Scored payload only (no raw input)
                            ▼
╔══════════════════════════════════════════════════════════════════════╗
║                       AI INSIGHT LAYER                               ║
║                                                                      ║
║   Model Router                                                       ║
║   ├── Gemini 1.5 Pro  (primary)                                      ║
║   ├── Claude claude-sonnet-4-6    (secondary)                                ║
║   └── OpenAI-compatible endpoint (fallback)                          ║
║                                                                      ║
║   Input:  { wellness_score, burnout_risk, context_flags[] }          ║
║   Output: Plain-language insight string (2–4 sentences)              ║
║                                                                      ║
║   Constraints:                                                       ║
║   · No raw user data reaches this layer                              ║
║   · Output is advisory text only — not scored, not acted upon        ║
║   · Labeled "AI-generated insight" in all UI surfaces                ║
╚═══════════════════════════╦══════════════════════════════════════════╝
                            ║
                            ▼
╔══════════════════════════════════════════════════════════════════════╗
║                    RECOMMENDATION LAYER                              ║
║                                                                      ║
║   Deterministic rules engine — time-aware, load-aware, recovery-aware║
║                                                                      ║
║   Inputs:  scored outputs + AI insight string + context              ║
║   Outputs: Ranked wellness guidance (3 items max per session)        ║
║                                                                      ║
║   Rule categories:                                                   ║
║   · Sleep hygiene       · Focus blocks      · Movement cues          ║
║   · Workload pacing     · Recovery prompts  · Streak reinforcement   ║
╚═══════════════════════════╦══════════════════════════════════════════╝
                            ║
                            ▼
╔══════════════════════════════════════════════════════════════════════╗
║                   HUMAN WELLNESS GUIDANCE                            ║
║                                                                      ║
║   Next.js Dashboard · TypeScript · Tailwind CSS                      ║
║   · Wellness score card + tier badge                                 ║
║   · Burnout risk indicator (color-coded)                             ║
║   · Focus readiness gauge (time-of-day aware)                        ║
║   · AI insight block (clearly labeled, bounded)                      ║
║   · 7-day trend chart · Weekly delta summary                         ║
║   · Recommendation cards (max 3, contextual)                         ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## Data Flow

```
User Input
    │
    ▼
API Validation ──── reject if out of range [1–10]
    │
    ▼
Scoring Engine (TypeScript, pure function)
    │
    ├──▶ wellness_score   [0–100]
    ├──▶ tier             [Critical/Low/Moderate/High/Optimal]
    ├──▶ burnout_risk     [Low/Moderate/High/Critical]
    ├──▶ recovery_index   [0–100]
    └──▶ focus_readiness  [0–100, time-aware]
         │
         ▼
    PostgreSQL (persist scored session)
         │
         ▼
    AI Insight Layer (receives score only, not raw input)
         │
         ▼
    Recommendation Layer (deterministic rules + AI text)
         │
         ▼
    API Response → Frontend Dashboard
```

---

## Scoring Formula Reference

### Wellness Score

```
WellnessScore = round((
  sleep       × 0.25 +
  mood        × 0.20 +
  energy      × 0.20 +
  focus       × 0.15 +
  (10-stress) × 0.15 +
  consistency × 0.05
) × 10)
```

Bounded: [0, 100]

### Burnout Risk Gate

All three conditions required for High/Critical:
1. `stress >= 7`
2. `sleep <= 5`
3. `workload_hours >= 8`

Partial matches yield Moderate. No conditions yield Low.

### Recovery Index

```
RecoveryIndex = round((sleep × 0.50 + (10-stress) × 0.30 + mood × 0.20) × 10)
```

### Focus Readiness

```
FocusReadiness = round((
  sleep   × 0.35 +
  energy  × 0.30 +
  focus   × 0.25 +
  (10-stress) × 0.10
) × afternoonDip × 10)
```

`afternoonDip = 0.9` if `13:00 ≤ hour ≤ 15:00`, else `1.0`

---

## Key Design Decisions

**1. No LLM in the scoring path.**
Scoring is deterministic and auditable. Users can verify their score by hand. This is required for trust at scale.

**2. AI receives scored data only.**
Raw user input (e.g., "I feel terrible") never reaches the model. Scored signals are passed instead. This reduces model interpretation variance and prevents the AI from making clinical-sounding inferences from subjective text.

**3. Three-factor burnout gate.**
A single stressful day does not trigger burnout risk. All three compounding factors must be present. This prevents alarm fatigue.

**4. Afternoon dip is hardcoded, not modeled.**
Circadian science is well-established. Modeling it with ML would introduce variance without improving accuracy for this use case.

**5. Consistency is a low-weight signal.**
It rewards engagement without distorting scores for new users or those returning after a gap.
