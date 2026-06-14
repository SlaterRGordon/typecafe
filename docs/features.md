# TypeCafe — Full Feature Inventory

TypeCafe was first posted to r/MechanicalKeyboards in 2020 with a screenshot of the original UI: https://www.reddit.com/r/MechanicalKeyboards/comments/hrza4j/typecafe_new_minimalistic_typing_typing_test/

TypeCafe was built to combine the best parts of three sites into one: the aesthetic and customization of Monkeytype, the key-isolation practice of Keybr, and a proper n-grams mode for deliberate improvement. None of those sites do all three. TypeCafe does.

---

## Tier 1 — Standout differentiators

These are the features that are either unique to TypeCafe or meaningfully better than what competitors offer.

### Learn mode (27 levels)
A structured path for building touch typing from scratch. Starts at the home row (asdfjkl) and introduces keys progressively across 27 levels until the full alphabet is covered. Three difficulties — Easy (40 WPM), Medium (80 WPM), Hard (120 WPM) — all requiring 90% accuracy to pass. Each key set has three word-count steps (10 → 25 → 50 words) before new keys are introduced. Progress saves locally for guests and syncs to your account when you sign in — local progress auto-imports so nothing is lost.

### N-grams mode
Drills the most common character sequences (bigrams, trigrams, tetragrams) in the language rather than random words. Fully configurable: source, scope (top 50/100/200 grams), combinations per level, repetitions, WPM threshold to advance, and accuracy threshold to advance. The progression system means you don't move on until you've internalized the pattern. Closest thing to deliberate practice a typing app offers.

### Practice mode with key isolation and per-key accuracy
Select any subset of keys and the test generates text using only those characters. Toggle on the keyboard visualization to see per-key accuracy overlaid directly on each key — tracks across sessions so the heatmap reflects your real history, not just the current test. Useful for targeting exactly the letters holding you back.

### Score sharing with social image
One click creates a share link (`/score/[slug]`) that works for anyone without an account. "Copy Screenshot" captures a fixed 1200×630 PNG of the score card — correct for Discord, Twitter, Reddit, iMessage. On mobile it falls back to a file download. Share links generate a proper Open Graph image server-side so every unfurl shows the actual score numbers, not a generic thumbnail.

### Brag framing on results
Results surface a "New personal best" chip when the score beats your previous record in that config, or "Faster than X% of typists" when the percentile is ≥ 60%. Intentionally asymmetric — never shows a discouraging rank to slow typists.

### Activity calendar
GitHub-style contribution grid on every profile page — one square per day over the past 365 days, shaded by test volume. Color intensity uses your active theme's primary color so it matches any palette. Shows total tests for the year.

### Full theme customization
Every color in the UI is adjustable with a live color picker: background, text, primary accent, secondary, neutral. Changes apply instantly. Custom palettes save to your account. Preset schemes included (Dracula, Monokai, etc.).

### Device-to-cloud score recovery
If a guest completes a test and then signs in, the score is automatically saved to their account, a share link is created, the link is copied to clipboard, and they're routed to the score page — nothing lost.

---

## Tier 2 — Expected features done well

Things a serious typing site needs. TypeCafe's implementations are solid but not the main reason to use it.

### Normal mode
Timed (15 / 30 / 60 / 120s, or custom up to 1 hour) or word count (10 / 25 / 50 / 100, or custom up to 5,000). English, French, Spanish. Punctuation and capitals toggles. Custom lengths are marked unranked.

### Detailed results
Raw WPM, net WPM, accuracy, duration, total/correct/incorrect keystrokes. WPM-over-time chart with smooth curve. Per-character error highlighting in the typed text replay — see exactly where mistakes happened.

### Leaderboard
Global rankings filterable by language, mode (timed/words), length, and time range (daily / weekly / monthly / all-time). Infinite scroll. Links to user profiles.

### Profile page
Public at `/profile/[username]`. Avatar, bio, external link. Stats: time typing, words typed, top speed, global percentile. Best scores with the same filter set as the leaderboard. Activity calendar.

### Profile editing
Update username, bio, external link. Avatar upload with drag-to-crop and zoom. Avatar stored on Vercel Blob. Real-time username availability check.

### Authentication
OAuth sign-in and email/password registration. Password requirements enforced. Username setup on first OAuth login.

### Live stats during test
Real-time WPM and accuracy while typing. Toggleable.

### On-screen keyboard
Visual keyboard with current key highlighted. Toggleable.

### Relaxed mode
No timer, no word count, no score tracking. Just type.

### Personal score history
Per-user best scores per mode/language/length, same filters as leaderboard.

---

## Tier 3 — Supporting features

Polish and infrastructure that most users don't notice but would miss if gone.

- Alert/toast system (success, error, warning, info — auto-dismiss)
- Dark/light theme toggle (localStorage persisted)
- Fullscreen typing mode
- Contact form
- Support page
- Terms of service and privacy policy pages
- Sitemap at `/sitemap.xml` (includes user profiles and shared score pages)
- `robots.txt`
- OG meta tags site-wide with per-page overrides for score links
- Web app manifest for PWA install
- GA4 analytics (production only)
- Account deletion with confirmation
- Score share expiration support (optional)
- Per-character keystroke timeline (used for WPM chart sampling)
- Practice stats persisted per character across sessions
- Learn progress importable from localStorage to cloud on sign-in
