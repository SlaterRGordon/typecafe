# Architecture deepening candidates

Five candidates from the 2026-06-26 review, each grilled to a resolved scope.
All centre on the dual-source locality friction (ADR-0001): a Test's evidence —
key stats, transitions, progress — must read identically from a guest's
`localStorage` mirror or a signed-in user's Prisma rows.

| # | Candidate | Strength | Resolved scope |
|---|-----------|----------|----------------|
| [03](03-daily-rollup-extraction.md) | Lift daily-rollup math to `src/lib/` | Strong | Extract + test only; guest path untouched |
| [02](02-net-wpm-home.md) | Net WPM divergence | Strong (bug fix) | Make `netFromRaw` canonical; replace 2 share-card sites + regression test |
| [04](04-collapse-local-mirrors.md) | Collapse twin local mirrors | Worth exploring | `createKeyedStore`; fold `localSync` + `localTransitions`; `progressHistory` stays |
| [01](01-evidence-store-seam.md) | One guest/DB store seam | Strong | `useGuestImport` + `useGuestEvidence` hooks; fixes lost-transitions-on-sign-in |
| [05](05-keystroke-recorder.md) | Keystroke recorder in Typer | Speculative→committed | Deep recorder owns raw event log; characterization test first |

## Sequence (safe → risky)

1. **#03** — ✅ done. Pure extraction to `src/lib/dailyRollup.ts`, zero behaviour
   change, 8 unit tests.
2. **#02** — ✅ done. Both share-card sites now use `netFromRaw`; an existing
   test that pinned the old `raw·a` value was corrected + a regression test added.
3. **#04** — ✅ done. `createKeyedStore` owns read/write/add/clear; `localSync` +
   `localTransitions` are now configs (sanitize + merge); existing mirror tests
   cover it unchanged.
4. **#01** — ✅ done. `GuestImport` (app-wide) imports all three evidence
   families on sign-in — fixing the lost-transitions data-loss bug and absorbing
   `ProgressHistorySync` + the key-stats import effect. `useGuestEvidence` shares
   the guest read across /progress and /plan. progress + plan e2e green.
5. **#05** — ✅ done. `src/lib/keystrokeRecorder.ts` owns the raw event log +
   backspace handling; timeline / net counts / per-character attempts are derived
   from it (6 characterization tests pin the semantics first). Typer's four
   parallel refs collapse to one recorder; Text emits `onCharacterAttempt` +
   `onBackspace` and no longer reports counts. The completion `+1` lag-correction
   is gone (the recorder counts synchronously). Typer/Text e2e green.

## Round 2 (2026-06-27)

A second pass on the **signed-in write path** — the `test` router and the timer
hook — where the scoring numbers are computed *inside* the I/O instead of behind
a tested seam. Same root friction as round 1, other end of it: Net WPM isn't
stored, so every surface re-derives it.

| # | Candidate | Strength | Resolved scope |
|---|-----------|----------|----------------|
| [06](06-net-scores-aggregation.md) | Lift net-WPM aggregation to `src/lib/` | Strong | `netScores.ts` (`netOf`/`averageNet`/`bestNetPerUser`); replace 5 inline sites in `test.ts` |
| [07](07-share-card-frame.md) | Split share-card frame from queries | Worth exploring | `shareCard.ts` owns the brag-ladder deciders + threshold; router keeps lazy staging |
| [08](08-timer-ceremony-collapse.md) | Collapse timer to a countdown-only ticker | Worth exploring | Delete `actions`/`helpers`/`reducer`; rewrite `useTimer` to tick only when timed; keep `tick.ts` |
| [09](09-shallow-single-caller-utils.md) | Inline shallow single-caller utils | Speculative → ❌ rejected | On inspection all four carry depth of meaning; inlining `learnStars` would violate the scoring-in-lib rule |

**Discarded:** "keystrokeRecorder created but never fed during typing" — false;
`Typer.tsx:450/456` feed `append`/`backspace` live (#05 is wired correctly).

Order: **#06** (pure extraction, unlocks #07) → #07 → #08 (independent) → #09 (hygiene).

1. **#06** — ✅ done. `src/lib/netScores.ts` owns `netOf` / `averageNet` /
   `bestNetPerUser`; the 30-day-delta, challenge-baseline, leaderboard and
   challenge-board sites in `test.ts` now call it. Zero behaviour change; unit
   tests over plain row arrays, no Prisma.
2. **#08** — ✅ done (Level 2). `useTimer` is a countdown-only ticker over plain
   `useState`: it ticks only for timed (DECREMENTAL) tests; non-timed modes just
   stamp `actualStartTime` and lean on the recorder timeline as the clock.
   Deleted `actions`/`helpers`/`reducer`, shrank `types` to `TimerType`, kept
   `tick.ts`. Interface unchanged, so `Typer` untouched. Timed-expiry +
   no-countdown e2e green.
3. **#07** — ✅ done. `src/lib/shareCard.ts` owns the brag-ladder deciders
   (`personalBestBrag`, `globalPercentileBrag`) and `PERCENTILE_BRAG_THRESHOLD`;
   `buildBrag` keeps its lazy query staging and calls them. Delta/streak were
   already thin and stayed. 7 new tests pin the flattering-threshold boundary.
4. **#09** — ❌ rejected on inspection. The line-count shallowness hid real depth:
   `learnStars` is scoring math (standing rule keeps it in lib), `typeLanguage`
   guards a silent save-drop, `drillKeys` is multi-caller shared vocabulary,
   `format` stays. No code change; reasons recorded in the candidate doc.

## Round 3 (2026-06-27)

A third pass after the router and `src/lib/` were emptied of trapped math. The
remaining friction moved into the **Learn flow** and the **persistence hooks** —
progression logic running untested inside a 611-line page, and a small piece of
drain math copied across the guest/DB seam.

| # | Candidate | Strength | Resolved scope |
|---|-----------|----------|----------------|
| [10](10-learn-ladder-progression.md) | Lift the Learn level-ladder progression to `src/lib/` | Strong | `learnProgression.ts` (`ladderState`/`resumeLevel`/`nextLevel`/`mergeProgress`/`gradeResult` + mappers); extract + test, behaviour untouched |
| [11](11-learn-save-hook.md) | `useLearnProgress` hook for the dual-source save | Worth exploring | Consolidate the optimistic guest/DB save dance into one named hook; depends on #10 |
| [12](12-drain-synced-attempts.md) | One pure `drainSyncedAttempts`, two callers | Worth exploring | Dedupe the verbatim subtract-synced loop in `useTestPersistence` into a tested pure function |
| [13](13-progress-hero-derivation.md) | Extract the Progress hero delta | Speculative | Move the trend-endpoint `heroDelta` into `src/lib/progress`; marginal, surrounding math already deep |

Order: **#10** (pure extraction, unlocks #11) → #11 → #12 (independent) → #13 (lowest priority).

1. **#10** — ✅ done. `src/lib/learnProgression.ts` owns the unlock ladder, merge,
   resume/next navigation, grading and the wire↔domain mappers; `learn.tsx` is now
   wiring over it. Killed the ×2 grade + ×3 normalization duplications. 19 unit
   tests pin current behaviour; learn e2e 8/8 desktop + mobile (unchanged). Added
   the **Learn ladder** vocabulary (Level, Unlock) to `CONTEXT.md`.
2. **#11** — ✅ done. `src/hooks/useLearnProgress.ts` owns the dual-source save
   seam (saved query, both mutations, the merge derivation, localStorage, alerts).
   `save`/`importDevice` resolve with the outcome; the page awaits and drives the
   modal + level advance, no longer branching on session. ~90 lines left the page.
   learn e2e 8/8 desktop + mobile.
3. **#12** — ✅ done. `src/lib/practiceAttempts.ts` `drainSyncedAttempts` replaces
   the verbatim drain loop in both `syncCharAttempts` branches; mutates the live
   Map in place so in-flight keystrokes survive. 6 unit tests.
4. **#13** — ✅ done. `heroDelta` lifted to `src/lib/progress.ts`; the page's
   `hero` memo is one call and the dead `wpm.line` field dropped. 5 unit tests.

All four round-3 candidates complete.

**Carried out of #10's grilling:** the persisted `{options, speed}` wire names
were judged confusing enough to translate to domain `{levelName, netWpm}` at each
boundary rather than spread through the logic; the gating returns a domain
`LevelStatus[]` so react-select vocabulary stays in the page; `levels` is imported
(one ladder, no speculative seam).

## Notes carried out of grilling

- No ports/adapters layer anywhere: tRPC is hooks-only (`createTRPCNext`), so the
  signed-in side can't sit behind a pure substitutable seam. Consolidate into
  named hooks instead.
- #02 is a bug fix, not a deepening — `netFromRaw` is already the formula's home;
  two share-card sites compute a *different* net WPM (`raw·(accuracy/100)` vs the
  canonical `raw·(2a−1)`).
- The lost-transitions-on-sign-in gap (#01) is the only hard correctness bug in
  the set: guest transitions are shown on /progress and /plan but never imported
  to the DB on sign-in.
