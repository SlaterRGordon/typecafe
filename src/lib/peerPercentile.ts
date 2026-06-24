export interface RankedStarterTest {
    userId: string
    speed: number
    score: number
    createdAt: Date
}

export interface StarterPeer {
    userId: string
    baselineWpm: number
    bestScore: number
}

export interface PeerPercentileResult {
    peerPool: number
    fasterThanPct: number
    beatenPeers: number
}

export const STARTER_BASELINE_TESTS = 3
export const PEER_BASELINE_BAND_WPM = 10
export const MIN_PEER_PERCENTILE_POOL = 50

export function starterPeersFromTests(
    tests: RankedStarterTest[],
    baselineTests = STARTER_BASELINE_TESTS,
): StarterPeer[] {
    const byUser = new Map<string, RankedStarterTest[]>()
    for (const test of tests) {
        const rows = byUser.get(test.userId)
        if (rows) rows.push(test)
        else byUser.set(test.userId, [test])
    }

    return Array.from(byUser.entries())
        .map(([userId, rows]) => {
            const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            const baselineRows = sorted.slice(0, baselineTests)
            if (baselineRows.length < baselineTests) return null
            return {
                userId,
                baselineWpm: baselineRows.reduce((sum, row) => sum + row.speed, 0) / baselineRows.length,
                bestScore: rows.reduce((best, row) => Math.max(best, row.score), -Infinity),
            }
        })
        .filter((peer): peer is StarterPeer => peer !== null)
}

export function peerPercentileForScore(input: {
    currentUserId: string
    currentScore: number
    peers: StarterPeer[]
    bandWpm?: number
    minPeerPool?: number
}): PeerPercentileResult | null {
    const bandWpm = input.bandWpm ?? PEER_BASELINE_BAND_WPM
    const minPeerPool = input.minPeerPool ?? MIN_PEER_PERCENTILE_POOL
    const current = input.peers.find((peer) => peer.userId === input.currentUserId)
    if (!current) return null

    const peerPool = input.peers.filter((peer) => (
        peer.userId !== input.currentUserId &&
        Math.abs(peer.baselineWpm - current.baselineWpm) <= bandWpm
    ))

    if (peerPool.length < minPeerPool) return null

    const beatenPeers = peerPool.filter((peer) => input.currentScore > peer.bestScore).length
    return {
        peerPool: peerPool.length,
        beatenPeers,
        fasterThanPct: (beatenPeers / peerPool.length) * 100,
    }
}

export function peerPercentileBrag(
    result: PeerPercentileResult | null,
    thresholdPct: number,
): string | null {
    if (!result || result.fasterThanPct < thresholdPct) return null
    return `Faster than ${Math.round(result.fasterThanPct)}% of similar starters`
}
