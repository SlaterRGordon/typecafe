import { describe, expect, it } from "vitest";
import { formatTypedDuration } from "./utils";

describe("formatTypedDuration", () => {
    it("labels short timed practice in minutes", () => {
        expect(formatTypedDuration(1_234)).toEqual({ value: "20.57", label: "minutes typed" });
    });

    it("labels longer totals in hours", () => {
        expect(formatTypedDuration(7_200)).toEqual({ value: "2", label: "hours typed" });
    });

    it("labels very large totals in days", () => {
        expect(formatTypedDuration(172_800)).toEqual({ value: "2", label: "days typed" });
    });
});
