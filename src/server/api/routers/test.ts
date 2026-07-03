import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import type { PrismaClient } from "~/generated/prisma/client";
import { detectImpossibleTimeline } from "~/lib/antiCheat";
import { challengeStreakFromDateKeys, shiftChallengeDateKey } from "~/lib/challenge";
import { timelineDurationMs, type EncodedKeystroke } from "~/lib/keystrokes";
import { isRankableSample, netFromRaw } from "~/lib/stats";
import { baseTypeLanguage } from "~/lib/typeLanguage";
import { averageNet, bestNetPerUser, netOf } from "~/lib/netScores";
import {
  peerPercentileBrag,
  peerPercentileForScore,
  starterPeersFromTests,
} from "~/lib/peerPercentile";
import { currentStreak, dayKey } from "~/lib/progress";
import { profileProofSummary } from "~/lib/profileProof";
import {
  globalPercentileBrag,
  personalBestBrag,
  PERCENTILE_BRAG_THRESHOLD,
} from "~/lib/shareCard";
import {
  aggregateProgressHistory,
  dailyUserStatRollup,
  dateFromDayKey,
  mergeDailyStat,
  type DailyStatAggregate,
} from "~/lib/dailyRollup";

const MAX_PEER_PERCENTILE_TESTS = 20000;
const encodedKeystrokeSchema = z.tuple([
  z.number().int().nonnegative(),
  z.union([z.literal(0), z.literal(1)]),
  z.number().nonnegative(),
]);
const utcOffsetMinutesSchema = z.number().int().min(-14 * 60).max(14 * 60).optional();

// The fixed configs surfaced as profile "signature bests": best 15s, best 60s,
// best 100-word run. subMode 0 = timed, 1 = words; mode 0 = normal.
const SIGNATURE_BEST_CONFIGS = [
  { key: "timed-15", eyebrow: "15 seconds", subMode: 0, count: 15 },
  { key: "timed-60", eyebrow: "60 seconds", subMode: 0, count: 60 },
  { key: "words-100", eyebrow: "100 words", subMode: 1, count: 100 },
] as const;
const progressHistoryEntrySchema = z.object({
  wpm: z.number().min(0),
  accuracy: z.number().min(0).max(100),
  c: z.number().min(0).max(100).optional(),
  t: z.number().finite(),
});

interface BragArgs {
  ranked: boolean;
  userId: string;
  testId: string;
  typeId: string;
  count: number;
  score: number;
  // Net WPM of this run — the canonical "WPM", used for the personal-best frame.
  netWpm: number;
}

// Picks the most flattering true frame for a completed test. Percentile brags
// compare distinct users' ranked scores and count the "faster than" side
// directly so the displayed percentage is accurate.
async function buildBrag(prisma: PrismaClient, args: BragArgs): Promise<string | null> {
  if (!args.ranked) return null;

  // 1. New personal best for this exact test configuration, by net WPM (the
  // canonical headline metric). Net isn't stored, so compute it over the user's
  // prior runs at this config (a small per-user set).
  const priorAtConfig = await prisma.test.findMany({
    where: {
      userId: args.userId,
      ranked: true,
      typeId: args.typeId,
      count: args.count,
      id: { not: args.testId },
    },
    select: { speed: true, accuracy: true },
  });
  const pb = personalBestBrag(priorAtConfig.map(netOf), args.netWpm);
  if (pb) return pb;

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
  return globalPercentileBrag(betterUsers.length, allUsers.length);
}

// WPM change vs the user's 30-day rolling average (a delta available to share —
// vision §7). Null until there's enough history to compare honestly.
const MIN_TESTS_FOR_AVG_DELTA = 3;
async function thirtyDayDelta(
  prisma: PrismaClient,
  args: { userId: string; testId: string; speed: number; accuracy: number },
): Promise<number | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Net (the canonical WPM) isn't stored, so average it from raw speed + accuracy
  // over the window rather than aggregating raw speed in SQL.
  const prior = await prisma.test.findMany({
    where: { userId: args.userId, ranked: true, id: { not: args.testId }, createdAt: { gte: since } },
    select: { speed: true, accuracy: true },
  });
  const avgNet = averageNet(prior, MIN_TESTS_FOR_AVG_DELTA);
  if (avgNet === null) return null;
  return netFromRaw(args.speed, args.accuracy) - avgNet;
}

// Find-or-create the day's row and write the merged values; the averaging math
// lives in mergeDailyStat (src/lib/dailyRollup.ts), this just does the I/O.
async function upsertDailyUserStat(
  prisma: Pick<PrismaClient, "dailyUserStat">,
  userId: string,
  aggregate: DailyStatAggregate,
) {
  const existing = await prisma.dailyUserStat.findUnique({
    where: { userId_date: { userId, date: aggregate.date } },
  });

  const values = mergeDailyStat(existing, aggregate);

  if (!existing) {
    return prisma.dailyUserStat.create({
      data: { userId, date: aggregate.date, ...values },
    });
  }

  return prisma.dailyUserStat.update({
    where: { id: existing.id },
    data: values,
  });
}

async function thirtyDayChallengeBaseline(
  prisma: PrismaClient,
  args: { userId: string; before: Date },
): Promise<{ average: number; tests: number } | null> {
  const since = new Date(args.before.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Baseline is the net-WPM average (the canonical metric). Net isn't stored, so
  // average it from raw speed + accuracy rather than aggregating raw in SQL.
  const prior = await prisma.test.findMany({
    where: {
      userId: args.userId,
      ranked: true,
      createdAt: { gte: since, lt: args.before },
    },
    select: { speed: true, accuracy: true },
  });

  const average = averageNet(prior, MIN_TESTS_FOR_AVG_DELTA);
  if (average === null) return null;
  return { average, tests: prior.length };
}

// The user's current practice-day streak, from their distinct test days.
async function practiceStreak(prisma: PrismaClient, userId: string, utcOffsetMinutes = 0): Promise<number> {
  const days = await prisma.test.findMany({
    where: { userId },
    distinct: ["summaryDate"],
    select: { summaryDate: true },
    orderBy: { summaryDate: "desc" },
    take: 400,
  });
  return currentStreak(days.map((d) => ({
    wpm: 0,
    accuracy: 0,
    createdAt: d.summaryDate,
    day: d.summaryDate.toISOString().slice(0, 10),
  })), new Date(), utcOffsetMinutes);
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

      const todayNet = today ? netFromRaw(today.speed, today.accuracy) : null;
      return {
        today: today ? {
          dateKey: input.dateKey,
          wpm: todayNet!,
          accuracy: today.accuracy,
          t: today.createdAt.getTime(),
          delta: baseline ? todayNet! - baseline.average : null,
        } : null,
        yesterday: yesterday ? {
          dateKey: yesterdayKey,
          wpm: netFromRaw(yesterday.speed, yesterday.accuracy),
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

      // Boards rank by net WPM (the canonical metric), keeping each user's best
      // net run. Net isn't stored, so derive it from raw speed + accuracy.
      const bestRows = bestNetPerUser(rows);

      const fastest = bestRows
        .sort((a, b) => netOf(b) - netOf(a))
        .slice(0, limit)
        .map((row, index) => ({
          rank: index + 1,
          userId: row.userId,
          username: row.user.username ?? row.user.name ?? "Anonymous",
          image: row.user.image,
          wpm: netOf(row),
          accuracy: row.accuracy,
        }));

      const improvedCandidates = await Promise.all(
        bestRows.map(async (row) => {
          const baseline = await thirtyDayChallengeBaseline(ctx.prisma, {
            userId: row.userId,
            before: challengeDate,
          });
          if (!baseline) return null;
          const wpm = netOf(row);
          return {
            rank: 0,
            userId: row.userId,
            username: row.user.username ?? row.user.name ?? "Anonymous",
            image: row.user.image,
            wpm,
            accuracy: row.accuracy,
            baseline: baseline.average,
            delta: wpm - baseline.average,
            baselineTests: baseline.tests,
          };
        }),
      );

      const improved = improvedCandidates
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => b.delta - a.delta || b.wpm - a.wpm)
        .slice(0, limit)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return { fastest, improved };
    }),
  // Leaderboard: one row per user — their single best run (by net WPM, the
  // canonical metric) within the window — so one fast typer can't flood the
  // board with every attempt. Net isn't stored, so dedupe/sort in memory.
  // (Volume is low pre-launch; a materialised best-per-window is the budget-era
  // upgrade.)
  getLeaderboard: publicProcedure
    .input(z.object({
      typeId: z.string(),
      count: z.number(),
      date: z.date().optional(),
      limit: z.number(),
      page: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.test.findMany({
        where: {
          typeId: input.typeId,
          count: input.count,
          ranked: true,
          createdAt: { gte: input.date },
        },
        select: {
          userId: true,
          speed: true,
          accuracy: true,
          createdAt: true,
          user: { select: { username: true, name: true, image: true } },
        },
      });

      const sorted = bestNetPerUser(rows).sort((a, b) => netOf(b) - netOf(a));
      const start = input.page * input.limit;
      return sorted.slice(start, start + input.limit).map((row, index) => ({
        rank: start + index + 1,
        userId: row.userId,
        username: row.user.username ?? row.user.name ?? "Anonymous",
        image: row.user.image,
        wpm: netOf(row),
        rawWpm: row.speed,
        accuracy: row.accuracy,
        createdAt: row.createdAt,
      }));
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
      // Persisted whole (locked constraint #2). Capped well above the longest
      // legitimate run (a 5000-word custom test ≈ 30k keystrokes) so a hostile
      // payload can't balloon a row.
      timeline: z.array(encodedKeystrokeSchema).max(50000),
      utcOffsetMinutes: utcOffsetMinutesSchema,
      // YYYY-MM-DD when this is a daily-challenge run.
      challengeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const timeline = input.timeline as EncodedKeystroke[];
      // A test only ranks if it's a substantial, human sample: enough keystrokes
      // and time to be a real attempt (not a stray 1–3 key tap), and not a
      // machine-like timeline. Unranked tests still save — they just don't feed
      // rollups, streaks, trends, or percentiles.
      const substantialSample = isRankableSample(timelineDurationMs(timeline) / 1000, timeline.length);
      const ranked = (input.ranked ?? true) && substantialSample && !detectImpossibleTimeline(timeline).impossible;
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
            // Persist the full timeline (locked constraint #2) — evidence for
            // replay and re-diagnosis under future heuristics; no reads yet.
            timeline,
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
      const netWpm = netFromRaw(input.speed, input.accuracy);
      // Every flattering element shares the ranking quality bar (honest-review
      // 2026-07 §2): an unranked run — tiny sample or machine-like timeline —
      // gets no brag, no 30-day delta, no streak chip. buildBrag gates itself.
      const [brag, avgDelta, streak] = await Promise.all([
        buildBrag(ctx.prisma, {
          ranked,
          userId: ctx.session.user.id,
          testId: test.id,
          typeId: input.typeId,
          count: input.count,
          score: input.score,
          netWpm,
        }),
        ranked
          ? thirtyDayDelta(ctx.prisma, {
            userId: ctx.session.user.id,
            testId: test.id,
            speed: input.speed,
            accuracy: input.accuracy,
          })
          : Promise.resolve(null),
        ranked
          ? practiceStreak(ctx.prisma, ctx.session.user.id, input.utcOffsetMinutes ?? 0)
          : Promise.resolve(null),
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
  // Signature personal bests for the profile identity card: one per common
  // config (15s, 60s, 100 words). Returns net WPM (the canonical number) plus the
  // raw/accuracy/date secondary stats, with null where the user has no ranked run.
  getSignatureBests: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
      language: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.session?.user.id;
      if (!userId) return [];
      const language = baseTypeLanguage(input.language ?? "english");

      return Promise.all(SIGNATURE_BEST_CONFIGS.map(async (config) => {
        const type = await ctx.prisma.testType.findFirst({
          where: { mode: 0, subMode: config.subMode, language },
          select: { id: true },
        });
        const best = type
          ? await ctx.prisma.test.findFirst({
            where: { userId, ranked: true, typeId: type.id, count: config.count },
            orderBy: { score: "desc" },
            select: { speed: true, accuracy: true, createdAt: true },
          })
          : null;
        return {
          key: config.key,
          eyebrow: config.eyebrow,
          wpm: best ? netFromRaw(best.speed, best.accuracy) : null,
          rawWpm: best?.speed ?? null,
          accuracy: best?.accuracy ?? null,
          createdAt: best?.createdAt ?? null,
        };
      }));
    }),
  getProfileProof: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.session?.user.id;
      if (!userId) return profileProofSummary([]);

      const rows = await ctx.prisma.test.findMany({
        where: { userId, ranked: true },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          speed: true,
          accuracy: true,
          consistency: true,
          createdAt: true,
        },
      });

      return profileProofSummary(rows);
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
