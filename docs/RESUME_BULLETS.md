> **Written for the earlier version.** Phrases here such as "burnout forecasting" and "wellness intelligence" describe features the product no longer claims. Check `docs/CLAIMS_REGISTER.md` and `docs/PRODUCT_BOUNDARIES.md` before reusing any of this wording.

# TARN — Resume & Portfolio Materials

## Project Title

**TARN** — Wellness Intelligence Platform · DHIMLUX Labs

---

## Short Description (LinkedIn / GitHub About)

> AI-powered wellness intelligence platform that transforms daily behavioral signals into explainable burnout forecasting, recovery analysis, and focus optimization. Built on a deterministic scoring architecture with a strict separation between AI inference and platform recommendations.

---

## Resume Bullets

### Full-Stack Engineering

- Designed and implemented a full-stack wellness intelligence platform with a four-layer Node.js/Express + vanilla JS architecture: Signal Ingestion → Deterministic Engines → AI Advisory Layer → Recommendation Layer
- Built five production-grade deterministic engines in JavaScript: Wellness Scorer, Burnout Risk Engine, Recovery Index Calculator, Focus Forecast Engine, and Confidence Estimator — all with zero LLM dependency in the scoring path
- Implemented a multi-dataset Chart.js trend analytics dashboard displaying wellness, recovery, focus, and burnout risk trends over a 7-day window with color-coded risk overlays

### System Design

- Architected a separation-of-concerns system where the AI insight layer receives only scored, structured data — never raw user input — preventing model inference from producing clinical-sounding outputs from subjective text
- Designed a 3-factor burnout risk gate requiring high stress AND sleep deficit AND sustained workload to be simultaneously present before triggering elevated risk, eliminating false positives from single stressor events
- Implemented a Confidence Layer that adjusts score confidence (50–98%) based on streak length, historical data depth, and physiological signal coherence — decreasing confidence when signals contradict each other

### Deterministic Scoring Algorithms

- Implemented a six-signal weighted wellness formula with fully auditable, reproducible scores: `(sleep × 0.25 + mood × 0.20 + energy × 0.20 + focus × 0.15 + (10–stress) × 0.15 + consistency × 0.05) × 10`
- Built an Explainability Layer that computes each signal's delta from a neutral baseline (score = 50), presenting contributor impact as sorted, scaled bar visualizations with signed deltas

### TypeScript / JavaScript

- Ported scoring engine to TypeScript as a pure, dependency-free module with strict input validation and bounded output contracts — suitable for edge deployment without server dependency
- Designed all engine functions as pure functions with deterministic outputs — no external state, no side effects, identical output for identical input

### Node.js & API Design

- Built a structured REST API (`/api/wellness/score`, `/api/wellness/insight`) with input validation at the boundary, context-aware scoring, and enriched response payloads including explainability, confidence, intelligence brief, and focus windows
- Integrated Gemini 2.0 Flash via native `fetch` (no SDK required) with a structured prompt that constrains model output to advisory-only pattern summaries — not diagnoses, not treatment recommendations

### AI Integration & Explainable AI

- Integrated Gemini 2.0 Flash as an advisory-only insight layer: model receives a scored JSON payload, returns 2–3 sentence pattern summaries, and is explicitly prohibited by prompt design from producing medical-sounding outputs
- Implemented a deterministic Explainability Layer that shows users exactly which signal contributed what delta to their wellness score — no generated text, pure computation visible to the user as a contributor bar chart
- Defined and enforced platform ethics constraints: AI outputs labeled "Advisory Only," no diagnostic language, no health claims, no raw user data passed to model

### Product Architecture

- Repositioned an academic hackathon prototype into a production-grade intelligence platform with five engines, an explainability layer, a confidence model, a 7-day analytics dashboard, and an ethics framework
- Designed the Intelligence Brief — a synthesized daily summary of primary strength, primary risk, and a time-aware recommended action — generated deterministically from scoring outputs
- Defined a four-phase product roadmap covering foundation → Next.js + PostgreSQL migration → REST API platform → research partnership

---

## GitHub Description (≤280 chars)

```
AI-powered wellness intelligence platform. Deterministic engines for burnout risk, recovery index, focus forecast, explainability, and confidence scoring. Gemini AI advisory layer. Node.js · Express · Chart.js · localStorage
```

---

## LinkedIn Project Entry

**TARN — Wellness Intelligence Platform**
*DHIMLUX Labs · 2025 · dhimyjean.dev*

TARN transforms six daily behavioral signals into a full suite of wellness intelligence: a Wellness Score with explainable contributor breakdowns, a 3-factor Burnout Risk engine, a Recovery Index, a time-aware Focus Forecast with daily scheduling windows, and a Confidence model.

The platform enforces a strict separation between deterministic scoring (no LLM) and AI inference (Gemini, advisory only) — the same architectural principle used across the DHIMLUX portfolio. Every score is auditable, every contributor delta is displayed, and no medical claims are made at any layer.

**Tech:** Node.js · Express · JavaScript · TypeScript · Gemini 2.0 Flash · Chart.js · REST API · localStorage

**Origin:** Redesigned from BMCC AI Innovation Challenge 2025 prototype into a production-grade intelligence platform.

---

## One-Liner for Bio

> Built TARN — a wellness platform with deterministic burnout forecasting, explainable scoring, and advisory-only AI inference, designed with the same separation-of-concerns architecture as DHIMIX AI and BridgeAI.

---

## Elevator Pitch (30 sec)

"TARN is a wellness platform I built that turns six daily signals — sleep, stress, mood, energy, focus, and schedule load — into a full intelligence suite: a wellness score with contributor breakdowns, a burnout risk forecast, recovery and focus readiness scores, and a time-aware daily brief. The scoring is entirely deterministic — no AI in that path — and Gemini sits in a strictly advisory layer that never sees raw input. It's designed the same way I build all my AI platforms: AI provides insights, the platform makes recommendations."
