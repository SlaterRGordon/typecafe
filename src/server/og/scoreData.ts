import { prisma } from "~/server/db";
import { netFromRaw } from "~/lib/stats";

export interface OgScoreData {
  kind: "score";
  rawWpm: number;
  netWpm: number;
  accuracy: number;
  durationSeconds: number;
  mode: number;
  subMode: number;
  language: string;
  username: string | null;
  createdAt: Date;
  wpmSamples: { elapsedSeconds: number; wpm: number }[];
  brag: string | null;
  avgDelta: number | null;
  dailyChallenge: boolean;
}

export interface OgProgressData {
  kind: "progress";
  deltaWpm: number;
  periodLabel: string;
  username: string | null;
  streak: number | null;
  points: { t: number; wpm: number }[];
}

export type OgShareData = OgScoreData | OgProgressData;

interface ScoreSnapshotShape {
  rawWpm?: number;
  netWpm?: number;
  accuracy?: number;
  durationSeconds?: number;
  count?: number;
  mode?: number;
  subMode?: number;
  language?: string;
  createdAt?: number;
  wpmSamples?: { elapsedSeconds: number; wpm: number }[];
  brag?: string | null;
  avgDelta?: number | null;
  dailyChallenge?: boolean;
}

interface ProgressSnapshotShape {
  deltaWpm?: number;
  periodLabel?: string;
  username?: string | null;
  streak?: number;
  points?: { t: number; wpm: number }[];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

// Fetches a shared score/progress by slug and normalizes it for OG rendering /
// meta tags. Returns null when missing, deleted, expired, or malformed. Prefers
// the saved snapshot, falling back to the test record so legacy shares still work.
export async function getShareForOg(slug: string): Promise<OgShareData | null> {
  const share = await prisma.scoreShare.findUnique({
    where: { slug },
    include: {
      test: { include: { type: true } },
      user: { select: { username: true } },
    },
  });

  if (!share || share.deletedAt) return null;
  if (share.expiresAt && share.expiresAt <= new Date()) return null;

  const username = share.user?.username ?? null;

  if (share.kind === "progress") {
    const snapshot = asObject(share.snapshot) as ProgressSnapshotShape;
    if (typeof snapshot.deltaWpm !== "number" || !Array.isArray(snapshot.points)) return null;
    return {
      kind: "progress",
      deltaWpm: snapshot.deltaWpm,
      periodLabel: snapshot.periodLabel ?? "recently",
      username,
      streak: typeof snapshot.streak === "number" ? snapshot.streak : null,
      points: snapshot.points,
    };
  }

  if (share.kind === "beat") {
    const snapshot = asObject(share.snapshot) as ScoreSnapshotShape;
    if (
      typeof snapshot.rawWpm !== "number" ||
      typeof snapshot.netWpm !== "number" ||
      typeof snapshot.accuracy !== "number" ||
      typeof snapshot.durationSeconds !== "number"
    ) return null;
    return {
      kind: "score",
      rawWpm: snapshot.rawWpm,
      netWpm: snapshot.netWpm,
      accuracy: snapshot.accuracy,
      durationSeconds: snapshot.durationSeconds,
      mode: snapshot.mode ?? 0,
      subMode: snapshot.subMode ?? 0,
      language: snapshot.language ?? "english",
      username,
      createdAt: typeof snapshot.createdAt === "number" ? new Date(snapshot.createdAt) : share.createdAt,
      wpmSamples: snapshot.wpmSamples ?? [
        { elapsedSeconds: 0, wpm: 0 },
        { elapsedSeconds: snapshot.durationSeconds, wpm: snapshot.rawWpm },
      ],
      brag: snapshot.brag ?? null,
      avgDelta: snapshot.avgDelta ?? null,
      dailyChallenge: snapshot.dailyChallenge === true,
    };
  }

  if (!share.test) return null;
  const snapshot = asObject(share.snapshot) as ScoreSnapshotShape;
  const rawWpm = snapshot.rawWpm ?? share.test.speed;
  const accuracy = share.test.accuracy;

  return {
    kind: "score",
    rawWpm,
    netWpm: snapshot.netWpm ?? netFromRaw(share.test.speed, accuracy),
    accuracy,
    durationSeconds: snapshot.durationSeconds ?? share.test.count,
    mode: share.test.type.mode,
    subMode: share.test.type.subMode,
    language: share.test.type.language,
    username,
    createdAt: share.test.createdAt,
    wpmSamples: snapshot.wpmSamples ?? [
      { elapsedSeconds: 0, wpm: 0 },
      { elapsedSeconds: share.test.count, wpm: share.test.speed },
    ],
    brag: snapshot.brag ?? null,
    avgDelta: snapshot.avgDelta ?? null,
    dailyChallenge: snapshot.dailyChallenge === true || !!share.test.challengeDate,
  };
}
