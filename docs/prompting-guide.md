# Prompting Guide — Running TypeCafe with Claude + Codex

How to direct AI agents through the [roadmap](roadmap.md) phases. Both tools auto-load the shared instructions (`CLAUDE.md` for Claude Code, `AGENTS.md` for Codex — kept identical), so prompts can stay short.

---

## Division of labor

**One workstream per tool, each on its own branch.** Never let both edit the same files in parallel — you'll spend your time merging two agents that don't know about each other.

| Give to Claude Code | Give to Codex |
|---|---|
| Anything needing visual verification (it runs the screenshot tour and reviews the images) | Sharply specified, self-contained tasks with a mechanical definition of done |
| Multi-file refactors with judgment calls | Single-module bug fixes (most of Phase 0) |
| UI overhauls — it ships candidates, you pick | Unit-test backfills |
| Reviewing the other tool's diffs (`/code-review`) | Pure-function implementations against a written spec |

**Cross-review pattern:** whichever tool implements, have the other review:
> Review the diff on branch `fix/accuracy-undercount` against docs/phases/phase-0-trust.md section 0.1. Verify the fix matches the spec and the tests actually cover the bug.

## The four-part prompt template

```
1. ANCHOR    Read docs/vision.md and docs/phases/phase-N-….md (section N.M) first.
2. SCOPE     Fix/build exactly one thing: [the task].
             Do not refactor anything else you find along the way.
3. DONE-WHEN [Tests that must exist and pass; checkbox to tick in the phase doc.]
4. VERIFY    Run the tests and show the output. If UI changed, run the
             screenshot tour and flag changed captures.
```

- The **anchor** keeps the agent vision-aligned without re-explaining context.
- The **scope** line stops agents from "helpfully" rewriting Typer.tsx while fixing a one-line guard.
- Never prompt "do Phase N" — a whole phase is too big for one session; quality degrades with scope. Phase-doc subsections are deliberately sized as one promptable task each.

## Starter prompts (Phase 0, in order)

**Task 1 — live accuracy undercount (either tool):**
> Read docs/vision.md and docs/phases/phase-0-trust.md. Fix the live accuracy undercount described in section 0.1: typing 3-of-4 correct keystrokes shows 50.00% instead of 75% — the first keystroke isn't counted due to a `currentPosition > 0` guard in the Typer keystroke handling. Requirements: the first keystroke (correct OR incorrect) must count toward accuracy and start the timer; add unit tests in the src/lib stats suite covering first-keystroke cases; verify manually that a 3-correct-1-wrong sequence shows 75%. Run the full test suite. Don't touch unrelated code. Tick the checkbox in the phase doc when green.

**Task 2 — timer drift (good Codex task):**
> Read docs/phases/phase-0-trust.md section 0.1. Rewrite src/hooks/timer/useTimer.ts so remaining time derives from Date.now() - startTime instead of chained setInterval ticks. Acceptance: no drift > 100ms over a 60s test (add a unit test with fake timers). Keep the hook's public API unchanged so Typer.tsx needs no edits.

**Task 3 — measurement contract (good Claude task — ends in prose):**
> Read docs/phases/phase-0-trust.md section 0.2. Add table-driven unit tests for every exported function in src/lib/stats.ts (cases listed in the doc), then create the /how-we-measure page: plain-language WPM/accuracy/consistency formulas matching the tested code exactly. Link it from the score card's ? tooltips. Add the page to the screenshot tour.

**Task 4 — visible-credibility batch (either tool):**
> Read docs/phases/phase-0-trust.md section 0.3. Fix all five visible-credibility items as one change: create src/lib/format.ts with a humanized duration formatter and use it on profile stats; fix the avatar fallback; fix the pre-test spacebar highlight; make the activity heatmap and Best Scores read consistent data; anchor the Smart drill button. Run the screenshot tour and show before/after captures.

Remaining Phase 0 bugs (grams micro-sample WPM, timed-text exhaustion, n-gram repetition, failed-save swallow) follow the same template — one prompt each, spec is in the table in the phase doc.

## Workflow rules

1. **One branch per task**, merged before dependent tasks start. Phase 0 bugs touch different files — safe to parallelize across both tools.
2. **Agents tick phase-doc checkboxes** in the same PR as the work. `docs/phases/*.md` checklists are the project tracker, visible to both tools.
3. **End every UI session with the screenshot tour.** Codex won't readily review images — have it run the suite, then hand the branch to Claude for capture review.
4. **In Claude Code, use `/code-review`** for pre-merge checks on any branch, including Codex's.
5. **When an agent pushes back citing the vision or locked constraints, listen** — both are instructed to flag conflicts (paid infra, premium gating, realtime racing, account-gated progression) rather than silently comply. If you genuinely want to change a constraint, edit `docs/phases/README.md` so both tools pick it up.
6. **Keep CLAUDE.md and AGENTS.md identical** — if a session teaches you something both tools should know (a new gotcha, a new command), add it to one and copy over the other.

## What only you can do

Agents cannot: configure Vercel/env secrets, create third-party accounts (Search Console, OAuth, email providers), post to communities (never let an agent astroturf), interpret GA4, spend money, or recruit users. Budget your own time for these — they gate launches, not code.
