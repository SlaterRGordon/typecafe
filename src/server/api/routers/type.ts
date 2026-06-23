import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure
} from "~/server/api/trpc";
import { baseTypeLanguage } from "~/lib/typeLanguage";

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
          language: baseTypeLanguage(input.language),
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
          language: baseTypeLanguage(input.language),
        },
      });
    }),
  create: protectedProcedure
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
