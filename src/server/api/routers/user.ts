import { TRPCError } from "@trpc/server";
import { hash } from "bcrypt";
import { z } from "zod";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "~/server/api/trpc";

const publicUserSelect = {
    id: true,
    name: true,
    email: true,
    emailVerified: true,
    username: true,
    image: true,
    bio: true,
    link: true,
} as const;

const avatarImageSchema = z
    .string()
    .url()
    .refine((value) => {
        const { protocol, hostname } = new URL(value);

        return protocol === "https:" && hostname.endsWith(".public.blob.vercel-storage.com");
    }, "Profile picture must be a Vercel Blob URL.");

export const userRouter = createTRPCRouter({
    update: protectedProcedure
        .input(z.object({
            username: z.string().optional(),
            name: z.string().optional(),
            bio: z.string().optional(),
            link: z.string().optional(),
            image: avatarImageSchema.nullable().optional(),
        }))
        .mutation(({ ctx, input }) => {
            return ctx.prisma.user.update({
                where: {
                    id: ctx.session?.user.id,
                },
                data: {
                    username: input.username,
                    name: input.name,
                    bio: input.bio,
                    link: input.link,
                    image: input.image,
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
    getUserByUsername: protectedProcedure
        .input(z.object({
            username: z.string(),
        }))
        .query(({ ctx, input }) => {
            return ctx.prisma.user.findFirst({
                where: {
                    username: input.username,
                },
                select: publicUserSelect,
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
                select: publicUserSelect,
            });
        }),
    createUser: protectedProcedure
        .input(z.object({
            email: z.string(),
            username: z.string(),
            password: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const hashedPassword: string = await hash(input.password, 10);

            return ctx.prisma.user.create({
                data: {
                    name: input.username,
                    username: input.username,
                    email: input.email,
                    password: hashedPassword,
                },
            });
        }),
    delete: protectedProcedure
        .mutation(({ ctx }) => {
            return ctx.prisma.user.delete({
                where: {
                    id: ctx.session?.user.id,
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

            const emailExists = await ctx.prisma.user.findFirst({
                where: { email },
            });
            if (emailExists) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Email already in use.",
                });
            }

            const usernameExists = await ctx.prisma.user.findFirst({
                where: { username },
            });
            if (usernameExists) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Username already in use.",
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
    checkUsernameExists: publicProcedure
        .input(z.object({
            username: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            const usernameExists = await ctx.prisma.user.findFirst({
                where: {
                    username: {
                        equals: input.username,
                        mode: "insensitive",
                    }
                },
            });

            return usernameExists ? true : false;
        }),
    getProfileByUsername: publicProcedure
        .input(z.object({
            username: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            return ctx.prisma.user.findFirst({
                where: {
                    username: input.username,
                },
                select: {
                    id: true,
                    image: true,
                    username: true,
                    bio: true,
                    link: true,
                },
            });
        }),
});
