# TypeCafe

**Monkeytype tells you how fast you are. TypeCafe makes you faster.**

A free, open-source typing *coach* — not just a typing test. It measures your typing, diagnoses your weak keys, transitions, and words, then builds targeted drills to fix them so you can watch your speed actually climb.

👉 **Try it live: [typecafe.app](https://www.typecafe.app/)**

## What it does

Most typing sites give you a WPM number and stop there. TypeCafe closes the loop: **measure → diagnose → drill → re-measure → see the delta.**

- **Progress page** — tracks your weak keys and letter transitions over time and suggests what to drill next.
- **Practice** — an interactive heatmap of your per-key accuracy. Lock or unlock keys to focus on, or hit *Smart Drill* to auto-select your worst ones.
- **Grams** — drills built from n-grams: the short letter runs like `th`, `ing`, and `tion` that your fingers learn to fire as a single motion.
- **Training** — a level-based mode that starts on the home row and adds keys as you climb, with no-miss, timed, and boss levels where a cursor chases you down the text.
- **Drills** — targeted sets built from your weak keys, weak transitions, and weak words.

Your data is local-first: play as a guest with everything saved in your browser, and it syncs to your account when you sign in.

## Tech stack

Built on the [T3 Stack](https://create.t3.gg/):

- [Next.js](https://nextjs.org) — React framework
- [tRPC](https://trpc.io) — typesafe API
- [Prisma](https://prisma.io) — database ORM
- [NextAuth.js](https://next-auth.js.org) — authentication
- [Tailwind CSS](https://tailwindcss.com) — styling

Scoring and diagnosis math lives in `src/lib/` as pure, unit-tested functions — the numbers are the product, so they're treated like one.

## Running locally

**Prerequisites:** Node `>=22 <25` (24 LTS recommended) and npm `>=11 <12`.

```bash
# 1. Install dependencies
npm install

# 2. Create your env file (see below), then set up the database
npx prisma migrate dev

# 3. Start the dev server
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

### Environment variables

Create a `.env` file in the project root. Minimum to boot the app:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/typecafe"
NEXTAUTH_SECRET="run: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
```

Optional, for features that need them:

```bash
# OAuth sign-in
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Shareable score-card images (Vercel Blob)
BLOB_READ_WRITE_TOKEN=""
```

## Testing

Unit tests (scoring/diagnosis math) with [Vitest](https://vitest.dev):

```bash
npm test
```

End-to-end tests across desktop and mobile Chromium with [Playwright](https://playwright.dev):

```bash
npx playwright install chromium   # first-time setup
npm run test:e2e                  # run the suite
npm run test:e2e:ui               # interactive UI
```

## Feedback & contributions

This is actively being built, and feedback from real typists is the whole point. If something's confusing, missing, or broken — or a drill doesn't match your actual weak spots — please [open an issue](https://github.com/SlaterRGordon/typecafe/issues). PRs welcome too.

## License

[MIT](LICENSE)
