import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { DIFFICULTIES, type DifficultyName } from "~/lib/learnThresholds";

const difficultySchema = z.enum(DIFFICULTIES as [DifficultyName, ...DifficultyName[]]);

const learnProgressInput = z.object({
  options: z.string(),
  speed: z.number().min(0),
  accuracy: z.number().min(0).max(100),
  stars: z.number().int().min(0).max(3).optional(),
});

export const learnProgressRouter = createTRPCRouter({
  getByDifficulty: protectedProcedure
    .input(z.object({ difficulty: difficultySchema }))
    .query(({ ctx, input }) => {
      return ctx.prisma.learnProgress.findMany({
        where: {
          userId: ctx.session.user.id,
          difficulty: input.difficulty,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });
    }),

  complete: protectedProcedure
    .input(z.object({
      difficulty: difficultySchema,
      progress: learnProgressInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.prisma.learnProgress.findFirst({
        where: {
          userId,
          difficulty: input.difficulty,
          options: input.progress.options,
        },
      });

      if (!existing) {
        return ctx.prisma.learnProgress.create({
          data: {
            userId,
            difficulty: input.difficulty,
            options: input.progress.options,
            speed: input.progress.speed,
            accuracy: input.progress.accuracy,
            stars: input.progress.stars ?? 0,
          },
        });
      }

      return ctx.prisma.learnProgress.update({
        where: {
          id: existing.id,
        },
        data: {
          speed: Math.max(existing.speed, input.progress.speed),
          accuracy: Math.max(existing.accuracy, input.progress.accuracy),
          stars: Math.max(existing.stars, input.progress.stars ?? 0),
        },
      });
    }),

  batchImport: protectedProcedure
    .input(z.object({
      difficulty: difficultySchema,
      progress: z.array(learnProgressInput),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.progress.length === 0) {
        return { count: 0 };
      }

      const userId = ctx.session.user.id;
      const progressByOption = new Map<string, z.infer<typeof learnProgressInput>>();

      input.progress.forEach((progress) => {
        const current = progressByOption.get(progress.options);

        progressByOption.set(progress.options, {
          options: progress.options,
          speed: Math.max(current?.speed ?? 0, progress.speed),
          accuracy: Math.max(current?.accuracy ?? 0, progress.accuracy),
          stars: Math.max(current?.stars ?? 0, progress.stars ?? 0),
        });
      });

      const progress = Array.from(progressByOption.values());
      const existingProgress = await ctx.prisma.learnProgress.findMany({
        where: {
          userId,
          difficulty: input.difficulty,
          options: {
            in: progress.map((item) => item.options),
          },
        },
      });
      const existingByOption = new Map(
        existingProgress.map((item) => [item.options, item]),
      );

      await ctx.prisma.$transaction(progress.map((item) => {
        const existing = existingByOption.get(item.options);

        if (!existing) {
          return ctx.prisma.learnProgress.create({
            data: {
              userId,
              difficulty: input.difficulty,
              options: item.options,
              speed: item.speed,
              accuracy: item.accuracy,
              stars: item.stars ?? 0,
            },
          });
        }

        return ctx.prisma.learnProgress.update({
          where: {
            id: existing.id,
          },
          data: {
            speed: Math.max(existing.speed, item.speed),
            accuracy: Math.max(existing.accuracy, item.accuracy),
            stars: Math.max(existing.stars, item.stars ?? 0),
          },
        });
      }));

      return { count: progress.length };
    }),
});
