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
