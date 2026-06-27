# TypeCafe

A typing **coach**, not a typing test: the product is the improvement loop — *measure → diagnose → drill → re-measure → see the delta* — built on top of the tests it collects. This glossary is the project's ubiquitous language; pick the canonical word, avoid the listed synonyms.

## Language

### The test

**Test**:
One completed typing attempt — the unit of evidence everything else is built from.
_Avoid_: run, result, attempt, session

**Mode**:
The configuration a Test runs under. The modes are Timed, Words, Practice, Grams, Relaxed, and Learn.
_Avoid_: game type, test type

**Learn**:
The self-directed mode that teaches a beginner the keyboard, feeding them into the improvement loop.
_Avoid_: course, lessons, school, curriculum

### Measurement

**WPM**:
Words-per-minute — characters typed divided by five, over elapsed time. The headline speed number.
_Avoid_: speed, pace (as a metric name)

**Accuracy**:
The share of keystrokes that were correct.

**Consistency**:
The steadiness of pace across a Test; low pace variance reads as high consistency.
_Avoid_: smoothness, evenness, stability

**Transition**:
The time taken to type one character immediately after another — an ordered key-pair *latency*. The coach's edge over single-key stats. A timing metric, not a piece of text.
_Avoid_: digraph; bigram (when you mean the timing)

**Heatmap**:
Per-key accuracy shaded across the keyboard layout, red (weak) to green (strong).

### Practice content

**Gram**:
A short, fixed character sequence used as typing *material* in Grams mode. A **bigram** is a 2-character gram, a **trigram** is 3 ("n-gram" generalizes). Distinct from a Transition, which is a timing metric, not text.
_Avoid_: chunk; using "bigram" to name the Transition metric

**Drill**:
One targeted exercise — text generated from the user's own weakness data to fix a specific key or Transition.
_Avoid_: lesson, exercise (when you mean a drill)

**Practice**:
The live mode where you run Drills against your weak keys.
_Avoid_: drill mode

**Plan**:
The 30-day program that sequences Drills and benchmarks from the user's weakness data.
_Avoid_: course, curriculum, program

**Calibration**:
The opening week of varied Tests that builds a weakness profile before a Plan can target it.

### Diagnosis

**Diagnosis**:
The post-Test analysis of a single Test — turns its keystroke timeline into a short list of Findings.
_Avoid_: analysis, report

**Finding**:
One actionable item in a Diagnosis; always names the keys to Drill so it can end in a button.
_Avoid_: insight, tip

**Stance**:
The single speed-vs-accuracy coaching sentence computed from recent history — push the pace, or slow down for accuracy.
_Avoid_: advice, coaching tip

**Weakness**:
A key or Transition worth Drilling. A **weak key** lags on accuracy; a **slow key** lags on latency — name which by the metric you mean.
_Avoid_: worst key, problem key

**Recap**:
The weekly progress-summary surface (delta, streak, the key to Drill next).
_Avoid_: report, digest, email

### Progression

**Progression**:
The umbrella story of getting measurably faster over time — the retention engine.
_Avoid_: growth, journey

**Delta**:
A single before/after change in a metric (e.g. +18 WPM in 60 days). Lead with the Delta over the absolute wherever one exists.
_Avoid_: change, difference, gain

**Trend**:
The direction of a metric over history *and* its forward projection toward a goal — a least-squares line, extrapolated.
_Avoid_: trajectory, slope

**Best**:
The user's personal record for a metric in a mode.
_Avoid_: PB, high score, record

**Streak**:
Consecutive days on which the user completed at least one Test.

**Peer percentile**:
Where a user's number sits within the distribution of all users.
_Avoid_: rank, leaderboard position

### Sharing & competition

**Challenge**:
The daily typing Test — identical for everyone, generated deterministically from the calendar date.
_Avoid_: daily, contest

**Share card**:
The image and link a user shares to brag about a Test or a Delta.
_Avoid_: brag card, score image
