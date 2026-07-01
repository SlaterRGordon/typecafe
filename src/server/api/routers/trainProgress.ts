import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { DIFFICULTIES, type DifficultyName } from "~/lib/trainThresholds";
import { trainProfileSummary } from "~/lib/trainProfile";

const difficultySchema = z.enum(DIFFICULTIES as [DifficultyName, ...DifficultyName[]]);

const trainProgressInput = z.object({
  options: z.string(),
  speed: z.number().min(0),
  accuracy: z.number().min(0).max(100),
  stars: z.number().int().min(0).max(3).optional(),
});

export const trainProgressRouter = createTRPCRouter({
  getSummary: publicProcedure
    .input(z.object({ userId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.session?.user.id;
      if (!userId) return trainProfileSummary([]);

      const rows = await ctx.prisma.trainProgress.findMany({
        where: { userId },
        select: {
          difficulty: true,
          options: true,
          speed: true,
          accuracy: true,
          stars: true,
        },
      });

      return trainProfileSummary(rows);
    }),

  getByDifficulty: protectedProcedure
    .input(z.object({ difficulty: difficultySchema }))
    .query(({ ctx, input }) => {
      return ctx.prisma.trainProgress.findMany({
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
      progress: trainProgressInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.prisma.trainProgress.findFirst({
        where: {
          userId,
          difficulty: input.difficulty,
          options: input.progress.options,
        },
      });

      if (!existing) {
        return ctx.prisma.trainProgress.create({
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

      return ctx.prisma.trainProgress.update({
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
      progress: z.array(trainProgressInput),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.progress.length === 0) {
        return { count: 0 };
      }

      const userId = ctx.session.user.id;
      const progressByOption = new Map<string, z.infer<typeof trainProgressInput>>();

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
      const existingProgress = await ctx.prisma.trainProgress.findMany({
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
          return ctx.prisma.trainProgress.create({
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

        return ctx.prisma.trainProgress.update({
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
