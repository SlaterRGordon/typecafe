import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import type { PrismaClient } from "~/generated/prisma/client";
import { currentStreak } from "~/lib/progress";

// Only surface a percentile brag when it is flattering — never tell a slow typer
// they are "faster than 8% of typers". Below the threshold we fall back to a
// personal best or no brag at all.
const PERCENTILE_BRAG_THRESHOLD = 60;

interface BragArgs {
  ranked: boolean;
  userId: string;
  testId: string;
  typeId: string;
  count: number;
  score: number;
}

// Picks the most flattering true frame for a completed test. Mirrors the
// profile-page ranking (distinct users, ranked tests, ordered by composite score)
// but counts the "faster than" side directly so the percentile is accurate.
async function buildBrag(prisma: PrismaClient, args: BragArgs): Promise<string | null> {
  if (!args.ranked) return null;

  // 1. New personal best for this exact test configuration.
  const prevBest = await prisma.test.findFirst({
    where: {
      userId: args.userId,
      ranked: true,
      typeId: args.typeId,
      count: args.count,
      id: { not: args.testId },
    },
    orderBy: { score: "desc" },
    select: { score: true },
  });
  if (prevBest && args.score > prevBest.score) return "New personal best";

  // 2. Flattering global percentile, by distinct typers' best score.
  const [betterUsers, allUsers] = await Promise.all([
    prisma.test.findMany({
      where: { ranked: true, score: { gte: args.score } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.test.findMany({
      where: { ranked: true },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);
  const total = allUsers.length;
  if (total === 0) return null;
  const fasterThanPct = ((total - betterUsers.length) / total) * 100;
  if (fasterThanPct >= PERCENTILE_BRAG_THRESHOLD) {
    return `Faster than ${Math.round(fasterThanPct)}% of typers`;
  }

  return null;
}

// WPM change vs the user's 30-day rolling average (a delta available to share —
// vision §7). Null until there's enough history to compare honestly.
const MIN_TESTS_FOR_AVG_DELTA = 3;
async function thirtyDayDelta(
  prisma: PrismaClient,
  args: { userId: string; testId: string; speed: number },
): Promise<number | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const agg = await prisma.test.aggregate({
    where: { userId: args.userId, ranked: true, id: { not: args.testId }, createdAt: { gte: since } },
    _avg: { speed: true },
    _count: true,
  });
  if (agg._count < MIN_TESTS_FOR_AVG_DELTA || agg._avg.speed === null) return null;
  return args.speed - agg._avg.speed;
}

async function thirtyDayChallengeBaseline(
  prisma: PrismaClient,
  args: { userId: string; before: Date },
): Promise<{ average: number; tests: number } | null> {
  const since = new Date(args.before.getTime() - 30 * 24 * 60 * 60 * 1000);
  const agg = await prisma.test.aggregate({
    where: {
      userId: args.userId,
      ranked: true,
      createdAt: { gte: since, lt: args.before },
    },
    _avg: { speed: true },
    _count: true,
  });

  if (agg._count < MIN_TESTS_FOR_AVG_DELTA || agg._avg.speed === null) return null;
  return { average: agg._avg.speed, tests: agg._count };
}

// The user's current practice-day streak, from their distinct test days.
async function practiceStreak(prisma: PrismaClient, userId: string): Promise<number> {
  const days = await prisma.test.findMany({
    where: { userId },
    distinct: ["summaryDate"],
    select: { summaryDate: true },
    orderBy: { summaryDate: "desc" },
    take: 400,
  });
  return currentStreak(days.map((d) => ({ wpm: 0, accuracy: 0, createdAt: d.summaryDate })), new Date());
}

const testOrderBySchema = z.enum([
  "createdAt",
  "updatedAt",
  "summaryDate",
  "score",
  "speed",
  "accuracy",
  "count",
]);
const sortOrderSchema = z.enum(["asc", "desc"]);

export const testRouter = createTRPCRouter({
  getDailyChallengeBoards: publicProcedure
    .input(z.object({
      dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      limit: z.number().min(1).max(50).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const challengeDate = new Date(`${input.dateKey}T00:00:00.000Z`);
      const limit = input.limit ?? 10;

      const rows = await ctx.prisma.test.findMany({
        where: {
          challengeDate,
          ranked: true,
        },
        orderBy: [
          { speed: "desc" },
          { accuracy: "desc" },
          { createdAt: "asc" },
        ],
        take: Math.max(limit * 5, 25),
        select: {
          id: true,
          userId: true,
          speed: true,
          accuracy: true,
          score: true,
          createdAt: true,
          user: { select: { username: true, name: true, image: true } },
        },
      });

      const bestByUser = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        if (!bestByUser.has(row.userId)) bestByUser.set(row.userId, row);
      }

      const fastest = Array.from(bestByUser.values()).slice(0, limit).map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        username: row.user.username ?? row.user.name ?? "Anonymous",
        image: row.user.image,
        speed: row.speed,
        accuracy: row.accuracy,
      }));

      const improvedCandidates = await Promise.all(
        Array.from(bestByUser.values()).map(async (row) => {
          const baseline = await thirtyDayChallengeBaseline(ctx.prisma, {
            userId: row.userId,
            before: challengeDate,
          });
          if (!baseline) return null;
          return {
            rank: 0,
            userId: row.userId,
            username: row.user.username ?? row.user.name ?? "Anonymous",
            image: row.user.image,
            speed: row.speed,
            accuracy: row.accuracy,
            baseline: baseline.average,
            delta: row.speed - baseline.average,
            baselineTests: baseline.tests,
          };
        }),
      );

      const improved = improvedCandidates
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => b.delta - a.delta || b.speed - a.speed)
        .slice(0, limit)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return { fastest, improved };
    }),
  getAll: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
      typeId: z.string(),
      count: z.number(),
      date: z.date().optional(),
      orderBy: testOrderBySchema,
      order: sortOrderSchema,
      limit: z.number(),
      page: z.number()
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.findMany({
        where: {
          userId: input.userId,
          typeId: input.typeId,
          count: input.count,
          ranked: true,
          createdAt: {
            gte: input.date,
          },
        },
        orderBy: {
          [input.orderBy]: input.order,
        },
        take: input.limit,
        skip: input.page * input.limit,
        include: {
          user: true,
        },
      });
    }),
  getByUser: protectedProcedure
    .input(z.object({ typeId: z.string(), orderBy: testOrderBySchema, order: sortOrderSchema }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.findMany({
        where: {
          userId: ctx.session?.user.id,
          typeId: input.typeId,
        },
        orderBy: {
          [input.orderBy]: input.order,
        },
        include: {
          user: true,
        },
      });
    }),
  create: protectedProcedure
    .input(z.object({
      typeId: z.string(),
      speed: z.number(),
      accuracy: z.number(),
      consistency: z.number().optional(),
      score: z.number(),
      count: z.number(),
      options: z.string(),
      punctuation: z.boolean().optional(),
      capitals: z.boolean().optional(),
      ranked: z.boolean().optional(),
      // YYYY-MM-DD when this is a daily-challenge run.
      challengeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ranked = input.ranked ?? true;
      const test = await ctx.prisma.test.create({
        data: {
          userId: ctx.session?.user.id,
          typeId: input.typeId,
          speed: input.speed,
          accuracy: input.accuracy,
          consistency: input.consistency ?? null,
          challengeDate: input.challengeDate ? new Date(`${input.challengeDate}T00:00:00.000Z`) : null,
          score: input.score,
          count: input.count,
          options: input.options,
          punctuation: input.punctuation ?? false,
          capitals: input.capitals ?? false,
          ranked,
          summaryDate: new Date(),
        },
      });

      // A short "brag" line for the result/share card. Choose the most flattering
      // *true* frame so even slow typers get something positive to share:
      //   1. a new personal best for this exact test config, else
      //   2. a global percentile, but only when it is flattering (>= 60%), else
      //   3. nothing (the card just shows the clean WPM).
      const [brag, avgDelta, streak] = await Promise.all([
        buildBrag(ctx.prisma, {
          ranked,
          userId: ctx.session.user.id,
          testId: test.id,
          typeId: input.typeId,
          count: input.count,
          score: input.score,
        }),
        thirtyDayDelta(ctx.prisma, {
          userId: ctx.session.user.id,
          testId: test.id,
          speed: input.speed,
        }),
        practiceStreak(ctx.prisma, ctx.session.user.id),
      ]);

      return { ...test, brag, avgDelta, streak };
    }),
  // Flat per-test history for the /progress dashboard (Phase 3 §3.1). Returns
  // every ranked test for the signed-in user, oldest→newest, with just the fields
  // the pure progression math (src/lib/progress.ts) needs plus the test type for
  // future mode/length filtering. Capped so a prolific user can't pull an
  // unbounded payload; the page reasons over rollups, not raw rows, beyond this.
  getProgressRecords: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(5000).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.test.findMany({
        where: {
          userId: ctx.session.user.id,
          ranked: true,
        },
        orderBy: { createdAt: "asc" },
        take: input?.limit ?? 2000,
        select: {
          speed: true,
          accuracy: true,
          consistency: true,
          count: true,
          createdAt: true,
          type: { select: { mode: true, subMode: true, language: true } },
        },
      });

      return rows.map((row) => ({
        wpm: row.speed,
        accuracy: row.accuracy,
        consistency: row.consistency ?? undefined,
        count: row.count,
        createdAt: row.createdAt,
        mode: row.type.mode,
        subMode: row.type.subMode,
        language: row.type.language,
      }));
    }),
  getActivityByDate: publicProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      userId: z.string().optional(),
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.groupBy({
        by: ["summaryDate"],
        _count: {
          _all: true,
        },
        where: {
          userId: input.userId ? input.userId : ctx.session?.user.id,
          summaryDate: {
            gte: input.startDate,
            lte: input.endDate,
          },
        },
      });
    }),
  getTimeTyped: publicProcedure
    .input(z.object({
      typeIds: z.string().array(),
      userId: z.string().optional()
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.aggregate({
        _sum: {
          count: true,
        },
        where: {
          userId: input.userId ? input.userId : ctx.session?.user.id,
          typeId: { in: input.typeIds },
        },
      });
    }),
  getBestScore: publicProcedure
    .input(z.object({
      userId: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const competitiveTypes = await ctx.prisma.testType.findMany({
        where: {
          competitive: true,
        },
        select: {
          id: true,
        },
      });

      return ctx.prisma.test.findFirst({
        where: {
          userId: input.userId ? input.userId : ctx.session?.user.id,
          ranked: true,
          typeId: {
            in: competitiveTypes.map((type) => type.id),
          },
        },
        orderBy: {
          score: "desc",
        },
      });
    }),
  getPercentile: publicProcedure
    .input(z.object({
      userId: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const userBest = await ctx.prisma.test.findFirst({
        where: {
          userId: input.userId ? input.userId : ctx.session?.user.id,
          ranked: true,
        },
        orderBy: {
          score: "desc",
        },
      })
      const scoresBetter = await ctx.prisma.test.findMany({
        where: {
          ranked: true,
          score: {
            gt: userBest ? userBest.score : 0
          }
        },
        distinct: ['userId'],
        orderBy: { score: 'desc' },
      })
      const scoresWorse = await ctx.prisma.test.findMany({
        where: {
          ranked: true,
          score: {
            lt: userBest ? userBest.score : 999999
          }
        },
        distinct: ['userId'],
        orderBy: { score: 'desc' },
      })

      const total = scoresBetter.length + scoresWorse.length;

      return {
        better: scoresBetter.length,
        worse: scoresWorse.length,
        total,
        percentile: total === 0 ? 0 : (scoresBetter.length / total) * 100,
      }
    }),
  getByLevels: protectedProcedure
    .input(z.object({ 
      typeId: z.string(),
      userId: z.string().optional()
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.test.findMany({
        where: {
          userId: input.userId ? input.userId : ctx.session?.user.id,
          typeId: input.typeId,
          accuracy: { gte: 90 },
        },
        orderBy: { score: 'desc' },
        distinct: ['options'],
        include: {
          user: true,
        },
      });
    }),
});
