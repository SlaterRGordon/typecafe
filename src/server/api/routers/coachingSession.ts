import { TRPCError } from "@trpc/server"
import { z } from "zod"
import type { Prisma } from "~/generated/prisma/client"
import { parseDailySession, preferDailySession } from "~/lib/dailyCoaching"
import { DEFAULT_EVIDENCE_HISTORY_LIMIT, MAX_EVIDENCE_HISTORY_LIMIT } from "~/lib/evidenceNormalization"
import { STATS_POOLS } from "~/lib/keyboardLayout"
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc"

const contextSchema = z.object({
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pool: z.string().refine((pool) => STATS_POOLS.includes(pool), "Unknown stats pool"),
    language: z.string().min(1).max(64),
})

// Well-formed snapshots are ~2-4KB; anything near this cap is not a session.
const MAX_SNAPSHOT_BYTES = 16_384
const historySchema = contextSchema.omit({ dateKey: true }).extend({
    limit: z.number().int().min(1).max(MAX_EVIDENCE_HISTORY_LIMIT).optional(),
})

export const coachingSessionRouter = createTRPCRouter({
    getToday: protectedProcedure
        .input(contextSchema)
        .query(async ({ ctx, input }) => {
            const row = await ctx.prisma.coachingSession.findUnique({
                where: {
                    userId_dateKey_pool_language: {
                        userId: ctx.session.user.id,
                        dateKey: input.dateKey,
                        pool: input.pool,
                        language: input.language,
                    },
                },
                select: { snapshot: true },
            })
            const session = parseDailySession(row?.snapshot)
            return session && session.dateKey === input.dateKey && session.pool === input.pool && session.language === input.language
                ? session
                : null
        }),

    getHistory: protectedProcedure
        .input(historySchema)
        .query(async ({ ctx, input }) => {
            const rows = await ctx.prisma.coachingSession.findMany({
                where: {
                    userId: ctx.session.user.id,
                    pool: input.pool,
                    language: input.language,
                },
                orderBy: { dateKey: "desc" },
                take: input.limit ?? DEFAULT_EVIDENCE_HISTORY_LIMIT,
                select: { snapshot: true },
            })
            return rows.flatMap((row) => {
                const session = parseDailySession(row.snapshot)
                return session && session.pool === input.pool && session.language === input.language ? [session] : []
            })
        }),

    save: protectedProcedure
        .input(z.object({ snapshot: z.unknown() }))
        .mutation(async ({ ctx, input }) => {
            if (JSON.stringify(input.snapshot).length > MAX_SNAPSHOT_BYTES) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Snapshot too large" })
            }
            const incoming = parseDailySession(input.snapshot)
            if (!incoming) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid daily coaching session" })
            const key = {
                userId: ctx.session.user.id,
                dateKey: incoming.dateKey,
                pool: incoming.pool,
                language: incoming.language,
            }
            const existing = await ctx.prisma.coachingSession.findUnique({
                where: { userId_dateKey_pool_language: key },
                select: { snapshot: true },
            })
            // A stale/offline device must never overwrite a more-complete copy.
            // ponytail: read-then-upsert isn't transactional - two devices racing
            // the same second can still last-write-win; wrap in $transaction with
            // serializable isolation if that ever bites a real user.
            const session = preferDailySession(incoming, parseDailySession(existing?.snapshot)) ?? incoming
            const snapshot = session as unknown as Prisma.InputJsonValue
            await ctx.prisma.coachingSession.upsert({
                where: {
                    userId_dateKey_pool_language: key,
                },
                create: {
                    userId: key.userId,
                    dateKey: session.dateKey,
                    pool: session.pool,
                    language: session.language,
                    snapshot,
                },
                update: { snapshot },
            })
            return session
        }),
})
