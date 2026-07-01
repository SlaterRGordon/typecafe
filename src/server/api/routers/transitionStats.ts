import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { Prisma } from "~/generated/prisma/client";
import { isTrackableTransitionPair } from "~/lib/drillableTransitions";

const transitionInput = z.object({
  pair: z.string().length(2),
  count: z.number().int().min(0),
  totalMs: z.number().int().min(0),
  errors: z.number().int().min(0),
});

export const transitionStatsRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.transitionStat.findMany({
      where: { userId: ctx.session.user.id },
      select: { pair: true, count: true, totalMs: true, errors: true },
    });
  }),

  // Derived-on-write: each completed test's per-pair aggregates are added to the
  // user's lifetime rows (upsert + increment), mirroring practiceStats.batchSync.
  batchSync: protectedProcedure
    .input(z.object({ stats: z.array(transitionInput) }))
    .mutation(async ({ ctx, input }) => {
      const stats = input.stats
        .map((stat) => ({ ...stat, pair: stat.pair.toLowerCase() }))
        .filter((stat) => isTrackableTransitionPair(stat.pair));
      if (stats.length === 0) return { count: 0 };
      const userId = ctx.session.user.id;

      // One bulk upsert, not N round-trips: a real test yields 100+ distinct
      // pairs, which overran the 5s interactive-transaction budget on the pooled
      // remote DB. INSERT ... ON CONFLICT increments in a single statement.
      const rows = stats.map(
        (s) => Prisma.sql`(gen_random_uuid()::text, ${userId}, ${s.pair}, ${s.count}, ${s.totalMs}, ${s.errors}, NOW())`,
      );
      await ctx.prisma.$executeRaw`
        INSERT INTO "TransitionStat" ("id", "userId", "pair", "count", "totalMs", "errors", "updatedAt")
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("userId", "pair") DO UPDATE SET
          "count" = "TransitionStat"."count" + EXCLUDED."count",
          "totalMs" = "TransitionStat"."totalMs" + EXCLUDED."totalMs",
          "errors" = "TransitionStat"."errors" + EXCLUDED."errors",
          "updatedAt" = NOW()
      `;

      return { count: stats.length };
    }),
});
