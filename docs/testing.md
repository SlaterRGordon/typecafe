# Testing

TypeCafe uses Playwright for browser-level end-to-end testing. The suite covers the typing flow, settings, learn progress, leaderboard/profile filters, modal focus behavior, contact form behavior, static routes, and visual QA screenshots.

## First-Time Setup

Install dependencies:

```bash
npm install
```

Install the Playwright Chromium browser:

```bash
npx playwright install chromium
```

The Playwright config starts the Next dev server automatically, so you usually do not need to run `npm run dev` separately.

## Commands

Run the full desktop and mobile suite:

```bash
npm run test:e2e
```

Open the interactive Playwright UI:

```bash
npm run test:e2e:ui
```

Open the last HTML report:

```bash
npm run test:e2e:report
```

Run one spec file:

```bash
npm run test:e2e -- tests/e2e/modal-focus.spec.ts
```

Run one project:

```bash
npm run test:e2e -- --project=desktop-chromium
npm run test:e2e -- --project=mobile-chromium
```

Run tests matching a title:

```bash
npm run test:e2e -- -g "settings modal pauses typing"
```

Debug a test interactively:

```bash
npx playwright test tests/e2e/modal-focus.spec.ts --debug
```

Run with a visible browser:

```bash
npx playwright test tests/e2e/home.spec.ts --headed
```

## Reports And Artifacts

Playwright writes generated output to:

- `playwright-report/` for HTML reports
- `test-results/` for failure screenshots, traces, videos, and explicit screenshot artifacts

These paths are ignored by git.

The config keeps:

- screenshots on failure
- videos on failure
- traces on first retry

Visual QA tests also save explicit screenshots for agent or human inspection.

## Test Structure

Specs live in `tests/e2e/`:

- `home.spec.ts`: core typing and settings behavior
- `learn.spec.ts`: guest progress, completion, failure, difficulty, and signed-in import behavior
- `leaderboard.spec.ts`: mocked leaderboard filters
- `public-profile.spec.ts`: mocked public profile filters and stats
- `profile-auth.spec.ts`: mocked authenticated profile, edit, and delete-confirmation flows
- `modal-focus.spec.ts`: modal/focus behavior around typing
- `navigation.spec.ts`: desktop/mobile navigation
- `contact.spec.ts`: contact form validation, success, and failure
- `static-routes.spec.ts`: support/privacy/terms/sitemap route checks
- `routes.spec.ts`: lightweight public-route smoke tests
- `visual-qa.spec.ts`: screenshot artifacts for key pages/states

Helpers live in `tests/e2e/helpers/`:

- `typing.ts`: reads and types the active generated character/text
- `select.ts`: interacts with `react-select`
- `trpc.ts`: mocks tRPC and NextAuth session responses in the browser

## Mocking Patterns

Most data-heavy tests use browser-level route mocks instead of a live database:

- `mockTrpc(page)` intercepts `/api/trpc/**`.
- `mockAuthenticatedSession(page)` intercepts `/api/auth/session`.
- Contact tests intercept `/api/contact`.

This keeps the suite deterministic and avoids requiring seeded users, scores, or external email credentials.

## Writing New Tests

Prefer user-facing selectors:

```ts
await page.getByRole("button", { name: "Leaderboard" }).click();
```

Use stable app IDs for the typing surface:

```ts
await expect(page.locator("#words .char").first()).toBeVisible();
await expect(page.locator("#c0")).toHaveClass(/active-char/);
```

Use helpers for generated typing text:

```ts
import { typeCurrentCharacter } from "./helpers/typing";

await typeCurrentCharacter(page);
```

Use explicit screenshot artifacts for visual QA, not strict snapshots, unless the surface is stable enough:

```ts
await page.screenshot({
  path: testInfo.outputPath("home.png"),
  fullPage: true,
});
```

## Known Notes

- One mobile test is intentionally skipped because desktop secondary navigation is not present in the mobile layout.
- The dev server may print a PostgreSQL SSL-mode warning during tests. It does not affect Playwright results.
- `npm run lint` currently passes with existing warnings in unrelated app files.
