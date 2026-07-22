import { describe, expect, it } from "vitest"
import { TestModes, TestSubModes } from "~/components/typer/types"
import { DEFAULT_TEST_SETTINGS, sanitizeTestSettings } from "./useTestSettings"

describe("sanitizeTestSettings", () => {
    it.each([TestModes.practice, TestModes.ngrams])("retires persisted legacy mode %s to an ordinary Test", (mode) => {
        expect(sanitizeTestSettings({ ...DEFAULT_TEST_SETTINGS, mode })).toMatchObject({
            mode: TestModes.normal,
            subMode: TestSubModes.timed,
            count: 15,
        })
    })

    it("keeps valid ordinary settings", () => {
        expect(sanitizeTestSettings({ ...DEFAULT_TEST_SETTINGS, mode: TestModes.relaxed, subMode: TestSubModes.words, count: 25 }))
            .toMatchObject({ mode: TestModes.relaxed, subMode: TestSubModes.words, count: 25 })
    })

    it("repairs malformed mode, submode, count, and quote length values", () => {
        expect(sanitizeTestSettings({
            ...DEFAULT_TEST_SETTINGS,
            mode: 999,
            subMode: 999,
            count: -4,
            customLength: true,
            quoteLength: "novel",
        })).toMatchObject({
            mode: TestModes.normal,
            subMode: TestSubModes.timed,
            count: 15,
            customLength: false,
            quoteLength: "all",
        })
    })

    it("ignores retired Home Practice and Grams fields", () => {
        expect(sanitizeTestSettings({ ...DEFAULT_TEST_SETTINGS, selectedKeys: ["x"], gramWpmThreshold: 90 }))
            .toEqual(DEFAULT_TEST_SETTINGS)
    })
})
