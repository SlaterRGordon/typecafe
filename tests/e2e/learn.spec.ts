import { expect, test, type Page } from "@playwright/test";
import { chooseReactSelectOption } from "./helpers/select";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { typeCurrentCharacter, typeVisibleTestText, typeWrongCharacter } from "./helpers/typing";

async function gotoLearn(page: Page) {
  await page.goto("/learn");
  await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });
}

async function openReactSelect(page: Page, instanceId: string) {
  const input = page.locator(`#react-select-${instanceId}-input`);
  const control = input.locator("xpath=ancestor::*[contains(@class, 'my-react-select__control')][1]");
  await control.click();
}

test.describe("learn page", () => {
  test("renders the guest learning state and target keyboard", async ({ page }, testInfo) => {
    await gotoLearn(page);

    await expect(page.getByText("Sign in to save level progress")).toBeVisible();
    await expect(page.getByText("Required Accuracy: 90%")).toHaveCount(0);
    await expect(page.getByLabel("1 star: 22 net WPM")).toBeVisible();
    await expect(page.getByText("1 star:", { exact: false })).toHaveCount(0);
    if (!testInfo.project.name.includes("mobile")) {
      await expect(page.getByText("Target Keys:")).toBeVisible();
    }
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    // Level 1 is a plain key level — the type chip and its "?" explainer show.
    const kind = page.getByTestId("learn-level-kind");
    await expect(kind).toContainText("Keys");
    await expect(kind.getByRole("img")).toHaveAttribute("aria-label", /How Keys levels work/);
  });

  test("uses local progress to select the next unlocked level", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "typecafe.learnProgress.easy",
        JSON.stringify([{ options: "Level 1", speed: 120, accuracy: 10 }]),
      );
    });

    await gotoLearn(page);

    await expect(page.getByText("Level 2").first()).toBeVisible();
  });

  test("shows best stars in the level menu", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "typecafe.learnProgress.easy",
        JSON.stringify([{ options: "Level 1", speed: 120, accuracy: 100, stars: 3 }]),
      );
    });

    await gotoLearn(page);
    await expect(page.getByText("Level 2").first()).toBeVisible();

    await openReactSelect(page, "levelSelect");
    const levelOne = page.getByRole("option", { name: /^Level 1\b/ });
    await expect(levelOne).toBeVisible();
    await expect(page.getByLabel("Best 3 stars").first()).toBeVisible();
  });

  test("completion saves guest progress on this device", async ({ page }) => {
    await gotoLearn(page);

    await typeVisibleTestText(page);

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 1 clear!");
    await expect(popover).toContainText("Best result saved.");
    await expect(popover.getByTestId("learn-net-result")).toContainText("Passed 22 net WPM");
    await expect(popover.getByTestId("learn-net-result")).toHaveClass(/border-success/);
    await expect(popover.getByTestId("learn-accuracy-result")).toContainText("Accuracy");
    await expect(popover.getByTestId("learn-accuracy-result")).toContainText("Included in net WPM");
    await expect(popover.getByTestId("learn-accuracy-result")).not.toHaveClass(/border-success/);
    await expect(popover.getByTestId("learn-accuracy-result")).not.toHaveClass(/border-error/);
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
    expect(parsed[0]?.speed).toBeGreaterThanOrEqual(28);

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
    await expect(popover).toContainText("Need 22 net WPM to clear — you hit 0.");
    await expect(popover.getByTestId("learn-net-result")).toContainText("Need 22 net WPM");
    await expect(popover.getByTestId("learn-net-result")).toHaveClass(/border-error/);
    await expect(popover.getByTestId("learn-accuracy-result")).toContainText("Accuracy");
    await expect(popover.getByTestId("learn-accuracy-result")).toContainText("Included in net WPM");
    await expect(popover.getByTestId("learn-accuracy-result")).not.toHaveClass(/border-success/);
    await expect(popover.getByTestId("learn-accuracy-result")).not.toHaveClass(/border-error/);
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

    await expect(page.getByLabel("1 star: 29 net WPM")).toBeVisible();
    await expect(page.getByText("Required Accuracy: 90%")).toHaveCount(0);
  });

  test("boss level: the pacer overtaking the cursor ends the run as a fail", async ({ page }) => {
    // Clear Levels 1–9 so the first boss (Level 10) is unlocked and auto-resumed.
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 9 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.learnProgress.easy", JSON.stringify(cleared));
    });

    await gotoLearn(page);
    await expect(page.getByText("Level 10").first()).toBeVisible();
    // Boss levels carry a "Boss" type chip in the controls.
    await expect(page.getByTestId("learn-level-kind")).toContainText("Boss");

    // Type one character to start the attempt, then stop — the pacer catches up.
    await typeCurrentCharacter(page);

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover).toContainText("not cleared yet");
    // The popup spells out why: the pacer caught them.
    await expect(popover).toContainText("pacer caught you");
  });

  test("boss level: a fast burst then getting caught still fails (no WPM loophole)", async ({ page }) => {
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 9 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.learnProgress.easy", JSON.stringify(cleared));
    });

    await gotoLearn(page);
    await expect(page.getByText("Level 10").first()).toBeVisible();

    // Sprint a handful of characters (banking a high net WPM over that span), then
    // stop and let the pacer catch up. The run must still grade as a loss.
    const chars = await page.locator("#words .char").allTextContents();
    for (const c of chars.slice(0, 10)) {
      await page.keyboard.press(c === " " ? "Space" : c);
    }

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible({ timeout: 15_000 });
    await expect(popover).toContainText("not cleared yet");
    await expect(popover.getByRole("button", { name: "Next level" })).toHaveCount(0);
  });

  test("boss level: outrunning the pacer clears it", async ({ page }) => {
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 9 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.learnProgress.easy", JSON.stringify(cleared));
    });

    await gotoLearn(page);
    await expect(page.getByText("Level 10").first()).toBeVisible();

    await typeVisibleTestText(page);

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 10 clear!");
  });

  test("speed-round level runs as a timed test on the level's keys", async ({ page }) => {
    // Clear Levels 1–3 so Level 4 (a speed round) is unlocked and auto-resumed.
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 3 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.learnProgress.easy", JSON.stringify(cleared));
    });

    await gotoLearn(page);
    await expect(page.getByText("Level 4").first()).toBeVisible();

    // Speed rounds are timed — a countdown is shown and the chip reads "Timed".
    await expect(page.getByTestId("timed-countdown")).toBeVisible();
    await expect(page.getByTestId("learn-level-kind")).toContainText("Timed");

    // ...and the drill stays on Level 4's keys (home row: asdfjkl).
    const chars = await page.locator("#words .char").allTextContents();
    expect(chars.length).toBeGreaterThan(0);
    const allowed = new Set("asdfjkl ".split(""));
    for (const c of chars) {
      expect(allowed.has(c)).toBe(true);
    }
  });

  test("no-miss level: the first mistake ends the run as a fail", async ({ page }) => {
    // Clear Levels 1–6 so Level 7 (a no-miss round) is unlocked and auto-resumed.
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 6 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.learnProgress.easy", JSON.stringify(cleared));
    });

    await gotoLearn(page);
    await expect(page.getByText("Level 7").first()).toBeVisible();
    // No-miss levels carry a "No miss" type chip in the controls.
    await expect(page.getByTestId("learn-level-kind")).toContainText("No miss");

    await typeCurrentCharacter(page, 0); // correct — starts the run
    await typeWrongCharacter(page, 1);   // one miss ends it

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("not cleared yet");
    await expect(popover).toContainText("One miss");
    await expect(popover.getByTestId("learn-accuracy-result")).toContainText("Need 100%");
  });

  test("no-miss level: a perfect run clears it", async ({ page }) => {
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 6 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.learnProgress.easy", JSON.stringify(cleared));
    });

    await gotoLearn(page);
    await expect(page.getByText("Level 7").first()).toBeVisible();

    await typeVisibleTestText(page);

    const popover = page.getByTestId("learn-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 7 clear!");
    await expect(popover.getByTestId("learn-accuracy-result")).toContainText("Passed 100%");
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
