import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

export const testRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(z.object({
      byUser: z.boolean().default(false),
      typeId: z.string(),
      count: z.number(),
      date: z.date().optional(),
      orderBy: z.string(),
      order: z.string(),
      limit: z.number(),
      page: z.number()
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.findMany({
        where: {
          userId: input.byUser ? ctx.session?.user.id : undefined,
          typeId: input.typeId,
          count: input.count,
          createdAt: {
            gte: input.date,
          },
        },
        orderBy: {
          [input.orderBy]: input.order,
        },
        take: input.limit,
        skip: input.page * input.limit,
        include: {
          user: true,
        },
      });
    }),
  getByUser: protectedProcedure
    .input(z.object({ typeId: z.string(), orderBy: z.string(), order: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.findMany({
        where: {
          userId: ctx.session?.user.id,
          typeId: input.typeId,
        },
        orderBy: {
          [input.orderBy]: input.order,
        },
        include: {
          user: true,
        },
      });
    }),
  create: protectedProcedure
    .input(z.object({
      typeId: z.string(),
      speed: z.number(),
      accuracy: z.number(),
      score: z.number(),
      count: z.number(),
      options: z.string()
    }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.test.create({
        data: {
          userId: ctx.session?.user.id,
          typeId: input.typeId,
          speed: input.speed,
          accuracy: input.accuracy,
          score: input.score,
          count: input.count,
          options: input.options,
          summaryDate: new Date(),
        },
      });
    }),
  getActivityByDate: publicProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.groupBy({
        by: ["summaryDate"],
        _count: {
          _all: true,
        },
        where: {
          userId: ctx.session?.user.id,
          summaryDate: {
            gte: input.startDate,
            lte: input.endDate,
          },
        },
      });
    }),
  getTimeTyped: publicProcedure
    .input(z.object({ typeIds: z.string().array() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.aggregate({
        _sum: {
          count: true,
        },
        where: {
          userId: ctx.session?.user.id,
          typeId: { in: input.typeIds },
        },
      });
    }),
  getBestScore: publicProcedure
    .query(({ ctx }) => {
      return ctx.prisma.test.findFirst({
        where: {
          userId: ctx.session?.user.id,
        },
        orderBy: {
          score: "desc",
        },
      });
    }),
  getPercentile: publicProcedure
    .query(async ({ ctx }) => {
      const userBest = await ctx.prisma.test.findFirst({
        where: {
          userId: ctx.session?.user.id,
        },
        orderBy: {
          score: "desc",
        },
      })
      const scoresBetter = await ctx.prisma.test.findMany({
        where: {
          score: {
            gt: userBest ? userBest.score : 0
          }
        },
        distinct: ['userId'],
        orderBy: { score: 'desc' },
      })
      const scoresWorse = await ctx.prisma.test.findMany({
        where: {
          score: {
            lt: userBest ? userBest.score : 999999
          }
        },
        distinct: ['userId'],
        orderBy: { score: 'desc' },
      })

      return {
        better: scoresBetter.length,
        worse: scoresWorse.length,
        total: scoresBetter.length + scoresWorse.length,
        percentile: (scoresBetter.length / (scoresBetter.length + scoresWorse.length)) * 100,
      }
    }),
  });