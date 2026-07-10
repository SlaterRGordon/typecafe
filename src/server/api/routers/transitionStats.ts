import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { Prisma } from "~/generated/prisma/client";
import { isTrackableTransitionPair } from "~/lib/drillableTransitions";
import { TRANSITION_SAMPLE_CAP } from "~/lib/transitions";

// Aggregates are keyed per stats pool (docs/features/keyboard-layouts.md
// decision 6); absent = the legacy qwerty pool. Clients send
// statsPoolFor(activeLayout).
const poolSchema = z.string().max(32).optional();

const transitionInput = z.object({
  pair: z.string().length(2),
  count: z.number().int().min(0),
  totalMs: z.number().int().min(0),
  errors: z.number().int().min(0),
});

export const transitionStatsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ pool: poolSchema }).optional())
    .query(({ ctx, input }) => {
      return ctx.prisma.transitionStat.findMany({
        where: { userId: ctx.session.user.id, pool: input?.pool ?? "qwerty" },
        select: { pair: true, count: true, totalMs: true, errors: true },
      });
    }),

  // Derived-on-write: each completed test's per-pair aggregates are added to the
  // user's lifetime rows (upsert + increment), mirroring practiceStats.batchSync.
  batchSync: protectedProcedure
    .input(z.object({ stats: z.array(transitionInput), pool: poolSchema }))
    .mutation(async ({ ctx, input }) => {
      const stats = input.stats
        .map((stat) => ({ ...stat, pair: stat.pair.toLowerCase() }))
        .filter((stat) => isTrackableTransitionPair(stat.pair));
      if (stats.length === 0) return { count: 0 };
      const userId = ctx.session.user.id;
      const pool = input.pool ?? "qwerty";

      // One bulk upsert, not N round-trips: a real test yields 100+ distinct
      // pairs, which overran the 5s interactive-transaction budget on the pooled
      // remote DB. INSERT ... ON CONFLICT increments in a single statement.
      const rows = stats.map(
        (s) => Prisma.sql`(gen_random_uuid()::text, ${userId}, ${pool}, ${s.pair}, ${s.count}, ${s.totalMs}, ${s.errors}, NOW())`,
      );
      // Rolling window (ADR-0005), same arithmetic as lib/transitions
      // mergeTransitions: sum, then if the pair overflows the sample cap, scale
      // count/totalMs/errors down proportionally (mean + error rate preserved).
      // All SET expressions read the pre-update row, so the three columns share
      // one consistent scale factor.
      await ctx.prisma.$executeRaw`
        INSERT INTO "TransitionStat" ("id", "userId", "pool", "pair", "count", "totalMs", "errors", "updatedAt")
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("userId", "pool", "pair") DO UPDATE SET
          "count" = LEAST("TransitionStat"."count" + EXCLUDED."count", ${TRANSITION_SAMPLE_CAP}),
          "totalMs" = CASE
            WHEN "TransitionStat"."count" + EXCLUDED."count" > ${TRANSITION_SAMPLE_CAP}
            THEN ROUND(("TransitionStat"."totalMs" + EXCLUDED."totalMs")::numeric * ${TRANSITION_SAMPLE_CAP} / ("TransitionStat"."count" + EXCLUDED."count"))::int
            ELSE "TransitionStat"."totalMs" + EXCLUDED."totalMs"
          END,
          "errors" = CASE
            WHEN "TransitionStat"."count" + EXCLUDED."count" > ${TRANSITION_SAMPLE_CAP}
            THEN ROUND(("TransitionStat"."errors" + EXCLUDED."errors")::numeric * ${TRANSITION_SAMPLE_CAP} / ("TransitionStat"."count" + EXCLUDED."count"))::int
            ELSE "TransitionStat"."errors" + EXCLUDED."errors"
          END,
          "updatedAt" = NOW()
      `;

      return { count: stats.length };
    }),
});
