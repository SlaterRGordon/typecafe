# Phase 0 — Trust

**Goal:** a skeptic typing side-by-side on TypeCafe and Monkeytype gets numbers that agree, and we can explain every decimal.

**Why first:** the first Reddit comment on any launch will compare our WPM to Monkeytype's. A coach with wrong numbers is a quack; nothing in Phases 1–6 survives losing that thread.

---

## 0.1 Scoring correctness bugs (L, highest priority)

All are already characterized; each fix lands with a unit test in `src/lib/stats.ts`'s suite plus an e2e where observable.

| Bug | Symptom | Fix sketch |
|---|---|---|
| ✅ Live accuracy undercount | 3-of-4 correct shows **50.00%**, 2-of-3 shows **33.33%** — consistently one correct short | First-keystroke handling in Typer: the `currentPosition > 0` guard drops the first correct keystroke from counts. Count every keystroke from position 0; timer starts on first keystroke, correct or not. **Done:** `Text.tsx` counts from position 0 and starts the timer on the first key; e2e regression in `home.spec.ts`. |
| ✅ First-char wrong keys are free | Mistakes on char 0 don't count at all | Same guard removal — errors at position 0 must hit accuracy. **Done:** same fix; e2e asserts a wrong first key reads 0.00%. |
| ✅ Countdown drift | Each tick re-creates the interval; latency accumulates; `onTimeOver` fires late | Rewrite `useTimer` to derive remaining from `Date.now() - startTime` in a stable interval; next-tick delay = `start + n*1000 - now`. **Done:** pure `deriveTimerTime`/`nextTickDelay` in `tick.ts`; unit test proves <100ms drift over 60s with jitter. |
| ✅ Grams micro-sample WPM | "500.0 wpm (500.0avg)" after a 2-char level | No WPM render until ≥ 1s elapsed **and** ≥ 5 keystrokes; show "—" (the pending pattern already exists in `Stats.tsx`). **Done:** pure `isReliableWpmSample` gates the WPM/avg display to "—" (live + on completion); progression unchanged. |
| ✅ Timed-mode text exhaustion | Long custom tests deadlock at 500 words | Reuse relaxed-mode's append-on-demand generation for timed mode. **Done:** `Text.tsx` appends for timed mode too; e2e covers expiry past the buffer. |
| ✅ N-gram repetition explosion | `ngram += ngram` doubles per step → 2ⁿ copies | `base.repeat(n + 1)`, clamp ≤ 20. **Done:** `generateNGram` uses `repeat(repetition + 1)` clamped to 20; `utils.test.ts` covers it. |
| Failed save swallows results | Signed-in + network error = blank screen after test | `onError` → still call `onTestComplete` with `persisted: false`, toast the failure, offer retry |

## 0.2 The measurement contract (M)

- **Unit-test the whole of `src/lib/stats.ts`**: `computeStats`, `buildWpmSamples`, `charsAtElapsed`, `instantaneousWpm`, `consistencyFromSamples`, `worstKeysFromAttempts`. Table-driven cases including: empty timeline, single keystroke, burst typing, mid-test pauses, all-wrong input, backspace sequences.
- **Define accuracy semantics once, in writing**: keystroke accuracy (correct keystrokes / total keystrokes, backspace excluded) is *the* accuracy. Documented in code and on the public page. If we ever also show char-level "real accuracy", it gets a distinct name.
- **Publish `/how-we-measure`** — plain-language page: raw vs net WPM formulas, the 5-chars-per-word convention, accuracy definition, consistency definition (coefficient of variation on WPM samples), what "unranked" means. Trust artifact + ranks for "how is wpm calculated". Linked from every score card's existing `?` tooltips.

**Progress:** 2026-06-20 - `src/lib/stats.test.ts` now covers every exported stats helper plus the named edge cases (empty/single timelines, backspaces, mid-test pauses, all-wrong input, bursty consistency, tiny WPM samples). `/how-we-measure` is live with raw WPM, net WPM, accuracy, consistency, progress deltas, unranked rules, and coach/diagnosis thresholds; score-card help icons link to it; screenshot tour captures `55-how-we-measure`.

## 0.3 Visible-credibility polish (S–M)

Details that signal whether anyone careful lives here:

- `20.566666666666666 mins` on profile → humanized `20.6 min` / `2h 14m` formatter in `src/lib/format.ts`, used by every stat surface
- Clipped avatar fallback (leaderboard, profile, score rows) → proper initials/icon fallback component
- Pre-test spacebar highlight: keyboard shows space as the active key before the first keystroke — `currentKey` init bug; the highlighted key must be the actual first character
- "0 tests in 2026" heatmap rendering above a Best Scores table that shows a 2026 score — make both read the same source
- Smart drill button floating detached above the practice keyboard → anchored toolbar (proper home comes in Phase 2)

## 0.4 Refactors that gate later phases (M)

Only what later phases need — not a beautification pass:

- Finish the Typer decomposition already started in `src/components/typer/hooks/` so completion flow is testable (Phase 1 hangs diagnosis off completion)
- One zod-derived `ScoreSnapshot` source of truth in `src/lib/score.ts` (Phase 3 extends the snapshot; three drifting copies would hurt)

## Acceptance

- [ ] Side-by-side manual test vs Monkeytype: WPM within ±1, accuracy within ±0.5 for identical input
- [x] `vitest` suite covers every exported function in `src/lib/stats.ts`
  - 2026-06-20: `stats.test.ts` covers `computeStats`, `buildWpmSamples`, `charsAtElapsed`, `instantaneousWpm`, `consistencyFromSamples`, `worstKeysFromAttempts`, `isReliableWpmSample`, and `wpmImprovement`, including Phase 0's named edge cases.
- [x] `/how-we-measure` live, linked from score-card tooltips
  - 2026-06-20: public page added at `/how-we-measure`; score-card `?` links point there and e2e asserts the WPM help link.
- [x] Screenshot tour passes; new states: how-we-measure page, corrected live stats mid-test
  - 2026-06-20: screenshot tour captures `55-how-we-measure`; corrected mid-test live stats remain covered by `02-home-mid-test-with-error`.
- [x] No timer drift > 100ms over a 60s test
  - 2026-06-14: `src/hooks/timer/tick.test.ts` proves the 60s countdown reaches zero within 100ms despite per-tick jitter.

**Owner's part:** the side-by-side comparison sessions (real hands on real keyboards), final read of `/how-we-measure` copy.
