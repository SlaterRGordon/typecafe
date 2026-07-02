# Next focus

Decided 2026-07-02 from a full review (vision doc, architecture/UX ledgers,
screenshot tour, coach-tab + diagnosis code, unit suite 406/406 green).
Ranked by leverage. Items 1–3 are the active slice; 4–5 are quick hygiene.

Vision filter: *does it make someone faster, or prove they're getting faster?*

---

## 1. Guest home fails the 10-second test — extend the loop to guests

Vision §5: "if a first-time visitor can't tell TypeCafe from a minimal test
clone in 10 seconds, the screen has failed." The guest home is exactly a
minimal test clone. The "Fix this" coach tab is gated `if (signedIn)` in
[HomeCoachTabs.tsx](../../src/components/home/HomeCoachTabs.tsx), even though
guest evidence is local-first (ADR-0001) and `useGuestEvidence` already reads
it for /progress and /plan.

- [x] Feed the Fix-this tab from `useGuestEvidence` when signed out; same
  slowest-transition-then-weakest-keys priority, same dismissal key.
- [x] Keep the tab hidden when the guest has no local history (empty state
  stays clean).
- [x] E2e + screenshot-tour coverage for the guest-with-history tab.

Why first: closes the improvement loop *before* signup, and is itself the
signup pitch.

## 2. Profanity in the word lists — visible on the daily challenge

"porn" is in `english1k.json` (the default list) and appeared verbatim in the
daily-challenge screenshot — the one shared text everyone types. Present in
all four English lists.

- [ ] Scrub a small blocklist from the language JSONs (one-time cleanup, no
  runtime cost — free-tier friendly).
- [ ] Unit-check that no list word hits the blocklist so regressions can't
  sneak back in via list updates.

## 3. Standardize page width (ux-cleanup-plan §8)

Last unchecked active item in [ux-cleanup-plan.md](ux-cleanup-plan.md);
already decided and scoped there (two tiers, shared container, kill ad-hoc
`w-*/12`). Sequenced last so it sweeps pages after content settled — which
has now happened. Checkboxes live in that doc.

## 4. Screenshot-tour hygiene

Stale artifacts in `docs/screenshots/desktop-chromium/`: duplicate
learn/train pairs from the rename (14, 33, 34, 57–61), two different files
numbered 17 and 28, and `57-home-next-action.png` still shows the
pre-redesign pill mode bar. The tour is the UX-review instrument; stale
captures mislead reviews.

- [ ] Make the tour clean its output directory before capturing.
- [ ] Delete the orphaned captures once.

## 5. Docs drift in CLAUDE.md

CLAUDE.md points agents at `docs/phases/` and `docs/roadmap.md`; neither
exists. The real ledgers are `docs/architecture/` and `docs/features/`.

- [ ] Fix the references so future sessions don't start confused.

## Not now

- **Performance** — no findings: language JSONs dynamic-imported, quotes
  lazy-loaded, suite fast.
- **Plan-into-Progress (ux-cleanup §7)** — stays deferred until after #1.
