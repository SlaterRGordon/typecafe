import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

async function saveScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
}

test.describe("visual QA artifacts", () => {
  test("home default, settings menu, Practice keyboard, and color modal", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.locator("#words .char").first()).toBeVisible();
    await saveScreenshot(page, testInfo, "home-default");

    // Settings is a toolbar dropdown, not a modal.
    await page.locator("[aria-label='Open typing settings']").click();
    const settingsMenu = page.getByTestId("settings-menu");
    await expect(settingsMenu).toBeVisible();
    await saveScreenshot(page, testInfo, "home-settings-modal");
    await page.keyboard.press("Escape");
    await expect(settingsMenu).toBeHidden();

    await page.goto("/practice?custom=keys");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await saveScreenshot(page, testInfo, "custom-practice-keyboard");

    await page.locator("[aria-label='Open color settings']").click({ force: true });
    await expect(page.locator("#colorModal")).toBeChecked();
    await saveScreenshot(page, testInfo, "home-color-modal");
  });

  test("train page", async ({ page }, testInfo) => {
    await page.goto("/train");
    await expect(page.getByTestId("train-continue")).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(page, testInfo, "train-map");

    await page.getByTestId("train-continue").click();
    await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(page, testInfo, "train");
  });

  test("leaderboard", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await page.goto("/leaderboard");
    await expect(page.getByText("testuser")).toBeVisible();

    await saveScreenshot(page, testInfo, "leaderboard");
  });

  test("authenticated profile", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await page.goto("/profile");
    await expect(page.getByText("testuser").first()).toBeVisible();

    await saveScreenshot(page, testInfo, "authenticated-profile");
  });
});
