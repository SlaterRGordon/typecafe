import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

export const practiceStatsRouter = createTRPCRouter({
  get: protectedProcedure
    .query(({ ctx }) => {
      return ctx.prisma.practiceStats.findFirst({
        where: {
          userId: ctx.session?.user.id,
        },
      });
    }),
  create: protectedProcedure
    .input(z.object({
      character: z.string(),
      total: z.number(),
      correct: z.number(),
    }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.practiceStats.create({
        data: {
          userId: ctx.session?.user.id,
          character: input.character,
          total: input.total,
          correct: input.correct,
        },
      });
    }),
  update: protectedProcedure
    .input(z.object({
      character: z.string(),
      total: z.number(),
      correct: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch the current values
      const currentStats = await ctx.prisma.practiceStats.findUnique({
        where: {
          id: ctx.session?.user.id,
          character: input.character,
        },
        select: {
          total: true,
          correct: true,
        },
      });

      // If no current stats then create new stats
      if (!currentStats) {
        return ctx.prisma.practiceStats.create({
          data: {
            userId: ctx.session?.user.id,
            character: input.character,
            total: input.total,
            correct: input.correct,
          },
        });
      }

      return ctx.prisma.practiceStats.update({
        where: {
          id: ctx.session?.user.id,
        },
        data: {
          total: currentStats.total + input.total,
          correct: currentStats.correct + input.correct,
        },
      });
    }),
});
