# Lift net-WPM aggregation out of the test router

**Strength:** Strong · **Category:** in-process **Status:** ✅ done

## Files

`src/server/api/routers/test.ts` → `src/lib/netScores.ts` (new module)

Five inline sites re-derive net-WPM over `Test` rows:

- `:75` — best net over prior runs at a config (`reduce(max, netFromRaw…)`)
- `:139` — average net over a 30-day window (`reduce(+, netFromRaw…)/n`)
- `:185` — average net over the challenge baseline window (identical to `:139`)
- `:307–311` — best run per user by net, `Map` dedupe + inline `netOf`
- `:386–391` — same best-per-user dedupe for the leaderboard

## Problem

Net WPM is the canonical headline metric but **isn't stored** — it's
`netFromRaw(speed, accuracy)`, derived on read (see `net-wpm-canonical-formula`).
So every surface that ranks, averages, or brags re-derives it inline. `netFromRaw`
itself is a tested `src/lib/` function, but the *aggregations over rows* (average,
best-per-user) are hand-rolled at the call site with no **locality**: a bug in the
dedupe or the windowed average lives in the 754-line router, invisible to any test.
These blocks are **shallow** — a few lines each — but deleting them in favour of a
named call *concentrates* the "how do we rank/average net over rows" rule.

## Solution

A pure `src/lib/netScores.ts` owning net-over-rows:

- `netOf(row)` — `netFromRaw(row.speed, row.accuracy)`
- `averageNet(rows)` — mean net, or `null` below a minimum sample (the honest-delta floor)
- `bestNetPerUser(rows)` — one best row per `userId`, by net

The router fetches rows and calls them.

## Before / After

```
Before                                  After
──────                                  ─────
test.ts (5 inline re-derivations)       lib/netScores.ts  (deep, tested)
  :75  reduce(max, netFromRaw…)           netOf · averageNet · bestNetPerUser
  :139 reduce(+, netFromRaw…)/n         ──────── called by ────────
  :185 reduce(+, netFromRaw…)/n         test.ts — Prisma in, lib out
  :307 Map + netOf dedupe
  :386 Map + netOf dedupe
        each → stats.netFromRaw()       netScores wraps stats.netFromRaw()
```

## Benefits

- locality: net aggregation in one tested module, not smeared over a router
- the interface is the test surface — assert over plain row arrays, no Prisma mock
- leverage: the next net-ranked surface (profile percentile, recap) calls one
  function instead of a sixth inline `netOf`
- prerequisite for [07](07-share-card-frame.md): the brag ladder collapses onto these

## Decisions (grilled 2026-06-27)

**Scope: extract + test only; zero behaviour change.** Move three pure functions
to `src/lib/netScores.ts`. The router keeps every Prisma query and calls them.

- `averageNet(rows, minSamples)` returns `null` below `minSamples` so the two
  "don't compare dishonestly" floors (`MIN_TESTS_FOR_AVG_DELTA = 3`) read as one
  rule, not a scattered guard. The 30-day-delta and challenge-baseline callers
  pass `3`; the personal-best `reduce(max…)` at `:75` stays inline (it's a max,
  not a mean, and feeds a `> prevBest` compare with its own empty-set guard).
- `bestNetPerUser` returns the winning rows (not just numbers) so each caller
  keeps its own row→DTO shaping (username, image, rank).

Net remains derived by the canonical formula at calculation boundaries. A
2026-07-11 correctness follow-up additionally persists that value in
`Test.score` for database ordering and versions daily rollups so they average
per-test net values. See [02](02-net-wpm-home.md#storage-follow-up-2026-07-11).
