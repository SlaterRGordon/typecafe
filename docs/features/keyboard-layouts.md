# Keyboard layouts

**Status:** 📋 planned · **Decided:** 2026-07-07 with the owner

Make keyboard layout a global, local-first setting chosen in the nav — the same
shape as [global-language.md](global-language.md). The layout changes what the
app *displays and teaches* (boards, heatmaps, the train ladder); it never
remaps input.

## Decisions (locked 2026-07-07)

1. **Display + ladder only — no emulation.** Input already reads `e.key`
   (`Text.tsx`), so a user whose OS is set to Dvorak types correctly today; the
   OS does the remapping, we render and teach in that layout. No `e.code`
   remapping toggle (breaks on non-ANSI hardware, dead keys, IMEs). Revisit
   only on real demand.
2. **Layouts v1:** qwerty (default), dvorak, colemak, colemak-dh, workman.
   National layouts (AZERTY, QWERTZ) stay deferred — they're hardware layouts
   tied to the language feature's deferred accent-position problem.
3. **Progress is per-layout, derived-on-read.** Unlike languages (fingers don't
   reset when the words turn French — ADR 0005 kept coach global), switching
   layout genuinely resets motor skill: QWERTY stats say nothing about Colemak
   fingers. Train progress, per-key accuracy, and transition stats key per
   layout; test records carry a layout tag and `/progress` filters on read.
   Untagged legacy data = qwerty. No reset button needed.
4. **Nav:** a keyboard-icon menu next to the globe, mirroring `LanguageMenu`
   (top + mobile). No consolidated settings surface until the bar actually
   overflows.
5. **Competitive: not segregated.** Layout doesn't change the words typed;
   leaderboards stay one pool. The layout tag on `Test` rows is honesty
   metadata for future filtering, not a ranking axis.

## Where QWERTY is hardcoded today

- `src/lib/heatmap.ts` — `HEATMAP_ROWS`, `SHIFT_MAP`, `foldToPhysicalKey`
- `src/components/typer/train/levels.ts` — `KEY_STAGES` (home-row-out ladder)
- `src/components/typer/Keyboard.tsx` — the read-only next-key board rows

Everything else (scoring, transitions, drills, grams, word generation) is
character-based and untouched.

## Architecture

One deep module, `src/lib/keyboardLayout.ts` — pure, React-free, unit-tested,
same shape as `heatmap.ts`. A layout is data: three letter rows (the number row
is shared) plus its shift pairs. Everything derives from it:

- rows for board rendering (Keyboard, KeyHeatmap)
- `shiftedGlyph` / `foldToPhysicalKey` per layout (heatmap.ts delegates)
- `keyStagesFor(layout)` — the train ladder's key stages

Seam: a `useLayout()` hook mirroring `useLanguage()` (localStorage
`typecafe:layout` + same-tab change event). Consumers take derived data, never
switch on the layout name. No registry abstraction — a plain record of five
layouts.

**Ladder derivation (the tricky bit):** today's `KEY_STAGES` are QWERTY
*positions* chosen pedagogically (home row → inner columns → outward). Keep
that position order as the spec and map positions through the layout to get
each layout's stages. Positions holding non-letters in a layout (Dvorak's
`' , . ;`) are skipped, and the letters those layouts displace join at the
stage where their position unlocks. Unit test: every layout introduces all 26
letters by `INTRO_LEVELS`, home row first.

**Progress keying:** qwerty rows keep their current keys/columns unchanged
(zero migration of existing data); non-qwerty gets a layout dimension —
- Server: `layout String @default("qwerty")` on `TrainProgress`,
  `PracticeStats`, `TransitionStat`, `Test`; widen the unique keys to include
  it. Migrate **both** databases (dev `.env.local` + CLI `.env`).
- Guest: layout field on `typecafe:keyStats`, `typecafe:transitionStats`
  entries and `progressHistory` records (absent = qwerty), filtered on read —
  the slice-7 `lang` pattern.

## Slices

- [x] 1 — `src/lib/keyboardLayout.ts`: five layouts as row data; derived rows +
      `keyStagesFor`. Found while building: all five layouts permute the *same*
      ANSI glyph set, so heatmap.ts's shift pairs, `shiftedGlyph`, and
      `foldToPhysicalKey` are layout-independent and stay put (unit test pins
      the glyph-set invariant); only `HEATMAP_ROWS` delegates (qwerty, zero
      behavior change). Per-char tallies therefore need no folding changes in
      slice 5 — the layout dimension is purely a storage key. Ladder invariants
      tested: qwerty stages set-match the hand-authored `KEY_STAGES`; every
      layout climbs home-row-out to exactly 26 letters. No UI.
- [ ] 2 — `useLayout()` hook + nav keyboard menu (top + mobile), mirroring
      `useLanguage`/`LanguageMenu`.
- [ ] 3 — Boards render the active layout: `Keyboard.tsx` read-only board,
      Practice board + `KeyHeatmap`, shift layer included. Practice key
      selection keeps its letter rules; the board just shows where keys live.
- [ ] 4 — Train ladder uses `keyStagesFor(layout)`; train progress keys per
      layout (server column + guest storage). Language accents still join at
      L45+ via `withLanguageAccents`.
- [ ] 5 — Coach data per layout: `PracticeStats`, `TransitionStat`,
      `typecafe:keyStats`, `typecafe:transitionStats` gain the layout
      dimension; heatmap, smart drill selection, and slow-transition coach read
      the active layout's pool. Untagged = qwerty.
- [ ] 6 — Records tagged: `Test.layout` + guest progress entries; `/progress`
      filters by active layout alongside language (globe chip pattern — name
      the layout so an empty view doesn't read as broken). Leaderboard
      unchanged.
- [ ] 7 — E2e per-layout coverage + screenshot tour (nav menu open, a
      non-qwerty board, train ladder in colemak).

## Out of scope

Input emulation (`e.code` remapping) · national layouts (AZERTY/QWERTZ) ·
ISO/ortho physical shapes (ANSI only) · per-layout leaderboards · a
consolidated settings surface.
