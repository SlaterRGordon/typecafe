import { describe, expect, it, vi } from "vitest"
import { drillTargetToken } from "~/lib/coachingTarget"
import { encodeTimeline } from "~/lib/keystrokes"
import type { GuestEvidenceTest } from "~/lib/guestEvidence"
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

function guidedEvidence(): GuestEvidenceTest {
    const target = { kind: "transition" as const, pair: "th", metric: "latency" as const }
    return {
        localId: "practice-1",
        completedAt: new Date("2026-07-20T08:00:00.000Z").getTime(),
        context: "acquisition",
        practice: {
            v: 1,
            kind: "guided",
            focus: { kind: "grams", items: ["th"] },
            textStyle: "varied",
            durationSeconds: 60,
            elapsedActivityMs: 61_000,
            completed: true,
            target,
        },
        config: {
            mode: 0,
            subMode: 0,
            count: 60,
            options: drillTargetToken(target),
            punctuation: false,
            capitals: false,
            numbers: false,
            layout: "qwerty",
            language: "english",
            utcOffsetMinutes: -420,
        },
        timeline: encodeTimeline([
            { key: "t", typed: "t", correct: true, t: 0 },
            { key: "h", typed: "h", correct: true, t: 120 },
        ]),
    }
}

describe("guest Practice evidence import", () => {
    it("preserves metadata and converges duplicate imports on user plus local id", async () => {
        const upsert = vi.fn().mockResolvedValue({ id: "stored" })
        const prisma = {
            testType: { findFirst: vi.fn().mockResolvedValue({ id: "normal-timed" }) },
            test: { upsert },
        }
        const caller = testRouter.createCaller(callerContext(prisma))
        const item = guidedEvidence()

        const first = await caller.importGuestEvidence({ tests: [item] })
        const retry = await caller.importGuestEvidence({ tests: [item] })

        expect(first).toEqual({ confirmedLocalIds: [item.localId], rejected: 0 })
        expect(retry).toEqual(first)
        expect(upsert).toHaveBeenCalledTimes(2)
        for (const [call] of upsert.mock.calls) {
            expect(call).toMatchObject({
                where: { userId_guestLocalId: { userId: "user-1", guestLocalId: item.localId } },
                update: {},
                create: {
                    ranked: false,
                    evidenceContext: "acquisition",
                    guestLocalId: item.localId,
                    practice: item.practice,
                },
            })
        }
    })

    it("rejects Custom Practice with Target attribution before import", async () => {
        const item = guidedEvidence()
        const invalid = {
            ...item,
            context: "custom-practice" as const,
            practice: {
                ...item.practice!,
                kind: "custom" as const,
            },
        }
        const caller = testRouter.createCaller(callerContext({}))

        await expect(caller.importGuestEvidence({ tests: [invalid] })).rejects.toThrow()
    })
})
