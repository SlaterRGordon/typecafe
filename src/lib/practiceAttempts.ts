export interface CharAttempt {
    attempts: number
    correct: number
}

// Per-key accuracy is a rolling window, not a true lifetime sum (ADR-0005): a
// key's effective attempt count caps here, and over-cap merges scale attempts /
// correct down proportionally. Accuracy is preserved; old history stops
// anchoring the ratio, so a fixed weak key reads as fixed within ~a window of
// real typing instead of months. Shared by the local merge and the DB upsert.
export const KEY_ATTEMPT_CAP = 500

export interface SyncedStat {
    character: string
    total: number
    correct: number
}

// After a batch of practice stats is persisted, subtract exactly what was synced
// from the live attempts map. Mutates in place — keystrokes typed while the sync
// was in flight have already been added to the same map, and subtracting (rather
// than deleting the key, or replacing the map) is what lets them survive for the
// next sync. A key drained to zero or below is removed; correct never goes
// negative.
export function drainSyncedAttempts(attempts: Map<string, CharAttempt>, synced: SyncedStat[]): void {
    for (const stat of synced) {
        const current = attempts.get(stat.character)
        if (!current) continue

        const remaining = current.attempts - stat.total
        const correct = current.correct - stat.correct
        if (remaining <= 0) attempts.delete(stat.character)
        else attempts.set(stat.character, { attempts: remaining, correct: Math.max(correct, 0) })
    }
}
