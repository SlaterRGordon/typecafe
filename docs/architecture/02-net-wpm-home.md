# Give net WPM a home

**Strength:** Strong (correctness fix, not a deepening) · **Category:** in-process **Status:** ✅ done

## Files

`src/lib/stats.ts` (`netFromRaw`) · `src/server/api/routers/test.ts` (×10) ·
`src/pages/progress.tsx` (×3) · `src/lib/progress.ts` · `src/components/scores/Scores.tsx`
— 25 call sites across 6 files.

## Problem

At the time of this review, net WPM was the canonical headline metric (CONTEXT:
_"the headline speed number"_) but had no storage home. Both sources stored the
same raw fields — guest `localStorage` and the DB persisted `speed` (raw WPM) +
`accuracy` — and net was derived on read. Most sites called
`netFromRaw(speed, accuracy)` =
`raw·(2a−1)`, but the share cards derive it **differently**:

- `src/lib/stats.ts:41` → `raw·(2a−1)` — /progress, leaderboard, challenge.
- `src/server/og/scoreData.ts:126` and `src/pages/score/[slug].tsx:414` →
  `raw·(accuracy/100)`, used as the fallback when a snapshot lacks `netWpm`.

So the brag surface can show a **different** WPM than the leaderboard for the
same run. The missing home isn't just verbosity — it's already produced two
divergent definitions of the headline number.

## Solution

A reader that takes a raw stored row (`{ speed, accuracy }`) and returns net
WPM; the formula `net = raw·(2a−1)` lives behind it. Callers ask
"what's the net WPM of this row?" instead of recomputing it.

## Before / After

```
Before: every read carries the rule          After: one canonical reader
──────                                        ─────
test.ts    [net = raw·(2a−1)]                 wpm(row)  ← short interface
progress   [net = raw·(2a−1)]                 ┌─────────┐
Scores     [net = raw·(2a−1)]                 │ formula │ ← deep impl
…          [net = raw·(2a−1)]   ×25           └─────────┘
```

## Benefits

- locality: the WPM rule concentrates in one module
- leverage: one interface, 25 call sites
- a formula change touches one place
- already unit-tested — extend, don't add a surface

## Decisions (grilled 2026-06-26)

**Canonical formula: `raw·(2a−1)` (`netFromRaw`).** It's what every ranked
surface already uses (leaderboard, /progress, percentile, challenge). The
share-card `raw·(accuracy/100)` is the outlier and gets replaced — lowest blast
radius, only share cards change.

**Scope: this is a bug fix, not a deepening.** `netFromRaw` is *already* the
single home for the formula; the other 23 sites all call it. The only real defect
is the two hand-rolled share-card sites. So:

1. Replace `src/server/og/scoreData.ts:126` and `src/pages/score/[slug].tsx:414`
   fallbacks with `netFromRaw(speed, accuracy)`.
2. Add a regression test pinning both share-card paths to `raw·(2a−1)`.

No new `netWpmOf(row)` reader — that's type sugar over a function that already
exists (rejected as speculative). ~5 lines changed, 1 test added.

Note: snapshot `netWpm` from `computeStats` is already algebraically `raw·(2a−1)`,
so only the *fallback* path (older snapshots without `netWpm`) diverges today.

## Storage follow-up (2026-07-11)

The formula still lives in `netFromRaw`, but ranked database ordering now stores
that canonical value in `Test.score`. This follow-up became load-bearing when a
full-site audit found profile best/percentile queries ordering the legacy
`raw·accuracy` score, plus daily rollups trying to reconstruct net from two
separate averages. Migration `20260711140000_canonical_net_wpm` backfills Test
scores; version-2 daily rows average per-test net values before folding.

Slice 0 of adaptive skill coaching completed the other storage boundary on
2026-07-14: signed-in Progress reads `Test.score`, guest progress v2 stores
canonical net WPM, and legacy unversioned guest entries convert from raw WPM
and saved Accuracy on read. Raw `speed` and `accuracy` remain available for
explanation and compatibility; `netScores.ts` still derives net only for older
aggregation paths that intentionally select those raw fields.
