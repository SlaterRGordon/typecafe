import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { chooseReactSelectOption } from "./helpers/select";
import { typeCurrentCharacter } from "./helpers/typing";

async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.locator("#typer")).toBeVisible();
  await expect(page.locator("#words .char").first()).toBeVisible();
}

test.describe("home typing test", () => {
  test("renders typing text and advances when the active character is typed", async ({ page }) => {
    await gotoHome(page);

    await expect(page.locator("#c0")).toHaveClass(/active-char/);

    await typeCurrentCharacter(page);

    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);
    await expect(page.locator("#c1")).toHaveClass(/active-char/);
  });

  test("restart resets typed character state", async ({ page }) => {
    await gotoHome(page);

    await typeCurrentCharacter(page);
    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);

    await page.locator("button", { has: page.locator("#restart") }).click();

    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(page.locator("#c0")).not.toHaveClass(/text-base-300/);
  });

  test("settings can switch from timed to words and grams mode", async ({ page }) => {
    await gotoHome(page);

    await page.locator("#typer label[for='configModal']").click();
    await expect(page.locator("#configModal")).toBeChecked();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await page.getByRole("button", { name: "Words" }).click();
    await expect(page.getByRole("heading", { name: "Length" })).toBeVisible();
    await page.getByRole("button", { name: "25" }).click();

    await page.getByRole("button", { name: "Grams" }).click();
    await expect(page.getByRole("heading", { name: "Source" })).toBeVisible();
    await expect(page.locator("#testGramCombinationInput")).toHaveValue("1");

    await page.locator("#testGramAccuracyThresholdInput").fill("105");
    await expect(page.locator("#testGramAccuracyThresholdInput")).toHaveValue("100");
  });

  test("does not log a score when switching modes mid-test", async ({ page }) => {
    let scoreCreates = 0;

    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      onProcedure: (procedure) => {
        if (procedure === "test.create") scoreCreates += 1;
      },
    });
    await gotoHome(page);

    await typeCurrentCharacter(page);
    await page.locator("#typer label[for='configModal']").click();
    await page.getByRole("button", { name: "Words" }).click();
    await page.waitForTimeout(250);

    expect(scoreCreates).toBe(0);

    await page.getByRole("button", { name: "Timed" }).click();
    await page.waitForTimeout(250);

    expect(scoreCreates).toBe(0);
  });

  test("settings cover language, practice, relaxed, stats, and keyboard options", async ({ page }) => {
    await gotoHome(page);

    await page.locator("[aria-label='Open typing settings']").click();

    await chooseReactSelectOption(page, "languageSelect", "Spanish");
    await expect(page.getByText("Spanish", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "off" }).first().click();
    await expect(page.getByText("0.0wpm")).toBeHidden();

    await page.getByRole("button", { name: "on" }).last().click();
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    await page.getByRole("button", { name: "Practice" }).click();
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    await page.getByRole("button", { name: "Relaxed" }).click();
    await expect(page.getByRole("heading", { name: "Live stats" })).toBeVisible();
  });

  test("saves a home screenshot artifact for agent inspection", async ({ page }, testInfo) => {
    await gotoHome(page);

    await page.screenshot({
      path: testInfo.outputPath("home.png"),
      fullPage: true,
    });
  });
});
