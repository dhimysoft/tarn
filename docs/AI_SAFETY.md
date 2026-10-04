# AI Safety — TARN

**Last reviewed:** 2026-09-05
**Clinical reviewer:** **Not yet clinically reviewed — public release blocked**

---

## The layered approach

No single mechanism is trusted. A message passes through these in order, and
**the crisis check runs before any model is called**:

```
user message
  │
  ├─ 1. safetyRouter        deterministic phrase matching, offline, no model
  │     └─ match ──────────► fixed crisis response. No generation happens at all.
  │
  ├─ 2. model call          structured JSON output, constrained schema
  │
  ├─ 3. responseValidator   shape check, then content check
  │     └─ fail ───────────► safe deterministic fallback. Invalid text is
  │                          discarded, never repaired or partially shown.
  │
  └─ 4. response to client  always labelled "AI-generated reflection"
```

## Why the crisis check is deterministic

A model could recognise more phrasings than a list of patterns. It would also:

- be wrong in ways nobody can inspect or test exhaustively
- put the most safety-critical decision in the app behind a network call
- vary between runs

`services/safetyRouter.js` is a phrase matcher. It runs offline in microseconds,
its behaviour can be read off the page, and 94 tests cover it. When it matches,
**no generative response is produced** — the user gets prewritten text.

It returns a **category**, never a score. It is not a risk assessment, and its
output is never stored as an attribute of a person or shown to them as a
conclusion about themselves.

## What the tests do and do not prove

The suite covers **94 crisis-routing cases** and **130 validator cases**,
including obfuscation (`K1LL MYS3LF`, `kiiiill myselffff`, run-together text)
and figures of speech that must *not* trigger (`this deadline is killing me`,
`I was reading about suicide prevention`).

**Passing them does not mean every unsafe situation is detected.**

Distress is often expressed obliquely, in metaphor, in another language, or not
at all. A phrase matcher cannot see any of that. This is why crisis resources
are reachable from **every screen** rather than only when something is detected —
the router is a safety net, not the route to help.

The product must never claim it detects crises or monitors conversations.

## Bugs these tests found

Written down because they show the failure modes are real, not theoretical:

| Bug | Effect | Fix |
|---|---|---|
| Runs of 3+ letters collapsed to two | `kiiiill myselffff` → `kiill myselff`, matched nothing | collapse to one |
| `kill me` classified as self-harm | "he is threatening to kill me" routed to the wrong resources | self-harm requires `myself`; the first-person wish is matched explicitly |
| Word boundaries on run-together text | `KILLMYSELF` was missed | severe phrases also checked against a whitespace-stripped copy |
| `want to die` too broad | "I want to die my hair blue" interrupted the conversation | added to the non-disclosure list |
| `suicide prevention` matched | reading about prevention triggered a crisis screen | benign spans stripped before matching |
| Verb inflections missing | "ending my life", "reducing your antidepressants" both slipped through | inflections added in both services |

## The response validator

Two independent checks, because they fail differently:

1. **Shape** — is this the object we asked for? Models return prose, truncated
   JSON, or arrays where objects belong.
2. **Content** — a well-formed response can still say something prohibited.

On failure the response is **discarded** and `safeFallbackResponse()` is sent.
The invalid text is never repaired, never partially shown, and never logged
verbatim — only the rule that fired is recorded.

The model may only reference activities that already exist in the reviewed
library. `activityId` is checked against that set, which is what stops it
inventing a coping exercise.

## Prohibited output categories

Each has a documented reason in `services/responseValidator.js`:

clinical role claims · diagnosis · medication advice · promised outcomes ·
asserting the user is safe · predicting burnout · encouraging dependency ·
discouraging professional or emergency contact · fabricated evidence

## What is deliberately not built

| Not built | Why |
|---|---|
| AI suicide-risk classifier | A false negative is catastrophic; a false positive is harmful. Cannot be done safely here. |
| Emergency detection | Would require claiming the app is watching. It is not. |
| Sentiment analysis of entries | Same. Entries are private and unread. |
| Alerting a contact | Implies monitoring that does not exist. |

## Before any public release

- [ ] Crisis language and conversational boundaries reviewed by a qualified
      mental-health professional. **Not done. This blocks release.**
- [ ] Legal review of all claims (`docs/CLAIMS_REGISTER.md`)
- [ ] Crisis resources verified for every supported region
- [ ] Provider data-processing terms confirmed and documented
