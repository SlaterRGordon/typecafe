# Collapse the timer's Redux ceremony

**Strength:** Worth exploring · **Category:** in-process **Status:** open

## Files

`src/hooks/timer/` — `actions.ts` (27), `helpers.ts` (9), `reducer.ts` (72),
`types.ts` (39), `useTimer.ts` (106), `tick.ts` (40)

## Problem

Six files for one hook that only `Typer` uses. Two are **dead flexibility**:

- `actions.ts` — its 7 action-creator functions (`START`, `PAUSE`…) are never
  imported. Only the derived `TimerActionsType` union is used; `useTimer`
  dispatches inline `{ type, payload }` objects.
- `helpers.ts` — `createActionType` exists solely to feed those dead creators.

So 36 lines produce one ~10-line type union. The hook also carries a library's
worth of unused knobs — `autostart`, `onTimeUpdate`, `advanceTime`, `reset`,
`actualEndTime` — none reached by the only caller (`{ time, start, pause,
setInitialTime, actualStartTime }`). Answering "how does the countdown end?"
means bouncing `useTimer` → `reducer` → `types` → back.

## Solution

Delete `actions.ts` + `helpers.ts`; inline the discriminated union into
`types.ts`. Fold the 7-case `reducer` into `useTimer` (dispatched from nowhere
else). Drop the unused config/return knobs. **Keep `tick.ts` unchanged** — it's
the genuinely **deep** module here: pure drift-free wall-clock math with 84 lines
of adversarial tests.

## Before / After

```
Before (6 files)                        After (2 files)
────────────────                        ───────────────
actions.ts   (dead creators)            useTimer.ts  (shell + state machine + types)
helpers.ts   (serves actions.ts)        tick.ts      (pure math, unchanged ✓✓)
reducer.ts   (7-case switch)
types.ts
useTimer.ts
tick.ts      (deep, tested)
```

## Benefits

- ~70 lines and 4 file-hops removed; zero behaviour change
- locality: the state machine sits next to the effect that drives it
- the reducer ceremony bought substitutability the app never uses

## Note

Independent of [06](06-net-scores-aggregation.md)/[07](07-share-card-frame.md);
low-risk deletion, lower-value (no new test leverage — `tick` already pins the
only logic worth pinning).
