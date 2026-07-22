import { type NextPage } from "next";
import Head from "next/head";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { FirstVisitPromise } from "~/components/home/FirstVisitPromise";
import type { ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import { Typer, type TestCompletionResult } from "~/components/typer/Typer";
import { ModeBar } from "~/components/typer/config/ModeBar";
import { typingFocusFadeClass } from "~/components/typer/typingFocus";
import { TestModes, TestSubModes, type QuoteLength } from "~/components/typer/types";
import { useTestSettings } from "~/hooks/useTestSettings";
import { useLanguage } from "~/hooks/useLanguage";
import { useLayout } from "~/hooks/useLayout";
import { clampSize, composeLanguage, parseLanguage } from "~/components/typer/utils";
import type { EvidenceContext } from "~/lib/evidenceContext";
import { appendLocalProgress } from "~/lib/progressHistory";
import { consistencyFromSamples } from "~/lib/stats";
import { api } from "~/utils/api";
import { SITE_DESCRIPTION } from "~/lib/siteMetadata";

// The result card is impossible before a Test completes; keep its sharing and
// diagnosis UI out of the initial typing bundle.
const ShareableScoreCard = dynamic(
  () => import("~/components/scores/ShareableScoreCard").then((module) => module.ShareableScoreCard),
  { ssr: false },
);

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
  } = settings
  const setLanguage = (value: string) => updateSetting("language", value)
  const setQuoteLength = (value: QuoteLength) => updateSetting("quoteLength", value)
  const setMode = (value: TestModes) => updateSetting("mode", value)
  const setSubMode = (value: TestSubModes) => updateSetting("subMode", value)
  const setCount = (value: number) => updateSetting("count", value)
  const setPunctuation = (value: boolean) => updateSetting("punctuation", value)
  const setCapitals = (value: boolean) => updateSetting("capitals", value)
  const setNumbers = (value: boolean) => updateSetting("numbers", value)
  const setCustomLength = (value: boolean) => updateSetting("customLength", value)
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
  const typingFocusedRef = useRef(false)
  const handleTypingFocusChange = useCallback((focused: boolean) => {
    typingFocusedRef.current = focused
    setTypingFocused(focused)
  }, [])
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
  const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
  const hasSavedPendingRef = useRef(false)
  // Invalidates a guest-score import when its restored card is dismissed. The DB
  // save may finish, but stale work must never update a newer result card.
  const pendingScoreFlowRef = useRef(0)
  // True while a result card is on screen for the current attempt. Guards the
  // async save upgrade from re-showing the card after the user already restarted.
  const cardActiveRef = useRef(false)
  // The re-measure offer resolved for the current attempt, kept so the eager and
  // the persisted-upgrade reports both carry it (the offer is retired after the first).
  const attemptReMeasureRef = useRef<{ beforeWpm: number } | undefined>(undefined)
  const { data: sessionData } = useSession()
  const router = useRouter()
  const queryTargetContext: EvidenceContext | null = router.query.target === "endurance" ? "acquisition" : null
  const [targetRunContext, setTargetRunContext] = useState<EvidenceContext | null>(null)
  const runEvidenceContext = targetRunContext ?? queryTargetContext ?? "natural"
  const [activeLayout] = useLayout()
  const createShare = api.scoreShare.create.useMutation()
  const createGuestScore = api.scoreShare.createGuestScore.useMutation()
  const saveAfterSignIn = api.test.create.useMutation()

  const cancelPendingScoreImport = () => {
    pendingScoreFlowRef.current += 1
    sessionStorage.removeItem("typecafe:pendingScore")
    hasSavedPendingRef.current = false
  }

  // Keep the ref, the render state, and sessionStorage in lock-step so the offer
  // survives a reload mid-drill and is read consistently everywhere.
  const applyReMeasure = useCallback((value: ReMeasureState | null) => {
    reMeasureRef.current = value
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
    } catch {
      // Corrupt entry - ignore.
    }
  }, [])

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
    setCompletedScore(score)
    setShareUrl(undefined)

    const consistency = consistencyFromSamples(result.wpmSamples)

    // Mirror guest results locally so /progress is real from the first test
    // (local-first; signed-in users' trends come from the DB instead).
    if (!sessionData?.user && result.ranked) {
      appendLocalProgress({ wpm: result.netWpm, accuracy: result.accuracy, c: consistency, t: Date.now(), lang: parseLanguage(activeTestLanguage).base, layout: activeLayout })
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
  // persist their unsaved guest score to the DB. A full-page OAuth return can
  // resolve the session after the user has already started a new test, so only
  // restore the old result card when the typer is still idle. Importing is not
  // an implicit request to share or navigate away.
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
    const flow = ++pendingScoreFlowRef.current

    const restoredScore = {
      ...pending.score,
      createdAt: new Date(pending.score.createdAt as unknown as string),
    }

    const restoreCard = !completedScore && !typingFocusedRef.current
    if (restoreCard) {
      cardActiveRef.current = true
      setCompletedScore(restoredScore)
    }

    void saveAfterSignIn.mutateAsync(pending.createInput).then((test) => {
      if (pendingScoreFlowRef.current !== flow) return
      sessionStorage.removeItem("typecafe:pendingScore")
      if (restoreCard) {
        setCompletedScore((prev) => prev ? { ...prev, testId: test.id, brag: test.brag ?? prev.brag, avgDelta: test.avgDelta ?? prev.avgDelta, streak: test.streak ?? prev.streak } : prev)
      }
    }).catch(() => {
      if (pendingScoreFlowRef.current === flow) hasSavedPendingRef.current = false
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
    cancelPendingScoreImport()
    setRestartSignal((signal) => signal + 1)
  }

  // Historical Home Practice/Grams links now hand off to the canonical Practice
  // destination. Home itself remains ordinary Tests only.
  useEffect(() => {
    if (!router.isReady) return
    const legacyMode = Array.isArray(router.query.mode) ? router.query.mode[0] : router.query.mode
    if (legacyMode !== "practice" && legacyMode !== "grams") return
    const rawKeys = Array.isArray(router.query.keys) ? router.query.keys.join(",") : router.query.keys
    const destination = legacyMode === "grams"
      ? "/practice?custom=grams"
      : rawKeys
        ? `/practice?target=key&keys=${encodeURIComponent(rawKeys)}&metric=accuracy&policy=acquisition`
        : "/practice?custom=keys"
    void router.replace(destination)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.mode, router.query.keys])

  // Compatibility for historical Re-measure links: rebuild the diagnosed Test's
  // exact ordinary configuration and start it; completion can still show its delta.
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
      cancelPendingScoreImport()
      setRestartSignal((signal) => signal + 1)
    }

    void router.replace("/", undefined, { shallow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.rm])

  // Config handoff: a diagnosis or Target link lands here as a Timed/Words
  // ordinary Test, then cleans the URL.
  useEffect(() => {
    if (!router.isReady) return
    const mode = router.query.mode
    if (mode !== "timed" && mode !== "words") return

    if (router.query.target === "endurance") {
      setTargetRunContext("acquisition")
    }

    updateSetting("mode", TestModes.normal)
    updateSetting("subMode", mode === "timed" ? TestSubModes.timed : TestSubModes.words)
    const count = Number(router.query.count)
    if (Number.isFinite(count) && count > 0) {
      updateSetting("count", count)
      updateSetting("customLength", false)
    }

    clearCompletedScore()
    cancelPendingScoreImport()
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
  return (
    <>
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>
      <div id="typer" className={`flex flex-col h-full overflow-auto ${completedScore ? "py-4" : "[justify-content:safe_center]"} ${!completedScore && !fullscreen ? "translate-y-[clamp(-7rem,calc(700px-100vh),0px)] md:-translate-y-24" : ""} ${fullscreen ? 'absolute top-0 left-0 w-full h-full bg-base-100 z-[500] sm:px-8' : 'w-full max-w-screen-xl mx-auto'}`}>
        {/* A real page heading for crawlers + screen readers without disturbing
            the minimal test-first hero (growth-seo §E). */}
        <h1 className="sr-only">TypeCafe - the typing coach that makes you faster</h1>
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
              punctuation={punctuation}
              capitals={capitals}
              numbers={numbers}
              setCount={setCount}
              setCustomLength={setCustomLength}
              setLanguage={setLanguage}
              setPunctuation={setPunctuation}
              setCapitals={setCapitals}
              setNumbers={setNumbers}
              onRestart={requestRestart}
              fullscreen={fullscreen}
              setFullscreen={setFullscreen}
            />
          </div>
        }
        <Typer
          language={activeTestLanguage}
          quoteLength={quoteLength}
          mode={mode}
          evidenceContext={runEvidenceContext}
          subMode={subMode}
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
          onTypingFocusChange={handleTypingFocusChange}
          charAttemptsRef={charAttemptsRef}
          hideInterface={!!completedScore}
        />
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
      </div>
    </>
  );
};

export default Home;
