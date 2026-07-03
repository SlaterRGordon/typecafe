# Honest review — 2026-07-02

Full product review (screenshot tour, vision doc, ledgers, schema, scoring
code, unit suite 416/416 green). Verdict: the measure→diagnose→drill→
re-measure loop is real and the engineering discipline is strong; the risks
are the first 60 seconds of a stranger's visit, typing feel, and two cracks
in "numbers beyond reproach".

**What's good (don't touch):** the improvement loop end to end, scoring math
in `src/lib/` with tests, the screenshot tour, Progress as retention engine,
Most Improved challenge board, the restraint (modes folded, no multiplayer,
no theme marketplace). Architecture deepening is done — a fourth round would
be procrastination.

## Findings, ranked by threat to the goal

### 1. New visitors don't get it — ACTIVE
Home for a zero-history visitor is a minimal test clone (vision §5 failure).
The coach tabs need history; the diagnosis needs a finished test; nothing
upstream makes the promise.

- [x] One line of promise copy above the test, zero-history visitors only,
  gone once there's any local or account history
  (`src/components/home/FirstVisitPromise.tsx`).
- [x] E2e + screenshot-tour coverage (01-home-default shows it).

### 2. Bad tests get praise — ACTIVE
Tour captures show a 3s / 4 WPM *unranked* test wearing "Faster than 72% of
similar starters" and "+3.2 WPM over your 30-day average", and a 4s / 0%
run with per-key "you lost ~45 WPM" findings. The diagnosis has a quality
bar ("too short to diagnose — try a 30s+ test"); brags and per-key findings
don't share it.

- [x] One shared test-quality gate: `ranked` (already lib + unit-tested via
  `isRankableSample`) now gates *every* flattering element — server stops
  computing the 30-day delta and streak for unranked runs (brag already was),
  and the card + share image hide brag/streak/delta chips when
  `ranked === false`, whatever a stale snapshot carries.
- [x] Regression coverage: home.spec "an unranked test wears no flattery
  chips"; tour capture 13 now pins the honest unranked card (positive path
  stays pinned in shared-score.spec).

### 3. Typing feel is an unexamined bet — not started
No sound, no latency work anywhere in the ledgers; the daily-driver choice
is made on feel. Side-by-side someone against Monkeytype before launch.

Concrete lead (found 2026-07-03 while deflaking e2e): the typer drops
keystrokes for a window while a restart regenerates the text — a fast typist
hitting tab+enter and typing immediately loses their first keystroke(s).
The e2e helpers now press-until-registered to work around it; the product
should buffer or shrink that window instead.

### 4. Leaderboard is off-vision — not started
Bare speed table, absolutes only, empty at launch. Give it the Most
Improved treatment or demote it.

### 5. Keystroke timelines aren't persisted — ACTIVE
Locked constraint #2 says full keystroke timelines; `Test` rows store only
aggregates. Every real test typed before this lands is evidence lost
forever (no replay, no re-diagnosis under better heuristics).

- [x] Persist the recorder's event log with each saved test: `Test.timeline
  Json?` (migration `20260703063225_test_timeline`), written from the
  already-validated `input.timeline` the anti-cheat check consumes; input
  capped at 50k keystrokes. No reads yet — evidence for the future.
- [x] Guest→DB decision: the pending-score path already carries the
  just-finished test's timeline through sign-in; historical guest tests only
  mirror aggregates locally (no stored timelines), so there is nothing else
  to import. Guests' older timelines are accepted as unrecoverable.

### 6. No daily ritual — not started
"15 min a day" has no scaffolding: one coach tab, plan feature flagged off,
Plan-into-Progress deferred (ux-cleanup §7). Right next feature after 1/2/5.

## Before building anything else

Watch 5–10 real plateaued-intermediate typists use it for ten minutes.
Answers 1, 2 and 3 faster than any ledger.
