# Cohesion & Polish Plan

Turns the scattered (but good) features into one cohesive product. Decisions locked with owner 2026-06-20. Each slice = one reviewable commit on `development`, suite green, screenshot tour updated. Scoring math = pure fns in `src/lib/` + vitest. Conventional Commits. Tick this doc's checkbox in the completing commit.

**Locked decisions**
- Net WPM is canonical: the number labelled **"WPM"** everywhere = net; raw stays *visible* as a secondary "Raw WPM" stat. Ranking/PBs/brag/deltas all use net. `net = max(0, raw·(2·accuracy/100 − 1))` — derivable from stored `speed`+`accuracy`, **no migration**.
- Unified **Drill** surface that compiles weakness-fitting real text (words or grams).
- **Story-first** single-screen `/progress` (incl. the profile activity heatmap).
- **Guided-player** Plan, local-first.

**Sequencing:** 1 Net → 2 Leaderboard → 3 Avatar → 4 Heatmap → 5 Drill → 6 Progress → 7 Plan. (Net is foundational; Drill is a dependency of Progress & Plan CTAs; Avatar/Heatmap are independent quick wins.)

---

## Slice 1 — Net WPM canonical ✅ DONE (M) `feat(stats): make net the canonical WPM`

> Shipped 2026-06-20. Scope landed: score card (hero "WPM" = net, "Raw WPM" secondary cell + details), OG headline, `/progress` trends/delta/records/avg/best (net derived at the record-mapping layer incl. rollup-only days), score-card 30-day delta (`thirtyDayDelta`), and the personal-best brag — all net. `netFromRaw` pure helper + tests; `/how-we-measure` updated. **Deferred to Slice 2** (leaderboard-family, cleaner there): leaderboard list, profile scores list, daily-challenge status/boards display+ordering. **Deliberate exception:** the peer/global percentile *pool* still ranks on the composite `score` (speed×accuracy) — it's already error-adjusted, not raw WPM; converting the 20k-row/SQL pool to net is a future follow-up if wanted. WPM-over-time chart stays raw (instantaneous samples), labeled, secondary.


**Pure:** add `netFromRaw(rawWpm, accuracyPct)` to `src/lib/stats.ts` (clamp 0) + tests (0%/50%/100%, equals existing `netWpm` on a known sample).

**Surfaces (label the displayed number "WPM" = net; keep raw as a "Raw WPM" secondary):**
- `src/components/scores/ShareableScoreCard.tsx`: hero card "WPM" = `netFromRaw(rawWpm, accuracy)` **always** (remove the `shouldHeroNetWpm` swap from slice-4 of the trust work; delete the helper if now unused). Keep a "Raw WPM" metric cell + the Performance-Details Raw row. `ReMeasureStrip` before/after → net. OG image (`src/pages/api/og/score/[slug].tsx`) headline → net.
- `src/lib/progress.ts`: trends/delta/headline/records/league all read net. Cleanest: derive net at the record-mapping layer so downstream math is unchanged — in `progress.tsx` `rawRecords` map and the guest mirror map, set `wpm = netFromRaw(row.wpm/e.wpm, accuracy)`; for rollup-only days in `mergeDailyRollups`, map `wpm = netFromRaw(rollup.avgWpm, rollup.avgAccuracy)`. `personalRecords`/`bestWpm`/`averageWpm` then operate on net automatically. (Keep a raw copy only if a surface still needs it — currently none.)
- Ranking: `src/server/api/routers/test.ts` `buildBrag` PB check + percentile pools rank by net (compute `netFromRaw(speed, accuracy)` per row, compare). `thirtyDayDelta` → net. Daily-challenge boards "fastest" sort → net. Leave the stored `score` column as-is (no migration); just stop using it for WPM-facing ordering.
- Score-card `avgDelta`, challenge prompt "vs avg", self-league removal (slice 6) — all net.

**Leave raw:** the WPM-over-time chart stays raw instantaneous samples (label unchanged); it's secondary. Note in PR.

**Verify:** vitest; re-capture score card (13), diagnosis (35), shared score (18), progress (40). Update `/how-we-measure` "Words Per Minute" section to state net is the headline.

---

## Slice 2 — Leaderboard + challenge boards: best-per-user-per-window by net (M) `feat(leaderboard): rank one best score per user per window`

Problem: `Scores.tsx` renders `test.getAll` (every row, score-desc, `date` = `gte`) → one user floods the board. Also carries the deferred Slice-1 net display: leaderboard list, profile scores list, and daily-challenge status/boards (`getDailyChallengeStatus`/`getDailyChallengeBoards` + `DailyChallengePrompt`) all show/rank **net** (derive `netFromRaw(speed, accuracy)`; the challenge baseline/improved-delta become net too).

- New tRPC `test.getLeaderboard({ typeId, count, language, window: "daily"|"weekly"|"monthly"|"all", page, limit })`. window→date floor (today / −7 / −30 / none). Fetch ranked rows in window for typeId+count; group by `userId`; keep each user's max `netFromRaw(speed,accuracy)`; sort desc; paginate. (Volume is low; in-memory group is fine. Note "when there's budget" upgrade: a materialised best-per-window.)
- Leaderboard page + a leaderboard-specific list (fork `Scores.tsx` or branch it): show **WPM (net)** as the ranked column + a smaller "Raw" column; use shared `<Avatar>` (slice 3).
- Keep the existing empty state.

**Verify:** new e2e in `leaderboard` spec asserting one row per user; re-capture screenshot 15.

---

## Slice 3 — Shared Avatar with per-user colour (S) `feat(ui): unify avatar with deterministic fallback colour`

- Generalise `src/components/Avatar.tsx`: props `{ image?, name?, size }`. Fallback = uppercase first char of `name` (username→name→email), else "?". Background = deterministic colour from a hash of `name` → hue (fixed S/L for contrast on the dark theme), white text. Export a pure `avatarColor(seed: string)` in `src/lib/` + test (stable, distinct hues).
- Replace inline fallbacks: `Scores.tsx`, `src/pages/profile.tsx`, `src/pages/profile/[username].tsx`, daily-challenge boards (`src/pages/challenge.tsx` / board component), score-card author, and the OG route (replicate colour+initial in the `ImageResponse`).
- Handle null username everywhere (no blank circles).

**Verify:** re-capture leaderboard (15), profiles (16/17), challenge boards (49/53-area).

---

## Slice 4 — Rebuild keyboard heatmap as a real keyboard (S) `fix(heatmap): realistic key layout, no label overlap`

`src/components/heatmap/KeyHeatmap.tsx` today: 3 equal centred rows + fixed `min-w-[17.5rem]` spacebar; `%` absolutely positioned over the glyph.

- Staggered rows (QWERTY row offsets), relative key widths, spacebar spanning the correct proportion. `%` no longer overlaps the letter: letter centred + colour fill; show `%` as a small bottom-corner badge in `full`, tooltip-only in `mini`. Keep `accuracyColor`/`heatmapCell`/`lookupAttempt`, `highlightKeys`, testIds.
- Consumers unchanged (practice analytics, score-card mini, progress lifetime).

**Verify:** re-capture practice analytics (32), diagnosis (35), progress (40).

---

## Slice 5 — Unified Drill surface (L) `feat(drill): weakness-fitting drill generator + surface`

Replaces the "deed deed"/"xxxx" behaviour (`generateBetterPseudoText` filters to words made **entirely** of the keys, [utils.tsx](src/components/typer/utils.tsx)).

**5a — pure `src/lib/drill.ts` + tests:** `compileDrillText({ keys?, transitions?, wordList, length })`:
- words mode (keys): pick **real** words ranked by *target-key density* (count of target chars / length), not restricted to them; shuffle top-N for variety; no immediate repeats; guarantee every word contains ≥1 target key. Single key (e.g. `x`) → varied real words containing `x` (xenon, box, fix…), never "xxxx".
- transition mode: bias toward words containing the `from→to` adjacency; fall back to grams of that bigram when scarce.
- Tests: density ordering, variety (no 3× repeat), single-key realness, transition presence, termination.

**5b — `/drill` surface (reuses Typer):** route `src/pages/drill.tsx` reading `?keys=` / `?transitions=`. Shows what's being drilled, the compiled text, live net WPM/acc, and on completion a **re-measure CTA** + "Drill again". Feed Typer `fixedText` from `compileDrillText`. Auto-picks words vs grams by input type.

**5c — rewire CTAs to `/drill`:** diagnosis "Drill these keys", progress weakness rows, plan steps, weekly-recap "Drill X". Practice mode (manual keyboard selection) stays, but its text source switches to `compileDrillText` (replace the `generateBetterPseudoText(500, selectedKeys)` call in `useTestText.ts`).

**Verify:** unit (5a); e2e for `/drill` (keys + transitions paths, real words rendered); re-point drill-handoff screenshot (36) and add a `/drill` shot.

---

## Slice 6 — Story-first /progress (L) `refactor(progress): focused story-first dashboard`

Target order (drop the long scroll):
1. **Hero delta** + period switcher + streak chip (net).
2. **Compact trends** row: WPM / Accuracy / Consistency as small multiples (shrink the 3 full-width `TrendChart`s).
3. **Activity heatmap**: port `src/components/profile/activity/Activity.tsx` into a shared component fed by progress records (per-day test counts).
4. **Weakness → Drill**: top weak keys + top slow transition, each → `/drill` (slice 5).
5. **Records + streak** compact.

**Remove from /progress:** self-league card + `selfLeagueSummary` usage (the 1-user empty-lobby trap); `DailyChallengePrompt` (lives on home). Keep the weekly **recap** as a slim dismissible top banner; demote **GoalCard** to a one-line status (expandable).
**Mode filter:** reduce `MODE_FILTERS` to All / Timed / Words (grams/practice/relaxed never write `Test` rows — only `TestModes.normal` persists, [Typer.tsx:363](src/components/typer/Typer.tsx#L363)). Keep length filter + the slice-3(rollup) "hide filters when no metadata" rule.
Keep guest local-first + sync.

**Verify:** rewrite `progress.spec.ts` expectations; re-capture 40–47 (self-league/challenge gone, activity heatmap present, drill CTAs).

---

## Slice 7 — Guided-player Plan (L) `feat(plan): coach-directed guided session player`

`plan.tsx` today: 30-day grid + manual "Mark day complete" (localStorage). Make it a coach.

**Pure `src/lib/planSession.ts` + tests:** a reducer over `{ plan, day, stepIndex, status }` with `start()`, `completeStep()` (auto-advance warm-up→drills→benchmark), `nextDay()` (after last step), persisted shape for localStorage (sync on sign-in later).

**UI:** one **active step at a time** with coach framing ("Warm up — 15s", then "Now drill r, t, b", then "Benchmark"), a progress bar, and explicit advance: warm-up shows **"I'm warm → next"**; drill/benchmark steps **auto-advance on test completion** (detect via the completion callback / a `?return=plan` param from `/drill`). Drill steps deep-link into `/drill` (slice 5). Show day N of 30 + a slim overview, not the front door.

**Verify:** unit (reducer); e2e for start→warm→advance→drill→next; re-capture 48/54.

---

## Cross-cutting
- After each slice: `npx vitest run`, `npx tsc --noEmit`, affected `npx playwright test`, re-capture touched screenshots, `npm run build:check`.
- `/how-we-measure` updated in slices 1 (net) and (if thresholds added) 5.
- Don't relitigate locked constraints (free-tier, local-first, heuristics-first). Plan/drill stay client-derived; no cron/LLM.
