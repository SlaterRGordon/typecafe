import { expect, test, type Page } from "@playwright/test";
import { chooseReactSelectOption } from "./helpers/select";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { typeCurrentCharacter, typeVisibleTestText } from "./helpers/typing";

async function gotoLearn(page: Page) {
  await page.goto("/learn");
  await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("learn page", () => {
  test("renders the guest learning state and target keyboard", async ({ page }, testInfo) => {
    await gotoLearn(page);

    await expect(page.getByText("Sign in to save level progress")).toBeVisible();
    await expect(page.getByText("Required Speed: 40wpm")).toBeVisible();
    await expect(page.getByText("Required Accuracy: 90%")).toBeVisible();
    if (!testInfo.project.name.includes("mobile")) {
      await expect(page.getByText("Target Keys:")).toBeVisible();
    }
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
  });

  test("uses local progress to select the next unlocked level", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "typecafe.learnProgress.easy",
        JSON.stringify([{ options: "Level 1", speed: 120, accuracy: 100 }]),
      );
    });

    await gotoLearn(page);

    await expect(page.getByText("Level 2").first()).toBeVisible();
  });

  test("completion saves guest progress on this device", async ({ page }) => {
    await gotoLearn(page);

    await typeVisibleTestText(page);

    await expect(page.getByText("Progress saved on this device. Sign in to keep it.")).toBeVisible();

    const progress = await page.evaluate(() => window.localStorage.getItem("typecafe.learnProgress.easy"));
    expect(progress).not.toBeNull();
    expect(JSON.parse(progress as string)).toEqual([
      expect.objectContaining({
        options: "Level 1",
        accuracy: 100,
      }),
    ]);
  });

  test("failed completion warns and does not save progress", async ({ page }) => {
    await gotoLearn(page);

    await typeCurrentCharacter(page);
    const remaining = await page.locator("#words .char").count();
    for (let index = 1; index < remaining; index += 1) {
      await page.keyboard.press("q");
    }

    await expect(page.getByText("Need 40 WPM and 90% accuracy to complete this level.")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("typecafe.learnProgress.easy"))).toBeNull();
  });

  test("difficulty changes update requirements", async ({ page }) => {
    await gotoLearn(page);

    await chooseReactSelectOption(page, "difficultySelect", "Medium");

    await expect(page.getByText("Required Speed: 80wpm")).toBeVisible();
    await expect(page.getByText("Required Accuracy: 90%")).toBeVisible();
  });

  test("signed-in users can import device progress when account progress exists", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      savedLearnProgress: [{ options: "Level 1", speed: 45, accuracy: 95 }],
      importedLearnProgress: [
        { options: "Level 1", speed: 45, accuracy: 95 },
        { options: "Level 2", speed: 50, accuracy: 98 },
      ],
    });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "typecafe.learnProgress.easy",
        JSON.stringify([{ options: "Level 2", speed: 50, accuracy: 98 }]),
      );
    });

    await gotoLearn(page);
    await expect(page.getByText("Device progress is available for this difficulty.")).toBeVisible();

    await page.getByRole("button", { name: "Import progress" }).click();

    await expect(page.getByText("Device progress imported to your account.")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("typecafe.learnProgress.easy"))).toBeNull();
  });
});
