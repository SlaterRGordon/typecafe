import { prisma } from "~/server/db";

export interface OgScoreData {
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
}

interface SnapshotShape {
  rawWpm?: number;
  netWpm?: number;
  durationSeconds?: number;
  wpmSamples?: { elapsedSeconds: number; wpm: number }[];
  brag?: string | null;
}

function readSnapshot(value: unknown): SnapshotShape {
  if (!value || typeof value !== "object") return {};
  return value as SnapshotShape;
}

// Fetches a shared score by slug and normalizes it for OG rendering / meta tags.
// Returns null when the share is missing, deleted, or expired. Prefers the saved
// snapshot values, falling back to the test record so legacy shares still work.
export async function getShareScoreForOg(slug: string): Promise<OgScoreData | null> {
  const share = await prisma.scoreShare.findUnique({
    where: { slug },
    include: {
      test: { include: { type: true } },
      user: { select: { username: true } },
    },
  });

  if (!share || share.deletedAt) return null;
  if (share.expiresAt && share.expiresAt <= new Date()) return null;

  const snapshot = readSnapshot(share.snapshot);
  const rawWpm = snapshot.rawWpm ?? share.test.speed;
  const accuracy = share.test.accuracy;

  return {
    rawWpm,
    netWpm: snapshot.netWpm ?? Math.max(share.test.speed * (accuracy / 100), 0),
    accuracy,
    durationSeconds: snapshot.durationSeconds ?? share.test.count,
    mode: share.test.type.mode,
    subMode: share.test.type.subMode,
    language: share.test.type.language,
    username: share.user?.username ?? null,
    createdAt: share.test.createdAt,
    wpmSamples: snapshot.wpmSamples ?? [
      { elapsedSeconds: 0, wpm: 0 },
      { elapsedSeconds: share.test.count, wpm: share.test.speed },
    ],
    brag: snapshot.brag ?? null,
  };
}
