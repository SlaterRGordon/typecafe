import { TRPCError } from "@trpc/server";
import { hash } from "bcrypt";
import { z } from "zod";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
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
            console.log(ctx.session);
            return ctx.prisma.user.findUnique({
                where: {
                    id: ctx.session?.user.id,
                },
            });
        }),
    getUserByUsername: protectedProcedure
        .input(z.object({
            username: z.string(),
        }))
        .query(({ ctx, input }) => {
            return ctx.prisma.user.findFirst({
                where: {
                    username: input.username,
                },
            });
        }),
    getUserByEmail: protectedProcedure
        .input(z.object({
            email: z.string(),
        }))
        .query(({ ctx, input }) => {
            return ctx.prisma.user.findFirst({
                where: {
                    email: input.email,
                },
            });
        }),
    createUser: protectedProcedure
        .input(z.object({
            email: z.string(),
            username: z.string(),
            password: z.string(),
        }))
        .mutation(({ ctx, input }) => {
            return ctx.prisma.user.create({
                data: {
                    name: input.username,
                    username: input.username,
                    email: input.email,
                    password: input.password,
                },
            });
        }),
    registerUser: publicProcedure
        .input(z.object({
            email: z.string(),
            username: z.string(),
            password: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { username, email, password } = input;
            const exists = await ctx.prisma.user.findFirst({
                where: { email },
            });
            if (exists) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "User already exists.",
                });
            }

            const hashedPassword: string = await hash(password, 10);

            const result = await ctx.prisma.user.create({
                data: {
                    name: username,
                    username: username,
                    email: email,
                    password: hashedPassword,
                },
            });

            return {
                status: 201,
                message: "Account created successfully",
                result: result.email,
            };
        }),
});
