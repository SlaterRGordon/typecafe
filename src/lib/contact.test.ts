import { describe, expect, it } from "vitest"
import { contactMessageSchema } from "./contact"

describe("contactMessageSchema", () => {
    it("normalizes valid contact messages", () => {
        expect(contactMessageSchema.parse({
            name: "  Ada  ",
            email: " ADA@EXAMPLE.COM ",
            message: "  A useful bug report.  ",
            website: "",
        })).toMatchObject({ name: "Ada", email: "ada@example.com", message: "A useful bug report." })
    })

    it("rejects header injection, oversized messages, and honeypot submissions", () => {
        expect(contactMessageSchema.safeParse({ name: "Ada\r\nBcc: x", email: "a@example.com", message: "Long enough message" }).success).toBe(false)
        expect(contactMessageSchema.safeParse({ name: "Ada", email: "a@example.com", message: "x".repeat(5001) }).success).toBe(false)
        expect(contactMessageSchema.safeParse({ name: "Ada", email: "a@example.com", message: "Long enough message", website: "spam" }).success).toBe(false)
    })
})
