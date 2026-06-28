# Guest data is local-first, synced on sign-in

A guest's Tests and stats live in localStorage, and every scoring/progression function in `src/lib/` is a pure function that produces identical results from a guest's localStorage mirror or a signed-in user's Prisma `Test` rows. We chose this over server-only persistence so the full improvement loop works before sign-up (lowering the barrier to the primary "plateaued intermediate" user) and to stay on free-tier infra. The cost: every metric needs a dual-source path and the two stores must converge on sign-in.
