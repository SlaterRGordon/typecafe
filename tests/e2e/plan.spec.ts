import { expect, test, type Page } from "@playwright/test"
import {
  createDailySession,
  DAILY_COACHING_STORAGE_KEY,
  GUEST_DAILY_SCOPE,
  localDateKey,
  previousDateKey,
  recordDailySet,
  type DailyCoachingSession,
  type YesterdayOutcome,
} from "../../src/lib/dailyCoaching"
import type { TransitionAggregate } from "../../src/lib/transitions"
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc"
import { typeVisibleTestText } from "./helpers/typing"

// Same slow b→r the signed-in trpc mock serves, for building guest fixtures.
const SLOW_TRANSITIONS: TransitionAggregate[] = [
  { pair: "br", count: 12, totalMs: 4800, errors: 1 },
  { pair: "th", count: 12, totalMs: 1800, errors: 0 },
]

// A targeted session whose focus drill is short enough to type in e2e. The
// baseline step optionally arrives already adopted from a Test.
function fastSession(options: { baselineDone?: boolean, yesterday?: YesterdayOutcome } = {}): DailyCoachingSession {
  let session = createDailySession({
    dateKey: localDateKey(),
    pool: "qwerty",
    language: "english",
    attempts: new Map(),
    transitions: SLOW_TRANSITIONS,
    yesterday: options.yesterday,
    now: Date.now(),
  })
  session = {
    ...session,
    steps: session.steps.map((step) => step.kind === "focus" || step.kind === "recheck" || step.kind === "transfer"
      ? { ...step, href: `${step.href.split("&length=")[0]}&length=${step.kind === "focus" ? 4 : 20}` }
      : step),
  }
  if (options.baselineDone) {
    const cold = session.steps.find((step) => step.kind === "recheck")
    if (cold) session = recordDailySet(session, cold.id, {
      netWpm: 60, accuracy: 95, completedAt: Date.now(), targetSamples: 6,
      targetDelta: { label: options.yesterday!.label, before: options.yesterday!.before, after: options.yesterday!.after, unit: options.yesterday!.unit, improved: true },
    })
    const baseline = session.steps.find((step) => step.kind === "baseline")!
    session = recordDailySet(session, baseline.id, { netWpm: 60, accuracy: 95, completedAt: Date.now() })
  }
  return session
}

function transferredSession(dateKey: string): DailyCoachingSession {
  let session = createDailySession({
    dateKey, pool: "qwerty", language: "english",
    attempts: new Map(), transitions: SLOW_TRANSITIONS, now: Date.now() - 86_400_000,
  })
  const baseline = session.steps.find((step) => step.kind === "baseline")!
  session = recordDailySet(session, baseline.id, { netWpm: 60, accuracy: 96 })
  const focus = session.steps.find((step) => step.kind === "focus")!
  for (const after of [370, 360]) session = recordDailySet(session, focus.id, {
    netWpm: 62, accuracy: 97, targetSamples: 8,
    targetDelta: { label: "b→r", before: 400, after, unit: "ms", improved: true },
  })
  const transfer = session.steps.find((step) => step.kind === "transfer")!
  return recordDailySet(session, transfer.id, {
    netWpm: 63, accuracy: 98, targetSamples: 8,
    targetDelta: { label: "b→r", before: 400, after: 350, unit: "ms", improved: true },
  })
}

async function seedSession(page: Page, scope: string, session: DailyCoachingSession) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify([value]))
  }, { key: `${DAILY_COACHING_STORAGE_KEY}:${encodeURIComponent(scope)}`, value: session })
}

async function storedSessions(page: Page, scope: string): Promise<DailyCoachingSession[]> {
  const raw: unknown = await page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown,
    `${DAILY_COACHING_STORAGE_KEY}:${encodeURIComponent(scope)}`,
  )
  return raw as DailyCoachingSession[]
}

test.describe("daily coaching", () => {
  test("prescribes warm-up plus focus sets and explains why", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page)
    await page.goto("/plan")

    await expect(page.getByRole("heading", { name: "Today's coaching" })).toBeVisible()
    await expect(page.getByText(/b→r transition is .* slower/)).toBeVisible()
    const prescription = page.getByRole("region", { name: "Cold if due → measure → acquire → Transfer" })
    await expect(prescription.getByText("Warm measure: 30-second Test")).toBeVisible()
    await expect(prescription.getByText("Acquire b→r")).toBeVisible()
    await expect(prescription.getByText("Transfer b→r")).toBeVisible()
    // The warm-up runs on the real Test surface, not a special mode.
    await expect(page.getByTestId("daily-session-start")).toHaveAttribute("href", "/?mode=timed&count=30")
    await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0)
  })

  test("gives a zero-history guest one mapping Test, not busywork", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/plan")

    await expect(page.getByText(/still learning how you type/i)).toBeVisible()
    const prescription = page.getByRole("region", { name: "Measure once, then target" })
    await expect(prescription.getByText("Map your typing")).toBeVisible()
    await expect(page.getByTestId("daily-session-start")).toHaveAttribute("href", "/?mode=timed&count=60")
  })

  test("resumes the most-complete account snapshot on another device", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { coachingSession: fastSession({ baselineDone: true }) })
    await page.goto("/plan")

    await expect(page.getByTestId("daily-session-active")).toContainText("1/3 steps")
    await expect(page.getByTestId("daily-session-start")).toContainText("Resume session")
    await expect(page.getByTestId("daily-session-active")).toContainText("Acquire b→r")
  })

  test("derives a due Cold check from cross-device Coaching history", async ({ page }) => {
    const history = transferredSession(previousDateKey(localDateKey()))
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { coachingHistory: [history] })
    await page.goto("/plan")

    const prescription = page.getByRole("region", { name: "Cold if due → measure → acquire → Transfer" })
    await expect(prescription.getByText(/Cold check b→r/)).toBeVisible()
    await expect(page.getByText(/against its frozen 400ms baseline/)).toBeVisible()
    await expect(page.getByTestId("daily-session-active")).toContainText("0/4 steps")
  })

  test("adopts the guest session into the account on sign in and clears the guest mirror", async ({ page }) => {
    let saved: unknown = null
    await seedSession(page, GUEST_DAILY_SCOPE, fastSession({ baselineDone: true }))
    await mockAuthenticatedSession(page)
    await mockTrpc(page, {
      onProcedure: (procedure, input) => {
        if (procedure === "coachingSession.save") saved = input?.snapshot
      },
    })
    await page.goto("/plan")

    await expect.poll(() => saved).not.toBeNull()
    expect((saved as DailyCoachingSession).currentStepIndex).toBe(1)
    await expect.poll(async () => (await storedSessions(page, "user-1")).length).toBe(1)
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), `${DAILY_COACHING_STORAGE_KEY}:guest`)).toBeNull()
  })

  test("a qualifying Test on the home page is adopted as the warm-up and returns to /plan", async ({ page }) => {
    await seedSession(page, GUEST_DAILY_SCOPE, fastSession())
    await mockTrpc(page)
    // 25 words qualifies as the baseline measure (30s timed would stall e2e).
    await page.goto("/?mode=words&count=25")
    await expect(page.locator("#words .char").first()).toBeVisible()
    await typeVisibleTestText(page)

    // An adopted measure skips the generic score card and lands on the daily
    // hub, which shows the recorded warm-up and the next step.
    await expect(page).toHaveURL(/\/plan$/)
    await expect(page.getByTestId("daily-session-active")).toContainText("1/3 steps")
    await expect(page.getByTestId("daily-session-active")).toContainText("Acquire b→r")
    const stored = await storedSessions(page, GUEST_DAILY_SCOPE)
    expect(stored[0]?.currentStepIndex).toBe(1)
    expect(stored[0]?.steps[0]?.sets).toHaveLength(1)
  })

  test("focus sets record from real drill completions until the step ends", async ({ page }) => {
    await seedSession(page, GUEST_DAILY_SCOPE, fastSession({ baselineDone: true }))
    await mockTrpc(page)
    await page.goto("/drill?transitions=br&length=4")

    const strip = page.getByTestId("daily-session-strip")
    await expect(strip).toContainText("set 1 of up to 3")
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    await typeVisibleTestText(page)

    // Set recorded; the primary action is another set of the same drill.
    await expect(strip).toContainText("set 2 of up to 3")
    const next = page.getByTestId("daily-session-continue")
    await expect(next).toContainText("Next set →")
    await next.click()
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    await typeVisibleTestText(page)

    await expect(page.getByTestId("daily-session-continue")).toContainText("Next: Transfer b→r")
      .catch(async () => {
        await page.getByTestId("daily-session-continue").click()
        await expect(page.getByTestId("drill-typer")).toBeVisible()
        await typeVisibleTestText(page)
        await expect(page.getByTestId("daily-session-continue")).toContainText("Next: Transfer b→r")
      })
    await page.getByTestId("daily-session-continue").click()
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    await typeVisibleTestText(page)

    // Set 1's reps synced into the lifetime mirror (ADR-0004), so later sets
    // have a baseline to beat; two beats (or three sets) end the session.
    await expect(strip).toContainText("All steps done")
    await expect(page.getByTestId("daily-session-continue")).toContainText("See today's result →")
    const stored = await storedSessions(page, GUEST_DAILY_SCOPE)
    expect(stored[0]?.status).toBe("completed")

    // The done card leads with the target metric measured across the sets.
    await page.getByTestId("daily-session-continue").click()
    await expect(page.getByTestId("daily-session-complete")).toContainText("b→r · baseline → Transfer")
    await expect(page.getByTestId("daily-proof")).toContainText(/ms → \d+ms/)
  })

  test("an Impact-ranked day keeps one primary Target", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, {
      keyStats: [
        { character: "q", total: 12, correct: 8 },
        { character: "z", total: 10, correct: 8 },
        { character: "e", total: 40, correct: 40 },
      ],
    })
    await page.goto("/plan")

    const prescription = page.getByRole("region", { name: "Cold if due → measure → acquire → Transfer" })
    await expect(prescription.getByText("Acquire b→r")).toBeVisible()
    await expect(prescription.getByText("Clean up q z")).toHaveCount(0)
    await expect(page.getByTestId("daily-session-active")).toContainText("0/3 steps")
  })

  test("moving to the next step's drill starts at the typer, not the previous result", async ({ page }) => {
    // Yesterday's target moved on → today is baseline, recheck, focus. The
    // recheck→focus handoff is a client-side nav within /drill; it must reset
    // the completed card instead of showing the recheck's result on the focus.
    const yesterday: YesterdayOutcome = {
      label: "q z", target: { kind: "key", keys: ["q", "z"], metric: "accuracy" }, unit: "%", before: 82, after: 91, minimumChange: 1,
    }
    const session = fastSession({ yesterday })
    expect(session.steps.map((step) => step.kind)).toEqual(["recheck", "baseline", "focus", "transfer"])
    await seedSession(page, GUEST_DAILY_SCOPE, session)
    await mockTrpc(page)

    await page.goto(session.steps[0]!.href)
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    await typeVisibleTestText(page)

    const next = page.getByTestId("daily-session-continue")
    await expect(next).toContainText("Next: Warm measure: 30-second Test")
    await next.click()

    await expect(page).toHaveURL("http://127.0.0.1:3000/")
    await expect(page.locator("#words .char").first()).toBeVisible()
  })

  test("query parameters alone cannot claim progress", async ({ page }) => {
    await seedSession(page, GUEST_DAILY_SCOPE, fastSession())
    await mockTrpc(page)
    await page.goto("/plan?step=done")

    await expect(page.getByTestId("daily-session-active")).toContainText("0/3 steps")
    const stored = await storedSessions(page, GUEST_DAILY_SCOPE)
    expect(stored[0]?.currentStepIndex).toBe(0)
    expect(stored[0]?.steps.every((step) => step.sets.length === 0)).toBe(true)
  })

  test("a completed day leads with the target metric and its earlier cold check", async ({ page }) => {
    const yesterday: YesterdayOutcome = {
      label: "b→r", target: { kind: "transition", pair: "br", metric: "latency" }, unit: "ms", before: 410, after: 350, minimumChange: 10,
    }
    let session = fastSession({ baselineDone: true, yesterday })
    const focusId = session.steps.find((step) => step.kind === "focus")!.id
    session = recordDailySet(session, focusId, {
      netWpm: 62, accuracy: 96, completedAt: Date.now(),
      targetDelta: { label: "b→r", before: 400, after: 340, unit: "ms", improved: true },
    })
    session = recordDailySet(session, focusId, {
      netWpm: 63, accuracy: 96, completedAt: Date.now(),
      targetDelta: { label: "b→r", before: 400, after: 330, unit: "ms", improved: true },
    })
    const transferId = session.steps.find((step) => step.kind === "transfer")!.id
    session = recordDailySet(session, transferId, {
      netWpm: 64, accuracy: 97, completedAt: Date.now(), targetSamples: 6,
      targetDelta: { label: "b→r", before: 400, after: 350, unit: "ms", improved: true },
    })
    expect(session.status).toBe("completed")
    await seedSession(page, GUEST_DAILY_SCOPE, session)
    await mockTrpc(page)
    await page.goto("/plan")

    // Hero: the target's baseline → best set, not a global WPM delta.
    await expect(page.getByTestId("daily-proof")).toContainText("400ms → 350ms")
    await expect(page.getByTestId("daily-cold-check")).toContainText("the change stuck")
    await expect(page.getByTestId("daily-session-complete")).toContainText("eligible for a later cold check")
    await expect(page.getByRole("link", { name: "Extra targeted practice" })).toBeVisible()
    await expect(page.getByRole("button", { name: /start day/i })).toHaveCount(0)
    // A finished day clears the coach tab - completing it clears the notification.
    await expect(page.getByTestId("home-coach-tab-daily")).toHaveCount(0)
    await expect(page.getByTestId("home-coach-tab-daily-inline")).toHaveCount(0)
  })

  test("a finished calibration reveals the first finding immediately", async ({ page }) => {
    let session = createDailySession({
      dateKey: localDateKey(), pool: "qwerty", language: "english",
      attempts: new Map(), transitions: [], now: Date.now(),
    })
    session = recordDailySet(session, session.steps[0]!.id, { netWpm: 55, accuracy: 93, completedAt: Date.now() })
    expect(session.status).toBe("completed")
    await seedSession(page, GUEST_DAILY_SCOPE, session)
    // The mapping Test's evidence, as the local mirror would hold it.
    await page.addInitScript((transitions) => {
      window.localStorage.setItem("typecafe:transitionStats", JSON.stringify(transitions))
    }, SLOW_TRANSITIONS)
    await mockTrpc(page)
    await page.goto("/plan")

    await expect(page.getByTestId("daily-session-complete")).toContainText(/Found it: your b→r transition/)
    await expect(page.getByTestId("daily-first-finding-drill")).toHaveAttribute("href", "/drill?transitions=br")
  })
})
