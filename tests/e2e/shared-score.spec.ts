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
      if (document.querySelector('[data-testid="score-screenshot-card"]')) return "complete";

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
      if (document.querySelector('[data-testid="score-screenshot-card"]')) return true;
      const activeChars = Array.from(document.querySelectorAll("#words .active-char"));
      return activeChars.at(-1)?.id !== previousId;
    }, active.id, { timeout: 2000 });

    if (await page.getByTestId("score-screenshot-card").isVisible()) return;
  }

  throw new Error("Typing test did not complete within the expected character limit.");
}

async function completeWordTest(page: Parameters<typeof mockTrpc>[0]) {
  await page.goto("/");
  await expect(page.locator("#words .char").first()).toBeVisible();

  await page.getByTestId("mode-bar").getByRole("button", { name: "Words" }).click();

  await finishActiveTypingTest(page);
  await expect(page.getByTestId("score-screenshot-card")).toBeVisible();
}

test.describe("shared scores", () => {
  test("renders a shared score in a read-only view", async ({ page }) => {
    await mockTrpc(page);

    await page.goto("/score/share-test-score");

    await expect(page.getByTestId("score-screenshot-card")).toBeVisible();
    await expect(page.getByTestId("beat-run-cta")).toBeVisible();
    await expect(page.getByRole("link", { name: "Type this yourself" })).toHaveAttribute("href", "/score/share-test-score?type=1");
    expect(await page.getByText("72.4").count()).toBeGreaterThan(0);
    expect(await page.getByText("96.50%").count()).toBeGreaterThan(0);
    await expect(page.getByText("WPM Over Time")).toBeVisible();
    await expect(page.getByText("Performance Details")).toBeVisible();
    await expect(page.getByText("Your Typed Text")).toBeVisible();
    await expect(page.getByRole("link", { name: /Raw words per minute/ }).first()).toHaveAttribute("href", "/how-we-measure");
    await expect(page.getByRole("button", { name: "Share Score" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try TypeCafe" })).toBeVisible();
  });

  test("supports guest-to-guest beat-my-run links", async ({ page }) => {
    const procedures: { procedure: string; input: Record<string, unknown> | undefined }[] = [];

    await installClipboardMock(page);
    await mockTrpc(page, {
      onProcedure: (procedure, input) => procedures.push({ procedure, input }),
    });

    await page.goto("/score/beat-source-score");
    await expect(page.getByTestId("beat-run-cta")).toBeVisible();
    await page.getByRole("link", { name: "Type this yourself" }).click();

    await expect(page.getByTestId("beat-run-header")).toBeVisible();
    await expect(page.locator("#words")).toContainText("steady hands");

    await finishActiveTypingTest(page);

    await expect(page.getByTestId("beat-run-comparison")).toBeVisible();
    await expect(page.getByTestId("beat-attempt")).toContainText("First attempt");
    await expect(page.getByTestId("beat-wpm-delta")).toContainText("WPM");
    await expect(page.getByTestId("beat-divergence")).toContainText(/Clean run|First divergence/);
    await expect(page.getByTestId("beat-heatmap-comparison")).toBeVisible();

    await page.getByRole("button", { name: "Share Score" }).click({ force: true });
    await page.getByTestId("share-menu").getByRole("menuitem", { name: "Copy link" }).click();

    await expect(page.getByTestId("share-menu").getByRole("menuitem", { name: "Link copied" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:text"))).toBe("http://127.0.0.1:3000/score/beat-run-share");

    const createBeatRun = procedures.find(({ procedure }) => procedure === "scoreShare.createBeatRun");
    expect(createBeatRun?.input?.snapshot).toMatchObject({
      promptText: "steady hands",
      sourceShareSlug: "beat-source-score",
      attemptNumber: 1,
    });

    await page.goto("/score/beat-run-share");
    await expect(page.getByTestId("score-screenshot-card")).toBeVisible();
    await expect(page.getByTestId("beat-run-cta")).toBeVisible();
    await expect(page.getByTestId("score-screenshot-card").getByText("Beat by +23.3 WPM")).toBeVisible();
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
    // The server-computed brag line is surfaced on the results dashboard.
    await expect(page.getByTestId("score-screenshot-card").getByText("Faster than 72% of similar starters")).toBeVisible();
    await expect(page.locator("#words")).toBeHidden();
    await page.getByRole("button", { name: "Share Score" }).click({ force: true });
    await page.getByTestId("share-menu").getByRole("menuitem", { name: "Copy link" }).click();

    await expect(page.getByTestId("share-menu").getByRole("menuitem", { name: "Link copied" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:text"))).toBe("http://127.0.0.1:3000/score/share-test-score");
    expect(procedures).toContain("test.create");
    expect(procedures).toContain("scoreShare.create");
  });

  test("lets a guest share a completed score without signing in", async ({ page }) => {
    const procedures: string[] = [];

    await installClipboardMock(page);
    // No mockAuthenticatedSession: this is a signed-out guest.
    await mockTrpc(page, {
      onProcedure: (procedure) => procedures.push(procedure),
    });

    await completeWordTest(page);

    // The guest sees a real Share button, not a "Sign in to save & share" wall.
    await expect(page.getByRole("button", { name: "Sign in to save & share" })).toHaveCount(0);
    await page.getByRole("button", { name: "Share Score" }).click({ force: true });
    await page.getByTestId("share-menu").getByRole("menuitem", { name: "Copy link" }).click();

    await expect(page.getByTestId("share-menu").getByRole("menuitem", { name: "Link copied" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:text"))).toBe("http://127.0.0.1:3000/score/guest-score-share");
    // Guests take the snapshot-only mint, never the account-linked create.
    expect(procedures).toContain("scoreShare.createGuestScore");
    expect(procedures).not.toContain("scoreShare.create");
  });

  test("offers pre-filled X and Reddit share targets on a shared score", async ({ page }) => {
    await mockTrpc(page);

    await page.goto("/score/share-test-score");
    await expect(page.getByTestId("score-screenshot-card")).toBeVisible();

    // On a shared page the URL already exists, so opening the menu shows the X and
    // Reddit targets as live anchors immediately (no minting round-trip).
    await page.getByRole("button", { name: "Share Score" }).click({ force: true });
    const menu = page.getByTestId("share-menu");
    await expect(menu).toBeVisible();

    const x = menu.getByRole("menuitem", { name: "Share on X" });
    await expect(x).toHaveAttribute("href", /twitter\.com\/intent\/tweet/);
    // The share URL is carried through as the `url` param.
    await expect(x).toHaveAttribute("href", /score%2Fshare-test-score/);
    // Delta-forward text: "(+4.1 vs my 30-day average)" → the + encodes to %2B.
    await expect(x).toHaveAttribute("href", /%2B4\.1/);

    const reddit = menu.getByRole("menuitem", { name: "Share on Reddit" });
    await expect(reddit).toHaveAttribute("href", /reddit\.com\/submit/);
    await expect(reddit).toHaveAttribute("href", /score%2Fshare-test-score/);
  });

  test("renders a test-less guest score share read-only", async ({ page }) => {
    await mockTrpc(page);

    await page.goto("/score/guest-score-share");

    await expect(page.getByTestId("score-screenshot-card")).toBeVisible();
    await expect(page.getByText("WPM Over Time")).toBeVisible();
    await expect(page.getByText("Performance Details")).toBeVisible();
    await expect(page.getByRole("link", { name: "Try TypeCafe" })).toBeVisible();
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
    await expect(page.getByTestId("score-screenshot-card")).toBeHidden();
    await expect(page.locator("#words")).toBeVisible();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);

    await completeWordTest(page);
    await expect(page.locator("#words")).toBeHidden();
    await page.keyboard.down("Tab");
    await page.keyboard.press("Space");
    await page.keyboard.up("Tab");
    await expect(page.getByTestId("score-screenshot-card")).toBeHidden();
    await expect(page.locator("#words")).toBeVisible();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);

    await completeWordTest(page);
    await expect(page.locator("#words")).toBeHidden();
    await page.keyboard.down("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Tab");
    await expect(page.getByTestId("score-screenshot-card")).toBeHidden();
    await expect(page.locator("#words")).toBeVisible();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
  });

  test("copies the dedicated 1200x630 share card to the clipboard", async ({ page }) => {
    await installClipboardMock(page);
    await mockTrpc(page);

    await page.goto("/score/share-test-score");

    await expect(page.getByTestId("score-screenshot-card")).toBeVisible();
    // The screenshot target is the off-screen, fixed-size social card, not the
    // full results dashboard.
    const deviceScaleFactor = await page.evaluate(() => window.devicePixelRatio || 1);

    await page.getByRole("button", { name: "Share Score" }).click({ force: true });
    await page.getByTestId("share-menu-screenshot").click();

    await expect(page.getByTestId("share-menu-screenshot")).toContainText("Screenshot copied");
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:item-count"))).toBe("1");
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:item-types"))).toBe("image/png");
    const imageWidth = Number(await page.evaluate(() => window.localStorage.getItem("clipboard:image-width")));
    const imageHeight = Number(await page.evaluate(() => window.localStorage.getItem("clipboard:image-height")));

    expect(Math.abs(imageWidth - Math.round(1200 * deviceScaleFactor))).toBeLessThanOrEqual(1);
    expect(Math.abs(imageHeight - Math.round(630 * deviceScaleFactor))).toBeLessThanOrEqual(1);
  });

  test("downloads the share card when clipboard images are unsupported", async ({ page }) => {
    // Simulate a browser (common on mobile) that cannot write images to the clipboard.
    await page.addInitScript(() => {
      Object.defineProperty(window, "ClipboardItem", { configurable: true, value: undefined });
    });
    await mockTrpc(page);

    await page.goto("/score/share-test-score");
    await expect(page.getByTestId("score-screenshot-card")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Share Score" }).click({ force: true });
    await page.getByTestId("share-menu-screenshot").click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("typecafe-score.png");
    await expect(page.getByTestId("share-menu-screenshot")).toContainText("Image downloaded");
  });

  test("exposes an OG image and per-score meta tags for unfurls", async ({ page }) => {
    await mockTrpc(page);

    // The score page server-renders OG/Twitter meta pointing at the image endpoint.
    const response = await page.goto("/score/share-test-score");
    const html = (await response?.text()) ?? "";
    expect(html).toContain('property="og:image"');
    expect(html).toContain("/api/og/score/share-test-score");
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    // Social card, not a search landing page: crawlable for unfurls, out of the
    // index (growth-seo §C).
    expect(html).toContain('name="robots" content="noindex,follow"');

    // The image endpoint renders a PNG (falls back to a brand card without a DB).
    const image = await page.request.get("/api/og/score/share-test-score");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
    const bytes = await image.body();
    // PNG magic number.
    expect([...bytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
  });

  test("shows an unavailable state for invalid share links", async ({ page }) => {
    await mockTrpc(page, { invalidShare: true });

    await page.goto("/score/missing-score");

    await expect(page.getByRole("heading", { name: "Score unavailable" })).toBeVisible();
    await expect(page.getByText("invalid, expired, or no longer available")).toBeVisible();
  });
});
