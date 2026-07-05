import { beforeEach, describe, expect, it, vi } from "vitest"
import { netFromRaw } from "~/lib/stats"

const findUnique = vi.hoisted(() => vi.fn())

vi.mock("~/server/db", () => ({
  prisma: {
    scoreShare: {
      findUnique,
    },
  },
}))

import { getShareForOg } from "./scoreData"

const createdAt = new Date("2026-06-21T12:00:00.000Z")

function scoreShare(overrides: Record<string, unknown> = {}) {
  return {
    id: "share-1",
    slug: "share-score",
    kind: "score",
    snapshot: {
      rawWpm: 72,
      netWpm: 69.8,
      durationSeconds: 30,
      wpmSamples: [{ elapsedSeconds: 30, wpm: 72 }],
    },
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    expiresAt: null,
    user: { username: "testuser" },
    test: {
      id: "test-1",
      speed: 72,
      accuracy: 97,
      count: 30,
      createdAt,
      challengeDate: null,
      type: {
        mode: 0,
        subMode: 0,
        language: "english",
      },
    },
    ...overrides,
  }
}

describe("getShareForOg", () => {
  beforeEach(() => {
    findUnique.mockReset()
  })

  it("preserves the daily challenge flag from fresh score snapshots", async () => {
    findUnique.mockResolvedValueOnce(scoreShare({
      snapshot: {
        rawWpm: 82,
        netWpm: 79.4,
        durationSeconds: 30,
        wpmSamples: [{ elapsedSeconds: 30, wpm: 82 }],
        dailyChallenge: true,
      },
    }))

    const data = await getShareForOg("share-score")

    expect(data).toMatchObject({
      kind: "score",
      dailyChallenge: true,
      netWpm: 79.4,
    })
  })

  it("derives daily challenge status from legacy score shares", async () => {
    findUnique.mockResolvedValueOnce(scoreShare({
      snapshot: {},
      test: {
        id: "test-1",
        speed: 72,
        accuracy: 97,
        count: 30,
        createdAt,
        challengeDate: new Date("2026-06-21T00:00:00.000Z"),
        type: {
          mode: 0,
          subMode: 0,
          language: "english",
        },
      },
    }))

    const data = await getShareForOg("legacy-challenge")

    expect(data).toMatchObject({
      kind: "score",
      dailyChallenge: true,
      netWpm: netFromRaw(72, 97), // canonical raw·(2a−1) = 67.68, not raw·a = 69.84
    })
  })

  it("falls back to the canonical net WPM when a snapshot lacks netWpm", async () => {
    findUnique.mockResolvedValueOnce(scoreShare({ snapshot: {} }))

    const data = await getShareForOg("legacy-no-net")

    // The share card must agree with the leaderboard/percentile, which use
    // netFromRaw. The old fallback computed raw·(accuracy/100) = 69.84 — a
    // different, more flattering number. Pin to the canonical one (= 67.68).
    expect(data).toMatchObject({ kind: "score", netWpm: netFromRaw(72, 97) })
    expect(netFromRaw(72, 97)).not.toBe(72 * (97 / 100))
  })

  it("builds OG data for a guest score share that has no Test row", async () => {
    // Guests mint snapshot-only shares (testId null). Before the snapshot
    // fallback these returned null → generic meta and a broken card.
    findUnique.mockResolvedValueOnce(scoreShare({
      test: null,
      snapshot: {
        rawWpm: 88,
        netWpm: 85.1,
        accuracy: 96,
        durationSeconds: 30,
        mode: 0,
        subMode: 1,
        language: "english",
        wpmSamples: [{ elapsedSeconds: 30, wpm: 88 }],
      },
    }))

    const data = await getShareForOg("guest-score")

    expect(data).toMatchObject({
      kind: "score",
      rawWpm: 88,
      netWpm: 85.1,
      accuracy: 96,
      username: "testuser",
    })
  })

  it("leaves ordinary score shares unbadged", async () => {
    findUnique.mockResolvedValueOnce(scoreShare())

    const data = await getShareForOg("ordinary-score")

    expect(data).toMatchObject({
      kind: "score",
      dailyChallenge: false,
    })
  })
})
