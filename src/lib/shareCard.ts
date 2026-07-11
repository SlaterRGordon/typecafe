// The Share card's flattering "Brag" frame - the most positive *true* thing to
// say about a completed Test. The policy is a ladder the test router walks with
// lazy queries: a new personal Best, else a similar-starter percentile
// (peerPercentile.ts), else a global percentile, else nothing (the card shows the
// clean WPM). These deciders are pure so the honesty rules - above all the
// flattering threshold - are unit-testable without a database; the router owns
// only the queries that feed each tier.

// Never surface a percentile brag that isn't flattering - telling a slow typer
// they beat 8% of people is worse than saying nothing. A tier below this
// threshold yields no brag, and the router falls through to the next frame.
export const PERCENTILE_BRAG_THRESHOLD = 60

// Tier 1 - a new personal Best at this exact config, by net WPM. A user's first
// run here is not "a best" (there is no prior to beat), so an empty prior set
// yields null. `priorNets` are the net WPMs of the user's earlier ranked runs at
// this config; `currentNet` is this run's net WPM.
export function personalBestBrag(priorNets: number[], currentNet: number): string | null {
    if (priorNets.length === 0) return null
    return currentNet > Math.max(...priorNets) ? "New personal best" : null
}

// Tier 3 - flattering global percentile by distinct typers' best score. Null when
// the pool is empty or the typer isn't above the flattering threshold.
export function globalPercentileBrag(
    betterUsers: number,
    totalUsers: number,
    thresholdPct = PERCENTILE_BRAG_THRESHOLD,
): string | null {
    if (totalUsers === 0) return null
    const fasterThanPct = ((totalUsers - betterUsers) / totalUsers) * 100
    return fasterThanPct >= thresholdPct ? `Faster than ${Math.round(fasterThanPct)}% of typers` : null
}
