# Inline shallow single-caller utilities (inverse deepening)

**Strength:** Speculative · **Category:** in-process **Status:** ❌ rejected on inspection (2026-06-27)

## Files

- `src/lib/trainStars.ts` (32) → `train.tsx` only
- `src/lib/typeLanguage.ts` (10) → type router only
- `src/lib/drillKeys.ts` (18) — predicates split from `drill.ts`
- `src/lib/format.ts` (7) — **keep**

## Original problem (as flagged)

A few `src/lib` files looked **shallower than the hop costs**: `learnStars` reads
as three `if`-branches on one number, `typeLanguage` as one string call — each
with a single caller. The line-count deletion test suggested these *move*
complexity rather than *concentrate* it.

## Why it was rejected

On reading the actual code, each module carries **depth of meaning** that the line
count hid — the deletion test fails (inlining moves complexity, and twice makes
things worse):

- **`learnStars.ts` — scoring math; the standing rule forbids the move.** The
  star thresholds (`wpm × 1.15`, `× 1.3`) are product decisions, not arithmetic.
  CLAUDE.md: *"Scoring/diagnosis math lives in `src/lib/` as pure functions with
  unit tests — never inside components."* Inlining into `train.tsx` would violate
  it outright. Single-caller today; still belongs in lib.

- **`typeLanguage.ts` — a load-bearing correctness rule, not a one-liner.**
  Collapsing `englishNk` variants to the seeded `english` TestType is what stops a
  signed-in user's score from *silently failing to save* (an unseeded language
  makes `findFirst` return null). Burying that documented gotcha in the router
  trades a named rule for a hidden trap.

- **`drillKeys.ts` — not single-caller.** Imported by `typer/utils.tsx` and
  `drill.tsx`, and it's the declared single source of truth diagnosis/the drill
  compiler/the typer all share. Multi-caller shared vocabulary — keep.

- **`format.ts` — keep**, as originally noted (one app-wide number format).

## Outcome

No code change. The reasons already live where a future reviewer will look (the
CLAUDE.md standing rule for `learnStars`; each file's own header comment for
`typeLanguage` and `drillKeys`), so no separate ADR is warranted — this doc closes
the loop. Lesson: a low line count is not shallowness when the module names a
product rule, guards a correctness trap, or is a shared vocabulary.
