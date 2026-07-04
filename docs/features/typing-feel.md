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

- [ ] Position becomes ref-only in Text; scroll check, append trigger, and
  key-change callback fire imperatively from `nextLetter`/`prevLetter`. Text
  renders ~zero times during an attempt.
- [ ] Drop the `querySelectorAll(".active-char")` sweep — keep a ref to the
  active span; only touch the two spans that change.
- [ ] Keyboard highlight stops re-rendering the page: memoize `Keyboard`, feed
  the current key + attempt version without page-level per-keystroke state
  (imperative/subscription or throttled — the highlight doesn't need
  sub-frame precision).
- [ ] Buffer refill never lands inside a keystroke: pre-generate the next
  append chunk during idle time; the keystroke only appends the ready
  fragment (or defers it to an idle callback).
- [ ] Perf spec numbers recorded here after: _pending_

## 2. Vertical caret

- [ ] Absolutely positioned caret element moved with `transform: translate`,
  updated imperatively per keystroke — same pattern as the boss pacer line.
  Height/position from the active char's box; handles line wraps and the
  words-container scroll.
- [ ] Smooth glide: ~70–90ms ease-out transform transition; blink only when
  idle (no keystroke for ~500ms+); replaces `.active-char` underline blink.
- [ ] Works in all modes (normal/quotes/practice/grams/relaxed, drill pages,
  daily challenge) and both text sizes; coexists with the pacer line.
- [ ] E2e + screenshot tour updated (tour shows the caret mid-test).
- [ ] Perf spec stays green with the caret enabled.

## 3. Seamless saving

- [ ] Extend `eagerResult` to every completion surface (train, daily
  challenge): the result renders instantly from local numbers, server fields
  (share link, brag, delta, streak) patch in when the save settles. Callers'
  `onTestComplete` made idempotent under the double-call where needed.
- [ ] Post-completion analytics (transition aggregation, char-attempt sync,
  localStorage writes) move off the completion frame (idle callback) so the
  result paint never stutters.
- [ ] E2e: result card visible immediately on a slow network (route-delayed
  save), fields patch in without layout jump.
