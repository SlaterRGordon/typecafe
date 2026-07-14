import { describe, expect, it } from "vitest";

import { shareWpmSchema, SHARE_WPM_MAX } from "./shareSnapshot";

describe("score share WPM validation", () => {
  it("accepts four-digit unranked results and chart samples", () => {
    expect(shareWpmSchema.safeParse(1129.2).success).toBe(true);
  });

  it("retains a finite abuse bound", () => {
    expect(shareWpmSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(shareWpmSchema.safeParse(SHARE_WPM_MAX + 1).success).toBe(false);
  });
});
