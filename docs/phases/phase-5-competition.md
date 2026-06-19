# Phase 5 — Competition That Serves Improvement

**Goal:** the leaderboard a user checks daily is the one measuring their improvement.

Async only — realtime racing is TypeRacer's moat and a populated-lobby trap (a live lobby with 3 users is worse than none). Every design below works perfectly with **one** user and gets better with more; none requires liveness. All free-tier: date-seeded determinism and computed windows, zero cron.

---

## 5.1 Daily challenge (M)

- **Deterministic seed, no infra:** challenge text = seeded PRNG over the corpus with seed `hash(YYYY-MM-DD)` — every client generates the same text locally; no storage or job needed

**Progress:** 2026-06-16 — *slice 1, the deterministic generator:* `src/lib/challenge.ts` (pure, 6 unit tests). `challengeText(words, dateKey, count)` = FNV-1a seed → mulberry32 PRNG → byte-identical word picks (acceptance #1); `challengeDateKey(now, offset)` is the timezone-correct local day so the boundary is local midnight (acceptance #4). 120-word default so a 30s timed run never exhausts the seeded text (no nondeterministic append). No surface yet — the challenge mode/prompt, `Test.challengeDate` stamping, and the two leaderboards are the next slices.
**Progress:** 2026-06-19 — *slice 2, prompt + boards:* `/challenge` renders the 30s seeded text from the browser's local day, runs it through `Typer` as fixed non-appending text, and signed-in completions stamp `Test.challengeDate`. The page now shows derived-on-read daily boards from `test.getDailyChallengeBoards`: fastest today plus most-improved vs each user's prior 30-day average (minimum 3 prior ranked tests). Desktop/mobile e2e cover prompt, deterministic reload, and boards; desktop e2e covers the signed-in challenge save stamp; screenshot tour captures `49-daily-challenge`.
**Progress:** 2026-06-19 — *slice 3, return loop:* `DailyChallengePrompt` now surfaces today's challenge status on home and `/progress`, shows yesterday's result, and frames completion as WPM plus delta-vs-average when signed in. Guests get a local-first `typecafe:challengeHistory` mirror with today/yesterday/streak derived on read; signed-in users get `test.getDailyChallengeStatus` from `Test.challengeDate` rows. `/challenge` refreshes the prompt after completion. Unit tests cover streak/local-history math; e2e covers local home status, signed-in progress status, deterministic challenge text, and boards; screenshot tour captures `50-home-daily-challenge-prompt`.
- One config (30s timed initially); completing it stamps the Test row (`challengeDate`), feeds the streak
- Daily leaderboard = query Tests where `challengeDate = today`; **two boards from day one:** *fastest* and **most improved vs their own 30-day average** — the second is the vision board, and it works even when the fastest board is thin
- Yesterday's result + today's prompt surface on home and `/progress`
- Challenge share card: "Top 12% today" or "+6 over my average" — delta framing available to everyone

## 5.2 Beat-my-run (M) — the viral loop

- Existing `ScoreShare` gains the text seed; share page gets **[Type this yourself]** → recipient (no account needed — local-first) types the *identical text*
- Side-by-side result: WPM, accuracy, per-key heatmap comparison, divergence point ("you were ahead until `through`")
- Their result page offers the same button — the loop continues
- Anti-retry honesty: first attempt is the comparable one; retries shown but labeled ("best of 4")

## 5.3 Improvement leagues (L) — the purest vision feature

Weekly cohorts ranked by **delta, not absolute speed** — the only leaderboard where a 50-WPM typist beating a 120-WPM typist is working as intended.

- **Computed windows, no resets:** league week = ISO week derived at query time; score = `(this week's rolling avg) − (prior 30-day baseline)`, minimum 3 sessions to qualify (anti-noise, anti-sandbagging)
- Cohorts of ≤ 50 by signup order into named groups (no skill-matching needed at first — delta ranking *is* the equalizer)
- **Cold-start honesty:** below ~100 weekly actives, leagues render as "your week vs your baseline" (self-league) — the same math, no fake-feeling empty cohorts; flip cohorts on when population supports it
- Baseline manipulation (tanking) noted as accepted risk pre-scale; revisit with population

## 5.4 Cohort percentiles (S)

Replace global percentile bragging with peer context: "fastest 25% of typists who started within ±10 WPM of you" (computed from `DailyUserStat` baselines). Falls back to global percentile until the peer pool ≥ 50. Keeps the existing never-discourage rule — below the 60th percentile we show deltas, not ranks.

## 5.5 Deliberately deferred

- **Clubs/team spaces** → stays in Phase 7 until there are communities to host
- **Realtime racing** → never (see vision)
- **Anti-cheat beyond basics** → timeline sanity checks (humanly possible inter-key latencies, variance floor) flag impossible runs on ranked boards; serious anti-cheat waits for a population worth cheating against

## Acceptance

- [x] Two clients on the same date generate byte-identical challenge text with zero network calls
  - 2026-06-16: `challengeText` is a pure function of the date + corpus (seeded PRNG), unit-tested for byte-identical output and corpus-only words.
- [ ] Beat-my-run works guest-to-guest end to end (share → type → compare → re-share)
- [ ] Improvement board ranks a +6 slow typist above a +0 fast typist; self-league renders sanely with 1 user
- [x] Timezone correctness on challenge day boundaries (23:50/00:10 test)
  - 2026-06-16: `challengeDateKey` uses the local day; unit-tested that 23:50 and 00:10 local fall on different challenge days (and yield different text).
- [ ] Impossible-timeline runs excluded from ranked boards (unit-tested detector)
- [ ] Screenshot tour: challenge prompt/result/boards (both rankings), beat-my-run compare view, self-league and cohort league states

**Owner's part:** seed the loop — post your own daily-challenge and beat-my-run links (agents must never astroturf); pick the moment the population justifies flipping self-league → cohorts.
