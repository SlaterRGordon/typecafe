# Phase 3 — Progression

**Goal:** a four-week user can produce the chart that proves they got faster — and wants to post it.

Bests plateau in weeks; trends compound forever. This phase builds the user's real home.

---

## 3.1 `/progress` — the home for signed-in users (L)

The page answers one question — *am I getting faster?* — before any other detail.

**Layout, top to bottom:**
1. **Headline delta:** "+9.4 WPM in 30 days" (largest number on the page; period switcher 7/30/90/all). If flat or negative: honest, with the Phase 4 hook — "Plateaued for 3 weeks — your drills aren't targeting your slow keys."
2. **WPM trend chart** — per-test scatter + rolling average line, filterable by mode/length (reuse the score-card chart component, extended)
3. **Accuracy + consistency trends** — same x-axis, small multiples
4. **Lifetime keyboard heatmap** — `<KeyHeatmap full>` over `KeyStat` aggregates, with a date-range comparison toggle ("30 days ago vs now") to show keys warming from red to green
5. **Worst-transitions list** — top 5 slow bigrams, each ending in **[Drill]** (the everywhere-rule)
6. **Records timeline** — PBs as dated events: "Mar 3 — first 80+ WPM test"

**Data:** trends read the `Test` table (signed-in) or the localStorage mirror (guests — local-first means guests get a real `/progress` from day one, capped at their stored history; the page itself is the signup pitch: "sign in to keep this forever").

**Aggregation:** a `DailyUserStat` rollup table (userId, date, tests, bestWpm, avgWpm, avgAcc) maintained on test-save (derived-on-write, no cron) keeps chart queries O(days) not O(tests).

**Progress (built in slices):**
- 2026-06-14 — *slice 1, math foundation:* `src/lib/progress.ts` (pure, 37 unit tests) — period windows (7/30/90/all), `headlineDelta` (current vs prior window; all-time splits at the time midpoint; honest "insufficient"), `trendSeries` (scatter + length-aligned rolling average), and `dailyRollups`/`dayKey` (timezone-correct O(days) aggregation mirroring `DailyUserStat`).
- 2026-06-14 — *slice 2, the page (signed-in):* `/progress` with the headline delta (largest number, success/error tone, drill CTA when flat/negative), the WPM trend chart (`TrendChart`), a period switcher, and Avg/Best WPM + accuracy + test-count cells. Reads a new `test.getProgressRecords` tRPC query. Empty + signed-out (signup-pitch) states. Progress nav link (desktop + mobile). e2e (`progress.spec.ts`) + screenshot tour (`40`–`42`).
- 2026-06-14 — *slice 3, guest local-first mirror:* `src/lib/progressHistory.ts` (validated localStorage list, 4 unit tests). `index.tsx` appends `{wpm,accuracy,t}` on each guest completion; `/progress` reads it so a guest with history gets the real dashboard + a "sign in to keep it forever" banner, no account. Screenshot `43`, e2e covers the guest path. ponytail: capped flat list, no rollups/dedup (guests don't generate that volume); the nav link stays signed-in-only for now.
- 2026-06-14 — *slice 4, records timeline + accuracy trend:* `personalRecords` (PB milestones, "first 80+ WPM"/plain-best; 4 unit tests) → a Records list. `TrendChart` generalized to a "zero" (WPM) or "fit" (accuracy, zoomed, capped at 100%) baseline → both a WPM and an Accuracy trend.
- 2026-06-14 — *slice 5, lifetime keyboard heatmap:* reuses `<KeyHeatmap full>` over `practiceStats.get` (signed-in) / `readLocalKeyStats` (guest). e2e + screenshot `40` show it.
- 2026-06-14 — *slice 6, consistency persisted + trend (also §3.6):* added `Test.consistency` (nullable), computed client-side via `consistencyFromSamples` and threaded through `test.create` (signed-in) and the guest mirror (`progressHistory` `c`). `/progress` now shows a Consistency trend + Avg-consistency cell, gated to render only once every point in the window carries it (no mixing real values with zeros). Older tests stay null and simply don't plot; the trend fills in as new tests accrue.

**Blocked — needs prerequisites that don't exist yet (do not fake):**
- *Heatmap date-range compare ("30 days ago vs now", item 4):* `PracticeStats` are cumulative, not dated; there's no per-key historical snapshot to diff. Needs dated key-stat capture first.
- *Worst-transitions bigrams (item 5):* requires lifetime per-transition (inter-key latency) aggregates — Phase 4 instrumentation; nothing stores them today.

*Other next slices:* `DailyUserStat` rollup persistence + mode/length filters; sync-on-signup of the guest mirror into the DB.

## 3.2 Streaks (S)

- Practice-day streak computed from `DailyUserStat` on read — no jobs
- Shown on `/progress`, profile, and the share card ("12-day streak" chip)
- A streak counts any completed test or drill ≥ 30s of typing — streaks reward *practice*, not test-spam (vision: no decorative gamification; streaks and deltas only)

**Progress:** 2026-06-14 — `currentStreak` (pure, derived-on-read from the records, timezone-correct with a today-grace day; 7 unit tests) drives a "N-day streak" chip in the `/progress` header. ponytail: counts any day with a completed test; the ≥30s anti-spam bar waits on per-test duration not yet stored on `Test`. Profile and share-card placement land with those surfaces (3.3).

## 3.3 Delta-first sharing (M)

The share available to *every* user, not just fast ones:

- **Progress card:** "+18 WPM in 60 days" + the trend chart, generated through the existing share pipeline (slug page, fixed-size PNG, OG image) — a second `ScoreShare` kind: `kind: "progress"` with its own snapshot zod schema
- Score-card share gains a delta line when history exists: "3 WPM over my 30-day average"
- OG image for progress shares leads with the delta, not the absolute

**Progress (built in slices):**
- 2026-06-14 — *slice 1, score-card delta line:* `test.create` computes WPM vs the user's 30-day rolling average (`thirtyDayDelta`, null until ≥3 prior tests) and returns it alongside `brag`; the result card shows "X WPM over/under your 30-day average" (success/error tone). No schema — `avgDelta` rides the existing return + `ScoreSnapshot`. e2e asserts it on the completed-card capture (`13`).
- 2026-06-14 — *slice 2, delta persisted to share + OG:* `avgDelta` added to the `scoreShare` snapshot zod and written when a share is created; the shared card renders it (rides `...snapshot`) and the OG image shows "X WPM over/under their 30-day average" under the WPM. e2e asserts it on the shared-score capture (`18`).
- *Next slice:* the standalone progress card itself ("+18 WPM in 60 days" + trend), which needs the `ScoreShare.kind` + nullable-`testId` schema change and a progress OG route.

## 3.4 Weekly recap — in-app, free-tier honest (M)

No email provider exists. The recap is a surface, not a send:

- On first visit ≥ 7 days after the last recap, `/progress` opens with a recap state: the week's delta, keystrokes, streak, one prescribed focus ("your `b` cost you the most this week → [Drill]")
- Recap is itself shareable (same progress-card pipeline)
- **When there's budget:** the same payload becomes an email via Resend/Postmark — the recap generator (`src/lib/recap.ts`) is written render-agnostic from day one

## 3.5 Goals (M)

- One active goal: target WPM + date ("100 by September")
- `/progress` shows trajectory: current rolling average projected linearly vs required pace — honest about shortfall ("at this pace you reach 100 in November; to hit September, X sessions/week")
- Projection math in `src/lib/trajectory.ts`, unit-tested, assumptions documented on `/how-we-measure`
- No notifications (no infra) — the goal lives where the user already looks

## 3.6 Consistency everywhere (S)

`consistencyFromSamples` exists; surface it: score card (with `?` → `/how-we-measure`), `/progress` trend, diagnosis input in Phase 4 ("your speed is fine; your variance is the problem").

**Progress:** 2026-06-14 — the `/progress` consistency trend + Avg-consistency cell ship with §3.1 slice 6 (consistency now persisted on `Test` and in the guest mirror). Score card already shows consistency; the Phase 4 diagnosis input remains.

## Sequencing note

3.1 before everything (it's the destination other features link to). Then 3.3 (sharing compounds earliest), 3.2, 3.4, 3.5/3.6.

## Acceptance

- [x] A user with 4 weeks of history sees their delta in < 3 seconds on `/progress`
  - 2026-06-14: Signed-in users get the headline delta + WPM trend immediately on `/progress` (the delta is computed client-side from `test.getProgressRecords`). Guest local history and the richer trends below are still pending.
- [x] A *guest* with 2 weeks of local history sees the same page, plus the keep-it-forever signup pitch
  - 2026-06-14: Guest completions mirror to localStorage (`progressHistory.ts`); `/progress` renders the full dashboard from it with a "sign in to keep it forever" banner. Sync-on-signup into the DB is still pending.
- [ ] Progress share card unfurls correctly on Discord/Twitter (OG verified like the score card was)
- [x] Streak math correct across timezones (test: tests at 23:50 and 00:10)
  - 2026-06-14: `currentStreak`/`dayKey` unit tests cover the 23:50/00:10 offset case.
- [x] Every trend chart renders sanely with 1 data point, 10, and 1,000
  - 2026-06-14: `trendSeries` unit tests assert 1/10/1,000-point behaviour; `TrendChart` centres a single point and shrinks markers at high density.
- [~] Screenshot tour: /progress (rich history, sparse history, guest, recap state, goal on/off track)
  - 2026-06-14: rich history (`40`), empty (`41`), signed-out pitch (`42`), guest history (`43`) captured. Recap and goal states wait on §3.4/§3.5.

**Owner's part:** seed real usage (your own daily tests make the first real trend), judge whether the headline delta *feels* motivating, share the first progress card publicly.
