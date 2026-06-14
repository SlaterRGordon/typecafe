# Phase 1 — Close the Loop

**Goal:** a new user finishes one test and is two clicks from drilling their personal weakest keys.

The sentence we ship: *"You lost ~8 WPM to `r`, `t`, and `b` → **[Drill these keys]**."*

This phase now stays focused on the improvement loop. The main-page/typer visual overhaul moved to [Phase 2](phase-2-ui-overhaul.md) so the loop can ship cleanly before the larger UI rebuild.

---

## 1.1 Keystroke timeline persistence (M) — the foundation

Everything downstream (diagnosis here, trends in Phase 3, transitions in Phase 4) reads from this.

**Schema** (`prisma/schema.prisma`):

```prisma
model Test {
  // existing fields...
  timeline   Json?   // compact: [[charCode, correct(0|1), dtMs], ...] deltas, not absolutes
}

model KeyStat {        // rolling aggregates, live forever
  id        String @id @default(cuid())
  userId    String
  key       String     // single char
  attempts  Int
  correct   Int
  totalMs   BigInt     // sum of inter-key latency when this key was typed
  updatedAt DateTime @updatedAt
  @@unique([userId, key])
}
```

- **Compactness:** a 60s test ≈ 350 keystrokes ≈ 4–7 KB as delta-encoded arrays. Free-tier Postgres (~0.5 GB) holds ~70k raw tests.
- **Pruning without cron:** on each test save, opportunistically delete the user's raw timelines beyond their most recent **200** tests (aggregates are forever). Free-tier rule: derived-on-write, no scheduled jobs.
- **Local-first mirror:** guests accumulate the same aggregates in localStorage (`typecafe:keyStats`, plus a capped ring buffer of recent timelines). On signup, batch-import — generalize the existing `learnProgress.batchImport` pattern into `src/lib/localSync.ts`. The merge is additive (sums), so it's idempotent and conflict-free.
- `PracticeStats` (existing per-char model) merges into `KeyStat` — one aggregate store, all modes feed it. **Repeat-everywhere rule established here:** every mode (timed, words, grams, practice, learn, relaxed) records attempts into the same aggregates.

## 1.2 Post-test diagnosis on the score card (M)

New pure module `src/lib/diagnosis.ts` (unit-tested, heuristics only):

- **Slowest keys:** mean inter-key latency per key this test vs the user's overall mean; report the top 3 ≥ 1.5× mean with ≥ 3 samples
- **Least accurate keys:** lowest accuracy this test, min 3 attempts
- **Costliest transitions:** slowest bigram transitions (timeline pairs), min 2 occurrences — *seeded here, expanded in Phase 4*
- **WPM cost estimate:** "you lost ~N wpm" = recompute WPM with the slow keys' latencies clamped to the user's mean. Honest math, documented on `/how-we-measure`

**Score card additions** (`ShareableScoreCard.tsx`): a Diagnosis panel alongside Performance Details — three findings max, each a sentence, each ending in a button: **[Drill these keys]** → `/?mode=practice&keys=r,t,b` (practice mode pre-selected via query params — new, small). A mini per-key heatmap row renders below the typed-text replay (reuse the Practice analytics color interpolation, extracted to `src/lib/heatmap.ts`).

**Empty-data honesty:** under ~30 keystrokes, the panel says "Too short to diagnose — try a 30s+ test", never garbage findings.

## 1.3 Re-measure prompt (S)

After any practice/grams session that followed a diagnosis (sessionStorage flag), the completion screen offers: **"Re-run your 30s test to see the delta"** → same config as the diagnosed test; result shows *before → after* WPM side by side. This is the loop's last mile; without it the drill never gets credited.

## 1.4 Main Page and Grams Redesign — skipped from Phase 1

The earlier Phase 1.4 mode-bar pass is superseded. The owner now wants a fuller mockup-driven typer UI overhaul:

- Timed and Words split into separate top-level modes
- Length, custom length, language, settings, restart, and fullscreen live in the typer toolbar
- WPM/accuracy and the typing text get the new visual treatment from the vision screenshots
- Settings becomes a dropdown, not a modal front door
- Grams settings become a subpanel like `docs/screenshots/vision-screenshots/vision-grams.png`

That work belongs to [Phase 2 - Typer UI Overhaul](phase-2-ui-overhaul.md), not this phase.

## 1.5 Heatmap as a primitive (S)

Extract the Practice keyboard's accuracy rendering into a reusable `<KeyHeatmap>` (`src/components/heatmap/`): sizes `mini` (score-card row) and `full` (Practice, later `/progress`), data-source agnostic (this-test vs lifetime aggregates). Phase 3 reuses it on profile without rework.

## Acceptance

- [x] Finish a 30s test → see ≥ 1 honest finding → click → practice opens with those keys selected → finish drill → re-measure prompt → delta shown — `src/lib/diagnosis.ts` → `DiagnosisPanel`/`ReMeasureStrip` on `ShareableScoreCard`; drill handoff + re-measure offer + before→after delta wired in `index.tsx` (`typecafe:reMeasure`). Guest path covered by `home.spec.ts` ("diagnosis panel offers a one-click drill", "re-measure loop shows a before to after delta") and screenshots 35–38.
- [x] Heatmap primitive exists where Phase 1 diagnosis needs it, without coupling future `/progress` UI to Practice internals — pure `src/lib/heatmap.ts` (accuracy→color + per-key cells, unit-tested) plus a reusable `<KeyHeatmap size="mini"|"full">` (`src/components/heatmap/`), data-source agnostic (live refs, decoded timeline, or aggregates). Practice's analytics keyboard now renders through it (no duplicated color math); the score-card diagnosis panel shows the `mini` this-test heatmap with the drilled keys ringed.
- [x] Guest does all of the above with zero account; signs up; aggregates survive — guest diagnosis + drill + re-measure are covered in `home.spec.ts`; guest Practice aggregates now mirror to `typecafe:keyStats`, import through `practiceStats.batchSync` when a session appears, then clear the local copy after successful import (`localSync.ts`, e2e regression "guest practice aggregates import after sign in").
- [x] Screenshot tour updated: diagnosis panel, drill handoff, re-measure delta, and any Phase 1 heatmap states — diagnosis (`35`), drill handoff (`36`), re-measure (`37`–`38`), the score-card mini heatmap (asserted in `35` + `home.spec.ts`), and the Practice full heatmap (`32`).

**Owner's part:** taste pass on diagnosis copy; final UI taste pass moves to Phase 2.
