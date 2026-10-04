# Claims Register — TARN

Every meaningful health or performance statement the product makes, where it
appears, what supports it, and whether it is approved.

**Approval status** is one of: `approved` (safe, evidence-appropriate) ·
`removed` (was unsafe, deleted) · `pending-review` (needs clinical or legal input).

**Last reviewed:** 2026-09-04 · **Clinical reviewer:** none — see limitations

---

## Removed claims

| Claim | Where it appeared | Why removed | Status |
|---|---|---|---|
| "Confidence 68%" | dashboard confidence card | No statistical basis. Started at a hardcoded 65 and adjusted by streak length. | `removed` |
| "You can sustain N hours of work" | workload feasibility card | Performance prediction from five sliders. No evidence. | `removed` |
| "Burnout Risk: High" | metric card | Clinical risk prediction. | `removed` — replaced by descriptive stress pattern |
| "Burnout trajectory" | narrative block | Forecasts a health outcome. | `removed` |
| "Recovery Index" | metric card | Implies a validated instrument. | `removed` — replaced by rest check-in |
| "Focus Readiness" | metric card | Implies measured cognitive capacity. | `removed` — replaced by self-reported focus |
| "real intelligence" | check-in subtitle | The app performs arithmetic, not inference. | `removed` |
| "Wellness Intelligence Platform" | meta tags, OG tags | Overclaims capability. | `removed` |

## Retained claims

| Claim | Where | Evidence type | Limitations | Status |
|---|---|---|---|---|
| "Daily Wellness Snapshot is a non-clinical summary of your own answers" | dashboard, snapshot explainer | Arithmetic, fully published | Weights are developer-chosen, not validated | `approved` |
| "This exercise is inspired by common cognitive behavioral therapy techniques" | thought record | Established description of a technique | Not CBT treatment; no evidence about *this* implementation | `approved` |
| "A paced-breathing exercise that may support a moment of relaxation" | breathing timer | General technique evidence | No claim of treating anxiety | `approved` |
| "Your recent check-ins show…" | trends | Descriptive statistics on user's own data | Correlation only; never causal | `approved` |

## Claims requiring review before use

| Claim | Why it is blocked | Status |
|---|---|---|
| "HIPAA compliant" | Not established. Requires formal assessment. | `pending-review` — must not be used |
| "Clinically proven" / "clinically validated" | Would require a study of *this application*. None exists. | `pending-review` — must not be used |
| "Evidence-based" (unqualified) | The technique may be evidence-based; this implementation is not evaluated. Use "evidence-informed". | `pending-review` |
| Any effectiveness claim | No outcome data exists for TARN. | `pending-review` |

---

## The three-level evidence distinction

These must never be conflated:

1. **Evidence for a general technique** — e.g. cognitive restructuring is a
   well-described CBT technique with a research base. *We can cite this.*
2. **Evidence evaluating a particular digital intervention** — e.g. a specific
   trialled CBT app. *We can cite this, but it is about that app, not ours.*
3. **Evidence evaluating TARN** — **none exists.**

Research about another intervention never demonstrates that TARN works.
Any copy implying otherwise is a defect.

## Enforcement

`test/forbidden-claims.test.js` scans user-facing source for prohibited phrasing
and fails the build on a match. It is a safety net for wording, not a substitute
for judgement — it cannot detect a new unsafe claim phrased in new words.
