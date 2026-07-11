import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockTrpc } from "./helpers/trpc";
import { typeCurrentCharacter } from "./helpers/typing";

async function expectTypingFocus(page: Page, faded: Locator) {
  await expect(page.locator("html")).toHaveAttribute("data-typing-focus", "active");
  await expect(faded).toHaveCSS("opacity", "0");
  await expect(page.locator(".typing-focus-global-fade").first()).toHaveCSS("opacity", "0");
  await expect(page.locator("#words")).toBeVisible();
}

test.describe("typing focus fade", () => {
  test("home fades the toolbar and global nav while typing", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#words .char").first()).toBeVisible();

    await typeCurrentCharacter(page);

    await expectTypingFocus(page, page.getByTestId("typing-focus-home-controls"));

    await page.keyboard.down("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Tab");

    await expect(page.locator("html")).not.toHaveAttribute("data-typing-focus", "active");
    await expect(page.getByTestId("typing-focus-home-controls")).toHaveCSS("opacity", "1");
  });

  test("Tab then Enter restarts sequentially, not just as a held chord", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#words .char").first()).toBeVisible();

    await typeCurrentCharacter(page);
    await expectTypingFocus(page, page.getByTestId("typing-focus-home-controls"));

    // Tab released *before* Enter - the shortcut must still fire.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    await expect(page.locator("html")).not.toHaveAttribute("data-typing-focus", "active");
    await expect(page.getByTestId("typing-focus-home-controls")).toHaveCSS("opacity", "1");
  });

  test("train fades level controls but keeps the keyboard visible while typing", async ({ page }) => {
    await page.goto("/train");
    // /train lands on the level map; Continue zooms into the resume level.
    await page.getByTestId("train-continue").click();
    await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });

    await typeCurrentCharacter(page);

    await expectTypingFocus(page, page.getByTestId("train-controls"));
    // The keyboard stays visible while typing - it's a typing aid, not chrome.
    await expect(page.getByTestId("train-keyboard-wrap")).toHaveCSS("opacity", "1");
  });

  test("challenge fades the header and boards while typing", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/challenge");
    await expect(page.locator("#words .char").first()).toBeVisible();

    await typeCurrentCharacter(page);

    await expectTypingFocus(page, page.getByTestId("challenge-header"));
    await expect(page.getByTestId("daily-challenge-boards")).toHaveCSS("opacity", "0");
  });

  test("drill fades its instruction card while typing", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/drill?keys=x&length=4");
    await expect(page.getByTestId("drill-typer")).toBeVisible();

    await typeCurrentCharacter(page);

    await expectTypingFocus(page, page.getByTestId("drill-header"));
    await expect(page.getByTestId("drill-typer")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("beat-run challenge fades its target header while typing", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/score/beat-source-score");
    await expect(page.getByTestId("beat-run-cta")).toBeVisible();
    await page.getByRole("link", { name: "Type this yourself" }).click();
    await expect(page.getByTestId("beat-run-header")).toBeVisible();

    await typeCurrentCharacter(page);

    await expectTypingFocus(page, page.getByTestId("beat-run-header"));
  });
});
