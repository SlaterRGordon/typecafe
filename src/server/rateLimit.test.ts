import { describe, expect, it } from "vitest"
import { publicWriteQuotaKey, rateLimitResult } from "./rateLimit"

describe("public write quotas", () => {
    it("stores a stable one-way key rather than the request identity", () => {
        const key = publicWriteQuotaKey("contact", "203.0.113.8")
        expect(key).toHaveLength(64)
        expect(key).not.toContain("203.0.113.8")
        expect(key).toBe(publicWriteQuotaKey("contact", "203.0.113.8"))
        expect(key).not.toBe(publicWriteQuotaKey("guest-share", "203.0.113.8"))
    })

    it("allows through the limit and returns a bounded retry delay", () => {
        const now = new Date("2026-07-11T12:00:00.000Z")
        const expires = new Date("2026-07-11T13:00:00.000Z")
        expect(rateLimitResult(3, expires, 3, now)).toEqual({ allowed: true, retryAfterSeconds: 3600 })
        expect(rateLimitResult(4, expires, 3, now)).toEqual({ allowed: false, retryAfterSeconds: 3600 })
    })
})
