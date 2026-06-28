# Collapse the timer to a countdown-only ticker

**Strength:** Worth exploring · **Category:** in-process **Status:** ✅ done

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

## The deeper cut (Level 2)

Beyond deleting the ceremony, the timer only ever *runs* for timed tests. For
every other mode the displayed `time` is shown nowhere (Stats only renders the
time cell when `isTimed`; `Typer`'s countdown is inside the `isTimed` block), and
**elapsed time is measured from the keystroke recorder's timeline, not the timer**
— `Typer`'s live-WPM effect and `computeStats` both read `timeline[0].t`, using
the timer's `actualStartTime` only as an empty-timeline fallback. So the
`INCREMENTAL` branch was ticking a value nobody reads, re-deriving an elapsed time
the recorder already owns. It was redundant twice over.

## Solution

Delete `actions.ts` + `helpers.ts` + `reducer.ts`; shrink `types.ts` to the lone
`TimerType` (its only other consumer is `tick.ts`). Rewrite `useTimer` as a
countdown-only ticker over plain `useState`: it ticks **only** when
`timerType === 'DECREMENTAL'` with a finite `endTime`; otherwise `start()` just
stamps `actualStartTime` and nothing schedules. The public interface is
**unchanged** (`{ time, start, pause, setInitialTime, actualStartTime }`), so
`Typer` isn't touched. **Keep `tick.ts` unchanged** — the genuinely **deep**
module: pure drift-free wall-clock math with adversarial tests.

## Before / After

```
Before (6 files, ticks every mode)      After (3 files, ticks only timed)
──────────────────────────────────      ────────────────────────────────
actions.ts   (dead creators)            useTimer.ts  (countdown hook, useState)
helpers.ts   (serves actions.ts)        tick.ts      (pure math, unchanged ✓✓)
reducer.ts   (7-case switch)            types.ts     (just TimerType)
types.ts     (State/Config/Return)
useTimer.ts  (reducer shell)
tick.ts      (deep, tested)
```

## Benefits

- ~110 lines and 3 files removed; zero behaviour change
- non-timed modes stop ticking a value nobody renders — the recorder is the clock
- locality: the state machine sits next to the effect that drives it
- the reducer ceremony bought substitutability the app never uses

## Decisions (grilled + built 2026-06-27)

**Scope: Level 2.** Confirmed only `Typer` imports `useTimer`, and it destructures
exactly the five-field interface kept. Confirmed the recorder owns timekeeping
(per-keystroke `Date.now()` stamps → `timeline`), so the timer's measurement role
for non-timed modes was vestigial. Kept the interface identical to avoid any
`Typer` churn; the hook is now a countdown that no-ops for non-timed.

Verified: `tsc --noEmit` clean, `vitest run` 334/334 (incl. `tick` drift tests),
and the two behavioural e2e — `timed test completes when the timer expires` and
`practice mode has no countdown and keeps running` — both green.
