import { type NextPage } from "next";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "~/components/Modal";
import { ShareableScoreCard, type ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import { Keyboard } from "~/components/typer/Keyboard";
import { Typer, type TestCompletionResult } from "~/components/typer/Typer";
import { Config } from "~/components/typer/config/Config";
import { TestGramScopes, TestGramSources, TestModes, TestSubModes } from "~/components/typer/types";
import { api } from "~/utils/api";

const Home: NextPage = () => {
  const [fullscreen, setFullscreen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [showStats, setShowStats] = useState(true)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [language, setLanguage] = useState("english" as string)
  const [mode, setMode] = useState<TestModes>(TestModes.normal)
  const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
  const [selectedKeys, setSelectedKeys] = useState<string[]>("asdfghjkl".split(""))
  const [gramSource, setGramSource] = useState<TestGramSources>(TestGramSources.bigrams)
  const [gramScope, setGramScope] = useState<TestGramScopes>(TestGramScopes.fifty)
  const [gramCombination, setGramCombination] = useState<number>(1)
  const [gramRepetition, setGramRepetition] = useState<number>(0)
  const [gramWpmThreshold, setGramWpmThreshold] = useState<number>(20)
  const [gramAccuracyThreshold, setGramAccuracyThreshold] = useState<number>(100)
  const [count, setCount] = useState(15)
  const [currentKey, setCurrentKey] = useState("")
  const [attemptVersion, setAttemptVersion] = useState(0)
  const [restartSignal, setRestartSignal] = useState(0)
  const [completedScore, setCompletedScore] = useState<(ScoreSnapshot & {
    speed: number;
    count: number;
    mode: TestModes;
    subMode: TestSubModes;
    language: string;
    options?: string;
    createdAt: Date;
    testId?: string;
  }) | null>(null)
  const [shareUrl, setShareUrl] = useState<string | undefined>(undefined)
  const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
  const persistedAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
  const { data: sessionData } = useSession()
  const { data: persistedStats } = api.practiceStats.get.useQuery(undefined, {
    enabled: mode === TestModes.practice && !!sessionData?.user,
  })
  const createShare = api.scoreShare.create.useMutation()

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

  const onKeyChange = (key: string) => {
    setCurrentKey(key)
  }

  const onAttemptChange = () => {
    setAttemptVersion((version) => version + 1)
  }

  const onTestComplete = (result: TestCompletionResult) => {
    setCompletedScore({
      speed: result.speed,
      rawWpm: result.rawWpm,
      netWpm: result.netWpm,
      accuracy: result.accuracy,
      durationSeconds: result.durationSeconds,
      totalKeystrokes: result.totalKeystrokes,
      correctKeystrokes: result.correctKeystrokes,
      incorrectKeystrokes: result.incorrectKeystrokes,
      typedText: result.typedText,
      wpmSamples: result.wpmSamples,
      count,
      mode,
      subMode,
      language,
      options: result.levelName,
      createdAt: new Date(),
      testId: result.testId,
    })
    setShareUrl(undefined)
  }

  const clearCompletedScore = () => {
    setCompletedScore(null)
    setShareUrl(undefined)
  }

  const requestRestart = () => {
    clearCompletedScore()
    setRestartSignal((signal) => signal + 1)
  }

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
      wpmSamples,
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
        typedText,
        wpmSamples,
      },
    })
    const origin = window.location.origin
    const nextShareUrl = `${origin}/score/${share.slug}`
    setShareUrl(nextShareUrl)

    return nextShareUrl
  }

  return (
    <>
      <div id="typer" className={`flex flex-col h-full overflow-auto ${completedScore ? "py-4" : "justify-center"} ${fullscreen ? 'absolute top-0 left-0 w-full h-full bg-base-100 z-[500] sm:px-8' : 'md:w-10/12'}`}>
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
          showStats={showStats}
          showConfig={true}
          modalOpen={modalOpen}
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
      <Modal setModalOpen={(open) => setModalOpen(open)}>
        <Config
          language={language} setLanguage={setLanguage}
          mode={mode} setMode={setMode}
          subMode={subMode} setSubMode={setSubMode}
          selectedKeys={selectedKeys} setSelectedKeys={setSelectedKeys}
          gramSource={gramSource} setGramSource={setGramSource}
          gramScope={gramScope} setGramScope={setGramScope}
          gramCombination={gramCombination} setGramCombination={setGramCombination}
          gramRepetition={gramRepetition} setGramRepetition={setGramRepetition}
          gramWpmThreshold={gramWpmThreshold} setGramWpmThreshold={setGramWpmThreshold}
          gramAccuracyThreshold={gramAccuracyThreshold} setGramAccuracyThreshold={setGramAccuracyThreshold}
          count={count} setCount={setCount}
          showStats={showStats} setShowStats={setShowStats}
          showKeyboard={showKeyboard} setShowKeyboard={setShowKeyboard}
        />
      </Modal>
    </>
  );
};

export default Home;
