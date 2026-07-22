import { describe, expect, it, vi } from "vitest"
import { addRecentCustomGram, emptyCustomGramsPreference, updateCustomGramsSetup } from "~/lib/customGramsPreference"
import { customGramsPreferenceRouter } from "./customGramsPreference"

vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }))
vi.mock("~/server/db", () => ({ prisma: {} }))

function callerContext(prisma: unknown, userId: string | null = "user-1") {
    return {
        prisma,
        session: userId ? { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" } : null,
        requestIdentity: "unit-test",
    } as never
}

describe("Custom Grams preference router", () => {
    it("reads only the authenticated account and requested language", async () => {
        const snapshot = addRecentCustomGram(emptyCustomGramsPreference("english"), "th", 10)
        const findUnique = vi.fn().mockResolvedValue({ snapshot })
        const caller = customGramsPreferenceRouter.createCaller(callerContext({
            customGramsPreference: { findUnique },
        }, "account-2"))

        await expect(caller.get({ language: "english" })).resolves.toEqual(snapshot)
        expect(findUnique).toHaveBeenCalledWith({
            where: { userId_language: { userId: "account-2", language: "english" } },
            select: { snapshot: true },
        })
    })

    it("converges stale retries without duplicate or timestamp regression", async () => {
        const existing = addRecentCustomGram(emptyCustomGramsPreference("english"), "th", 20)
        const incoming = addRecentCustomGram(emptyCustomGramsPreference("english"), "th", 10)
        const upsert = vi.fn().mockResolvedValue({})
        const delegate = { findUnique: vi.fn().mockResolvedValue({ snapshot: existing }), upsert }
        const transaction = vi.fn(async (work: (client: unknown) => Promise<unknown>) => work({ customGramsPreference: delegate }))
        const caller = customGramsPreferenceRouter.createCaller(callerContext({ customGramsPreference: delegate, $transaction: transaction }))

        await expect(caller.merge({ snapshot: incoming })).resolves.toEqual(existing)
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId_language: { userId: "user-1", language: "english" } },
            update: { snapshot: existing },
        }))
        expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" })
    })

    it("keeps a newer account setup while independently accepting newer Recent activity", async () => {
        const existing = updateCustomGramsSetup(emptyCustomGramsPreference("english"), {
            grams: ["th", "station"], durationSeconds: 47, infinite: true, textStyle: "pseudo",
        }, 200)
        const incoming = addRecentCustomGram(updateCustomGramsSetup(emptyCustomGramsPreference("english"), {
            grams: ["er"], durationSeconds: 30, textStyle: "varied",
        }, 100), "er", 300)
        const delegate = {
            findUnique: vi.fn().mockResolvedValue({ snapshot: existing }),
            upsert: vi.fn().mockResolvedValue({}),
        }
        const transaction = vi.fn(async (work: (client: unknown) => Promise<unknown>) => work({ customGramsPreference: delegate }))
        const caller = customGramsPreferenceRouter.createCaller(callerContext({ customGramsPreference: delegate, $transaction: transaction }))

        const merged = await caller.merge({ snapshot: incoming })

        expect(merged.setup).toEqual(existing.setup)
        expect(merged.entries).toEqual([{ gram: "er", lastUsedAt: 300 }])
    })

    it("accepts and persists mixed Words with custom seconds and infinity", async () => {
        const incoming = addRecentCustomGram(updateCustomGramsSetup(emptyCustomGramsPreference("english"), {
            grams: ["th", "l'esprit", "co-operate"], durationSeconds: 47, infinite: true, textStyle: "pseudo",
        }, 200), "station", 300)
        let persisted: unknown
        const upsert = vi.fn((input: { create: { snapshot: unknown } }) => {
            persisted = input.create.snapshot
            return Promise.resolve(input)
        })
        const delegate = { findUnique: vi.fn().mockResolvedValue(null), upsert }
        const transaction = vi.fn(async (work: (client: unknown) => Promise<unknown>) => work({ customGramsPreference: delegate }))
        const caller = customGramsPreferenceRouter.createCaller(callerContext({ customGramsPreference: delegate, $transaction: transaction }))

        await expect(caller.merge({ snapshot: incoming })).resolves.toEqual(incoming)
        expect(persisted).toEqual(incoming)
    })

    it("serializes concurrent device merges so neither new Gram is lost", async () => {
        let stored = emptyCustomGramsPreference("english")
        const delegate = {
            findUnique: vi.fn(() => Promise.resolve({ snapshot: stored })),
            upsert: vi.fn((input: { update: { snapshot: typeof stored } }) => {
                stored = input.update.snapshot
                return Promise.resolve({})
            }),
        }
        let queue = Promise.resolve<unknown>(undefined)
        const transaction = vi.fn((work: (client: unknown) => Promise<unknown>) => {
            const result = queue.then(() => work({ customGramsPreference: delegate }))
            queue = result.then(() => undefined, () => undefined)
            return result
        })
        const caller = customGramsPreferenceRouter.createCaller(callerContext({ customGramsPreference: delegate, $transaction: transaction }))

        await Promise.all([
            caller.merge({ snapshot: addRecentCustomGram(emptyCustomGramsPreference("english"), "th", 10) }),
            caller.merge({ snapshot: addRecentCustomGram(emptyCustomGramsPreference("english"), "er", 11) }),
        ])

        expect(stored.entries).toEqual([{ gram: "er", lastUsedAt: 11 }, { gram: "th", lastUsedAt: 10 }])
    })

    it("rejects unsupported languages and unauthenticated access", async () => {
        const caller = customGramsPreferenceRouter.createCaller(callerContext({ customGramsPreference: {} }))
        await expect(caller.get({ language: "klingon" })).rejects.toThrow()

        const guest = customGramsPreferenceRouter.createCaller(callerContext({}, null))
        await expect(guest.get({ language: "english" })).rejects.toThrow()
    })

    it("rejects missing preference snapshots as a bad request", async () => {
        const caller = customGramsPreferenceRouter.createCaller(callerContext({ customGramsPreference: {} }))
        await expect(caller.merge({ snapshot: undefined })).rejects.toThrow("Invalid Custom Grams preference")
    })
})
