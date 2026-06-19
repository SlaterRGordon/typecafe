import { randomBytes } from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

const slugSchema = z.string().min(8).max(32).regex(/^[a-zA-Z0-9_-]+$/);
const scoreSnapshotSchema = z.object({
  durationSeconds: z.number().nonnegative(),
  rawWpm: z.number().nonnegative(),
  netWpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  totalKeystrokes: z.number().int().nonnegative(),
  correctKeystrokes: z.number().int().nonnegative(),
  incorrectKeystrokes: z.number().int().nonnegative(),
  promptText: z.string().min(1).max(20000).optional(),
  typedText: z.string(),
  typedSegments: z.array(z.object({
    ch: z.string(),
    correct: z.boolean(),
  })).optional(),
  worstKeys: z.array(z.object({
    key: z.string(),
    accuracy: z.number().min(0).max(100),
    attempts: z.number().int().nonnegative(),
  })).optional(),
  brag: z.string().nullish(),
  avgDelta: z.number().nullish(),
  punctuation: z.boolean().optional(),
  capitals: z.boolean().optional(),
  ranked: z.boolean().optional(),
  wpmSamples: z.array(z.object({
    elapsedSeconds: z.number().nonnegative(),
    wpm: z.number().nonnegative(),
  })),
});

const beatRunSnapshotSchema = scoreSnapshotSchema.extend({
  promptText: z.string().min(1).max(20000),
  count: z.number().int().nonnegative(),
  mode: z.number().int().nonnegative(),
  subMode: z.number().int().nonnegative(),
  language: z.string().min(1).max(40),
  options: z.string().optional(),
  score: z.number().optional(),
  username: z.string().nullish(),
  sourceShareSlug: slugSchema.optional(),
  attemptNumber: z.number().int().positive().optional(),
  createdAt: z.number().int().nonnegative(),
});

// A point-in-time /progress snapshot — the "+18 WPM in 60 days" brag any user
// can share, not tied to a single test.
const progressSnapshotSchema = z.object({
  deltaWpm: z.number(),
  periodLabel: z.string().min(1).max(40),
  points: z.array(z.object({
    t: z.number(),
    wpm: z.number().nonnegative(),
  })).min(1).max(2000),
  streak: z.number().int().nonnegative().optional(),
  username: z.string().nullish(),
  generatedAt: z.number(),
});

function createShareSlug() {
  return randomBytes(9).toString("base64url");
}

export const scoreShareRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      testId: z.string().min(1),
      snapshot: scoreSnapshotSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.prisma.test.findFirst({
        where: {
          id: input.testId,
          userId: ctx.session.user.id,
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!test) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This score is unavailable.",
        });
      }

      const existingShare = await ctx.prisma.scoreShare.findFirst({
        where: {
          testId: test.id,
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
          slug: true,
          snapshot: true,
        },
      });

      if (existingShare) {
        if (!existingShare.snapshot && input.snapshot) {
          return ctx.prisma.scoreShare.update({
            where: {
              slug: existingShare.slug,
            },
            data: {
              snapshot: input.snapshot,
            },
            select: {
              slug: true,
            },
          });
        }

        return { slug: existingShare.slug };
      }

      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await ctx.prisma.scoreShare.create({
            data: {
              slug: createShareSlug(),
              testId: test.id,
              userId: test.userId,
              snapshot: input.snapshot,
            },
            select: {
              slug: true,
            },
          });
        } catch (error) {
          if (attempt === 3) throw error;
        }
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not create a share link.",
      });
    }),

  createProgress: protectedProcedure
    .input(z.object({ snapshot: progressSnapshotSchema }))
    .mutation(async ({ ctx, input }) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await ctx.prisma.scoreShare.create({
            data: {
              slug: createShareSlug(),
              kind: "progress",
              testId: null,
              userId: ctx.session.user.id,
              snapshot: input.snapshot,
            },
            select: { slug: true },
          });
        } catch (error) {
          if (attempt === 3) throw error;
        }
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create a share link." });
    }),

  createBeatRun: publicProcedure
    .input(z.object({ snapshot: beatRunSnapshotSchema }))
    .mutation(async ({ ctx, input }) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await ctx.prisma.scoreShare.create({
            data: {
              slug: createShareSlug(),
              kind: "beat",
              testId: null,
              userId: ctx.session?.user?.id ?? null,
              snapshot: input.snapshot,
            },
            select: { slug: true },
          });
        } catch (error) {
          if (attempt === 3) throw error;
        }
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create a beat-my-run link." });
    }),

  get: publicProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ ctx, input }) => {
      const share = await ctx.prisma.scoreShare.findUnique({
        where: {
          slug: input.slug,
        },
        include: {
          test: {
            include: {
              type: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              image: true,
            },
          },
        },
      });

      if (!share || share.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This shared score is unavailable.",
        });
      }

      if (share.expiresAt && share.expiresAt <= new Date()) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This shared score has expired.",
        });
      }

      return {
        id: share.id,
        slug: share.slug,
        kind: share.kind,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
        // null for a progress share (no single test backs it).
        score: share.test
          ? {
              id: share.test.id,
              speed: share.test.speed,
              accuracy: share.test.accuracy,
              score: share.test.score,
              count: share.test.count,
              options: share.test.options,
              punctuation: share.test.punctuation,
              capitals: share.test.capitals,
              ranked: share.test.ranked,
              createdAt: share.test.createdAt,
              mode: share.test.type.mode,
              subMode: share.test.type.subMode,
              language: share.test.type.language,
            }
          : null,
        snapshot: share.snapshot,
        user: share.user,
      };
    }),
});
