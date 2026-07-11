import { describe, expect, it } from "vitest"
import { privateUserSelect, publicUserSelect } from "./userSelect"

describe("user API selects", () => {
    it("never includes authentication fields in public or self-profile responses", () => {
        expect(publicUserSelect).not.toHaveProperty("password")
        expect(publicUserSelect).not.toHaveProperty("email")
        expect(privateUserSelect).not.toHaveProperty("password")
        expect(privateUserSelect).toMatchObject({ email: true, emailVerified: true })
    })
})
