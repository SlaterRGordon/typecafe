# ADR 0004 — Drill reps and lifetime transition aggregates

Decided 2026-07-03 (commit `8a23f69`): drill reps excluded from lifetime
transitions. **Reversed by the owner 2026-07-04**: drill reps now count.

## Decision (current)

Drill reps sync into the lifetime data like any normal-mode test: per-key
accuracy **and** transition aggregates, including every pair in the drill's
target-saturated text. Grams and practice text stay excluded (not normal mode).

## History and the accepted tradeoff

The original decision excluded drill transitions because the diagnosis math
(worst-pair ranking, the `N× your typical transition` ratio) assumes
naturally-sampled bigrams, and drill text is saturated with the target pair
typed in a predictable rhythm:

- The drilled pair's count floods with drill-context samples, pulling its
  lifetime mean toward "drill speed" — the coach may consider a weakness fixed
  before natural typing confirms it, and later re-measure samples are diluted.
- Other pairs in the drill vocabulary get oversampled relative to natural
  frequency, nudging `overallTransitionMeanMs`.

In practice the exclusion made drilling feel broken: the number you were
drilling never moved, no matter how many reps landed (surfaced 2026-07-04 as a
suspected tracking bug). The owner chose responsiveness over sampling purity —
every rep is real typing, and Re-measure on natural text remains the honest
check. If the coach starts retiring weaknesses too eagerly, revisit with a
weighting/cap on drill-sourced samples rather than re-excluding them outright.
