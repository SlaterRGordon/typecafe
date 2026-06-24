# Phase 3 e2e review — progression polish

Critical pass over the shipped Phase 3 surfaces (progress dashboard, score card, the loop). Severity: 🔴 trust/bug, 🟠 UX/vision, 🟡 polish. "Confirmed" = read in code; "fixture" = seen in screenshot tour, behavior plausible but numbers are mocked.

## Trust — the numbers (vision principle #4)

- ✅ **DONE — No minimum-length gate before a test is ranked.** Fixed: pure `isRankableSample` (≥3s, ≥10 keystrokes; firmer than the display floor) gates `ranked` in `test.create`, so a stray 1–3 keystroke test still saves but no longer feeds rollups/streaks/trend/percentile/brag. Documented on /how-we-measure. Thresholds tunable by owner. Unit-tested (`isRankableSample`, `timelineDurationMs`).
- ✅ **DONE — Score card hero was Raw WPM regardless of accuracy.** 0% / 50-wrong headlined "150.0 Raw speed". Fixed: pure `shouldHeroNetWpm` (accuracy < 50%, where net is 0 anyway) makes the card lead with Net WPM and demote raw to a normal cell, so a big raw figure never sits over a near-0 run. Unit-tested; screenshot 35 re-captured.
- 🟠 **Brag + 30-day delta on degenerate tests** (screenshot 13: percentile + "3.2 over 30-day avg" on a 1-keystroke card). Follows directly from the no-min-length gap above. `buildBrag` guards on `ranked` ([test.ts:60](src/server/api/routers/test.ts#L60)) but "ranked" is too easy to earn.

## Coordination — surfaces contradict each other

- ✅ **DONE — Three advisory systems gave opposite advice on one screen** (screenshot 47): headline "Plateaued → transition drills" beside Coach "nothing to change". Fixed: the stance Coach card now renders only when it adds a real lever (accuracy/confidence-limited) or genuine "keep going" reinforcement (trend up), and never beside the plateau headline. The no-lever-while-flat "nothing to change" card (the contradiction) is suppressed; plateau + league now agree ("act"). e2e pins that the stance card is absent on plateau.
- 🟠 **Streak shown 3 ways, 3 values, same viewport** (challenge 4-day, progress 1-day, score card 5-day). Three separate computations: challenge streak, `currentStreak(records)`, server `practiceStreak`. No shared definition or label. Reads as a bug. → single source/definition, or label each ("4-day challenge streak").

## /progress layout — the page no longer answers "am I getting faster?" first

- 🟠 **Headline delta is buried 3rd–4th.** Order is recap → Daily Challenge → Self League → *then* the delta ([progress.tsx:282-368](src/pages/progress.tsx#L282-L368)). §3.1 says the delta is "the largest number on the page, before any other detail" — the code comment even claims it. Two Phase-5 competition cards sit above it. → delta + trends first; challenge/league below.
- 🟠 **Three stacked "+X WPM" delta cards** over different windows (challenge +3.2, league +8.3, progress +13.2) with no hierarchy — dilutes the one number that matters.
- 🟠 **"Self league / 1-user league / Add another score"** is the empty-lobby trap the vision warns against, rendered as the page's most prominent card pre-launch. Reconsider placement/whether it belongs on /progress at all yet.
- 🟡 Page is becoming a dumping ground (recap, challenge, league, delta, coach, goal, 3 charts, heatmap, transitions, records). Decide what earns its slot.

## New rollup + guest-sync feature (the slice under review)

- ✅ `mergeDailyRollups` dedups by day — no double-count when a day has both a raw `Test` and its rollup ([progress.ts:433](src/lib/progress.ts#L433)). Solid.
- ✅ **DONE — Imported guest history vanished under any mode/length filter.** Rollup-only days carry no `mode/subMode/count`, so `filterProgressRecords` dropped them and the empty state lied ("no ranked tests yet"). Fixed: the filter panel only renders when some record carries filterable metadata (so pure rollup/guest history never hits a dead-end), and when a mixed-history filter does empty, the copy now explains "Imported history isn't split by mode or length." e2e pins filters absent for imported-only history.
- ✅ **DONE — Silent permanent sync failure for big guests.** `syncProgressHistory` rejects a batch over `.max(1000)`; an oversized (hand-edited) localStorage would never clear and retry forever. Fixed: `readLocalProgress` now enforces the same CAP on read as on write (newest 1000), so the app never holds or sends more than the server accepts. Unit-tested.
- 🟡 **Streak depends on the mode filter.** `currentStreak(filteredRecords)` ([progress.tsx:191](src/pages/progress.tsx#L191)) — a practice-day streak shouldn't change when you view "Timed". Compute from unfiltered records.
- 🟡 Plateau computed on all-time `filteredRecords` while the period switcher says 30d → "9 weeks" shown under a 30d view.

## Fun / experience

- 🟡 Empty progress shows two competing CTAs (league "Take this week's test" + headline "Take a test").
- 🟡 Drill view is a wall of identical "deed" ×33 (screenshot 37) — functional but joyless; the re-measure payoff is the hook, not the drill itself.

## Suggested order

1. Min-length ranking gate (🔴 fixes trust + rollup pollution at the source).
2. Coordinate plateau/stance/league into one coach voice (🔴 contradictions).
3. Reorder /progress: delta first (🟠 vision).
4. Unify streak definition (🟠).
5. Filter-vs-rollup metadata + >1000 sync cap (🔴/🟠 feature bugs).
