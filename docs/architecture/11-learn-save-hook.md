# A `useLearnProgress` hook for the dual-source save

**Strength:** Worth exploring · **Category:** in-process **Status:** ✅ done

## Files

`src/pages/learn.tsx` — `:206–261` (`importDeviceProgress`), `:282–315`
(`onTestComplete` save path), `:323–328` (silent-import effect)

## Problem

After [10](10-learn-ladder-progression.md) makes the merge pure, the page still
improvises the **guest↔DB convergence** inline: three call sites each route on
`sessionData?.user`, build the localStorage write or the `mutateAsync` +
`refetch` + optimistic re-merge, and a silent-import `useEffect` races the manual
import button. This is the same seam the app already solved once with
`GuestImport` / `useGuestEvidence` / `useTestPersistence` (ADR-0001, ADR-0002) —
re-derived here, tangled into render.

## Solution

A named `useLearnProgress(difficulty)` hook owning the save seam:

- reads the guest mirror vs the DB query, returns merged `completedProgress`
- `save(entry)` / `import()` route on session and own the optimistic merge + refetch
- the silent-import effect moves inside, with one source of truth for "import in flight"

The page renders the ladder and the modal over it; no `session` branching in the
body.

## Before / After

```
Before                                   After
──────                                   ─────
learn.tsx render body                    useLearnProgress(difficulty)
  onTestComplete → guest? LS : mutate      save() / import() own the routing
  importDeviceProgress → mutate+refetch    optimistic merge + refetch inside
  useEffect silent-import (races)          one in-flight signal
        I/O smeared across render        ──────── returns ────────
                                         { progress, save, import } → page
```

## Benefits

- locality: one hook owns the seam's I/O; the page stops branching on session
- matches the existing `GuestImport` / `useTestPersistence` pattern (ADR-0002:
  consolidate convergence into a named hook, not a port)
- removes the silent-import vs manual-import effect race

## Decisions (grilled 2026-06-27)

- **Promise-returning actions, not callbacks.** `save(entry)` resolves to
  `{saved, nextProgress}`; `importDevice({silent})` resolves to the refreshed
  account progress (or null). The page `await`s and drives `showCompletion` /
  `advanceToNextLevel` itself — the hook owns I/O + the optimistic merge, the page
  owns its UI reactions. Reads like the prior async flow, relocated.
- **Two effects, each owns its state.** The hook reloads the guest mirror and
  drops optimistic entries on difficulty change; the page keeps a one-line
  `useEffect(() => setCompletion(null), [difficulty])` for its modal.
- **Level-advance stays in the page.** The silent auto-import path advances the
  level (page state) and interacts with the resume-level effect, so the hook
  exposes `canSilentImport` and the page owns `advanceToNextLevel`; both the
  button and the silent effect call `importDevice().then(advance)`.
- **E2e is the safety net.** The hook is React I/O with no pure seam to mock
  (ADR-0002), like `useTestPersistence` / `useGuestEvidence` — no hook unit test.
  The pure merge/grade underneath is already unit-tested from #10.

## Outcome

`src/hooks/useLearnProgress.ts` owns the saved query, both mutations, the
`localProgress`/`optimisticProgress`/`persistedProgress` derivation, the
localStorage load and the alerts. `learn.tsx` lost ~90 lines of save/import
orchestration and no longer branches on session in its body. Verified: `tsc`
clean; 360 unit tests pass; learn e2e 8/8 desktop + mobile.

Depends on [10](10-learn-ladder-progression.md) (the pure `mergeProgress` /
`gradeResult` underneath). In bounds of ADR-0002 — a named hook, not a
ports/adapters seam.
