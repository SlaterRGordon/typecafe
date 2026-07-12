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

- [x] 10 — **Accents coherence (decided 2026-07-07).** Accented letters are part
      of a language, not noise to strip; every mode that types *words* now keeps
      them. Tests and Grams already did; drills stopped dropping accented words
      (`normalizeWord` → any-letter); Train's full-alphabet stretch (L45+) extends
      the key set with the language's accent letters, derived on read from its word
      list (`accentChars`/`accentsFor`, memoized per base) via
      `withLanguageAccents` — intro stages stay pure a–z (key positions are
      layout-dependent), and progress/thresholds are untouched (keyed by level
      name). Practice stays a–z: its whole UI is the QWERTY key board.

- [x] 11 — **Language-shaped Practice fallbacks (2026-07-12).** Restricted-key
      text now guarantees every active letter appears instead of treating any
      non-empty real-word pool as sufficient. `src/lib/phonology/` is the deep
      module behind the fallback seam: per-language profiles convert graphemes
      into phoneme segments; the engine derives legal onsets and final codas from
      the active corpus, syllabifies with maximal onset, and composes only
      phonologically licensed syllables. `restrictedText.ts` prefers real carrier
      words and uses an explicit key token only when the selected alphabet has no
      pronounceable path. English, French, Spanish, German, Italian, Portuguese,
      Dutch, and Polish are covered; Chinese and Hindi remain excluded pending a
      script-specific design. Corpus models and per-alphabet pools are lazy and
      memoized so prompt extension does not rebuild them.

## Out of scope / deferred

- 25k for non-English languages · per-language quotes · per-language coach/
  transitions · per-language profile (profile is a cross-language lifetime
  showcase by decision). Per-national-layout keyboards (where é/ü/ł physically
  live) are **no longer deferred** — planned in
  [keyboard-layouts.md](keyboard-layouts.md).

### Deferred: token-weighted per-language grams (decided 2026-07-07)

Non-English Grams derive from the word list at runtime (`rankNGrams` via
`gramsFor`), which weights by word *type* (each word counts once). English's
static gram files are ranked by real corpus *token* frequency (`th he in er…`),
which is better signal — grams from very common short words (`de`, `le`, `że`)
should rank higher than type-counting gives them.

**The upgrade, when wanted:** the pipeline already has the data. `buildLanguages.mjs`
fetches Hermit Dave FrequencyWords lines as `word count` pairs and discards the
count (`line.split(" ")[0]`). Keep the counts, weight each word's grams by its
count, and emit per-language gram JSONs (top ~200 bi/tri/tetra, a few KB each)
**in the same script run** that builds the word lists — same-run generation kills
the drift risk of a separate gram pipeline. `gramsFor` then drops its derivation
branch and every language is corpus-ranked JSON, like English.

**Why not yet:** the current derivation is type-weighted over an already
frequency-ranked top-10k — a reasonable proxy — and no one has reported the gram
ladder feeling unrepresentative. Do it on that signal (a non-English user
complaint, or noticing it firsthand), not speculatively. ~1 hour with data
already fetched.

### Deferred: per-language train threshold calibration (noted 2026-07-07)

Train thresholds are a pure function of level × difficulty
(`trainThresholds.ts`), identical across languages — but languages aren't
equally fast to type. Below L45 the effect is noise (intro levels filter to
a–z words everywhere). At L45+ the language's accent letters join the key set
(`withLanguageAccents`), and on the keyboards most users have, é/ü/ł go through
dead keys or AltGr chords several times slower than a plain keystroke — so top
levels are mechanically harder in accented languages, right where thresholds
are least forgiving (maybe 5–15% at the top given typical accent density, not
2×). Global progress is the escape valve: anyone walled can pass the level in
English.

**The knob, when wanted:** a per-language multiplier alongside `DIFF_MULT`
(english 1.0, others slightly under), applied in `targetWpm`. One record, no
structural change. **Why not yet:** zero data for the constants — guessing
them invents numbers and silently changes what stored `TrainProgress` stars
mean. Trigger: a non-English user reporting the L45+ wall, or pass-rate data
diverging by language.

## Known dead code (found while building, not touched)

- `src/components/scores/SignatureBests.tsx` + `test.getSignatureBests` procedure:
  a per-language bests showcase that is never rendered. Wire up or delete as a
  separate task.
