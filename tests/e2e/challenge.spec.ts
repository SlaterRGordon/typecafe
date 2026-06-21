import { expect, test } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

async function installTextClipboardMock(page: Parameters<typeof mockTrpc>[0]) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          window.localStorage.setItem("clipboard:text", text);
          return Promise.resolve();
        },
      },
    });
  });
}

async function startChallengeTimer(page: Parameters<typeof mockTrpc>[0]) {
  await page.locator("#text").click();
  const firstChar = await page.locator("#words .active-char").last().textContent();
  if (firstChar === " ") await page.keyboard.press("Space");
  else await page.keyboard.press(firstChar ?? "a");
}

test.describe("daily challenge", () => {
  test("home surfaces local daily challenge status", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-06-16T12:00:00.000Z") });
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:challengeHistory", JSON.stringify([
        { dateKey: "2026-06-15", wpm: 70.1, accuracy: 97, t: Date.parse("2026-06-15T12:00:00.000Z") },
        { dateKey: "2026-06-16", wpm: 74.2, accuracy: 98, t: Date.parse("2026-06-16T12:00:00.000Z") },
      ]));
    });

    await page.goto("/");

    await expect(page.getByTestId("daily-challenge-prompt")).toBeVisible();
    await expect(page.getByText("Today complete: 74.2 WPM")).toBeVisible();
    await expect(page.getByText("Yesterday: 70.1 WPM")).toBeVisible();
    await expect(page.getByTestId("challenge-streak")).toContainText("2-day streak");
    await expect(page.getByRole("link", { name: "View boards" })).toHaveAttribute("href", "/challenge");
  });

  test("renders today's seeded challenge text", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/challenge");

    await expect(page.getByTestId("challenge-header")).toBeVisible();
    await expect(page.getByText(/everyone types the same text today/)).toBeVisible();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await expect(page.getByTestId("daily-challenge-boards")).toBeVisible();
    await expect(page.getByText("Fastest Today")).toBeVisible();
    await expect(page.getByText("Most Improved")).toBeVisible();
    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.getByText("slowgain")).toBeVisible();
    await expect(page.getByText("+6.0")).toBeVisible();
  });

  test("the challenge text is identical on reload (deterministic, same day)", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/challenge");
    await expect(page.locator("#words .char").first()).toBeVisible();
    const first = await page.locator("#words").innerText();

    await page.reload();
    await expect(page.locator("#words .char").first()).toBeVisible();
    const second = await page.locator("#words").innerText();

    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
  });

  test("home surfaces signed-in daily challenge status", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    // Slice 6 moved the challenge prompt off /progress; it lives on home now.
    await page.goto("/");

    await expect(page.getByTestId("daily-challenge-prompt")).toBeVisible();
    await expect(page.getByText("Today complete: 82.4 WPM")).toBeVisible();
    await expect(page.getByText("+3.2 vs avg")).toBeVisible();
    await expect(page.getByText("Yesterday: 79.1 WPM")).toBeVisible();
    await expect(page.getByTestId("challenge-streak")).toContainText("4-day streak");
  });

  test("completed challenge results lead with delta framing and can be shared", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Timed completion coverage is enough in one viewport.");
    test.slow();

    const procedures: { procedure: string; input: Record<string, unknown> | undefined }[] = [];

    await installTextClipboardMock(page);
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      onProcedure: (procedure, input) => procedures.push({ procedure, input }),
    });

    await page.goto("/challenge");
    await expect(page.locator("#words .char").first()).toBeVisible();

    await startChallengeTimer(page);

    await expect(page.getByTestId("score-screenshot-card")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("score-screenshot-card").getByText("+3.2 over my average")).toBeVisible();
    await expect(page.getByTestId("avg-delta")).toContainText("3.2 WPM over your 30-day average");

    await page.getByRole("button", { name: "Share Score" }).click({ force: true });

    await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("clipboard:text"))).toBe("http://127.0.0.1:3000/score/share-test-score");
    expect(procedures.map(({ procedure }) => procedure)).toContain("test.create");
    expect(procedures.map(({ procedure }) => procedure)).toContain("scoreShare.create");

    const shareCall = procedures.find(({ procedure }) => procedure === "scoreShare.create");
    expect(shareCall?.input?.snapshot).toMatchObject({
      brag: "+3.2 over my average",
      avgDelta: 3.2,
    });
  });
});
