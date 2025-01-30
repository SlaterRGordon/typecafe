import { z } from "zod";
import { zfd } from "zod-form-data";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

export const blogRouter = createTRPCRouter({
  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.prisma.blogPost.findMany({
      include: {
        image: true,
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
          author: true,
        },
      });
    }),
  create: publicProcedure
    .input(
      z.object({
        formData: zfd.formData({
          title: zfd.text(),
          description: zfd.text(),
          content: zfd.text(),
          image: zfd.file(),
        })
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const data: any = {
        title: input.formData.title,
        description: input.formData.description,
        authorId: ctx.session?.user.id,
        content: input.formData.content,
      };

      console.log(data);

      const blob = await input.formData.image.arrayBuffer();
      data.image = {
        create: {
          blob: blob,
        },
      };

      return ctx.prisma.blogPost.create({
        data,
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        content: z.string().optional(),
        image: z
          .object({
            blob: z.instanceof(Buffer),
          })
          .optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return ctx.prisma.blogPost.update({
        where: {
          id: input.id,
        },
        data: {
          title: input.title,
          description: input.description,
          content: input.content || "",
          image: input.image
            ? {
              create: {
                blob: input.image.blob,
              },
            }
            : undefined,
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