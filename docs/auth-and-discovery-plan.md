# Phase 1 — auth hardening & discovery

Three slices: email verification, more sign-in options, surface /how-we-measure.
Commit each slice separately (suite green). Update auth.spec + screenshot tour.

## Decisions (locked)

1. **Email sender: Brevo** (300/day free forever) over its SMTP, via the
   already-installed `nodemailer`. No new dep. Satisfies locked rule #1 (no spend).
2. **Verification gate: soft** — unverified users sign in normally + see a
   resend banner; only trust-sensitive actions get gated later (password
   reset/ranked writes). No hard sign-in block (avoids mail-delivery lockout).
3. **OAuth: GitHub + Discord** (both free). Apple excluded ($99/yr).

---

## 1. Email verification

State today: `User.emailVerified` + `VerificationToken` model exist; nothing
writes/reads them. `registerUser` makes unverified users; `authorize()` ignores
verification.

- **Sender util** `src/server/email.ts`: one `sendMail(to, subject, html)` over
  nodemailer + Brevo SMTP (`smtp-relay.brevo.com:587`). Add env to
  [env.mjs](src/env.mjs): `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS` (Brevo SMTP key). ponytail: one function, inline HTML string, no
  template lib.
- **Issue token**: in `registerUser` ([user.ts:143](src/server/api/routers/user.ts#L143))
  after create, write a `VerificationToken` (random token, ~24h expiry) and email
  a link to `/api/auth/verify?token=…`. Move token+send into a reusable
  `issueEmailVerification(userId|email)` so resend reuses it.
- **Verify route** `src/pages/api/auth/verify.ts`: look up token, check expiry,
  set `emailVerified = now()`, delete token, redirect to `/?verified=1`.
- **Resend**: tRPC `user.resendVerification` (rate-limit: ignore if already
  verified / token issued <1min ago).
- **OAuth users are pre-verified**: in the `signIn`/`createUser` callback set
  `emailVerified` for Google/GitHub accounts so they never see the banner.
- **Gate — soft**: `authorize()` still returns the user when `!emailVerified`;
  the app shows a resend banner. Leave a `requireVerified` helper stub for the
  later password-reset/ranked gating, but don't block sign-in now.
- **UI**: `UnverifiedBanner` (top of app shell when `session && !emailVerified`)
  with a resend button.

Files: env.mjs, server/email.ts, routers/user.ts, pages/api/auth/verify.ts,
new banner, auth.ts callback.

## 2. More sign-in options

- **GitHub**: already a server provider — just un-comment the button in
  [SignInModal.tsx:201](src/components/SignInModal.tsx#L201). Confirm
  GITHUB_CLIENT_* set in prod. ~free win.
- **Refactor** the OAuth buttons into a `PROVIDERS = [{id,label,icon}]` map +
  `.map()` so adding one is a line, not a copy-paste block.
- **Discord**: add `DiscordProvider` to [auth.ts](src/server/auth.ts#L120),
  `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` to env.mjs, and a map entry +
  Discord icon button.

Files: auth.ts, env.mjs, SignInModal.tsx.

## 3. Surface /how-we-measure

Today only reachable from the score-card "Raw WPM" link. Make it a normal
destination:

- Add **"How we measure"** to the legal/util group at the bottom of both
  [SideNavigation.tsx](src/components/navigation/SideNavigation.tsx#L68) and
  [BottomNavigation.tsx](src/components/navigation/BottomNavigation.tsx) (beside
  Privacy/Terms). Pick an icon (e.g. ruler/info).
- Add a quiet link from the progress dashboard ("How these numbers work →")
  near the hero/footer so the page is discoverable in context.
- Screenshot tour already visits it ([screenshots.spec.ts:591](tests/e2e/screenshots.spec.ts#L591)) —
  add a nav-click assertion in routes/auth e2e instead of direct goto.

Files: SideNavigation.tsx, BottomNavigation.tsx, pages/progress.tsx.

---

## Owner setup checklist (do this side; I wire the code)

Give me the resulting IDs/secrets (or set them in the deploy env). Callback
pattern is always `https://<domain>/api/auth/callback/<provider>`; prod domain
= `typecafe.app`.

- [ ] **Brevo**: create account → verify a sender address (the `EMAIL_FROM`,
      e.g. `noreply@typecafe.app`, ideally domain-verified for deliverability) →
      SMTP & API → generate an **SMTP key**. Provide `SMTP_USER` (Brevo login
      email) + `SMTP_PASS` (the key). Host/port are fixed
      (`smtp-relay.brevo.com` / `587`).
- [ ] **GitHub**: OAuth App (Settings → Developer settings) → callback
      `https://typecafe.app/api/auth/callback/github` → provide
      `GITHUB_CLIENT_ID`/`SECRET`. (Likely already set in prod — confirm not
      placeholder.) Second app for localhost dev callback.
- [ ] **Discord**: developers.discord.com → New Application → OAuth2 → redirect
      `https://typecafe.app/api/auth/callback/discord` (+ localhost) → scopes
      `identify email` → provide `DISCORD_CLIENT_ID`/`SECRET`.

## Build order
1. Discoverability (#3) — smallest, no external deps, ship first.
2. OAuth GitHub+Discord (#2) — needs your apps; code is small.
3. Email verification (#1) — needs Brevo; largest slice.
