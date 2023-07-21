import { z } from "zod";

import {
    createTRPCRouter,
    protectedProcedure,
} from "~/server/api/trpc";

export const userRouter = createTRPCRouter({
    update: protectedProcedure
        .input(z.object({
            name: z.string(),
            bio: z.string().optional(),
            link: z.string().optional(),
        }))
        .mutation(({ ctx, input }) => {
            return ctx.prisma.user.update({
                where: {
                    id: ctx.session?.user.id,
                },
                data: {
                    name: input.name,
                    bio: input.bio,
                    link: input.link,
                },
            });
        }),
    get: protectedProcedure
        .query(({ ctx }) => {
            return ctx.prisma.user.findUnique({
                where: {
                    id: ctx.session?.user.id,
                },
            });
        }),
});
