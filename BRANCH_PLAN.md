# Branch Plan: Modernize Runtime And Dependencies

## Summary

Modernize TypeCafe from the current Next 14 / React 18 / Prisma 4 stack to current stable runtime and package versions in staged, reviewable commits. The upgrade should prioritize supported LTS/runtime compatibility, predictable deploy behavior, and keeping the existing Pages Router architecture intact.

Current baseline:

- Next `14.2.3`
- React `18.3.1`
- Prisma Client `4.16.2`
- Prisma CLI `4.16.2`
- npm lockfile v3
- Local Node observed as `23.6.1`
- Local npm observed as `11.6.2`
- No repo-level Node pin found

Reference docs:

- [Next 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next upgrade guides](https://nextjs.org/docs/app/guides/upgrading)
- [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Prisma 6 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v6)

## Goals

- Pin a supported Node and npm runtime for local development, CI, and deploys.
- Upgrade Next, React, Prisma, and related tooling to stable supported versions.
- Keep the Pages Router for this branch unless an upgrade requires a narrow compatibility fix.
- Upgrade major dependency groups in small batches so regressions are easy to isolate.
- Preserve existing auth, learn progress, profile, typing, color, and score flows.

## Non-Goals

- Do not migrate from Pages Router to App Router in this branch.
- Do not switch package managers away from npm.
- Do not combine broad UI framework migrations with the core Next/React/runtime upgrade unless required for compatibility.
- Do not create or apply destructive Prisma migrations as part of dependency modernization.

## Phase 1: Baseline

Record the exact starting point before changing package versions.

- Capture `node -v` and `npm -v`.
- Capture direct package versions from `package.json` and resolved versions from `package-lock.json`.
- Run `npm outdated --json` and save the high-risk major upgrade list in the branch notes.
- Run baseline checks:
  - `npm run lint`
  - `npx tsc --noEmit --pretty false`
  - `npm run build:check`
  - `npx prisma generate`
- Note any pre-existing failures before making upgrade commits.

### Baseline Results

Captured on local Windows dev environment:

- `node -v`: `v23.6.1`
- `npm -v`: `11.6.2`
- `package-lock.json`: lockfile version `3`
- `npm run lint`: passed with no warnings or errors
- `npx tsc --noEmit --pretty false`: passed
- `npm run build:check`: passed
- `npx prisma generate`: passed and generated Prisma Client `4.16.2`

Non-failing baseline warnings:

- `npm run build:check` reports outdated `caniuse-lite`.
- `npm run build:check` reports Node experimental type stripping under Node `23.6.1`.

Major upgrade targets reported by `npm outdated --json`:

- Framework: `next` `14.2.3` -> `16.2.6`, `eslint-config-next` `14.2.3` -> `16.2.6`, `react` / `react-dom` `18.3.1` -> `19.2.6`
- Prisma: `prisma` / `@prisma/client` `4.16.2` -> `6.19.3`
- API/data: tRPC packages `10.45.2` -> `11.17.0`, `@tanstack/react-query` `4.36.1` -> `5.100.14`, `superjson` `1.12.2` -> `2.2.6`, `zod` `3.23.8` -> `4.4.3`
- State: `@reduxjs/toolkit` `1.9.7` -> `2.12.0`, `react-redux` `8.1.3` -> `9.3.0`, `redux` `4.2.1` -> `5.0.1`
- UI/styling: `@mui/material` `5.15.17` -> `9.0.1`, `daisyui` `2.52.0` -> `5.5.20`, `tailwindcss` `3.4.3` -> `4.3.0`, `react-activity-calendar` `2.2.8` -> `3.2.0`, `usehooks-ts` `2.16.0` -> `3.1.1`
- Tooling/types: `eslint` `8.57.0` -> `9.39.4`, `@typescript-eslint/*` `5.62.0` -> `8.59.4`, `prettier` `2.8.8` -> `3.8.3`, `typescript` `5.7.3` -> `6.0.3`, React types `18.x` -> `19.x`
- Server utilities: `bcrypt` `5.1.1` -> `6.0.0`, `nodemailer` `6.10.0` -> `8.0.8`

Expected commit:

- `docs(deps): record dependency upgrade baseline`

## Phase 2: Runtime Pinning

Make the runtime explicit so local machines, CI, and deploys do not drift.

- Target Node `24 LTS` by default.
- Fall back to Node `22 LTS` only if the deployment platform or key package compatibility blocks Node 24.
- Add a repo-level runtime pin using `.nvmrc` or `.node-version`.
- Add `package.json` `engines` for Node and npm.
- Document the expected Node/npm versions in `README.md` if the README already has local setup instructions.
- Verify install and build behavior after the pin:
  - `npm install`
  - `npm run lint`
  - `npx tsc --noEmit --pretty false`
  - `npm run build:check`

Expected commit:

- `chore(runtime): pin supported node and npm versions`

### Runtime Pinning Results

- Added `.nvmrc` with Node `24` as the preferred LTS runtime.
- Added `package.json` engines:
  - Node `>=22 <25`
  - npm `>=11 <12`
- Documented Node 24 LTS preference and Node 22 LTS fallback in `README.md`.
- `npm install`: passed and regenerated Prisma Client `4.16.2`.
- `npm run lint`: passed with no warnings or errors.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run build:check`: passed.

Non-failing runtime notes:

- Current shell still runs Node `23.6.1`, which satisfies the temporary engine range but is not the preferred `.nvmrc` runtime.
- `npm install` reported 28 vulnerabilities: 2 low, 10 moderate, 15 high, and 1 critical. Address these during dependency upgrade phases rather than with an unscoped `npm audit fix --force`.

## Phase 3: Next And React

Upgrade the framework layer before app-library majors.

Packages:

- `next`
- `react`
- `react-dom`
- `eslint-config-next`
- `@types/react`
- `@types/react-dom`
- `@types/node`

Implementation notes:

- Upgrade to current stable Next and React releases, not canary versions.
- Follow the official Next 15 and Next 16 upgrade guides in sequence if jumping multiple majors.
- Run official Next and React codemods where applicable.
- Replace `next lint` because it is removed in Next 16. Use direct ESLint CLI scripts instead.
- Confirm the existing Pages Router still builds and routes correctly.
- Review Next config for compatibility with current image config, Turbopack defaults, and deprecated options.
- Fix React 19 type errors, ref behavior changes, and deprecated APIs if they appear.

Verification:

- `npm run lint`
- `npx tsc --noEmit --pretty false`
- `npm run build:check`
- Manual smoke test:
  - `/`
  - `/learn`
  - `/profile`
  - `/profile/[username]`
  - `/support`
  - auth sign-in and sign-out

Expected commit:

- `feat(deps): upgrade next and react`

## Phase 4: Prisma And Server Dependencies

Upgrade database/server packages separately so schema and generated client changes stay isolated.

Packages:

- `prisma`
- `@prisma/client`
- `next-auth` v4 patch release
- `@next-auth/prisma-adapter` if a compatible patch is available
- Server-adjacent dependencies such as `bcrypt`, `nodemailer`, and their types

Implementation notes:

- Upgrade Prisma from v4 to v6 using the official Prisma 6 guide.
- Run `npx prisma generate` after dependency changes.
- Inspect Prisma schema warnings and generated client type changes.
- Do not create or apply destructive migrations.
- Keep Auth.js v5 as a separate migration unless required by compatibility. Patch `next-auth` v4 in this branch.
- Verify auth adapter behavior with credentials, Google, and GitHub providers where credentials are available.

Verification:

- `npx prisma generate`
- `npx tsc --noEmit --pretty false`
- `npm run build:check`
- Manual smoke test:
  - sign in
  - sign out
  - load session-dependent navigation
  - save learn progress
  - save practice stats
  - create/read test results

Expected commit:

- `feat(deps): upgrade prisma and server packages`

## Phase 5: App Libraries

Upgrade application libraries in compatibility groups, with checks after each group.

Suggested groups:

- API/data:
  - `@trpc/client`
  - `@trpc/next`
  - `@trpc/react-query`
  - `@trpc/server`
  - `@tanstack/react-query`
  - `superjson`
  - `zod`
- State:
  - `@reduxjs/toolkit`
  - `react-redux`
  - `redux`
- UI:
  - `@mui/material`
  - `@emotion/react`
  - `@emotion/styled`
  - `react-select`
  - `react-colorful`
  - `react-activity-calendar`
  - `usehooks-ts`
- Tooling:
  - `typescript`
  - `eslint`
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `prettier`
  - `prettier-plugin-tailwindcss`
  - `postcss`
  - `autoprefixer`
- Styling:
  - `tailwindcss`
  - `daisyui`

Implementation notes:

- Upgrade one group at a time.
- Prefer current stable majors unless a group creates a broad migration that should be split out.
- Treat Tailwind v4 and DaisyUI v5 as a separate styling migration if their config/CSS changes become noisy.
- Treat MUI major upgrades as separate if component styling or Emotion compatibility creates broad UI churn.
- Keep lockfile changes grouped with the package changes that caused them.

Verification after each group:

- `npm run lint`
- `npx tsc --noEmit --pretty false`
- `npm run build:check`
- Focused manual smoke tests for affected UI or data flows.

Expected commits:

- `feat(deps): upgrade api data libraries`
- `feat(deps): upgrade state libraries`
- `feat(deps): upgrade ui libraries`
- `chore(deps): upgrade lint and format tooling`
- `feat(deps): upgrade styling tooling`

## Phase 6: QA And Release Readiness

Run a full regression pass after all dependency groups are complete.

Automated checks:

- `npm install`
- `npm run lint`
- `npx tsc --noEmit --pretty false`
- `npm run build:check`
- `npx prisma generate`
- `npm outdated`
- `npm audit`

Manual smoke tests:

- Home page loads.
- Practice typing works on desktop and mobile.
- Learn page loads the correct selected/unlocked level after refresh.
- Learn progress is scoped by difficulty and syncs for signed-in users.
- Sign-in callback returns users to the page they started on.
- Profile and public profile pages load images and stats.
- Color modal shows presets and saved colors correctly.
- Score table loads and paginates/sorts as expected.
- Support page images render.
- Mobile bottom navigation and desktop side navigation still work.

Release checklist:

- Confirm no unreviewed Prisma migration was generated.
- Confirm no secrets or local env files changed.
- Confirm `package-lock.json` reflects only intentional dependency updates.
- Confirm the app runs with the pinned Node version.
- Split commits by phase before merge.

Expected commit:

- `test(deps): verify upgraded dependency stack`

## Rollback Strategy

- Keep each phase in a separate commit or small commit group.
- If a major package migration fails late, revert only that phase and continue with independent patch/minor upgrades.
- If Next/React upgrade fails due to a package incompatibility, pin the incompatible package to its latest compatible version and record the follow-up migration.
- If Prisma upgrade produces risky schema behavior, revert the Prisma phase and ship framework/runtime upgrades first.

## Assumptions

- Target stable major releases, not canary or experimental builds.
- Keep npm and `package-lock.json`.
- Keep Pages Router.
- Keep NextAuth v4 unless Auth.js v5 is required for compatibility.
- Node `24 LTS` is preferred; Node `22 LTS` is acceptable if deployment support requires it.
- Tailwind v4, DaisyUI v5, MUI major upgrades, and Auth.js v5 can become follow-up branches if they are too broad for this dependency-modernization branch.
