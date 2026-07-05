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

- [ ] `navigator.share()` where available (mobile sheet, attach the PNG),
  falling back to pre-filled X + Reddit links + copy on desktop.
- [ ] Delta-forward share text when a delta exists.
- [ ] E2e + screenshot-tour coverage.

## C. Index hygiene

- [ ] `noindex,follow` on score/beat/progress share pages.
- [ ] Drop score-share entries from `sitemap.xml.ts` (keep static pages +
  profiles).

## D. Structured data

Home already ships `WebApplication` JSON-LD (`index.tsx`).

- [ ] Add `Organization` + `WebSite` JSON-LD site-wide (`_document`). Skip
  `SearchAction` (no site-search page to back it — flag, don't fake).

## E. Content pages (separate, slow)

The only durable organic-search play; own slice when A–D land.

- [ ] Crawlable descriptive nav links; keyword-bearing H1/intro on home.
- [ ] Lean into how-we-measure / a "how to type faster" angle.
