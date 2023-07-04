import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

export const testRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(z.object({ typeId: z.string(), count: z.number(), orderBy: z.string(), order: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.findMany({
        where: {
          typeId: input.typeId,
          count: input.count,
        },
        orderBy: {
          [input.orderBy]: input.order,
        }
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
        }
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
