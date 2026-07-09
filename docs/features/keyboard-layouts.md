# Keyboard layouts

**Status:** ✅ done (2026-07-09) — slices 1–11 shipped; wave-3 layouts
(qwertz-ch, azerty-be, cf, canadian-multilingual, bepo) stay on demand, and
the deliberate v1 cuts live in Upgrade paths below. Plan re-derived from first
principles and merged with the national-layouts plan 2026-07-08.
**Decisions locked with the owner 2026-07-08.**
**Trigger:** a German user on the new language support — words are German,
board is US QWERTY.

The keyboard layout is a global, local-first setting: it changes what the app
*displays and teaches* — boards, heatmaps, next-key guidance, the train ladder
— and never remaps input. It covers both **remap layouts** (Dvorak, Colemak…)
and **national layouts** (QWERTZ, AZERTY, Spanish, …) with dead keys, AltGr
layers, and ISO shapes. When the language changes, the board follows: German →
QWERTZ with real ü/ö/ä keys.

Vision filter: a diagnosis board that shows keys where they aren't is a wrong
measurement. For every non-US user, matching the board to their hardware is
correctness, not cosmetics.

## Prior locks, re-derived

The 2026-07-07 decisions were re-examined on merit, not inherited:

| Old lock | Verdict | Why |
|---|---|---|
| 1. Display only, no input emulation | **Keep** | Input reads `e.key`; the OS already resolves remaps, dead keys, AltGr, IMEs. Emulation breaks on non-ANSI hardware for zero gain. |
| 2. v1 = five remap layouts, national deferred | **Superseded** | National layouts are the actual demand (decision 8: waves). |
| 3. Progress strictly per-layout | **Replaced** | Per *pool* (decision 6). Char-keyed storage + read-time folding means national variants share history; only true remaps reset motor skill. |
| 4. Nav LayoutMenu mirroring LanguageMenu | **Keep + extend** | Sound shape; gains an `auto` entry and grouping (decision 4). |
| 5. Leaderboards one pool | **Keep** | Layout doesn't change the words typed. Tag stays honesty metadata. |

Also dissolved: global-language.md's "Practice stays a–z because its UI is the
QWERTY board" — once the board renders any layout, that rationale is gone (the
*drillable set* staying a–z v1 is a separate, deliberate cut — see upgrades).

## Current state (evaluated 2026-07-08)

**Shipped (slices 1–2):**

- `src/lib/keyboardLayout.ts` — pure lib; 5 remap layouts as four plain strings
  (number row + 3 letter rows), `rowsFor`, `keyStagesFor` (position-spec train
  ladder), picker meta.
- `useLayout()` (`typecafe:layout` + change event) and nav `LayoutMenu`.

**Working in our favor:**

- **Input is `e.key`** (`Text.tsx`): a German user's ü already arrives as
  `"ü"`. Dead-key presses arrive as `e.key === "Dead"` and are already ignored
  (not an error); the composed char lands on the next press, so its recorded
  time spans both strokes — correct signal, accents genuinely cost time.
- Scoring, drills, grams, word generation are character-based — untouched.
- Per-char tallies (`keyStats`, timelines, `drillProgress`'s unfolded
  `attemptsFromEvents`) are keyed by the *character*; folding onto physical
  keys happens at read time. A German user's existing ü/ö/ä history lights up
  the QWERTZ board the moment folding knows the key — **no data migration**.
- `accentsFor(language)` already derives each language's accent set from its
  word list — the exact set a layout must make reachable.

**Three shipped assumptions national layouts break:**

1. **One glyph per key.** Plain-string rows can't express per-layout shift
   glyphs (German shift+7 = `/`), AltGr glyphs (`@` on Q, `€` on E, *all*
   Polish accents), or dead keys.
2. **The shared-glyph-set invariant.** heatmap.ts's `SHIFT_MAP`,
   `shiftedGlyph`, `foldToPhysicalKey` are layout-independent only because all
   five remap layouts permute one ANSI glyph set (pinned by a unit test this
   plan retires). QWERTZ breaks it: ü ö ä ß are base glyphs; shift pairs
   differ per layout.
3. **ANSI shape.** QWERTZ/AZERTY are ISO: an extra key right of left-shift,
   12-key D and C rows. Row data becomes variable-length.

## Decisions

### 1. Display and teaching only — never remap input

The OS types; we render, diagnose, and teach in the user's layout. Revisit
`e.code` emulation only on real demand (see upgrades).

### 2. One deep geometry module (the seam decision)

Key geometry today is smeared across two files: keyboardLayout.ts owns rows
and ladder stages, heatmap.ts owns shift pairs and char→key folding — the
split only works because of the glyph-set invariant that national layouts
break. Re-derived seam: **`keyboardLayout.ts` becomes the single module that
owns "where keys live and what they produce"; heatmap.ts keeps "how accuracy
becomes color."**

The interface callers (and tests) learn — pure, React-free, memoized:

```ts
boardFor(layout): Board                 // rows of keycaps: glyphs per layer, dead flags, ansi|iso
keyFor(char, layout): string | null     // char → physical key (absorbs foldToPhysicalKey)
glyphAt(key, layer, layout): string     // board layer rendering (absorbs shiftedGlyph)
sequenceFor(char, layout): Step[]       // teaching: keystrokes incl. shift/altgr/dead steps
keyStagesFor(layout): string[]          // train ladder stages (exists)
resolveLayout(stored, language, detected, locale): LayoutId
defaultLayoutFor(language, locale): LayoutId
statsPoolFor(layout): string            // the storage dimension
// + PICKER_LAYOUTS / layoutMeta / LAYOUTS / DEFAULT_LAYOUT (exist)
```

Interface facts (part of the interface, not the implementation): every
function is total — unknown layout falls back to qwerty, unmappable char
returns `null`/`[]`; qwerty outputs are pinned byte-for-byte to today's
behavior; `sequenceFor` is at most two steps (dead + base). Behind this
surface sit all layout tables, layers, compose maps, ISO shapes, detection
signatures, and pedagogy ordering — the deletion test passes: remove the
module and that knowledge reappears in five consumers.

heatmap.ts shrinks to the accuracy module: `KeyAttempt`, `heatmapCell`,
`accuracyColor`, and `foldAttempts`/`attemptsFromEvents` gain a `layout`
parameter, delegating folding to `keyFor`. `HEATMAP_ROWS` (and the
module-scope constants derived from it in KeyHeatmap.tsx and Keyboard.tsx —
`HEATMAP_LAYOUT`, `ALL_KEYS`, `SHIFT_DRILL_MARKS`, which bake the layout in at
import time) are replaced by per-render derivations from `boardFor`.

Internal seams, not part of the interface: layout data records (authored as
compact aligned layer strings, parsed once), the compose table, and the
detection signature table — each tested directly, none exported.

### 3. Layered key model, dead keys as data

A key is `{ base, shift?, altgr?, shiftAltgr?, dead? }`; a layout is
`{ id, shape: "ansi" | "iso", rows, compose? }` where `compose` maps dead char
+ base → composed (`"^" + "e" → "ê"`). Letters derive shift = uppercase; only
exceptions are authored. The five remap layouts re-express losslessly (base
layer only). Transcribe national layouts from CLDR/XKB, eyeball against
Windows layouts (owner's OS). Compose tables carry only chars our languages
use (`accentsFor` ∪ a–z), not full Unicode.

**The invariant that keeps 15 layouts honest:** for every offered language,
every char in `a–z` ∪ `accentsFor(language)` is reachable on that language's
default layout via `sequenceFor`. A layout data typo fails CI, not a user.

### 4. Layout follows language via `auto` — never a silent override

`typecafe:layout` stores `"auto"` (new default) or an explicit layout id:

```
resolveLayout: explicit id → itself (pinned; language changes never touch it)
               auto        → detection result → defaultLayoutFor(language, locale) → qwerty
```

Globe to German with layout on auto → board flips to QWERTZ. An explicit
Colemak pick survives everything. LayoutMenu's first entry shows the resolved
value (`Auto — QWERTZ (Germany)`), then grouped explicit lists (national /
remaps). Existing stored picks keep working; only untouched users get auto.

**Per-language defaults** (locale = `navigator.language`, tiebreak only):

| Language | Default | Locale tiebreaks |
|---|---|---|
| english | qwerty (US) | `en-GB` → qwerty-uk |
| german | qwertz-de | `de-CH` → qwertz-ch (wave 3) |
| french | azerty-fr | `fr-BE` → azerty-be, `fr-CA` → cf (wave 3) |
| spanish | qwerty-es | `es-419/-MX/…` → qwerty-latam |
| italian | qwerty-it | — |
| portuguese | qwerty-pt | `pt-BR` → qwerty-abnt2 |
| dutch | qwerty-us-intl (NL convention) | — |
| polish | qwerty-pl (programmers: US + AltGr accents) | — |

### 5. Detection: two adapters, one pure signature module, never a prompt

- **`navigator.keyboard.getLayoutMap()`** — Chromium only (Chrome 69+/Edge
  79+ desktop), HTTPS. **No user-facing permission prompt** (Permissions
  Policy matters only in iframes; Chromium ignores it top-level). Firefox and
  Safari hold negative standards positions — it will never be cross-browser.
  Returns `code → glyph`, enough to fingerprint from ~6 probes (`KeyQ→"a"` =
  AZERTY, `KeyZ→"y"` = QWERTZ, `Semicolon→"ñ"` = Spanish…). No dead-key info,
  so US vs US-International are indistinguishable — the language default
  breaks that tie.
- **Passive inference (all browsers, zero permissions):** real typing already
  delivers `e.code`+`e.key` pairs; a handful of letter observations matches
  the same signature table.

The signature matcher is one pure function over `code → glyph` observations —
the real seam here, with the API probe and the passive listener as its two
adapters feeding one cached result. Detection **only feeds `auto`**, applied
at mount/test boundaries (never mid-test board swaps), never overrides an
explicit pick. `navigator.language` is a variant tiebreak, never layout
evidence.

### 6. Stats pool by layout family — the storage dimension is `statsPoolFor`

Two user actions look identical as a layout switch:

- **qwerty → colemak** is *retraining*: same hardware, new motor map. Pool
  per layout.
- **qwerty → qwertz-de** is *correcting the display* to the hardware they've
  typed on all along. Their char-keyed history is already valid for the
  QWERTZ board; resetting it punishes the user who asked for this.

So: all national/traditional layouts pool as `"qwerty"` (= the untagged-legacy
pool — zero migration); each remap (dvorak, colemak, colemak-dh, workman,
bepo) is its own pool. Applies uniformly to `TrainProgress`, `PracticeStats`,
`TransitionStat`, guest `keyStats`/`transitionStats`/progress entries.
Accepted cost: the rare user genuinely retraining between two national
layouts shares one pool. `Test.layout` still tags the **actual** id — tags
are precise, the pool is only the aggregation key.

### 7. Rendering umlauts, dead keys, AltGr

- **Keycaps**: up to 4 glyphs in physical convention — shift top-left, base
  bottom-left, AltGr bottom-right (shift-AltGr only when it exists and
  differs). Dead glyphs render with a combining ring (◌̂) and muted style.
- **Layers**: the board's base/shift toggle gains an AltGr layer, shown only
  when the active layout has AltGr glyphs. Load-bearing for Polish, where
  every accent is an AltGr chord.
- **Next-key guidance**: `sequenceFor` resolves any char — `ü` on qwertz-de =
  one key; `ê` on azerty-fr = dead `^` then `e` (numbered badges 1→2); `ą` on
  qwerty-pl = AltGr+a (AltGr highlighted like shift today). `keySignal` stays
  char-based; the board derives the sequence. This makes the L45+ accent
  stretch (`withLanguageAccents`) teachable at last.
- **Heatmap folding v1**: direct-key chars (ü ö ä ß · é è à ç ù · ñ — the
  overwhelming majority of accent usage) fold onto their real key per layout.
  Dead-key *composed* chars (ê î ô ã …) keep folding to null — deliberate cut,
  first entry in the upgrade paths below.

### 8. Catalog in waves — data entries, not features

- **Wave 1 (with the model):** qwertz-de — the user who asked.
- **Wave 2 (defaults complete):** azerty-fr, qwerty-es, qwerty-latam,
  qwerty-uk, qwerty-us-intl, qwerty-it, qwerty-pt, qwerty-abnt2, qwerty-pl.
- **Wave 3 (on request):** qwertz-ch, azerty-be, cf (Canadian French),
  canadian-multilingual, bepo, qwertz-at (alias of de, only if asked).
- Shipped remaps (dvorak, colemak, colemak-dh, workman) cover the "English
  Dvorak/Colemak" asks.

### 9. Competitive: one pool, unchanged

Layout never changes the words typed; leaderboards stay one pool. Tags enable
future filtering, not ranking.

### 10. Score surfaces render the test's own layout

A shared score card or beat-run compare is viewed by people on *other*
layouts; once `Test.layout` tags exist, the mini heatmaps on
`ShareableScoreCard` and `score/[slug]` (where target and challenger may
differ from each other!) render each test's tagged board, untagged → qwerty.
Until tags land, they render the viewer's active layout.

## Impact map — every mode and page

| Surface | Impact | Slice |
|---|---|---|
| Home typer (`index.tsx`, `Keyboard.tsx`) | Next-key board renders active layout; import-time consts (`ALL_KEYS`, `SHIFT_DRILL_MARKS`) become per-layout derivations; German umlaut words highlightable | 4 |
| Practice (same `Keyboard` + selection) | Board shows active layout incl. AltGr layer; drillable set stays a–z/digits/marks v1 (accent keys display-only — upgrade 2); `selectedKeys` storage is chars, unaffected | 4 |
| Train (`train.tsx`, `levels.ts`) | Ladder stages from `keyStagesFor(layout)`; L45+ accents get positions + sequence badges; `highlightKeys` stays char-based; progress pooled (decision 6) | 7, 8 |
| Drill (`drill.tsx`, `drillProgress.ts`) | Untouched math — its `attemptsFromEvents` is deliberately unfolded (char-keyed); board highlight follows layout via `Keyboard` | 4 |
| Grams | Char-based generation untouched; board follows layout | 4 |
| `/progress` | Lifetime heatmap renders active layout's board; coach reads the active pool; a chip names the layout (globe-chip pattern) so an empty pool view doesn't read as broken | 8 |
| Score card (`ShareableScoreCard`) | Mini heatmap → test's tagged layout (decision 10) | 4, 8 |
| Beat-run (`score/[slug]`) | Target and challenger boards each render their own test's tag | 8 |
| Leaderboard | Unchanged (decision 9) | — |
| Profile | No board surface — unaffected | — |
| Nav (`LayoutMenu`) | Auto entry + resolved value + national/remap grouping | 5 |
| Storage (server + guest) | `layout` tag on `Test` + guest progress entries; `statsPoolFor` dimension on `TrainProgress`/`PracticeStats`/`TransitionStat` + guest stats; migrate **both** DBs (dev `.env.local` + CLI `.env`); untagged = qwerty pool | 8 |
| `heatmap.ts` | Shrinks to accuracy math; folding/rows/shift move behind the geometry interface | 3 |

## Slices

- [x] 1 — `src/lib/keyboardLayout.ts`: five remap layouts as row data; derived
      rows + `keyStagesFor`. Found while building: all five permute the same
      ANSI glyph set, so heatmap folding stayed layout-independent — an
      invariant (and its pinning test) deliberately retired by slice 3. Ladder
      invariants tested: qwerty stages set-match the hand-authored
      `KEY_STAGES`; every layout climbs home-row-out to 26 letters. No UI.
- [x] 2 — `useLayout()` hook + nav `LayoutMenu` mirroring `LanguageMenu`;
      picker meta in keyboardLayout.ts. Mobile bar overflow fixed by
      icon-only triggers below `sm`. E2e (pick Colemak, survives reload,
      desktop + mobile) + tour capture `39c-nav-layout-menu`.
- [x] 3 — **Geometry deepening** (decision 2/3): layered `KeyCap` rows, ISO
      shape, dead/compose data; `boardFor`/`keyFor`/`glyphAt`/`sequenceFor`/
      `statsPoolFor`; folding + shift logic moved from heatmap.ts behind the
      interface (heatmap keeps tallies/color; its fns gain `layout` params
      defaulting qwerty, so all pre-geometry callers are byte-for-byte
      unchanged — 477/477 unit tests passed untouched); five remap layouts
      re-expressed from their exact strings; glyph-set invariant test replaced
      by load-time collision validation + the accent-reachability invariant.
      Found while building: qwertz-de *data* pulled forward from slice 4 into
      the layout table (not the picker — no UI leak) so dead/AltGr/ISO logic
      is tested against real German T1 data instead of synthetic; compose is
      one shared table (´+e→é on any hardware) with per-layout dead lists;
      `LAYOUT_IDS` (geometry) split from `LAYOUTS` (picker). No UI.
- [x] 4 — **Boards render the layout + QWERTZ lands:** qwertz-de picker entry;
      `Keyboard.tsx` + `KeyHeatmap` take the active layout (import-time consts
      → per-layout memos); ISO rendering; multi-glyph keycaps (full cells:
      shift twin top-right for symbols, AltGr bottom-left; mini stays
      single-glyph — the percent badge owns bottom-right); AltGr layer toggle
      (settings-line `altgr on/off` + held-AltGr peek, rendered only when the
      layout has AltGr glyphs); dead caps dash-bordered with a title. The
      non-practice teaching board renders each row's letter + dead caps (qwerty
      reproduces the old 10/9/7 letter rows exactly; AZERTY's number-row
      accents join it). Practice keeps its a–z drill rules; AltGr layers are
      entirely display-only. E2e + tour (see slice 10).
- [x] 5 — **Auto mode:** stored default `"auto"`; `resolveLayout` +
      `defaultLayoutFor` (with locale tiebreaks and an existence guard, so
      defaults activate as layouts ship); LayoutMenu leads with
      `Auto — <resolved>` and groups Standard/Alternative; explicit picks
      stay pinned. Legacy stored picks keep working. E2e: globe → German
      flips the board (auto) and doesn't (pinned).
- [x] 6 — **Detection** (src/lib/layoutDetect.ts): pure signature matcher over
      code→key observations (verdict only when exactly one candidate has ≥2
      matches and zero contradictions — ties like qwerty/us-intl/polish or
      es/latam return null and the language default decides); two adapters
      feed it — the Chromium getLayoutMap probe (applies at mount via the
      change event) and a passive keydown listener (writes the cache only;
      takes effect next mount, so a board never swaps mid-test). Matcher
      unit-tested incl. the de/ch separating probe.
- [x] 7 — **Teaching:** `levelsFor(layout)` (memoized by stage content;
      unknown layouts share qwerty's ladder) from `keyStagesFor`;
      trainProgression helpers take the ladder as a param; train.tsx re-points
      the selected level by name on layout switch (progress untouched).
      Next-key guidance renders `sequenceFor` steps imperatively: 1→2 badges
      for dead-key chars, ⇧/AG modifier badges, restoring level-key highlights
      on leave. Found while building: AZERTY's home row has no vowel, and word
      generation needs one from stage 1 — `keyStagesFor` now borrows the
      nearest vowel position (AZERTY: e) into stage 1, and the invariant test
      allows exactly that one off-row vowel.
- [x] 8 — **Pools + tags** (decisions 6/10): `pool` column on PracticeStats/
      TransitionStat/TrainProgress (uniques widened, raw-SQL conflict targets
      updated) + `layout` tag on Test; both DBs pushed (`prisma db push`, new
      uniques are supersets of the old — no data risk). Guest mirrors keep
      their entry shapes and gain pool-suffixed storage keys (the legacy key
      IS the qwerty pool — zero migration); GuestImport syncs per pool via
      `STATS_POOLS`. All reads (coach tabs, drill baseline, plan, /progress,
      practice board) thread `statsPoolFor(activeLayout)`; /progress gains a
      layout chip beside the globe chip. Score card + beat-run boards render
      each test's own tag (share snapshots + Test projection carry `layout`).
      Found while building: practiceStats `create`/`update` procedures had
      zero callers — deleted. `trainProgress.getSummary` (profile) stays
      cross-pool: the profile is a lifetime showcase across pools, like
      languages.
- [x] 9 — **Wave 2 layouts:** azerty-fr, qwerty-es, qwerty-latam, qwerty-it,
      qwerty-pt, qwerty-abnt2, qwerty-uk, qwerty-us-intl, qwerty-pl shipped
      (data + picker + reachability tests + ground-truth pins). The parser
      grew `overrides` (AZERTY digits live on the shift layer of accent
      letters — underivable) and COMPOSE gained ' / " rows for
      US-International's dead apostrophe/quote. œ is deliberately not
      asserted reachable — real AZERTY can't type it.
- [x] 10 — **Sweep:** e2e — auto-follows-language + pinned-stays test, QWERTZ
      practice board with umlaut caps and the AltGr layer; tour captures
      `60-practice-qwertz-board` + `61-practice-qwertz-altgr-layer`; full
      affected-surface run green (home 39, train/progress/drill/plan/nav 54,
      tour 48, shared-score/typing-focus 17; unit 520). Wave 3 stays
      on demand.
- [x] 11 — **Accent drills + layered surfaces everywhere** (2026-07-09, owner
      request; ships upgrade paths 1+2). Practice: the language's accent chars
      the active layout can type are drill keys — direct glyphs (ü ö ä ß on
      QWERTZ, é è à ç ù on AZERTY, ą ę on Polish AltGr) lock/unlock their own
      cell on whichever layer they live; a dead key is ONE toggle for its
      whole composed set (clicking ^ on AZERTY adds/removes ê â î ô û
      together). Unlocked accents join word generation (`\p{L}` letters) and
      the smart-drill pool (they ride as extras after the a–z anchors; the a–z
      vowel/consonant floor is untouched). No accents *setting*: the per-key
      lock is the setting — punctuation needed a global toggle because marks
      are sprinkled between words; accent letters live inside words and each
      has its own cell. Fold change: `keyFor` now sends dead-composed chars to
      their dead key's cell (ê → ^), so score cards, /progress, and smart
      drill see accent-key weakness; `composedFor` is the new geometry export
      and KeyHeatmap aggregates a dead cell's accuracy over its composed set.
      Train: the guide board is the same full physical board as the heatmap
      via KeyHeatmap `showAccuracy={false}` (plain: no shading/percentages,
      corner glyphs + dead styling + ISO shape kept); holding Shift/AltGr
      peeks those layers; the next-key marker and level highlight address
      cells by the new stable `data-kb-cell` (survives layer re-renders), and
      a dead-composed level char highlights its dead key's cell. /progress:
      the lifetime heatmap gained ⇧ shift / AltGr layer switches (AltGr only
      when the board has the layer); attempts are stored unfolded so each
      layer reads each glyph's own tally. Known quirks (accepted): a
      selectedKeys accent survives a language/layout switch harmlessly (its
      words never generate); diagnosis drillKeys stay a–z.

## Upgrade paths (deliberate v1 cuts, with their triggers)

1. ~~Dead-key composed chars → heatmap cells~~ — **shipped in slice 11** as
   step 2 directly: `keyFor` folds composed chars onto the dead key's own
   cell (ê → ^, never e's cell — merging with the base letter would blur two
   different motions), `composedFor` exposes the composed set, KeyHeatmap
   aggregates the dead cell's accuracy.
2. ~~Accent keys drillable in Practice~~ — **shipped in slice 11**: direct
   accent glyphs and dead-key composed sets lock/unlock and smart-drill;
   gated by language ∩ layout, not a settings toggle.
3. **Detection nudge for pinned users** ("your keyboard looks like QWERTZ —
   switch?"): only if auto-mode adoption proves insufficient.
4. **Per-layout leaderboard filtering:** `Test.layout` tags make it a
   read-time filter; decision 9 (one ranking pool) stands.
5. **ABNT2/JIS extra physical keys:** `shape` enum extends beyond ansi/iso;
   qwerty-abnt2 ships wave 2 on ISO rows minus its extra keys until then.
6. **AZERTY shift-layer digits as drill targets:** AZERTY puts 1–9 on the
   shift layer of its accent keys; digits there stay display-only for now
   (base-layer digit drills cover every other layout). Trigger: a French
   user asking to drill numbers.
7. **Input emulation (`e.code` remapping):** still a non-goal — breaks
   non-ANSI hardware, dead keys, IMEs. Revisit only on sustained real demand
   from users who cannot switch their OS layout.

## Out of scope

Non-Latin scripts and IMEs (matches the language ledger) · full Unicode
compose tables · physical Enter/key-shape fidelity beyond row layout (flat
rows) · per-layout ranking pools · a consolidated settings surface (until the
nav actually overflows).

## Risks

- **Layout data correctness is the product** — a wrong glyph teaches a wrong
  key. Mitigations: transcribe from CLDR/XKB, reachability invariant in CI,
  per-layout snapshot tests, and a real-user check for German (the reporter).
- **Detection wrongness** only mis-defaults `auto`; the menu shows the
  resolution, one click fixes it, nothing is destroyed.
- **Board rebuild scope** (slice 4) touches Keyboard.tsx/KeyHeatmap once, for
  everything — layered caps, ISO, AltGr. Don't split it into two passes.
- **Remap-user ladder shift at slice 7** (colemak stages change content while
  train progress stays global until slice 8): acceptable pre-launch
  (break-anything constraint); slices 7→8 should land close together.
