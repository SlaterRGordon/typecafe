import {
    parseGuestEvidenceTest,
    type GuestEvidenceTest,
} from "./guestEvidence"
import { GUEST_EVIDENCE_MAX_BYTES, GUEST_EVIDENCE_MAX_TESTS } from "./guestEvidenceLimits"

const DATABASE_NAME = "typecafe"
const DATABASE_VERSION = 1
const STORE_NAME = "guestEvidenceTests"

export interface GuestEvidenceStorage {
    load(): Promise<unknown[]>
    replace(items: GuestEvidenceTest[]): Promise<void>
}

function encodedBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function evictionOrder(a: GuestEvidenceTest, b: GuestEvidenceTest): number {
    const aPriority = a.context === "natural" ? 0 : 1
    const bPriority = b.context === "natural" ? 0 : 1
    return aPriority - bPriority || a.completedAt - b.completedAt || a.localId.localeCompare(b.localId)
}

function retainWithinCaps(items: GuestEvidenceTest[]): GuestEvidenceTest[] {
    const byId = new Map(items.map((item) => [item.localId, item]))
    const eviction = [...byId.values()].sort(evictionOrder)
    let bytes = Array.from(byId.values()).reduce((total, item) => total + encodedBytes(item), 0)

    while (byId.size > GUEST_EVIDENCE_MAX_TESTS || bytes > GUEST_EVIDENCE_MAX_BYTES) {
        const oldest = eviction.shift()
        if (!oldest) break
        if (!byId.delete(oldest.localId)) continue
        bytes -= encodedBytes(oldest)
    }

    return Array.from(byId.values()).sort((a, b) => a.completedAt - b.completedAt || a.localId.localeCompare(b.localId))
}

function validItems(raw: unknown[]): GuestEvidenceTest[] {
    return raw.flatMap((item) => {
        const parsed = parseGuestEvidenceTest(item)
        return parsed ? [parsed] : []
    })
}

// The store's public interface is persistence-agnostic so its caps, validation,
// and confirmed-only deletion can be tested in Node. Pages/hooks use only the
// default native IndexedDB instance below.
export function createGuestEvidenceStore(storage: GuestEvidenceStorage) {
    return {
        async read(): Promise<GuestEvidenceTest[]> {
            try {
                const raw = await storage.load()
                const retained = retainWithinCaps(validItems(raw))
                if (retained.length !== raw.length) await storage.replace(retained)
                return retained
            } catch {
                return []
            }
        },
        async add(item: GuestEvidenceTest): Promise<boolean> {
            const parsed = parseGuestEvidenceTest(item)
            if (!parsed) return false
            try {
                const current = validItems(await storage.load())
                await storage.replace(retainWithinCaps([...current, parsed]))
                return true
            } catch {
                return false
            }
        },
        async remove(localIds: readonly string[]): Promise<boolean> {
            if (localIds.length === 0) return true
            try {
                const ids = new Set(localIds)
                const current = validItems(await storage.load())
                await storage.replace(current.filter((item) => !ids.has(item.localId)))
                return true
            } catch {
                return false
            }
        },
    }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
    })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"))
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
    })
}

async function openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB unavailable")
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    return new Promise((resolve, reject) => {
        let blocked = false
        request.onupgradeneeded = () => {
            const database = request.result
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: "localId" })
            }
        }
        request.onsuccess = () => {
            if (blocked) request.result.close()
            else resolve(request.result)
        }
        request.onerror = () => reject(request.error ?? new Error("Could not open guest evidence"))
        request.onblocked = () => {
            blocked = true
            reject(new Error("Guest evidence database upgrade blocked"))
        }
    })
}

const indexedDbStorage: GuestEvidenceStorage = {
    async load() {
        const database = await openDatabase()
        try {
            const transaction = database.transaction(STORE_NAME, "readonly")
            return await requestResult(transaction.objectStore(STORE_NAME).getAll() as IDBRequest<unknown[]>)
        } finally {
            database.close()
        }
    },
    async replace(items) {
        const database = await openDatabase()
        try {
            const transaction = database.transaction(STORE_NAME, "readwrite")
            const store = transaction.objectStore(STORE_NAME)
            store.clear()
            for (const item of items) store.put(item)
            await transactionDone(transaction)
        } finally {
            database.close()
        }
    },
}

const defaultStore = createGuestEvidenceStore(indexedDbStorage)
let writeQueue: Promise<unknown> = Promise.resolve()

export function readGuestEvidenceTests(): Promise<GuestEvidenceTest[]> {
    const operation = writeQueue.then(() => defaultStore.read(), () => defaultStore.read())
    writeQueue = operation
    return operation
}

export function createGuestEvidenceId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function addGuestEvidenceTest(item: GuestEvidenceTest): Promise<boolean> {
    const operation = writeQueue.then(() => defaultStore.add(item), () => defaultStore.add(item))
    writeQueue = operation
    return operation
}

export function removeGuestEvidenceTests(localIds: readonly string[]): Promise<boolean> {
    const operation = writeQueue.then(() => defaultStore.remove(localIds), () => defaultStore.remove(localIds))
    writeQueue = operation
    return operation
}
