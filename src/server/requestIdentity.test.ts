import { describe, expect, it } from "vitest"
import { requestIdentity } from "./requestIdentity"

describe("requestIdentity", () => {
    it("prefers the platform forwarding header and takes only the client hop", () => {
        expect(requestIdentity({
            headers: { "x-vercel-forwarded-for": "203.0.113.8, 10.0.0.1" },
            socket: { remoteAddress: "127.0.0.1" },
        })).toBe("203.0.113.8")
    })

    it("falls back to the socket address", () => {
        expect(requestIdentity({ headers: {}, socket: { remoteAddress: "127.0.0.1" } })).toBe("127.0.0.1")
    })
})
