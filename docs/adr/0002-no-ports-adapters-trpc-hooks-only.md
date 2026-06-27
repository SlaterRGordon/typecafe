# No ports/adapters seam; the signed-in path stays tRPC-hooks-only

Dual-source locality (ADR-0001) is delivered by pure `src/lib/` functions plus thin React hooks — not by a repository/port interface that a guest or DB "adapter" plugs into. `createTRPCNext` exposes only React hooks (there is no vanilla tRPC client in this app), so the signed-in side cannot sit behind a pure, substitutable seam without building and maintaining a parallel client purely to satisfy the abstraction. When a guest read and a signed-in read must converge, we consolidate them into a named hook (e.g. `useGuestEvidence`, `GuestImport`) rather than an adapter behind a port.

The cost we accept: there is no single "swap the data source" seam to mock; tests get their leverage from the pure `src/lib/` math (testable in isolation) and from each hook owning one concern's I/O. The benefit: no speculative abstraction layer wrapping hooks we can't substitute anyway.

Consequence for future architecture reviews: do not re-propose a ports/adapters or "repository" layer for the guest↔DB boundary — it cannot be a real seam here (one adapter is a hypothetical seam, not a real one). Deepen by keeping the math pure and the I/O in one hook per concern instead.
