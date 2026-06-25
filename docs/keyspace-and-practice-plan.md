# Keyspace & Practice plan — Phases 2 & 3 (+ surface /how-we-measure)

One physical-key model unifies both phases: **the heatmap is a real keyboard.**
Every typed char folds onto the physical key that produced it, and that same
folded keyboard is the practice surface you lock/drill on.

## Decisions (locked — from grilling 2026-06-24)

1. **Fold to physical key.** Capitals fold onto the base letter (`R`→`r`),
   shifted symbols onto their base key (`!`→`1`, `?`→`/`, `:`→`;`). One cell =
   one physical key. Shift is a motion, not a cell.
2. **Scope: numbers + common punctuation.** Render the number row + the ANSI
   punctuation cluster (`; ' , . / -`). Marks that matter in prose
   (`. , ' ? ! ; : -`) all fold onto one of those keys. No full-ANSI bracket/backtick keys.
3. **Numbers/punctuation are drillable, not just analytics.**
4. **Sprinkle at boundaries.** Locked punctuation attaches to word ends, locked
   numbers appear as standalone tokens — reuse `applyTextOptions`, no new prose model.
5. **Letters anchor, symbols add-on.** Keep the `≥6 letters incl. vowel+consonant`
   rule for word-gen; numbers/punctuation are extra locks layered on top, never
   counted toward the letter minimum. Generation can never break.
6. **Smart drill picks from all keys, letters guaranteed.** Worst 6 across
   letters+numbers+punctuation, but always keep enough letters to build a prompt.
7. **Phase 3 fully replaces the `showStats` toggle.** One always-on keyboard:
   accuracy colors + lock badge in the top-right corner. No "show stats" button.

Data is already captured: [Text.tsx:291](../src/components/typer/Text.tsx#L291)
records attempts by the actual char, and `practiceStats.character` is
`z.string().length(1)`. **Nothing changes in capture or the DB — folding happens
on read.**

---

## Phase 2 — full keyspace in measurement

### 2.1 Fold + expanded layout (display only) — ✅ done

`src/lib/heatmap.ts`:

- Replace `HEATMAP_ROWS` with the physical layout:
  ```
  numbers: "1234567890-"
  top:     "qwertyuiop"
  home:    "asdfghjkl;'"
  bottom:  "zxcvbnm,./"
  space
  ```
  `flex justify-center` already centers each row, so the ANSI shape stays
  visually balanced. ponytail: data, not new flex math.
- Add `foldToPhysicalKey(char): string | null` — `A-Z`→lowercase; a small
  `SHIFT_MAP` for `! ? : "` → `1 / ; '`; pass-through for keys in the layout;
  `null` for anything off-keyboard (tab, etc.).
- Add `foldAttempts(source): Map<string, KeyAttempt>` — fold every entry of a
  Map/record onto its physical key and sum. This is the one read-time primitive
  the heatmap, smart drill, and selection all share.
- `attemptsFromEvents` already folds `A-Z`; extend it to call
  `foldToPhysicalKey` so single-test score-card heatmaps match.

`src/components/heatmap/KeyHeatmap.tsx`: renders straight off the new
`HEATMAP_ROWS`, so the number row + punctuation appear once the layout grows.
No prop changes. Update `KeyHeatmapLegend` only if spacing needs it.

`src/components/typer/Keyboard.tsx`: `buildStatsAttempts` and the smart-drill
combine loop currently iterate `ALPHABET (+ " ")` — swap both to
`foldAttempts(merge(base, session))` so capitals/numbers/punctuation flow in.

Tests: `heatmap.test.ts` — fold table (`R→r`, `!→1`, `?→/`, `:→;`, off-keyboard→null),
`foldAttempts` summing `r`+`R`. Pure functions, cheap.

Files: `lib/heatmap.ts`, `lib/heatmap.test.ts`, `components/typer/Keyboard.tsx`.

### 2.2 Drillable numbers & punctuation — ✅ done

`src/components/typer/utils.tsx` — extend `applyTextOptions` (or a thin practice
wrapper) to accept optional `marks: string[]` and `digits: string[]`:

- When `marks` given, restrict the sprinkled punctuation to exactly those marks
  (keep the existing sentence-ender/mid weighting within the locked set).
- When `digits` given, inject standalone number tokens built from the locked
  digits between words (e.g. `"57"`, `"3"`), at roughly the mid-punctuation rate.
- Practice generation calls this after building the letter-word string, instead
  of the unconditional `.toLowerCase()` strip.

Selection (`Keyboard.tsx` `handleKeyClicked`): the `≥6 / vowel / consonant`
guards apply to **letters only**. Numbers/punctuation are free to lock/unlock as
add-ons — they don't count toward the 6, can't drop the letter set below floor.

Smart drill (`handleSmartDrill`): feed `foldAttempts(...)` (all keys) to
`worstKeysFromAttempts(combined, 6, 5)`. Partition the result — letters fill the
selectable set (padded from `asdfghjkleiou` as today to guarantee word-gen),
worst numbers/punctuation become the locked `marks`/`digits` that get sprinkled.

Capitals: counted in the heatmap via fold; the shift motion stays exercised by
the existing capitals toggle. ponytail: no separate capital drill — folding
already credits `R` to `r`, add when a real "shift weakness" signal exists.

Tests: `utils.test.ts` — sprinkle uses only locked marks; digit tokens appear;
still terminates. `stats`/Keyboard smart-drill partition keeps ≥ letters.

Files: `components/typer/utils.tsx`, `utils.test.ts`,
`components/typer/Keyboard.tsx`.

### 2.3 Full physical layout — display-only filler keys (lands with Phase 3)

The heatmap/keyboard should *look* like the user's real board, not just the keys
we can measure. Extend `HEATMAP_ROWS` to the full ANSI shape, adding the keys we
don't generate text for as **display-only** cells:

```
numbers: "1234567890-="
top:     "qwertyuiop[]\\"
home:    "asdfghjkl;'"
bottom:  "zxcvbnm,./"
space
```

- These extra keys (`= [ ] \`, and their shifted twins `+ { } |`) fold like any
  other: extend `SHIFT_MAP` so `+→=`, `{→[`, `}→]`, `|→\`. They get a real cell,
  so if a user ever *does* hit them (capture already records every char) the
  accuracy shows; until then they read as neutral "no data", exactly like an
  untyped letter.
- **Never drilled, never auto-selected.** They're not in `DRILL_MARKS` and aren't
  letters/digits, so `isDrillable` already excludes them — smart drill and the
  sprinkler ignore them for free. Purely visual fidelity + honest capture.
- Purpose: a balanced, real-keyboard silhouette so the merged Practice keyboard
  (Phase 3) reads as "your layout", and the right-hand cluster stops looking
  truncated. ponytail: filler cells are data in `HEATMAP_ROWS` + a few `SHIFT_MAP`
  lines — no new component logic.
- Centering: rows now differ in length (13 / 13 / 11 / 10). `flex justify-center`
  still centers each, giving the natural ANSI stagger; check the mini score-card
  size doesn't overflow its column and shrink `kbd` if needed.

Deferred to land *with* Phase 3 so the layout grows once, at the same time the
two keyboards merge (avoids re-screenshotting the heatmap twice).

Files: `lib/heatmap.ts` (+ test for the new folds), `KeyHeatmap.tsx` if the
mini size needs tightening.

---

## Phase 3 — merge the practice keyboards + smart-drill standout

Today Practice has two keyboards toggled by `showStats`: the interactive lock
keyboard and the read-only `KeyHeatmap`. Merge into one.

- **Make `KeyHeatmap` interactive** (additive props, defaulted off so score-card
  uses are untouched): `lockedKeys?: Set<string>`, `onKeyClick?(key)`,
  `currentKey?` (reuse the existing `highlightKeys` ring). Render a lock badge in
  the **top-right** corner of locked keys — clear of the existing label
  (top-left) and percentage (bottom-right), so no layout fight.
- **`Keyboard.tsx` practice branch**: delete the `showStats` state, the toggle
  button, and the entire hand-rolled three-row lock keyboard. Render one
  `<KeyHeatmap size="full" lockedKeys={…} onKeyClick={handleKeyClicked}
  currentKey={currentKey} highlightKeys={highlightKeys} />`. Accuracy is always
  visible — no click to "find analytics."
- Only letters are clickable-to-lock; number/punctuation cells are colored +
  badge-able but the click guard ignores non-letters (consistent with 2.2's
  letters-anchor rule). They're locked via smart drill / a small add-on control,
  TBD-cheap.
- **Smart-drill standout**: promote the button from `btn-ghost` to
  `btn-primary` (or accent) with the drill icon, so it reads as the primary
  action on the practice keyboard. One className change.

The live during-typing keyboard elsewhere is out of scope — Phase 3 is the
practice analytics surface only.

Files: `components/heatmap/KeyHeatmap.tsx`, `components/typer/Keyboard.tsx`.

---

## Surface /how-we-measure (carried from auth plan §3) — ✅ done

Today only reachable from the score-card "Raw WPM" link. Make it a normal
destination:

- Add **"How we measure"** (ruler/info icon) to the legal/util group at the
  bottom of [SideNavigation.tsx:66](../src/components/navigation/SideNavigation.tsx#L66)
  and `BottomNavigation.tsx`, beside Privacy/Terms.
- Quiet link from the progress dashboard ("How these numbers work →") near the
  hero/footer for in-context discovery.
- Add a short **"Per-key heatmap"** note to `how-we-measure.tsx`: shifted chars
  and capitals fold onto their physical key (the `r` cell counts `r`+`R`), so the
  keyboard reads as one physical key per cell. Keeps the page honest after Phase 2.
- Screenshot tour already visits the page
  ([screenshots.spec.ts:591](../tests/e2e/screenshots.spec.ts#L591)) — add a
  nav-click assertion in routes/auth e2e instead of a direct goto.

Files: `SideNavigation.tsx`, `BottomNavigation.tsx`, `pages/progress.tsx`,
`pages/how-we-measure.tsx`.

---

## Build order (each commit: suite green + screenshot tour updated)

1. **Surface /how-we-measure** — tiny, no deps, no risk. Ship first.
2. **Phase 2.1 fold + layout** — pure `heatmap.ts` change + read-time swap;
   data already exists, so heatmap fills with numbers/punctuation immediately.
3. **Phase 2.2 drillable** — generation + selection + smart-drill partition.
4. **Phase 3 merge + standout** — collapse the two keyboards onto the now-complete
   `KeyHeatmap`, delete the toggle, promote the drill button.

Scoring/fold/sprinkle math stays pure in `src/lib` with unit tests; components
only render and wire.
