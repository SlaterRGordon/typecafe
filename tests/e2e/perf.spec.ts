import { expect, test, type CDPSession, type Page } from "@playwright/test";

// Phase 0 of docs/features/typing-feel.md: the measurement harness.
//
// Types synthetically at ~200 WPM under CPU throttle (a small laptop) and
// measures, in-page, what the user feels:
//   - keydown → next animation frame latency per keystroke (the cursor lag)
//   - Event Timing API keydown entries (input delay / handler time / to-paint)
//   - long animation frames (dropped-frame hitches, e.g. the text-append stall)
//
// Numbers print as a table per scenario; budgets are asserted loosely so this
// gates egregious regressions without flaking. Baselines are recorded in the
// feature doc. Runs against the dev server like the rest of the suite, so
// absolute numbers are pessimistic (React dev mode) — treat them as relative.

declare global {
  interface Window {
    __perf: {
      keyToFrame: number[],
      events: { input: number, processing: number, duration: number }[],
      loaf: number[],
    }
  }
}

const CPU_THROTTLE = 4;
const KEY_DELAY_MS = 45; // ≈200 WPM target before protocol overhead

test.skip(({ isMobile }) => isMobile, "perf baseline is desktop-only (throttled desktop ≈ small laptop)");

async function gotoHomeInstrumented(page: Page): Promise<CDPSession> {
  await page.addInitScript(() => {
    window.__perf = { keyToFrame: [], events: [], loaf: [] };
    window.addEventListener("keydown", (e) => {
      const t0 = e.timeStamp;
      requestAnimationFrame(() => {
        window.__perf.keyToFrame.push(performance.now() - t0);
      });
    }, { capture: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name !== "keydown") continue;
        const e = entry as PerformanceEventTiming;
        window.__perf.events.push({
          input: e.processingStart - e.startTime,
          processing: e.processingEnd - e.processingStart,
          duration: e.duration,
        });
      }
      // 16ms is the API's minimum threshold; faster keystrokes simply don't report.
    }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__perf.loaf.push(entry.duration);
      }).observe({ type: "long-animation-frame" });
    } catch { /* older Chromium: no LoAF, table shows n/a */ }
  });

  await page.goto("/");
  await expect(page.locator("#typer")).toBeVisible();
  await expect(page.locator("#words .char").first()).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  return cdp;
}

// The typer drops keystrokes briefly around restart; land the first character,
// then zero the counters so warmup doesn't pollute the measurement.
async function warmUpFirstKeystroke(page: Page) {
  await expect(page.locator("#c0")).toHaveClass(/active-char/);
  const first = (await page.locator("#c0").textContent()) ?? "a";
  await expect(async () => {
    await page.keyboard.press(first === " " ? "Space" : first);
    await expect(page.locator("#c0")).not.toHaveClass(/active-char/, { timeout: 500 });
  }).toPass({ timeout: 5_000 });
  await page.evaluate(() => {
    window.__perf.keyToFrame.length = 0;
    window.__perf.events.length = 0;
    window.__perf.loaf.length = 0;
  });
}

// Type the next `count` prompt characters (starting after the warmup key).
async function typePromptChars(page: Page, count: number): Promise<{ chars: number, wpm: number }> {
  const chars = await page.locator("#words .char").allTextContents();
  const toType = chars.slice(1, 1 + count).join("");
  const startedAt = Date.now();
  await page.keyboard.type(toType, { delay: KEY_DELAY_MS });
  const minutes = (Date.now() - startedAt) / 60000;
  return { chars: toType.length, wpm: Math.round((toType.length / 5) / minutes) };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

const fmt = (n: number) => Number.isNaN(n) ? "n/a" : `${n.toFixed(1)}ms`;

// Budgets are regression tripwires, not targets: set ~2× the 2026-07-03
// baseline (recorded in docs/features/typing-feel.md) so a reintroduced
// per-keystroke render storm fails loudly without flaking on run-to-run noise.
// Tighten after each optimization phase lands.
async function collectAndReport(
  page: Page,
  scenario: string,
  typed: { chars: number, wpm: number },
  budget: { p95: number, hitches: number },
) {
  const perf = await page.evaluate(() => window.__perf);
  const k = perf.keyToFrame;
  const worst = [...k].map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 5);
  const hitches = perf.loaf.filter((d) => d > 50);
  const p95 = percentile(k, 95);

  console.log([
    ``,
    `── perf baseline: ${scenario} (cpu ×${CPU_THROTTLE}, ${typed.chars} chars @ ~${typed.wpm} wpm) ──`,
    `key→frame  p50 ${fmt(percentile(k, 50))} · p95 ${fmt(p95)} · max ${fmt(percentile(k, 100))} (n=${k.length})`,
    `worst keys ${worst.map((w) => `#${w.i}:${w.v.toFixed(0)}ms`).join("  ")}`,
    `event-timing (≥16ms only, n=${perf.events.length}): input p95 ${fmt(percentile(perf.events.map(e => e.input), 95))} · handler p95 ${fmt(percentile(perf.events.map(e => e.processing), 95))} · to-paint p95 ${fmt(percentile(perf.events.map(e => e.duration), 95))}`,
    `long frames >50ms: ${hitches.length}${hitches.length ? ` (worst: ${hitches.sort((a, b) => b - a).slice(0, 8).map((d) => d.toFixed(0) + "ms").join(", ")})` : ""}`,
    ``,
  ].join("\n"));

  expect(k.length).toBeGreaterThanOrEqual(Math.floor(typed.chars * 0.9));
  expect(p95, `key→frame p95 blew the ${budget.p95}ms budget`).toBeLessThan(budget.p95);
  expect(hitches.length, `long-frame count blew the ${budget.hitches} budget`).toBeLessThan(budget.hitches);
}

test.describe("typing perf baseline", () => {
  // Scenario 1: the default surface. 350 chars also crosses the timed-mode
  // append threshold (~300 from the buffer end), so the mid-test refill hitch
  // lands inside this window and shows up in `worst keys` / long frames.
  test("timed mode: keystroke latency under throttle", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHomeInstrumented(page);
    // A long custom duration so the timer can't expire mid-measurement.
    await page.getByTestId("toolbar-context").getByRole("button", { name: "Custom" }).click();
    const input = page.locator("#customLengthInput");
    await expect(input).toBeVisible();
    await input.fill("120");
    await input.press("Enter");
    await page.locator("#text").click();

    await warmUpFirstKeystroke(page);
    const typed = await typePromptChars(page, 350);
    await collectAndReport(page, "timed (default home)", typed, { p95: 100, hitches: 120 });
  });

  // Scenario 2: practice mode — the on-screen keyboard is visible, the page
  // re-renders per keystroke, and this is where lag is felt most today.
  test("practice mode with keyboard: keystroke latency under throttle", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoHomeInstrumented(page);
    await page.getByTestId("mode-bar").getByRole("button", { name: "Practice" }).click();
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await page.locator("#text").click();

    await warmUpFirstKeystroke(page);
    const typed = await typePromptChars(page, 150);
    await collectAndReport(page, "practice (keyboard visible)", typed, { p95: 170, hitches: 450 });
  });
});
