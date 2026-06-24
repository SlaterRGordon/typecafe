# Pre-Slice 8 Polish Plan

Short queue before `learn-and-polish-plan.md` Slice 8. Easiest wins first. Each checked slice should be one focused commit, verified with affected e2e plus screenshots when UI changes.

## Ship Before Slice 8

### 1. Button Cursor Audit (XS)
- Ensure every clickable button/control uses `cursor-pointer`.
- Cover native `button`, `.btn`, icon buttons, labels used as controls, and custom select/menu controls.
- Avoid changing disabled controls.

Verify: quick visual pass + affected e2e only if selectors/classes change.

### 2. Learn Star Copy Trim (XS)
- Replace `1 star:`, `2 stars:`, `3 stars:` text with the star icon plus threshold.
- Apply on the Learn requirement pills and completion popover legend.
- Keep labels accessible with `aria-label`.

Verify: `learn.spec.ts`, Learn screenshots.

### 3. Typer Vertical Centering (S)
- Keep the typing text/stats visually centered on desktop regardless of optional keyboard/live-stats/faded UI state.
- Confirm home, grams, practice, learn, challenge, drill, beat-run.
- Removing the live keyboard must not push the typer way down.

Verify: screenshot tour for default/mid-test/keyboard-off/practice/learn/challenge.

### 4. Result Restart Fixes (S)
- Fix `tab + enter` and `tab + space` after completing drills.
- Fix the same shortcuts after completing Daily Challenge.
- Keep visible result buttons working.

Verify: drill e2e, challenge e2e, shared restart shortcut helper if useful.

### 5. Progress Chart Tooltips (S)
- Improve chart hover/focus tooltips: date, net WPM, accuracy, consistency where present.
- Make tooltip placement readable on desktop and mobile.
- Keyboard/focus access if the chart library supports it cheaply.

Verify: progress e2e + progress screenshots.

### 6. Progress Improvement Hero Context (S)
- The hero should show improvement plus start and current values.
- Example shape: `+12.4 WPM`, `58.2 -> 70.6`, period label.
- Keep improvement as the headline.

Verify: progress e2e + screenshot tour.

### 7. Learn Best Stars Visibility (S)
- Show best stars for completed levels near the active level summary.
- Show best stars in the level dropdown rows.
- Keep locked rows readable and not noisy.

Verify: learn e2e for local + signed-in progress, Learn screenshots.

### 8. Hide Plan For Release (XS)
- Hide `/plan` from navigation for launch.
- Direct `/plan` can remain available for internal testing unless hiding route is simpler.
- Remove/guard plan CTAs from post-test and drill completion if they would surface publicly.

Verify: navigation e2e, result/drill e2e where plan return appears.

## Think More Before Building

### 9. Plan Redesign Brief (M planning)
- Decide what a plan is before adding more UI.
- Needs: restart/new plan, goals, improvement stats, current plan progress, and clear proof it is helping.
- Do not ship visible plan until it answers: "what am I doing today, and is it working?"

Output: one design/logic doc, then implementation slices.

### 10. Quote / Passage Packs (M)
- Add as content variety after the core loop is polished.
- Keep evidence collection clean: score math and timelines must remain comparable.
- Likely needs mode/content-source metadata.

Output: separate Phase 6 content plan.

### 11. More Languages, Lazy Loaded (L)
- Move corpora out of the static upfront payload.
- Lazy-load word/gram bundles per selected language.
- Reuse `createGrams` pipeline.

Output: separate perf/content architecture plan.

**Done — English vocabulary sizes (1k / 5k / 10k / 25k):**
- Build inputs (committed, never shipped): `data/unigram_freq.zip` (333k frequency-ranked words; extracted `.csv` gitignored) and `data/scowl-en-us.txt` (SCOWL en-US dictionary). `scripts/gen-english-wordlists.mjs` keeps the frequency ordering but drops any word not in SCOWL — the raw corpus is a web crawl and otherwise ranks brand names / other languages / typos as "frequent" (lumix, nyheter, winmodem). SCOWL alone still passes single letters / initialisms / abbreviations, so short tokens are gated on allowlists (1-letter a/i; a 2-letter real-word set) plus a small blocklist (months, usa/url/tv…). Emits all four tiers `english{1k,5k,10k,25k}.json` from one pipeline, so they nest (1k ⊂ 5k ⊂ 10k ⊂ 25k); `english10k.json` is the default language + daily-challenge seed.
- Dropped 50k/100k: reaching 25k clean words already scans to frequency depth ~30k; 100k would dredge the noisy tail, and an educated vocabulary is only ~20–35k words anyway.
- Sizes register as lazy loaders in `utils.tsx`; only the 10k default stays in the main bundle.
- Picker groups the sizes as chips under one English row (`ModeBar.tsx`); `10k` maps to the base `english` key. e2e: `home.spec.ts` "English exposes vocabulary sizes".
- Still open for this item: migrate the default English + other languages fully off the static payload, and lazy gram bundles per language.

## Then Resume Slice 8

After items 1-8, continue Slice 8: themed Learn challenge levels.
