# Typing feel — latency, caret, seamless saves

Decided 2026-07-03 with the owner. Features are settled; this slice is about
*feel*: keystroke-to-paint latency, the caret, and making persistence
invisible. All three symptoms are felt today: lag on home with the keyboard
visible, periodic hitches mid-test, and a stall around completion/results.

Vision filter: a laggy cursor makes the product feel slower — the opposite of
the promise. Smoothness is table stakes for "makes you faster" being credible.

**Decisions (owner, 2026-07-03):**
- Vertical caret **replaces** the blinking underline outright — no caret-style
  setting. Correct/incorrect coloring stays on the letters.
- Caret motion: smooth glide (~70–90ms transform transition), blinks when idle.
- Perf budgets are enforced by a Playwright perf spec under CPU throttle —
  "feels smooth on a small laptop" must be a green test, not a vibe.

Diagnosis (2026-07-03, from reading the hot path):
1. Every keystroke re-renders the whole home page: `setPosition` in Text plus
   `setAttemptVersion`/`setCurrentKey` on the page re-render the tree including
   the non-memoized on-screen Keyboard (~60 key nodes).
2. Redundant per-keystroke DOM work in Text's position effect: a
   `querySelectorAll(".active-char")` sweep re-applying classes `nextLetter`
   already applied, plus layout reads for scroll on every key.
3. Timed/relaxed buffer refill (`generateText(100)` + DOM append) runs
   synchronously inside a keystroke when within 300 chars of the end.
4. `eagerResult` (instant result, server fields patch in) is home-only;
   train/challenge wait on the save round-trip. Post-completion analytics
   (transition aggregation, char-attempt sync) run on the completion frame.

---

## 0. Measurement harness (before any optimization)

A perf e2e spec that makes smoothness a number and a regression gate.

- [x] `tests/e2e/perf.spec.ts`: CDP-throttle CPU (4×), type synthetically
  (~45ms/key dispatch), collect keydown→frame latency, Event Timing API
  entries, and long-animation-frame counts in-page.
- [x] Assert budgets (~2× baseline: regression tripwires, tightened per
  phase) and print a baseline table for before/after comparison.
- [x] Capture the baseline numbers in this doc before Phase 1 lands.

Baseline 2026-07-03 (dev server, cpu ×4 — treat as relative, not absolute):

| scenario | key→frame p50 | p95 | max | handler p95 | long frames >50ms |
|---|---|---|---|---|---|
| timed, 350 keys | 39.3ms | 48.9ms | 80.9ms | 34.9ms | 53 |
| practice + keyboard, 150 keys | 71.8ms | 84.7ms | 106.8ms | 68.6ms | 216 |

Reading: the keydown *handler* alone (React work, before paint) costs ~35ms
throttled in timed and ~69ms with the keyboard visible — the per-keystroke
render storm is measured, not hypothetical. Practice mode logged more long
frames than keystrokes (the page effectively runs below 20fps while typing),
and main-thread saturation dragged the synthetic dispatch itself from
~129 wpm achieved (timed) down to ~90 wpm (practice). Input delay is near
zero in both — the event queue is fine; the work per key is the problem.

## 1. Kill per-keystroke React work

- [x] Position becomes ref-only in Text; scroll check, append trigger, and
  key-change callback fire imperatively from `nextLetter`/`prevLetter`. Text
  renders ~zero times during an attempt.
- [x] Drop the `querySelectorAll(".active-char")` sweep — the cursor walks
  sibling spans via `activeCharRef` (zero per-key queries); `handleKeyPress`
  reads `textContent`, not layout-forcing `innerText`.
- [x] Keyboard highlight stops re-rendering the page — or the board: pages no
  longer hold per-keystroke state (`currentKey`/`attemptVersion` and the
  `onKeyChange`/`onAttemptChange` chains are gone). Typer publishes the next
  key on a module signal (`keySignal.ts`); both boards move the marker by
  swapping classes on cells (guarded by e2e in home.spec + train.spec), and
  the practice heatmap's shading re-renders only when typing pauses (250ms
  trailing debounce).
- [x] Buffer refill never lands inside a keystroke: generation + DOM append
  run in `requestIdleCallback` (300-char threshold = seconds of margin).
- [x] Perf spec after (2026-07-04, same protocol; budgets tightened to ~2×):

| scenario | key→frame p50 | p95 | max | handler p95 | long frames >50ms |
|---|---|---|---|---|---|
| timed, 350 keys | 22.0ms (was 39.3) | 30.3ms (was 48.9) | 45.2ms (was 80.9) | 13.8ms (was 34.9) | 3 (was 53) |
| practice + keyboard, 150 keys | 23.2ms (was 71.8) | 35.5ms (was 84.7) | 48.2ms (was 106.8) | 13.5ms (was 68.6) | 6 (was 216) |

Both surfaces now sit at the same ~22ms floor under 4× throttle (≈ one 60Hz
frame unthrottled). Practice-mode handler work dropped 5×; the synthetic
typist sustains ~155 wpm dispatch where it previously choked at ~90. First
pass moved the page-level state into a Keyboard-local subscription and only
timed improved — the practice board's own ~50-cell render was the remaining
cost, hence the imperative marker + pause-only shading.

## 2. Vertical caret

- [x] Absolutely positioned caret element moved with `transform: translate`,
  updated imperatively per keystroke — same pattern as the boss pacer line.
  Height/position from the active char's box; a scroll listener keeps it
  riding the smooth line-change scroll, a resize listener re-anchors it.
- [x] Smooth glide: 80ms ease-out transform transition (none under
  prefers-reduced-motion); blinks only when idle (600ms after the last
  keystroke); replaces the `.active-char` underline blink. The active char
  keeps its `active-char text-primary` classes (tests + key signal rely on
  them) — only the underline animation is gone.
- [x] Works in all modes and both text sizes (shared Text component; height
  reads the active char's box per position); coexists with the pacer line.
- [x] E2e guard in home.spec (visible, glides forward, idles back to blink);
  the tour's `02-home-mid-test-with-error` capture shows it mid-test.
- [x] Perf spec green — and *better* than post-§1: timed p50 22.0→16.7ms
  (0 long frames), practice p50 23.2→20.8ms (handler p95 ~8ms). The old
  underline blink was an infinite CSS animation forcing continuous style
  recalc on the text; the caret only animates while idle.

## 3. Seamless saving

Root-cause find (2026-07-04): saving wasn't just slow, it was **failing** —
the dev app reads `DATABASE_URL` from `.env.local` (ep-billowing-bar Neon
endpoint) while the Prisma CLI reads `.env` (ep-lucky-pine), so the
`test_timeline` migration had only been applied to the CLI's database and
every signed-in save threw "column `timeline` does not exist". Applied the
migration to the `.env.local` DB (strip `-pooler` from the host — Prisma
migrate needs the direct endpoint). When adding migrations, deploy to both
or unify the env files. Beyond the failure, a real `test.create` round trip
measured 5.2s against Neon — which the changes below take off the critical
path entirely.

- [x] `eagerResult` on every completion surface (challenge already had it):
  **train** shows the stars popover instantly — grading and the next-level
  unlock are computed locally (`mergeProgress`, the same merge `save()`
  uses), a `saving → saved/failed` status line tracks the background save,
  and the upgrade report is deduped (`completionHandledRef`). **drill**'s
  `setCompleted` is idempotent, so it just took the flag.
- [x] Post-completion analytics (char-attempt sync, transition aggregation +
  sync, guest localStorage writes) run via `runWhenIdle` (`src/lib/idle.ts`)
  — never on the completion or restart paint. Text's append refill shares
  the helper.
- [x] E2e: with `test.create`/`trainProgress.complete` delayed 4s
  (`mockTrpc delayProcedures`), the train popover and drill result render
  within 2.5s of completion; the train status line then settles to
  "Best result saved."

§3 fallout, fixed 2026-07-04 (reported as "transitions/key accuracy no longer
tracking"):

- [x] Signed-in attempt drain survives the eager unmount: drill/train unmount
  the Typer the instant the eager result shows, and react-query skips
  *mutate-level* callbacks on an unmounted observer — `drainSyncedAttempts`
  never ran, so every later rep re-sent (double-counted) already-persisted
  attempts. Drain moved to the hook-level `onSuccess` (rides the mutation,
  fires regardless of mount); e2e guard asserts two reps sync equal totals.
- [x] The frozen drill header was ADR-0004 behavior (drill reps never feed
  lifetime transition aggregates), not a §3 break — but nothing showed
  progress across reps. The drill header now carries a session trail
  ("This session: best · last · n reps") built locally from each rep's delta;
  lifetime data stays clean, nothing added to the typing hot path.
