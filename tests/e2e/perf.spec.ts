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
// absolute numbers are pessimistic (React dev mode) - treat them as relative.

declare global {
  interface Window {
    __perf: {
      keyToFrame: number[],
      events: { input: number, processing: number, duration: number }[],
      loaf: number[],
    }
    __practicePerf: {
      readyAt: number,
      loaf: { startTime: number, duration: number }[],
    }
  }
}

const CPU_THROTTLE = 4;
const KEY_DELAY_MS = 45; // ≈200 WPM target before protocol overhead

test.skip(({ isMobile }) => isMobile, "perf baseline is desktop-only (throttled desktop ≈ small laptop)");
test.skip(() => test.info().config.workers > 1, "perf baseline must run alone: npx playwright test tests/e2e/perf.spec.ts --project=desktop-chromium --workers=1");

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

// Budgets are regression tripwires, not targets: set ~2× the post-phase-1
// numbers (recorded in docs/features/typing-feel.md) so a reintroduced
// per-keystroke render storm fails loudly without flaking on run-to-run noise.
// The pre-phase-1 baseline would fail all four assertions.
// NOTE: run on a quiet machine - a parallel e2e suite on the same dev server
// contaminates the numbers (input delay >10ms is the tell).
async function collectAndReport(
  page: Page,
  scenario: string,
  typed: { chars: number, wpm: number },
  budget: { p95: number, hitches: number },
) {
  // Under the full eight-worker suite, keyboard.type can finish while RAF
  // callbacks from the final burst are still queued. Wait for instrumentation
  // to drain before judging sample coverage or latency.
  const minimumSamples = Math.floor(typed.chars * 0.9);
  await expect.poll(
    () => page.evaluate(() => window.__perf.keyToFrame.length),
    { timeout: 10_000 },
  ).toBeGreaterThanOrEqual(minimumSamples);
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

  expect(k.length).toBeGreaterThanOrEqual(minimumSamples);
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
    await collectAndReport(page, "timed (default home)", typed, { p95: 60, hitches: 15 });
  });

});

type PracticePerfSample = {
  refreshMs: number,
  refreshLoaf: number[],
}

const PRACTICE_REFRESH_ROUNDS = 3;
// Post-fix 4× baselines: Keys 1.50–1.70× Home, Grams 1.31–1.46×;
// selection paint q 99–107ms and er 62–68ms; prompt ready q 197–213ms and
// er 81–128ms. These retain machine headroom while failing the old
// 2.68× / 3.40× and 332ms / 1,008ms behavior.
const PRACTICE_REFRESH_RATIO_BUDGET = { keys: 1.85, grams: 1.7 };
const PRACTICE_EDIT_BUDGET_MS = 150;
const PRACTICE_EDIT_READY_BUDGET_MS = 300;
const PRACTICE_EDIT_LOAF_BUDGET_MS = 110;
const PRACTICE_REFRESH_LOAF_BUDGET_MS = 300;

async function installPracticePerfInstrumentation(page: Page) {
  await page.addInitScript(() => {
    window.__practicePerf = { readyAt: 0, loaf: [] };
    const markReady = () => {
      if (window.__practicePerf.readyAt > 0) return;
      const first = document.querySelector("#c0.active-char");
      if (!first) return;
      requestAnimationFrame(() => {
        window.__practicePerf.readyAt = performance.now();
      });
    };
    new MutationObserver(markReady).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__practicePerf.loaf.push({ startTime: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: "long-animation-frame" });
    } catch { /* Chromium without LoAF support reports no edit hitches. */ }
  });
}

async function refreshToReady(page: Page, path: string): Promise<PracticePerfSample> {
  await page.goto(path);
  await expect.poll(
    () => page.evaluate(() => window.__practicePerf.readyAt),
    { timeout: 30_000 },
  ).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  return page.evaluate(() => ({
    refreshMs: window.__practicePerf.readyAt,
    refreshLoaf: window.__practicePerf.loaf
      .filter((entry) => entry.startTime <= window.__practicePerf.readyAt)
      .map((entry) => entry.duration),
  }));
}

async function measurePaintedEdit(page: Page, input: {
  clickSelector: string,
  selectionSelector: string,
  readySelector: string,
  selectedAttribute?: { name: string, value: string },
  selectedText?: string,
}): Promise<{ latency: number, readyLatency: number, loaf: number[] }> {
  const result = await page.evaluate(async ({ clickSelector, selectionSelector, readySelector, selectedAttribute, selectedText }) => {
    const clickTarget = document.querySelector<HTMLElement>(clickSelector);
    const selectionTarget = document.querySelector(selectionSelector);
    const readyTarget = document.querySelector(readySelector);
    if (!clickTarget || !selectionTarget || !readyTarget) throw new Error("Practice performance target not found");
    const selected = () => selectedAttribute
      ? selectionTarget.getAttribute(selectedAttribute.name) === selectedAttribute.value
      : selectionTarget.textContent?.includes(selectedText ?? "") ?? false;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const startedAt = performance.now();
    return await new Promise<{ latency: number, readyLatency: number, startedAt: number }>((resolve) => {
      let latency: number | null = null;
      const finishIfReady = () => {
        if (latency === null || readyTarget.getAttribute("data-prompt-ready") !== "true") return;
        selectionObserver.disconnect();
        readyObserver.disconnect();
        requestAnimationFrame(() => resolve({ latency, readyLatency: performance.now() - startedAt, startedAt }));
      };
      const markSelection = () => requestAnimationFrame(() => {
        latency = performance.now() - startedAt;
        finishIfReady();
      });
      const selectionObserver = new MutationObserver(() => {
        if (!selected()) return;
        selectionObserver.disconnect();
        markSelection();
      });
      const readyObserver = new MutationObserver(finishIfReady);
      if (selected()) markSelection();
      else selectionObserver.observe(selectionTarget, { attributes: true, childList: true, subtree: true });
      readyObserver.observe(readyTarget, { attributes: true });
      clickTarget.click();
    });
  }, {
    clickSelector: input.clickSelector,
    selectionSelector: input.selectionSelector,
    readySelector: input.readySelector,
    selectedAttribute: input.selectedAttribute,
    selectedText: input.selectedText,
  });
  await page.waitForTimeout(100);
  const loaf = await page.evaluate(({ startedAt, endedAt }) => window.__practicePerf.loaf
    .filter((entry) => entry.startTime <= endedAt && entry.startTime + entry.duration >= startedAt)
    .map((entry) => entry.duration), {
      startedAt: result.startedAt,
      endedAt: result.startedAt + result.readyLatency,
    });
  return { latency: result.latency, readyLatency: result.readyLatency, loaf };
}

function median(values: number[]): number {
  return percentile(values, 50);
}

function loafSummary(values: number[]): string {
  const long = values.filter((value) => value >= 50);
  return long.length === 0 ? "none" : `${long.length} frames · worst ${fmt(Math.max(...long))}`;
}

test.describe.serial("Practice performance regression", () => {
  test("refresh and focus edits stay responsive under throttle", async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({
        keys: ["e", "r"],
        durationSeconds: 60,
        textStyle: "varied",
      }));
    });
    await installPracticePerfInstrumentation(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

    const samples: Record<"Home" | "Custom Keys" | "Custom Grams", PracticePerfSample[]> = {
      Home: [],
      "Custom Keys": [],
      "Custom Grams": [],
    };
    for (let round = 0; round < PRACTICE_REFRESH_ROUNDS; round += 1) {
      samples.Home.push(await refreshToReady(page, "/?mode=timed&count=60"));
      samples["Custom Keys"].push(await refreshToReady(page, "/practice?custom=keys"));
      samples["Custom Grams"].push(await refreshToReady(page, "/practice?custom=grams"));
    }

    await page.goto("/practice?custom=keys");
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    const keyEdit = await measurePaintedEdit(page, {
      clickSelector: '[data-kb-key="q"]',
      selectionSelector: '[data-kb-key="q"]',
      readySelector: '[aria-label="Practice run"]',
      selectedAttribute: { name: "aria-pressed", value: "true" },
    });

    await page.goto("/practice?custom=grams");
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await page.getByTestId("custom-gram-input").fill("er");
    const gramEdit = await measurePaintedEdit(page, {
      clickSelector: 'form button[type="submit"]',
      selectionSelector: '[data-testid="selected-practice-grams"]',
      readySelector: '[aria-label="Practice run"]',
      selectedText: "er",
    });

    const homeRefresh = median(samples.Home.map((sample) => sample.refreshMs));
    const keysRefresh = median(samples["Custom Keys"].map((sample) => sample.refreshMs));
    const gramsRefresh = median(samples["Custom Grams"].map((sample) => sample.refreshMs));
    const refreshLoaf = Object.fromEntries(Object.entries(samples).map(([scenario, scenarioSamples]) => [
      scenario,
      scenarioSamples.flatMap((sample) => sample.refreshLoaf),
    ])) as Record<keyof typeof samples, number[]>;
    console.log([
      "",
      `── Practice perf (cpu ×${CPU_THROTTLE}, ${PRACTICE_REFRESH_ROUNDS} serial rounds) ──`,
      `refresh-to-ready median: Home ${fmt(homeRefresh)} · Keys ${fmt(keysRefresh)} (${(keysRefresh / homeRefresh).toFixed(2)}×) · Grams ${fmt(gramsRefresh)} (${(gramsRefresh / homeRefresh).toFixed(2)}×)`,
      `refresh LoAF: Home ${loafSummary(refreshLoaf.Home)} · Keys ${loafSummary(refreshLoaf["Custom Keys"])} · Grams ${loafSummary(refreshLoaf["Custom Grams"])}`,
      `add q: selection ${fmt(keyEdit.latency)} · prompt ready ${fmt(keyEdit.readyLatency)} · LoAF ${keyEdit.loaf.map((value) => fmt(value)).join(", ") || "none"}`,
      `add er: selection ${fmt(gramEdit.latency)} · prompt ready ${fmt(gramEdit.readyLatency)} · LoAF ${gramEdit.loaf.map((value) => fmt(value)).join(", ") || "none"}`,
      "",
    ].join("\n"));

    expect(keysRefresh / homeRefresh, "Custom Keys refresh regressed against Home").toBeLessThan(PRACTICE_REFRESH_RATIO_BUDGET.keys);
    expect(gramsRefresh / homeRefresh, "Custom Grams refresh regressed against Home").toBeLessThan(PRACTICE_REFRESH_RATIO_BUDGET.grams);
    expect(keyEdit.latency, "adding a Custom Key stalled selection paint").toBeLessThan(PRACTICE_EDIT_BUDGET_MS);
    expect(gramEdit.latency, "adding a Custom Gram stalled selection paint").toBeLessThan(PRACTICE_EDIT_BUDGET_MS);
    expect(keyEdit.readyLatency, "adding a Custom Key stalled prompt readiness").toBeLessThan(PRACTICE_EDIT_READY_BUDGET_MS);
    expect(gramEdit.readyLatency, "adding a Custom Gram stalled prompt readiness").toBeLessThan(PRACTICE_EDIT_READY_BUDGET_MS);
    expect(keyEdit.loaf.filter((duration) => duration >= PRACTICE_EDIT_LOAF_BUDGET_MS)).toEqual([]);
    expect(gramEdit.loaf.filter((duration) => duration >= PRACTICE_EDIT_LOAF_BUDGET_MS)).toEqual([]);
    expect(refreshLoaf["Custom Keys"].filter((duration) => duration >= PRACTICE_REFRESH_LOAF_BUDGET_MS)).toEqual([]);
    expect(refreshLoaf["Custom Grams"].filter((duration) => duration >= PRACTICE_REFRESH_LOAF_BUDGET_MS)).toEqual([]);
  });
});
