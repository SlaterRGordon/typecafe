import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import type { PrismaClient } from "~/generated/prisma/client";
import { detectImpossibleTimeline } from "~/lib/antiCheat";
import { challengeStreakFromDateKeys, shiftChallengeDateKey } from "~/lib/challenge";
import type { EncodedKeystroke } from "~/lib/keystrokes";
import {
  peerPercentileBrag,
  peerPercentileForScore,
  starterPeersFromTests,
} from "~/lib/peerPercentile";
import { currentStreak, dayKey } from "~/lib/progress";

// Only surface a percentile brag when it is flattering — never tell a slow typer
// they are "faster than 8% of typers". Below the threshold we fall back to a
// personal best or no brag at all.
const PERCENTILE_BRAG_THRESHOLD = 60;
const MAX_PEER_PERCENTILE_TESTS = 20000;
const encodedKeystrokeSchema = z.tuple([
  z.number().int().nonnegative(),
  z.union([z.literal(0), z.literal(1)]),
  z.number().nonnegative(),
]);
const utcOffsetMinutesSchema = z.number().int().min(-14 * 60).max(14 * 60).optional();
const progressHistoryEntrySchema = z.object({
  wpm: z.number().min(0),
  accuracy: z.number().min(0).max(100),
  c: z.number().min(0).max(100).optional(),
  t: z.number().finite(),
});

interface DailyStatAggregate {
  date: Date;
  tests: number;
  bestWpm: number;
  totalWpm: number;
  totalAccuracy: number;
  totalConsistency: number;
  consistencySamples: number;
}

interface BragArgs {
  ranked: boolean;
  userId: string;
  testId: string;
  typeId: string;
  count: number;
  score: number;
}

// Picks the most flattering true frame for a completed test. Percentile brags
// compare distinct users' ranked scores and count the "faster than" side
// directly so the displayed percentage is accurate.
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

  // 2. Flattering peer percentile: users whose first ranked tests started
  // within the same WPM band. Until that pool is meaningful, fall through to
  // the legacy global percentile below.
  const rankedRows = await prisma.test.findMany({
    where: { ranked: true },
    orderBy: { createdAt: "asc" },
    take: MAX_PEER_PERCENTILE_TESTS,
    select: {
      userId: true,
      speed: true,
      score: true,
      createdAt: true,
    },
  });
  const peerPercentile = peerPercentileForScore({
    currentUserId: args.userId,
    currentScore: args.score,
    peers: starterPeersFromTests(rankedRows),
  });
  if (peerPercentile) {
    return peerPercentileBrag(peerPercentile, PERCENTILE_BRAG_THRESHOLD);
  }

  // 3. Flattering global percentile, by distinct typers' best score.
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

function dateFromDayKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

async function upsertDailyUserStat(
  prisma: Pick<PrismaClient, "dailyUserStat">,
  userId: string,
  aggregate: DailyStatAggregate,
) {
  const existing = await prisma.dailyUserStat.findUnique({
    where: {
      userId_date: {
        userId,
        date: aggregate.date,
      },
    },
  });

  const avgWpm = aggregate.totalWpm / aggregate.tests;
  const avgAccuracy = aggregate.totalAccuracy / aggregate.tests;
  const avgConsistency = aggregate.consistencySamples > 0
    ? aggregate.totalConsistency / aggregate.consistencySamples
    : null;

  if (!existing) {
    return prisma.dailyUserStat.create({
      data: {
        userId,
        date: aggregate.date,
        tests: aggregate.tests,
        bestWpm: aggregate.bestWpm,
        avgWpm,
        avgAccuracy,
        avgConsistency,
        consistencySamples: aggregate.consistencySamples,
      },
    });
  }

  const tests = existing.tests + aggregate.tests;
  const consistencySamples = existing.consistencySamples + aggregate.consistencySamples;
  const consistencyTotal = (existing.avgConsistency ?? 0) * existing.consistencySamples + aggregate.totalConsistency;

  return prisma.dailyUserStat.update({
    where: { id: existing.id },
    data: {
      tests,
      bestWpm: Math.max(existing.bestWpm, aggregate.bestWpm),
      avgWpm: ((existing.avgWpm * existing.tests) + aggregate.totalWpm) / tests,
      avgAccuracy: ((existing.avgAccuracy * existing.tests) + aggregate.totalAccuracy) / tests,
      avgConsistency: consistencySamples > 0 ? consistencyTotal / consistencySamples : null,
      consistencySamples,
    },
  });
}

function aggregateProgressHistory(
  entries: z.infer<typeof progressHistoryEntrySchema>[],
  utcOffsetMinutes = 0,
): DailyStatAggregate[] {
  const byDay = new Map<string, DailyStatAggregate>();

  for (const entry of entries) {
    const key = dayKey(new Date(entry.t), utcOffsetMinutes);
    const current = byDay.get(key);
    const consistency = typeof entry.c === "number" && Number.isFinite(entry.c) ? entry.c : null;

    if (!current) {
      byDay.set(key, {
        date: dateFromDayKey(key),
        tests: 1,
        bestWpm: entry.wpm,
        totalWpm: entry.wpm,
        totalAccuracy: entry.accuracy,
        totalConsistency: consistency ?? 0,
        consistencySamples: consistency === null ? 0 : 1,
      });
      continue;
    }

    current.tests += 1;
    current.bestWpm = Math.max(current.bestWpm, entry.wpm);
    current.totalWpm += entry.wpm;
    current.totalAccuracy += entry.accuracy;
    if (consistency !== null) {
      current.totalConsistency += consistency;
      current.consistencySamples += 1;
    }
  }

  return Array.from(byDay.values());
}

function dailyUserStatRollup(row: {
  date: Date;
  tests: number;
  bestWpm: number;
  avgWpm: number;
  avgAccuracy: number;
  avgConsistency: number | null;
}) {
  return {
    day: row.date.toISOString().slice(0, 10),
    tests: row.tests,
    bestWpm: row.bestWpm,
    avgWpm: row.avgWpm,
    avgAccuracy: row.avgAccuracy,
    avgConsistency: row.avgConsistency,
  };
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
  getDailyChallengeStatus: publicProcedure
    .input(z.object({
      dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      if (!userId) return { today: null, yesterday: null, streak: 0 };

      const todayDate = new Date(`${input.dateKey}T00:00:00.000Z`);
      const yesterdayKey = shiftChallengeDateKey(input.dateKey, -1);
      const yesterdayDate = new Date(`${yesterdayKey}T00:00:00.000Z`);

      const [today, yesterday, challengeDays] = await Promise.all([
        ctx.prisma.test.findFirst({
          where: { userId, challengeDate: todayDate, ranked: true },
          orderBy: [{ speed: "desc" }, { accuracy: "desc" }, { createdAt: "asc" }],
          select: { speed: true, accuracy: true, createdAt: true },
        }),
        ctx.prisma.test.findFirst({
          where: { userId, challengeDate: yesterdayDate, ranked: true },
          orderBy: [{ speed: "desc" }, { accuracy: "desc" }, { createdAt: "asc" }],
          select: { speed: true, accuracy: true, createdAt: true },
        }),
        ctx.prisma.test.findMany({
          where: { userId, challengeDate: { not: null }, ranked: true },
          distinct: ["challengeDate"],
          select: { challengeDate: true },
          orderBy: { challengeDate: "desc" },
          take: 120,
        }),
      ]);

      const baseline = today ? await thirtyDayChallengeBaseline(ctx.prisma, {
        userId,
        before: todayDate,
      }) : null;

      return {
        today: today ? {
          dateKey: input.dateKey,
          wpm: today.speed,
          accuracy: today.accuracy,
          t: today.createdAt.getTime(),
          delta: baseline ? today.speed - baseline.average : null,
        } : null,
        yesterday: yesterday ? {
          dateKey: yesterdayKey,
          wpm: yesterday.speed,
          accuracy: yesterday.accuracy,
          t: yesterday.createdAt.getTime(),
        } : null,
        streak: challengeStreakFromDateKeys(
          challengeDays
            .map((row) => row.challengeDate)
            .filter((date): date is Date => date !== null)
            .map((date) => date.toISOString().slice(0, 10)),
          input.dateKey,
        ),
      };
    }),
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
      timeline: z.array(encodedKeystrokeSchema),
      utcOffsetMinutes: utcOffsetMinutesSchema,
      // YYYY-MM-DD when this is a daily-challenge run.
      challengeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const timeline = input.timeline as EncodedKeystroke[];
      const ranked = (input.ranked ?? true) && !detectImpossibleTimeline(timeline).impossible;
      const summaryDate = dateFromDayKey(dayKey(new Date(), input.utcOffsetMinutes ?? 0));
      const test = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.test.create({
          data: {
            userId: ctx.session.user.id,
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
            summaryDate,
          },
        });

        if (ranked) {
          await upsertDailyUserStat(tx, ctx.session.user.id, {
            date: summaryDate,
            tests: 1,
            bestWpm: input.speed,
            totalWpm: input.speed,
            totalAccuracy: input.accuracy,
            totalConsistency: typeof input.consistency === "number" ? input.consistency : 0,
            consistencySamples: typeof input.consistency === "number" ? 1 : 0,
          });
        }

        return created;
      });

      // A short "brag" line for the result/share card. Choose the most flattering
      // *true* frame so even slow typers get something positive to share:
      //   1. a new personal best for this exact test config, else
      //   2. a similar-starter percentile once that peer pool exists, else
      //   3. a global percentile while the peer pool is still cold, else
      //   4. nothing (the card just shows the clean WPM).
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
  syncProgressHistory: protectedProcedure
    .input(z.object({
      entries: z.array(progressHistoryEntrySchema).max(1000),
      utcOffsetMinutes: utcOffsetMinutesSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.entries.length === 0) return { count: 0, days: 0 };

      const aggregates = aggregateProgressHistory(input.entries, input.utcOffsetMinutes ?? 0);
      await ctx.prisma.$transaction(async (tx) => {
        for (const aggregate of aggregates) {
          await upsertDailyUserStat(tx, ctx.session.user.id, aggregate);
        }
      });

      const rows = await ctx.prisma.dailyUserStat.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { date: "asc" },
        select: {
          date: true,
          tests: true,
          bestWpm: true,
          avgWpm: true,
          avgAccuracy: true,
          avgConsistency: true,
        },
      });

      return { count: input.entries.length, days: aggregates.length, rollups: rows.map(dailyUserStatRollup) };
    }),
  getDailyProgressRollups: protectedProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.prisma.dailyUserStat.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { date: "asc" },
        select: {
          date: true,
          tests: true,
          bestWpm: true,
          avgWpm: true,
          avgAccuracy: true,
          avgConsistency: true,
        },
      });

      return rows.map(dailyUserStatRollup);
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
          summaryDate: true,
          createdAt: true,
          type: { select: { mode: true, subMode: true, language: true } },
        },
      });

      return rows.map((row) => ({
        wpm: row.speed,
        accuracy: row.accuracy,
        consistency: row.consistency ?? undefined,
        count: row.count,
        day: row.summaryDate.toISOString().slice(0, 10),
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
