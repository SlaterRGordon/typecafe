# Global language setting

**Status:** ✅ done (2026-07-07) · one ops step left: run the prod TestType seed
(`node --env-file=.env scripts/seedCompetitiveTypes.mjs`) so new languages rank in
production. · **Decided:** 2026-07-07 with the owner

Make language a global, local-first setting chosen in the nav, applied
everywhere the app generates text — not a per-mode control limited to
timed/word tests.

## Decision

Split the single conflated `language` string (`"english5k"`) into two axes:

| Axis | Lives in | Set from | Values |
|---|---|---|---|
| **Language** (global) | `useLanguage()` → `localStorage "typecafe:language"` | **nav** globe menu | english, french, german, italian, portuguese, dutch, polish |
| **Size / source** (per-test) | `wordSize` in `testSettings` | **typer bar** menu | 1k / 5k / 10k / Quotes |

They compose at generation time (`french` + `5k` → first 5000 words of the
French list). Locked-in choices:

- **Sizes are runtime slices** of the frequency-ranked lists — no new data
  files. English keeps its separate SCOWL files; other languages slice
  `words[0..N]`. Sizes offered for non-English: 1k / 5k / 10k (no 25k — subtitle
  frequency past ~10k is noisy). Derived-on-read per the locked constraints.
- **Training**: one a–z key ladder, content drawn from the active language's
  words (accented chars never appear — not in the ladder). Progress stays
  global (`TrainProgress` keys unchanged).
- **Quotes**: hidden when language ≠ english (English-only prose; no per-language
  quote corpora).
- **Nav trigger**: globe icon + language names (flag emoji don't render on
  Windows browsers), reachable from top + mobile nav.
- **Competitive**: unaffected — sizes collapse to the base language via
  `baseTypeLanguage` (generalized to strip any size suffix); base rows already
  seeded.

**Scope call:** on `/progress`, the WPM/PB trend follows the language; the coach
weak-key card stays global (consistent with "training progress global", ADR
0005). Coach-per-language is explicitly out of scope.

## Slices

- [x] 1 — Size-aware word resolution in `utils.tsx` (English → size file; others
      → slice), unit-tested. No UI change.
- [x] 2 — `useLanguage` global hook + nav globe menu (top + mobile); migration of
      the legacy `testSettings.language` base via the hook. *(Merged with slice 3 —
      coupled: nav can't own base without the typer consuming it.)*
- [x] 3 — Typer bar menu becomes size/source only (1k/5k/10k + Quotes); Quotes
      hidden when non-English; language list dropped. Base lives in `useLanguage`,
      size composes into `testSettings.language`; `baseTypeLanguage` generalized to
      strip any size suffix. Size axis kept in the composed string (no `wordSize`
      field) to keep Typer/type.get/save signatures unchanged.
- [x] 4 — Training **and Practice** use the active language: thread language into
      `generateBetterPseudoText` (shared by both). Real-word source follows the
      language; the English n-gram fallback (early key stages) stays. Progress stays
      global. Accented chars never appear (not in the a–z key ladder).
- [x] 5 — Drills use the active language: `drill.tsx` sources drill words from
      `getWords(activeLanguage)` (loaded before compiling) and passes it to the
      Typer. `drillableTransitions.ts` stays English — it only gates which pairs the
      **coach** deems trackable (transitions.ts / transitionStats.ts), which is the
      coach, kept global per the scope call. Not the refactor I first guessed.
- [~] 6 — **Skipped (decided 2026-07-07).** The profile stays a lifetime,
      all-languages identity showcase; only Progress goes per-language. Premise was
      wrong: `getBestScore`/`getProfileProof` are already cross-language, and the
      per-language `SignatureBests` component + `getSignatureBests` procedure are
      **dead code** (nothing renders them). Left in place — cleanup/wiring is a
      separate call, not this feature.
- [x] 7 — Progress rescopes to the active language, derived-on-read: `recordsForLanguage`
      filters records by base language (page-level, both signed-in and guest); the
      whole dashboard (trend/hero/records/streak/goal) follows. Coach (heatmap +
      transitions) stays **global** — passed unfiltered. Guests now store `lang` on
      each local progress entry (old entries → English). Daily rollups + imported
      guest history carry no language, so they count as English (historical default):
      the English view keeps that tail, other languages show only their raw records.
      A globe chip in the header names the active language so an empty per-language
      view doesn't read as broken.
- [x] 8 — Screenshot tour updated (bar menu → size/source capture + new nav globe
      capture); French-grams e2e proves derivation renders in-browser; per-language
      home/drill/progress e2e added across earlier slices. `baseTypeLanguage`
      (typeLanguage.test.ts) + resolver (wordSize.test.ts) unit tests already landed.
      Final gate: unit 463/463, full e2e green (2 load-sensitive perf flakes pass
      isolated).
- [x] 9 — Per-language Grams: `rankNGrams` derives bi/tri/tetragrams from the
      language word list (frequency-ranked, memoized per base via `gramsFor` —
      derived-on-read, no new files, 400 deep). English keeps its curated static
      JSON. `generateNGram` takes a language; its "words" source and char-grams both
      follow it, and useTestText passes the active base. Follows the nav language (no
      bar change). Not competitive.

## Out of scope / deferred

- 25k for non-English languages · per-language quotes · per-language coach/
  transitions · native accented-key training ladders · per-language profile
  (profile is a cross-language lifetime showcase by decision).

## Known dead code (found while building, not touched)

- `src/components/scores/SignatureBests.tsx` + `test.getSignatureBests` procedure:
  a per-language bests showcase that is never rendered. Wire up or delete as a
  separate task.
