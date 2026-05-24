# TypeCafe project reference

Use this file when a skill points here for paths, stack, or boundaries.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (Pages Router) |
| UI | React 18, Tailwind, DaisyUI, MUI (`@mui/material`) |
| Client state | Redux Toolkit (`src/state/`) |
| API | tRPC v10 (`src/server/api/`) |
| Auth | NextAuth.js (`src/server/auth.ts`, `src/pages/api/auth/`) |
| Database | PostgreSQL via Prisma (`prisma/schema.prisma`) |
| Env validation | Zod in `src/env.mjs` |

## Directory map

```
src/
  pages/              # Next.js routes (index, learn, profile, leaderboard, …)
  components/
    typer/            # Typing surface: Typer, Text, Keyboard, config, languages
    colors/           # Theme and color customization
    profile/          # User profile, stats, activity
    navigation/       # Top, bottom, side nav
  server/
    api/              # tRPC routers and trpc setup
    auth.ts           # NextAuth config
    db.ts             # Prisma client
  state/              # Redux store and slices
  hooks/              # Shared hooks (e.g. timer)
  utils/              # Client helpers and hooks
prisma/               # Schema and migrations
public/               # Static assets
```

## Import alias

TypeScript path alias: `~/` → `src/` (e.g. `~/components/typer/Typer`).

## Checks

```bash
npm run lint    # ESLint (next lint)
npm run build   # Production build (runs prisma generate via postinstall)
```

There is no `npm test` script in `package.json` today; call out manual verification when tests are absent.

## Sensitive / do not commit

- `.env`, `.env.local`, credentials
- Generated Prisma client is fine; do not commit secrets

## Key product surfaces

| Route / area | Primary files |
|--------------|---------------|
| Main typing | `src/pages/index.tsx`, `src/components/typer/` |
| Learn mode | `src/pages/learn.tsx`, `src/components/typer/learn/` |
| Themes | `src/components/colors/`, `color` tRPC router |
| Profile / stats | `src/pages/profile.tsx`, `src/components/profile/` |
| Leaderboard | `src/pages/leaderboard.tsx` |

## tRPC routers

Registered in `src/server/api/root.ts`: `user`, `test`, `color`, `type`, `practiceStats`.

Add new procedures in `src/server/api/routers/` and register the router in `root.ts`.
