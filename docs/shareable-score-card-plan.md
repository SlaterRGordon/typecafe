# Shareable Score Card — Plan

Goal: turn the score result into two distinct surfaces — a rich **in-app results dashboard** (what the user sees after finishing a test) and a dedicated, social-ready **shareable card** (what "Copy Screenshot" / share produces). The shareable card is a marketing asset: it must look great standalone, carry the TypeCafe identity, and make a stranger want to click.

## Current state (what exists today)

- `src/components/scores/ShareableScoreCard.tsx` is a **single component** used for BOTH:
  - the in-app "Test Complete!" dashboard (rendered from `src/pages/index.tsx` via `Typer`), and
  - the public shared page `src/pages/score/[slug].tsx` (`readonly`).
- **"Copy Screenshot" captures the entire dashboard.** `scoreCardRef` wraps the whole card; `copyScoreImage` → `renderScoreCardImage` → `modern-screenshot.domToBlob` on that full element. Result: a screenshot with every metric card, the chart, the performance table, and the typed-text panel — not a clean social card.
- **Theme colors already flow through** via CSS variables (`--color-primary`, `--color-base-100`, etc.) set on `document.documentElement` by the color system. The card uses `text-primary`, `bg-base-200`, etc., so it already matches the active theme (custom themes included). `domToBlob` inlines computed styles, so the screenshot inherits the theme too. **No change needed for theme matching — it already works.**
- **Typed text is a plain string with no error info.** `Typer.handleCharacterAttempt({ typed, correct })` appends only `attempt.typed` to `typedTextRef`; the `correct` flag is discarded ([Typer.tsx:483](../src/components/typer/Typer.tsx#L483)). `ScoreSnapshot.typedText: string` carries no per-character correctness. **Highlighting errors requires capturing and persisting that data first.**
- **Username is available** on the readonly path (`data.user` → `score.user.username`), but the in-app finish path needs to pull it from the session.
- **"Try TypeCafe"** only renders on the readonly shared page (`shareUrl && readonly`), as the last/rightmost button with a bordered/ghost style.

---

## Work items

### 1. Highlight typed errors using theme error color
**Problem:** no per-character correctness is stored, so errors can't be highlighted.

- **Capture:** in `Typer.handleCharacterAttempt`, record correctness alongside the char. Build a parallel correctness mask (e.g. `typedSegmentsRef`: an array of `{ ch: string, correct: boolean }`, or a compact `typedText` string + equal-length `correctnessMask` string of `"1"/"0"`). Backspaces must keep the mask in sync with `typedText`.
- **Snapshot schema:** extend `ScoreSnapshot` with the correctness data (e.g. `typedSegments?: { ch: string; correct: boolean }[]` or `correctnessMask?: string`). Keep it optional so old shares still validate.
- **Persistence:** include it in the saved share snapshot (`scoreShare` router) and in `isScoreSnapshot` validation in `score/[slug].tsx`. Gracefully degrade when absent (render plain text, no highlight) so existing/legacy shares don't break.
- **Render:** replace the plain `{score.typedText}` block with per-character spans; incorrect chars use the theme **error** color (`text-error`, or `bg-error/20` underlay for visibility on busy themes). Correct chars use `text-base-content`. Decide: color wrong chars only, or also show the expected char (recommend: wrong-char highlight only for v1 — simpler, and we don't currently persist the target text).
- **Edge cases:** very long text (truncate/scroll in dashboard; truncate to a snippet on the shareable card), empty text fallback.

### 2. Split into two surfaces: Results Dashboard vs Shareable Card
The biggest architectural change. Today one component does both jobs.

- **Results Dashboard** (in-app, `readonly={false}`): keep the full detail — 4 metric cards, WPM chart, performance details, typed-text panel with new error highlighting. Make **WPM the hero** (larger/visually dominant vs the other three stats) — see item 5.
- **Shareable Card** (new component, e.g. `ShareableScoreImage.tsx`): a dedicated, fixed-size card built only for screenshot/share. Contains the curated subset (item 4). Rendered into the DOM **off-screen** (absolute, positioned far off-viewport — NOT `display:none`, which breaks measurement) at exact pixel dimensions, so the screenshot is identical regardless of the user's viewport/zoom.
- **Wire "Copy Screenshot" / share to capture the new card**, not the dashboard. `domToBlob` targets the off-screen `ShareableScoreImage` ref.

### 3. Add logo + URL to the shareable card (card only, not the in-app dashboard)
- Inline the TypeCafe logo as **SVG** (best screenshot fidelity; avoids async image load races in `domToBlob`). Use the monospace wordmark identity already used in nav.
- Add the URL/handle: `typecafe.app` (or the canonical domain) as a footer/corner element. If a share link exists, optionally use the share URL; otherwise the base domain. Keep it legible at social-feed scale.
- These elements appear **only** on `ShareableScoreImage`, never on the in-app dashboard.

### 4. Curate which pieces the shareable card shows (highlight vs include)
Fixed-size card can't hold everything. Curate:
- **Hero:** WPM (big), with Accuracy as the key supporting stat.
- **Secondary:** Net WPM, Duration, mode/submode/language, date.
- **Signature visual:** the WPM-over-time sparkline (distinctive — keep, simplified/smaller, maybe without axes).
- **Identity:** logo, URL, username/avatar.
- **Optional v2 brag context:** percentile / "faster than X%" / personal-best badge / "beat my score" hook (flagged as future — needs ranking data).
- **Probably omit:** full performance-details table, full typed-text panel (a short highlighted snippet at most).

### 5. Make WPM the hero
- In the dashboard's metric row, give WPM visual dominance (larger type / accent treatment) over Accuracy / Duration / Net WPM, which are currently all identical size and color.
- Carry the same hierarchy into the shareable card.

### 6. Universal aspect ratio for the shareable card
- Render at a fixed pixel size with a standard social ratio. **Recommend 1200×630 (1.91:1, the OG/Twitter/Facebook standard).** Consider also offering 1080×1080 (square, Instagram) as a v2 variant.
- Dimensions are fixed in the component (not viewport-relative) so output is deterministic.

### 7. Move "Try TypeCafe" to the leftmost button + match card colors
- Reorder the action buttons so "Try TypeCafe" is **leftmost**.
- Restyle it to match the card's theme palette (consistent with the other action buttons / theme colors) rather than the current bordered/ghost look.
- **Open question:** today it only shows on the readonly shared page. Confirm whether it should also appear on the in-app finish view, or remain readonly-only but reordered. (Recommend: keep readonly-only; "Test Again" already covers the in-app case.)

---

## Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **Aspect ratio** | **1200×630 (OG/1.91:1) only for v1.** 1080×1080 square deferred to v2. | The OG ratio unfurls cleanly on Twitter/Discord/Slack/Facebook and doubles as the OG meta image later. Ship one canvas first. |
| 2 | **Error highlighting style** | **Color wrong typed chars only**, using the theme **error** color (`text-error`, with a faint `bg-error/20` underlay for contrast on busy themes). | Only needs the correctness flag we're already adding. Showing expected-vs-typed would require persisting the target text — deferred to v2. |
| 3 | **"Try TypeCafe" placement** | **Readonly shared page only, reordered leftmost + themed.** Not added to the in-app finish view. | In-app already has "Test Again"; "Try TypeCafe" is meaningless when you're already in the app. |
| 4 | **Anonymous username** | Signed-in → `@username`. Signed-out/anonymous → label **"Guest"** (no `@`), with the **URL kept prominent** so the card still markets. | Never show a broken/empty handle; the URL carries the call-to-action regardless. |
| 5 | **Server-side OG image** | **v2, not now.** v1 ships client-side screenshot + download. | Keeps v1 scope tight; OG meta is purely additive and can reuse the same card design. |
| 6 | **Screenshot without an account** | **Allowed.** Screenshot + download work for signed-out/unsaved scores; only *link* sharing requires sign-in. | Lowest-friction viral path — don't gate the image behind auth. |

## Committed scope (every gap folded in, tagged)

**v1 — in scope now:**
- **Per-character correctness data chain** (prerequisite): capture in `Typer`, extend `ScoreSnapshot`, persist in share snapshot, update `isScoreSnapshot` validation.
- **Graceful degradation for legacy shares:** snapshots without a correctness mask render as plain text (no highlight); old `/score/[slug]` links must not break.
- **Off-screen render technique:** off-viewport absolute positioning (never `display:none`, which yields a blank capture).
- **Font embedding in screenshots:** verify `modern-screenshot` embeds the monospace wordmark + mono numerals (use `fontEmbedCSS` / font preloading as needed) so the captured image keeps the TypeCafe identity. Add a quick visual check to the QA step.
- **Mobile download fallback:** `navigator.clipboard.write(image)` is unsupported on many mobile browsers. Add a **download/save image** action so mobile users (a big slice of this audience) can share. Surface it whenever clipboard-image is `unsupported`.
- **Long typed-text truncation:** the shareable card truncates the typed snippet (ellipsis) so it never overflows the fixed canvas; the dashboard keeps its scrollable full-text panel.
- **Anonymous username handling:** per locked decision #4; in-app finish path sources `username` from the session.
- **Tests:** update `tests/e2e/shared-score.spec.ts` and any unit tests for the split components, reordered buttons, and new capture target.

**v2 — explicitly deferred:**
- **OG/meta image for link unfurls:** server-side render (e.g. `@vercel/og` / satori) reusing the card design so pasted links preview well.
- **Square 1080×1080 variant** for Instagram.
- **Brag framing:** percentile / "faster than X%" / personal-best badge / "beat my score" hook (needs ranking data) to lift share rate beyond a bare WPM number.
- **Expected-vs-typed diff** in error highlighting (needs target-text persistence).

---

## Suggested sequencing

1. **Data foundation (v1):** capture per-character correctness in `Typer`; extend `ScoreSnapshot`; persist + validate; degrade gracefully for legacy shares.
2. **Dashboard polish (v1):** wrong-char error highlighting in the typed-text panel; make WPM the hero.
3. **New `ShareableScoreImage` component (v1):** fixed 1200×630, curated content, logo + URL + username (Guest fallback), simplified sparkline, themed; rendered off-screen with embedded fonts.
4. **Rewire capture/share (v1):** target the off-screen shareable card; add the mobile download fallback; keep screenshot available without an account.
5. **Button reorder/restyle (v1):** "Try TypeCafe" leftmost + themed on the readonly page.
6. **Update tests (v1).**
7. **v2:** OG image meta for link unfurls; square variant; percentile/PB brag framing; expected-vs-typed diff.
