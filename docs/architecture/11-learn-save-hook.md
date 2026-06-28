# A `useLearnProgress` hook for the dual-source save

**Strength:** Worth exploring · **Category:** in-process **Status:** ⏳ pending

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

## Notes

Depends on [10](10-learn-ladder-progression.md) (the pure `mergeProgress` /
`gradeResult` underneath). In bounds of ADR-0002 — this *is* the prescribed
remedy (a named hook, not a ports/adapters seam). Not yet grilled.
