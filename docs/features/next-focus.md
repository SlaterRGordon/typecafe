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

- [x] Scrub a small blocklist from the language JSONs (one-time cleanup, no
  runtime cost — free-tier friendly). Exact match only ("analysis", "canal",
  "grape" stay); ordinary words (kill, hell, strip, drug, gay) stay. 148
  words removed across the four English lists; other languages were clean.
- [x] Unit-check that no list word hits the blocklist so regressions can't
  sneak back in via list updates (`src/lib/wordBlocklist.test.ts`).

## 3. Standardize page width (ux-cleanup-plan §8)

Last unchecked active item in [ux-cleanup-plan.md](ux-cleanup-plan.md);
already decided and scoped there (two tiers, shared container, kill ad-hoc
`w-*/12`). Sequenced last so it sweeps pages after content settled — which
has now happened. **Done** — checkboxes ticked in that doc.

## 4. Screenshot-tour hygiene

Stale artifacts in `docs/screenshots/desktop-chromium/`: duplicate
learn/train pairs from the rename (14, 33, 34, 57–61), two different files
numbered 17 and 28, and `57-home-next-action.png` still shows the
pre-redesign pill mode bar. The tour is the UX-review instrument; stale
captures mislead reviews.

- [x] Make the tour clean its output directory before capturing.
- [x] Delete the orphaned captures once.

## 5. Docs drift in CLAUDE.md

CLAUDE.md points agents at `docs/phases/` and `docs/roadmap.md`; neither
exists. The real ledgers are `docs/architecture/` and `docs/features/`.

- [x] Fix the references so future sessions don't start confused.

## 6. Close the drill loop: post-drill delta, next drill, live coach tab

Owner request 2026-07-03. The drill result card showed absolute WPM/accuracy
only (violating deltas-over-absolutes where a delta exists), dead-ended after
Re-measure/Drill again, and the always-mounted coach tab served a
recommendation frozen at first page load.

- [x] `src/lib/drillProgress.ts` (pure, unit-tested): lifetime-vs-this-rep
  delta on the drilled target (pair latency / key accuracy) and a shared
  `nextDrillFinding` picker that excludes the just-drilled target.
- [x] Drill result card: delta line + "Next drill: …" CTA (Re-measure stays
  primary — drilling proves nothing without a re-measure; plan flow keeps its
  own sequencing).
- [x] Coach tab recomputes after every synced test: guests re-read local
  evidence on a `typecafe:evidence-synced` event; signed-in syncs invalidate
  the lifetime queries.
- [x] E2e coverage (drill.spec) + tour capture 37 now shows the full result
  card.
- [x] Header redesign (owner feedback on the first cut): the chip row
  duplicated the heading for single-target drills (dropped; multi-target
  only), and the header now states the baseline to beat ("412ms on this jump
  — 1.8× your typical transition") plus a "Next drill: …" link computed from
  lifetime evidence at load — reachable before/after restarts, no completed
  rep required. Result card keeps its own fresher pick post-rep.

## Not now

- **Performance** — no findings: language JSONs dynamic-imported, quotes
  lazy-loaded, suite fast.
- **Plan-into-Progress (ux-cleanup §7)** — stays deferred until after #1.
