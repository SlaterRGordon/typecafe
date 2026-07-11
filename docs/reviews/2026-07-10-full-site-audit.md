# Full-site audit — 2026-07-10

**Reviewed commit:** `d76d53c` (`development`)

**Scope:** product loop, numerical correctness, security/privacy, UI/UX,
accessibility, performance, architecture, build quality, desktop/mobile journeys,
and durable project context.

## Remediation status — 2026-07-11

All ten slices in the recommended sequence are implemented and committed on
`development`. This table is the compact handoff; the findings below preserve the
original evidence and rationale.

| Slice | Outcome | Commit |
|---|---|---|
| Trust | Server derives stored metrics and ranking eligibility from Test evidence | `757bcfd` |
| Privacy | Explicit public/private User selects; unused exposure procedures removed | `4f178a6` |
| Numbers | Net WPM is canonical in Tests and versioned daily rollups | `5eedd9c` |
| Abuse | Durable public-write quotas, strict payloads, guest expiry, safe contact mail | `6e5779c` |
| Language | Active composed language is derived synchronously; German race is pinned | `7ee6c79` |
| Quality | Active-tree lint is clean and the default gate ignores detached worktrees | `7ee6c79` |
| Coach-first results | Diagnosis and its action precede charts/details, including mobile | `f8e4841` |
| Mobile/accessibility | Header fits, targets are 44px, controls are semantic and keyboard-safe | `6ee9a3e` |
| Performance | Global editors load on intent, Roboto Mono is local, route budget is enforced | `169eb56` |
| Positioning | Search, social, structured-data, share, and manifest copy lead with coaching | `c211cda` |

The P2 scaling candidates (profile/read consolidation and database-side
leaderboard pagination), icon-system consolidation, and the tracked NextAuth v4
transitive advisory remain follow-up work; they were not part of these ten slices.

## Executive summary

TypeCafe already has a differentiated product core: the Test timeline feeds a
Diagnosis, Findings lead to Drills, and re-measurement can show a Delta. The pure
math layer is unusually well tested (541 passing unit tests), the production build
passes, and isolated typing latency is excellent.

The highest-risk work is not another feature. It is making the evidence and write
surfaces trustworthy:

1. derive or verify ranked Test metrics on the server;
2. stop exposing private User fields through tRPC;
3. correct remaining non-canonical WPM rankings/rollups;
4. protect public database/email write endpoints from abuse;
5. fix the reproducible language-generation race.

After those, move the Diagnosis action above secondary result detail, repair the
mobile header and picker semantics, and reduce initial-route weight.

## Method and evidence

- Read the vision, domain glossary, active feature ledgers, five ADRs, and all
  three architecture-review rounds.
- Traced the Test, Diagnosis → Drill → re-measure, guest import, Train, Progress,
  profile, sharing, layout, and language paths.
- Inspected the current screenshot tour for desktop and Pixel 7 mobile.
- Ran unit, lint, production build, dependency audit, and the complete Playwright
  matrix; reran failures on the expected port with one worker.
- Inspected production build chunks and server query shapes.

Verification results:

| Check | Result |
|---|---|
| Unit | 47 files, 541/541 tests passed |
| Production build | passed; 18 static pages generated |
| Scoped lint | failed: 4 errors, 12 warnings |
| Default lint command | failed: also scans ignored `worktrees/`, producing 236 parser errors |
| Full E2E, 8 workers, port 3001 | 423 passed, 10 failed, 19 skipped |
| Isolated failure rerun, 1 worker, port 3000 | 26 passed, 1 failed, 3 skipped |
| Timed typing perf, CPU x4 | key→frame p95 16.8 ms; 0 frames over 50 ms |
| Practice typing perf, CPU x4 | key→frame p95 17.5 ms; 1 frame over 50 ms |
| Dependency audit | 2 moderate advisories through `next-auth -> uuid@8.3.2` |

Seven first-run E2E failures were test-environment artifacts: share assertions
hard-code port 3000 while the full audit used port 3001. Two performance failures
were parallel-load flakes and passed far under budget in isolation. One Practice
language failure remains reproducible on desktop.

## Prioritized findings

### P0 — Ranked Test metrics are client-authoritative

**Evidence:** `test.create` accepts client-supplied `speed`, `accuracy`, `score`,
`count`, `ranked`, and a timeline. The server checks sample size and whether the
timeline looks machine-generated, but never derives the submitted metrics from
that timeline or checks that they agree. The numeric inputs are not bounded.

**Impact:** a modified client can submit a human-looking timeline with arbitrary
WPM/accuracy and enter leaderboards, percentiles, personal Bests, and progress.
This breaks the product's core trust promise.

**Recommendation:** create one pure Test-evidence verification module at the
write seam. Derive every metric possible from the encoded timeline and authoritative
TestType/config; reject material mismatches; compute ranking eligibility and the
stored score server-side. Pin timed, words, corrections, impossible cadence, and
forged-metric cases with unit and router-level tests.

**Files:** `src/server/api/routers/test.ts`, `src/lib/stats.ts`,
`src/lib/antiCheat.ts`, `src/components/typer/hooks/useTestPersistence.ts`.

### P0 — User responses expose fields that should never leave the server

**Evidence:** `user.get` returns the full Prisma User row, including the password
hash. `user.update` and the unused `createUser` mutation also return full rows.
Unused `getUserByUsername`/`getUserByEmail` procedures select email and verification
status for arbitrary users available to any authenticated caller.

**Impact:** password hashes and private account data appear in tRPC responses and
browser/network tooling. Even an owner's own hash should never cross this seam;
the unused lookup procedures expand the privacy surface.

**Recommendation:** define explicit safe selects for self, public profile, and
mutation results; return only those shapes. Delete unused procedures. Add router
tests that assert `password`, email, and verification fields are absent from every
non-admin response.

**Files:** `src/server/api/routers/user.ts`, `src/pages/profile.tsx`,
`src/components/profile/edit/Edit.tsx`.

### P0 — Two user-visible WPM paths still use non-canonical math

**Evidence:** `getBestScore` and `getPercentile` order/filter by persisted
`score = raw speed × accuracy`, while the UI displays canonical net WPM
(`raw × (2a - 1)`). A lower-net run can therefore be selected as “Top speed” or
used for percentile placement. Separately, an imported/historical daily rollup
stores average raw WPM and average accuracy, then computes
`netFromRaw(avgRaw, avgAccuracy)`. In general, the product of averages is not the
average of per-Test net WPM.

**Impact:** profile Best/percentile and rollup-only Progress days can be wrong.
These are “prove improvement” numbers.

**Recommendation:** use `netOf`/`bestNetPerUser` for profile reads, or persist an
authoritative derived net value if query volume demands it. Store `totalNetWpm`
or `avgNetWpm` in daily aggregates and merge that directly. Add adversarial tests
where raw speed and accuracy trade off.

**Files:** `src/server/api/routers/test.ts`, `src/lib/netScores.ts`,
`src/lib/dailyRollup.ts`, `src/lib/progress.ts`.

### P1 — Public write endpoints can exhaust free-tier resources

**Evidence:** `scoreShare.createGuestScore` and `createBeatRun` are unauthenticated,
unthrottled database writes accepting large snapshots (including up to 20,000
characters and large arrays) with no expiry. `/api/contact` is an unauthenticated
SMTP send with unchecked body types/lengths and no abuse control; it creates a new
transporter per request. `EMAIL_USER`/`EMAIL_PASS` are not in environment validation.

**Impact:** cheap automated traffic can grow Postgres indefinitely or spam/disable
the email account, directly conflicting with the free-tier constraint.

**Recommendation:** set strict snapshot byte/array limits, reuse an existing guest
share when possible, add a free in-scope abuse budget (for example a hashed request
key plus short rolling DB window), and establish retention/expiry. Validate contact
input server-side, add a honeypot and request budget, use a fixed sender with
`replyTo`, and validate/disable the endpoint when SMTP is unconfigured.

**Files:** `src/server/api/routers/scoreShare.ts`, `src/pages/api/contact.ts`,
`src/env.mjs`.

### P1 — Registration and profile validation exists mainly in the client

**Evidence:** server schemas accept unrestricted strings for email, username,
password, bio, and link. Registration checks exact-case uniqueness while the UI's
availability query is case-insensitive. Profile links are rendered directly into
`href` without a server-enforced HTTPS scheme.

**Impact:** callers can bypass password/email rules, create visually colliding
usernames, store oversized content, and publish unsafe or misleading links.

**Recommendation:** make one shared Zod domain schema authoritative on the server:
normalize email, set username character/length rules, enforce password length,
bound bio, accept only `https:` profile links, and return field-level errors. Back
case-insensitive identity with a normalized unique column or database index.

**Files:** `src/server/api/routers/user.ts`, `src/components/SignInModal.tsx`,
`src/components/profile/edit/Edit.tsx`.

### P1 — Practice can generate the wrong language after a setting transition

**Evidence:** the desktop E2E consistently reaches German/QWERTZ with eight active
keys, then regenerates a long English Practice list instead of German text containing
`für`. Mobile passes. `globalLanguage` is authoritative, but a side effect copies it
into the separately persisted composed `settings.language`. Word loading also uses
an ordering-sensitive `ensureLanguageLoaded()` + synchronous `getWords()` pair whose
fallback is silently English.

**Impact:** displayed layout/language and generated coaching material can disagree.
The user can practice the wrong corpus while the UI says German.

**Recommendation:** derive the active composed language synchronously from the
global base plus stored size for every render; persist it as an effect, not as the
read source. Deepen vocabulary loading so a caller cannot observe another language
while a requested list is unresolved. Keep the failing E2E as the regression test.

**Files:** `src/pages/index.tsx`, `src/hooks/useLanguage.ts`,
`src/hooks/useTestSettings.ts`, `src/components/typer/utils.tsx`,
`src/components/typer/hooks/useTestText.ts`.

### P1 — Results bury the product's differentiator

**Evidence:** desktop and mobile result screenshots place four metric cards and
the full chart/detail section before Diagnosis. On mobile, the first viewport is
almost entirely WPM/accuracy/duration/raw WPM; the Finding and Drill action are
several scrolls below.

**Impact:** the most important moment looks like a polished typing-test result,
not a coach. Many users will never reach the cure promised before the Test.

**Recommendation:** lead with net WPM plus the top actionable Finding and its Drill
button. Collapse raw WPM, duration, chart, typed text, and secondary details behind
“See test details” or place them after the coach action. Preserve the full evidence
for users who want it.

**Files:** `src/components/scores/ShareableScoreCard.tsx`.

### P1 — Mobile header is clipped and its controls are undersized

**Evidence:** Pixel 7 screenshots visibly cut off Log In/Logout on the right. The
fixed header tries to fit the brand plus language, layout, colour, and auth controls
in one row while the page root hides overflow. Most controls use 32px `btn-sm`
targets, below the 44px touch target guideline.

**Impact:** the auth action can be partially unreadable/unreachable, and primary
global settings are harder to tap accurately.

**Recommendation:** use a compact mobile header with brand plus one labelled
settings/menu trigger; keep language/layout/colour/auth inside the sheet/menu. Make
all mobile targets at least 44×44px and add an E2E invariant for no horizontal
clipping at 320/375/412px.

**Files:** `src/components/navigation/TopNavigation.tsx`,
`src/components/Layout.tsx`, `src/styles/globals.css`.

### P1 — Global pickers and theme controls lack robust semantics

**Evidence:** Language/Layout triggers are focusable `<label>` elements without
button/menu-button roles or explicit open state. `ThemeSwitch` nests a checkbox and
label inside a button. A custom-theme delete control is a `span role="button"`
inside another button and has no keyboard handler. Current E2E covers mouse clicks,
not keyboard operation of these controls.

**Impact:** keyboard and screen-reader users get ambiguous roles, focus behaviour,
and activation. Nested interactive controls are invalid HTML.

**Recommendation:** build one accessible picker module using real buttons, explicit
`aria-expanded`/`aria-controls`, Escape/outside close, arrow-key movement, and focus
return. Use standalone real buttons for theme toggle and delete. Add keyboard-only
journey tests.

**Files:** `components/navigation/LanguageMenu.tsx`, `LayoutMenu.tsx`,
`components/colors/ThemeSwitch.tsx`, `CustomColorButton.tsx`.

### P1 — The default SEO/share copy contradicts the product vision

**Evidence:** global title/OG/Twitter/manifest/JSON-LD copy calls TypeCafe a
“user-centered typing test” and “Test your typing speed.” The vision explicitly says
competing as a typing test loses; TypeCafe is the coach that diagnoses and improves.

**Impact:** search results and unfurls erase the differentiator before a visitor
arrives.

**Recommendation:** make the canonical message “TypeCafe — the typing coach that
makes you faster,” with Measure → Diagnose → Drill → re-measure language. Keep page
metadata specific, and make `TypeCafe` spelling consistent.

**Files:** `src/pages/_app.tsx`, `src/pages/index.tsx`, `public/manifest.json`.

### P1 — The lint gate is both noisy and genuinely red

**Evidence:** `npm run lint` scans the ignored `worktrees/` tree even though the
TypeScript project excludes it, producing hundreds of parser errors. After scoping
to the active tree, Train still has four React immutability errors, plus hook
dependency warnings in Keyboard, home, Progress, and Train.

**Impact:** the gate cannot distinguish current defects from workspace noise, so
real warnings are easy to ignore.

**Recommendation:** add `worktrees/**` to ESLint ignores, then resolve every active
tree error. Treat hook dependency warnings as correctness investigations, not
mechanical dependency additions. Make scoped lint part of the verified commit gate.

**Files:** `eslint.config.mjs`, `src/pages/train.tsx`, `src/pages/index.tsx`,
`src/pages/progress.tsx`, `src/components/typer/Keyboard.tsx`.

### P2 — Initial route work includes globally mounted modal/editor code

**Evidence:** the home + app build manifest references about 1,083 KB of raw
JS/CSS across 19 files (not compressed). A 99.9 KB chunk containing `react-colorful`
is on the home route because `ColorModal` mounts globally. Global CSS is 182 KB.
Roboto Mono is loaded through CSS `@import`; Material Symbols use
`display=block`; Font Awesome comes from another CDN stylesheet. Lint flags the
blocking font display.

**Impact:** extra parse/stylesheet/font work delays first interaction on the core
typing surface, especially mobile/slow networks. External fonts also add failure
and privacy dependencies.

**Recommendation:** dynamically load colour/profile/auth modal implementations on
first open, use local/Next font loading with `swap`, and audit whether one icon
system can replace the two external icon fonts. Establish compressed route budgets
in CI before adding a bundle-analyzer dependency.

**Files:** `src/components/navigation/Navigation.tsx`,
`src/components/colors/ColorModal.tsx`, `src/pages/_document.tsx`,
`src/styles/globals.css`.

### P2 — Profile, percentile, leaderboard, and Challenge reads will scale poorly

**Evidence:** ProfileView coordinates roughly a dozen client queries and waits for
all of them before leaving one skeleton. `getPercentile` loads full Test rows twice
only to count distinct users. `getLeaderboard` loads every matching Test and pages
in memory. Challenge improvement runs one 30-day baseline query per candidate.

**Impact:** latency, database egress, and free-tier compute grow with total Tests,
not requested page size. The current pre-launch volume masks this.

**Recommendation:** expose one profile-proof query shaped for the page, select IDs
only where counts are needed, and move distinct-best/pagination work into Postgres
or a derived-on-write table once volume warrants it. Batch Challenge baselines.

**Files:** `src/components/profile/ProfileView.tsx`,
`src/server/api/routers/test.ts`.

### P2 — Console and dependency hygiene need explicit resolution

**Evidence:** SignInModal uses SVG attributes such as `stroke-linecap` instead of
React's `strokeLinecap`, producing runtime warnings. `npm audit` reports a moderate
`uuid@8.3.2` advisory through the current latest NextAuth v4; npm's suggested fix is
an invalid major downgrade to NextAuth v3.

**Impact:** noisy logs hide real errors. The dependency advisory is probably low
reachability here (NextAuth's UUID use is not the vulnerable caller pattern), but it
remains unresolved supply-chain debt.

**Recommendation:** fix JSX attributes and fail E2E on unexpected console warnings.
Record the UUID reachability decision, track the Auth.js migration rather than
running `npm audit fix --force`, and re-check on dependency updates.

**Files:** `src/components/SignInModal.tsx`, `package.json`, `package-lock.json`.

### P2 — Visual coverage captures states but misses layout invariants

**Evidence:** the screenshot tour is extensive, but screenshots are artifacts, not
pixel assertions. Existing navigation tests check labels/order and mouse routing;
they do not check header clipping, touch target size, picker keyboard use, or whether
the primary Diagnosis action appears near the result headline.

**Impact:** visible mobile regressions can ship while the tour and E2E suite remain
mostly green.

**Recommendation:** keep the tour, and add a small set of semantic layout assertions:
no horizontal overflow, every top-level action inside the viewport, 44px mobile
targets, visible focus, keyboard-open/close pickers, and top Finding CTA placement.

**Files:** `tests/e2e/navigation.spec.ts`, `tests/e2e/visual-qa.spec.ts`,
`tests/e2e/screenshots.spec.ts`.

## Recommended sequence

1. **Trust slice:** server-derived Test evidence + ranking regression tests.
2. **Privacy slice:** safe User selects; remove unused exposure procedures.
3. **Numbers slice:** canonical profile Best/percentile and average-net rollups.
4. **Abuse slice:** guest share/contact budgets, limits, retention, env checks.
5. **Language slice:** derived active language + deep vocabulary loading.
6. **Quality slice:** make lint actionable and green.
7. **Coach-first result slice:** top Finding/Drill immediately after WPM.
8. **Mobile/a11y slice:** compact header and semantic picker controls.
9. **Performance slice:** lazy global modals, local fonts/icons, query consolidation.
10. **Positioning slice:** update default metadata and manifest copy.

Each slice should update the relevant E2E and screenshot-tour coverage. Numerical
slices belong in `src/lib/` as pure functions with adversarial unit tests.

## Architecture deepening candidates

The visual architecture report for this audit lives outside the repository in the
OS temp directory. Its candidates are:

1. **Verify Test evidence at the write seam — Strong.** One deep pure module owns
   derivation, coherence, ranking eligibility, and rejection reasons.
2. **Deepen vocabulary loading and generation — Strong.** Callers stop learning the
   `ensure...` then synchronous `get...` ordering constraint or receiving silent
   English fallback.
3. **Consolidate completion/share lifecycle — Worth exploring.** Home and Challenge
   currently repeat eager result, save upgrade, card-active, share mint, and restart
   state machines.
4. **Collapse profile proof reads — Worth exploring.** One page-shaped server module
   can hide query choreography and return one coherent proof snapshot.

The top recommendation is Test evidence verification because it improves trust,
locality, testability, and ranking integrity at once.
