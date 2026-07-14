import { randomBytes } from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { consumePublicWriteQuota } from "~/server/rateLimit";
import type { PrismaClient } from "~/generated/prisma/client";
import { shareWpmSchema } from "~/lib/shareSnapshot";

const GUEST_SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GUEST_SHARE_LIMIT = 20;
const GUEST_SHARE_WINDOW_MS = 60 * 60 * 1000;

const slugSchema = z.string().min(8).max(32).regex(/^[a-zA-Z0-9_-]+$/);
const scoreSnapshotSchema = z.object({
  durationSeconds: z.number().finite().min(0).max(24 * 60 * 60),
  rawWpm: shareWpmSchema,
  netWpm: shareWpmSchema,
  accuracy: z.number().min(0).max(100),
  totalKeystrokes: z.number().int().min(0).max(50000),
  correctKeystrokes: z.number().int().min(0).max(50000),
  incorrectKeystrokes: z.number().int().min(0).max(50000),
  promptText: z.string().min(1).max(20000).optional(),
  typedText: z.string().max(20000),
  typedSegments: z.array(z.object({
    ch: z.string().min(1).max(2),
    correct: z.boolean(),
  })).max(20000).optional(),
  worstKeys: z.array(z.object({
    key: z.string(),
    accuracy: z.number().min(0).max(100),
    attempts: z.number().int().nonnegative(),
  })).max(20).optional(),
  brag: z.string().max(200).nullish(),
  avgDelta: z.number().finite().min(-1000).max(1000).nullish(),
  dailyChallenge: z.boolean().optional(),
  punctuation: z.boolean().optional(),
  capitals: z.boolean().optional(),
  numbers: z.boolean().optional(),
  ranked: z.boolean().optional(),
  // The keyboard layout the run was typed on (ledger decision 10); score
  // surfaces render this board, absent = qwerty.
  layout: z.string().max(32).optional(),
  wpmSamples: z.array(z.object({
    elapsedSeconds: z.number().finite().min(0).max(24 * 60 * 60),
    wpm: shareWpmSchema,
  })).max(600),
});

// A guest's finished test, shareable without an account: the snapshot carries
// the render fields (mode/language/count) that a signed-in share reads off the
// Test row instead.
const guestScoreSnapshotSchema = scoreSnapshotSchema.extend({
  count: z.number().int().min(1).max(5000),
  mode: z.number().int().min(0).max(4),
  subMode: z.number().int().min(0).max(1),
  language: z.string().min(1).max(40),
  options: z.string().max(100).optional(),
  speed: shareWpmSchema.optional(),
  score: z.number().optional(),
  createdAt: z.number().int().nonnegative(),
});

const beatRunSnapshotSchema = scoreSnapshotSchema.extend({
  promptText: z.string().min(1).max(20000),
  count: z.number().int().min(1).max(5000),
  mode: z.number().int().min(0).max(4),
  subMode: z.number().int().min(0).max(1),
  language: z.string().min(1).max(40),
  options: z.string().max(100).optional(),
  score: z.number().optional(),
  username: z.string().max(24).nullish(),
  sourceShareSlug: slugSchema.optional(),
  attemptNumber: z.number().int().positive().optional(),
  createdAt: z.number().int().nonnegative(),
});

// A point-in-time /progress snapshot - the "+18 WPM in 60 days" brag any user
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

type GuestShareContext = {
  prisma: Pick<PrismaClient, "$queryRaw" | "publicWriteQuota" | "scoreShare">;
  requestIdentity: string;
};

async function enforceGuestShareQuota(ctx: GuestShareContext) {
  const quota = await consumePublicWriteQuota(ctx.prisma, {
    scope: "guest-score-share",
    identity: ctx.requestIdentity,
    limit: GUEST_SHARE_LIMIT,
    windowMs: GUEST_SHARE_WINDOW_MS,
  });
  if (!quota.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many share links. Try again in ${quota.retryAfterSeconds} seconds.`,
    });
  }
}

async function cleanupExpiredGuestShares(ctx: GuestShareContext) {
  await ctx.prisma.scoreShare.deleteMany({ where: { expiresAt: { lt: new Date() } } });
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

  createGuestScore: publicProcedure
    .input(z.object({ snapshot: guestScoreSnapshotSchema }))
    .mutation(async ({ ctx, input }) => {
      await enforceGuestShareQuota(ctx);
      await cleanupExpiredGuestShares(ctx);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await ctx.prisma.scoreShare.create({
            data: {
              slug: createShareSlug(),
              kind: "score",
              testId: null,
              userId: ctx.session?.user?.id ?? null,
              snapshot: input.snapshot,
              expiresAt: new Date(Date.now() + GUEST_SHARE_TTL_MS),
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
      await enforceGuestShareQuota(ctx);
      await cleanupExpiredGuestShares(ctx);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await ctx.prisma.scoreShare.create({
            data: {
              slug: createShareSlug(),
              kind: "beat",
              testId: null,
              userId: ctx.session?.user?.id ?? null,
              snapshot: input.snapshot,
              expiresAt: new Date(Date.now() + GUEST_SHARE_TTL_MS),
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
              numbers: share.test.numbers,
              ranked: share.test.ranked,
              createdAt: share.test.createdAt,
              mode: share.test.type.mode,
              subMode: share.test.type.subMode,
              language: share.test.type.language,
              layout: share.test.layout,
            }
          : null,
        snapshot: share.snapshot,
        user: share.user,
      };
    }),
});
