import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

export const blogRouter = createTRPCRouter({
  getAll: publicProcedure
    .query(({ ctx }) => {
      return ctx.prisma.blogPost.findMany({
        include: {
          images: true,
          author: true,
        },
      });
    }),
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.blogPost.findUnique({
        where: {
          id: input.id,
        },
        include: {
          images: true,
          author: true,
        },
      });
    }),
  create: protectedProcedure
    .input(z.object({
      title: z.string(),
      content: z.string(),
      images: z.array(z.object({
        blob: z.instanceof(Buffer),
      })),
    }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.blogPost.create({
        data: {
          title: input.title,
          content: input.content,
          authorId: ctx.session?.user.id,
          images: {
            create: input.images.map(image => ({
              blob: image.blob,
            })),
          },
        },
      });
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      images: z.array(z.object({
        blob: z.instanceof(Buffer),
      })).optional(),
    }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.blogPost.update({
        where: {
          id: input.id,
        },
        data: {
          title: input.title,
          content: input.content,
          images: input.images ? {
            deleteMany: {},
            create: input.images.map(image => ({
              blob: image.blob,
            })),
          } : undefined,
        },
      });
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.blogPost.delete({
        where: {
          id: input.id,
        },
      });
    }),
});