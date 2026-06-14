# Phase 1 — Close the Loop

**Goal:** a new user finishes one test and is two clicks from drilling their personal weakest keys.

The sentence we ship: *"You lost ~8 WPM to `r`, `t`, and `b` → **[Drill these keys]**."*

This phase includes the two sanctioned overhauls: the main page and grams mode. Pre-launch — break anything.

---

## 1.1 Keystroke timeline persistence (M) — the foundation

Everything downstream (diagnosis here, trends in Phase 2, transitions in Phase 3) reads from this.

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
- `PracticeStats` (existing per-char model) merges into `KeyStat` — one aggregate store, all modes feed it. **Repeat-everywhere rule established here:** every mode (normal, words, grams, practice, learn, relaxed) records attempts into the same aggregates.

## 1.2 Post-test diagnosis on the score card (M)

New pure module `src/lib/diagnosis.ts` (unit-tested, heuristics only):

- **Slowest keys:** mean inter-key latency per key this test vs the user's overall mean; report the top 3 ≥ 1.5× mean with ≥ 3 samples
- **Least accurate keys:** lowest accuracy this test, min 3 attempts
- **Costliest transitions:** slowest bigram transitions (timeline pairs), min 2 occurrences — *seeded here, expanded in Phase 3*
- **WPM cost estimate:** "you lost ~N wpm" = recompute WPM with the slow keys' latencies clamped to the user's mean. Honest math, documented on `/how-we-measure`

**Score card additions** (`ShareableScoreCard.tsx`): a Diagnosis panel alongside Performance Details — three findings max, each a sentence, each ending in a button: **[Drill these keys]** → `/?mode=practice&keys=r,t,b` (practice mode pre-selected via query params — new, small). A mini per-key heatmap row renders below the typed-text replay (reuse the Practice analytics color interpolation, extracted to `src/lib/heatmap.ts`).

**Empty-data honesty:** under ~30 keystrokes, the panel says "Too short to diagnose — try a 30s+ test", never garbage findings.

## 1.3 Re-measure prompt (S)

After any practice/grams session that followed a diagnosis (sessionStorage flag), the completion screen offers: **"Re-run your 30s test to see the delta"** → same config as the diagnosed test; result shows *before → after* WPM side by side. This is the loop's last mile; without it the drill never gets credited.

## 1.4 Main page overhaul (L) — sanctioned redesign ✅ shipped 2026-06-13

The gear-modal-as-front-door dies for the headline differentiator: **mode switching is visible inline above the typer.** Everything else stays in the settings modal — the owner's call, to keep the screen quiet (vision #6). The mode bar alone makes TypeCafe legible as a coach (Practice/Grams) in the 10-second test (vision #5); length/punctuation aren't differentiators (Monkeytype has them too), so they don't need to be on the surface.

```
        [ Normal | Practice | Grams | Relaxed ]    ← inline mode bar, always visible
                    the typing area
        ⚙ → modal: language, type, length, text, grams, live stats, keyboard
```

- `ModeBar` (`src/components/typer/config/ModeBar.tsx`) renders above the typer; the `Config` modal lost its Mode row but keeps everything else. `useTestSettings` is unchanged — presentation only.
- **Considered and rejected:** a full inline context row (length/text/language). Three candidate layouts were built and screenshotted; the owner found them too noisy and chose mode-only. The idle-countdown shrink and an anchored practice toolbar were part of that package and were dropped with it (the standard idle countdown is now the only on-screen duration cue, so it stays at full size).
- Practice / Grams / Relaxed stay self-contained below the bar (the practice keyboard with Smart drill + analytics; the grams progression — rebuilt in 1.5).

## 1.5 Grams mode presentation rebuild (M) — sanctioned redesign

Today: a lone two-letter string at the far-left edge and a cryptic "1/50". Rebuild:

- Current gram rendered large, centered; remaining text in normal flow
- Level progress bar (`level 3 / 50`, named scope) with per-level best WPM
- Advancement moment: brief celebration state + "next: `th`" (no confetti spam — one clean beat)
- WPM suppressed for micro-samples (Phase 0 rule) — show *level avg* once meaningful
- "1/50" becomes self-explanatory UI, not notation

## 1.6 Heatmap as a primitive (S)

Extract the Practice keyboard's accuracy rendering into a reusable `<KeyHeatmap>` (`src/components/heatmap/`): sizes `mini` (score-card row) and `full` (Practice, later `/progress`), data-source agnostic (this-test vs lifetime aggregates). Phase 2 reuses it on profile without rework.

## Acceptance

- [x] Finish a 30s test → see ≥ 1 honest finding → click → practice opens with those keys selected → finish drill → re-measure prompt → delta shown — `src/lib/diagnosis.ts` → `DiagnosisPanel`/`ReMeasureStrip` on `ShareableScoreCard`; drill handoff + re-measure offer + before→after delta wired in `index.tsx` (`typecafe:reMeasure`). Guest path covered by `home.spec.ts` ("diagnosis panel offers a one-click drill", "re-measure loop shows a before to after delta") and screenshots 35–38.
- [x] All four modes switchable without opening any modal (inline `ModeBar`; lengths/options live in the modal by design — owner's call 2026-06-13)
- [ ] Grams mode is self-explanatory to someone who's never seen it (owner tests on one person)
- [ ] Guest does all of the above with zero account; signs up; aggregates survive
- [ ] Screenshot tour updated: new main page (all modes), diagnosis panel, drill handoff, re-measure delta, rebuilt grams (idle/mid/advance)

**Owner's part:** pick the main-page candidate, the one-person grams usability test, taste pass on diagnosis copy.
