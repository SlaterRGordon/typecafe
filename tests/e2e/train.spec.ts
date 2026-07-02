import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { typeCurrentCharacter, typeVisibleTestText, typeWrongCharacter } from "./helpers/typing";

// /train lands on the tier level map (the hub); the Continue CTA zooms into the
// resume level (the leaf), where the typing test lives.
async function gotoTrainMap(page: Page) {
  await page.goto("/train");
  await expect(page.getByTestId("train-continue")).toBeVisible({ timeout: 20_000 });
}

async function gotoTrain(page: Page) {
  await gotoTrainMap(page);
  await page.getByTestId("train-continue").click();
  await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("train page", () => {
  test("lands on the level map with progress totals and a continue CTA", async ({ page }) => {
    await gotoTrainMap(page);

    await expect(page.getByText("Sign in to save level progress")).toBeVisible();
    await expect(page.getByText("Easy tier")).toBeVisible();
    await expect(page.getByText("0 of 100 levels")).toBeVisible();
    await expect(page.getByTestId("train-continue")).toContainText("Continue Level 1");

    // Level 1 is unlocked; later levels show locked cells.
    const grid = page.getByTestId("train-map-grid");
    await expect(grid.getByRole("button", { name: "Level 1", exact: true })).toBeEnabled();
    await expect(grid.getByRole("button", { name: "Level 2 (locked)" })).toBeDisabled();
  });

  test("renders the guest training state, rail caption, and target keyboard", async ({ page }) => {
    await gotoTrain(page);

    await expect(page.getByText("Sign in to save level progress")).toBeVisible();
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    // The caption carries the level, its kind, and only the next milestone.
    const caption = page.getByTestId("train-rail-caption");
    await expect(caption).toContainText("Level 1");
    await expect(caption).toContainText("next star at 22 net wpm");
    const kind = page.getByTestId("train-level-kind");
    await expect(kind).toContainText("Keys");
    await expect(page.getByLabel(/How Keys levels work/)).toBeVisible();

    // Tier tabs replace the difficulty dropdown; clicking the active tier zooms
    // back out to the map.
    await expect(page.getByTestId("train-tiers").getByRole("button", { name: "easy" })).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("train-tiers").getByRole("button", { name: "easy" }).click();
    await expect(page.getByTestId("train-map")).toBeVisible();
  });

  test("uses local progress to select the next unlocked level", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "typecafe.trainProgress.easy",
        JSON.stringify([{ options: "Level 1", speed: 120, accuracy: 10 }]),
      );
    });

    await gotoTrain(page);

    await expect(page.getByText("Level 2").first()).toBeVisible();
  });

  test("shows earned stars on the level map", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "typecafe.trainProgress.easy",
        JSON.stringify([{ options: "Level 1", speed: 120, accuracy: 100, stars: 3 }]),
      );
    });

    await gotoTrainMap(page);

    await expect(page.getByText("1 of 100 levels")).toBeVisible();
    await expect(page.getByText("of 300 stars")).toBeVisible();
    const levelOneCell = page.getByTestId("train-map-grid").getByRole("button", { name: "Level 1", exact: true });
    await expect(levelOneCell.getByLabel("3 of 3 stars")).toBeVisible();

    // A cleared cell is clickable and zooms into that level.
    await levelOneCell.click();
    await expect(page.getByTestId("train-rail-caption")).toContainText("Level 1");
  });

  test("completion saves guest progress on this device", async ({ page }) => {
    await gotoTrain(page);

    await typeVisibleTestText(page);

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 1 clear!");
    await expect(popover).toContainText("Best result saved.");
    await expect(popover.getByTestId("train-net-result")).toContainText("Passed 22 net WPM");
    await expect(popover.getByTestId("train-net-result")).toHaveClass(/border-success/);
    await expect(popover.getByTestId("train-accuracy-result")).toContainText("Accuracy");
    await expect(popover.getByTestId("train-accuracy-result")).toContainText("Included in net WPM");
    await expect(popover.getByTestId("train-accuracy-result")).not.toHaveClass(/border-success/);
    await expect(popover.getByTestId("train-accuracy-result")).not.toHaveClass(/border-error/);
    await expect(popover.getByRole("button", { name: "Next level" })).toBeVisible();

    const progress = await page.evaluate(() => window.localStorage.getItem("typecafe.trainProgress.easy"));
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
    await gotoTrain(page);

    await typeCurrentCharacter(page);
    const remaining = await page.locator("#words .char").count();
    for (let index = 1; index < remaining; index += 1) {
      await page.keyboard.press("q");
    }

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 1 not cleared yet");
    await expect(popover).toContainText("Need 22 net WPM to clear — you hit 0.");
    await expect(popover.getByTestId("train-net-result")).toContainText("Need 22 net WPM");
    await expect(popover.getByTestId("train-net-result")).toHaveClass(/border-error/);
    await expect(popover.getByTestId("train-accuracy-result")).toContainText("Accuracy");
    await expect(popover.getByTestId("train-accuracy-result")).toContainText("Included in net WPM");
    await expect(popover.getByTestId("train-accuracy-result")).not.toHaveClass(/border-success/);
    await expect(popover.getByTestId("train-accuracy-result")).not.toHaveClass(/border-error/);
    await expect(popover.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(popover.getByRole("button", { name: "Pick a level" })).toHaveCount(0);
    await expect(popover.getByRole("button", { name: "Next level" })).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("typecafe.trainProgress.easy"))).toBeNull();
  });

  test("tab+space on the clear popover advances to the next level", async ({ page }) => {
    await gotoTrain(page);

    await typeVisibleTestText(page);

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible();

    // The chord drives Next level rather than restarting Level 1 underneath.
    await page.keyboard.down("Tab");
    await page.keyboard.press(" ");
    await page.keyboard.up("Tab");

    await expect(popover).toBeHidden();
    await expect(page.getByText("Level 2").first()).toBeVisible();
  });

  test("tab+enter on the fail popover retries the level", async ({ page }) => {
    await gotoTrain(page);

    await typeCurrentCharacter(page);
    const remaining = await page.locator("#words .char").count();
    for (let index = 1; index < remaining; index += 1) {
      await page.keyboard.press("q");
    }

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible();

    // No next level on a fail — the chord takes the Try again path.
    await page.keyboard.down("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Tab");

    await expect(popover).toBeHidden();
    await expect(page.getByTestId("train-rail-caption")).toContainText("Level 1");
    await expect(page.locator("#words .char").first()).toBeVisible();
  });

  test("signed-in completion unlocks the next level", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoTrain(page);

    await typeVisibleTestText(page);

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(popover.getByRole("button", { name: "Next level" })).toBeVisible();
    await expect(popover.getByRole("button", { name: "Pick a level" })).toHaveCount(0);

    await popover.getByRole("button", { name: "Next level" }).click();
    await expect(page.getByText("Level 2").first()).toBeVisible();
  });

  test("difficulty changes update requirements", async ({ page }) => {
    await gotoTrainMap(page);

    // Tier tabs switch the whole ladder; Medium's Level 1 asks 29 net WPM.
    await page.getByTestId("train-tiers").getByRole("button", { name: "medium" }).click();
    await expect(page.getByText("Medium tier")).toBeVisible();
    await page.getByTestId("train-continue").click();
    await expect(page.getByTestId("train-rail-caption")).toContainText("next star at 29 net wpm");
  });

  test("boss level: the pacer overtaking the cursor ends the run as a fail", async ({ page }) => {
    // Clear Levels 1–9 so the first boss (Level 10) is unlocked and auto-resumed.
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 9 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });

    await gotoTrain(page);
    await expect(page.getByText("Level 10").first()).toBeVisible();
    // Boss levels carry a "Boss" type chip in the controls.
    await expect(page.getByTestId("train-level-kind")).toContainText("Boss");

    // Type one character to start the attempt, then stop — the pacer catches up.
    await typeCurrentCharacter(page);

    const popover = page.getByTestId("train-complete-popover");
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
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });

    await gotoTrain(page);
    await expect(page.getByText("Level 10").first()).toBeVisible();

    // Sprint a handful of characters (banking a high net WPM over that span), then
    // stop and let the pacer catch up. The run must still grade as a loss.
    const chars = await page.locator("#words .char").allTextContents();
    for (const c of chars.slice(0, 10)) {
      await page.keyboard.press(c === " " ? "Space" : c);
    }

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible({ timeout: 15_000 });
    await expect(popover).toContainText("not cleared yet");
    await expect(popover.getByRole("button", { name: "Next level" })).toHaveCount(0);
  });

  test("boss level: outrunning the pacer clears it", async ({ page }) => {
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 9 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });

    await gotoTrain(page);
    await expect(page.getByText("Level 10").first()).toBeVisible();

    await typeVisibleTestText(page);

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 10 clear!");
  });

  test("speed-round level runs as a timed test on the level's keys", async ({ page }) => {
    // Clear Levels 1–3 so Level 4 (a speed round) is unlocked and auto-resumed.
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 3 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });

    await gotoTrain(page);
    await expect(page.getByText("Level 4").first()).toBeVisible();

    // Speed rounds are timed — a countdown is shown and the chip reads "Timed".
    await expect(page.getByTestId("timed-countdown")).toBeVisible();
    await expect(page.getByTestId("train-level-kind")).toContainText("Timed");

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
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });

    await gotoTrain(page);
    await expect(page.getByText("Level 7").first()).toBeVisible();
    // No-miss levels carry a "No miss" type chip in the controls.
    await expect(page.getByTestId("train-level-kind")).toContainText("No miss");

    await typeCurrentCharacter(page, 0); // correct — starts the run
    await typeWrongCharacter(page, 1);   // one miss ends it

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("not cleared yet");
    await expect(popover).toContainText("One miss");
    await expect(popover.getByTestId("train-accuracy-result")).toContainText("Need 100%");
  });

  test("no-miss level: a perfect run clears it", async ({ page }) => {
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 6 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });

    await gotoTrain(page);
    await expect(page.getByText("Level 7").first()).toBeVisible();

    await typeVisibleTestText(page);

    const popover = page.getByTestId("train-complete-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Level 7 clear!");
    await expect(popover.getByTestId("train-accuracy-result")).toContainText("Passed 100%");
  });

  test("signed-in users can import device progress when account progress exists", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      savedTrainProgress: [{ options: "Level 1", speed: 45, accuracy: 95 }],
      importedTrainProgress: [
        { options: "Level 1", speed: 45, accuracy: 95 },
        { options: "Level 2", speed: 50, accuracy: 98 },
      ],
    });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "typecafe.trainProgress.easy",
        JSON.stringify([{ options: "Level 2", speed: 50, accuracy: 98 }]),
      );
    });

    await gotoTrain(page);
    await expect(page.getByText("Device progress is available for this difficulty.")).toBeVisible();

    await page.getByRole("button", { name: "Import progress" }).click();

    await expect(page.getByText("Device progress imported to your account.")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("typecafe.trainProgress.easy"))).toBeNull();
  });
});
