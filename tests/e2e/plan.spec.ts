import { expect, test } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

test.describe("practice plan", () => {
  test("a signed-in user with data gets a targeted 30-day plan", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "r", total: 100, correct: 70 }, { character: "t", total: 80, correct: 62 }] });
    await page.goto("/plan");

    await expect(page.getByRole("heading", { name: "Your plan" })).toBeVisible();
    await expect(page.getByText(/30-day plan/)).toBeVisible();

    const today = page.getByTestId("plan-today");
    await expect(today).toBeVisible();
    await expect(today).toContainText("Day 1 · today");
    // Each step deep-links into a real mode.
    await expect(today.getByRole("link", { name: "Start" }).first()).toBeVisible();

    // Marking a day complete advances to the next day.
    await page.getByTestId("plan-complete-day").click();
    await expect(page.getByTestId("plan-today")).toContainText("Day 2");
  });

  test("a guest with no history gets a calibration week", async ({ page }) => {
    await page.goto("/plan");
    await expect(page.getByText(/Calibration week/)).toBeVisible();
    await expect(page.getByTestId("plan-today")).toContainText("Day 1");
  });

  test("a plan config link selects the mode and length on the home page", async ({ page }) => {
    // Benchmark/warm-up steps deep-link via ?mode=…&count=… (Phase 4 handoff).
    await page.goto("/?mode=words&count=25");
    await expect(page.locator("#typer")).toBeVisible();
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Words" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "25", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});
