# Route every Test's evidence through one store seam

**Strength:** Strong · **Category:** ports & adapters

## Files

`src/components/typer/hooks/useTestPersistence.ts` · `src/pages/progress.tsx` ·
`src/pages/plan.tsx` · `src/components/progress/ProgressHistorySync.tsx` ·
`src/lib/localSync.ts` · `src/lib/localTransitions.ts` · `src/lib/progressHistory.ts`

## Problem

Every Test produces evidence — key stats, transitions, a progress entry — and
ADR-0001 requires each metric to read identically from a guest's `localStorage`
mirror or a signed-in user's Prisma rows. That constraint is sound, but it's
implemented as the **same branch re-decided everywhere**:

- `if (!sessionData?.user)` forks at six sites (write in `useTestPersistence`
  ×3, read in `progress.tsx` and `plan.tsx`, import in `ProgressHistorySync`).
- Sign-in import is split: key stats in `useTestPersistence` (effect), progress
  in `ProgressHistorySync`, and **transitions have no import path at all** —
  guest transitions are silently lost on sign-in.
- Nothing owns "persist this Test's evidence."

## Solution

One module owns reading, appending, and importing a Test's evidence behind a
single seam. Callers ask for evidence, not for "localStorage or server." Two
adapters justify the seam: `localStorage` in prod, in-memory in tests.

## Before / After

```
Before                                   After
──────                                   ─────
useTestPersistence ─if(!user)?─┬ local    Typer  /progress  /plan
progress.tsx       ─if(!user)?─┤ tRPC          │  one interface
plan.tsx           ─if(!user)?─┤              [ Evidence store ]  (deep)
ProgressHistorySync (signin)   │             ── seam ────────────
transitions        ─ (no path) ┘             localStorage | tRPC adapter
```

## Benefits

- locality: the guest/DB branch lives once
- leverage: one interface, six call sites
- the seam is the test surface — no session mock
- closes the lost-transitions-on-signin gap

## ADR note

Affirms ADR-0001, does not contradict it — dual-source stays; this localises the
branch the ADR's "dual-source path" cost note predicted.

## Decisions (grilled 2026-06-26)

**Shape: consolidate, don't abstract.** No ports/adapters layer — the signed-in
side is tRPC `useMutation` hooks (`createTRPCNext`, no vanilla client), so a pure
substitutable seam isn't cheaply achievable and the DB side stays hook-tested
regardless. Two concrete moves instead:

1. **`useGuestImport`** — one hook that, on first sign-in, imports *all* guest
   evidence: key stats + transitions + progress entries. Fixes the
   lost-transitions-on-sign-in data-loss bug, and absorbs the standalone
   `ProgressHistorySync` component and the key-stats import effect in
   `useTestPersistence`. Each family clears its `localStorage` only on its own
   sync success.
2. **`useGuestEvidence`** — one read hook returning `{ records, keyAttempts,
   transitions }` from `localStorage`, shared by `progress.tsx` and `plan.tsx`
   (currently a verbatim triple-read in both).

The write branch stays in `useTestPersistence`; the pure `localStorage` helpers
stay pure and unit-tested. The guest/DB branch ends up in two named hooks instead
of six ad-hoc sites.

**Revised wins** (the report's "no session mock / in-memory adapter" was
overstated — DB side is hooks):
- locality: the sign-in import + guest read each live in one hook
- closes the lost-transitions-on-sign-in gap (the only hard bug here)
- one sign-in import path, not three (+ one missing)
