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

## Slice 2 — Leaderboard + challenge boards: best-per-user-per-window by net ✅ DONE (M) `feat(leaderboard): rank one best score per user per window`

> Shipped 2026-06-20. `test.getLeaderboard` returns one row per user (best net in the window), powering a new `LeaderboardList` (net "WPM" + dimmed raw column). Daily-challenge status/boards/baseline + guest record all net (board entry field `speed`→`wpm`). `Scores` (profile lists) shows net + raw. Verified: 251 unit, tsc, leaderboard/profile/challenge e2e (14), build, screenshots re-captured. Note: `getLeaderboard`/board dedupe in memory (low volume) — materialised best-per-window is the budget-era upgrade.


Problem: `Scores.tsx` renders `test.getAll` (every row, score-desc, `date` = `gte`) → one user floods the board. Also carries the deferred Slice-1 net display: leaderboard list, profile scores list, and daily-challenge status/boards (`getDailyChallengeStatus`/`getDailyChallengeBoards` + `DailyChallengePrompt`) all show/rank **net** (derive `netFromRaw(speed, accuracy)`; the challenge baseline/improved-delta become net too).

- New tRPC `test.getLeaderboard({ typeId, count, language, window: "daily"|"weekly"|"monthly"|"all", page, limit })`. window→date floor (today / −7 / −30 / none). Fetch ranked rows in window for typeId+count; group by `userId`; keep each user's max `netFromRaw(speed,accuracy)`; sort desc; paginate. (Volume is low; in-memory group is fine. Note "when there's budget" upgrade: a materialised best-per-window.)
- Leaderboard page + a leaderboard-specific list (fork `Scores.tsx` or branch it): show **WPM (net)** as the ranked column + a smaller "Raw" column; use shared `<Avatar>` (slice 3).
- Keep the existing empty state.

**Verify:** new e2e in `leaderboard` spec asserting one row per user; re-capture screenshot 15.

---

## Slice 3 — Shared Avatar with per-user colour ✅ DONE (S) `feat(ui): unify avatar with deterministic fallback colour`

> Shipped 2026-06-20. Pure `src/lib/avatar.ts` (`avatarColor` hash→hue, `avatarInitial`, 6 tests). New presentational `<Avatar image name size>` (circular picture or deterministic coloured initial, never blank). Replaced every inline fallback: nav (both), profile own/public headers, edit preview, `Scores`, `LeaderboardList`, + added avatars to the daily-challenge boards. OG route shows no avatar, so unchanged. Verified: 257 unit, tsc, build, profile/leaderboard/challenge/navigation e2e, screenshots re-captured.


- Generalise `src/components/Avatar.tsx`: props `{ image?, name?, size }`. Fallback = uppercase first char of `name` (username→name→email), else "?". Background = deterministic colour from a hash of `name` → hue (fixed S/L for contrast on the dark theme), white text. Export a pure `avatarColor(seed: string)` in `src/lib/` + test (stable, distinct hues).
- Replace inline fallbacks: `Scores.tsx`, `src/pages/profile.tsx`, `src/pages/profile/[username].tsx`, daily-challenge boards (`src/pages/challenge.tsx` / board component), score-card author, and the OG route (replicate colour+initial in the `ImageResponse`).
- Handle null username everywhere (no blank circles).

**Verify:** re-capture leaderboard (15), profiles (16/17), challenge boards (49/53-area).

---

## Slice 4 — Rebuild keyboard heatmap as a real keyboard ✅ DONE (S) `fix(heatmap): realistic key layout, no label overlap`

> Shipped 2026-06-21. `<KeyHeatmap>` now uses one shared full keyboard presentation for practice analytics and progress: centered QWERTY rows, practice-like key sizing, visible letter/percentage corner labels, and a centered spacebar. Progress adds the shared accuracy legend around that same keyboard. Mini heatmaps keep percentage text in tooltips only. Tightened `lookupAttempt` typing while touching the primitive.

`src/components/heatmap/KeyHeatmap.tsx` today: 3 equal centred rows + fixed `min-w-[17.5rem]` spacebar; `%` absolutely positioned over the glyph.

- Centered rows matching the regular typing keyboard, matching key sizing, and a centered spacebar. `%` no longer overlaps the letter: show the key label top-left and `%` bottom-right in `full`, tooltip-only in `mini`. Keep `accuracyColor`/`heatmapCell`/`lookupAttempt`, `highlightKeys`, testIds.
- Consumers: practice analytics and progress lifetime use the same full keyboard presentation, score-card and beat-run compare stay mini.

**Verify:** re-capture practice analytics (32), diagnosis (35), progress (40).

---

## Slice 5 — Unified Drill surface ✅ DONE (L) `feat(drill): weakness-fitting drill generator + surface`

Replaces the "deed deed"/"xxxx" behaviour (`generateBetterPseudoText` filters to words made **entirely** of the keys, [utils.tsx](src/components/typer/utils.tsx)).

> 5a shipped 2026-06-21. Added pure `compileDrillText` in `src/lib/drill.ts` plus `rankDrillWords` for density-ranked key drills. Covered density ordering, varied single-key real words, no immediate repeats, transition-word bias, scarce-transition gram fallback, and no-match termination in `src/lib/drill.test.ts`. `/drill`, CTA rewires, and Practice text-source replacement remain in 5b/5c.

**5a — pure `src/lib/drill.ts` + tests:** ✅ DONE `compileDrillText({ keys?, transitions?, wordList, length })`:
- words mode (keys): pick **real** words ranked by *target-key density* (count of target chars / length), not restricted to them; shuffle top-N for variety; no immediate repeats; guarantee every word contains ≥1 target key. Single key (e.g. `x`) → varied real words containing `x` (xenon, box, fix…), never "xxxx".
- transition mode: bias toward words containing the `from→to` adjacency; fall back to grams of that bigram when scarce.
- Tests: density ordering, variety (no 3× repeat), single-key realness, transition presence, termination.

**5b — `/drill` surface (reuses Typer):** ✅ DONE route `src/pages/drill.tsx` reading `?keys=` / `?transitions=`. Shows what's being drilled, the compiled text, live net WPM/acc, and on completion a **re-measure CTA** + "Drill again". Feed Typer `fixedText` from `compileDrillText`. Auto-picks words vs grams by input type.

> 5b shipped 2026-06-21. Added `/drill` with `?keys=` and `?transitions=` targets, compiling fixed drill text through `compileDrillText` and running it through the shared `Typer` as an unranked fixed-text words test. Completion shows net WPM, accuracy, a Re-measure CTA, and Drill again. Added e2e coverage for key + transition drills, a route smoke test, and screenshot `56-drill-surface`.

**5c — rewire CTAs to `/drill`:** ✅ DONE diagnosis "Drill these keys", progress weakness rows, plan steps, weekly-recap "Drill X". Practice mode (manual keyboard selection) stays, but its text source switches to `compileDrillText` (replace the `generateBetterPseudoText(500, selectedKeys)` call in `useTestText.ts`).

> 5c shipped 2026-06-21. Every targeted-key/transition drill CTA now lands on `/drill`: diagnosis findings + error-taxonomy "doubled-letter" (`ShareableScoreCard`/`errorTaxonomy.ts`), progress slowest-transitions + weekly-recap, and plan key/transition steps (`plan.ts`; transitions use `?transitions=`). Generic "drill" CTAs without specific keys (self-league, headline-delta, plateau→grams) keep their existing targets. Practice text now comes from `compileDrillText`. **Re-measure loop preserved (owner-chosen full unification):** the diagnosis CTA forwards the just-completed test's config as an opaque `rm` token to `/drill`; `/drill`'s "Re-measure" CTA round-trips it home as `/?rm=…` (a full-page nav, not next/link, to dodge a typer restart race), where a new handoff rebuilds the before→after offer and re-runs the exact diagnosed test. Verified: 263 unit, tsc, build, e2e (drill key+transition+rm-forward, home diagnosis→/drill + real round-trip delta, progress, screenshots 35/36/37/38/56 re-captured).

**Verify:** unit (5a); e2e for `/drill` (keys + transitions paths, real words rendered); re-point drill-handoff screenshot (36) and add a `/drill` shot.

---

## Slice 6 — Story-first /progress ✅ DONE (L) `refactor(progress): focused story-first dashboard`

> Shipped 2026-06-21. `/progress` is now a full-width single-screen dashboard (`max-w-6xl`). **Above the fold:** a 3-col grid pairs the big hero delta + the full-size **WPM-over-time** chart (left, 2 cols) with the tinted **Weak spots → drill** action panel (right: weakest-key chips + "Drill weakest keys" CTA + slowest transitions, each → `/drill`). The chart header carries **metric tabs** (WPM/Accuracy/Consistency) so one chart toggles between trends instead of stacking three (saves height). The WPM chart stays prominent (user feedback: it's the most important info, not a small multiple). **Goal folded into the hero** (`GoalCard` borderless under the delta): a progress bar with a projected-at-deadline marker + an honest on-track/behind/ahead read — the goal gives the delta a destination instead of being a passive card. Below the hero: the **yearly activity heatmap** (new shared `<ActivityHeatmap>` fed by record timestamps via pure `buildActivityCalendar` in `src/lib/activity.ts` + tests — no extra query, works for guests), then lifetime keyboard + records. **Cut for focus + height** (owner-reviewed): the coach stance line (low-signal "nothing to change" filler), the weekly-recap banner (redundant with hero + weak-spots), and the stat-cell grid except **Best WPM**, which is now a header chip. Removed the 1-user self-league card + `selfLeagueSummary` usage and the on-page `DailyChallengePrompt` (challenge prompt now asserted on home; `selfLeagueSummary`/`buildRecap`/`computeStance` kept as tested lib helpers). `MODE_FILTERS` cut to All/Timed/Words; length filter + "hide filters when no metadata" kept; guest local-first + sync untouched. Result: delta + goal projection + WPM chart + weak-keys/drills all above the fold on most screens. Verified: 266 unit (new activity tests), tsc, build; progress/challenge e2e rewritten and green on desktop + mobile; dashboard captures reviewed; screenshots 40–46 re-captured, obsolete 53-self-league + 45-weekly-recap removed.

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
