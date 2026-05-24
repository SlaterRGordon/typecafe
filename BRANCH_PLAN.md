# Branch plan: `3-learn-mode`

Single PR on branch **`3-learn-mode`** — practice keyboard heatmaps, learn progression fixes, and `practiceStats` backend corrections.

**Related docs:** [CODE_REVIEW.md](./CODE_REVIEW.md) (audit), [.cursor/skills/](./.cursor/skills/) (agent skills)

---

## Strategic advice (read first)

### One PR vs several

You asked for everything in one PR. That is reasonable **if**:

- Work lands in **ordered commits** (backend → typer → learn → polish) so review is digestible.
- **Agent lanes** touch disjoint files where possible to avoid merge conflicts.
- The PR description links to this plan and the smoke checklist at the bottom.

**Risk of one large PR:** review fatigue and hard rollback. Mitigation: commit per lane below; keep diff focused per commit message.

### Better sequencing (recommended)

```text
Phase 0 — Plan (you are here)
Phase 1 — Backend (blocks practice persistence)     [1 agent, must finish first]
Phase 2 — Practice client (parallel after Phase 1)  [1 agent]
Phase 3 — Learn mode (parallel after Phase 1)       [1 agent]
Phase 4 — Shared typer fixes (parallel)             [1 agent, coordinate with 2/3]
Phase 5 — Integration + QA                          [1 agent or human]
```

Phases 2, 3, and 4 can run **in parallel** once Phase 1 is merged locally (or rebased). Phase 4 should avoid editing the same lines as 2/3 in `Typer.tsx` — assign Typer changes to **one** agent (Lane B) and learn-only changes to Lane C.

### Alternative approaches (if scope explodes)

| Approach | When to use |
|----------|-------------|
| **This plan (full PR)** | You want learn + practice shippable together |
| **PR A: backend only** | Unblock stats; heatmap can stay session-only briefly |
| **PR B: practice UI** | Depends on PR A for persistence |
| **PR C: learn rules** | Independent of practiceStats |
| **Session-only heatmap first** | Skip Phase 1; scope `handleUpdateStats` to practice only and fake persistence — not recommended given current bugs |

### Agent tips

- Assign **one owner per file** for `Typer.tsx`, `Keyboard.tsx`, `learn.tsx`.
- Each agent: read [.cursor/skills/reference.md](./.cursor/skills/reference.md), run `npm run lint` + `npm run build` for their lane.
- Use skills: `typecafe-backend-builder`, `typecafe-typer`, `typecafe-client-builder`, `typecafe-qa`, `explaining-git-changes` (for handoff summaries).
- Do **not** commit `.env`, `CODE_REVIEW.md`, or `.cursor/` unless the user wants docs in repo (confirm before staging).

---

## Current branch context (baseline)

**Already in working tree (uncommitted):**

- Practice keyboard heatmap UI (`Keyboard.tsx`, `convertColor.ts`, `useMutationObserver.ts`)
- `charAttemptsRef` shared across `index.tsx`, `learn.tsx`, `Typer.tsx`
- Activity calendar uses shared theme hook
- Various small fixes (index keyboard visibility, etc.)

**Known broken (must fix in this PR):**

- `PracticeStats` schema + `practiceStats` router
- Heatmap not re-rendering on keystroke
- Learn: no WPM/accuracy gate on completion; unlock ignores accuracy
- Learn: `levels[-1]` bug; misleading keyboard wiring

---

## Phase 1 — Backend & data model

**Owner:** Backend agent  
**Skill:** `typecafe-backend-builder`  
**Blocks:** Practice persistence, keyboard load-from-DB (optional enhancement)

### Task 1.1 — Fix Prisma schema

**File:** `prisma/schema.prisma`

- Remove `@unique` from `PracticeStats.character` alone.
- Add `@@unique([userId, character])`.
- Add `@@index([userId])`.

**Migration:**

```bash
npx prisma migrate dev --name fix_practice_stats_per_user
```

**Note:** Existing rows may violate the new constraint if multiple users had the same character under the old global unique. Inspect DB or reset `PracticeStats` in dev before migrate.

**Acceptance:**

- [ ] Migration applies cleanly
- [ ] `prisma generate` succeeds

---

### Task 1.2 — Rewrite `practiceStats` router

**File:** `src/server/api/routers/practiceStats.ts`

**Changes:**

1. **`get`** — return `findMany({ where: { userId } })` (all characters for user), not `findFirst`.
2. **`update`** — fix lookup:
   - `findFirst({ where: { userId, character } })`
   - `update({ where: { id: row.id }, data: { total: increment, correct: increment } })`
   - Or use `upsert` with `@@unique([userId, character])`.
3. **Add `batchUpsert`** (or `sync`) — input:

   ```ts
   z.object({
     stats: z.array(z.object({
       character: z.string().max(1),
       total: z.number().int().min(0),
       correct: z.number().int().min(0),
     }))
   })
   ```

   Single transaction: upsert each row, increment totals on conflict.

4. Validate `correct <= total` in Zod or handler.

**Acceptance:**

- [ ] Signed-in user can sync multiple characters in one call
- [ ] Two users can both have stats for `"a"`
- [ ] Re-running sync increments totals correctly
- [ ] `npm run build` passes

---

### Task 1.3 — Wire client to batch API (minimal)

**Files:** `src/components/typer/Typer.tsx`, `src/utils/api.ts` (if needed)

- Replace loop of `updateStats.mutate` with one `batchUpsert` / `sync` mutation.
- Call only when `mode === TestModes.practice` (see Phase 2 — can be same agent if Typer not locked).

**Acceptance:**

- [ ] Network tab shows one request per restart/complete (practice mode), not N

---

## Phase 2 — Practice mode (client)

**Owner:** Typer / practice agent  
**Skill:** `typecafe-typer`  
**Depends on:** Phase 1 complete (for batch mutation)

### Task 2.1 — Live heatmap re-renders

**Files:** `src/pages/index.tsx`, `src/components/typer/Text.tsx`, `src/components/typer/Keyboard.tsx`

**Approach (pick one, document in PR):**

- **A (recommended):** `attemptVersion` state in `index.tsx`; increment in `onKeyChange` or callback from `Text` after each keystroke; pass `attemptVersion` to `Keyboard` as prop (forces re-render).
- **B:** Lift `Map` to `useState` in parent (more invasive).

**Acceptance:**

- [ ] Key colors update on every typed character in practice + stats view
- [ ] Theme change still updates colors

---

### Task 2.2 — Scope stats sync to practice only

**File:** `src/components/typer/Typer.tsx`

- `handleUpdateStats` / batch sync: only when `mode === TestModes.practice`.
- Learn and normal timed tests do not call practice stats sync.

**Acceptance:**

- [ ] Learn complete/restart does not hit `practiceStats` API
- [ ] Practice restart still syncs

---

### Task 2.3 — Load persisted stats on practice mount (optional but recommended)

**Files:** `src/pages/index.tsx`, `src/components/typer/Typer.tsx`

- On mount (signed in + practice mode): `api.practiceStats.get.useQuery()` → seed `charAttemptsRef` with `{ attempts: total, correct: correct }`.
- Merge with session stats (session increments on top of DB baseline).

**Acceptance:**

- [ ] Refresh page; heatmap reflects historical practice data after toggle stats

---

### Task 2.4 — Practice UI cleanup

**Files:** `Keyboard.tsx`, `Typer.tsx`, `ThemeSwitch.tsx`, `src/utils/hooks/useMutationObserver.ts`

- Remove empty `useEffect` in `Keyboard`.
- Remove `console.log(selectedKeys)` in `Typer` practice branch.
- Remove `console.log(theme)` in `ThemeSwitch` (unless intentional).
- Null guard in `useMutationObserver` before `observe`.
- Extract duplicated key row into `KeyRow` component (same file or `KeyboardKeyRow.tsx`).
- Guard `createTest`: skip if `!testType?.id`.

**UX (small):**

- Default `showStats` to `true` in practice, or persist toggle in `localStorage`.
- Optional: one-line legend (“Color = accuracy on this key”).

**Acceptance:**

- [ ] No debug `console.log` in touched files
- [ ] `npm run lint` clean on touched files

---

### Task 2.5 — Refactor `charAttempts` API (optional)

**File:** `src/hooks/useCharAttempts.ts` (new)

- Encapsulate `useRef<Map>`, `bumpVersion`, `seedFromServer`, `clearSynced`.
- Used by `index.tsx` (and learn only if still needed).

**Acceptance:**

- [ ] `index.tsx` shorter; behavior unchanged

---

## Phase 3 — Learn mode

**Owner:** Learn / client agent  
**Skill:** `typecafe-client-builder` + `typecafe-typer`  
**Depends on:** Phase 1 not required for learn rules; **do not** conflict with Lane B on `Typer.tsx`

### Task 3.1 — Enforce completion thresholds

**Files:** `src/pages/learn.tsx`, `src/components/typer/Typer.tsx`

**Design:**

- Pass `levelRequirements?: { wpm: number; accuracy: number }` into `Typer` (or callback `onRunEnd({ wpm, accuracy }) => boolean`).
- On complete (`handleComplete` for normal + words + level):
  - If `wpm >= required.wpm && accuracy >= required.accuracy` → `handleCreateTest()` + `onTestComplete()`.
  - Else → show alert/toast (“Need X WPM and Y% accuracy”); do not save test; do not unlock.

**Acceptance:**

- [ ] Finishing below threshold does not create `Test` row
- [ ] Finishing at/above threshold saves and refetches unlock state

---

### Task 3.2 — Fix level unlock logic

**File:** `src/pages/learn.tsx`

- Unlock check: previous level test must meet **both** `speed >= wpm` and `accuracy >= required.accuracy` for selected difficulty.
- Fix auto-level `useEffect`:

  ```ts
  const firstLocked = levelOptions.findIndex(o => o.isDisabled)
  const idx = firstLocked <= 0 ? 0 : firstLocked - 1
  setLevel(levels[idx]!)
  ```

- Guard when `tests` undefined / loading (`isLoadingTests`).

**Acceptance:**

- [ ] All levels unlocked → selects last level, not `undefined`
- [ ] Accuracy requirement affects lock state

---

### Task 3.3 — Learn keyboard UX

**File:** `src/pages/learn.tsx`, `src/components/typer/Keyboard.tsx`

**Recommended (Task 3.3b):**

- Add prop `highlightKeys?: string[]` to `Keyboard`.
- On learn page: pass `level.keys.split("")` — tint those keys (distinct from practice heatmap).
- Remove `charAttemptsRef` from learn page if unused (Typer may still accept ref but learn does not sync stats).

**Acceptance:**

- [ ] Learn page shows target keys on keyboard
- [ ] No practice heatmap toggle on learn (`mode === normal`)

---

### Task 3.4 — Learn page cleanup

**File:** `src/pages/learn.tsx`

- Remove empty `useEffect` (lines 39–43).
- `getByLevels.useQuery({ enabled: !!testType?.id, typeId: testType!.id })`.
- Remove unused state: `letters`, gram* if not used on learn.
- User-visible error on `refetchTests` failure (Redux `addAlert`).

**Acceptance:**

- [ ] No empty effects; no query with `typeId: ""`
- [ ] Mobile: header + typer + keyboard usable (spot-check 375px width)

---

## Phase 4 — Shared typer fixes

**Owner:** Typer agent (coordinate with Phase 2 owner)  
**Skill:** `typecafe-typer`  
**Files:** `Text.tsx`, `Typer.tsx` (only if not owned by Phase 2)

### Task 4.1 — `Text.tsx` hygiene

- Remove `import { init } from "next/dist/compiled/webpack/webpack"`.
- Fix relaxed mode: `currentTextRef.current += " " + newText` to match `appendNewText`.
- Fix `useEffect` deps: remove bare `props`; use stable callbacks.

**Acceptance:**

- [ ] Relaxed mode append does not desync indices
- [ ] Build passes

---

### Task 4.2 — `handleRestart` deps

**File:** `Typer.tsx`

- Add `handleRestart` to effect deps or merge restart trigger logic.

**Acceptance:**

- [ ] Changing `selectedKeys` in practice regenerates text reliably

---

## Phase 5 — Integration & QA

**Owner:** QA / director agent or human  
**Skill:** `typecafe-qa`, `reviewing-code`

### Task 5.1 — Full build

```bash
npm run lint
npm run build
```

### Task 5.2 — Manual smoke (check all)

**Practice (index, practice mode, signed in)**

- [ ] Stats toggle; colors update each keystroke
- [ ] Theme change updates colors
- [ ] Restart syncs stats (DB row increments in Prisma Studio / query)
- [ ] Refresh; heatmap shows stored stats (if Task 2.3 done)
- [ ] Key picker rules (min 6 keys, vowel/consonant)

**Learn**

- [ ] Below threshold → no save, no unlock
- [ ] At/above threshold → save + unlock after refetch
- [ ] Difficulty change updates requirements
- [ ] Level dropdown never breaks on load
- [ ] Target keys visible on keyboard

**Regression**

- [ ] Timed normal mode on index still works
- [ ] Guest practice: heatmap works; no API errors (stats sync skipped when logged out)

### Task 5.3 — PR description template

```markdown
## Summary
- Practice: theme-aware per-key accuracy keyboard + persisted practiceStats
- Learn: enforce WPM/accuracy to pass levels; fix unlock + level selection bugs
- Backend: fix PracticeStats schema and batch sync API

## Test plan
- [ ] (paste smoke checklist from BRANCH_PLAN.md Phase 5)

## Migration
- Run `npx prisma migrate dev` for practice stats unique constraint
```

### Task 5.4 — Update CODE_REVIEW.md (optional)

Strike or annotate fixed items so the doc stays useful.

---

## File ownership matrix (avoid conflicts)

| File | Phase / owner |
|------|----------------|
| `prisma/schema.prisma`, `practiceStats.ts` | 1 — Backend |
| `Typer.tsx` | 2 + 4 — **one agent** (2 owns stats/complete; 4 owns Text-related deps) |
| `Keyboard.tsx`, `index.tsx` | 2 — Practice |
| `learn.tsx` | 3 — Learn |
| `Text.tsx` | 4 — Typer |
| `convertColor.ts`, `useMutationObserver.ts` | 2 — Practice |

---

## Suggested commits (Conventional Commits)

1. `fix(db): per-user practice stats unique constraint`
2. `feat(api): batch upsert practice stats and fix get/update`
3. `feat(typer): practice heatmap live updates and batch sync`
4. `feat(learn): enforce level thresholds and fix unlock logic`
5. `feat(learn): highlight target keys on keyboard`
6. `fix(typer): text relaxed mode sync and remove webpack import`
7. `chore: remove debug logs and lint`

---

## Out of scope (follow-up issues)

- Load tests / Vitest suite
- `user.createUser` plaintext password, `type.create` public procedure (see CODE_REVIEW.md)
- CJK input in `Text.tsx`
- Dynamic import language JSON bundles
- Historical stats on profile page

---

## Agent prompt snippets (copy-paste)

### Lane 1 — Backend

```text
On branch 3-learn-mode, complete BRANCH_PLAN.md Phase 1 only.
Fix PracticeStats schema, migration, practiceStats router (get many, upsert, batchUpsert).
Do not edit learn.tsx or Keyboard.tsx. Run npm run build. Summarize API changes.
```

### Lane 2 — Practice client

```text
On branch 3-learn-mode, complete BRANCH_PLAN.md Phase 2 after Phase 1 is merged.
Heatmap re-renders, practice-only stats sync, batch mutation, UI cleanup.
Coordinate: you own Typer.tsx stats/complete paths. Run lint + build.
```

### Lane 3 — Learn

```text
On branch 3-learn-mode, complete BRANCH_PLAN.md Phase 3.
Learn thresholds, unlock logic, learn keyboard highlights, learn.tsx cleanup.
Do not change practiceStats router. Avoid Typer.tsx unless adding levelRequirements prop (coordinate with Lane 2).
```

### Lane 4 — Integration

```text
On branch 3-learn-mode, complete BRANCH_PLAN.md Phase 4 and 5.
Text.tsx fixes, Typer restart deps, full smoke test, fix merge conflicts if any.
```

---

## Status tracker

| Phase | Status | Owner | Notes |
|-------|--------|-------|-------|
| 1 Backend | ✅ | Agent | Schema, router, Typer batchSync wired |
| 2 Practice | ✅ | Agent | Heatmap live updates, practice-only sync, persisted heatmap stats, cleanup |
| 3 Learn | ✅ | Agent | Threshold gates, unlock logic, target key highlights, query cleanup |
| 4 Shared typer | ✅ | Agent | Text hygiene and restart deps completed |
| 5 QA | ⬜ | | |

_Update this table as phases complete._
