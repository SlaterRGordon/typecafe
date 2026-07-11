import { describe, expect, it } from "vitest"
import {
    MIN_PEER_PERCENTILE_POOL,
    peerPercentileBrag,
    peerPercentileForScore,
    starterPeersFromTests,
    type RankedStarterTest,
    type StarterPeer,
} from "./peerPercentile"

const now = new Date("2026-06-19T12:00:00.000Z")

function test(userId: string, day: number, speed: number, score = speed, accuracy = 100): RankedStarterTest {
    return {
        userId,
        speed,
        accuracy,
        score,
        createdAt: new Date(now.getTime() + day * 24 * 60 * 60 * 1000),
    }
}

function peer(userId: string, baselineWpm: number, bestScore: number): StarterPeer {
    return { userId, baselineWpm, bestScore }
}

describe("starterPeersFromTests", () => {
    it("uses each user's first three ranked tests as the starter baseline", () => {
        const peers = starterPeersFromTests([
            test("u1", 3, 120, 12_000),
            test("u1", 0, 60, 6_000),
            test("u1", 1, 66, 6_600),
            test("u1", 2, 72, 7_200),
            test("u2", 0, 50),
            test("u2", 1, 55),
        ])

        expect(peers).toEqual([
            { userId: "u1", baselineWpm: 66, bestScore: 12_000 },
        ])
    })

    it("uses net rather than raw speed for the starter band", () => {
        const [starter] = starterPeersFromTests([
            test("u1", 0, 100, 80, 90),
            test("u1", 1, 100, 80, 90),
            test("u1", 2, 100, 80, 90),
        ])
        expect(starter?.baselineWpm).toBe(80)
    })
})

describe("peerPercentileForScore", () => {
    it("returns null until the similar-starter pool is large enough", () => {
        const result = peerPercentileForScore({
            currentUserId: "me",
            currentScore: 8_000,
            minPeerPool: MIN_PEER_PERCENTILE_POOL,
            peers: [
                peer("me", 70, 8_000),
                ...Array.from({ length: MIN_PEER_PERCENTILE_POOL - 1 }, (_, index) => peer(`p${index}`, 72, 7_000)),
            ],
        })

        expect(result).toBeNull()
    })

    it("compares only users inside the starter baseline band and excludes self", () => {
        const result = peerPercentileForScore({
            currentUserId: "me",
            currentScore: 8_000,
            minPeerPool: 3,
            peers: [
                peer("me", 70, 1),
                peer("near-1", 60, 7_000),
                peer("near-2", 80, 8_500),
                peer("near-3", 75, 6_000),
                peer("far", 81, 1),
            ],
        })

        expect(result).toMatchObject({ peerPool: 3, beatenPeers: 2 })
        expect(result?.fasterThanPct).toBeCloseTo(66.67)
    })

    it("returns null when the current user does not have a starter baseline", () => {
        expect(peerPercentileForScore({
            currentUserId: "me",
            currentScore: 8_000,
            peers: [peer("other", 70, 7_000)],
        })).toBeNull()
    })
})

describe("peerPercentileBrag", () => {
    it("uses similar-starter language only above the flattering threshold", () => {
        expect(peerPercentileBrag({ peerPool: 50, beatenPeers: 36, fasterThanPct: 72 }, 60))
            .toBe("Faster than 72% of similar starters")
        expect(peerPercentileBrag({ peerPool: 50, beatenPeers: 20, fasterThanPct: 40 }, 60))
            .toBeNull()
    })
})
