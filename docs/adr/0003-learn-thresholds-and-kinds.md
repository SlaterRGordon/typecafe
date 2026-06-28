# Learn thresholds are formula-derived; difficulty is a ramp multiplier; bosses are paced

Learn level thresholds are computed by one pure function —
`targetWpm(level, difficulty, star) = base(level) · diffMult[difficulty] · starMult[star]`
([learnThresholds.ts](../../src/lib/learnThresholds.ts)) — not stored per level. The
prior model authored `{wpm, accuracy}` on every `Level` (identical across all 27)
and applied a `1× / 1.15× / 1.3×` star multiplier to a flat per-difficulty base.
That model has a **fixed ceiling**: with the speed bar identical on Level 5 and
Level 95, no difficulty can serve a 30→200 WPM range without 15-WPM steps at the
bottom. The formula moves the speed axis onto the **level number** (`base(level)`
ramps L1→L100), makes **difficulty a multiplier over the whole climb** (each tier
is a gentler/steeper journey through the same 100 levels, not a higher bar on the
same content), and makes the **difficulty list extensible** — adding `insane` after
`extreme` is one array entry. The top-1% endgame (150–200 WPM) is then the back
half of the top tiers, not a hollow high bar on home-row text.

Consequences worth pinning so future reviews don't re-litigate them:

- **Difficulty is a chosen lane, not a progression axis.** A user picks one
  difficulty and climbs levels; they never traverse "easy-3★ → medium-1★" in a
  run. So the only smoothness requirement is `targetWpm` monotonic across levels
  within a lane (linear, by construction). Do not reintroduce a global
  monotonic-ordering constraint across the difficulty×star cube — the axes are
  independent and never traversed together.
- **No cross-difficulty unlock credit.** Progress is per-difficulty
  (`useLearnProgress(difficulty)`); each tier is an independent 100-level journey.
  A fast user plays only their chosen tier, so there is nothing to "replay" — do
  not add cross-difficulty crediting to `ladderState`.
- **Accuracy is not a global threshold.** Net WPM already absorbs errors. Accuracy
  re-enters only as the `noMiss` kind's own pass criterion (exact 100%), never as a
  ladder-wide gate.

Levels carry a `kind` (`keys | speed | noMiss | boss`) and are **generated from a
compact spec**, not hand-authored — grading branches in one pure
`gradeLevel(level, difficulty, result)`. `keys`/`speed`/`boss` grade on net WPM;
`noMiss` gates on 100% accuracy then grades stars by WPM.

**Paced typing is a `Typer` capability, not a `TestMode`.** A `pacerWpm` prop
renders a second cursor that advances at constant chars/sec; when it overtakes the
typist's cursor the run ends early ("overtake = death"), which fires the existing
completion with sub-target net WPM and grades to 0 stars for free. The pacer runs
at the level's 1★ target, so beating it guarantees ≥1★ and 2★/3★ come from net-WPM
margin — bosses need no special star math. Do not add a `TestModes.paced` enum
value; Learn drives the pacer through the boss level's `pacerWpm`.

This updates the threshold/grading portion of
[architecture/10-learn-ladder-progression.md](../architecture/10-learn-ladder-progression.md)
(the ladder lib still owns unlock/resume/next as before). Grams is deliberately
excluded from Learn; the standalone grams mode is untouched (see
[features/learn-ladder.md §6](../features/learn-ladder.md)).
