# Phase 6 — Content & Reach

**Goal:** people who've never heard of TypeCafe find it, and what they find is differentiated on arrival.

Reach amplifies what exists — that's why it's Phase 6. Marketing channels and tactics live in [growth.md](../growth.md); this doc covers only the *product* work that creates reach.

---

## 6.1 Code mode (L) — one mode, three wins

Differentiated (no major competitor does it well), audience-matched (the dev aesthetic), and SEO-aligned ("typing test for programmers" — low difficulty, real volume).

- **Corpus:** curated snippet packs per language (JS/TS, Python, Go, Rust, SQL to start) — real-looking, hand-reviewed short snippets (~20–60 keystrokes each, composable like words), bundled lazy-loaded like language packs
- **Mechanics that matter for code:** symbols and shifted characters dominate (`{} () => :: !==`), indentation handling (leading whitespace auto-skipped or typed — setting, default auto-skip), camelCase/snake_case transitions
- **The coach extends naturally:** `KeyStat`/`TransitionStat` already handle any character — code mode instantly yields "your `{` is 3× slower than your letters", a finding *no other site can produce*. Diagnosis buttons drill symbol grams
- Appears in the Phase 2 typer toolbar if/when added; ranked boards keep code separate from prose
- `/typing-test-for-programmers` lands directly in code mode with crawlable copy

## 6.2 Quote & passage packs (M)

Random top-10k words is the treadmill; passages are the trail run.

- Public-domain quote packs (literature, speeches, programming wisdom), typed as complete passages with punctuation/capitals naturally on
- A "quotes" text source within Words or a passage-length flow (not a new top-level mode unless the toolbar has room and the owner chooses it)
- Passage completion is share-friendly ("typed the Gettysburg Address at 84 WPM")
- Attribution and length filters (short/medium/long); corpus shipped lazy-loaded JSON, community-suggestable later

## 6.3 Language pack pipeline (M)

- Move corpora out of the component tree (`src/data/languages/`, `src/data/ngrams/`) and **lazy-load per language** — the current ~1.3 MB static payload (incl. unused files) becomes on-demand chunks; measurable first-paint win
- `scripts/createGrams.ts` becomes the documented pipeline: new language = word list in → grams + packs out
- Ship 2–3 new languages (German, Portuguese prioritized by typing-community size) to prove the pipeline; learn-mode layouts stay English-first (honest scope)

## 6.4 SEO surfaces (M)

Product pages, not blog posts (writing cadence is the owner's call; these are buildable):

- `/how-we-measure` (Phase 0) — already the calculation-keywords magnet
- `/typing-test-for-programmers`, `/typing-practice/[skill]` (e.g. `/typing-practice/bigrams`, `/numbers`, `/symbols`) — each a real drill config with crawlable explanation, not doorway pages
- "What is a good typing speed" page seeded with published research numbers; **switches to our own anonymized distribution only when volume justifies it (Phase 7 honesty rule — no fake authority)**
- Technical hygiene: per-page meta/canonicals audit, sitemap already exists

## 6.5 Embeddable widget (M)

- `/embed/[username]` — iframe-safe card: current WPM, 30-day delta, streak (delta-first, per the vision)
- Static-render friendly, themable via query params, "Powered by TypeCafe" backlink
- Copy-paste snippet on `/progress`; README-friendly SVG variant (`/badge/[username].svg`) for GitHub profiles — devs adding it = standing backlinks

## 6.6 Deliberately deferred

- **Layout-transition coaching** (QWERTY→Colemak) → Phase 7: real niche, but it needs per-layout key mapping through the whole stats pipeline — a structural change that shouldn't ride along casually
- **Hardware/QMK tie-ins** → Phase 7: needs community standing first
- **Blog/content marketing** → growth.md; owner-paced

## Acceptance

- [ ] Code mode: full loop works — test → "your `{` is slow" → drill symbols → re-measure
- [ ] Initial JS bundle drops measurably (corpus lazy-loading verified in build output)
- [ ] Adding a quote pack or language is a documented, data-only change (no component edits)
- [ ] Embed renders correctly inside a sandboxed iframe and as SVG badge
- [ ] SEO pages pass Lighthouse SEO ≥ 95, indexed (owner: Search Console)
- [ ] Screenshot tour: code mode (idle/mid/diagnosis), quotes source, embed card, each SEO landing

**Owner's part:** review snippet packs for taste (agent-generated corpora need a human eye), Search Console setup, decide blog cadence, seed the badge on your own GitHub profile.
