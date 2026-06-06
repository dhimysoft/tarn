# AURA — Product Vision

## One-Line Positioning

> AI-powered wellness intelligence platform for students and professionals.

---

## The Platform Principle

AURA is built on one foundational rule borrowed from enterprise AI design:

**AI provides insights. The platform makes recommendations.**

No LLM output reaches the user without passing through a deterministic recommendation layer first. AI is advisory — never authoritative. This is not a legal hedge; it is an architectural decision that makes the platform trustworthy at scale.

---

## What AURA Is

AURA is a **wellness intelligence layer** — a structured system that converts subjective daily experience into objective, scored, actionable signals.

It sits between "how do you feel today?" and "here's what to do about it" — doing the pattern recognition, scoring, and contextualization that users cannot reliably do themselves when under stress or sleep-deprived.

---

## What AURA Is Not

- Not a medical device
- Not a mental health app
- Not a diagnostic tool
- Not a replacement for professional care

AURA surfaces patterns. It does not interpret them clinically.

---

## Target Users

**Primary:** University students managing academic pressure, sleep debt, and burnout cycles.

**Secondary:** Early-career professionals navigating high-output work environments.

**Institutional (Phase 3):** Academic wellness centers seeking aggregated, privacy-preserving cohort insights.

---

## Core Value Propositions

1. **Quantified Self, Simplified** — Six signals, one score. No wearables required.
2. **Burnout Before It Happens** — Risk scoring catches compounding stress patterns before they become crises.
3. **AI That Knows Its Lane** — Model outputs are clearly bounded. Users know what is AI and what is platform logic.
4. **Designed for Students** — Academic calendar awareness, exam week context, streak-based consistency rewards.

---

## Competitive Differentiation

| Dimension              | Generic Wellness Apps | Clinical Apps     | AURA                         |
|------------------------|----------------------|-------------------|------------------------------|
| Medical claims         | Often vague          | Yes (licensed)    | None — advisory only         |
| AI role               | Chatbot / tips       | None              | Structured insight layer     |
| Scoring transparency  | Black box            | Proprietary       | Open formula, auditable      |
| Student context       | Generic              | None              | Built-in                     |
| Burnout detection     | None                 | Reactive (crisis) | Proactive (pattern-based)    |

---

## Design Principles

1. **Deterministic scoring in critical paths.** Scores are reproducible, explainable, and not subject to model drift.
2. **Minimal data surface.** Self-reported signals only. No biometrics. No passive collection.
3. **Separation of concerns.** Ingestion → Scoring → AI Insight → Recommendation are strictly layered.
4. **Advisory outputs only.** The AI layer is a read-only signal enricher, not a decision engine.
5. **Transparency by default.** The scoring formula is public. Users can verify their score by hand.
