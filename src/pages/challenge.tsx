import { type NextPage } from "next";
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Avatar } from "~/components/Avatar";
import { ShareableScoreCard, type ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import { Typer, type TestCompletionResult } from "~/components/typer/Typer";
import { useRestartShortcut } from "~/components/typer/hooks/useRestartShortcut";
import { typingFocusFadeClass } from "~/components/typer/typingFocus";
import { TestModes, TestSubModes } from "~/components/typer/types";
import { getWords } from "~/components/typer/utils";
import { challengeDateKey, challengeShareBrag, challengeText, formatCountdown, msUntilNextChallenge } from "~/lib/challenge";
import { recordLocalChallenge } from "~/lib/challengeHistory";
import { isAnyModalOpen } from "~/lib/modals";
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
    wpm: number;
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
                    <span className="text-xs font-semibold text-primary">by improvement</span>
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
                            <span className="flex min-w-0 items-center gap-2">
                                <Avatar size={24} image={entry.image} name={entry.username} />
                                <span className="truncate text-sm font-semibold text-base-content">{entry.username}</span>
                            </span>
                            <span className="text-right font-mono text-sm text-base-content">
                                {props.improved && typeof entry.delta === "number" ?
                                    <span className={entry.delta >= 0 ? "text-success" : "text-error"}>
                                        {entry.delta >= 0 ? "+" : ""}{formatNumber(entry.delta, 1)}
                                    </span>
                                    :
                                    formatNumber(entry.wpm, 1)
                                }
                                <span className="ml-1 text-xs text-base-content/50">WPM</span>
                            </span>
                            {props.improved && typeof entry.baseline === "number" &&
                                <span className="col-span-3 pl-11 text-xs text-base-content/55">
                                    Today {formatNumber(entry.wpm, 1)} vs {formatNumber(entry.baseline, 1)} avg
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
    const [restartSignal, setRestartSignal] = useState(0);
    const [completed, setCompleted] = useState<CompletedScore | null>(null);
    const [typingFocused, setTypingFocused] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | undefined>(undefined);
    const [isSavingScore, setIsSavingScore] = useState(false);
    const [dateKey, setDateKey] = useState<string | null>(null);
    // Ticks once a second to drive the "new challenge in …" countdown. Null until
    // mounted so the server/first-client render agree (no hydration mismatch).
    const [nowTs, setNowTs] = useState<number | null>(null);
    const charAttemptsRef = useRef<Map<string, { attempts: number; correct: number }>>(new Map());
    // True while the result card is on screen for the current attempt - guards the
    // async save upgrade from re-showing the card after the user already restarted.
    const cardActiveRef = useRef(false);
    const utils = api.useUtils();
    const createShare = api.scoreShare.create.useMutation();
    const createGuestScore = api.scoreShare.createGuestScore.useMutation();

    useEffect(() => {
        // Synced UTC: one text, one leaderboard, one countdown for everyone. The day
        // rolls over at UTC midnight worldwide (not local midnight), so "everyone
        // types the same text today" is literally true.
        setDateKey(challengeDateKey(new Date()));
    }, []);

    useEffect(() => {
        setNowTs(Date.now());
        const id = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const resetsIn = nowTs !== null ? formatCountdown(msUntilNextChallenge(new Date(nowTs))) : null;

    // Today's challenge is deterministic seeded text from the local calendar day.
    // Every client gets the same 30s text with no network or scheduled job.
    const text = useMemo(() => dateKey ? challengeText(getWords("english").slice(0, 1000), dateKey) : "", [dateKey]);
    const boards = api.test.getDailyChallengeBoards.useQuery(
        { dateKey: dateKey ?? "1970-01-01", limit: 10 },
        { enabled: !!dateKey },
    );

    const onComplete = (result: TestCompletionResult) => {
        // A persisted result is the save upgrade for the eager card; ignore it if
        // the user already dismissed/restarted (its eager render set the flag).
        if (result.persisted && !cardActiveRef.current) return;
        cardActiveRef.current = true;
        // Record the challenge and refresh the boards once - on the first (eager)
        // report - not again when the save settles.
        if (dateKey) {
            // Store net (the canonical WPM) so the guest challenge status/board
            // matches the signed-in path - guests only ever report eagerly.
            if (!result.persisted) {
                recordLocalChallenge({ dateKey, wpm: result.netWpm, accuracy: result.accuracy, t: Date.now() });
            }
            // Refresh on every report: a signed-in user's score only lands in the DB
            // on the persisted upgrade, so the boards must refetch then too -
            // otherwise a replay's new score never shows until a full reload.
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
            promptText: result.promptText,
            typedText: result.typedText,
            typedSegments: result.typedSegments,
            worstKeys: result.worstKeys,
            timeline: result.timeline,
            ranked: result.ranked,
            brag: challengeShareBrag(result.avgDelta),
            avgDelta: result.avgDelta,
            dailyChallenge: true,
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
        cardActiveRef.current = false;
        setCompleted(null);
        setShareUrl(undefined);
        setIsSavingScore(false);
        setRestartSignal((signal) => signal + 1);
    };

    useRestartShortcut(null, playAgain, isAnyModalOpen, { enabled: !!completed });

    const createAndCopyShareLink = async () => {
        if (!completed) return undefined;

        const {
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
            wpmSamples,
            ranked,
        } = completed;

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
            dailyChallenge: true,
            ranked,
            wpmSamples,
        };
        // Signed-in shares link to the saved Test; guests mint a snapshot-only
        // share carrying the daily-challenge render fields.
        const share = completed.testId
            ? await createShare.mutateAsync({ testId: completed.testId, snapshot: baseSnapshot })
            : await createGuestScore.mutateAsync({
                snapshot: {
                    ...baseSnapshot,
                    count: CHALLENGE_SECONDS,
                    mode: completed.mode,
                    subMode: completed.subMode,
                    language: completed.language,
                    speed: completed.speed,
                    score: completed.speed * completed.accuracy,
                    createdAt: completed.createdAt.getTime(),
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
                <meta name="description" content="Today's daily typing challenge - everyone types the same text. Beat your average and climb the daily rankings." />
            </Head>
            <div id="typer" className={`flex h-full flex-col overflow-auto ${completed ? "py-4" : "[justify-content:safe_center]"} w-full max-w-screen-xl mx-auto`}>
                {!dateKey ?
                    <div className="mx-auto w-full max-w-screen-xl px-4 text-center">
                        <h1 className="font-mono text-2xl font-bold tracking-tight">Daily Challenge</h1>
                        <p className="text-sm text-base-content/60">Loading today&apos;s challenge...</p>
                    </div>
                    :
                    <>
                        {!completed &&
                            <div data-testid="challenge-header" className={typingFocusFadeClass(typingFocused, "mx-auto mb-4 w-full max-w-screen-xl text-center")}>
                                <h1 className="font-mono text-2xl font-bold tracking-tight">Daily Challenge</h1>
                                <p className="text-sm text-base-content/60">{dateKey} / 30s / everyone types the same text today</p>
                                {resetsIn &&
                                    <p data-testid="challenge-countdown" className="mt-1 font-mono text-xs text-base-content/45">
                                        new challenge in {resetsIn}
                                    </p>
                                }
                            </div>
                        }
                        <Typer
                            language="english"
                            mode={TestModes.normal}
                            subMode={TestSubModes.timed}
                            count={CHALLENGE_SECONDS}
                            fixedText={text}
                            challengeDate={dateKey}
                            showStats={true}
                            modalOpen={false}
                            restartSignal={restartSignal}
                            onTestComplete={onComplete}
                            eagerResult
                            onSavingChange={setIsSavingScore}
                            onTypingFocusChange={setTypingFocused}
                            charAttemptsRef={charAttemptsRef}
                            hideInterface={!!completed}
                        />
                        {completed &&
                            <div className="m-auto flex w-full justify-center">
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
                                    canCreateShare
                                    isSaving={isSavingScore}
                                    isCreatingShare={createShare.isPending || createGuestScore.isPending}
                                    onCreateShare={createAndCopyShareLink}
                                    onTestAgain={playAgain}
                                />
                            </div>
                        }
                        {/* The Fastest/Most-Improved boards belong to the pre-test view; the
                            result card stands on its own (chip + delta say it's the challenge). */}
                        {!completed &&
                            <div data-testid="daily-challenge-boards" className={typingFocusFadeClass(typingFocused, "mx-auto mt-6 grid w-full max-w-screen-xl gap-4 px-4 pb-8 lg:grid-cols-2")}>
                                <ChallengeBoard
                                    title="Fastest Today"
                                    entries={boards.data?.fastest ?? []}
                                    empty={boards.isLoading ? "Loading today's scores..." : "No challenge scores yet. Claim the first spot."}
                                />
                                <ChallengeBoard
                                    title="Most Improved"
                                    improved
                                    entries={boards.data?.improved ?? []}
                                    empty={boards.isLoading ? "Loading improvement scores..." : "Need 3 prior tests to rank improvement honestly."}
                                />
                            </div>
                        }
                    </>
                }
            </div>
        </>
    );
};

export default Challenge;
