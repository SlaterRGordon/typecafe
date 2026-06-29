# Learn ladder v2 — 100 levels, ramp-multiplier difficulty, paced bosses

**Status:** planned · **Grilled:** 2026-06-28 · **ADR:** [0003](../adr/0003-learn-thresholds-and-kinds.md)

Vision tie-in: Learn is the beginner→intermediate on-ramp that feeds the
plateaued-intermediate pipeline ([vision.md](../vision.md)). This rework makes the
climb legible and long enough to carry a user from home-row (≈22 WPM) to the
top-1% endgame (150–200 WPM), with deltas (stars, the pacer you outrun) at every
step.

This supersedes the flat-authored 27-level ladder (`Level 1–27`, identical
`easy 40 / medium 80 / hard 120 / acc 90` on every level). The app is pre-launch;
existing progress is scrapped per the **break-anything** constraint — no migration.

---

## 1. Thresholds are a formula, not data

One pure function in `src/lib/`:

```
targetWpm(level, difficulty, star) = round( base(level) · diffMult[difficulty] · starMult[star] )
```

- `base(level)` — the easy-1★ spine, linear across L1–L100: `22 + (level − 1) · 0.48`
- `diffMult` — an **extensible list** (append a tier, don't restructure):
  `{ easy 1.0, medium 1.3, hard 1.65, extreme 2.05, insane 2.6 }`
- `starMult` — per-level headroom: `{ 1★ 1.0, 2★ 1.12, 3★ 1.25 }`
- **Accuracy is not in the threshold.** Net WPM already absorbs errors; a separate
  accuracy gate was dead code. `noMiss` levels reintroduce accuracy as their *own*
  pass criterion (§4), not as a global gate.

### Sanity table (tunable; pinned by a unit test)

| difficulty | L1 1★ | L100 1★ | L100 3★ |
|---|---|---|---|
| easy ×1.0 | 22 | 70 | 87 |
| medium ×1.3 | 29 | 91 | 113 |
| hard ×1.65 | 36 | 115 | 143 |
| extreme ×2.05 | 45 | 143 | 178 |
| insane ×2.6 | 57 | 181 | 226 |

A user **picks one difficulty and climbs levels** — they never traverse
"easy-3★ → medium-1★" in a single run. The smoothness that matters is `targetWpm`
across levels in one lane, which is linear by construction. (The old "gap between
difficulty-3★ and the next difficulty-1★" was an artifact of the old model where
difficulty *was* the progression axis; it cannot recur here.)

---

## 2. Levels are generated from a spec

`Level` shrinks to `{ name, keys, count, kind, subMode }` — no per-level
thresholds. The 100-level array is **built once at module load** from a compact
spec, not hand-authored:

- **key-introduction curve** — ordered stages (home row → top row → bottom row →
  caps → punctuation → numbers), each spanning a span of levels;
- **count curve** — words per level (ramps; bosses longer or timed);
- **kind rhythm per block of 10** — boss on the 10th, a fixed sprinkle of `speed`
  and `noMiss` among the other 9, rest `keys`. Example block:
  `[keys, keys, keys, speed, keys, keys, noMiss, keys, keys, boss]`.

The exported shape stays `Level[]` with a `kind`, so `learnProgression.ts` and
`learn.tsx` don't care it was generated. Tuning the climb = editing the spec.

---

## 3. Progression

- **Unlock gate** (unchanged logic, new number source): level N+1 opens once level
  N's best net WPM ≥ `targetWpm(N, difficulty, 1)` — i.e. 1★ clears the gate.
- **Per difficulty, independent.** Each difficulty is its own 100-level journey;
  progress is already stored per-difficulty (`useLearnProgress(difficulty)`). **No
  cross-difficulty unlock credit** — a fast user picks `extreme` and plays only
  `extreme`; there is nothing to "replay," so cross-credit buys nothing worth
  threading through `ladderState`.

---

## 4. Per-kind grading

One pure `gradeLevel(level, difficulty, result)` branches on `level.kind`. It
replaces today's single net-WPM `gradeResult`.

| kind | Typer config | pass / stars |
|---|---|---|
| `keys` | normal · words · `pseudoText(keys)` | net WPM → stars |
| `speed` | normal · **timed** (`count` = seconds) | net WPM → stars *(identical grade, timed window)* |
| `noMiss` | normal · words · `pseudoText(keys)` | **100% accuracy or 0★**; stars by WPM; **dies on first miss** |
| `boss` | normal · words · `pseudoText(keys)` + `pacerWpm` | net WPM → stars; **overtake = death** (§5) |

`keys` / `speed` / `boss` all reuse the net-WPM `starsFor`. `noMiss` gates on
exact 100% accuracy (one miss → 0★), then grades stars by WPM on the same ladder
(a clean run has net = raw, so the WPM thresholds apply unchanged).

---

## 5. Paced cursor (the meaty build)

A `pacerWpm?: number` prop on `Typer`. When set, a second marker renders on span
`#c{pacerPos}` where:

```
pacerPos = floor(elapsedSec · pacerWpm · 5 / 60)
```

(one cursor advancing at constant chars/sec; `font-mono` makes char-index ↔
position linear). Updated on the existing live-stats tick — one moving CSS marker,
cheap.

**Overtake = death.** When `pacerPos ≥ yourPos`, the run ends immediately: it fires
the existing completion early with sub-target net WPM, so the current grader
returns **0 stars → "try again"** for free. Reaching the end first → you win.

**Stars from margin.** The pacer runs at the **1★ target**
(`targetWpm(level, difficulty, 1)`), so beating it guarantees ≥1★ and 2★/3★ fall
out of your actual net WPM through the same `starMult` thresholds — bosses need no
special star math. The only boss-specific code is the overtake check + early-fail
trigger, which `noMiss`'s first-miss death reuses.

Paced is a Typer capability, **not a new `TestMode`** — Learn drives it via the
boss level's `pacerWpm`.

---

## 6. Out of scope

- **Grams is out of Learn entirely** — no `grams` kind. The grams pipeline draws
  from a global frequency-ordered bigram list (not key-scoped) and runs a separate
  open-ended progression that never reports to the Learn grade flow; bending it in
  was disproportionate. The standalone grams *mode* is untouched (its removal, if
  ever, is its own decision + a vision.md edit).
- **No migration.** Pre-launch break-anything; `Level 1–27` progress is reset.

---

## 7. Build slices (each suite-green, own commit)

- [x] 1. `feat(learn): formula-derived thresholds` — new `learnThresholds.ts` +
   tests; fold in `learnStars`; rewire `learnProgression`; `DifficultyName` → 5
   tiers; dropdown → 5. *(Levels still 27, all implicitly `keys`.)*
- [x] 2. `feat(learn): generate the 100-level ladder from a spec` —
   `buildLevels()`; `Level` gains `kind`/`subMode`, drops difficulties +
   description; boss/speed/noMiss slots marked (still behave as `keys`). e2e +
   screenshots.
- [x] 3. `feat(typer): paced cursor with overtake-death` — `pacerWpm` prop, a
   smooth rAF-animated vertical line, overtake early-fail; boss levels wired @1★.
   An overtake forces a fail regardless of the net WPM the typed span banked
   (`pacerCaught` flag — no fast-burst-then-stall loophole). When the typist
   races ahead and the line scrolls off the top, an up-caret rides the top edge
   at the pacer's horizontal column so its position stays legible (option B).
   e2e covers overtake-death, outrun-to-clear, and the loophole.
- [ ] 4. `feat(learn): speed-round levels` — timed submode driven by
   `level.subMode`; grade reuse.
- [ ] 5. `feat(learn): no-miss levels` — 100% gate + first-miss death + WPM
   stars; `gradeLevel` branch; modal copy.
- [ ] 6. Tune curves/numbers; full screenshot tour; finalize ADR-0003.

Every UI-touching slice updates `tests/e2e/` and the screenshot tour
(`tests/e2e/screenshots.spec.ts`) in the same commit, per the standing rules.

---

## 8. Files touched

- **new** `src/lib/learnThresholds.ts` — `targetWpm`, `starsForWpm`, `starThresholds`, `DIFFICULTIES`, multipliers (+ test)
- **removed** `src/lib/learnStars.ts` — folded into `learnThresholds`; the `1.15×/1.3×` multiplier is gone
- `src/lib/learnProgression.ts` — `ladderState`/`gradeResult` key off `targetWpm`; adds `levelNumber`; later `gradeLevel` per kind; 5 tiers; 100 levels
- `src/server/api/routers/learnProgress.ts` — difficulty enum derives from `DIFFICULTIES`
- `src/components/typer/learn/levels.ts` — `Level` reshaped; `buildLevels(spec)` generator
- `src/components/typer/Typer.tsx` — `pacerWpm`, overtake-death, first-miss death, `subMode` from level
- `src/components/typer/Text.tsx` — pacer marker; first-miss signal
- `src/pages/learn.tsx` — 5 difficulties; kind-driven config; per-kind modal copy
- `tests/e2e/*`, `tests/e2e/screenshots.spec.ts` — coverage for new kinds + paced boss
