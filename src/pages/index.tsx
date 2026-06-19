import { type NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { DailyChallengePrompt } from "~/components/challenge/DailyChallengePrompt";
import { ShareableScoreCard, type ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import { Keyboard } from "~/components/typer/Keyboard";
import { Typer, type TestCompletionResult } from "~/components/typer/Typer";
import { ModeBar } from "~/components/typer/config/ModeBar";
import { TestModes, TestSubModes, type TestGramScopes, type TestGramSources } from "~/components/typer/types";
import { useTestSettings } from "~/hooks/useTestSettings";
import { withPracticeVowel } from "~/lib/diagnosis";
import { appendLocalProgress } from "~/lib/progressHistory";
import { consistencyFromSamples } from "~/lib/stats";
import { api } from "~/utils/api";

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
    options: string;
  };
}

const RE_MEASURE_KEY = "typecafe:reMeasure";
const RE_MEASURE_TTL_MS = 60 * 60 * 1000;

const Home: NextPage = () => {
  const [fullscreen, setFullscreen] = useState(false)
  const { settings, updateSetting } = useTestSettings()
  const {
    mode, subMode, language, count, customLength, punctuation, capitals,
    selectedKeys, gramSource, gramScope, gramCombination, gramRepetition,
    gramWpmThreshold, gramAccuracyThreshold, showStats, showKeyboard,
  } = settings
  const setShowStats = (value: boolean) => updateSetting("showStats", value)
  const setShowKeyboard = (value: boolean) => updateSetting("showKeyboard", value)
  const setLanguage = (value: string) => updateSetting("language", value)
  const setMode = (value: TestModes) => updateSetting("mode", value)
  const setSubMode = (value: TestSubModes) => updateSetting("subMode", value)
  const setSelectedKeys = (value: string[]) => updateSetting("selectedKeys", value)
  const setCount = (value: number) => updateSetting("count", value)
  const setPunctuation = (value: boolean) => updateSetting("punctuation", value)
  const setCapitals = (value: boolean) => updateSetting("capitals", value)
  const setCustomLength = (value: boolean) => updateSetting("customLength", value)
  const setGramSource = (value: TestGramSources) => updateSetting("gramSource", value)
  const setGramScope = (value: TestGramScopes) => updateSetting("gramScope", value)
  const setGramCombination = (value: number) => updateSetting("gramCombination", value)
  const setGramRepetition = (value: number) => updateSetting("gramRepetition", value)
  const setGramWpmThreshold = (value: number) => updateSetting("gramWpmThreshold", value)
  const setGramAccuracyThreshold = (value: number) => updateSetting("gramAccuracyThreshold", value)
  const [currentKey, setCurrentKey] = useState("")
  const currentKeyRef = useRef("")
  const [attemptVersion, setAttemptVersion] = useState(0)
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
    ranked?: boolean;
    createdAt: Date;
    testId?: string;
    streak?: number | null;
    reMeasure?: { beforeWpm: number };
  }) | null>(null)
  const [shareUrl, setShareUrl] = useState<string | undefined>(undefined)
  // The pending re-measure offer. The ref is the synchronous source of truth (read
  // inside completion handling); the state drives the drill-view prompt's render.
  const reMeasureRef = useRef<ReMeasureState | null>(null)
  const [reMeasure, setReMeasure] = useState<ReMeasureState | null>(null)
  const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
  const persistedAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
  const hasSavedPendingRef = useRef(false)
  const { data: sessionData } = useSession()
  const router = useRouter()
  const { data: persistedStats } = api.practiceStats.get.useQuery(undefined, {
    enabled: mode === TestModes.practice && !!sessionData?.user,
  })
  const createShare = api.scoreShare.create.useMutation()
  const saveAfterSignIn = api.test.create.useMutation()

  useEffect(() => {
    if (mode !== TestModes.practice || !persistedStats) return

    persistedAttemptsRef.current.clear()
    persistedStats.forEach((stat) => {
      persistedAttemptsRef.current.set(stat.character, {
        attempts: stat.total,
        correct: stat.correct,
      })
    })
    setAttemptVersion((version) => version + 1)
  }, [mode, persistedStats])

  // Keep the ref, the render state, and sessionStorage in lock-step so the offer
  // survives a reload mid-drill and is read consistently everywhere.
  const applyReMeasure = useCallback((value: ReMeasureState | null) => {
    reMeasureRef.current = value
    setReMeasure(value)
    try {
      if (value) sessionStorage.setItem(RE_MEASURE_KEY, JSON.stringify({ savedAt: Date.now(), ...value }))
      else sessionStorage.removeItem(RE_MEASURE_KEY)
    } catch {
      // sessionStorage unavailable — the prompt just won't survive a reload.
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
      // Corrupt entry — ignore.
    }
  }, [])

  const onKeyChange = (key: string) => {
    if (currentKeyRef.current === key) return
    currentKeyRef.current = key
    setCurrentKey(key)
  }

  const onAttemptChange = () => {
    setAttemptVersion((version) => version + 1)
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
      language === c.language &&
      customLength === c.customLength &&
      (result.punctuation ?? false) === c.punctuation &&
      (result.capitals ?? false) === c.capitals
    return matches ? pending : null
  }

  const onTestComplete = (result: TestCompletionResult) => {
    const reMeasured = matchedReMeasure(result)
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
      ranked: result.ranked,
      count,
      mode,
      subMode,
      language,
      options: result.levelName,
      createdAt: new Date(),
      testId: result.testId,
      reMeasure: reMeasured ? { beforeWpm: reMeasured.beforeWpm } : undefined,
    }
    // The delta has now been captured onto the result; retire the offer so it
    // shows exactly once.
    if (reMeasured) applyReMeasure(null)
    setCompletedScore(score)
    setShareUrl(undefined)

    const consistency = consistencyFromSamples(result.wpmSamples)

    // Mirror guest results locally so /progress is real from the first test
    // (local-first; signed-in users' trends come from the DB instead).
    if (!sessionData?.user) {
      appendLocalProgress({ wpm: result.speed, accuracy: result.accuracy, c: consistency, t: Date.now() })
    }

    if (!result.persisted && result.typeId) {
      try {
        sessionStorage.setItem("typecafe:pendingScore", JSON.stringify({
          savedAt: Date.now(),
          score,
          createInput: {
            typeId: result.typeId,
            speed: result.speed,
            accuracy: result.accuracy,
            consistency,
            score: result.speed * result.accuracy,
            count,
            options: result.levelName ?? "",
            punctuation: result.punctuation,
            capitals: result.capitals,
            ranked: result.ranked,
          },
        }))
      } catch {
        // sessionStorage unavailable — not critical
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
          incorrectKeystrokes, typedText, typedSegments, worstKeys, brag, wpmSamples, punctuation, capitals, ranked,
          promptText,
        } = restoredScore
        const share = await createShare.mutateAsync({
          testId: test.id,
          snapshot: { durationSeconds, rawWpm, netWpm, accuracy, totalKeystrokes, correctKeystrokes,
            incorrectKeystrokes, promptText, typedText, typedSegments, worstKeys, brag, avgDelta: test.avgDelta, wpmSamples, punctuation, capitals, ranked },
        })
        const url = `${window.location.origin}/score/${share.slug}`
        setShareUrl(url)
        try { await navigator.clipboard.writeText(url) } catch { /* clipboard blocked */ }
        void router.push(`/score/${share.slug}`)
      } catch {
        // Share creation failed — score is saved, user can share manually
      }
    }).catch(() => {
      hasSavedPendingRef.current = false
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionData?.user?.id])

  const clearCompletedScore = () => {
    setCompletedScore(null)
    setShareUrl(undefined)
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
    const keys = withPracticeVowel(
      rawKeys
        .split(",")
        .map((key) => key.trim().toLowerCase())
        .filter((key) => /^[a-z]$/.test(key)),
    )

    if (completedScore && completedScore.mode === TestModes.normal) {
      applyReMeasure({
        beforeWpm: completedScore.rawWpm,
        config: {
          subMode: completedScore.subMode,
          count: completedScore.count,
          language: completedScore.language,
          customLength: completedScore.ranked === false,
          punctuation: completedScore.punctuation ?? false,
          capitals: completedScore.capitals ?? false,
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

  // Config handoff (Phase 4 plans): a plan/coach link lands here as
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
    setRestartSignal((signal) => signal + 1)
    void router.replace("/", undefined, { shallow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.mode, router.query.count])

  const createAndCopyShareLink = async () => {
    if (!completedScore?.testId) return undefined

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
      ranked,
    } = completedScore
    const share = await createShare.mutateAsync({
      testId: completedScore.testId,
      snapshot: {
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
        ranked,
        wpmSamples,
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
    "description": "A user-centered typing test with a clean, aesthetic feel. Level up your typing and track your progress.",
    "applicationCategory": "UtilitiesApplication",
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
      <div id="typer" className={`flex flex-col h-full overflow-auto ${completedScore ? "py-4" : "[justify-content:safe_center]"} ${fullscreen ? 'absolute top-0 left-0 w-full h-full bg-base-100 z-[500] sm:px-8' : 'md:w-10/12'}`}>
        {!completedScore && !fullscreen &&
          <DailyChallengePrompt className="mx-auto mb-4 w-full max-w-screen-xl" />
        }
        {!completedScore &&
          <ModeBar
            mode={mode} subMode={subMode} setMode={setMode}
            setSubMode={setSubMode}
            count={count}
            customLength={customLength}
            language={language}
            selectedKeys={selectedKeys}
            gramSource={gramSource}
            gramScope={gramScope}
            gramCombination={gramCombination}
            gramRepetition={gramRepetition}
            gramWpmThreshold={gramWpmThreshold}
            gramAccuracyThreshold={gramAccuracyThreshold}
            punctuation={punctuation}
            capitals={capitals}
            showStats={showStats}
            showKeyboard={showKeyboard}
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
            setShowStats={setShowStats}
            setShowKeyboard={setShowKeyboard}
            onRestart={requestRestart}
            fullscreen={fullscreen}
            setFullscreen={setFullscreen}
          />
        }
        {!completedScore && mode === TestModes.practice && reMeasure &&
          <div
            data-testid="re-measure-prompt"
            className="mx-auto mb-4 flex w-full max-w-2xl flex-col items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left"
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
        <Typer
          fullscreen={fullscreen}
          setFullscreen={(full) => setFullscreen(full)}
          language={language}
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
          customLength={customLength}
          showStats={showStats}
          showConfig={false}
          showControls={false}
          modalOpen={false}
          onKeyChange={onKeyChange}
          onAttemptChange={onAttemptChange}
          restartSignal={restartSignal}
          onRestart={clearCompletedScore}
          onTestComplete={onTestComplete}
          charAttemptsRef={charAttemptsRef}
          hideInterface={!!completedScore}
        />
        {completedScore ?
          <div className="m-auto flex w-full justify-center">
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
              canCreateShare={!!completedScore.testId}
              signInHtmlFor="signInModal"
              isCreatingShare={createShare.isPending}
              onCreateShare={createAndCopyShareLink}
              onTestAgain={requestRestart}
            />
          </div>
          :
          null
        }
        {!completedScore && (showKeyboard || mode === TestModes.practice) &&
          <Keyboard mode={mode} currentKey={currentKey} selectedKeys={selectedKeys} setSelectedKeys={setSelectedKeys} charAttemptsRef={charAttemptsRef} baseAttemptsRef={persistedAttemptsRef} attemptVersion={attemptVersion} />
        }
      </div>
    </>
  );
};

export default Home;
