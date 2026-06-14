# Phase 7 — Moonshots

**Goal:** none of these ship on the current timeline — and none of them get accidentally locked out by near-term decisions.

This doc exists to (a) name each moonshot's *prerequisite* honestly, (b) record the **door-keeper decisions** earlier phases must respect, and (c) say plainly what we can't do today so nobody half-builds it.

---

## The door-keepers (rules for Phases 0–6, in force now)

1. **Timeline format is versioned** (`v: 1` in the JSON) — future analyses (finger inference, research) must be able to reinterpret old data
2. **Aggregates are additive sums** (attempts/correct/totalMs) — never store only averages; sums merge across devices, layouts, and future sources
3. **Stats pipeline keys on characters, not physical keys** — a future `layout` dimension can be added without rewriting `KeyStat`/`TransitionStat`
4. **`CoachContext` JSON contract** (Phase 4) stays renderer-agnostic — heuristics, LLM, or future models are swappable voices
5. **Privacy posture set now:** raw timelines are the user's property; nothing leaves their account non-anonymized; deletion deletes everything. Cheap today, impossible to retrofit after trust is lost

## The moonshots

### Layout-transition coaching (QWERTY → Colemak/Dvorak)
**What:** dual-layout progress tracking for layout switchers — per-layout heatmaps, crossover charts ("Colemak passed QWERTY on day 34"), switch-specific drill plans. A devoted, underserved niche that posts progress charts weekly.
**Prerequisite:** `layout` dimension through settings, stats, and aggregation (door-keeper #3 makes this additive).
**Trigger:** Phases 0–4 stable; this becomes the most buildable moonshot — likely first off this list.

### TypeCafe API / data export
**What:** users export their full keystroke history; public read API for profiles/badges. Tinkerers become advocates.
**Prerequisite:** API-token auth, rate limiting; a settled snapshot schema (door-keeper #1).
**Can't yet because:** schema still churns through Phase 4 — exporting now would freeze mistakes. Export-your-data (a JSON dump button) is cheap and could ship early as the privacy-posture proof.

### Anonymized research dataset / published findings
**What:** "The 10 bigrams that cap intermediate typists" — findings only TypeCafe's transition corpus could produce. Authority, citations, press.
**Prerequisite:** thousands of consented users; opt-in consent flow; real anonymization review.
**Can't yet because:** the data doesn't exist and *we do not fake scale* — no synthetic findings, no "our data shows" until it does (the Phase 6 SEO rule applies here too).

### Native / offline measurement
**What:** desktop app (Tauri-class) measuring keystrokes outside browser event-loop jitter — the "lab-grade" story, offline drills included.
**Prerequisite:** evidence browser jitter materially affects our numbers (measure first!); sync protocol = the existing local-first merge (door-keeper #2 means device merging already works).
**Can't yet because:** unvalidated premise + a second platform to maintain before the web product is finished. The local-first architecture *is* the preparation.

### OS-level passive coach
**What:** opt-in background measurement of real-world typing — your *actual* daily WPM, drills generated from real mistakes, not test mistakes. The endgame: the coach that watches you work.
**Prerequisite:** native app first; extreme privacy engineering (on-device aggregation only — raw global keystrokes must never leave the machine); a trust reputation to spend.
**Can't yet because:** all three. This is the last thing we build, and only from an established position — a keylogger-shaped feature from an unknown site is dead on arrival. Door-keeper #5 is its foundation.

### Verified WPM certification
**What:** a proctored-mode result with a verifiable URL — the "official typing certificate" market is real and unserved for adults.
**Prerequisite:** anti-cheat far beyond Phase 5's sanity checks (locked environment, replay analysis, possibly liveness); brand authority that makes the certificate worth citing.
**Free-forever note:** certification ships free if it ships (locked constraint) — its value to us is authority, not revenue.
**Can't yet because:** certification from a site nobody knows certifies nothing. Earliest after Phase 6 traction.

### ML-personalized drill text
**What:** generated drill text maximally weighted toward the user's weak transitions while still reading like language, difficulty auto-tuned to ~95% success (flow-state edge).
**Prerequisite:** per-user transition data (Phase 4 ✓ when done); a generation approach — weighted Markov over the corpus is buildable *without* ML and should be tried first as a Phase 4 extension; actual learned models need the research dataset.
**Path:** Markov version graduates out of this doc into Phase 4 scope as soon as TransitionStat has real data.

### Clubs / team spaces
**What:** private leaderboards and aggregate progress for keyboard Discords and dev teams ("our server gained 214 WPM this month").
**Prerequisite:** Phase 5 boards + actual communities asking for it.
**Trigger:** the first time a Discord mod asks "can we get our own board" — build it then, not before.

## Review cadence

Revisit this doc at each phase boundary: promote anything whose prerequisite has been met (the Markov generator and layout coaching are the likeliest first promotions), and delete anything two phases of reality have falsified.
