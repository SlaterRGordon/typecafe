import { describe, expect, it, vi } from "vitest"
import { createDailySession } from "~/lib/dailyCoaching"
import { encodeTimeline } from "~/lib/keystrokes"
import { coachingSessionRouter } from "./coachingSession"
import { testRouter } from "./test"

vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }))
vi.mock("~/server/db", () => ({ prisma: {} }))

function callerContext(prisma: unknown) {
    return {
        prisma,
        session: { user: { id: "user-1" }, expires: "2099-01-01T00:00:00.000Z" },
        requestIdentity: "unit-test",
    } as never
}

describe("evidence history routers", () => {
    it("returns bounded, parsed Timelines newest first with separate discovery and response windows", async () => {
        const timeline = encodeTimeline([{ key: "a", typed: "a", correct: true, t: 0 }])
        const naturalRow = {
            createdAt: new Date("2026-07-13T12:00:00.000Z"),
            evidenceContext: "natural",
            ranked: true,
            count: 30,
            options: "",
            punctuation: false,
            capitals: false,
            numbers: false,
            layout: "qwerty",
            timeline,
            practice: null,
            type: { mode: 0, subMode: 0, language: "english" },
        }
        const responseRow = {
            createdAt: new Date("2026-07-14T12:00:00.000Z"),
            evidenceContext: "transfer",
            ranked: false,
            count: 25,
            options: "",
            punctuation: false,
            capitals: false,
            numbers: false,
            layout: "qwertz-de",
            timeline,
            practice: null,
            type: { mode: 0, subMode: 1, language: "english" },
        }
        const corruptRow = { ...naturalRow, createdAt: new Date("2026-07-12T12:00:00.000Z"), timeline: { corrupt: true } }
        const findMany = vi.fn()
            .mockResolvedValueOnce([naturalRow, corruptRow])
            .mockResolvedValueOnce([responseRow])
            .mockResolvedValueOnce([])
        const caller = testRouter.createCaller(callerContext({ test: { findMany } }))

        const result = await caller.getLatestTimelines({ language: "english5k", pool: "qwerty" })

        expect(findMany).toHaveBeenCalledTimes(3)
        const [discoveryQuery, responseQuery, customPracticeQuery] = findMany.mock.calls.map((call) => call[0] as unknown as {
            orderBy: { createdAt: string }
            take: number
            where: {
                userId: string
                layout: { in: string[] }
                type: { language: string }
                OR?: unknown[]
                evidenceContext?: { in: string[] } | string
            }
        })
        for (const query of [discoveryQuery!, responseQuery!, customPracticeQuery!]) {
            expect(query.orderBy).toEqual({ createdAt: "desc" })
            expect(query.take).toBe(30)
            expect(query.where.userId).toBe("user-1")
            expect(query.where.layout.in).toContain("qwerty")
            expect(query.where.layout.in).toContain("qwertz-de")
            expect(query.where.type).toEqual({ language: "english" })
        }
        expect(discoveryQuery!.where.OR).toEqual([
            { evidenceContext: { in: ["natural", "diagnostic"] } },
            { evidenceContext: null, ranked: true, type: { language: "english", mode: 0 } },
        ])
        expect(responseQuery!.where.evidenceContext).toEqual({ in: ["acquisition", "transfer", "cold"] })
        expect(customPracticeQuery!.where.evidenceContext).toBe("custom-practice")
        // Merged newest first; the corrupt timeline is dropped, not fatal.
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ context: "transfer", pool: "qwerty", language: "english" })
        expect(result[1]).toMatchObject({ context: "natural", pool: "qwerty", language: "english" })
        await expect(caller.getLatestTimelines({ language: "english", pool: "qwerty", limit: 91 })).rejects.toThrow()
    })

    it("returns only validated Coaching snapshots for one language and pool", async () => {
        const session = createDailySession({
            dateKey: "2026-07-14",
            pool: "qwerty",
            language: "english",
            attempts: new Map(),
            transitions: [],
            now: 100,
        })
        const findMany = vi.fn().mockResolvedValue([
            { snapshot: session },
            { snapshot: { ...session, language: "french" } },
            { snapshot: { broken: true } },
        ])
        const caller = coachingSessionRouter.createCaller(callerContext({ coachingSession: { findMany } }))

        const result = await caller.getHistory({ language: "english", pool: "qwerty" })

        expect(findMany).toHaveBeenCalledWith({
            where: { userId: "user-1", pool: "qwerty", language: "english" },
            orderBy: { dateKey: "desc" },
            take: 30,
            select: { snapshot: true },
        })
        expect(result).toEqual([session])
        await expect(caller.getHistory({ language: "english", pool: "qwerty", limit: 91 })).rejects.toThrow()
    })
})
