---
name: explaining-git-changes
description: Explains the purpose and impact of local git changes or specific commits by reading diffs, status, and history. Use when the user asks what changed, why, what a commit does, or wants a summary of uncommitted work or a SHA/range.
---

# Explaining Git Changes

Use this skill when the user wants to understand **what** changed and **why** (intent), not just a raw diff. Works for uncommitted work, staged changes, branches, or individual commits.

## Scope the request

| User asks about | Commands to run first |
|-----------------|----------------------|
| Uncommitted / working tree | `git status --short`, `git diff`, `git diff --staged` |
| Specific file(s) | `git diff -- <path>`, `git diff --staged -- <path>` |
| One commit | `git show --stat <sha>`, `git show <sha>` |
| Last N commits | `git log -n <N> --oneline`, then `git show` per commit if needed |
| Branch vs main | `git log main..HEAD --oneline`, `git diff main...HEAD` |
| A commit range | `git log <base>..<head> --oneline`, `git diff <base>...<head>` |

On PowerShell, chain with `;` not `&&` if needed.

Always gather evidence before explaining. Do not invent changes that are not in the diff.

## Workflow

1. **Identify scope** - local only, staged, one commit, branch delta, or path filter.
2. **Collect context** - run the commands above; read affected files when the diff is unclear or truncated.
3. **Infer purpose** - group hunks into logical changes (feature, fix, refactor, chore). Use commit messages when reviewing history; use code and file paths when reviewing local work.
4. **Explain impact** - who/what is affected (UI, API, schema, config). Note breaking or risky areas.
5. **Separate facts from guesses** - label assumptions when intent is ambiguous.

## Output format

```markdown
## Summary
<1–3 sentences: overall intent of the change(s)>

## Scope
- **Type:** feat | fix | refactor | chore | docs | mixed
- **Area:** e.g. typer, auth, prisma, theme
- **Files:** <count> files, or list if small>

## Changes
### <Logical group 1 - e.g. "Theme-aware keyboard stats">
- **What:** …
- **Why (purpose):** …
- **Files:** `path` (brief note)

### <Logical group 2>
…

## Not changed / out of scope
<Optional: what the user might expect but is not in this diff>

## Risks & follow-ups
<Optional: regressions, missing tests, migrations, env vars>
```

For a **single commit**, add:

```markdown
## Commit
- **SHA:** `<short-sha>`
- **Subject:** …
- **Author / date:** … (if relevant)
```

For **local uncommitted** work, add:

```markdown
## Git state
- **Staged:** …
- **Unstaged:** …
- **Untracked:** …
```

## How to infer purpose

- **File paths** - `src/components/typer/` → typing UI; `src/server/api/` → tRPC; `prisma/` → data model.
- **Diff patterns** - new exports/props → feature wiring; only styles → UI polish; schema + migration → persistence change.
- **Commit message** - treat as author intent, but verify against the diff (messages can be wrong or vague).
- **Deletions vs additions** - prefer describing behavior change, not line counts.

## Rules

- Lead with purpose, then supporting detail. Avoid dumping the full diff unless asked.
- Quote short diff snippets only when they clarify non-obvious behavior.
- If the diff is huge, summarize by subsystem and offer to drill into a path.
- Mention **unstaged vs staged** when both exist and they differ.
- Do not run destructive git commands (`reset`, `checkout --`, `push --force`) as part of explaining.
- If there are no changes, say so clearly and suggest `git status` or checking branch/commit ref.

## TypeCafe hints

See [reference.md](../reference.md) for directory meanings when describing areas.

Common change types in this repo:

- **Typer / Text / Keyboard** - typing feel, stats, themes, input handling
- **tRPC routers** - API contracts, auth boundaries
- **Prisma schema** - requires migration note in impact section
- **`.cursor/skills/`** - agent documentation only, no runtime effect

## Examples

**User:** "What did I change locally?"

→ `git status --short`, `git diff --stat`, `git diff` (and `--staged` if any). Group into themes; output format above.

**User:** "What does commit abc1234 do?"

→ `git show --stat abc1234`, `git show abc1234`. Summarize intent from message + diff; note files touched.

**User:** "Explain changes in Text.tsx"

→ `git diff -- src/components/typer/Text.tsx` (and staged variant). Focus on behavior, not every line.
