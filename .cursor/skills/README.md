# TypeCafe agent skills

Project-local [Cursor Agent Skills](https://cursor.com/docs/agent/skills) for this repo. Cursor loads skills from `.cursor/skills/` when working in this workspace.

## Skills index

| Skill | Use when |
|-------|----------|
| [typecafe-agent-director](typecafe-agent-director/SKILL.md) | Coordinating multiple agents, milestones, or next prompts |
| [typecafe-product](typecafe-product/SKILL.md) | Turning ideas into specs, flows, and acceptance criteria |
| [typecafe-builder](typecafe-builder/SKILL.md) | General implementation, refactor, or debug (any layer) |
| [typecafe-client-builder](typecafe-client-builder/SKILL.md) | Pages, components, Redux, styling, a11y |
| [typecafe-typer](typecafe-typer/SKILL.md) | Typing UI: text, keyboard, timer, languages, learn mode |
| [typecafe-backend-builder](typecafe-backend-builder/SKILL.md) | tRPC, Prisma, NextAuth, API routes |
| [typecafe-qa](typecafe-qa/SKILL.md) | Review, regression pass, release readiness |
| [reviewing-code](reviewing-code/SKILL.md) | Thorough code review (correctness, maintainability, performance) |
| [explaining-git-changes](explaining-git-changes/SKILL.md) | Explain local diffs or specific commits (purpose and impact) |
| [typecafe-git-committer](typecafe-git-committer/SKILL.md) | Staging and Conventional Commits (only when user asks) |

Shared context: [reference.md](reference.md).

## Invoking a skill

In chat or agent prompts, name the skill explicitly, for example:

```text
Use the typecafe-typer skill.

Goal: Fix cursor scroll when the line wraps on mobile.
```

Or reference by path: `.cursor/skills/typecafe-typer/SKILL.md`.

## Adding skills

1. Create `.cursor/skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`).
2. Keep `SKILL.md` under ~500 lines; put long detail in sibling files.
3. Update this README and [AGENTS.md](../../AGENTS.md) if the skill is part of the default agent workflow.
