import { TRPCError } from "@trpc/server";
import { hash } from "bcrypt";
import { z } from "zod";
import { Prisma } from "~/generated/prisma/client";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "~/server/api/trpc";
import {
    profileUpdateSchema,
    publicUsernameLookupSchema,
    registrationSchema,
    usernameSchema,
} from "~/lib/userProfile";
import { privateUserSelect, publicUserSelect } from "~/server/db/userSelect";

const avatarImageSchema = z
    .string()
    .url()
    .refine((value) => {
        const { protocol, hostname } = new URL(value);

        return protocol === "https:" && hostname.endsWith(".public.blob.vercel-storage.com");
    }, "Profile picture must be a Vercel Blob URL.");

function isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const userRouter = createTRPCRouter({
    update: protectedProcedure
        .input(profileUpdateSchema.extend({
            image: avatarImageSchema.nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            if (input.username) {
                const existing = await ctx.prisma.user.findFirst({
                    where: {
                        id: { not: ctx.session.user.id },
                        username: { equals: input.username, mode: "insensitive" },
                    },
                    select: { id: true },
                });
                if (existing) throw new TRPCError({ code: "CONFLICT", message: "Username already in use." });
            }

            try {
                return await ctx.prisma.user.update({
                    where: { id: ctx.session.user.id },
                    data: {
                        username: input.username,
                        bio: input.bio,
                        link: input.link === "" ? null : input.link,
                        image: input.image,
                    },
                    select: privateUserSelect,
                });
            } catch (error) {
                if (isUniqueConflict(error)) throw new TRPCError({ code: "CONFLICT", message: "Username already in use." });
                throw error;
            }
        }),
    get: protectedProcedure
        .query(({ ctx }) => {
            return ctx.prisma.user.findUnique({
                where: { id: ctx.session.user.id },
                select: privateUserSelect,
            });
        }),
    delete: protectedProcedure
        .mutation(({ ctx }) => {
            return ctx.prisma.user.delete({
                where: {
                    id: ctx.session?.user.id,
                },
                select: { id: true },
            });
        }),
    registerUser: publicProcedure
        .input(registrationSchema)
        .mutation(async ({ ctx, input }) => {
            const { username, email, password } = input;

            const emailExists = await ctx.prisma.user.findFirst({
                where: { email: { equals: email, mode: "insensitive" } },
                select: { id: true },
            });
            if (emailExists) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Email already in use.",
                });
            }

            const usernameExists = await ctx.prisma.user.findFirst({
                where: { username: { equals: username, mode: "insensitive" } },
                select: { id: true },
            });
            if (usernameExists) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Username already in use.",
                });
            }

            const hashedPassword: string = await hash(password, 10);

            try {
                await ctx.prisma.user.create({
                    data: { name: username, username, email, password: hashedPassword },
                    select: { id: true },
                });
            } catch (error) {
                if (isUniqueConflict(error)) {
                    throw new TRPCError({ code: "CONFLICT", message: "Email or username already in use." });
                }
                throw error;
            }

            return {
                status: 201,
                message: "Account created successfully",
            };
        }),
    checkUsernameExists: publicProcedure
        .input(z.object({
            username: z.string().trim().max(64),
        }))
        .query(async ({ ctx, input }) => {
            if (!usernameSchema.safeParse(input.username).success) return true;
            const usernameExists = await ctx.prisma.user.findFirst({
                where: {
                    username: {
                        equals: input.username,
                        mode: "insensitive",
                    }
                },
            });

            return !!usernameExists;
        }),
    getProfileByUsername: publicProcedure
        .input(z.object({
            username: publicUsernameLookupSchema,
        }))
        .query(async ({ ctx, input }) => {
            return ctx.prisma.user.findFirst({
                where: {
                    username: { equals: input.username, mode: "insensitive" },
                },
                select: publicUserSelect,
            });
        }),
});
