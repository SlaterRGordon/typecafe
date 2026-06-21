import { expect, test } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { typeVisibleTestText } from "./helpers/typing";

test.describe("practice plan", () => {
  test("guided player walks one active step at a time (warm-up → drill)", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "r", total: 100, correct: 70 }, { character: "t", total: 80, correct: 62 }] });
    await page.goto("/plan");

    await expect(page.getByRole("heading", { name: "Your plan" })).toBeVisible();
    await expect(page.getByText(/30-day plan/)).toBeVisible();

    // Day 1 starts with a 15s timed warm-up that runs on /drill.
    const step = page.getByTestId("plan-active-step");
    await expect(step).toContainText("Warm up");
    await expect(page.getByText("Day 1 of 30")).toBeVisible();
    await expect(page.getByTestId("plan-start-step")).toHaveAttribute("href", /^\/drill\?seconds=15.*return=plan/);
    await page.getByTestId("plan-advance").click(); // Skip → next

    // Now the targeted key drill, deep-linking into /drill with a plan return.
    await expect(step).toContainText("Drill your weak keys");
    const start = page.getByTestId("plan-start-step");
    await expect(start).toHaveAttribute("href", /^\/drill\?keys=.*return=plan/);
  });

  test("completing a drill from a step advances the player", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "r", total: 100, correct: 70 }, { character: "t", total: 80, correct: 62 }] });

    // Land on a plan drill (default session is day 1, step 0 → completing advances).
    await page.goto("/drill?keys=r&length=4&return=plan");
    await expect(page.getByTestId("drill-typer")).toBeVisible();
    await typeVisibleTestText(page);

    await expect(page.getByTestId("drill-result")).toBeVisible();
    await page.getByTestId("drill-continue-plan").click();

    // Back on the plan, advanced to the next step.
    await expect(page).toHaveURL(/\/plan/);
    await expect(page.getByTestId("plan-active-step")).toBeVisible();
    await expect(page.getByText(/Step 2 of/)).toBeVisible();
  });

  test("a guest with no history gets a calibration week", async ({ page }) => {
    await page.goto("/plan");
    await expect(page.getByText(/Calibration week/)).toBeVisible();
    await expect(page.getByText("Day 1 of 7")).toBeVisible();
  });

  test("a plan config link selects the mode and length on the home page", async ({ page }) => {
    // Benchmark/warm-up steps deep-link via ?mode=…&count=… (Phase 4 handoff).
    await page.goto("/?mode=words&count=25");
    await expect(page.locator("#typer")).toBeVisible();
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Words" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "25", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("a benchmark step shows Continue plan on completion", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    // A benchmark/warm-up step lands on home as /?mode=…&return=plan.
    await page.goto("/?mode=words&count=4&return=plan");
    await expect(page.locator("#words .char").first()).toBeVisible();
    await typeVisibleTestText(page);

    const cont = page.getByTestId("continue-plan");
    await expect(cont).toBeVisible();
    await expect(cont).toHaveAttribute("href", "/plan?step=done");
  });
});
