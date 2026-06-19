import { type NextPage } from "next";
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { DailyChallengePrompt } from "~/components/challenge/DailyChallengePrompt";
import { ShareableScoreCard, type ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import { Typer, type TestCompletionResult } from "~/components/typer/Typer";
import { TestModes, TestSubModes } from "~/components/typer/types";
import { getWords } from "~/components/typer/utils";
import { DEFAULT_TEST_SETTINGS } from "~/hooks/useTestSettings";
import { challengeDateKey, challengeShareBrag, challengeText } from "~/lib/challenge";
import { recordLocalChallenge } from "~/lib/challengeHistory";
import { api } from "~/utils/api";

const CHALLENGE_SECONDS = 30;

type CompletedScore = ScoreSnapshot & {
    speed: number;
    count: number;
    mode: TestModes;
    subMode: TestSubModes;
    language: string;
    createdAt: Date;
    testId?: string;
    streak?: number | null;
};

type ChallengeEntry = {
    rank: number;
    username: string;
    image?: string | null;
    speed: number;
    accuracy: number;
    delta?: number;
    baseline?: number;
};

function formatNumber(value: number, digits = 1) {
    return value.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    });
}

function ChallengeBoard(props: { title: string; empty: string; entries: ChallengeEntry[]; improved?: boolean }) {
    return (
        <section className="rounded-lg border border-base-content/10 bg-base-100/35 p-4" aria-label={props.title}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-mono text-base font-bold text-base-content">{props.title}</h2>
                {props.improved &&
                    <span className="text-xs font-semibold text-primary">delta board</span>
                }
            </div>
            {props.entries.length === 0 ?
                <p className="text-sm text-base-content/60">{props.empty}</p>
                :
                <ol className="flex flex-col gap-2">
                    {props.entries.map((entry) => (
                        <li
                            key={`${entry.rank}-${entry.username}`}
                            className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-base-content/10 bg-base-200/60 px-3 py-2"
                        >
                            <span className="font-mono text-sm font-bold text-base-content/50">#{entry.rank}</span>
                            <span className="min-w-0 truncate text-sm font-semibold text-base-content">{entry.username}</span>
                            <span className="text-right font-mono text-sm text-base-content">
                                {props.improved && typeof entry.delta === "number" ?
                                    <span className={entry.delta >= 0 ? "text-success" : "text-error"}>
                                        {entry.delta >= 0 ? "+" : ""}{formatNumber(entry.delta, 1)}
                                    </span>
                                    :
                                    formatNumber(entry.speed, 1)
                                }
                                <span className="ml-1 text-xs text-base-content/50">WPM</span>
                            </span>
                            {props.improved && typeof entry.baseline === "number" &&
                                <span className="col-span-3 pl-11 text-xs text-base-content/55">
                                    Today {formatNumber(entry.speed, 1)} vs {formatNumber(entry.baseline, 1)} avg
                                </span>
                            }
                        </li>
                    ))}
                </ol>
            }
        </section>
    );
}

const Challenge: NextPage = () => {
    const { data: session } = useSession();
    const [fullscreen, setFullscreen] = useState(false);
    const [restartSignal, setRestartSignal] = useState(0);
    const [statusRefreshSignal, setStatusRefreshSignal] = useState(0);
    const [completed, setCompleted] = useState<CompletedScore | null>(null);
    const [shareUrl, setShareUrl] = useState<string | undefined>(undefined);
    const [dateKey, setDateKey] = useState<string | null>(null);
    const charAttemptsRef = useRef<Map<string, { attempts: number; correct: number }>>(new Map());
    const utils = api.useUtils();
    const createShare = api.scoreShare.create.useMutation();

    useEffect(() => {
        setDateKey(challengeDateKey(new Date(), -new Date().getTimezoneOffset()));
    }, []);

    // Today's challenge is deterministic seeded text from the local calendar day.
    // Every client gets the same 30s text with no network or scheduled job.
    const text = useMemo(() => dateKey ? challengeText(getWords("english").slice(0, 1000), dateKey) : "", [dateKey]);
    const boards = api.test.getDailyChallengeBoards.useQuery(
        { dateKey: dateKey ?? "1970-01-01", limit: 10 },
        { enabled: !!dateKey },
    );

    const onComplete = (result: TestCompletionResult) => {
        if (dateKey) {
            recordLocalChallenge({ dateKey, wpm: result.speed, accuracy: result.accuracy, t: Date.now() });
            setStatusRefreshSignal((signal) => signal + 1);
            void utils.test.getDailyChallengeStatus.invalidate({ dateKey });
            void utils.test.getDailyChallengeBoards.invalidate({ dateKey, limit: 10 });
        }
        setCompleted({
            speed: result.speed,
            rawWpm: result.rawWpm,
            netWpm: result.netWpm,
            accuracy: result.accuracy,
            durationSeconds: result.durationSeconds,
            totalKeystrokes: result.totalKeystrokes,
            correctKeystrokes: result.correctKeystrokes,
            incorrectKeystrokes: result.incorrectKeystrokes,
            typedText: result.typedText,
            typedSegments: result.typedSegments,
            worstKeys: result.worstKeys,
            timeline: result.timeline,
            brag: challengeShareBrag(result.avgDelta),
            avgDelta: result.avgDelta,
            streak: result.streak,
            wpmSamples: result.wpmSamples,
            count: CHALLENGE_SECONDS,
            mode: TestModes.normal,
            subMode: TestSubModes.timed,
            language: "english",
            createdAt: new Date(),
            testId: result.testId,
        });
        setShareUrl(undefined);
    };

    const playAgain = () => {
        setCompleted(null);
        setShareUrl(undefined);
        setRestartSignal((signal) => signal + 1);
    };

    const createAndCopyShareLink = async () => {
        if (!completed?.testId) return undefined;

        const {
            durationSeconds,
            rawWpm,
            netWpm,
            accuracy,
            totalKeystrokes,
            correctKeystrokes,
            incorrectKeystrokes,
            typedText,
            typedSegments,
            worstKeys,
            brag,
            avgDelta,
            wpmSamples,
            ranked,
        } = completed;

        const share = await createShare.mutateAsync({
            testId: completed.testId,
            snapshot: {
                durationSeconds,
                rawWpm,
                netWpm,
                accuracy,
                totalKeystrokes,
                correctKeystrokes,
                incorrectKeystrokes,
                typedText,
                typedSegments,
                worstKeys,
                brag,
                avgDelta,
                ranked,
                wpmSamples,
            },
        });
        const nextShareUrl = `${window.location.origin}/score/${share.slug}`;
        setShareUrl(nextShareUrl);

        return nextShareUrl;
    };

    return (
        <>
            <Head>
                <title>Daily Challenge - TypeCafe</title>
                <meta name="description" content="Today's daily typing challenge - everyone types the same text. Beat your average and climb the daily board." />
            </Head>
            <div id="typer" className={`flex h-full flex-col overflow-auto ${completed ? "py-4" : "[justify-content:safe_center]"} md:w-10/12`}>
                {!dateKey ?
                    <div className="mx-auto w-full max-w-screen-xl px-4 text-center">
                        <h1 className="font-mono text-2xl font-bold tracking-tight">Daily Challenge</h1>
                        <p className="text-sm text-base-content/60">Loading today&apos;s challenge...</p>
                    </div>
                    :
                    <>
                        {!completed &&
                            <div data-testid="challenge-header" className="mx-auto mb-4 w-full max-w-screen-xl text-center">
                                <h1 className="font-mono text-2xl font-bold tracking-tight">Daily Challenge</h1>
                                <p className="text-sm text-base-content/60">{dateKey} / 30s / everyone types the same text today</p>
                            </div>
                        }
                        <Typer
                            fullscreen={fullscreen}
                            setFullscreen={setFullscreen}
                            language="english"
                            mode={TestModes.normal}
                            subMode={TestSubModes.timed}
                            count={CHALLENGE_SECONDS}
                            fixedText={text}
                            challengeDate={dateKey}
                            gramSource={DEFAULT_TEST_SETTINGS.gramSource}
                            gramScope={DEFAULT_TEST_SETTINGS.gramScope}
                            gramCombination={DEFAULT_TEST_SETTINGS.gramCombination}
                            gramRepetition={DEFAULT_TEST_SETTINGS.gramRepetition}
                            gramWpmThreshold={DEFAULT_TEST_SETTINGS.gramWpmThreshold}
                            gramAccuracyThreshold={DEFAULT_TEST_SETTINGS.gramAccuracyThreshold}
                            showStats={true}
                            showConfig={false}
                            showControls={false}
                            modalOpen={false}
                            onKeyChange={() => undefined}
                            restartSignal={restartSignal}
                            onTestComplete={onComplete}
                            charAttemptsRef={charAttemptsRef}
                            hideInterface={!!completed}
                        />
                        {completed &&
                            <div className="m-auto flex w-full flex-col items-center gap-4">
                                <DailyChallengePrompt className="w-full max-w-3xl" refreshSignal={statusRefreshSignal} />
                                <div className="flex w-full justify-center">
                                    <ShareableScoreCard
                                        score={{
                                            ...completed,
                                            score: completed.speed * completed.accuracy,
                                            user: {
                                                username: session?.user?.username ?? session?.user?.name ?? null,
                                                image: session?.user?.image,
                                            },
                                        }}
                                        shareUrl={shareUrl}
                                        canCreateShare={!!completed.testId}
                                        signInHtmlFor="signInModal"
                                        isCreatingShare={createShare.isPending}
                                        onCreateShare={createAndCopyShareLink}
                                        onTestAgain={playAgain}
                                    />
                                </div>
                            </div>
                        }
                        <div data-testid="daily-challenge-boards" className="mx-auto mt-6 grid w-full max-w-screen-xl gap-4 px-4 pb-8 lg:grid-cols-2">
                            <ChallengeBoard
                                title="Fastest Today"
                                entries={boards.data?.fastest ?? []}
                                empty={boards.isLoading ? "Loading today's scores..." : "No challenge scores yet. Claim the first spot."}
                            />
                            <ChallengeBoard
                                title="Most Improved"
                                improved
                                entries={boards.data?.improved ?? []}
                                empty={boards.isLoading ? "Loading improvement deltas..." : "Need 3 prior tests to rank improvement honestly."}
                            />
                        </div>
                    </>
                }
            </div>
        </>
    );
};

export default Challenge;
