# TypeCafe Roadmap

> Each phase has a detailed execution doc in [docs/phases/](phases/README.md), including locked constraints (free tier, local-first, full keystroke timelines, heuristics-first, free forever, pre-launch break-anything) and the owner/agent division of labor.

Ordered by the [vision](vision.md): **measure → diagnose → drill → re-measure → see the delta.** Earlier phases make the promise true; later phases make it true for more people and louder. Nothing here ships if it fails the filter: *does it make someone faster, or show them they're getting faster?*

Items marked 🌙 are moonshots — not currently feasible with today's stack, team size, or data volume. They're here anyway so near-term decisions don't accidentally close the door on them.

---

## Phase 0 — Trust (the numbers must be right first)

A typing coach with wrong numbers is dead on arrival. All of this precedes any growth push.

- [x] **Fix live accuracy undercount** — shows 50% after 3-of-4 correct keystrokes (first-keystroke off-by-one; plan.md bug #4). Fixed: keystroke counting starts at position 0 (correct or wrong) and starts the timer; e2e regression in `home.spec.ts` pins 3-correct-1-wrong = 75% and a wrong first key = 0%.
- [x] **Fix countdown timer drift** — derive remaining time from `Date.now() - startTime`, not chained `setInterval`. Fixed: `useTimer` reschedules each tick against the wall-clock start and re-derives the value via pure `deriveTimerTime`/`nextTickDelay` (`src/hooks/timer/tick.ts`); unit test proves <100ms drift over 60s under per-tick jitter.
- [x] **Suppress WPM on tiny samples** — grams mode shows "500.0 wpm" after a 2-character level; no WPM display until ≥1s / ≥5 keystrokes. Fixed: pure `isReliableWpmSample` in `src/lib/stats.ts` gates the grams WPM/avg to "—" (live and on completion) until a sample clears both bars; progression is untouched. Unit + e2e + screenshot coverage.
- [x] **Fix timed-mode text exhaustion deadlock** — long custom tests run out of the fixed 500 words and freeze. Fixed: `Text.tsx` appends generated words on approach for timed mode (not just relaxed); e2e covers a timed test running past its initial buffer to timer expiry.
- [x] **Fix n-gram repetition exponential growth** (`ngram += ngram` → `repeat(n)`, clamped). Fixed: `generateNGram` uses `repeat(repetition + 1)` clamped to 20 copies; `utils.test.ts` asserts linear growth and the clamp.
- [ ] **Fix failed-score-save swallowing results** — completion must render even when the mutation fails
- [ ] **Unit-test all scoring math** in `src/lib/stats.ts` — WPM, accuracy, consistency, samples
- [ ] **Publish "How we calculate WPM"** page — trust artifact + SEO ("how is wpm calculated" ranks)
- [ ] Polish the details that signal care: format `20.566666666666666 mins`, fix the clipped avatar fallback, fix the pre-test spacebar highlight, give the Smart drill button a real home

**Done when:** a skeptic typing side-by-side on TypeCafe and Monkeytype gets numbers that agree, and we can explain every decimal.

## Phase 1 — Close the loop (the flagship feature)

The sentence we're building: *"You lost ~8 WPM to `r`, `t`, and `b` → [Drill these keys]."*

- [x] **Post-test diagnosis on the score card** — slowest keys, least accurate keys, costliest bigrams for *this* test, computed from the keystroke timeline we already record. Done: pure `src/lib/diagnosis.ts` (unit-tested) drives a Diagnosis panel on `ShareableScoreCard` with the <30-keystroke honesty guard; finding sentences each end in a button.
- [x] **One-click drill handoff** — every diagnosis links into Practice with exactly those keys selected (the wiring between `worstKeysFromAttempts` and practice mode already exists; connect it from the results screen). Done: each finding's **[Drill these keys]** links to `/?mode=practice&keys=…`; `index.tsx` applies the params (mode + selectedKeys), records the diagnosed config for the re-measure prompt, and cleans the URL. e2e + screenshot tour (`35-score-card-diagnosis`, `36-drill-handoff-practice`) cover the guest path.
- [x] **Re-measure prompt** — after a drill session, offer the same test config again and show the delta: "before: 71 WPM → after: 76 WPM". Done: the drill view shows a "Re-run your test" prompt that restores the diagnosed config; the re-run's result card headlines a before→after WPM strip (`ReMeasureStrip`, pure `wpmImprovement` in `stats.ts`). e2e + screenshots (37–38) cover the guest loop.
- [ ] **Heatmap primitive for diagnosis** — extract the Practice keyboard's per-key accuracy rendering so the score card can show a mini heatmap now and Phase 3 can reuse the full keyboard heatmap later.

**Done when:** a new user finishes one test and is two clicks from drilling their personal weakest keys.

## Phase 2 — Typer UI overhaul (the instrument)

The previous Phase 1.4 main-page pass is superseded by the mockup-driven overhaul in `docs/screenshots/vision-screenshots/`.

- [ ] **Split Timed and Words into separate top-level modes** — toolbar modes become Timed / Words / Practice / Grams / Relaxed; no user-facing Normal mode
- [ ] **Move length out of settings** — preset length controls live in the typer toolbar; clicking Custom slides an input right-to-left over the presets
- [ ] **Move language out of settings** — language opens from its own toolbar icon beside settings
- [ ] **Move icon buttons to the toolbar's right side** — settings, restart, fullscreen, and language sit together as compact icon controls
- [ ] **Replace settings modal with a dropdown menu** — closes on outside click, escape, selection, or clicking settings again; contains only secondary toggles
- [ ] **Refresh WPM/accuracy and typing text** — stats use the mockup treatment and the typing text becomes much larger and clearly central
- [ ] **Build the grams settings subpanel** — source/scope/combinations/repetitions/thresholds visible like `vision-grams.png`; ignore the hallucinated custom length input
- [ ] **Preserve the improvement loop** — diagnosis drill handoff, re-measure prompt, live stats, keyboard, restart, fullscreen, and guest flow still work

**Done when:** the first screen matches the vision screenshots closely enough for owner taste pass, and every frequent typing control is available without the old settings modal.

## Phase 3 — Progression (the retention engine)

- [ ] **/progress dashboard** — the user's true home: WPM trend (per mode/length), accuracy trend, consistency trend, heatmap evolution over time, worst-bigram list shrinking week over week
- [ ] **Personal records timeline** — every PB as an event: "Mar 3: first 80+ WPM test"
- [ ] **Consistency everywhere** — it exists on the share card only; add to results and trends
- [ ] **Streaks** — practice-day streaks on profile and share card; milestones are share bait
- [ ] **Delta-first share cards** — "+18 WPM in 60 days" with the trend chart; a brag available to every user, not just fast ones, and a better ad than a raw score
- [ ] **Weekly recap** — opt-in email/notification: your week in keystrokes, your delta, the one drill to do next week
- [ ] **Goal setting** — "I want 100 WPM by September" → projected trajectory from current trend, suggested daily drill load, progress against plan
- [ ] 🌙 **Plateau detection** — flag when a user's trend has flatlined for N weeks and proactively change their drill mix; the coach notices before the user does

**Done when:** a four-week user can produce the chart that proves they got faster — and wants to post it.

## Phase 4 — The coach (diagnosis becomes prescription)

- [ ] **Practice plans** — "your 30-day plan": a generated daily sequence (warm-up test → 2 targeted drills → benchmark) built from the user's actual weakness data, adapting as the data changes
- [ ] **Bigram/trigram diagnosis** — extend per-key tracking to per-gram timing: it's rarely single keys that cap speed, it's transitions (`th`, `ion`, `br`). We already ship the n-gram corpus; instrument inter-key latency per transition and drill the slow ones
- [ ] **Error taxonomy** — classify mistakes (adjacent-finger hits, transpositions, doubled letters, rhythm breaks after errors) and prescribe differently for each
- [ ] **Speed vs. accuracy guidance** — detect whether a user improves faster by slowing down (accuracy-limited) or pushing (confidence-limited); say so explicitly
- [ ] 🌙 **ML-personalized text generation** — generate drill text optimized per user: maximally weighted toward their weak transitions while still reading like language, difficulty auto-tuned to keep them at the edge of ability (flow state, ~95% success rate)
- [ ] 🌙 **Finger-level analytics** — infer finger usage from keystroke timing patterns (or optional webcam/hand-tracking opt-in) to diagnose technique, not just output: "your right pinky is your bottleneck"
- [ ] 🌙 **AI coach conversations** — "why am I stuck at 85?" answered from the user's own data: "your accuracy collapses after errors — you rush to recover; here's the drill"

**Done when:** TypeCafe tells users something true about their typing that they didn't know and couldn't get anywhere else.

## Phase 5 — Competition that serves improvement

Async only. Realtime racing is TypeRacer's moat and a populated-lobby trap; we refuse to inherit it.

- [x] **Daily challenge** — same seed text for everyone, daily leaderboard, streak integration; the recurring visit reason
- [x] **Beat-my-run links** — recipient types the *same text*, gets a side-by-side comparison; reuses the polished share-card pipeline; the built-in viral loop
- [ ] **Leagues by improvement, not speed** 🏆 — weekly cohorts ranked by *delta*, not absolute WPM; a 50-WPM typist who gains 6 beats a 120-WPM typist who gains 0. The only leaderboard where everyone has a real chance, and the purest expression of the vision
- [ ] **Cohort context** — "fastest 25% of people who started within 10 WPM of you" — percentiles that mean something to *you*
- [ ] 🌙 **Club/team spaces** — keyboard Discords and dev teams get private leaderboards, group challenges, aggregate progress ("our server gained 214 WPM this month")

**Done when:** the leaderboard a user checks daily is the one measuring their improvement.

## Phase 6 — Content & reach

- [ ] **Code mode** — typing drills in real programming-language syntax (symbols, indentation, camelCase). Differentiated, matches the dev aesthetic, and "typing test for programmers" is the low-difficulty SEO keyword already in growth.md. One mode, three wins
- [ ] **Quote/passage packs** — random top-10k words gets stale; quotes and literature passages keep evidence-collection from feeling like a chore
- [ ] **More languages, lazy-loaded** — the corpus pipeline (createGrams) generalizes; ship the bundles per-language instead of the current ~1.3 MB static payload
- [ ] **SEO content engine** — the calculation page, "what is a good typing speed", per-keyword landing pages backed by our own anonymized percentile data
- [ ] **Embeddable widget** — "my typing speed" iframe for dev portfolios; every embed is a backlink
- [ ] 🌙 **Layout transition coaching** — the QWERTY→Colemak/Dvorak journey is a dedicated, underserved community with no good progress tooling; we already have per-key data, they already post progress charts weekly
- [ ] 🌙 **Hardware tie-ins** — QMK/VIA-aware integrations: detect the board, benchmark per-board on profiles ("my WPM on the Lily58 vs the Keychron"), sponsor-ready for keyboard YouTube

## Phase 7 — Moonshots (the door stays open)

- 🌙 **TypeCafe API / open data** — users own their keystroke history; export it, build on it. Researchers and tinkerers become advocates
- 🌙 **Anonymized research dataset** — at scale, the per-key/per-transition corpus across thousands of typists is genuinely novel; publish findings ("the 10 bigrams that cap intermediate typists") that earn citations and authority
- 🌙 **Native/offline app** — keystroke timing measured outside browser event-loop jitter; the "lab-grade" measurement story
- 🌙 **OS-level passive coach** — opt-in background measurement of real-world typing (with extreme privacy care): your *actual* daily WPM, drills generated from your *real* mistakes, not test mistakes. The endgame: the coach that watches you work
- 🌙 **Certification** — verified WPM credential (proctored test mode) that means something on a résumé; the "official" typing certificate is a real, unserved market

---

## What we deliberately will not build

- Realtime multiplayer racing (populated-lobby trap; TypeRacer's moat)
- Theme marketplace beyond solid presets + the existing custom picker (Monkeytype's moat)
- Classroom/teacher administration (TypingClub's market, different product)
- Gamification divorced from improvement (XP for keystrokes, decorative badges) — rewards exist only for *deltas* and *streaks*

## Sequencing logic

Trust before loop, loop before the typer UI overhaul, UI clarity before progression, progression before coach, coach before competition, competition before reach. Each phase makes the next one's promise credible: there's no point marketing a coach whose numbers are wrong, and improvement leagues only matter once improvement is visible. When priorities conflict, the tiebreaker is always the vision sentence — *does this make someone faster, or prove that they're getting faster?*
