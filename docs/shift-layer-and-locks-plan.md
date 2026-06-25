# Shift-layer heatmap & per-glyph locks — fixing punctuation drilling

Follow-up to [keyspace-and-practice-plan.md](keyspace-and-practice-plan.md). That
plan folded every glyph onto one physical cell (`R→r`, `?→/`, `!→1`). The fold
made the heatmap read as a real keyboard but **broke punctuation locking** and
hid capital/symbol weakness. This plan keeps the one-keyboard layout and adds a
**shift layer** so each cell carries two glyphs, drilled and measured separately.

## Root cause (why locks leak today)

Two collisions between the fold and the drill system:

1. **Toggle bypasses locks.** [`applyTextOptions`](../src/components/typer/utils.tsx#L261)
   falls back to the full natural punctuation pool whenever the global
   `punctuation` toggle is on and no marks are selected. "Lock all punctuation" +
   toggle on → every mark reappears.
2. **Lock identity ≠ drill identity.** `selectedKeys` only ever holds *physical*
   keys (folded), but the sprinkler drills *actual marks* `DRILL_MARKS =
   . ? ! , ; : -`. The shifted marks `? ! :` live on shifted keys, so they can
   **never** be selected or drilled; the `/` cell maps to no drill mark. The most
   useful enders (`?` `!`) are unreachable.

The data was never the problem: capture ([Text.tsx:291](../src/components/typer/Text.tsx#L291)),
the timeline ([keystrokes.ts](../src/lib/keystrokes.ts), raw `charCode`), and the
lifetime aggregate (`practiceStats.character`, `length(1)`) all store the **actual
character**. `/progress` weak keys already read raw chars unfolded
([progress.tsx:225](../src/pages/progress.tsx#L225)). Only the heatmap *display*
and the *lock UI* collapse glyphs. This plan separates them on read; capture/DB
unchanged.

## Decisions (locked — grilling 2026-06-24)

1. **Per-glyph locks via a shift layer.** `selectedKeys` becomes actual glyphs.
   Base layer locks/drills `r ; / 1 . , -`; shift layer locks/drills `? ! :` (and
   shows capitals). Aligns lock identity with the sprinkler → fixes Bug 2.
2. **Shift view = hold *and* toggle.** Hold Shift to peek the shifted glyph on
   every cell; a sticky `⇧` toggle on the keyboard for touch / lingering. Two
   views of one layout — base glyph or shifted glyph, each showing **that glyph's
   own raw accuracy** (no folding in the Practice keyboard).
3. **Locks are authoritative in Practice.** Practice ignores the global
   punctuation/capitals toggles; locked marks/digits + a single `Capitalize`
   add-on are the only source of punctuation/caps. "Lock all marks" = zero
   punctuation → fixes Bug 1.
4. **Capitals: display + diagnosis only.** Shift layer shows per-capital accuracy
   and "slow on R" can be a finding, but the only capital *drill* lock is one
   `Capitalize` add-on (today's caps sprinkle). Letter cells are **not clickable**
   in the shift layer. ponytail: no per-letter capital seeding in word-gen until a
   real signal demands it.
5. **Surface symbol/capital latency.** Weak-key + slow-transition surfaces stop
   stripping non-letters so `:` `'` `?` and capitals can be diagnosed and drilled.

Glyph drillability (already encoded in `isDrillMark`/`isDrillDigit`, no change):

| Cell | base glyph | shift glyph | base drill? | shift drill? |
|------|-----------|-------------|-------------|--------------|
| `1`  | `1` digit | `!` ender   | ✅ digit    | ✅ mark |
| `;`  | `;` mid   | `:` mid     | ✅ mark     | ✅ mark |
| `/`  | `/`       | `?` ender   | display-only| ✅ mark |
| `'`  | `'`       | `"`         | display-only| display-only |
| `,` `.` `-` | mark | `< > _`   | ✅ mark     | display-only |
| `a`–`z` | letter | `A`–`Z`     | ✅ letter   | display-only (caps) |

---

## Phase A — shift-layer display (read-only, ship first)

Lowest risk: pure render, no generation change. Proves the layer before locks ride on it.

`src/lib/heatmap.ts`:
- Add `SHIFT_GLYPH: Record<string,string>` (base→shifted: reverse of `SHIFT_MAP`
  plus `a-z`→uppercase). `shiftedGlyph(key)` returns the shifted glyph or the key
  itself when none.
- **Stop folding for the Practice keyboard.** `KeyHeatmap` gains
  `shiftLayer?: boolean`. When set, the cell key = `shiftedGlyph(rowKey)` and the
  accuracy looks up the **raw** (unfolded) attempt for that exact glyph. Base
  layer looks up the raw base glyph. The mini score-card keeps passing folded
  attempts with `shiftLayer` undefined → byte-identical to today (its keys are
  base glyphs, so base lookup matches). ponytail: one prop + a glyph map; no new
  component.

`src/components/heatmap/KeyHeatmap.tsx`:
- `shiftLayer` state (default false). Set true while Shift held
  (`keydown`/`keyup`), and a sticky `⇧` toggle button. Render `shiftedGlyph` as
  the cell label when active. Lock badge / colors read the active layer's glyph.

`src/components/typer/Keyboard.tsx`:
- `buildStatsAttempts` stops calling `foldAttempts` — pass the **raw** merged map
  so both layers can resolve their own glyph. (Lifetime base + session, summed by
  raw char.)

Tests: `heatmap.test.ts` — `shiftedGlyph` table (`1→!`, `;→:`, `/→?`, `r→R`,
no-shift passthrough); raw lookup per layer.

Screenshot tour: capture base + shift-held states of the Practice keyboard.

## Phase B — per-glyph locks + authoritative punctuation (the bug fix)

> **Status:** authoritative-punctuation half ✅ done (the reported leak). Practice
> no longer passes the global toggle; punctuation comes only from locked marks
> (`. , ; -` selectable today, smart drill too). The shifted-mark locks (`? ! :`)
> and the raw-glyph smart-drill partition are **deferred to Phase A** — they need
> the shift-layer UI to be clickable.

`src/components/typer/Keyboard.tsx`:
- `selectedKeys` carries actual glyphs. `handleKeyClicked(key)` toggles the
  **active layer's** glyph:
  - Base layer: letters/digits/base-marks as today (letters keep the ≥6 +
    vowel/consonant floor).
  - Shift layer: letter cells inert (caps display-only); `! ? :` toggle freely as
    add-on marks. `isDrillable` already accepts them via `isDrillMark`.
- `lockedKeys` computed per layer from `selectedKeys`.
- `handleSmartDrill`: build the drillable map **raw for marks/digits** (so `:`
  `?` `!` are candidates) and **folded for letters** (drill lowercase). Partition
  as today; extras now include shifted marks.
- A small `Capitalize` toggle near Smart drill → practice setting `drillCapitals`.

`src/components/typer/hooks/useTestText.ts` (practice branch):
- Drop the global toggles: call
  `applyTextOptions(generateBetterPseudoText(500, letters), false, drillCapitals,
  { marks, digits })`. `marks = selectedKeys.filter(isDrillMark)` now legitimately
  includes `? ! :`; empty marks → no punctuation (locks authoritative). Bug 1 dies
  at the call site; `applyTextOptions` itself is unchanged (other modes still use
  the global toggle).

Persistence: old `selectedKeys` are all valid base glyphs → no migration; shifted
glyphs are simply new additions.

Tests: `utils.test.ts` already covers restricted-mark sprinkling — add a case that
`{ marks: ["?"] }` sprinkles `?` and empty marks yield no punctuation regardless.
Keyboard smart-drill partition keeps ≥ letters with shifted extras.

## Phase C — surface symbol & capital latency

- [drill.ts:31](../src/lib/drill.ts#L31) strips transitions to `[a-z]` — widen so
  symbol/punctuation pairs survive into the transition drill (or gate behind a
  letters-only fallback only when no symbol data exists).
- Weak-key / slow-transition displays (`/progress`, score-card diagnosis) already
  read raw chars; ensure none filter out non-letters and that shifted glyphs get a
  readable label (show `:` not `;`). `aggregateKeyLatency` already keys on raw
  char, so `:` vs `;` latency is distinct for free.
- "Slow on X" findings end in a drill button that locks that exact glyph (Phase B
  makes the glyph lockable).

Tests: `diagnosis.test.ts` / `drill.test.ts` — a symbol/capital appears as a weak
key and as a drill target instead of being stripped.

---

## Build order (each commit: suite green + screenshot tour)

1. **Phase B (leak fix)** ✅ — authoritative punctuation. Fixes the reported bug now.
2. **Phase A** — shift-layer display, read-only. Proves the layer; unlocks `? ! :`.
3. **Phase B (rest)** — per-glyph shifted-mark locks + raw-glyph smart drill (needs A).
4. **Phase C** — surface symbol/capital latency as findings + drill targets.

Glyph maps and the sprinkle/partition stay pure in `src/lib` + `utils.tsx` with
unit tests; components only render and wire.
