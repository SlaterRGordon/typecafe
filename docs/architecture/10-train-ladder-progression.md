# Lift the Train level-ladder progression to `src/lib/`

**Strength:** Strong · **Category:** in-process **Status:** ✅ done

> Threshold/grading model superseded by [ADR-0003](../adr/0003-train-thresholds-and-kinds.md)
> (formula-derived `targetWpm`, ramp-multiplier difficulty, per-kind `gradeLevel`,
> paced bosses). The unlock/resume/next ladder lib described below is unchanged.

## Files

`src/pages/train.tsx` (611) → `src/lib/trainProgression.ts` (new module)

The page held the ladder's progression logic inline and untested:

- `:173` — `getLevelOptions` — unlock gating (prev level's net WPM ≥ prev requirement)
- `:40` — `mergeTrainProgress` — keep-max fold of an attempt into lifetime progress
- `:205` — `progressSelectedLevel` — resume level (first-locked − 1)
- `:212` / `:276` — `advanceToNextLevel` / `nextLevelNameFromProgress` — next unlocked
- `:289` ≡ `:307` — requirement + `starsFor` grade computed **twice**
- `:190` / `:238` / `:339` — persisted-row normalization repeated **three times**

## Problem

Every other scoring/progression rule in the app is a tested pure function in
`src/lib/` (the standing rule). The Train ladder is the exception: its unlock
gate, merge, resume/next navigation and per-result grading run **inside a
611-line page**, reachable only by mounting the component and hydrating
localStorage. The interface is the whole page — there is no **seam** to test the
unlock rule through. The blocks are individually **shallow**, but deleting them
in favour of named calls *concentrates* the "which levels are open, what's next,
how is a result graded" rule instead of moving it.

## Solution

A pure `src/lib/trainProgression.ts` owning the ladder:

- `ladderState(progress, difficulty): LevelStatus[]` — the deep core: Level 1
  always Unlocked; every other Level opens once the prior Level's best net WPM
  meets its requirement (accuracy not gated). Carries each Level's best stars.
- `resumeLevel(progress, difficulty)` / `nextLevel(progress, levelName, difficulty)`
  — navigation, built on `ladderState`.
- `mergeProgress(progress, entry)` — keep-max fold.
- `gradeResult(level, difficulty, result)` — composes the level's requirement,
  `starsFor` (from `learnStars`), and the saveable entry, so the page grades once.
- `toLevelProgress` / `fromLevelProgress` — translate the persisted `{options,
  speed}` wire shape to/from the domain `{levelName, netWpm}` at each edge.

The page keeps its state, tRPC queries/mutations, the optimistic guest/DB save
orchestration ([11](11-train-save-hook.md)), and the completion modal — now
wiring over the module.

## Before / After

```
Before                                   After
──────                                   ─────
train.tsx (611, 0 tests)                 lib/trainProgression.ts (deep, tested)
  getLevelOptions  (unlock gating)         ladderState ← the unlock core
  progressSelectedLevel (resume)           resumeLevel · nextLevel
  nextLevelNameFromProgress                mergeProgress
  mergeTrainProgress                       gradeResult (req + starsFor + entry)
  grade ×2 · normalize ×3                  toLevelProgress / fromLevelProgress
        all in JSX                       ──────── called by ────────
                                         train.tsx — state, I/O, modal only
```

## Benefits

- locality: unlock, merge and grade bugs land in one module, not a page
- the interface is the test surface — assert over plain progress arrays, no mount
- kills the ×2 grade and ×3 normalization duplications
- leverage: one `ladderState`, both the guest and signed-in callers
- closes the standing-rule gap (progression math belongs in `src/lib/`)

## Decisions (grilled 2026-06-27)

**Scope: extract + test only; behaviour untouched.** The optimistic/refetch save
dance stays in the page for [11](11-train-save-hook.md).

- **Domain field names.** The lib type is `{levelName, netWpm, accuracy, stars}`;
  the persisted DB/tRPC/localStorage shape (`{options, speed, …}`) is translated
  by `toLevelProgress`/`fromLevelProgress` at each edge. The confusing wire names
  stop at the boundary instead of spreading through the logic.
- **Gating returns a domain `LevelStatus[]`**, not the react-select `Option`
  shape. The page maps to `{value, label, isDisabled}`; UI vocabulary stays out
  of the lib.
- **`resumeLevel`/`nextLevel` are lib functions**, not page derivations over
  `ladderState` — their edges (first-locked − 1, next-only-if-unlocked,
  end-of-ladder) get unit tests.
- **`levels` is imported, not injected.** There is exactly one ladder; a
  `levels` parameter would be a speculative seam. Tests exercise the real
  27-level ladder.
- **`gradeResult` takes the resolved `Level`** (the page already has the
  `?? currentLevel` fallback), composing `learnStars` rather than duplicating it.

`trainProgression.test.ts` pins current behaviour: the unlock gate (incl. the
accuracy-not-gated and per-difficulty cases), resume/next edges, keep-max merge,
the mappers, and the 1× / 1.15× / 1.3× star boundaries — 19 tests. Added the
**Train ladder** vocabulary (Level, Unlock) to `CONTEXT.md`.
