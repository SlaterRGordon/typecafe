# Extract the Progress hero delta

**Strength:** Speculative · **Category:** in-process **Status:** ⏳ pending

## Files

`src/pages/progress.tsx` — `:138–171` (`fitLine`, `wpm`, `hero`)

## Problem

Most of the dashboard's math is already deep and tested in `src/lib/progress` /
`src/lib/trajectory` (`rejectOutliers`, `trendSeries`, `linearTrend`,
`personalRecords`, `dailyRollups`, `detectPlateau`). What's left inline is the
**hero delta**: the `useMemo` that reads the WPM trend line's first/last
endpoints and turns them into `{start, current, delta, trend}` — the single
number a user shares. It has no test pinning it.

## Solution

Extract `heroDelta(series)` (and the `fitLine` closure) into `src/lib/progress`.
The page reads the result.

## Before / After

```
Before                                   After
──────                                   ─────
progress.tsx                             lib/progress
  fitLine() closure                        heroDelta(series): {start,current,
  hero = line endpoints → delta/trend        delta,trend}
        (untested, in render)            ──────── called by ────────
  ── over already-deep lib math ──       progress.tsx reads it
```

## Benefits

- locality: the shared headline number gets a test

## Notes

Marginal — the surrounding math is already extracted, so this is one small
derivation, not a trapped module. Listed for completeness; lowest priority of the
round. Not yet grilled.
