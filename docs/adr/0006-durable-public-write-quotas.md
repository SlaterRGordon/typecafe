# ADR 0006 — Public write quotas use Postgres, not process memory

Decided 2026-07-11 during the full-site audit remediation.

## Problem

Guest score shares, beat-run shares, and the contact form are intentionally
available without an account. Each accepted request creates durable work: a
database row or an SMTP send. Serverless process memory is neither shared nor
durable, so an in-memory counter can be bypassed by concurrent instances and
resets whenever an instance is recycled. A paid Redis/rate-limit service would
violate the free-tier infrastructure constraint.

## Decision

Use `PublicWriteQuota` in the existing Postgres database. One atomic
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` increments a hashed
`scope + request identity` key and resets it when its window expires. Raw IP
addresses are never stored. The shared `consumePublicWriteQuota` interface is
used by tRPC guest-share mutations and `/api/contact`.

Cleanup is derived on write: the first request in a fresh window deletes other
expired quota keys. Anonymous score and beat-run shares expire after 30 days,
and anonymous share creation deletes expired shares. No cron or additional
service is required.

## Consequences

- Limits remain consistent across serverless instances and deployments.
- Every accepted public write adds one small Postgres counter operation; this is
  the deliberate cost of a durable free-tier boundary.
- Forwarded request identity is trusted only as supplied by the deployment
  proxy; the platform-specific header is preferred before generic forwarding
  and socket fallbacks.
- Signed-in permanent shares remain outside this anonymous quota/expiry policy.
