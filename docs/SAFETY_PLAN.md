# Safety Plan — TARN

**Last reviewed:** 2026-09-04

---

## The core position

TARN is not a crisis service and does not monitor anything. Its safety
approach is therefore not detection — it is **making help easy to reach at every
point where distress might surface**, and never implying anyone is watching.

## Crisis resources — where they appear

A **Get Immediate Help** control is present in:

- the main navigation, on every page
- the check-in result screen
- the journal
- the CBT-informed thought record
- Settings

It is reachable by keyboard, announced to screen readers, and remains visible on
mobile without scrolling.

## The text shown (United States)

> TARN is not a crisis service, and entries are not monitored. If you are
> experiencing emotional distress or having thoughts of suicide, call or text 988
> to connect with the 988 Suicide & Crisis Lifeline. If you or someone else is in
> immediate danger, call 911 or go to the nearest emergency department.

Actions offered: **Call 988** · **Text 988** · **Visit 988lifeline.org** · **Call 911**

`tel:` and `sms:` links so a phone dials directly.

## Country handling

Crisis resources are stored as data with a `country_code`, not hardcoded into
components. Only resources matching the user's region are shown.

**US numbers are never presented as worldwide resources.** Where no resource
exists for a region, the app says so plainly and links to a directory, rather
than showing a number that will not connect.

## What this app deliberately does NOT do

| Not built | Why |
|---|---|
| AI suicide-risk classifier | Cannot be done safely or accurately here. A false negative is catastrophic; a false positive is harmful. |
| Emergency detection | The app would have to claim it is watching. It is not. |
| Sentiment analysis of journal entries | Same. Entries are private and unread. |
| Alerting a contact | Implies monitoring that does not exist. |
| Any claim that entries are reviewed | They are not, by anyone, ever. |

## Crisis-language handling

If a user types crisis-related language into an AI-backed feature (Phase 5 only),
the request is **not** sent to a model. A deterministic keyword filter runs first
and routes to the static crisis-support screen.

This is deliberately a blunt keyword check, not a classifier. Its only job is to
fail toward showing help. It is **not** a risk assessment, is never described as
one, and its output is never stored or shown as a judgement about the user.

## Language rules

**Never:** "You are heading toward burnout" · "Your recovery capacity is moderate"
· "You can accomplish four hours of work" · "This will reduce your anxiety" ·
"This detects anxiety" · "Your score will improve"

**Instead:** "Your recent check-ins show…" · "You reported…" · "You may want to
consider…" · "This pattern is based only on your self-reported entries." ·
"Not enough information is available to show a pattern."

A test in the suite fails the build if forbidden phrasing appears in user-facing
copy. See `docs/CLAIMS_REGISTER.md`.

## Breathing exercise safety

Paced breathing can cause light-headedness. The exercise:

- is described as "a paced-breathing exercise that may support a moment of relaxation"
- never claims to treat anxiety or prevent panic attacks
- shows a visible caution to stop if the user feels dizzy or uncomfortable
- can be stopped at any moment, with animation disabled entirely if preferred

## Known gaps

- No clinical reviewer has assessed this application. The reviewer fields in the
  research register are **unfilled on purpose** rather than filled with a name
  that does not exist.
- Crisis resources currently cover the United States only.
- No legal review has been conducted.
