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
    await expect(page.getByText("Required Speed: 40 net WPM")).toBeVisible();
    await expect(page.getByText("Required Accuracy: 90%")).toBeVisible();
    await expect(page.getByText("1 star: 40 net WPM / 90%")).toBeVisible();
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

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 1 clear!");
    await expect(popover).toContainText("Best result saved.");
    await expect(popover.getByTestId("learn-net-result")).toContainText("Passed 40 net WPM");
    await expect(popover.getByTestId("learn-net-result")).toHaveClass(/border-success/);
    await expect(popover.getByTestId("learn-accuracy-result")).toContainText("Passed 90% accuracy");
    await expect(popover.getByTestId("learn-accuracy-result")).toHaveClass(/border-success/);
    await expect(popover.getByRole("button", { name: "Next level" })).toBeVisible();

    const progress = await page.evaluate(() => window.localStorage.getItem("typecafe.learnProgress.easy"));
    expect(progress).not.toBeNull();
    const parsed = JSON.parse(progress as string) as { options: string; speed: number; accuracy: number; stars: number }[];
    expect(parsed).toEqual([
      expect.objectContaining({
        options: "Level 1",
        accuracy: 100,
        stars: 3,
      }),
    ]);
    expect(parsed[0]?.speed).toBeGreaterThanOrEqual(40);

    await popover.getByRole("button", { name: "Next level" }).click();
    await expect(page.getByText("Level 2").first()).toBeVisible();
  });

  test("failed completion opens retry popover and does not save progress", async ({ page }) => {
    await gotoLearn(page);

    await typeCurrentCharacter(page);
    const remaining = await page.locator("#words .char").count();
    for (let index = 1; index < remaining; index += 1) {
      await page.keyboard.press("q");
    }

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 1 not cleared yet");
    await expect(popover).toContainText("Need 40 net WPM and 90% accuracy.");
    await expect(popover.getByTestId("learn-net-result")).toContainText("Need 40 net WPM");
    await expect(popover.getByTestId("learn-net-result")).toHaveClass(/border-error/);
    await expect(popover.getByTestId("learn-accuracy-result")).toContainText("Need 90% accuracy");
    await expect(popover.getByTestId("learn-accuracy-result")).toHaveClass(/border-error/);
    await expect(popover.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(popover.getByRole("button", { name: "Pick a level" })).toHaveCount(0);
    await expect(popover.getByRole("button", { name: "Next level" })).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("typecafe.learnProgress.easy"))).toBeNull();
  });

  test("signed-in completion unlocks the next level", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoLearn(page);

    await typeVisibleTestText(page);

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(popover.getByRole("button", { name: "Next level" })).toBeVisible();
    await expect(popover.getByRole("button", { name: "Pick a level" })).toHaveCount(0);

    await popover.getByRole("button", { name: "Next level" }).click();
    await expect(page.getByText("Level 2").first()).toBeVisible();
  });

  test("difficulty changes update requirements", async ({ page }) => {
    await gotoLearn(page);

    await chooseReactSelectOption(page, "difficultySelect", "Medium");

    await expect(page.getByText("Required Speed: 80 net WPM")).toBeVisible();
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
