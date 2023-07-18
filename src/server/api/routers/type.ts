import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

export const typeRouter = createTRPCRouter({
  get: publicProcedure
    .input(z.object({ 
      mode: z.number().optional(), 
      subMode: z.number().optional(), 
      language: z.string().optional()
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.testType.findFirst({
        where: {
          mode: input.mode,
          subMode: input.subMode,
          language: input.language,
        },
      });
    }),
    getAll: publicProcedure
    .input(z.object({ 
      mode: z.number().optional(), 
      subMode: z.number().optional(), 
      language: z.string().optional()
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.testType.findMany({
        where: {
          mode: input.mode,
          subMode: input.subMode,
          language: input.language,
        },
      });
    }),
  create: publicProcedure
    .input(z.object({
      mode: z.number(),
      subMode: z.number(),
      language: z.string(),
      competitive: z.boolean(),
    }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.testType.create({
        data: {
          mode: input.mode,
          subMode: input.subMode,
          language: input.language,
          competitive: input.competitive,
        },
      });
    })
});
