import { expect, test } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { typeCurrentCharacter } from "./helpers/typing";

test.describe("daily challenge", () => {
  test("renders today's seeded challenge text", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/challenge");

    await expect(page.getByTestId("challenge-header")).toBeVisible();
    await expect(page.getByText(/everyone types the same text today/)).toBeVisible();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await expect(page.getByTestId("daily-challenge-boards")).toBeVisible();
    await expect(page.getByText("Fastest Today")).toBeVisible();
    await expect(page.getByText("Most Improved")).toBeVisible();
    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.getByText("slowgain")).toBeVisible();
    await expect(page.getByText("+6.0")).toBeVisible();
  });

  test("the challenge text is identical on reload (deterministic, same day)", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/challenge");
    await expect(page.locator("#words .char").first()).toBeVisible();
    const first = await page.locator("#words").innerText();

    await page.reload();
    await expect(page.locator("#words .char").first()).toBeVisible();
    const second = await page.locator("#words").innerText();

    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
  });

  test("signed-in challenge completions stamp the saved test row", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "fake-clock completion is covered in desktop; mobile covers the visible challenge UI");
    await page.clock.install({ time: new Date("2026-06-16T12:00:00.000Z") });
    await mockAuthenticatedSession(page);
    let createInput: Record<string, unknown> | undefined;
    await mockTrpc(page, {
      onProcedure(procedure, input) {
        if (procedure === "test.create") createInput = input;
      },
    });

    await page.goto("/challenge");
    await expect(page.getByTestId("challenge-header")).toBeVisible();
    await typeCurrentCharacter(page);
    await page.clock.runFor(100);
    await page.clock.runFor(31_000);

    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 10_000 });
    expect(createInput?.count).toBe(30);
    expect(createInput?.challengeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
