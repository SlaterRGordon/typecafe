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
          background: input.background,
          text: input.text,
          primary: input.primary,
          secondary: input.secondary,
          neutral: input.neutral,
        },
      });
    })
    
});
