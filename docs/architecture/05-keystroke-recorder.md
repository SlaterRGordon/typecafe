# Untangle the keystroke-timeline path in Typer

**Strength:** Speculative · **Category:** in-process · **Status:** ✅ done
(`src/lib/keystrokeRecorder.ts` + `keystrokeRecorder.test.ts`)

## Files

`src/components/typer/Typer.tsx` (~620 lines) · `src/components/typer/Text.tsx` ·
`src/components/typer/hooks/useTestPersistence.ts`

## Problem

Timeline capture, stat computation, completion branching, and persistence are
co-located in one component. The timeline is assembled across two components and
a callback chain (Text → Typer → refs), so understanding "how is a keystroke
recorded" means bouncing between three files. Testing the timeline in isolation
requires mounting Typer with `useSession`, `useTimer`, `useGramProgression`, and
tRPC mocked.

## Solution

A keystroke-recorder module that owns the timeline (append, backspace, finalise)
and hands a finished timeline to `stats.ts`. Typer wires events in, reads results
out.

## Before / After

```
Before: 3 hops to build the timeline      After
──────                                     ─────
keystroke → Text.tsx → Typer.tsx → refs    keystroke → recorder (owns timeline)
                  ↓        ↓                                    ↓
              stats.ts  useTestPersistence                  stats.ts
```

## Benefits

- locality: timeline bugs concentrate in one module
- the recorder's interface is unit-testable
- reusable for replay / analysis later

## Note

Speculative: the seam is real but Typer's coupling to timer/session/progression
hooks means the deepening is larger and riskier than 01–04. Tackle only after the
dual-source candidates land.

## Decisions (grilled 2026-06-26)

**Committed (not deferred), and built as the deep version: raw stream, derive
the rest.** Today Typer maintains four parallel captures off one keystroke
stream — `characterCountRef` / `incorrectCountRef`, `testCharAttemptsRef`,
`keystrokeTimelineRef` (`{t,chars}`), `keyEventsRef` (`{key,t,correct}`).

The recorder owns the **canonical event log + backspace handling**; the other
three become pure derivations:

```
recorder.append(key, expected, t)
recorder.backspace()
recorder.finalize() -> { events, timeline, characterCount, incorrectCount, charAttempts }
```

`computeStats` / `aggregateTransitions` / `worstKeysFromAttempts` consume the
bundle. Typer shrinks to feed-events-in, read-bundle-out — four refs collapse to
one owner.

**Risk + mitigation:** all the danger is in matching the current
backspace/counting semantics exactly. **Write a characterization test first** —
a scripted keystroke+backspace sequence pinning the current `{timeline, counts,
attempts, events}` — then refactor against it. Largest/riskiest item; do it last,
after 01–04 land.
