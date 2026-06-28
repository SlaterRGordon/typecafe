# One pure `drainSyncedAttempts`, two callers

**Strength:** Worth exploring · **Category:** in-process **Status:** ⏳ pending

## Files

`src/components/typer/hooks/useTestPersistence.ts` — `:120–129` ≡ `:138–145`

## Problem

`syncCharAttempts` drains the per-character attempts ref after a sync — subtract
exactly what was sent, keep keystrokes typed while the request was in flight,
delete a key once it hits zero. That loop is written **twice, byte-for-byte**:
once for the guest localStorage path, once for the signed-in mutation's
`onSuccess`. It's money-path arithmetic (lose the subtraction and you double-count
or drop practice stats), and neither copy is tested in isolation — the only way in
is mounting `Typer` and firing keystrokes.

## Solution

One pure `drainSyncedAttempts(ref, synced)` over the ref's `Map`; both branches
call it. The "subtract what synced, keep the rest" rule gets a single home and a
single unit test.

## Before / After

```
Before                                   After
──────                                   ─────
useTestPersistence.syncCharAttempts      drainSyncedAttempts(ref, synced)
  guest path  → subtract-synced loop  ┐    one tested function
  DB onSuccess → subtract-synced loop ┘  ──────── called by ────────
        identical, untested              guest path · DB onSuccess
```

## Benefits

- locality: the drain math in one place; a fix can't skip the other path
- leverage: one interface, two call sites
- testable without mounting `Typer` — assert over a `Map` directly

## Notes

Small, clear ceiling. Independent of [10](10-learn-ladder-progression.md) /
[11](11-learn-save-hook.md). Not yet grilled.
