# Playwright Test Plan

## Goals

- Cover the core TypeCafe user flows with browser-level tests that future agents can run and inspect.
- Save useful artifacts for debugging: traces on retry, screenshots and videos on failure, and intentional screenshots for visual QA when helpful.
- Keep the first suite focused on high-signal product behavior instead of exhaustive snapshots.

## Tooling

- Config: `playwright.config.ts`
- Specs: `tests/e2e/**/*.spec.ts`
- Command: `npm run test:e2e`
- UI runner: `npm run test:e2e:ui`
- Report: `npm run test:e2e:report`
- Projects: desktop Chromium and mobile Chromium
- Artifacts:
  - screenshots on failure
  - video on failure
  - trace on first retry
  - optional explicit screenshots via `testInfo.outputPath(...)`

## Selector Conventions

- Prefer stable IDs already present in the app, such as `#typer`, `#words`, `#input`, `#configModal`, and `#c0`.
- Prefer accessible role/name selectors for user-facing buttons, labels, headings, and form fields.
- Add `data-testid` only when the app does not expose a stable or accessible selector.
- Avoid coupling tests to random generated typing text beyond reading the current active character and typing it.

## Priority 1: Core Typing

- Home page loads and renders generated typing text.
- Typing the active character marks it correct and advances the active cursor.
- Incorrect typing marks a character incorrect and can be corrected with Backspace.
- The restart button resets typed state and returns the cursor to the first character.
- The timer starts after typing begins.
- Typing is ignored or blurred while settings, color, sign-in, or username modals are open.

Why: this is the primary product behavior. It depends on generated text, DOM-rendered characters, global key handling, timer state, and restart behavior.

Implemented first:

- Home text renders, correct typing advances the active cursor, restart resets typed state, and screenshot artifacts are saved.
- Modal focus tests verify settings, color, and sign-in modals pause typing while open and return focus where applicable.

## Priority 1: Settings

- Settings modal opens from the home page.
- Timed mode supports 15, 30, 60, and 120 seconds.
- Words mode supports 10, 25, 50, and 100 words.
- Language selection supports English, French, Hindi, Chinese, and Spanish.
- Practice mode shows the live keyboard.
- Grams mode exposes source, scope, combinations, repetitions, WPM threshold, and accuracy threshold controls.
- Relaxed mode renders typing text without the timed countdown.
- Live stats and live keyboard toggles update the visible UI.

Why: settings change the state that drives text generation, timers, stats, and keyboard display.

Implemented first:

- Phase 2 target: the typer toolbar switches Timed, Words, Grams, Practice, and Relaxed modes.
- Timed and Words counts, custom length, language selection, settings dropdown behavior, grams threshold validation, live stats toggle, and live keyboard toggle are covered.

## Priority 1: Learn

- `/learn` loads Easy / Level 1 by default.
- Required speed, required accuracy, and target keys render.
- Unauthenticated users see the sign-in prompt.
- Completing a level saves local progress and unlocks the next eligible level.
- Failing level requirements shows a warning and does not unlock the next level.
- Difficulty changes recalculate locked/unlocked levels.
- Signed-in users can import device progress when both device and account progress exist.

Implemented first:

- Guest learning state renders required speed, required accuracy, target keys, and the keyboard.
- Seeded guest local progress selects the next unlocked level.
- Completing Level 1 as a guest writes `typecafe.learnProgress.easy` and shows the device-progress warning.
- Failed completion warns and does not save progress.
- Difficulty changes update the visible requirements.
- Signed-in import prompt appears when device and account progress exist; importing clears device progress and shows success.

Why: learn mode combines typing, persistence, locking logic, account state, and localStorage.

## Priority 2: Leaderboard And Profiles

- `/leaderboard` loads with default filters.
- Language, Timed/Words mode, count, and date-range filters update the displayed scores query.
- `/profile` redirects unauthenticated users to `/`.
- Authenticated profile shows user details, stats, activity, best scores, and edit/delete modals.
- `/profile/[username]` renders public user data or a graceful missing-user state.

Implemented first:

- Leaderboard tests mock tRPC responses and cover default score rendering, timed count changes, words mode count changes, language changes, and date-range changes.
- Public profile tests mock profile, stats, activity, and score responses, then verify profile content and best-score filter changes.
- `/profile` redirects unauthenticated users to `/`.
- Authenticated profile tests mock session/tRPC state, verify profile data/stats/scores, edit profile fields, and open/cancel the delete confirmation modal.

Why: these pages depend on API data, auth state, and chained filter controls.

## Priority 2: Navigation, Theme, And Modals

- Desktop and mobile navigation links reach the expected routes.
- Login modal opens and closes.
- Color/theme modal opens, color changes apply, and choices persist after reload.
- Modal focus state does not break typing focus after close.

Why: TypeCafe uses global modals and global keyboard listeners across pages.

Implemented first:

- Primary navigation routes through Home, Learn, and Leaderboard on desktop and mobile.
- Desktop secondary navigation reaches Support, Contact, Privacy Policy, and Terms.
- Settings, color, and sign-in modals pause typing while open.
- Settings and color modals return typing focus after close.
- Color preset changes persist in localStorage after reload.

## Priority 3: Secondary Routes

- `/support`, `/contact`, `/privacy-policy`, and `/terms-and-conditions` render key content.
- Contact form validates required fields.
- Contact form shows success and failure states with mocked `/api/contact`.
- `sitemap.xml` responds successfully.

Why: these are lower-risk but cheap to cover with smoke and form tests.

Implemented first:

- Static route smoke tests cover `/support`, `/contact`, `/privacy-policy`, `/terms-and-conditions`, and `/sitemap.xml`.
- Contact form tests cover required/browser validation, mocked success with form reset, and mocked failure while preserving user input.
- Support, privacy, and terms link checks cover external/contact links and mobile-safe horizontal overflow.

## Visual QA

Start with screenshots for:

- Home desktop and mobile after text renders.
- Home with settings dropdown open after Phase 2; legacy settings modal open before then.
- Home with live keyboard enabled.
- Learn desktop and mobile.
- Leaderboard mobile.
- Authenticated profile desktop and mobile.
- Color/theme modal open.

Use strict `toHaveScreenshot` only for stable surfaces. Prefer explicit saved screenshots for agent inspection on dynamic pages.

Implemented first:

- Explicit screenshot artifacts are saved for home default, settings dropdown/modal, live keyboard, color modal, learn, leaderboard, and authenticated profile across configured desktop/mobile projects.

## Agent Prompts

- Implement the Learn page local-progress Playwright tests described in this plan. Use localStorage setup where possible and update this document with any new selectors or helpers.
- Implement leaderboard filter tests with mocked API responses. Verify timed/words count options change correctly.
- Add visual QA screenshots for home, learn, leaderboard, and profile at desktop and mobile sizes. Avoid strict snapshot assertions until the UI is stable.
- Add auth-state helpers for profile tests using mocked NextAuth/session responses or a dedicated test account strategy.
