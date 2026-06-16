import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

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
      if (input.stats.length === 0) return { count: 0 };
      const userId = ctx.session.user.id;

      await ctx.prisma.$transaction(
        input.stats.map((stat) =>
          ctx.prisma.transitionStat.upsert({
            where: { userId_pair: { userId, pair: stat.pair } },
            create: { userId, pair: stat.pair, count: stat.count, totalMs: stat.totalMs, errors: stat.errors },
            update: {
              count: { increment: stat.count },
              totalMs: { increment: stat.totalMs },
              errors: { increment: stat.errors },
            },
          }),
        ),
      );

      return { count: input.stats.length };
    }),
});
