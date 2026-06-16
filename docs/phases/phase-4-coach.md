# Phase 4 — The Coach

**Goal:** TypeCafe tells users something true about their typing that they didn't know and couldn't get anywhere else.

Heuristics first (locked constraint): rule-based diagnosis ships all of this phase's value. The LLM is an optional voice on top, added only when there's budget — never a dependency.

---

## 4.1 Transition (bigram) analytics (L) — the coach's real edge

Single-key stats are table stakes; *transitions* are what actually cap intermediate typists (`th`, `ion`, `br`). The Phase 1 timeline already contains everything needed.

**Schema:**
```prisma
model TransitionStat {
  id        String @id @default(cuid())
  userId    String
  pair      String   // "th"
  count     Int
  totalMs   BigInt   // sum of latency between the two keystrokes
  errors    Int      // second key wrong
  updatedAt DateTime @updatedAt
  @@unique([userId, pair])
}
```
Maintained on test-save from the timeline (derived-on-write); localStorage mirror for guests, same batch-import path.

**Surfaces:** slow-transition findings in the score-card diagnosis ("`br` takes you 2.1× your average — [Drill `br`]" → grams mode pre-loaded with that bigram); worst-transitions on `/progress` (already stubbed in Phase 3); grams mode auto-suggest reordered by *the user's* weak transitions instead of corpus frequency only.

**Progress (built in slices):**
- 2026-06-15 — *slice 1, lifetime transitions vertical:* `src/lib/transitions.ts` (pure, 8 unit tests): `aggregateTransitions` (timeline → per letter-pair count/totalMs/errors), `worstTransitions` (ratio vs the user's overall transition pace, slowest first, recurrence floor), `mergeTransitions`. `TransitionStat` schema (Int totalMs per the ponytail note; migration `20260615120000_add_transition_stats`). `transitionStats` router (`get` + `batchSync` upsert-increment). Derived-on-write: `useTestPersistence.syncTransitions` rolls each normal-mode test into aggregates → DB (signed-in) or the `localTransitions` localStorage mirror (guests, 3 unit tests). `/progress` "Slowest transitions" card: "b→r takes you 2.2× your average and misses 25% of the time → [Drill br]" (drills the pair's keys into Practice). e2e + screenshot `40`. **Owner runs the migration.**
- *Next slices:* the score-card diagnosis "2.1× your average" framing (this-test) + drill **into grams** pre-loaded with the bigram; grams auto-suggest reordered by the user's weak transitions; sync-on-signup batch-import of the guest mirror (the local data persists meanwhile).

## 4.2 Error taxonomy (M)

Classify every error in the timeline (`src/lib/errorTaxonomy.ts`, pure, unit-tested):

| Class | Detection | Prescription |
|---|---|---|
| Adjacent-finger hit | wrong char is keyboard-adjacent to target | targeted key drill |
| Transposition | chars i, i+1 typed swapped | rhythm: slow deliberate drills of those pairs |
| Doubled/dropped letter | repeat-char contexts | double-letter gram set (`ll`, `ss`, `ee`) |
| Post-error spiral | error within 3 keystrokes of previous error | "slow down after mistakes" coaching note + accuracy-threshold drills |
| Fatigue fade | accuracy in last quartile ≪ first quartile | shorter sessions prescription |

Each class maps to one coaching sentence and one drill button. Diagnosis panel and recap pick the *dominant* class — never a wall of findings.

**Progress:** 2026-06-15 — `src/lib/errorTaxonomy.ts` (pure, 5 unit tests per class). `classifyErrors(events)` returns the single dominant `ErrorFinding` (headline + detail + one action button) or null below the 30-keystroke/3-error floor. Surfaced as a highlighted block atop the score-card `DiagnosisPanel`. Thresholds in `TAXONOMY_CONFIG`. **Scope:** only the three classes derivable from the persisted timeline ship — **post-error spiral** (errors clustering within 3 keystrokes), **fatigue fade** (last-quartile accuracy drop), **doubled-letter** (errors on a repeated expected char). Adjacent-finger and transposition need the *typed* wrong char, which the timeline (`[expectedCode, correct, dt]`) doesn't store — out of scope until keystroke capture records it (a small encoding change; pairs naturally with §4.1's derived-on-write pass). Recap integration deferred (no stored per-class aggregates yet).

## 4.3 Speed-vs-accuracy stance (S)

One computed stance from recent history, shown on `/progress` and in recaps:

- accuracy < ~94% and WPM trending flat → **accuracy-limited**: "slow down 10%; speed follows"
- accuracy > ~98% with low consistency → **confidence-limited**: "push pace; let errors happen in drills"
- otherwise → **balanced**: keep current mix

Thresholds in one config object, documented on `/how-we-measure`. This is the single most coach-like sentence we can ship cheaply.

**Progress:** 2026-06-15 — `src/lib/stance.ts` (pure, 6 unit tests): `computeStance(records, now)` → accuracy-limited / confidence-limited / balanced, each with a headline + advice sentence. Thresholds in `STANCE_THRESHOLDS` (accuracy floor 94 / ceiling 98, consistency floor 70, flat-delta 1 WPM, 30-day window, ≥5 tests). accuracy-limited only fires when *not* already improving (no nagging a climber); confidence-limited needs high accuracy **and** low consistency. Shown as a "Coach" card on `/progress`. ponytail: thresholds documented in the file header until `/how-we-measure` exists; recap integration (the doc also lists recaps) is a small follow-up.

## 4.4 Practice plans (L)

The flagship: **"Your 30-day plan."**

- Generated from the user's own `KeyStat`/`TransitionStat`/taxonomy data: a daily sequence of ~15 min — warm-up test → 2 targeted drills (worst keys / worst transitions / dominant error class) → weekly benchmark in the user's main config
- Plain data structure (`src/lib/plan.ts`): array of day entries, each entry = ordered drill configs (existing mode + params — *plans reuse modes, they don't invent new test types*)
- Regenerated weekly from fresh data (on-read, no cron); plan view shows done/today/upcoming; completing a day feeds the streak
- Honest fallback: < 1 week of data → "Calibration week" plan (varied tests to build the profile)

## 4.5 Plateau detection (M) — promoted from moonshot

Rolling 21-day WPM slope ≈ 0 within noise (`src/lib/trajectory.ts` extension) →

- `/progress` headline switches to coach voice: "Plateaued for 3 weeks. Your sessions repeat the same comfortable words — switch to transition drills."
- Regenerates the plan with a changed mix; the recap leads with it
- The coach noticing *before the user does* is the retention moment that makes TypeCafe feel alive

## 4.6 LLM coach — deferred, designed (paper only)

When budget exists: a "Why am I stuck?" button sends the *aggregated stats only* (never raw keystrokes) to Claude with a tight system prompt to produce 3 sentences grounded in the user's numbers. Until then, the heuristic sentences from 4.2/4.3/4.5 are the coach's voice. The contract (`CoachContext` JSON) gets defined now so heuristics and LLM stay swappable.

**Honest note:** finger-level analytics (inferring finger usage from timing) stays in Phase 7 — it needs research-grade validation we can't do without data volume, and shipping pseudo-science violates Phase 0.

## Acceptance

- [ ] A 70-WPM user with 2 weeks of data gets: their 3 slowest transitions, their dominant error class, a stance, and a 30-day plan — each with a working drill button
- [~] Error taxonomy unit-tested against constructed timelines per class
  - 2026-06-15: the three timeline-derivable classes (post-error spiral, fatigue fade, doubled-letter) are unit-tested per class and surfaced on the score card. Adjacent-finger + transposition await typed-char capture.
- [ ] Plateau state reproducible with synthetic flat data; plan visibly changes in response
- [ ] All thresholds documented on `/how-we-measure`
- [ ] Screenshot tour: plan view (calibration + targeted), plateau headline, stance display, transition findings

**Owner's part:** be the first coached user and judge every sentence — coaching copy that feels canned kills the feature; calibrate thresholds against your own felt experience.
