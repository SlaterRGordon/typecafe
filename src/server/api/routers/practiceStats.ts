import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { Prisma } from "~/generated/prisma/client";
import { KEY_ATTEMPT_CAP } from "~/lib/practiceAttempts";

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
  get: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.practiceStats.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: {
        character: "asc",
      },
    });
  }),

  create: protectedProcedure
    .input(practiceStatInput)
    .mutation(({ ctx, input }) => {
      return ctx.prisma.practiceStats.create({
        data: {
          userId: ctx.session.user.id,
          character: input.character,
          total: input.total,
          correct: input.correct,
        },
      });
    }),

  update: protectedProcedure
    .input(practiceStatInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const currentStats = await ctx.prisma.practiceStats.findFirst({
        where: {
          userId,
          character: input.character,
        },
        select: {
          id: true,
          total: true,
          correct: true,
        },
      });

      if (!currentStats) {
        return ctx.prisma.practiceStats.create({
          data: {
            userId,
            character: input.character,
            total: input.total,
            correct: input.correct,
          },
        });
      }

      return ctx.prisma.practiceStats.update({
        where: {
          id: currentStats.id,
        },
        data: {
          total: currentStats.total + input.total,
          correct: currentStats.correct + input.correct,
        },
      });
    }),

  batchSync: protectedProcedure
    .input(
      z.object({
        stats: z.array(practiceStatInput),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.stats.length === 0) {
        return { count: 0 };
      }

      const userId = ctx.session.user.id;

      // One bulk upsert (same pattern as transitionStats.batchSync) applying
      // the rolling window (ADR-0005): sum, then if a key overflows the attempt
      // cap, scale total/correct down proportionally — accuracy preserved, old
      // history stops anchoring the ratio. Mirrors lib/localSync mergeKeyStats.
      const rows = input.stats.map(
        (s) => Prisma.sql`(gen_random_uuid()::text, ${userId}, ${s.character}, ${s.total}, ${s.correct}, NOW())`,
      );
      await ctx.prisma.$executeRaw`
        INSERT INTO "PracticeStats" ("id", "userId", "character", "total", "correct", "updatedAt")
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("userId", "character") DO UPDATE SET
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
