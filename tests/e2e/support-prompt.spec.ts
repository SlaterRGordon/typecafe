import { expect, test, type Page } from "@playwright/test";

const storageKey = "typecafe.supportDismissedAt";
const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;

async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.locator("#typer")).toBeVisible();
}

test.describe("global support prompt", () => {
  test.skip(({ isMobile }) => isMobile, "The global support prompt is desktop-only.");

  test("appears on non-support routes, dismisses for reloads, and stores the dismissal time", async ({ page }) => {
    await gotoHome(page);

    const prompt = page.getByTestId("global-support-prompt");
    await expect(prompt).toBeVisible();

    await prompt.getByRole("button", { name: "Dismiss support prompt" }).click();
    await expect(prompt).toBeHidden();

    const storedDismissedAt = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);
    expect(Number(storedDismissedAt)).toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator("#typer")).toBeVisible();
    await expect(prompt).toBeHidden();
  });

  test("stays hidden when dismissed within 14 days", async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, Date.now().toString());
    }, storageKey);

    await gotoHome(page);

    await expect(page.getByTestId("global-support-prompt")).toBeHidden();
  });

  test("appears again when dismissal is older than 14 days or malformed", async ({ page }) => {
    await page.addInitScript(({ key, dismissedAt }) => {
      window.localStorage.setItem(key, dismissedAt.toString());
    }, { key: storageKey, dismissedAt: fifteenDaysAgo });

    await gotoHome(page);

    await expect(page.getByTestId("global-support-prompt")).toBeVisible();

    await page.evaluate((key) => window.localStorage.setItem(key, "not-a-date"), storageKey);
    await page.reload();
    await expect(page.locator("#typer")).toBeVisible();
    await expect(page.getByTestId("global-support-prompt")).toBeVisible();
  });

  test("does not render the global prompt on the support page", async ({ page }) => {
    await page.goto("/support");

    await expect(page.getByRole("heading", { name: "Support TypeCafe" })).toBeVisible();
    await expect(page.getByTestId("global-support-prompt")).toBeHidden();
  });
});
