import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { Prisma } from "~/generated/prisma/client";
import { KEY_ATTEMPT_CAP } from "~/lib/practiceAttempts";

// Aggregates are keyed per stats pool (docs/features/keyboard-layouts.md
// decision 6): clients send statsPoolFor(activeLayout) - "qwerty" for every
// national layout, the remap's own id otherwise. Absent = the legacy qwerty
// pool, so old clients and rows keep working.
const poolSchema = z.string().max(32).optional();

const practiceStatInput = z
  .object({
    character: z.string().length(1),
    total: z.number().int().min(0),
    correct: z.number().int().min(0),
  })
  .refine((data) => data.correct <= data.total, {
    message: "correct cannot exceed total",
  });

export const practiceStatsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ pool: poolSchema }).optional())
    .query(({ ctx, input }) => {
      return ctx.prisma.practiceStats.findMany({
        where: {
          userId: ctx.session.user.id,
          pool: input?.pool ?? "qwerty",
        },
        orderBy: {
          character: "asc",
        },
      });
    }),

  batchSync: protectedProcedure
    .input(
      z.object({
        stats: z.array(practiceStatInput),
        pool: poolSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.stats.length === 0) {
        return { count: 0 };
      }

      const userId = ctx.session.user.id;
      const pool = input.pool ?? "qwerty";

      // One bulk upsert (same pattern as transitionStats.batchSync) applying
      // the rolling window (ADR-0005): sum, then if a key overflows the attempt
      // cap, scale total/correct down proportionally - accuracy preserved, old
      // history stops anchoring the ratio. Mirrors lib/localSync mergeKeyStats.
      const rows = input.stats.map(
        (s) => Prisma.sql`(gen_random_uuid()::text, ${userId}, ${pool}, ${s.character}, ${s.total}, ${s.correct}, NOW())`,
      );
      await ctx.prisma.$executeRaw`
        INSERT INTO "PracticeStats" ("id", "userId", "pool", "character", "total", "correct", "updatedAt")
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("userId", "pool", "character") DO UPDATE SET
          "total" = LEAST("PracticeStats"."total" + EXCLUDED."total", ${KEY_ATTEMPT_CAP}),
          "correct" = CASE
            WHEN "PracticeStats"."total" + EXCLUDED."total" > ${KEY_ATTEMPT_CAP}
            THEN ROUND(("PracticeStats"."correct" + EXCLUDED."correct")::numeric * ${KEY_ATTEMPT_CAP} / ("PracticeStats"."total" + EXCLUDED."total"))::int
            ELSE "PracticeStats"."correct" + EXCLUDED."correct"
          END,
          "updatedAt" = NOW()
      `;

      return { count: input.stats.length };
    }),
});
