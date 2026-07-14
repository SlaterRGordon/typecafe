import { type NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useDispatch } from "react-redux";
import { FirstVisitPromise } from "~/components/home/FirstVisitPromise";
import { HomeCoachTabs } from "~/components/home/HomeCoachTabs";
import { ShareableScoreCard, type ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import { Keyboard } from "~/components/typer/Keyboard";
import { Typer, type TestCompletionResult } from "~/components/typer/Typer";
import { ModeBar } from "~/components/typer/config/ModeBar";
import { typingFocusFadeClass } from "~/components/typer/typingFocus";
import { TestModes, TestSubModes, type QuoteLength, type TestGramScopes, type TestGramSources } from "~/components/typer/types";
import { useTestSettings } from "~/hooks/useTestSettings";
import { useLanguage } from "~/hooks/useLanguage";
import { useLayout } from "~/hooks/useLayout";
import { boardFor, sequenceFor, statsPoolFor } from "~/lib/keyboardLayout";
import { accentsFor, clampSize, composeLanguage, ensureLanguageLoaded, parseLanguage } from "~/components/typer/utils";
import { withPracticeVowel } from "~/lib/diagnosis";
import {
  currentDailyStep,
  GUEST_DAILY_SCOPE,
  localDateKey,
  measureQualifies,
  readLocalDailySession,
  recordDailySet,
  writeLocalDailySession,
} from "~/lib/dailyCoaching";
import { isPracticeLetter, remapPracticeSelectionByPosition, repairPracticeSelection, smartDrillSelection } from "~/lib/drillKeys";
import { keySpeedBars, type TransitionAggregate } from "~/lib/transitions";
import { readLocalTransitions } from "~/lib/localTransitions";
import { addAlert } from "~/state/alert/alertSlice";
import { appendLocalProgress } from "~/lib/progressHistory";
import { consistencyFromSamples } from "~/lib/stats";
import { api } from "~/utils/api";
import { SITE_DESCRIPTION } from "~/lib/siteMetadata";

// Runs synchronously before paint on the client so we can suppress the typer's
// first (stale-mode) render before it ever shows; falls back to useEffect on the
// server to avoid the SSR warning.
const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// The diagnosed test we'll offer to re-run after a drill, so its result can show
// a before→after WPM delta (Phase 1.3). Lives in sessionStorage as
// `typecafe:reMeasure` (set at the drill handoff, cleared once the delta shows).
interface ReMeasureState {
  beforeWpm: number;
  config: {
    subMode: TestSubModes;
    count: number;
    language: string;
    customLength: boolean;
    punctuation: boolean;
    capitals: boolean;
    numbers: boolean;
    options: string;
  };
}

const RE_MEASURE_KEY = "typecafe:reMeasure";
const RE_MEASURE_TTL_MS = 60 * 60 * 1000;

const Home: NextPage = () => {
  const [fullscreen, setFullscreen] = useState(false)
  const { settings, updateSetting } = useTestSettings()
  const {
    mode, subMode, language, quoteLength, count, customLength, punctuation, capitals, numbers,
    selectedKeys, gramSource, gramScope, gramCombination, gramRepetition,
    gramWpmThreshold, gramAccuracyThreshold,
  } = settings
  const setLanguage = (value: string) => updateSetting("language", value)
  const setQuoteLength = (value: QuoteLength) => updateSetting("quoteLength", value)
  const setMode = (value: TestModes) => updateSetting("mode", value)
  const setSubMode = (value: TestSubModes) => updateSetting("subMode", value)
  const setSelectedKeys = useCallback((value: string[]) => updateSetting("selectedKeys", value), [updateSetting])
  const setCount = (value: number) => updateSetting("count", value)
  const setPunctuation = (value: boolean) => updateSetting("punctuation", value)
  const setCapitals = (value: boolean) => updateSetting("capitals", value)
  const setNumbers = (value: boolean) => updateSetting("numbers", value)
  const setCustomLength = (value: boolean) => updateSetting("customLength", value)
  const setGramSource = (value: TestGramSources) => updateSetting("gramSource", value)
  const setGramScope = (value: TestGramScopes) => updateSetting("gramScope", value)
  const setGramCombination = (value: number) => updateSetting("gramCombination", value)
  const setGramRepetition = (value: number) => updateSetting("gramRepetition", value)
  const setGramWpmThreshold = (value: number) => updateSetting("gramWpmThreshold", value)
  const setGramAccuracyThreshold = (value: number) => updateSetting("gramAccuracyThreshold", value)
  // The global (nav-chosen) base language is the source of truth for which language
  // the test uses; the bar picks the size on top. Keep the composed test language's
  // base in step with it, preserving the current size (clamped to what the new
  // language offers). One-way: nav → test settings.
  const [globalLanguage] = useLanguage()
  const activeTestLanguage = useMemo(() => {
    const { size } = parseLanguage(language)
    return composeLanguage(globalLanguage, clampSize(globalLanguage, size))
  }, [globalLanguage, language])
  useEffect(() => {
    if (activeTestLanguage !== language) setLanguage(activeTestLanguage)
    // Quotes are English-only; leaving English exits the quote engine.
    if (globalLanguage !== "english" && mode === TestModes.quotes) setMode(TestModes.normal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTestLanguage, globalLanguage, language])
  const [typingFocused, setTypingFocused] = useState(false)
  // Practice: the keyboard's layer rail is sticky, while holding physical Shift
  // peeks the layer (release returns to the sticky toggle). The page owns both so
  // the rail and the rendered caps always report the same combined state.
  const [shiftToggle, setShiftToggle] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  // AltGr mirror of the shift layer, for national layouts (@ € ~ µ, Polish
  // accents). The toggle only renders when the active layout has AltGr glyphs.
  const [altgrToggle, setAltgrToggle] = useState(false)
  const [altgrHeld, setAltgrHeld] = useState(false)
  const dispatch = useDispatch()
  const [restartSignal, setRestartSignal] = useState(0)
  const [completedScore, setCompletedScore] = useState<(ScoreSnapshot & {
    speed: number;
    count: number;
    mode: TestModes;
    subMode: TestSubModes;
    language: string;
    options?: string;
    punctuation?: boolean;
    capitals?: boolean;
    numbers?: boolean;
    ranked?: boolean;
    createdAt: Date;
    testId?: string;
    streak?: number | null;
    reMeasure?: { beforeWpm: number };
  }) | null>(null)
  const [shareUrl, setShareUrl] = useState<string | undefined>(undefined)
  // True while a signed-in user's just-finished test is being saved - the card
  // renders instantly (eagerResult) and shows a loader until the save settles.
  const [isSavingScore, setIsSavingScore] = useState(false)
  // The pending re-measure offer. The ref is the synchronous source of truth (read
  // inside completion handling); the state drives the drill-view prompt's render.
  const reMeasureRef = useRef<ReMeasureState | null>(null)
  const [reMeasure, setReMeasure] = useState<ReMeasureState | null>(null)
  // A /?mode=grams landing (e.g. from progress) would otherwise mount the typer in
  // the persisted words/timed mode and flash a words test before the grams config
  // applies. Hold the typer behind a loader until the handoff lands.
  const [gramsHandoffPending, setGramsHandoffPending] = useState(false)
  // The just-finished Test advanced today's coaching session (its measure was
  // adopted); the result card banners the next step. Reset with the card.
  useBrowserLayoutEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "grams") setGramsHandoffPending(true)
  }, [])
  const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
  const persistedAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
  const hasSavedPendingRef = useRef(false)
  // True while a result card is on screen for the current attempt. Guards the
  // async save upgrade from re-showing the card after the user already restarted.
  const cardActiveRef = useRef(false)
  // The re-measure offer resolved for the current attempt, kept so the eager and
  // the persisted-upgrade reports both carry it (the offer is retired after the first).
  const attemptReMeasureRef = useRef<{ beforeWpm: number } | undefined>(undefined)
  const { data: sessionData } = useSession()
  const router = useRouter()
  const [activeLayout] = useLayout()
  const priorPracticeLayout = useRef(activeLayout)
  useEffect(() => {
    const fromLayout = priorPracticeLayout.current
    if (mode !== TestModes.practice) {
      priorPracticeLayout.current = activeLayout
      return
    }
    let alive = true
    void ensureLanguageLoaded(globalLanguage).then(() => {
      if (!alive) return
      const accents = accentsFor(globalLanguage)
      const carried = fromLayout === activeLayout
        ? selectedKeys
        : remapPracticeSelectionByPosition(selectedKeys, fromLayout, activeLayout, accents)
      const repaired = repairPracticeSelection(carried, activeLayout, accents)
      if (repaired.length !== selectedKeys.length || repaired.some((key, index) => key !== selectedKeys[index])) setSelectedKeys(repaired)
      priorPracticeLayout.current = activeLayout
    })
    return () => { alive = false }
  }, [activeLayout, globalLanguage, mode, selectedKeys, setSelectedKeys])
  const { data: persistedStats } = api.practiceStats.get.useQuery({ pool: statsPoolFor(activeLayout) }, {
    enabled: mode === TestModes.practice && !!sessionData?.user,
  })
  const createShare = api.scoreShare.create.useMutation()
  const createGuestScore = api.scoreShare.createGuestScore.useMutation()
  const saveAfterSignIn = api.test.create.useMutation()

  // Rendered nowhere: bumping it just re-renders the Keyboard once when the
  // lifetime stats land, so the heatmap re-reads the freshly filled ref.
  // (Per-keystroke refreshes ride the key signal inside Keyboard instead.)
  const [, bumpPersistedStats] = useState(0)
  useEffect(() => {
    if (mode !== TestModes.practice || !persistedStats) return

    persistedAttemptsRef.current.clear()
    persistedStats.forEach((stat) => {
      persistedAttemptsRef.current.set(stat.character, {
        attempts: stat.total,
        correct: stat.correct,
      })
    })
    bumpPersistedStats((version) => version + 1)
  }, [mode, persistedStats])

  // Lifetime per-key speed for the Practice heatmap bars (Option A): DB rows when
  // signed in, the localStorage mirror for guests - the same source drill/progress
  // read. Rolled into per-key bars once; recomputed only when the pool or the data
  // changes.
  const practicePool = statsPoolFor(activeLayout)
  const { data: dbTransitions } = api.transitionStats.get.useQuery({ pool: practicePool }, {
    enabled: mode === TestModes.practice && !!sessionData?.user,
  })
  const [localTransitions, setLocalTransitions] = useState<TransitionAggregate[]>([])
  useEffect(() => {
    if (mode !== TestModes.practice || sessionData?.user) return
    setLocalTransitions(readLocalTransitions(practicePool))
  }, [mode, sessionData?.user, practicePool])
  const speedBars = useMemo(
    () => keySpeedBars(sessionData?.user ? (dbTransitions ?? []) : localTransitions),
    [sessionData?.user, dbTransitions, localTransitions],
  )

  // Keep the ref, the render state, and sessionStorage in lock-step so the offer
  // survives a reload mid-drill and is read consistently everywhere.
  const applyReMeasure = useCallback((value: ReMeasureState | null) => {
    reMeasureRef.current = value
    setReMeasure(value)
    try {
      if (value) sessionStorage.setItem(RE_MEASURE_KEY, JSON.stringify({ savedAt: Date.now(), ...value }))
      else sessionStorage.removeItem(RE_MEASURE_KEY)
    } catch {
      // sessionStorage unavailable - the prompt just won't survive a reload.
    }
  }, [])

  // Restore a pending re-measure offer after a reload (e.g. the user refreshed
  // mid-drill). Expired offers are dropped.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RE_MEASURE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { savedAt?: number, beforeWpm?: number, config?: ReMeasureState["config"] }
      if (typeof parsed.savedAt !== "number" || typeof parsed.beforeWpm !== "number" || !parsed.config) return
      if (Date.now() - parsed.savedAt > RE_MEASURE_TTL_MS) {
        sessionStorage.removeItem(RE_MEASURE_KEY)
        return
      }
      reMeasureRef.current = { beforeWpm: parsed.beforeWpm, config: parsed.config }
      setReMeasure(reMeasureRef.current)
    } catch {
      // Corrupt entry - ignore.
    }
  }, [])

  useEffect(() => {
    if (mode !== TestModes.practice) return
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === "Shift") setShiftHeld(true)
      if (e.key === "AltGraph") setAltgrHeld(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false)
      if (e.key === "AltGraph") setAltgrHeld(false)
    }
    const clear = () => {
      setShiftHeld(false)
      setAltgrHeld(false)
    }
    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    window.addEventListener("blur", clear)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("blur", clear)
    }
  }, [mode])
  const shiftLayer = shiftToggle || shiftHeld
  const altgrLayer = altgrToggle || altgrHeld

  const hasAltGr = useMemo(() => boardFor(activeLayout).rows.some((row) => row.some((cap) => cap.altgr)), [activeLayout])

  // Smart drill (settings line): select the eight least-accurate keys from the
  // folded lifetime + session attempts - including the language's accent chars
  // the active layout can type (ü on qwertz-de, dead-composed ê on azerty-fr).
  // Selection math lives in lib/drillKeys.
  const handleSmartDrill = () => {
    const merged = new Map<string, { attempts: number, correct: number }>()
    for (const source of [persistedAttemptsRef.current, charAttemptsRef.current]) {
      for (const [key, value] of source) {
        const entry = merged.get(key) ?? { attempts: 0, correct: 0 }
        entry.attempts += value.attempts
        entry.correct += value.correct
        merged.set(key, entry)
      }
    }
    const accents = accentsFor(parseLanguage(activeTestLanguage).base).filter((ch) => sequenceFor(ch, activeLayout).length > 0)
    const keys = smartDrillSelection(merged, accents)
    if (!keys) {
      dispatch(addAlert({ message: "Not enough typing data yet - practice a little first!", type: "warning" }))
      return
    }
    setSelectedKeys(keys)
    dispatch(addAlert({ message: `Drilling your toughest keys: ${keys.join(", ")}`, type: "success" }))
  }

  // True when this completion is the re-run of a diagnosed test (same config),
  // so its result should headline the before→after delta.
  const matchedReMeasure = (result: TestCompletionResult): ReMeasureState | null => {
    const pending = reMeasureRef.current
    if (!pending || mode !== TestModes.normal) return null
    const c = pending.config
    const matches =
      subMode === c.subMode &&
      count === c.count &&
      activeTestLanguage === c.language &&
      customLength === c.customLength &&
      (result.punctuation ?? false) === c.punctuation &&
      (result.capitals ?? false) === c.capitals &&
      (result.numbers ?? false) === (c.numbers ?? false)
    return matches ? pending : null
  }

  const onTestComplete = (result: TestCompletionResult) => {
    // A persisted result is the save upgrade for the eager card; ignore it if the
    // user already dismissed/restarted that card (its eager render set the flag).
    if (result.persisted && !cardActiveRef.current) return
    cardActiveRef.current = true
    // Today's coaching adopts a qualifying Test as its measure, however it was
    // launched - the session never demands a run the user just did. Only the
    // eager report records (the persisted upgrade is the same run).
    let adopted = false
    if (!result.persisted && mode === TestModes.normal && (subMode === TestSubModes.timed || subMode === TestSubModes.words)) {
      const scope = sessionData?.user?.id ?? GUEST_DAILY_SCOPE
      const context = { dateKey: localDateKey(), pool: statsPoolFor(activeLayout), language: globalLanguage }
      const daily = readLocalDailySession(scope, context)
      const active = daily ? currentDailyStep(daily) : null
      const run = { subMode: subMode === TestSubModes.timed ? "timed" as const : "words" as const, count }
      if (daily && active && measureQualifies(active.kind, run)) {
        const advanced = recordDailySet(daily, active.id, { netWpm: result.netWpm, accuracy: result.accuracy })
        if (advanced !== daily) {
          writeLocalDailySession(scope, advanced)
          adopted = true
        }
      }
    }
    // Resolve the re-measure offer once, on the first (eager) report; the later
    // save upgrade reuses it so the before→after strip doesn't vanish.
    if (!result.persisted) {
      const reMeasured = matchedReMeasure(result)
      attemptReMeasureRef.current = reMeasured ? { beforeWpm: reMeasured.beforeWpm } : undefined
      if (reMeasured) applyReMeasure(null)
    }
    const score = {
      speed: result.speed,
      rawWpm: result.rawWpm,
      netWpm: result.netWpm,
      accuracy: result.accuracy,
      durationSeconds: result.durationSeconds,
      totalKeystrokes: result.totalKeystrokes,
      correctKeystrokes: result.correctKeystrokes,
      incorrectKeystrokes: result.incorrectKeystrokes,
      promptText: result.promptText,
      typedText: result.typedText,
      typedSegments: result.typedSegments,
      worstKeys: result.worstKeys,
      timeline: result.timeline,
      brag: result.brag ?? null,
      wpmSamples: result.wpmSamples,
      avgDelta: result.avgDelta,
      streak: result.streak,
      punctuation: result.punctuation,
      capitals: result.capitals,
      numbers: result.numbers,
      ranked: result.ranked,
      layout: activeLayout,
      count,
      mode,
      subMode,
      language: activeTestLanguage,
      options: result.levelName,
      createdAt: new Date(),
      testId: result.testId,
      reMeasure: attemptReMeasureRef.current,
    }
    if (adopted && !attemptReMeasureRef.current) {
      // An adopted measure returns straight to the daily hub - /plan shows the
      // recorded step and what's next. The generic score card with a coaching
      // banner bolted on read as two competing screens. The score still saves
      // and the local mirrors below still record. A re-measured run is exempt:
      // its before→after delta is the payoff and must stay on screen.
      void router.replace("/plan")
    } else {
      setCompletedScore(score)
      setShareUrl(undefined)
    }

    const consistency = consistencyFromSamples(result.wpmSamples)

    // Mirror guest results locally so /progress is real from the first test
    // (local-first; signed-in users' trends come from the DB instead).
    if (!sessionData?.user && result.ranked) {
      appendLocalProgress({ wpm: result.speed, accuracy: result.accuracy, c: consistency, t: Date.now(), lang: parseLanguage(activeTestLanguage).base, layout: activeLayout })
    }

    // Only guests stash a pending score (to save once they sign in). Signed-in
    // users persist directly, and their eager (unpersisted) result must not leave
    // a spurious pending-score behind.
    if (!sessionData?.user && !result.persisted && result.typeId) {
      try {
        sessionStorage.setItem("typecafe:pendingScore", JSON.stringify({
          savedAt: Date.now(),
          score,
          createInput: {
            typeId: result.typeId,
            count,
            options: result.levelName ?? "",
            punctuation: result.punctuation,
            capitals: result.capitals,
            numbers: result.numbers,
            timeline: result.timeline,
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
          },
        }))
      } catch {
        // sessionStorage unavailable - not critical
      }
    }
  }

  // When the user signs in (either via OAuth page-reload or in-page modal),
  // restore their unsaved score, persist it to the DB, auto-create a share
  // link, copy it to the clipboard, and navigate to the score page.
  useEffect(() => {
    if (!sessionData?.user) return
    if (hasSavedPendingRef.current) return

    const raw = sessionStorage.getItem("typecafe:pendingScore")
    if (!raw) return

    type PendingScore = {
      savedAt: number
      score: NonNullable<typeof completedScore>
      createInput: Parameters<typeof saveAfterSignIn.mutate>[0]
    }
    let pending: PendingScore
    try {
      pending = JSON.parse(raw) as PendingScore
    } catch {
      sessionStorage.removeItem("typecafe:pendingScore")
      return
    }

    if (Date.now() - pending.savedAt > 30 * 60 * 1000) {
      sessionStorage.removeItem("typecafe:pendingScore")
      return
    }

    hasSavedPendingRef.current = true

    const restoredScore = {
      ...pending.score,
      createdAt: new Date(pending.score.createdAt as unknown as string),
    }

    if (!completedScore) {
      setCompletedScore(restoredScore)
    }

    void saveAfterSignIn.mutateAsync(pending.createInput).then(async (test) => {
      sessionStorage.removeItem("typecafe:pendingScore")
      setCompletedScore((prev) => prev ? { ...prev, testId: test.id, brag: test.brag ?? prev.brag, avgDelta: test.avgDelta ?? prev.avgDelta, streak: test.streak ?? prev.streak } : prev)

      try {
        const { durationSeconds, rawWpm, netWpm, accuracy, totalKeystrokes, correctKeystrokes,
          incorrectKeystrokes, typedText, typedSegments, worstKeys, brag, wpmSamples, punctuation, capitals, numbers, ranked,
          promptText,
        } = restoredScore
        const share = await createShare.mutateAsync({
          testId: test.id,
          snapshot: { durationSeconds, rawWpm, netWpm, accuracy, totalKeystrokes, correctKeystrokes,
            incorrectKeystrokes, promptText, typedText, typedSegments, worstKeys, brag, avgDelta: test.avgDelta, wpmSamples, punctuation, capitals, numbers, ranked, layout: restoredScore.layout },
        })
        const url = `${window.location.origin}/score/${share.slug}`
        setShareUrl(url)
        try { await navigator.clipboard.writeText(url) } catch { /* clipboard blocked */ }
        void router.push(`/score/${share.slug}`)
      } catch {
        // Share creation failed - score is saved, user can share manually
      }
    }).catch(() => {
      hasSavedPendingRef.current = false
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionData?.user?.id])

  const clearCompletedScore = () => {
    cardActiveRef.current = false
    setCompletedScore(null)
    setShareUrl(undefined)
    setIsSavingScore(false)
  }

  const requestRestart = () => {
    clearCompletedScore()
    sessionStorage.removeItem("typecafe:pendingScore")
    hasSavedPendingRef.current = false
    setRestartSignal((signal) => signal + 1)
  }

  // Re-run the diagnosed test on its original config to measure the drill's
  // effect. The offer is kept (not cleared) so this run's result can headline the
  // before→after delta; it's retired in onTestComplete once the delta is shown.
  const handleReMeasure = () => {
    const pending = reMeasureRef.current
    if (!pending) return
    setMode(TestModes.normal)
    setSubMode(pending.config.subMode)
    setCount(pending.config.count)
    setCustomLength(pending.config.customLength)
    setLanguage(pending.config.language)
    setPunctuation(pending.config.punctuation)
    setCapitals(pending.config.capitals)
    setNumbers(pending.config.numbers ?? false)
    clearCompletedScore()
    sessionStorage.removeItem("typecafe:pendingScore")
    hasSavedPendingRef.current = false
    setRestartSignal((signal) => signal + 1)
  }

  // Drill handoff: a diagnosis "Drill these keys" link lands here as
  // /?mode=practice&keys=r,t,b. Switch into Practice with exactly those keys
  // selected, remember the diagnosed test so the re-measure prompt can show a
  // before/after delta (Phase 1.3), then clean the URL so a reload doesn't
  // re-trigger the handoff.
  useEffect(() => {
    if (!router.isReady) return
    if (router.query.mode !== "practice") return

    const rawKeys = typeof router.query.keys === "string"
      ? router.query.keys
      : Array.isArray(router.query.keys) ? router.query.keys.join(",") : ""
    // Practice needs a vowel to form words; a weakness set can be all consonants.
    // Accented letters are drill targets too (weak é from a French test).
    const keys = withPracticeVowel(
      rawKeys
        .split(",")
        .map((key) => key.trim().toLowerCase())
        .filter(isPracticeLetter),
    )

    if (completedScore && completedScore.mode === TestModes.normal) {
      applyReMeasure({
        beforeWpm: completedScore.netWpm,
        config: {
          subMode: completedScore.subMode,
          count: completedScore.count,
          language: completedScore.language,
          customLength: completedScore.ranked === false,
          punctuation: completedScore.punctuation ?? false,
          capitals: completedScore.capitals ?? false,
          numbers: completedScore.numbers ?? false,
          options: completedScore.options ?? "",
        },
      })
    }

    // Mirror Config.handleModeChange's mode-switch resets: Timed/Words is a
    // Normal-only sub-mode, so a non-Normal mode must drop the leftover "timed"
    // subMode (otherwise the timer fires immediately) and take a practice-sized
    // length. The diagnosed config is already saved above for the re-measure.
    updateSetting("mode", TestModes.practice)
    updateSetting("subMode", TestSubModes.words)
    updateSetting("count", 10)
    updateSetting("customLength", false)
    if (keys.length > 0) updateSetting("selectedKeys", keys)

    // Leave the results view and start the drill on the freshly selected keys.
    clearCompletedScore()
    sessionStorage.removeItem("typecafe:pendingScore")
    hasSavedPendingRef.current = false
    setRestartSignal((signal) => signal + 1)

    void router.replace("/", undefined, { shallow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.mode, router.query.keys])

  // Re-measure handoff: /drill's "Re-measure" CTA returns here as /?rm=<token>,
  // carrying the diagnosed test's config. Rebuild the before→after offer, switch
  // into that exact config and start it; onTestComplete then headlines the delta
  // (Phase 1.3 - the loop's payoff, now reached via the unified /drill surface).
  useEffect(() => {
    if (!router.isReady) return
    const raw = typeof router.query.rm === "string" ? router.query.rm : null
    if (!raw) return

    let parsed: Partial<ReMeasureState> | null = null
    try { parsed = JSON.parse(raw) as Partial<ReMeasureState> } catch { parsed = null }
    const config = parsed?.config
    if (parsed && typeof parsed.beforeWpm === "number" && config) {
      applyReMeasure({ beforeWpm: parsed.beforeWpm, config })
      setMode(TestModes.normal)
      setSubMode(config.subMode)
      setCount(config.count)
      setCustomLength(config.customLength)
      setLanguage(config.language)
      setPunctuation(config.punctuation)
      setCapitals(config.capitals)
      setNumbers(config.numbers ?? false)
      clearCompletedScore()
      sessionStorage.removeItem("typecafe:pendingScore")
      hasSavedPendingRef.current = false
      setRestartSignal((signal) => signal + 1)
    }

    void router.replace("/", undefined, { shallow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.rm])

  // Config handoff: a diagnosis or coaching link lands here as
  // /?mode=timed&count=60, /?mode=words&count=25, or /?mode=grams and starts that
  // configured test, then cleans the URL.
  useEffect(() => {
    if (!router.isReady) return
    const mode = router.query.mode
    if (mode !== "timed" && mode !== "words" && mode !== "grams") return

    if (mode === "grams") {
      updateSetting("mode", TestModes.ngrams)
    } else {
      updateSetting("mode", TestModes.normal)
      updateSetting("subMode", mode === "timed" ? TestSubModes.timed : TestSubModes.words)
      const count = Number(router.query.count)
      if (Number.isFinite(count) && count > 0) {
        updateSetting("count", count)
        updateSetting("customLength", false)
      }
    }

    clearCompletedScore()
    sessionStorage.removeItem("typecafe:pendingScore")
    hasSavedPendingRef.current = false
    setGramsHandoffPending(false)
    setRestartSignal((signal) => signal + 1)
    void router.replace("/", undefined, { shallow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.mode, router.query.count])

  const createAndCopyShareLink = async () => {
    if (!completedScore) return undefined

    const {
      durationSeconds,
      rawWpm,
      netWpm,
      accuracy,
      totalKeystrokes,
      correctKeystrokes,
      incorrectKeystrokes,
      typedText,
      promptText,
      typedSegments,
      worstKeys,
      brag,
      avgDelta,
      wpmSamples,
      punctuation,
      capitals,
      numbers,
      ranked,
    } = completedScore
    const baseSnapshot = {
      durationSeconds,
      rawWpm,
      netWpm,
      accuracy,
      totalKeystrokes,
      correctKeystrokes,
      incorrectKeystrokes,
      promptText,
      typedText,
      typedSegments,
      worstKeys,
      brag,
      avgDelta,
      punctuation,
      capitals,
      numbers,
      ranked,
      wpmSamples,
      layout: completedScore.layout,
    }
    // Signed-in: link the share to the saved Test. Guest: mint a snapshot-only
    // share that carries its own render fields (mode/language/count).
    const share = completedScore.testId
      ? await createShare.mutateAsync({ testId: completedScore.testId, snapshot: baseSnapshot })
      : await createGuestScore.mutateAsync({
          snapshot: {
            ...baseSnapshot,
            count: completedScore.count,
            mode: completedScore.mode,
            subMode: completedScore.subMode,
            language: completedScore.language,
            options: completedScore.options,
            speed: completedScore.speed,
            score: completedScore.speed * completedScore.accuracy,
            createdAt: completedScore.createdAt.getTime(),
          },
        })
    const origin = window.location.origin
    const nextShareUrl = `${origin}/score/${share.slug}`
    setShareUrl(nextShareUrl)

    return nextShareUrl
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "TypeCafe",
    "url": "https://typecafe.app",
    "description": SITE_DESCRIPTION,
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Any",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  };
  // The keyboard is practice-only: there it's both the key selector and the
  // feedback surface. Other modes keep the text as the sole hero.
  const shouldShowHomeKeyboard = mode === TestModes.practice

  return (
    <>
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>
      <div id="typer" className={`flex flex-col h-full overflow-auto ${completedScore ? "py-4" : "[justify-content:safe_center]"} ${fullscreen ? 'absolute top-0 left-0 w-full h-full bg-base-100 z-[500] sm:px-8' : 'w-full max-w-screen-xl mx-auto'}`}>
        {/* A real page heading for crawlers + screen readers without disturbing
            the minimal test-first hero (growth-seo §E). */}
        <h1 className="sr-only">TypeCafe - the typing coach that makes you faster</h1>
        {!completedScore && !fullscreen &&
          <HomeCoachTabs className={typingFocusFadeClass(typingFocused, "")} desktop={false} />
        }
        {!completedScore &&
          <div data-testid="typing-focus-home-controls" className={typingFocusFadeClass(typingFocused, "w-full")}>
            {!fullscreen && <FirstVisitPromise />}
            <ModeBar
              mode={mode} subMode={subMode} setMode={setMode}
              setSubMode={setSubMode}
              count={count}
              customLength={customLength}
              language={activeTestLanguage}
              quoteLength={quoteLength}
              setQuoteLength={setQuoteLength}
              selectedKeys={selectedKeys}
              gramSource={gramSource}
              gramScope={gramScope}
              gramCombination={gramCombination}
              gramRepetition={gramRepetition}
              gramWpmThreshold={gramWpmThreshold}
              gramAccuracyThreshold={gramAccuracyThreshold}
              punctuation={punctuation}
              capitals={capitals}
              numbers={numbers}
              onSmartDrill={handleSmartDrill}
              setCount={setCount}
              setCustomLength={setCustomLength}
              setLanguage={setLanguage}
              setGramSource={setGramSource}
              setGramScope={setGramScope}
              setGramCombination={setGramCombination}
              setGramRepetition={setGramRepetition}
              setGramWpmThreshold={setGramWpmThreshold}
              setGramAccuracyThreshold={setGramAccuracyThreshold}
              setPunctuation={setPunctuation}
              setCapitals={setCapitals}
              setNumbers={setNumbers}
              onRestart={requestRestart}
              fullscreen={fullscreen}
              setFullscreen={setFullscreen}
            />
          </div>
        }
        {!completedScore && mode === TestModes.practice && reMeasure &&
          <div
            data-testid="re-measure-prompt"
            className={typingFocusFadeClass(typingFocused, "mx-auto mb-4 flex w-full max-w-2xl flex-col items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left")}
          >
            <div>
              <p className="font-semibold text-base-content">Drilling {selectedKeys.join(", ")}</p>
              <p className="text-sm text-base-content/70">When you&apos;re ready, re-run your test to see the gain.</p>
            </div>
            <button
              type="button"
              onClick={handleReMeasure}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Re-run your test to measure the gain"
            >
              Re-run your test
            </button>
          </div>
        }
        {gramsHandoffPending ? (
          <div className="flex min-h-[16rem] w-full items-center justify-center" role="status" aria-live="polite">
            <div className="h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary"></div>
            <span className="sr-only">Loading…</span>
          </div>
        ) : (
        <Typer
          language={activeTestLanguage}
          quoteLength={quoteLength}
          mode={mode}
          subMode={subMode}
          selectedKeys={selectedKeys}
          setSelectedKeys={setSelectedKeys}
          gramSource={gramSource}
          gramScope={gramScope}
          gramCombination={gramCombination}
          gramRepetition={gramRepetition}
          gramWpmThreshold={gramWpmThreshold}
          gramAccuracyThreshold={gramAccuracyThreshold}
          count={count}
          punctuation={punctuation}
          capitals={capitals}
          numbers={numbers}
          customLength={customLength}
          showStats={true}
          modalOpen={false}
          restartSignal={restartSignal}
          onRestart={clearCompletedScore}
          onTestComplete={onTestComplete}
          eagerResult
          onSavingChange={setIsSavingScore}
          onTypingFocusChange={setTypingFocused}
          charAttemptsRef={charAttemptsRef}
          hideInterface={!!completedScore}
        />
        )}
        {completedScore ?
          <div className="m-auto flex w-full flex-col items-center gap-3">
            <div className="flex w-full justify-center">
              <ShareableScoreCard
                score={{
                  ...completedScore,
                  score: completedScore.speed * completedScore.accuracy,
                  user: {
                    username: sessionData?.user?.username ?? sessionData?.user?.name ?? null,
                    image: sessionData?.user?.image,
                  },
                }}
                shareUrl={shareUrl}
                canCreateShare
                isSaving={isSavingScore}
                isCreatingShare={createShare.isPending || createGuestScore.isPending}
                onCreateShare={createAndCopyShareLink}
                onTestAgain={requestRestart}
              />
            </div>
          </div>
          :
          null
        }
        {!completedScore && shouldShowHomeKeyboard &&
          <div data-testid="typing-focus-home-keyboard" className="min-h-[11rem] md:min-h-[15.25rem]">
            <Keyboard
              mode={mode}
              selectedKeys={selectedKeys}
              setSelectedKeys={setSelectedKeys}
              charAttemptsRef={charAttemptsRef}
              baseAttemptsRef={persistedAttemptsRef}
              speedBars={speedBars}
              shiftToggle={shiftLayer}
              altgrToggle={altgrLayer}
              onToggleShift={() => {
                setShiftToggle((on) => !on)
                setAltgrToggle(false)
              }}
              onToggleAltgr={() => {
                setAltgrToggle((on) => !on)
                setShiftToggle(false)
              }}
              hasAltGr={hasAltGr}
              punctuation={punctuation}
              capitals={capitals}
              numbers={numbers}
              setPunctuation={setPunctuation}
              setCapitals={setCapitals}
              setNumbers={setNumbers}
            />
          </div>
        }
      </div>
    </>
  );
};

export default Home;
