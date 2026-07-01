# UX Cleanup Plan

Decided 2026-06-28 from a desktop screenshot-tour review. Goal: make the home
page minimal and personal, slim the navigation, and consolidate the mode bar —
without diluting the diagnosis→drill→delta loop that already works.

Vision filter for every item: *does it make someone faster, or prove they're
getting faster?* Mobile is out of scope for this pass.

Build order: **1 → 6 → 5 → 2 → 3 → 4 → 8 → (7 deferred)**. Each item ships as its
own verified slice (suite + types green), commit per slice. #8 (width) runs last
among the active items so it sweeps pages after their content has settled.

---

## 1. Daily challenge → bottom-right corner card

**Decision:** remove the large banner above the test; show the daily challenge as
a small fixed card in the bottom-right corner instead.

- [x] Drop the full-width `DailyChallengePrompt` banner from above the mode bar in
  [index.tsx](../../src/pages/index.tsx) (currently lines ~545–547).
- [x] Render it as a compact card `position: fixed; bottom-right`, above the test,
  out of the typing column entirely.
- [x] Show **only when today's challenge is undone**; collapse to nothing once done.
- [x] Dismissible, and hidden in fullscreen + during typing-focus fade (reuse
  `typingFocusFadeClass`).
- [x] Don't let it overlap the score card or the bottom-nav (mobile) — desktop only
  concern here, but keep z-index below modals.

Net effect: ~120px of vertical space above the test reclaimed; test moves up.

---

## 2. Footer links → single "More" nav button

**Decision:** keep the page footer-free; roll the five footer links into one button
at the bottom of the side rail.

- [x] In [SideNavigation.tsx](../../src/components/navigation/SideNavigation.tsx),
  replace the bottom cluster (Support, Contact, Privacy, Terms, How-we-measure)
  with a single button — `···` icon, label "More" on hover-expand.
- [x] Clicking opens a small popover listing those five links. No new dep; the
  popover fits within the rail's expanded width so the rail's mouse-leave closes
  it (no backdrop/listener needed).
- [x] Primary rail then reads: Home, Train, Progress, Challenge, Leaderboard,
  Profile, + More. ~6 meaningful icons instead of 11.

---

## 3. Grams: advanced config behind defaults

**Decision:** default the fiddly numeric thresholds and hide them; show only the
two meaningful choices by default.

- [x] In [GramsPanel](../../src/components/typer/config/GramsPanel.tsx), keep
  **Source** (bigrams/trigrams/…) and **Scope** (top 50/100/200) visible by default.
- [x] Move **Combinations**, **Repetitions**, **WPM threshold**, **Accuracy
  threshold** behind an "Advanced ▾" disclosure (native `<details>`), collapsed by
  default.
- [x] Keep current values as the defaults (combinations 1, repetitions 0, WPM 20,
  accuracy 100) so behavior is unchanged for anyone who never opens Advanced.

---

## 4. Profile = "what others see"

**Decision:** make the profile read like a typist's identity card, not a settings
page. Keep the activity chart. **No heatmap** (that's a Progress thing).

- [x] Demote **Edit Profile**: replaced the full-width purple button with a small
  pencil icon next to the name. Own profile now looks ~identical to the public view.
- [x] Add a **hero**: top-speed number + rank/percentile badge, with the streak chip
  by the name. (Top Speed + Ranking moved out of the Stats boxes into the hero.)
- [x] Keep the **Activity** contribution chart. **No heatmap** (Progress owns it).
- [x] Replace the "Best Scores" block (table + four `react-select` filters) with
  **scored-cards**: one per common config (best 15s, best 60s, best 100-words),
  **WPM hero'd**, accuracy + raw + date secondary. Trophies, not a filterable log.
  - Built as a **portable `ScoreCard`** (presentational, takes computed numbers, no
    queries) so leaderboard / challenge boards can reuse it. `SignatureBests` is the
    profile-specific wrapper over the new `test.getSignatureBests` query.
  - **Records stay on Progress too**, intentionally different UI — not shared.
- [x] Unify public ([profile/[username].tsx](../../src/pages/profile/[username].tsx))
  and own profile into one shared `ProfileView`; own adds only the pencil affordance.

---

## 5. Home: surface the user's next action (minimal)

**Decision:** for returning signed-in users with history, show **one** coaching row
in the space the banner vacated. Must feel minimal and look good.

- [x] A single slim, centered pill above the mode bar, e.g.
  `Next: your slowest jump is b→r (2.2× avg)   [ Drill it → ]`.
- [x] One finding only — never a dashboard. Pull from the same weak-spot data
  Progress already computes (`worstTransitions` / `composeWeakKeys` in
  [src/lib/](../../src/lib/)). Reuse cached/query data; no new query cost
  (free-tier constraint). Slowest transition leads; falls back to weakest keys.
- [x] Click → `/drill` with those keys (same handoff Progress uses).
- [x] Dismissible. Shown only when there's enough history; guests / new users see
  nothing (signed-in only, returns null with no finding) — empty state clean.
- [x] Coexists with #1: challenge lives in the corner, this single row is the only
  thing above the test.

---

## 6. Mode bar consolidation: fold Relaxed + Quotes away

**Decision:** drop Relaxed and Quotes as top-level modes. The bar becomes
**Timed · Words · Practice · Grams** (4 modes).

### 6a. Replace Relaxed with "infinite" length options
**Key insight (verified):** Relaxed sets `appendsText = true`
([Text.tsx:220](../../src/components/typer/Text.tsx#L220)), so the buffer
regenerates forever and the test **never completes — no score card.** That *is* the
intended free-typing/warmup behavior. So ∞ is a re-label of the existing relaxed
engine, **not** new logic.

- [x] Keep `TestModes.relaxed` as the internal **engine** — leave the enum, the
  progress filter ([progress.ts](../../src/lib/progress.ts)), and the score-card
  label as-is. Only the *presentation* changes.
- [x] Remove the top-level **Relaxed** button from `TOOLBAR_MODES`
  ([ModeBar.tsx](../../src/components/typer/config/ModeBar.tsx)).
- [x] Add an **∞ (infinity)** option as the last Timed length ("no timer") and as
  the last Words length ("infinite words"). Selecting ∞ in either sub-mode switches
  the engine to `relaxed`; picking a finite length switches back to normal.
- [x] No completion / scoring work needed: ∞ runs never produce a result by design.
  `showLanguage` includes the relaxed engine so the picker stays available in ∞.

### 6b. Replace Quotes mode with a Quotes "language"
- [x] Remove **Quotes** from `TOOLBAR_MODES`; add **Quotes** as an entry in the
  language picker (its own row below the word languages).
- [x] Selecting Quotes flips `mode` to the quote engine, which hides the length
  presets and shows the existing quote-length buckets (All/Short/Medium/Long); no
  timer / count applies. Picking a word language returns to Normal.
- [x] Quotes scores stay **unranked** (already enforced by `mode !== TestModes.quotes`
  in Typer's `ranked` check — unchanged, since Quotes is still `TestModes.quotes`).
- [x] `showLanguage` / label / active-state branches updated so the picker reads
  "Quotes" while the quote engine runs.

Net: mode bar drops from 6 → 4; parity behavior preserved as options, not modes.

---

## 7. Plan into Progress — DEFERRED

Planned now, **not built this pass.**

- [ ] Surface only **today's single active step** as a compact card on
  [progress.tsx](../../src/pages/progress.tsx) (reuse `plan-active-step`), with
  "View full plan →".
- [ ] Keep the full 30-day grid on its own `/plan` route; remove Plan from the
  primary nav (it's already feature-flagged + signed-in only).
- [ ] Progress never inlines the whole calendar — one step only, so nothing new
  goes below the fold.

---

## 8. Standardize page width

Inconsistent today, by accident not design: typer `md:w-10/12`, mode bar
`max-w-screen-xl`, profile `w-11/12` (unbounded), leaderboard full-ish, static
prose capped to a readable column. That mix is the "some pages full, some not"
feeling.

**Two deliberate tiers, nothing unbounded:**

| Tier | Width | Pages |
|------|-------|-------|
| **Content** | `max-w-screen-xl` (~1280px), centered | progress, profile, leaderboard, plan, daily challenge, train, static/legal, drill |
| **Test** | `max-w-screen-xl` for the words area (already the mode bar's cap) | home typer, fullscreen exception keeps its own full-bleed |

*(One cap value keeps it simple; if the typing line-length later wants more room
than dashboards, bump only the test tier — a named second value, never accidental.)*

- [ ] Add a shared centered wrapper — either a small `PageContainer` or a class
  applied in [Layout.tsx](../../src/components/Layout.tsx) around `{children}` for
  non-home pages. Home already has its own typer container; align it to the same cap.
- [ ] Replace unbounded fractional widths:
  - typer `md:w-10/12` → `w-full max-w-screen-xl mx-auto`
    ([index.tsx:544](../../src/pages/index.tsx#L544));
  - profile `w-11/12` → the shared container
    ([profile.tsx:176,209](../../src/pages/profile.tsx#L176)).
- [ ] Audit each page in the table; remove ad-hoc `w-*/12` and let the wrapper own
  width. Inner cards keep their own grid/`max-w` as today.
- [ ] **Fullscreen test mode stays the intentional exception** (full-bleed by design).
- [ ] Re-run the screenshot tour after; the wide-monitor captures should show a
  consistent centered column across pages.
