import { describe, expect, it } from "vitest"
import { emailSchema, passwordSchema, profileLinkSchema, publicUsernameLookupSchema, usernameSchema } from "./userProfile"

describe("account validation", () => {
    it("normalizes email and trims route-safe usernames", () => {
        expect(emailSchema.parse(" User@Example.COM ")).toBe("user@example.com")
        expect(usernameSchema.parse(" fast_typist ")).toBe("fast_typist")
    })

    it("rejects usernames that can break or obscure profile routes", () => {
        for (const username of ["ab", "with space", "path/name", "name?tab=1", "emoji☕"]) {
            expect(usernameSchema.safeParse(username).success).toBe(false)
        }
    })

    it("allows legacy usernames only when looking up an existing public profile", () => {
        expect(publicUsernameLookupSchema.parse(" EA Logic ")).toBe("EA Logic")
        expect(publicUsernameLookupSchema.safeParse("").success).toBe(false)
        expect(publicUsernameLookupSchema.safeParse("x".repeat(65)).success).toBe(false)
    })

    it("accepts only web profile links", () => {
        expect(profileLinkSchema.safeParse("https://example.com/me").success).toBe(true)
        expect(profileLinkSchema.safeParse("").success).toBe(true)
        expect(profileLinkSchema.safeParse("javascript:alert(1)").success).toBe(false)
        expect(profileLinkSchema.safeParse("example.com/me").success).toBe(false)
    })

    it("pins the credential password policy", () => {
        expect(passwordSchema.safeParse("Password1").success).toBe(true)
        expect(passwordSchema.safeParse("password1").success).toBe(false)
        expect(passwordSchema.safeParse("PASSWORD1").success).toBe(false)
        expect(passwordSchema.safeParse("Password").success).toBe(false)
    })
})
