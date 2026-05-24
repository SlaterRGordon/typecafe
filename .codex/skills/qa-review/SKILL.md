---
name: qa-review
description: Use when reviewing any project or change for bugs, regressions, missing tests, accessibility issues, edge cases, and release readiness; especially when the user asks for QA, regression testing, acceptance checks, or a test plan.
---

# QA Review

Use this skill when the user wants a QA pass, regression review, test plan, or release-readiness check.

## Review Priorities

1. Behavioral bugs, data loss, broken workflows, security issues, and regressions.
2. Missing or weak tests for changed behavior.
3. Accessibility, responsive layout, keyboard interaction, and assistive technology issues.
4. Error states, loading states, empty states, permission states, and edge cases.
5. Cosmetic polish only when it affects usability or the user explicitly asks.

## Workflow

- Inspect the diff, relevant files, and available product context before judging.
- Identify the primary user workflows affected by the change.
- Check happy paths, failure paths, boundary values, refresh/navigation behavior, and persistence.
- Prefer evidence from tests, builds, screenshots, logs, direct inspection, or reproduction steps.
- Lead with findings ordered by severity and cite file paths or lines when possible.
- Include reproduction notes, expected behavior, actual behavior, and suggested fixes for concrete issues.
- If no issues are found, say so clearly and list residual test gaps or remaining release risk.
- Keep summaries brief; findings and actionable test coverage are the main output.

## Generic Checks

- Verify the primary workflow still works on desktop and mobile when applicable.
- Confirm text fits inside controls and does not overlap adjacent UI.
- Check that interactive states are discoverable, focusable, and keyboard usable.
- Confirm loading, empty, disabled, unauthenticated, unauthorized, and error states are understandable.
- Check persistence and sync behavior across refresh, navigation, sign-in/sign-out, and retry flows.
- Watch for stale state, race conditions, double submits, duplicate records, and partial failures.
- Note any missing automated tests that would catch the highest-risk regressions.

## Output Shape

Use this order:

1. Findings, ordered by severity.
2. Open questions or assumptions.
3. Suggested tests or manual regression checklist.
4. Brief overall readiness summary.
