# Phase 2 - Typer UI Overhaul

**Goal:** the first screen looks and behaves like a focused typing instrument: mode, length, language, stats, and rare settings are all understandable without hiding the test behind a modal.

This phase replaces the narrower Phase 1.4 main-page pass. Phase 1 stays about the improvement loop; this phase owns the visual and interaction overhaul shown in `docs/screenshots/vision-screenshots/`.

Reference mockups:

- `vision-1.png` - closed toolbar, large typing text, refreshed WPM/accuracy treatment
- `vision-2.png` - settings dropdown open from the toolbar
- `vision-grams.png` - grams mode subpanel; ignore the custom length input shown in the generated mockup

---

## 2.1 Mode Model and Typer Toolbar (M)

Timed and Words become separate top-level modes. The toolbar shows:

```text
[ Timed | Words | Practice | Grams | Relaxed ] [ length/context controls ] [ language ] [ settings ] [ restart ] [ fullscreen ]
```

- Top-level modes are **Timed, Words, Practice, Grams, Relaxed**. There is no user-facing "Normal" mode.
- The active mode owns the context controls immediately to the right of the mode group.
- Icon buttons live on the right side of the typer toolbar.
- The toolbar is the primary surface for frequent choices; settings is for secondary toggles only.
- Existing state should migrate through `useTestSettings` without losing persisted settings. Any legacy `mode: "normal"` value must resolve to Timed or Words based on its saved sub-type.

## 2.2 Length Controls and Custom Slide-In (M)

Length is no longer hidden behind the settings modal.

- Timed length presets: `15`, `30`, `60`, `120`, `Custom`.
- Words length presets: `10`, `25`, `50`, `100`, `Custom`.
- Clicking `Custom` slides a text/number input right-to-left over the preset buttons in the same toolbar area.
- The slide-in input supports confirm, cancel/escape, blur behavior, validation, and a clear return to presets.
- Custom lengths remain unranked where they are unranked today.
- The input must not shift the rest of the toolbar or resize the typer area.

## 2.3 Language as Toolbar Icon (S)

Language moves out of settings into its own toolbar icon beside the settings button.

- The icon opens a compact language dropdown or popover.
- The current language is visible through tooltip, accessible label, or compact text where space allows.
- The dropdown closes on outside click, escape, language selection, and clicking the language button again.
- This control must work on desktop and mobile without overlapping the settings dropdown.

## 2.4 Settings Dropdown (M)

Settings becomes a dropdown menu anchored to the toolbar, not a modal/popover front door.

- The settings menu opens from the settings icon and closes on outside click, escape, or clicking the settings button again.
- It contains secondary toggles only: punctuation, capitals, live stats, keyboard visibility, and other rare display/test options.
- It must not contain mode, length, or language.
- The dropdown should follow the mockup's compact two-column/toggle feel without becoming a card inside another card.
- E2E helpers should stop relying on the old `#configModal` checkbox pattern for these controls once this ships.

## 2.5 Live Stats and Typing Text Treatment (M)

The typing text becomes the visual center of the page.

- WPM and accuracy use the mockup treatment: small labels, larger values, restrained divider, left of the typing text on desktop.
- Live stats still honor the user's live-stats toggle.
- The typing text font is significantly larger and becomes the page's dominant visual element.
- Text must remain readable and stable across desktop and mobile; no overlap with stats, toolbar, restart hint, or keyboard.
- The active character/caret styling keeps the TypeCafe accent without making the text feel decorative.

## 2.6 Practice and Grams Toolbar Panels (M)

Practice and Grams get mode-specific panels without hiding core controls in settings.

**Practice:**

- Key selection, Smart drill, and analytics/keyboard-related controls sit in an anchored toolbar or subpanel.
- The drill handoff from diagnosis still lands with the diagnosed keys selected.

**Grams:**

- Grams settings become a subpanel like `vision-grams.png`.
- Source, scope, combinations, repetitions, WPM threshold, and accuracy threshold are visible in the subpanel.
- The custom length input shown in the generated grams mockup is a hallucination; do not implement it.
- The rebuilt grams presentation from the previous Phase 1 scope belongs here if it has not already shipped: large current gram, clear level progress, per-level best, and a clean advancement state.

## 2.7 Responsive and Accessibility Requirements (S)

- Toolbar controls wrap or collapse deliberately on mobile; they must not overflow or force horizontal scrolling.
- Every icon button has an accessible name and hover/focus tooltip where meaning is not obvious.
- Dropdowns trap neither focus nor typing input once closed.
- Keyboard shortcuts still work: typing focus, restart, escape-to-close dropdowns, and fullscreen where supported.
- The screenshot tour captures closed toolbar, settings open, language open, custom length input, Timed, Words, Practice, Grams subpanel, Relaxed, and mobile variants.

## Sequencing Note

Build this in slices:

1. Mode model + toolbar shell
2. Length controls + custom slide-in
3. Language icon + settings dropdown
4. Stats/text visual treatment
5. Practice and grams subpanels
6. Responsive/accessibility pass + screenshot tour

Do not mix this work with progression, coach, competition, or reach features.

## Acceptance

- [x] Timed and Words are separate top-level modes everywhere a user chooses a mode
  - 2026-06-14: The typer toolbar now exposes `Timed`, `Words`, `Practice`, `Grams`, and `Relaxed`; stored Normal scores and settings still map through the existing `mode + subMode` data model while user-facing labels resolve to Timed/Words.
- [x] Length can be changed from the toolbar without opening settings
  - 2026-06-14: Timed and Words show their length presets directly in the toolbar context area, immediately to the right of the mode group.
- [x] Custom length slides over the preset buttons and validates without layout shift
  - 2026-06-14: Custom length now slides over the preset group inside the fixed toolbar context area, clamps invalid values, supports Enter/Escape/blur behavior, and returns cleanly to presets.
- [x] Language opens from its own toolbar icon and is absent from settings
  - 2026-06-14: The toolbar globe opens the language picker; normal-mode settings now contain secondary toggles only.
- [x] Settings is a dropdown, closes on outside click/button click/escape, and contains only secondary toggles
  - 2026-06-14: The gear now opens a shared toolbar menu dropdown with text/display toggles only; mode, length, and language are not present.
- [x] WPM/accuracy and typing text match the direction of the vision screenshots on desktop and mobile
  - 2026-06-14: On the main page, WPM/accuracy (plus the timed countdown) render as stacked label-over-value cells with a restrained divider, left-aligned above a much larger typing text that is now the dominant element. Live stats still honor the toggle; the timed countdown stays visible regardless. Grams keeps its legacy stat line until its 2.6 subpanel; the learn page keeps its existing control-bar layout. Covered on desktop + mobile by the screenshot tour (`01`, `02`, `07`, `27`) and the existing home specs.
- [x] Grams settings render as a subpanel; no custom length input exists in that subpanel
  - 2026-06-14: Grams settings (source, scope, combinations, repetitions, WPM threshold, accuracy threshold) render in an anchored `GramsPanel` below the toolbar (`vision-grams.png`); the hallucinated custom-length input is omitted. Number fields commit on blur/Enter (no per-keystroke restart) and clamp to valid ranges. The grams presentation now uses the stacked stat treatment — large current gram, plus WPM/AVG/ACC and a LEVEL x/total progress cell that advances cleanly. Practice keeps its key-selection/Smart-drill/analytics in the keyboard subpanel; the toolbar context now collapses for Practice/Relaxed (no "9 keys"/"Endless text" placeholder). Per-level best is left for the Phase 3 progression engine. Covered by `home.spec` (grams subpanel + micro-sample guard) and the screenshot tour (`05`, `25`, `26`).
- [x] Diagnosis drill handoff, re-measure flow, restart, fullscreen, live stats, and keyboard toggles still work
  - 2026-06-14: The improvement loop survives the toolbar overhaul — diagnosis "Drill these keys" still lands in Practice with the diagnosed keys selected, the re-measure prompt restores the diagnosed config and headlines the before→after delta, and restart/fullscreen/live-stats/keyboard all work from the new toolbar icon controls. Covered by `home.spec` (settings/keyboard/live-stats, restart, fullscreen, mode switches) and the screenshot tour (`35`–`38`).
- [x] Screenshot tour includes every new toolbar/dropdown/subpanel state
  - 2026-06-14: The tour captures the closed toolbar, settings dropdown, language dropdown (`39`), custom-length slide-in, Timed/Words/Practice/Grams subpanel/Relaxed, fullscreen, and mobile variants. Legacy specs that drove the removed `#configModal` modal (`visual-qa`, `mobile-modals`, `modal-focus`) were migrated to the new dropdown selectors.

**Owner's part:** final taste pass against the vision screenshots; choose any tradeoffs if the desktop mockup and mobile ergonomics conflict.
