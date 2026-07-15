# Guest data is local-first, synced on sign-in

A guest's aggregate progress and stats live in localStorage; full Test and Drill
Timelines live in bounded IndexedDB. Every scoring/progression function in
`src/lib/` produces identical results from guest evidence or signed-in Prisma
`Test` rows. We chose this over server-only persistence so the full improvement
loop works before sign-up (lowering the barrier to the primary "plateaued
intermediate" user) and to stay on free-tier infra. The cost: every metric needs
a dual-source path and the stores must converge on sign-in.

Signed-in prompted Tests also persist a compact, versioned keystroke Timeline as
future-proof evidence. Timeline v2 stores the expected character and timing for
each attempt, Backspace actions, and the actual typed character only when an
attempt is incorrect; correct attempts use a zero sentinel rather than duplicate
the expected character. Capture remains limited to TypeCafe's prompted copy task
and never observes system-wide typing. Timeline v1 stays readable indefinitely.

Guest Timeline storage retains the newest 200 records or 20MB, evicting the
oldest natural Tests before Coaching evidence. Signup imports at most 25 records
per request, re-derives metrics on the server, stores every imported row unranked,
and keys it by user plus guest-local id. The client deletes only server-confirmed
ids, so partial/network retries neither lose nor duplicate evidence. Blocked or
unavailable IndexedDB leaves aggregate coaching functional and never blocks a
Test.
