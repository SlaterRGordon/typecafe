import { createHmac } from "crypto"
import { Prisma, type PrismaClient } from "~/generated/prisma/client"

interface RateLimitArgs {
    scope: string
    identity: string
    limit: number
    windowMs: number
}

export interface RateLimitResult {
    allowed: boolean
    retryAfterSeconds: number
}

type RateLimitDb = Pick<PrismaClient, "$queryRaw" | "publicWriteQuota">

export function publicWriteQuotaKey(scope: string, identity: string): string {
    const secret = process.env.NEXTAUTH_SECRET ?? "typecafe-development-rate-limit"
    return createHmac("sha256", secret).update(`${scope}\0${identity}`).digest("hex")
}

export function rateLimitResult(count: number, expiresAt: Date, limit: number, now = new Date()): RateLimitResult {
    return {
        allowed: count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
    }
}

// One atomic upsert is the concurrency boundary: simultaneous serverless
// instances cannot both observe the same pre-increment count.
export async function consumePublicWriteQuota(
    db: RateLimitDb,
    args: RateLimitArgs,
    now = new Date(),
): Promise<RateLimitResult> {
    const key = publicWriteQuotaKey(args.scope, args.identity)
    const nextExpiry = new Date(now.getTime() + args.windowMs)
    const rows = await db.$queryRaw<Array<{ count: number, expiresAt: Date }>>(Prisma.sql`
        INSERT INTO "PublicWriteQuota" ("key", "count", "expiresAt", "updatedAt")
        VALUES (${key}, 1, ${nextExpiry}, ${now})
        ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE
                WHEN "PublicWriteQuota"."expiresAt" <= ${now} THEN 1
                ELSE "PublicWriteQuota"."count" + 1
            END,
            "expiresAt" = CASE
                WHEN "PublicWriteQuota"."expiresAt" <= ${now} THEN ${nextExpiry}
                ELSE "PublicWriteQuota"."expiresAt"
            END,
            "updatedAt" = ${now}
        RETURNING "count", "expiresAt"
    `)
    const row = rows[0]
    if (!row) throw new Error("Rate limit counter did not return a row.")

    // Derived-on-write cleanup keeps the free-tier table bounded without cron.
    if (row.count === 1) {
        await db.publicWriteQuota.deleteMany({
            where: { key: { not: key }, expiresAt: { lt: now } },
        })
    }

    return rateLimitResult(row.count, row.expiresAt, args.limit, now)
}
