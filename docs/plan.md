# TypeCafe — Codebase & Product Review

## Executive Summary

1. **Typer.tsx is a 668-line god component** that owns text generation, timer wiring, WPM math, completion validation, persistence (tRPC mutations), n-gram progression, and global keyboard shortcuts. Every bug lives here, and nothing is unit-testable. Extracting the pure stats math and a `useTypingTest` hook is the single highest-leverage refactor.

2. **Test settings don't persist** — all state in `index.tsx` (mode, duration, punctuation, language, etc.) is plain `useState`, so reloading resets to 15s/English/no-punctuation. For a retention-focused site this is the biggest UX gap, and it's cheap to fix with the existing `useLocalStorage` hook.

3. **Timed mode can run out of text and deadlock** — timed tests generate 500 words, but custom lengths allow up to 3600 seconds. Fast typists exhaust the text and silently freeze until the timer expires.

4. **~1.3 MB of word lists and n-grams are statically bundled** (including unused Chinese/Hindi and a 404 KB pentagrams file). Lazy-loading per language is a real first-paint win.

5. **Fragile DOM-string coupling** — modal state checked via `document.getElementById(...).checked`, restart button found by id from a sibling, key correctness judged by `innerText.trim() === e.key`. Works today but breaks invisibly on markup changes.

**The good news:** Recent work (keystroke timeline as WPM source-of-truth, snapshot/share model, completion-source validation) is well designed. The e2e suite (16 specs) is solid. This is a maintainable app, not a rewrite candidate.

---

## Highest-Impact Refactors

### 1. Extract pure stats/scoring into `src/lib/stats.ts`

- **Problem:** WPM math, accuracy formulas, and `buildWpmSamples` live inside Typer.tsx; duplicated in score/[slug].tsx fallback.
- **Why it matters:** Core product logic can't be unit-tested without mounting React; duplicated formulas will drift.
- **Recommended change:** Move `charsAtElapsed`, `instantaneousWpm`, `buildWpmSamples`, `getStats`, and score types (`Keystroke`, `WpmSample`, `TypedSegment`) to `src/lib/stats.ts`. Typer imports them.
- **Risk/effort:** Low (pure code movement).
- **Files:** [Typer.tsx](src/components/typer/Typer.tsx), new `src/lib/stats.ts`, [score/[slug].tsx](src/pages/score/[slug].tsx).
- **Steps:**
  1. Move functions verbatim
  2. Move shared score types
  3. Add unit tests (see Tests section)

### 2. Split `Typer.tsx` into hooks + thin component

- **Problem:** One 668-line component handles 4 modes, 2 submodes, persistence, and shortcuts; takes 25+ props. Every feature change requires touching this file.
- **Why it matters:** The `cancelRestartRef + setTimeout(0)` pattern exists because too many effects compete here. New features (quote mode, consistency stats) will keep accumulating this debt.
- **Recommended change:** Incrementally extract:
  - `useTestText(config)` — owns the if/else ladder for text generation
  - `useTestCompletion(...)` — owns completion building and persistence
  - `useRestartShortcut(ref, onRestart)` — the Tab+Enter listener block
  - `useGramProgression()` — gramLevel and gramWpm state
- **Risk/effort:** Medium. Do it in 3–4 PRs, one hook at a time, with e2e green between each.
- **Files:** [Typer.tsx](src/components/typer/Typer.tsx), new `src/components/typer/hooks/`.

### 3. One shared types module for scores

- **Problem:** `TypedSegment` declared in [Typer.tsx](src/components/typer/Typer.tsx) and [ShareableScoreCard.tsx](src/components/scores/ShareableScoreCard.tsx); `WpmSample` vs `ScoreWpmSample` naming inconsistency; huge inline `completedScore` type in [index.tsx](src/pages/index.tsx); zod `scoreSnapshotSchema` in [scoreShare.ts](src/server/api/routers/scoreShare.ts) is a third copy.
- **Recommended change:** `src/lib/score.ts` with zod as the source-of-truth: `export type ScoreSnapshot = z.infer<typeof scoreSnapshotSchema>`. This kills the hand-rolled `isScoreSnapshot` guard in score/[slug].tsx.
- **Risk/effort:** Low.

### 4. Centralize modal state (kill `getElementById(...).checked`)

- **Problem:** Modal state checked via hardcoded DOM ids in [Typer.tsx](src/components/typer/Typer.tsx) and [Text.tsx](src/components/typer/Text.tsx). Adding a new modal silently breaks focus/shortcut suppression.
- **Recommended change:** A tiny `ModalContext` (or module-level store with `useModalOpen()`) that all modals register with. One `isAnyModalOpen()` call replaces both DOM scans.
- **Risk/effort:** Medium (touches all modals), but mechanical.
- **Files:** [Modal.tsx](src/components/Modal.tsx), [ColorModal.tsx](src/components/colors/ColorModal.tsx), [SignInModal.tsx](src/components/SignInModal.tsx), [UsernameModal.tsx](src/components/UsernameModal.tsx), [Typer.tsx](src/components/typer/Typer.tsx), [Text.tsx](src/components/typer/Text.tsx).

### 5. Persist and consolidate test settings

- **Problem:** ~20 `useState` hooks in [index.tsx](src/pages/index.tsx#L15-L35) prop-drilled into Typer (25 props) and Config (24 props). Nothing persists across reloads.
- **Recommended change:** A single `useTestSettings()` hook backed by `useLocalStorage`, returning one `settings` object + `updateSetting`. Typer/Config take `settings`/`onChange` instead of 20 pairs.
- **Risk/effort:** Medium. Watch for SSR hydration (read localStorage in an effect).
- **Steps:**
  1. Introduce the hook with current defaults
  2. Swap index.tsx to it (props unchanged)
  3. Collapse Typer/Config props to settings objects
  4. Enable persistence

### 6. Move data out of the components tree

- **Problem:** Word lists, n-grams, generator scripts, and `levels.ts` live under `src/components/typer/`. Scripts don't belong in the component tree; `utils.tsx` mixes data loading, text generation, and a dead React renderer.
- **Recommended change:** Create `src/data/languages/`, `src/data/ngrams/`, `src/lib/textGeneration.ts`. Move scripts to `scripts/`. Delete dead code: `buildText` and `generatePseudoText` have zero call sites, and `use-timer` npm dependency is unused (vendored version exists).
- **Risk/effort:** Low (renames + deletions).

---

## Bugs / Edge Cases to Investigate

### 1. Timed test runs out of text and freezes
- **What breaks:** Timed mode generates exactly 500 words; custom durations allow up to 3600s. When the last char is typed, completion fires but `isCompletionValid` rejects it—input deadlocks, timer keeps running.
- **Reproduce:** Custom timed length 600s, type 500 words worth.
- **Fix:** Reuse relaxed-mode append logic for timed mode instead of fixed 500-word generation.

### 2. Failed score save swallows results
- **What breaks:** For signed-in users, completion routes through `createTest` mutation; `onTestComplete` only fires on success. If the mutation fails, nothing happens—user sees a blank screen.
- **Reproduce:** DevTools → offline → finish test while signed in.
- **Fix:** In `onError`, call `props.onTestComplete` with `persisted: false`, clear the ref, and show an alert.

### 3. N-gram "Repetitions" grows exponentially
- **What breaks:** `ngram += ngram` in a loop yields 2ⁿ copies, not *n*. A user typing 10 gets 1024 copies with no upper clamp, which hangs rendering.
- **Fix:** `ngram = base.repeat(repetition + 1)` and clamp max to ~20.

### 4. Wrong keystroke on first character is ignored
- **What breaks:** Incorrect keys on char 0 don't advance or count toward accuracy, and the timer doesn't start—user can mash wrong keys with zero penalty.
- **Fix:** Drop the `currentPosition > 0` guard for the incorrect branch (keep for backspace). Start timer on first keystroke, correct or not.

### 5. Countdown timer drifts
- **What breaks:** `setInterval` recreates on every tick (time in deps), so each second accumulates render/effect latency. Countdown drifts noticeably; `onTimeOver` fires late.
- **Reproduce:** Run 60s test against a stopwatch.
- **Fix:** Derive remaining time from `Date.now() - actualStartTime` in a stable interval, or compute next delay as `start + n*1000 - now`.

### 6. Practice-stats sync drops keystrokes
- **What breaks:** Snapshot of `charAttemptsRef` is synced; on success the whole key is deleted. Keystrokes typed between mutate and success are deleted without syncing.
- **Fix:** On success, *subtract* synced counts instead of deleting.

### 7. Tab hijack breaks keyboard navigation site-wide
- **What breaks:** The capture-phase keydown listener hijacks every Tab while no modal is open; keyboard-only users can't Tab to nav, settings, or footer.
- **Fix:** Only hijack Tab when typing input has focus, or require Tab+Enter (not just Tab) to restart.

### 8. `getPercentile` excludes ties and miscounts
- **What breaks:** Counts strictly better/worse; users equal to yours vanish from total. Two full-table queries pull every ranked row into memory—will get slow and subtly wrong as data grows.
- **Fix:** One `groupBy(userId, _max: score)` query and count ties correctly.

### 9. Accuracy displays 0.00% before first keystroke
- **Minor:** Live stats read "0.0wpm 0.00%" before test starts—reads as "you're failing." Show "—" or 100% pre-start.

### 10. Unused languages in bundle
- **What breaks:** Chinese (260 KB) and Hindi (28 KB) are imported and shipped but not exposed in the UI. Either expose them or stop importing them.

---

## Performance Review

Only items with noticeable payoff:

### 1. Lazy-load language data (~1.3 MB raw, the dominant bundle cost)
- Import English statically; load others with `await import()` when selected. Load n-grams only for grams/practice mode. This is the single biggest first-load win and is invisible to users.

### 2. Memoize Text and reduce keystroke re-renders
- Every keystroke runs `setPosition` → `setCharacterCount` → re-render → WPM effect → another render (2–3× per keystroke). `Text` isn't `React.memo`; `handleComplete` isn't memoized. Add `React.memo(Text)`, `useCallback` on callbacks, and update live WPM on a 250ms interval instead of per keystroke. Real input-latency improvement on low-end hardware.

### 3. Replace react-select with native/daisyUI select
- Used for three trivial dropdowns (language, difficulty, level) and costs ~28 KB gz plus emotion runtime. A styled `<select>` or small listbox covers all cases. Removes the global click-interceptor hack.

### 4. Redux for alerts only (future)
- Tree-shake opportunity later: a 20-line context replaces the current setup and drops three dependencies. Not urgent.

**Not worth doing:** Virtualizing text container, web workers for generation, or memoizing Keyboard rows—all cheap enough today.

---

## UX / Accessibility Review

### High priority
- **Fix Tab navigation (bug 7)** — most important a11y issue
- **Persist settings (refactor 5)** — biggest UX gap; users lose custom duration/punctuation on reload
- **Add restart hint caption** (`tab + enter — restart`) under the typer

### Medium priority
- **Hidden input pattern breaks screen readers.** Add `aria-label="Typing input"`, `role="textbox"` on text region, announce completion via `aria-live`.
- **Fix accuracy display (bug 9)** — "0.0wpm 0.00%" pre-test reads as failing
- **Keyboard component code duplication** — three copy-pasted rows with inlined SVGs. Extract a `<KeyCap>` component.

### Low priority
- **ColorModal error handling** — matches Prisma error string (fragile); check `error.data?.code` instead
- **Popover positioning** — fixed pixel offsets break near viewport edges; use `getBoundingClientRect`

### Strengths
- Score card is excellent — reveal animation, brag line, offscreen render pattern all well done
- e2e suite is a solid foundation
- Color customization UX is clean

---

## Suggested Tests

Extract `src/lib/stats.ts` first (refactor 1); this unlocks testability. Add vitest (dev-only, tiny, zero config friction).

### Unit tests (highest value)
- **stats.ts:**
  - Raw/net WPM and accuracy for known timelines
  - Timed vs words duration math
  - Zero-keystroke test (edge case)
  - Backspace-corrected error
  - Sub-second test (no Infinity/NaN)
- **buildWpmSamples:**
  - Empty timeline
  - Single keystroke
  - Window shrink at test start
  - Sample count ≈ target
- **applyTextOptions:**
  - Punctuation always ends with sentence ender
  - Capitals-only capitalizes ~20%
  - Idempotent on empty string
- **generateNGram:**
  - Repetition is linear (post-fix)
  - Level/scope indexing never reads `undefined`
- **generateBetterPseudoText:**
  - Only uses allowed characters
  - Terminates when no grams match
- **getLevelOptions (learn):**
  - Unlock chain respects difficulty thresholds

### Component tests (react-testing-library)
- **Text:**
  - Typing correct/incorrect/backspace updates counts
  - First-char wrong key (regression test for bug 4)
  - Completion fires exactly once
- **Config:**
  - Custom length clamps and snaps to presets
  - Mode switch resets count
- **ShareableScoreCard:**
  - Legacy snapshot (no segments) renders plain text
  - Sign-in CTA vs share button states

### E2E additions
- Complete short words test anonymously → score card appears → "Test Again" restores typing
- Timed test completes when timer expires (and doesn't freeze when text exhausted, post-fix)
- Settings persist across reload (post-refactor 5)
- Learn: complete level 1 below threshold → warning, locked; above → unlocked

---

## Feature Suggestions

### Quick wins
| Feature | Why users care | Complexity & risks |
|---------|----------------|-------------------|
| **Persist settings** (refactor 5) | Returning users keep preferred test | Low, silent, safe |
| **Restart hint** (`tab + enter — restart`) | Discoverability of core loop | Trivial caption |
| **Consistency stat** (variation of WpmSamples) | Monkeytype users expect it; data exists | Low, one function + UI row |
| **Per-test worst keys** | Actionable results ("slowest: t, r, space") | Low, surfaced in results |
| **Expose Hindi** (already bundled) | Free language | Trivial; verify rendering |

### Medium effort
| Feature | Why users care | Complexity & risks |
|---------|----------------|-------------------|
| **Personal progress chart** (30-day WPM line) | Retention loop; all data exists | Medium, reuse WpmChart SVG |
| **Quote mode** (type real passages) | Relieves word-list monotony | Medium, normalize quotes (IME issue) |
| **Daily streak + achievements** (7-day, first 100 WPM) | Cheap retention | Medium, compute server-side, keep to ~8 |
| **Smart drill** (auto-select 6 worst keys) | Uses existing per-key accuracy data | Medium, one button, no schema change |

### Bigger bets
| Feature | Why users care | Complexity & risks |
|---------|----------------|-------------------|
| **Race a ghost** (replay your PB as pace cursor) | Self-competition is stickiest mechanic | High UI work; do post-Typer refactor |
| **Weekly leaderboard** (same seed, reset Monday) | Social hook, fresh reason to visit | Medium-high, cache seed, mitigate cheating |
| **AI-generated passages** (Claude Haiku, themed) | Differentiator, lightweight AI | Medium, cache heavily, never block flow |

**Don't build:** multiplayer live races (heavy infra), code-typing mode (different audience), mobile soft-keyboard support (huge effort).

---

## Recommended Roadmap

### Phase 1: Foundations (safety + testability)
1. **PR 1:** Delete dead code (`buildText`, `generatePseudoText`, unused `use-timer` dep); move generator scripts out of `src/components`
2. **PR 2:** Extract `src/lib/stats.ts` + unit tests (vitest); lock current behavior

### Phase 2: Bug fixes
3. **PR 3:** Batch small fixes: failed-save fallback (bug 2), n-gram repetition (bug 3), first-char error (bug 4), accuracy display (bug 9)
4. **PR 4:** Timed-mode text appending (bug 1) + timer drift (bug 5) + e2e test
5. **PR 5:** Practice-stats sync fix (bug 6)

### Phase 3: Refactoring
6. **PR 6:** `useTestSettings` hook + localStorage persistence (refactor 5)
7. **PR 7–9:** Typer decomposition (refactor 2), one hook per PR, e2e green between each
8. **PR 10:** Modal context centralization (refactor 4)
9. **PR 11:** Lazy-load language data (perf 1) + memoize Text (perf 2)

### Phase 4: Features
10. Consistency stat → restart hint → progress chart → quote mode → smart drill → streaks

---

## First PR Recommendation

**Extract `src/lib/stats.ts` with unit tests (Phase 1, PR 2, folding in PR 1's deletions).**

Concretely:
1. Delete `buildText` and `generatePseudoText` from [utils.tsx](src/components/typer/utils.tsx)
2. Delete `use-timer` from `package.json`
3. Move generator scripts from `src/components/typer/languages/nGrams/` to `scripts/`
4. Create `src/lib/stats.ts` with:
   - `charsAtElapsed`, `instantaneousWpm`, `buildWpmSamples`
   - `getStats` math
   - `Keystroke`, `WpmSample`, `TypedSegment` types
5. Update imports in [Typer.tsx](src/components/typer/Typer.tsx) and [score/[slug].tsx](src/pages/score/[slug].tsx)
6. Add vitest with ~10 tests covering WPM/accuracy math

**Why this PR:**
- Behavior-preserving (easy review, easy revert)
- Makes the most fragile and valuable logic testable for the first time
- Enables every subsequent PR (bug fixes, Typer decomposition, consistency-stat feature)
- Relatively small and self-contained
