# Progress chart readability — plan

Problem: the WPM/accuracy charts are hard to read. Scatter is good; the
rolling-average line wiggles and the hero delta ("−0.3") flips on noise. Root
cause for both: junk tests (stopped typing, fat-fingered restarts) are counted.

Vision check: this *proves you're getting faster* more honestly. In scope.

## 1. Drop outlier tests (the root fix)

- Pure fn in `src/lib/progress.ts`: `rejectOutliers(records)`.
- Low-side only, robust: drop a test whose WPM is below `median − k·MAD`
  (k≈2.5) of the record set. Highs are real PBs — keep them.
- Also drop obviously-broken tests: accuracy below a floor (e.g. <50%) or
  WPM near 0 ("stopped typing"). ponytail: simple floors, tune later.
- Skip imported rollup records (day-averages, no per-test signal — `r.day` set).
- Apply **once** in `ProgressDashboard` before delta/series/records so every
  number downstream is honest, not just the chart.
- Unit test: a set with one 0-WPM "stopped" test → rejected; a legit PB → kept.

## 2. Flat trend line instead of the squiggly one

- Pure fn: `linearTrend(points) → { slope, at(t) }` (least-squares over t,wpm).
- Replace the rolling-average line in `TrendChart` with a single straight fit
  line across the period. Clear direction, no wiggle.
- **Feed the hero delta from the same line**: start = fit at window start,
  current = fit at window end. The "−0.3" then *matches* the line the user
  sees, instead of being a separate noisy window-avg subtraction.
- Drop `rollingAverage`/`defaultRollingWindow` usage on this chart (keep the
  fn if other callers exist; else delete — check first).
- Unit test: known points → expected slope/endpoints.

## 3. Best-WPM-per-day line (additive)

- Reuse `dailyRollups(...).bestWpm`; plot as a second, lighter line (your
  ceiling rising over time). Two lines max — trend (primary) + daily-best
  (secondary). No third line.
- `TrendChart` gains an optional secondary line prop.

## Skipped / not doing

- No keeping both rolling-avg AND regression — regression is the readable one.
- No per-test duration-based outlier filter yet (Test rows don't store
  duration; the WPM/accuracy floors cover the "stopped typing" case).
- No new deps — all of this is ~3 pure fns + SVG path changes.

## Verify

- `npx vitest run` (new fns), update `tests/e2e/screenshots.spec.ts` tour,
  eyeball /progress with real history.
