# Inline shallow single-caller utilities (inverse deepening)

**Strength:** Speculative · **Category:** in-process **Status:** open

## Files

- `src/lib/learnStars.ts` (32) → `learn.tsx` only
- `src/lib/typeLanguage.ts` (10) → type router only
- `src/lib/drillKeys.ts` (18) — predicates split from `drill.ts`
- `src/lib/format.ts` (7) — **keep**

## Problem

A few `src/lib` files are **shallower than the hop costs**: `learnStars` is three
`if`-branches on one number, `typeLanguage` is one string call — each with a
single caller. The deletion test says these *move* complexity, not *concentrate*
it; inlining costs nothing and removes a jump. This is the inverse of a
deepening — a module too thin to earn its seam.

## Solution

Inline the trivial single-callers into their one call site. **Keep `format.ts`** —
its job is one consistent number format used app-wide, which is real shared
meaning, not indirection.

## Caveat

Hygiene, not architecture; lowest priority on the board. Each file currently
carries its own micro-test, so inlining trades a test for less indirection — only
do it where the call site is genuinely the only home, and fold the assertion into
the caller's nearest existing test rather than dropping coverage.
