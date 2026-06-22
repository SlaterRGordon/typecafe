# Learn-Game & UX-Polish Plan

A grab-bag of UX fixes plus a gamified learn page. Decisions locked with owner 2026-06-21. Each slice = one reviewable commit on `development`, suite green, screenshot tour updated. Scoring/gameplay math = pure fns in `src/lib/` + vitest. Conventional Commits. Tick this doc's checkbox in the completing commit.

**Locked decisions**
- Net WPM is canonical everywhere, including learn (requirements + measurement use net, not raw).
- Replace the user-facing word **"delta"** with **"Improvement"** (score-page stat, challenge "delta board", `/how-we-measure`, meta copy).
- Language picker icon shows on **Timed / Words / Relaxed** only (hidden on Grams + Practice).
- Learn gamification = a **polished "Level complete" popover** (1–3 stars + Try again / Next level), *not* a full level-map. Feel: a mobile arcade game.
- Learn level variety = **themed challenge levels** (timed speed-round, accuracy no-miss, grams combo, boss) woven into the key-progression, using timed/words/grams.
- Tab-restart works on **both** `tab+enter` and `tab+space`.

**Sequencing:** independent polish first (1 Toolbar → 2 Copy&numbers → 3 Banners → 4 Grams-entry → 5 Progress-trim → 6 OG-badge), then the learn feature (7 Learn-net + popover → 8 Themed levels). Learn net WPM must land before the popover (stars read net); themed levels build on the popover.

---

## Slice 1 — Toolbar polish ✅ DONE (S) `fix(toolbar): scope language icon, stop nav overlap`

> Shipped 2026-06-21. Language globe shows only when `mode` is normal/relaxed (Timed/Words/Relaxed); hidden on Grams/Practice. Side nav raised to `z-[45]` (above the toolbar's z-40, below z-50 top/bottom nav) so it stops being painted over. e2e asserts the per-mode icon visibility.


- Show the language picker only when the mode uses a word list: Timed / Words / Relaxed. Hide on Grams + Practice (`src/components/typer/config/ModeBar.tsx` / `Config.tsx`).
- Fix the typer toolbar rendering over the expanded side-nav — raise the nav's stacking context (or lower the toolbar) so the expanded nav sits above it. Verify at the breakpoint where the nav expands.

**Verify:** e2e — language icon present on Timed/Words/Relaxed, absent on Grams/Practice; nav-expanded screenshot shows no overlap. Re-capture toolbar/home shots.

---

## Slice 2 — Copy & numbers ✅ DONE (S) `refactor(ui): friendlier copy, tidy numbers, dual restart key`

> Shipped 2026-06-21. "delta"→"Improvement" (score page stat, `/how-we-measure`, progress meta). Dropped "board" on `/challenge` ("delta board" badge → "by improvement", "daily board"→"daily rankings", "improvement deltas" empty → "improvement scores"); completed CTA "View boards" → "Try again" (replayable). Shared `formatStat` (`src/lib/format.ts` + test, ≤2 decimals trimmed) used for profile Time-Typing / Words / Top-Speed (was unrounded / `.toFixed(2)`). Tab-restart already accepted space (`useRestartShortcut`); hint now reads `tab + enter / space — restart`.


- **"delta" → "Improvement"**: score page stat label (`src/pages/score/[slug].tsx:303`), `/how-we-measure` section + intro, progress meta description. Keep internal identifiers (`headlineDelta`, `avgDelta`, …) — copy only.
- **Profile stats ≤2 decimals**: a shared `formatStat` (round to 2, trim trailing zeros → `84`, `84.5`, `84.52`) applied to the profile stat cards (`src/pages/profile.tsx`, `profile/[username].tsx`). Pure helper + test.
- **Drop "board"** on `/challenge`: the ranking lists become **"Fastest"** and **"Most improved"** (was "fastest board" / "delta board"); update the "improvement deltas" empty-state copy to match. Completed-state CTA "View boards" → **"Try again"** (it returns to the replayable `/challenge`).
- **Restart hint**: `tab + enter` also accepts `tab + space`; hint text reads `tab + enter/space — restart` (`src/components/typer/Typer.tsx`, restart key handler).

**Verify:** unit (formatStat); e2e for "Improvement" labels + Try now; re-capture score/challenge/profile shots.

---

## Slice 3 — Banner width parity ✅ DONE (S) `fix(ui): banners match the width of the content below`

> Shipped 2026-06-21. Score-card banners were narrower than the `max-w-7xl` card: the home result's continue-plan banner (`max-w-2xl`) and the challenge result's daily-challenge prompt (`max-w-3xl`) now sit in a `max-w-7xl px-4 sm:px-6` wrapper so their edges line up with the card. Audited the rest: score/[slug] beat-run CTA already `max-w-7xl`, progress guest-keep banner already aligns at `max-w-6xl` with the dashboard — no change needed.


Banners should stretch to exactly the width of the card/content directly beneath them.
- Audit + fix: score-card-page top banner(s) (the reported case), home `re-measure-prompt` + `continue-plan` banners, progress `guest-keep-banner`, any other page-level banner. Wrap banner + content in one width-constrained column (shared `max-w-*`) so both align.

**Verify:** screenshots across score page, home result, progress (guest), plan/drill — banner edges align with content. Re-capture touched shots.

---

## Slice 4 — Grams entry, no words flash ✅ DONE (S) `fix(grams): land on grams without a words flash`

> Shipped 2026-06-21. Landing on `/?mode=grams` (e.g. from progress) mounted the typer in the persisted words/timed mode and flashed a words test before the grams config applied. A `useLayoutEffect` (pre-paint) detects `?mode=grams` from `window.location.search` and holds the typer behind a brief loader; the existing config-handoff effect clears it once grams is applied — so words never render. Only grams is gated (timed/words/practice/rm flows unchanged).


Navigating to `/?mode=grams` (e.g. from progress) briefly renders a words test before switching. Make the grams config apply before the first text generation (mirror the re-measure/`?rm=` restart-race fix: don't bump restart with stale settings) so grams renders from the first frame.

**Verify:** e2e — goto `/?mode=grams` shows grams (no intermediate words test); existing grams tests green.

---

## Slice 5 — Progress plateau trim ✅ DONE (XS) `refactor(progress): drop the plateau card's button`

> Shipped 2026-06-21. The `/progress` plateau headline is now message-only: it keeps the "Plateaued for N weeks" coach copy and removes the duplicated "Try transition drills" CTA. Drill actions stay owned by the weak-spots panel, trimming height and reducing competing actions. e2e now asserts the plateau copy remains and the old link is absent; screenshot 47 was re-captured.

The plateau headline card's **"Try transition drills"** button is dead weight — remove it (message-only) to cut height. The weak-spots panel already owns the drill CTAs.

**Verify:** rewrite the plateau e2e expectation (button gone, plateau copy stays); re-capture progress-plateau shot (47).

---

## Slice 6 — OG daily-challenge badge ✅ DONE (S) `feat(og): mark daily-challenge runs in the share image`

> Shipped 2026-06-21. Daily-challenge score shares now persist `dailyChallenge: true` in the share snapshot; legacy shares derive the same OG badge condition from `Test.challengeDate`. The OG score image renders a top-right "Daily Challenge" badge when that flag is present. Unit coverage exercises fresh snapshots, legacy challenge-backed shares, and ordinary unbadged shares; e2e asserts the challenge share payload carries the flag and the OG endpoint still renders a PNG.

A shared score that was a daily challenge should say so in its OG image. Add a "Daily Challenge" badge to `src/pages/api/og/score/[slug].tsx` when the score/share is a daily-challenge run. *(Data dep: the share snapshot must carry a daily-challenge flag — wire it through `scoreShare` if absent.)*

**Verify:** e2e/unit on the OG route input; manual OG render check.

---

## Slice 7 — Learn: net WPM + level-complete popover ✅ DONE (L) `feat(learn): net WPM and a juicy level-complete popover`

> Shipped 2026-06-21. Learn progress now uses **net WPM** for level requirements, unlock checks, saved progress, and stars; accuracy remains visible context because net WPM already includes errors. The existing `LearnProgress.speed` rows are migrated from raw→net and gain a persisted `stars` column. Pure `starsFor` / `learnStarCriteria` math lives in `src/lib/learnStars.ts` with unit coverage. Level completion now opens a polished popover with 0–3 stars, net WPM, contextual accuracy, Try again, Next level when passed, and an explicit net-WPM star-criteria legend. Failed attempts no longer disappear behind a toast — they show a retry popover and do not save progress. Guest progress stores best stars locally; signed-in progress stores best stars in DB. e2e covers guest success, failed retry popover, net requirement copy, and Next level; screenshot tour captures default learn and the new completion popover on desktop/mobile.

Make the learn page feel like a phone game.
- **Net WPM**: level requirements + the saved/compared score use net (`netFromRaw(result.speed, result.accuracy)`), not raw `speed`. "Required Speed" reads net. (`src/pages/learn.tsx`, `learn/levels.ts`, learnProgress payloads.)
- **Stars (pure `src/lib/learnStars.ts` + tests)**: `starsFor({ netWpm }, requirement)` → 0–3. 0 = below requirement (fail). 1 = meets req. 2 = ≥ ~+15% net WPM. 3 = ≥ ~+30% net WPM. *(thresholds tunable.)*
- **Popover**: on completion, a celebratory modal — "Level N clear!", animated 1–3 stars, net WPM · accuracy, and buttons: **Try again** (replay) + **Next level →** when earned. Failed attempts show Try again only. Arcade styling/animation. Persist the best star count per level (extend learnProgress, local + DB).
- **Star-criteria legend**: show users what earns 1/2/3★ (a small legend in the popover and/or beside the level requirements), so the bar is never a mystery.

**Verify:** unit (starsFor); e2e — complete a level → popover with stars + Next; failing run → retry popover; re-capture learn shots (14 + add popover).

---

## Slice 8 — Learn: themed challenge levels (L) `feat(learn): themed timed / accuracy / grams / boss levels`

Vary the climb with themed levels (pure pass-criteria in `src/lib/` + tests). Extend `Level` with a `kind` (`keys` | `speed` | `noMiss` | `grams` | `boss`) and per-kind pass logic:
- **Speed round** (timed): reach a target net WPM within a short timed test.
- **No-miss** (accuracy): finish a short words level at ≥ ~98% (stars reward 100%).
- **Grams combo** (grams): a bigram drill on the level's keys via the grams pipeline.
- **Boss (paced)**: a "pacer" cursor moves at the target net WPM and you race to stay ahead of it; combines earlier keys at raised thresholds, 3★ is hard. *(The pacer cursor is the meatier build — may split into its own follow-up if the Typer needs new plumbing.)*
Wire the Typer to the level's `subMode`/`kind`; stars/popover (slice 7) read the kind's criteria. More themed kinds can be added later.

**Verify:** unit (per-kind pass + stars); e2e — a timed and a grams themed level render and complete; re-capture learn shots.

---

## Cross-cutting
- After each slice: `npx vitest run`, `npx tsc --noEmit`, affected `npx playwright test`, re-capture touched screenshots, `npm run build:check`.
- Stars/level-pass/format math = pure `src/lib/` fns with tests (never in components).
- Don't relitigate locked constraints (free-tier, local-first, net-canonical). Learn progress stays local-first + sync; no cron/LLM.
