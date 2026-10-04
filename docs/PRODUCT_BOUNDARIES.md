# Product Boundaries — TARN

**Last reviewed:** 2026-09-04 · **Status:** portfolio project, not a validated medical product

---

## What TARN is

TARN provides evidence-informed exercises designed to support relaxation,
self-reflection, and awareness of personal wellness patterns.

It is a **low-risk general wellness application**. Everything it shows you is
derived from what you yourself typed in.

## What TARN is not

It is **not**:

- a medical device
- a diagnostic tool
- a treatment for anxiety or any other condition
- a replacement for therapy or professional care
- a suicide-prevention service
- an emergency-monitoring service
- a system that predicts burnout, panic attacks, suicide, or your ability to work

## The notice shown to users

Displayed during onboarding, in Settings, and near any recommendation:

> TARN is a self-reflection and general wellness tool. It does not provide
> medical advice, diagnosis, treatment, crisis monitoring, or emergency services.
> Information entered into this application is not reviewed by a healthcare
> professional.

A disclaimer does not license an unsafe feature. If a feature would be unsafe
without the disclaimer, the feature is wrong — not the wording.

---

## Claims removed in Phase 1, and why

These shipped in the previous version (the earlier version of this project) and have been removed.

### 1. "Confidence" percentage — **removed entirely**

The old dashboard displayed a confidence figure with a percentage and a progress
bar. It was not a confidence interval, a p-value, or any statistical quantity.
From `backend/server.js:215` in the old version:

```js
let score = 65;                                  // hardcoded starting point
score += Math.round((streak / 7) * 15);          // longer streak = higher "confidence"
if (highSleepLowEnergy) score -= 8;              // ad-hoc heuristic
```

A number invented this way, rendered as a percentage next to a health summary,
tells a user their wellness reading is 68% reliable. Nothing supports that.
**Removed rather than relabelled**, because there is no honest version of it.

### 2. Workload feasibility — **removed entirely**

The old app told users how many hours they could work, from `server.js:473`:

```js
const sustainableHours = capacity >= 78 ? 8 : capacity >= 62 ? 6 : capacity >= 45 ? 4 : 2;
```

This is a performance prediction about a person's capacity, derived from five
slider positions. It has no evidential basis and is exactly the kind of claim a
wellness product must not make. The question "Can I accomplish today's workload?"
is replaced by "How does today's workload feel?" — which the user answers, rather
than being told.

### 3. Burnout trajectory / forecasting — **removed**

Forecasting a health outcome is a clinical act. Replaced by "Wellness Pattern
History", which describes what the user has already recorded and asserts nothing
about the future.

### 4. Renamed, not removed

| Old | New | Reason |
|---|---|---|
| Wellness Score | Daily Wellness Snapshot | "Score" implies measurement against a standard |
| Burnout Risk | Current Stress Pattern | "Risk" is a clinical prediction |
| Recovery Index | Rest and Recovery Check-In | "Index" implies a validated instrument |
| Focus Readiness | Self-Reported Focus | Names the actual source of the data |
| Intelligence Brief | Wellness Summary | The app has no intelligence about you |
| AI Insight | Personalized Reflection | It was never AI — see below |

---

## The Daily Wellness Snapshot — what it is and is not

A single number is retained because it makes the dashboard usable. It is labelled
a **non-clinical summary of your own answers** wherever it appears, and its
calculation is published in full:

```
snapshot = (sleep×0.25 + mood×0.20 + energy×0.20
            + focus×0.15 + (10 − stress)×0.15 + consistency×0.05) × 10
```

- **Inputs:** only the 1–10 values the user selected. Nothing else.
- **Weights:** chosen by the developer for balance. **Not empirically derived,
  not validated against any clinical instrument.**
- **Range:** 10–100 in practice (never 0–9, since every input has a floor of 1).
- **Missing data:** if a signal is not provided the snapshot is not shown.

It is arithmetic on self-reported numbers. It is not a measure of anxiety,
burnout, recovery, mental health, or fitness to work, and the interface must
never imply otherwise.

## Honest note on "consistency"

`consistency` is **not** something the user reports. It is derived from their
check-in streak. The interface must not present it as a sixth self-reported
signal, and the snapshot explanation names it as a derived value.
