# ADR 0005 — Key/transition aggregates are rolling windows, not lifetime sums

Decided 2026-07-04 with the owner.

## Problem

Unbounded running sums have a staleness bias: a new sample moves a pair's mean
by `(x − mean) / N` where N is all history, so the more a user has typed, the
slower the coach notices improvement. The bias concentrates on exactly the
pairs/keys the coach flags (they carry the longest slow history), and error
counts never decayed at all. A fixed weakness could stay "weak" for months —
directly against "prove they're getting faster."

## Decision

Cap each aggregate's effective sample count — `TRANSITION_SAMPLE_CAP` (200 per
pair) and `KEY_ATTEMPT_CAP` (500 attempts per key). When a merge pushes past
the cap, all fields scale down proportionally (mean and error/accuracy rate
preserved), making the stored value an EWMA over roughly the last cap-many
samples of that key/pair. Decay is by *practice volume*, not wall-clock time:
heavy typists' coach adapts fast, casual typists keep enough history for
signal, and a vacation doesn't erase data.

The same arithmetic runs in every merge path: `mergeTransitions` /
`mergeKeyStats` (guest localStorage, display merges) and the two `batchSync`
SQL upserts. The cap constants live beside the merge code
(`lib/transitions.ts`, `lib/practiceAttempts.ts`) and are surfaced on
/how-we-measure. Legacy over-cap rows scale down on their next write; a row
that never gets another write keeps its (mean-accurate) value, so no backfill
is needed.

## Consequences

- These rows can no longer answer "how have I improved since spring" — they
  deliberately forget. Locked constraint #2 keeps full keystroke timelines, so
  any future then-vs-now view (e.g. time-bucketed per-pair history) can be
  backfilled by re-aggregating timelines. Don't try to read history out of
  these rows.
- UI copy must say "recent", not "lifetime" (drill header/delta, progress
  keyboard card).
- `count`/`total` fields are bounded (≤ cap), which also retires the Int
  overflow ceiling noted on `TransitionStat.totalMs`.
