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

- [ ] One line of promise copy above the test, zero-history visitors only,
  gone once there's any local or account history.
- [ ] E2e + screenshot-tour coverage.

### 2. Bad tests get praise — ACTIVE
Tour captures show a 3s / 4 WPM *unranked* test wearing "Faster than 72% of
similar starters" and "+3.2 WPM over your 30-day average", and a 4s / 0%
run with per-key "you lost ~45 WPM" findings. The diagnosis has a quality
bar ("too short to diagnose — try a 30s+ test"); brags and per-key findings
don't share it.

- [ ] One shared test-quality gate (lib, unit-tested) applied to every
  flattering/diagnostic element on the score card: brag badges and per-key
  findings hidden below the bar.
- [ ] Regression coverage for the degenerate-test card.

### 3. Typing feel is an unexamined bet — not started
No sound, no latency work anywhere in the ledgers; the daily-driver choice
is made on feel. Side-by-side someone against Monkeytype before launch.

### 4. Leaderboard is off-vision — not started
Bare speed table, absolutes only, empty at launch. Give it the Most
Improved treatment or demote it.

### 5. Keystroke timelines aren't persisted — ACTIVE
Locked constraint #2 says full keystroke timelines; `Test` rows store only
aggregates. Every real test typed before this lands is evidence lost
forever (no replay, no re-diagnosis under better heuristics).

- [ ] Persist the recorder's event log with each saved test (one nullable
  JSON column; no reads yet — this is evidence for the future).
- [ ] Decide what the guest→DB import does about timelines local history
  holds (scope during the slice).

### 6. No daily ritual — not started
"15 min a day" has no scaffolding: one coach tab, plan feature flagged off,
Plan-into-Progress deferred (ux-cleanup §7). Right next feature after 1/2/5.

## Before building anything else

Watch 5–10 real plateaued-intermediate typists use it for ten minutes.
Answers 1, 2 and 3 faster than any ledger.
