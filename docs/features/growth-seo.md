# Growth & SEO

Decided 2026-07-04. Started from two owner problems: (1) Googling "typecafe"
surfaces the `*.vercel.app` URL, not `typecafe.app`, with no sitelinks; (2) how
to generate users. Root causes: Google indexed the vercel host (fixed with a
308 host redirect in `next.config.mjs`), and the viral share loop leaks where
most first-time users are (guests couldn't share).

Vision filter still applies: sharing a *delta* ("+8 WPM this week") proves
someone is getting faster; a bare number doesn't. Prefer deltas on share cards.

Sequenced A→E. Score/beat/progress share pages are social-only — `noindex,follow`
+ out of the sitemap (decided: a young domain fighting for its brand term
shouldn't dilute itself with thousands of thin per-score pages).

## A. Unblock guest sharing

Guests could mint a beat-run share (`createBeatRun`, no auth) but a normal or
daily-challenge score forced "Sign in to save & share" — the loop leaked at the
guest, the largest first-time cohort. A test-less `score` share was also broken
end-to-end (OG builder returned null, page rendered "Score unavailable").

- [x] `scoreShare.createGuestScore` public procedure: snapshot-only `score`
  share carrying its own render fields (mode/language/count), `userId` null-safe.
- [x] OG builder (`server/og/scoreData.ts`) reads test-less `score` shares from
  the snapshot (extended the beat branch); unit test for the guest case.
- [x] `/score/[slug]` renders a test-less snapshot score read-only instead of
  "Score unavailable".
- [x] Home + challenge result cards mint via `createGuestScore` when signed out;
  `canCreateShare` always on, no sign-in wall.
- [x] E2e: guest completes a test and shares without signing in; guest score
  share renders read-only. Screenshot tour: `64-shared-score-guest`.

## B. Share intents

Copy-link/copy-image only today — no native share sheet, no pre-filled targets.

- [x] Native `navigator.share()` button where supported (client-detected to
  avoid a hydration mismatch), plus always-present pre-filled X + Reddit links;
  the existing "Share Score" copy button is unchanged.
- [x] Delta-forward share text: "+N vs my 30-day average" when a ranked delta
  exists, else the plain headline WPM (`buildShareText`).
- [x] E2e: X/Reddit target hrefs (URL + delta text encoded). Screenshot tour
  `18-shared-score` refreshed with the targets row.

## C. Index hygiene

- [x] `noindex,follow` on the share page (`/score/[slug]`, covers score/beat/
  progress). Keeps unfurls working; keeps thin pages out of the index.
- [x] Dropped score-share entries + their DB query from `sitemap.xml.ts` (keeps
  static pages + profiles). E2e asserts the noindex meta.

## D. Structured data

Home already ships `WebApplication` JSON-LD (`index.tsx`).

- [x] Added `Organization` + `WebSite` JSON-LD site-wide (`_document`). Skipped
  `SearchAction` — no site-search endpoint to back it. E2e asserts both blocks.

## E. Content pages (separate, slow)

The only durable organic-search play; own slice when A–D land.

- [x] Keyword-bearing `sr-only` H1 on the home ("the typing test that makes you
  faster") — a real page heading for crawlers/screen readers without touching
  the minimal test-first hero.
- [x] Crawlable nav: converted Side + Bottom navigation from
  `<button onClick={router.push}>` to Next `<Link href>` (the "More" toggle
  stays a button). Googlebot can now follow internal links + pass equity. Role
  changed button→link, so nav selectors across navigation/routes/home/screenshots
  specs were updated; all green on desktop + mobile.
- [x] Content: authored `/how-to-type-faster` — a search-intent guide whose
  advice *is* the TypeCafe loop (accuracy-first → diagnose → drill → re-measure →
  track delta), each section linking the surface that does it. Linked from the
  nav "More" menu (crawlable) and auto-listed in the sitemap. Route-render +
  canonical e2e; screenshot `65-how-to-type-faster`.
- [x] Content: authored `/how-ngrams-work` — an explainer for the "n-grams"
  search intent (what a bigram/trigram is, why chunking common sequences makes
  you faster) that doubles as a Grams-mode demo. Cross-links how-to-type-faster,
  how-we-measure, progress. Nav "More" + auto-sitemap; route-render e2e;
  screenshot `66-how-ngrams-work`.

Also fixed en route: `_app.tsx` hardcoded canonical/og:url to the site root, so
every page self-declared as a duplicate of home — pages couldn't rank. Now
self-canonicalize by path (score pages still override).
