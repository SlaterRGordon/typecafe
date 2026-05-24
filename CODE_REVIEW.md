# TypeCafe code review

Audit scope: full repo with extra attention to the typing surface (`src/components/typer/`), tRPC/Prisma/auth, and recent working-tree changes (~10 modified files). No automated test suite exists (`package.json` has no `test` script; zero `*.test.*` files).

---

## What's working well

- **T3 layout** is coherent: Pages Router, tRPC + SuperJSON, Prisma, NextAuth, path alias `~/`.
- **tRPC auth middleware** (`protectedProcedure`) is the right default for user mutations.
- **`registerUser`** hashes passwords with bcrypt; duplicate email/username checks are in place.
- **Typer restart debouncing** (`cancelRestartRef` + `setTimeout`) avoids rapid config-change thrash.
- **Text component** uses DOM fragments and per-character spans for performance instead of re-rendering the whole string on each keystroke.

---

## Must fix

### 1. `PracticeStats` schema — global unique on `character` (DONE)

**Status:** Fixed in Phase 1 — `@@unique([userId, character])`.

```prisma
model PracticeStats {
    id          String   @id @default(cuid())
    userId    String
    character String @db.VarChar(1)  @unique
    ...
}
```

`@unique` on `character` alone means only one user in the entire database can have stats for `"a"`. Per-user stats cannot work.

**Fix:** `@@unique([userId, character])` and remove `@unique` from `character` alone; add `@@index([userId])`.

**File:** `prisma/schema.prisma` (lines 116–126)

---

### 2. `practiceStats.update` uses wrong `where` fields (DONE)

**Status:** Fixed in Phase 1 — correct lookup + `batchSync` added.

```typescript
const currentStats = await ctx.prisma.practiceStats.findUnique({
  where: {
    id: ctx.session?.user.id,
    character: input.character,
  },
  ...
});
return ctx.prisma.practiceStats.update({
  where: {
    id: ctx.session?.user.id,
  },
  ...
});
```

`id` is the stat row's cuid, not `userId`. `findUnique` also cannot use `{ id, character }` without a compound unique. Updates will fail or target the wrong row.

**Fix:** `findFirst({ where: { userId: ctx.session.user.id, character: input.character } })` and `update({ where: { id: currentStats.id }, ... })`, or `upsert` on `userId_character`.

**File:** `src/server/api/routers/practiceStats.ts` (lines 39–72)

---

### 3. `user.createUser` stores plaintext passwords (DONE)

```typescript
createUser: protectedProcedure
  ...
  .mutation(({ ctx, input }) => {
    return ctx.prisma.user.create({
      data: {
        ...
        password: input.password,
      },
    });
  }),
```

`registerUser` hashes; `createUser` does not. Any caller of this mutation persists reversible credentials.

**Fix:** Remove this procedure or hash with `bcrypt` like `registerUser`. Prefer a single registration path.

**File:** `src/server/api/routers/user.ts` (lines 65–79)

---

### 4. Public mutations that should be admin-only (DONE)

```typescript
create: publicProcedure
  .input(z.object({ ... }))
  .mutation(({ ctx, input }) => {
    return ctx.prisma.testType.create({ ... });
  })
```

Unauthenticated clients can create `TestType` rows and pollute the DB.

**Fix:** `protectedProcedure` + admin check, or remove from public API.

**File:** `src/server/api/routers/type.ts` (lines 39–55)

---

### 5. Unvalidated dynamic `orderBy` (DoS / unexpected queries) (DONE)

**Status:** Fixed in this pass — `test.getAll` and `test.getByUser` now validate `orderBy` and `order` with Zod enums.

```typescript
orderBy: {
  [input.orderBy]: input.order,
},
```

`orderBy` / `order` come from the client with no allowlist. Prisma may throw or behave unexpectedly; this is a common injection footgun.

**Fix:** `z.enum(['createdAt', 'score', 'speed', ...])` and `z.enum(['asc', 'desc'])`.

**File:** `src/server/api/routers/test.ts` (lines 31–33)

---

### 6. `getUserByEmail` can return password hash (DONE)

```typescript
getUserByEmail: protectedProcedure
  ...
  return ctx.prisma.user.findFirst({
    where: { email: input.email },
  });
```

No `select`; full user row (including `password`) goes to any authenticated user who knows an email.

**Fix:** `select: { password: false, ... }` or drop the procedure if unused.

**File:** `src/server/api/routers/user.ts` (lines 54–63)

---

### 7. Division by zero in n-gram level-up logic (DONE)

```typescript
if (wpm >= props.gramWpmThreshold && (characterCount + (correct ? 1 : -1) - incorrectCount) / characterCount * 100 >= props.gramAccuracyThreshold) {
```

When `characterCount === 0`, this yields `NaN` and level logic becomes unpredictable.

**Fix:** Guard `characterCount > 0` before the accuracy term.

**File:** `src/components/typer/Typer.tsx` (line 197)

---

### 8. Relaxed mode text length desync (DONE)

```typescript
const newText = generateText(100, props.language)
appendNewText(" " + newText)
currentTextRef.current += newText
```

DOM gets a leading space; `currentTextRef` does not. Indices for completion and append drift.

**Fix:** `currentTextRef.current += " " + newText` (or append without the space in both places).

**File:** `src/components/typer/Text.tsx` (lines 88–90)

---

### 9. Dead / dangerous import in `Text.tsx` (DONE)

```typescript
import { init } from "next/dist/compiled/webpack/webpack"
```

Unused internal Next/webpack import — risks build breakage across Next versions.

**Fix:** Delete the line.

**File:** `src/components/typer/Text.tsx` (line 4)

---

## Should fix

### 10. Practice stats: N parallel mutations, no batching (DONE)

**Status:** Fixed in Phase 1 — `practiceStats.batchSync` replaces per-key `update` loop.

**File:** `src/components/typer/Typer.tsx`

---

### 11. `createTest` with possibly undefined `typeId` (DONE)

```typescript
createTest.mutate({
  typeId: testType?.id as string,
```

If `api.type.get` has not resolved, `typeId` is `undefined` cast to string → failed or corrupt rows.

**Fix:** Guard `if (!testType?.id) return`; disable save until loaded.

**File:** `src/components/typer/Typer.tsx` (lines 123–130)

---

### 12. Keyboard accuracy UI won't update on ref-only changes (DONE)

**Status:** Fixed in this pass — typing updates now bump an `attemptVersion` state in the page so the keyboard heatmap re-renders even when the current key value is unchanged.

`Keyboard` reads `charAttemptsRef.current` during render. Ref updates in `Text` do not trigger re-renders; heatmap colors update only when something else re-renders (e.g. `currentKey`).

**Fix:** Lift attempt counts to state, use `useSyncExternalStore`, or bump a version counter in the parent when the map changes.

**File:** `src/components/typer/Keyboard.tsx`

---

### 13. `useMutationObserver` — no null guard (DONE)

**Status:** Fixed in this pass — missing observer targets now bail out before `observe`.

```typescript
const targetNode = document.querySelector(domNodeSelector);
observer.observe(targetNode as Node, observerOptions);
```

If `document.querySelector` returns null (SSR/hydration), this throws.

**Fix:** `if (!targetNode) return;`

**File:** `src/utils/hooks/useMutationObserver.ts` (lines 5–9)

---

### 14. Global `keydown` listeners without full cleanup symmetry (DONE)

**Status:** Fixed in this pass — `Text` now registers named click/keydown handlers and removes both in cleanup.

`Text.tsx` adds listeners on `#typer` click and `window` keydown but the effect cleanup only runs on unmount — and the effect deps `[inputRef]` never change, so listeners are never removed on remount patterns.

**Fix:** Return cleanup that removes both listeners; include stable deps or mount once with refs.

**File:** `src/components/typer/Text.tsx` (lines 37–64)

---

### 15. `useEffect` dependency on entire `props` object (DONE)

**Status:** Fixed in this pass — `Text` destructures the props it uses and depends on the specific callbacks/values.

```typescript
useEffect(() => {
  props.setCharacterCount(position)
  ...
}, [position, incorrect, props])
```

Runs on every parent render; can amplify updates and WPM recalculation churn in `Typer`.

**Fix:** Depend on `setCharacterCount`, `setIncorrectCount`, `onKeyChange` only (stable callbacks from parent).

**File:** `src/components/typer/Text.tsx` (lines 256–260)

---

### 16. `handleRestart` missing from effect deps (DONE)

**Status:** Fixed in this pass — restart logic is wrapped in `useCallback`, and the restart effect depends on `handleRestart`.

```typescript
useEffect(() => {
  handleRestart()
}, [mode, subMode, language, count, gramSource, gramScope, gramCombination, gramRepetition, gramLevel, selectedKeys])
```

`handleRestart` is omitted → stale closure risk when its dependencies change.

**Fix:** Add `handleRestart` or inline stable restart logic.

**File:** `src/components/typer/Typer.tsx` (lines 103–105)

---

### 17. Large JSON language packs in client bundle

`utils.tsx` statically imports all language JSON and n-gram files. Every page that imports typer utils pays the full bundle cost.

**Fix:** Dynamic `import()` per language or route-level code splitting for learn vs index.

**File:** `src/components/typer/utils.tsx`

---

### 18. Non–Latin input not handled in `Text`

```typescript
e.key.length == 1 && ((e.key >= 'a' && e.key <= 'z') || (e.key >= 'A' && e.key <= 'Z'))
```

Chinese/Hindi content exists in `languages/` but key handling is Latin-only.

**Fix:** Language-aware matching (Unicode categories, IME composition events) or document English-only support.

**File:** `src/components/typer/Text.tsx` (line 174)

---

### 19. No automated tests

No unit/integration tests for scoring, timer, tRPC routers, or auth.

**Fix:** Start with `utils.tsx` text generation, WPM/accuracy math in `Typer`, and `practiceStats`/`registerUser` router tests (Vitest + MSW or tRPC caller).

---

## Nit

| Location | Issue | Suggestion |
|----------|--------|------------|
| `src/server/auth.ts:15` | Unused `import { api } from "~/utils/api"` | Remove |
| `Typer.tsx`, `ThemeSwitch.tsx`, etc. | `console.log` in production paths | User-facing toasts or structured logging |
| `Layout.tsx:5` | `children: any` | `React.ReactNode` |
| `Keyboard.tsx` | Three near-identical row `.map()` blocks | Extract `KeyRow` component |
| `test.ts:122` | Typo `competetiveTypes` | Rename for clarity |
| `getPercentile` | Division when `total === 0` | Return `null` or `0` explicitly |

---

## Testing gaps (manual smoke)

Until tests exist, verify:

- [ ] Sign in → complete timed test → result saved (`test.create`)
- [ ] Practice mode → per-key stats → restart → stats persist (`practiceStats` after schema/router fix)
- [ ] Theme switch → keyboard heatmap colors update
- [ ] Relaxed mode → type past buffer end → no index glitches
- [ ] N-gram mode → level-up at threshold with low `characterCount` edge case
- [ ] Non-admin cannot hit public `type.create` (if still exposed)

---

## Summary

The highest-impact issues are **data model and API security**: `PracticeStats` uniqueness, broken `practiceStats.update`, plaintext `createUser`, public `type.create`, and leaky `getUserByEmail`. On the client, **relaxed-mode index drift**, **n-gram `NaN` accuracy**, and **ref-based keyboard stats not re-rendering** are the main correctness risks in the product core.
