# ADR 0004 — Drill reps never feed lifetime transition aggregates

Decided 2026-07-03 (commit `8a23f69`), recorded 2026-07-04 after it resurfaced
as a suspected tracking bug.

## Decision

A drill rep's keystrokes are **never** rolled into the lifetime `TransitionStat`
aggregates — not even for the drilled pair. `skipTransitionSync` on the Typer
enforces this for every non-timed drill, and the post-drill "next" pick folds in
the rep's per-key attempts but not its transitions.

Per-key accuracy from drills **does** sync: accuracy is honest signal in any
text.

## Why

The transition diagnosis (worst-pair ranking, the `1.8× your typical transition`
ratio) assumes naturally-sampled bigrams. Drill text is saturated with the
target pair, typed in a predictable rhythm:

- Syncing all pairs oversamples the drill's vocabulary and distorts
  `overallTransitionMeanMs`.
- Syncing only the drilled pair floods its count with drill-context samples,
  pulling its mean down to "drill speed". The coach then believes the weakness
  is fixed and stops suggesting it, and later re-measure samples are too diluted
  to correct it. The numbers are the product; polluted aggregates are a one-way
  door (bad rows can't be told apart later).

The honest loop is: drill reps → **Re-measure** (natural text) → lifetime data
moves.

## Consequence and the UX obligation

The drill header's lifetime baseline barely moves from drilling alone — by
design. That read as "transitions no longer track" to the owner. Any surface
showing the lifetime baseline during a drill session must therefore also show
session-local progress (the drill header's "This session: …" line, built from
each rep's delta) so the reps visibly move *a* number without touching the
lifetime data.
