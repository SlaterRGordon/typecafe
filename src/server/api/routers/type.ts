import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

export const typeRouter = createTRPCRouter({
  get: publicProcedure
    .input(z.object({ mode: z.number(), subMode: z.number() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.testType.findFirst({
        where: {
          mode: input.mode,
          subMode: input.subMode,
        },
      });
    }),
});
