import { expect, test } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

async function installClipboardMock(page: Parameters<typeof mockTrpc>[0]) {
  await page.addInitScript(() => {
    class MockClipboardItem {
      readonly items: Record<string, Blob>;
      readonly types: string[];

      constructor(items: Record<string, Blob>) {
        this.items = items;
        this.types = Object.keys(items);
      }
    }

    Object.defineProperty(window, "ClipboardItem", {
      configurable: true,
      value: MockClipboardItem,
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          window.localStorage.setItem("clipboard:text", text);
          return Promise.resolve();
        },
        write: async (items: MockClipboardItem[]) => {
          window.localStorage.setItem("clipboard:item-count", items.length.toString());
          window.localStorage.setItem("clipboard:item-types", items.flatMap((item) => item.types).join(","));
          const imageBlob = items[0]?.items["image/png"];
          if (imageBlob) {
            const bitmap = await createImageBitmap(imageBlob);
            window.localStorage.setItem("clipboard:image-width", bitmap.width.toString());
            window.localStorage.setItem("clipboard:image-height", bitmap.height.toString());
            bitmap.close();
          }
        },
      },
    });
  });
}

async function finishActiveTypingTest(page: Parameters<typeof mockTrpc>[0]) {
  await page.locator("#text").click();

  for (let index = 0; index < 300; index += 1) {
    const active = await page.evaluate(() => {
      if (document.body.textContent?.includes("Test Complete!")) return "complete";

      const words = document.querySelector("#words");
      if (!words) return null;

      const activeChars = Array.from(words.querySelectorAll(".active-char"));
      const current = activeChars.at(-1);
      return current ? { id: current.id, char: current.textContent } : null;
    });
    if (active === "complete") return;
    if (!active || active.char === null) return;

    await page.locator("#text").click();
    if (active.char === " ") {
      await page.keyboard.press("Space");
    } else {
      await page.keyboard.press(active.char);
    }

    await page.waitForFunction((previousId) => {
      if (document.body.textContent?.includes("Test Complete!")) return true;
      const activeChars = Array.from(document.querySelectorAll("#words .active-char"));
      return activeChars.at(-1)?.id !== previousId;
    }, active.id, { timeout: 2000 });

    if (await page.getByText("Test Complete!").isVisible()) return;
  }

  throw new Error("Typing test did not complete within the expected character limit.");
}

async function completeWordTest(page: Parameters<typeof mockTrpc>[0]) {
  await page.goto("/");
  await expect(page.locator("#words .char").first()).toBeVisible();

  await page.getByLabel("Open typing settings").click();
  await page.getByRole("button", { name: "Words" }).click();
  await page.locator("#configModal").evaluate((input) => {
    const checkbox = input as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await finishActiveTypingTest(page);
  await expect(page.getByText("Test Complete!")).toBeVisible();
}

test.describe("shared scores", () => {
  test("renders a shared score in a read-only view", async ({ page }) => {
    await mockTrpc(page);

    await page.goto("/score/share-test-score");

    await expect(page.getByText("Test Complete!")).toBeVisible();
    expect(await page.getByText("72.4").count()).toBeGreaterThan(0);
    expect(await page.getByText("96.50%").count()).toBeGreaterThan(0);
    await expect(page.getByText("WPM Over Time")).toBeVisible();
    await expect(page.getByText("Performance Details")).toBeVisible();
    await expect(page.getByText("Your Typed Text")).toBeVisible();
    await expect(page.getByRole("button", { name: "Share Score" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try TypeCafe" })).toBeVisible();
  });

  test("shares a completed saved score and copies the generated link", async ({ page }) => {
    const procedures: string[] = [];

    await installClipboardMock(page);
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      onProcedure: (procedure) => procedures.push(procedure),
    });

    await completeWordTest(page);

    await expect(page.getByText("WPM Over Time")).toBeVisible();
    await expect(page.getByText("Performance Details")).toBeVisible();
    await expect(page.getByText("Your Typed Text")).toBeVisible();
    await expect(page.locator("#words")).toBeHidden();
    await page.getByRole("button", { name: "Share Score" }).click({ force: true });

    await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:text"))).toBe("http://127.0.0.1:3000/score/share-test-score");
    expect(procedures).toContain("test.create");
    expect(procedures).toContain("scoreShare.create");
  });

  test("restarts from the completion dashboard with button and key combos", async ({ page }) => {
    // Completes three full word tests; allow extra time when many workers saturate
    // the dev server in parallel local runs (CI runs single-worker).
    test.slow();
    await mockAuthenticatedSession(page);
    await mockTrpc(page);

    await completeWordTest(page);
    await expect(page.locator("#words")).toBeHidden();
    await page.getByRole("button", { name: "Test Again" }).click({ force: true });
    await expect(page.getByText("Test Complete!")).toBeHidden();
    await expect(page.locator("#words")).toBeVisible();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);

    await completeWordTest(page);
    await expect(page.locator("#words")).toBeHidden();
    await page.keyboard.down("Tab");
    await page.keyboard.press("Space");
    await page.keyboard.up("Tab");
    await expect(page.getByText("Test Complete!")).toBeHidden();
    await expect(page.locator("#words")).toBeVisible();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);

    await completeWordTest(page);
    await expect(page.locator("#words")).toBeHidden();
    await page.keyboard.down("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Tab");
    await expect(page.getByText("Test Complete!")).toBeHidden();
    await expect(page.locator("#words")).toBeVisible();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
  });

  test("copies a score screenshot image to the clipboard", async ({ page }) => {
    await installClipboardMock(page);
    await mockTrpc(page);

    await page.goto("/score/share-test-score");

    await expect(page.getByText("Test Complete!")).toBeVisible();
    const scoreCard = page.getByTestId("score-screenshot-card");
    const scoreCardBox = await scoreCard.boundingBox();
    const deviceScaleFactor = await page.evaluate(() => window.devicePixelRatio || 1);
    expect(scoreCardBox).not.toBeNull();

    await page.getByRole("button", { name: "Copy Screenshot" }).click({ force: true });

    await expect(page.getByRole("button", { name: "Screenshot copied" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:item-count"))).toBe("1");
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:item-types"))).toBe("image/png");
    const imageWidth = Number(await page.evaluate(() => window.localStorage.getItem("clipboard:image-width")));
    const imageHeight = Number(await page.evaluate(() => window.localStorage.getItem("clipboard:image-height")));
    const expectedWidth = Math.round((scoreCardBox?.width ?? 0) * deviceScaleFactor);
    const expectedHeight = Math.round((scoreCardBox?.height ?? 0) * deviceScaleFactor);

    expect(Math.abs(imageWidth - expectedWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(imageHeight - expectedHeight)).toBeLessThanOrEqual(1);
  });

  test("shows an unavailable state for invalid share links", async ({ page }) => {
    await mockTrpc(page, { invalidShare: true });

    await page.goto("/score/missing-score");

    await expect(page.getByRole("heading", { name: "Score unavailable" })).toBeVisible();
    await expect(page.getByText("invalid, expired, or no longer available")).toBeVisible();
  });
});
