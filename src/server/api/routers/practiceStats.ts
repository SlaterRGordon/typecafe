import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

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

      await ctx.prisma.$transaction(
        input.stats.map((stat) =>
          ctx.prisma.practiceStats.upsert({
            where: {
              userId_character: {
                userId,
                character: stat.character,
              },
            },
            create: {
              userId,
              character: stat.character,
              total: stat.total,
              correct: stat.correct,
            },
            update: {
              total: { increment: stat.total },
              correct: { increment: stat.correct },
            },
          }),
        ),
      );

      return { count: input.stats.length };
    }),
});
