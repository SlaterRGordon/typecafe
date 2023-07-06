import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

export const testRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(z.object({
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
          options: input.options
        },
      });
    })

});
