import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

export const colorRouter = createTRPCRouter({
  getByUser: protectedProcedure
    .query(({ ctx }) => {
      return ctx.prisma.colorConfiguration.findMany({
        where: {
          userId: ctx.session?.user.id,
        },
      });
    }),
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      background: z.string(),
      text: z.string(),
      primary: z.string(),
      secondary: z.string(),
      neutral: z.string(),
    }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.colorConfiguration.create({
        data: {
          userId: ctx.session?.user.id,
          name: input.name,
          background: input.background,
          text: input.text,
          primary: input.primary,
          secondary: input.secondary,
          neutral: input.neutral,
        },
      });
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.colorConfiguration.delete({
        where: {
          id: input.id,
        },
      });
    }),

});
