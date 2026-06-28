# Lift the daily-rollup math out of the test router

**Strength:** Strong · **Category:** in-process **Status:** ✅ done

## Files

`src/server/api/routers/test.ts:150–255` → `src/lib/` (new module)

Specifically `aggregateProgressHistory`, the running-average update inside
`upsertDailyUserStat`, and `dailyUserStatRollup`.

## Problem

Scoring math — incremental averages, best-of, day bucketing — is sealed inside a
tRPC mutation, so it's testable only through Prisma. The guest path never
aggregates at all (`progress.tsx` reads raw entries directly), so the rollup
exists in one source only. This violates the standing rule: _"scoring math lives
in `src/lib/` as pure functions with unit tests, never inside components."_

## Solution

Move the aggregation + running-average update to `src/lib/` as pure functions;
the router does I/O and calls them, and the guest read can later share the same
aggregation.

## Before / After

```
Before                                  After
──────                                  ─────
tRPC mutation (needs Prisma to run)     lib/dailyRollup.ts  (deep, tested)
  aggregateProgressHistory()              aggregate · merge averages · rollup
  running-avg update (upsert)           ──────── called by ────────
  dailyUserStatRollup()                 test.ts — Prisma in, lib out
  prisma.findUnique/create/update
```

## Benefits

- locality: averaging math in one tested module
- the interface is the test surface — no DB
- one aggregation feeds both sources
- obeys the standing rule, already written

## Note

Lowest-risk move on the board — pure extraction, no behaviour change.

## Decisions (grilled 2026-06-26)

**Scope: extract + test only.** Move three pieces to `src/lib/dailyRollup.ts`:
- `aggregateProgressHistory(entries, utcOffset)` (already pure)
- `mergeDailyStat(existing | null, aggregate)` — the running-average / best-of
  update currently inlined in `upsertDailyUserStat`, pulled out as a pure
  function returning the new row values
- `dailyUserStatRollup(row)` (already pure)

`test.ts` keeps the Prisma `findUnique` / `create` / `update` and calls
`mergeDailyStat` for the values. **Guest `/progress` path stays untouched** — it
already works reading raw entries; rewiring it to share the aggregation is
deferred (YAGNI unless guest/signed-in charts visibly disagree).

Zero behaviour change; satisfies the standing rule (scoring math in `src/lib/`,
unit-tested). Lowest-risk item — good warm-up.
