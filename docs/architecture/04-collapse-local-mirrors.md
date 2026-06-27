# Collapse the twin local mirrors

**Strength:** Worth exploring · **Category:** local-substitutable

## Files

`src/lib/localSync.ts` · `src/lib/localTransitions.ts` · `src/lib/progressHistory.ts`

## Problem

Three near-identical shallow modules duplicate `storage / sanitize / merge /
read / write` — interface nearly equal to implementation. The only real
variation is the per-record validator (and `progressHistory` is append+cap
instead of merge). A change to the storage contract (e.g. move to IndexedDB)
means three edits.

## Solution

One keyed local store parameterised by a per-record validator and a merge
strategy; the three families become three small configs. Deletion test passes:
folding them concentrates the read/sanitize/cap/write logic in one place, only
the validators stay distinct.

## Before / After

```
Before: same shape ×3                    After: one keyed store + 3 validators
──────                                   ─────
localSync         localTransitions       localStore(key, sanitize, merge)
  storage()         storage()            ── configs ──
  sanitize()        sanitize()           keyStat | transition | progress
  merge()           merge()
  read/write        read/write
progressHistory: storage/sanitize/append+cap/read/write
```

## Benefits

- interface shrinks; implementation absorbs the wrappers
- one storage contract, not three
- natural adapter point for candidate 01's seam

## Note

Pairs with candidate 01 — this store is the `localStorage` adapter behind that
seam. Worth exploring rather than Strong: the bodies are short, so the win is
mostly removing a future three-way edit.

## Decisions (grilled 2026-06-26)

**Fold the two true twins now.** Build `createKeyedStore(key, sanitize, merge)`
owning `storage` injection + `read` / `write` / `add` / `clear`. `localSync`
(key stats) and `localTransitions` become small configs supplying their
validator and merge strategy.

**`progressHistory` stays separate** — it's append+cap with no merge, a
genuinely different access pattern; bending it into the keyed store isn't worth
it.

Note: the report's "this becomes candidate 01's localStorage adapter" rationale
is dropped — 01 is no longer a ports/adapters seam. Remaining justification is
the two-instances-of-one-pattern principle and removing a future two-way edit
(~70 lines). Modest but accepted.
