import { type GetServerSideProps, type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useRef, useState } from "react";

import { KeyHeatmap } from "~/components/heatmap/KeyHeatmap";
import { ShareableScoreCard, type ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import { ProgressShareCard, isProgressSnapshot } from "~/components/scores/ProgressShareCard";
import { Typer, type TestCompletionResult } from "~/components/typer/Typer";
import { typingFocusFadeClass } from "~/components/typer/typingFocus";
import type { TestModes, TestSubModes } from "~/components/typer/types";
import { DEFAULT_TEST_SETTINGS } from "~/hooks/useTestSettings";
import { beatRunAttemptLabel, beatRunBrag, firstDivergenceWord } from "~/lib/beatRun";
import { getShareForOg, type OgShareData } from "~/server/og/scoreData";
import { api } from "~/utils/api";

interface ShareMeta {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
}

interface SharedScorePageProps {
  slug: string;
  meta: ShareMeta;
}

function isScoreSnapshot(value: unknown): value is ScoreSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ScoreSnapshot>;

  return typeof snapshot.durationSeconds === "number" &&
    typeof snapshot.rawWpm === "number" &&
    typeof snapshot.netWpm === "number" &&
    typeof snapshot.accuracy === "number" &&
    typeof snapshot.totalKeystrokes === "number" &&
    typeof snapshot.correctKeystrokes === "number" &&
    typeof snapshot.incorrectKeystrokes === "number" &&
    typeof snapshot.typedText === "string" &&
    Array.isArray(snapshot.wpmSamples);
}

interface BeatRunSnapshot extends ScoreSnapshot {
  promptText: string;
  speed?: number;
  score?: number;
  count: number;
  mode: TestModes;
  subMode: TestSubModes;
  language: string;
  options?: string;
  username?: string | null;
  sourceShareSlug?: string;
  attemptNumber?: number;
  createdAt: number;
}

function isBeatRunSnapshot(value: unknown): value is BeatRunSnapshot {
  if (!isScoreSnapshot(value)) return false;
  const snapshot = value as Partial<BeatRunSnapshot>;
  return typeof snapshot.promptText === "string" &&
    snapshot.promptText.length > 0 &&
    typeof snapshot.count === "number" &&
    typeof snapshot.mode === "number" &&
    typeof snapshot.subMode === "number" &&
    typeof snapshot.language === "string" &&
    typeof snapshot.createdAt === "number";
}

type BeatTarget = BeatRunSnapshot & {
  id?: string;
  user?: {
    username: string | null;
    image?: string | null;
  };
};

function scoreFromBeatTarget(target: BeatTarget) {
  return {
    ...target,
    id: target.id,
    speed: target.speed ?? target.rawWpm,
    score: target.score ?? target.rawWpm * target.accuracy,
    count: target.count,
    mode: target.mode,
    subMode: target.subMode,
    language: target.language,
    options: target.options,
    createdAt: new Date(target.createdAt),
    user: target.user ?? { username: target.username ?? null },
  };
}

function readBeatAttemptCount(slug: string): number {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(`typecafe:beatRunAttempts:${slug}`));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function writeBeatAttemptCount(slug: string, count: number) {
  try {
    window.localStorage.setItem(`typecafe:beatRunAttempts:${slug}`, String(count));
  } catch {
    // localStorage unavailable: retry honesty is best-effort for guests.
  }
}

function attemptsFromPromptSegments(promptText: string, typedSegments: ScoreSnapshot["typedSegments"]) {
  const attempts = new Map<string, { attempts: number; correct: number }>();
  typedSegments?.forEach((segment, index) => {
    const expected = promptText[index] ?? segment.ch;
    const entry = attempts.get(expected) ?? { attempts: 0, correct: 0 };
    entry.attempts += 1;
    if (segment.correct && segment.ch === expected) entry.correct += 1;
    attempts.set(expected, entry);
  });
  return attempts;
}

function BeatRunCta(props: { slug: string; target: BeatTarget }) {
  return (
    <section data-testid="beat-run-cta" className="w-full max-w-7xl px-4 sm:px-6">
      <div className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/10 p-4 text-base-content md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold">Beat this run</h1>
          <p className="mt-1 text-sm text-base-content/65">
            Same text, same format. Their mark: {props.target.rawWpm.toFixed(1)} WPM at {props.target.accuracy.toFixed(1)}%.
          </p>
        </div>
        <Link
          className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          href={`/score/${props.slug}?type=1`}
        >
          Type this yourself
        </Link>
      </div>
    </section>
  );
}

function BeatRunChallenge(props: { slug: string; target: BeatTarget }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [restartSignal, setRestartSignal] = useState(0);
  const [completed, setCompleted] = useState<(ScoreSnapshot & {
    speed: number;
    score: number;
    count: number;
    mode: TestModes;
    subMode: TestSubModes;
    language: string;
    options?: string;
    createdAt: Date;
    attemptNumber: number;
  }) | null>(null);
  const [typingFocused, setTypingFocused] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | undefined>(undefined);
  const charAttemptsRef = useRef<Map<string, { attempts: number; correct: number }>>(new Map());
  const createBeatRun = api.scoreShare.createBeatRun.useMutation();

  const resetRun = () => {
    setCompleted(null);
    setShareUrl(undefined);
    setRestartSignal((signal) => signal + 1);
  };

  const onComplete = (result: TestCompletionResult) => {
    const attemptNumber = readBeatAttemptCount(props.slug) + 1;
    writeBeatAttemptCount(props.slug, attemptNumber);
    const deltaWpm = result.rawWpm - props.target.rawWpm;

    setCompleted({
      durationSeconds: result.durationSeconds,
      rawWpm: result.rawWpm,
      netWpm: result.netWpm,
      accuracy: result.accuracy,
      totalKeystrokes: result.totalKeystrokes,
      correctKeystrokes: result.correctKeystrokes,
      incorrectKeystrokes: result.incorrectKeystrokes,
      promptText: props.target.promptText,
      typedText: result.typedText,
      typedSegments: result.typedSegments,
      worstKeys: result.worstKeys,
      timeline: result.timeline,
      ranked: result.ranked,
      brag: beatRunBrag(deltaWpm, attemptNumber),
      wpmSamples: result.wpmSamples,
      speed: result.speed,
      score: result.speed * result.accuracy,
      count: props.target.count,
      mode: props.target.mode,
      subMode: props.target.subMode,
      language: props.target.language,
      options: props.target.options,
      createdAt: new Date(),
      attemptNumber,
    });
    setShareUrl(undefined);
  };

  const createAndCopyBeatLink = async () => {
    if (!completed) return undefined;
    const share = await createBeatRun.mutateAsync({
      snapshot: {
        durationSeconds: completed.durationSeconds,
        rawWpm: completed.rawWpm,
        netWpm: completed.netWpm,
        accuracy: completed.accuracy,
        totalKeystrokes: completed.totalKeystrokes,
        correctKeystrokes: completed.correctKeystrokes,
        incorrectKeystrokes: completed.incorrectKeystrokes,
        promptText: props.target.promptText,
        typedText: completed.typedText,
        typedSegments: completed.typedSegments,
        worstKeys: completed.worstKeys,
        brag: completed.brag,
        wpmSamples: completed.wpmSamples,
        ranked: completed.ranked,
        count: props.target.count,
        mode: props.target.mode,
        subMode: props.target.subMode,
        language: props.target.language,
        options: props.target.options,
        score: completed.score,
        sourceShareSlug: props.slug,
        attemptNumber: completed.attemptNumber,
        createdAt: completed.createdAt.getTime(),
      },
    });
    const nextShareUrl = `${window.location.origin}/score/${share.slug}`;
    setShareUrl(nextShareUrl);
    return nextShareUrl;
  };

  const divergence = completed ? firstDivergenceWord(props.target.promptText, completed.typedSegments ?? []) : null;
  const deltaWpm = completed ? completed.rawWpm - props.target.rawWpm : 0;
  const deltaAccuracy = completed ? completed.accuracy - props.target.accuracy : 0;
  const targetAttempts = completed ? attemptsFromPromptSegments(props.target.promptText, props.target.typedSegments) : new Map<string, { attempts: number; correct: number }>();
  const challengerAttempts = completed ? attemptsFromPromptSegments(props.target.promptText, completed.typedSegments) : new Map<string, { attempts: number; correct: number }>();

  return (
    <div id="typer" className={`flex h-full w-full flex-col overflow-auto ${completed ? "py-4" : "[justify-content:safe_center]"} md:w-10/12`}>
      {!completed &&
        <>
          <div data-testid="beat-run-header" className={typingFocusFadeClass(typingFocused, "mx-auto mb-4 w-full max-w-screen-xl text-center")}>
            <h1 className="font-mono text-2xl font-bold tracking-tight">Beat this run</h1>
            <p className="text-sm text-base-content/60">
              Target: {props.target.rawWpm.toFixed(1)} WPM / {props.target.accuracy.toFixed(1)}% accuracy
            </p>
          </div>
          <Typer
            fullscreen={fullscreen}
            setFullscreen={setFullscreen}
            language={props.target.language}
            mode={props.target.mode}
            subMode={props.target.subMode}
            count={props.target.count}
            fixedText={props.target.promptText}
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
            onTypingFocusChange={setTypingFocused}
            charAttemptsRef={charAttemptsRef}
          />
        </>
      }
      {completed &&
        <div className="m-auto flex w-full flex-col items-center gap-4">
          <section data-testid="beat-run-comparison" className="w-full max-w-3xl rounded-lg border border-base-content/10 bg-base-200/70 p-5 text-base-content">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="font-mono text-xl font-bold">Beat-my-run result</h1>
                <p data-testid="beat-attempt" className="mt-1 text-sm font-semibold text-primary">{beatRunAttemptLabel(completed.attemptNumber)}</p>
              </div>
              <button
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-base-content/15 bg-base-100/50 px-4 py-2 text-sm font-semibold text-base-content transition hover:bg-base-300"
                type="button"
                onClick={resetRun}
              >
                Try again
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-base-content/10 bg-base-100/45 p-4">
                <p className="text-xs font-semibold uppercase text-base-content/55">Target</p>
                <p className="mt-1 font-mono text-2xl font-bold">{props.target.rawWpm.toFixed(1)} WPM</p>
                <p className="text-sm text-base-content/65">{props.target.accuracy.toFixed(1)}% accuracy</p>
              </div>
              <div className="rounded-md border border-base-content/10 bg-base-100/45 p-4">
                <p className="text-xs font-semibold uppercase text-base-content/55">You</p>
                <p className="mt-1 font-mono text-2xl font-bold">{completed.rawWpm.toFixed(1)} WPM</p>
                <p className="text-sm text-base-content/65">{completed.accuracy.toFixed(1)}% accuracy</p>
              </div>
              <div className="rounded-md border border-base-content/10 bg-base-100/45 p-4">
                <p className="text-xs font-semibold uppercase text-base-content/55">Improvement</p>
                <p data-testid="beat-wpm-delta" className={`mt-1 font-mono text-2xl font-bold ${deltaWpm >= 0 ? "text-success" : "text-error"}`}>
                  {deltaWpm >= 0 ? "+" : ""}{deltaWpm.toFixed(1)} WPM
                </p>
                <p className={deltaAccuracy >= 0 ? "text-sm text-success" : "text-sm text-error"}>
                  {deltaAccuracy >= 0 ? "+" : ""}{deltaAccuracy.toFixed(1)} accuracy
                </p>
              </div>
            </div>
            <p data-testid="beat-divergence" className="mt-4 text-sm text-base-content/70">
              {divergence ? `First divergence: ${divergence}` : "Clean run: no incorrect characters before completion."}
            </p>
            <div data-testid="beat-heatmap-comparison" className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-base-content/55">Target key map</p>
                <KeyHeatmap size="mini" attempts={targetAttempts} />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-base-content/55">Your key map</p>
                <KeyHeatmap size="mini" attempts={challengerAttempts} />
              </div>
            </div>
          </section>
          <ShareableScoreCard
            score={{
              ...completed,
              user: { username: null },
            }}
            shareUrl={shareUrl}
            canCreateShare
            isCreatingShare={createBeatRun.isPending}
            onCreateShare={createAndCopyBeatLink}
            onTestAgain={resetRun}
          />
        </div>
      }
    </div>
  );
}

const SharedScorePage: NextPage<SharedScorePageProps> = ({ slug, meta }) => {
  const router = useRouter();
  const typingBeatRun = router.query.type === "1";
  const shareUrl = typeof window !== "undefined" && slug ? `${window.location.origin}/score/${slug}` : meta.pageUrl;

  const { data, isLoading, isError, error } = api.scoreShare.get.useQuery({ slug }, {
    enabled: !!slug,
    retry: false,
  });

  let body: React.ReactNode;

  if (isLoading || !slug) {
    body = (
      <div className="flex h-full w-full items-center justify-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border border-solid border-primary border-t-transparent" />
      </div>
    );
  } else if (isError || !data) {
    body = (
      <div className="flex h-full w-full items-center justify-center overflow-auto px-4 py-8">
        <section className="w-full max-w-xl rounded-lg bg-base-200 p-6 text-center">
          <h1 className="text-2xl font-bold">Score unavailable</h1>
          <p className="mt-3 opacity-75">
            {error?.message ?? "This shared score is invalid, expired, or no longer available."}
          </p>
          <Link className="btn btn-primary btn-sm mt-6" href="/">
            Try TypeCafe
          </Link>
        </section>
      </div>
    );
  } else if (data.kind === "progress" && isProgressSnapshot(data.snapshot)) {
    body = (
      <div className="flex h-full w-full overflow-auto px-4 py-8">
        <div className="m-auto flex w-full justify-center">
          <ProgressShareCard snapshot={data.snapshot} shareUrl={shareUrl} />
        </div>
      </div>
    );
  } else if (data.kind === "beat" && isBeatRunSnapshot(data.snapshot)) {
    const beatSnapshot = data.snapshot as BeatRunSnapshot;
    const target: BeatTarget = {
      ...beatSnapshot,
      id: `beat-${slug}`,
      speed: beatSnapshot.rawWpm,
      score: beatSnapshot.score ?? beatSnapshot.rawWpm * beatSnapshot.accuracy,
      user: data.user ?? { username: beatSnapshot.username ?? null },
    };

    body = typingBeatRun ? (
      <BeatRunChallenge slug={slug} target={target} />
    ) : (
      <div className="flex h-full w-full overflow-auto px-4 py-8">
        <div className="m-auto flex w-full flex-col items-center gap-4">
          <BeatRunCta slug={slug} target={target} />
          <ShareableScoreCard
            readonly
            shareUrl={shareUrl}
            score={scoreFromBeatTarget(target)}
          />
        </div>
      </div>
    );
  } else if (data.score) {
    const snapshot: ScoreSnapshot = isScoreSnapshot(data.snapshot) ? data.snapshot : {
      durationSeconds: data.score.count,
      rawWpm: data.score.speed,
      netWpm: Math.max(data.score.speed * (data.score.accuracy / 100), 0),
      accuracy: data.score.accuracy,
      totalKeystrokes: 0,
      correctKeystrokes: 0,
      incorrectKeystrokes: 0,
      typedText: "",
      wpmSamples: [
        { elapsedSeconds: 0, wpm: 0 },
        { elapsedSeconds: data.score.count, wpm: data.score.speed },
      ],
    };
    const promptText = snapshot.promptText;
    const beatTarget: BeatTarget | null = promptText ? {
      ...snapshot,
      promptText,
      id: data.score.id,
      speed: data.score.speed,
      score: data.score.score,
      count: data.score.count,
      mode: data.score.mode as TestModes,
      subMode: data.score.subMode as TestSubModes,
      language: data.score.language,
      options: data.score.options,
      createdAt: data.score.createdAt.getTime(),
      user: data.user ?? undefined,
    } : null;

    body = typingBeatRun && beatTarget ? (
      <BeatRunChallenge slug={slug} target={beatTarget} />
    ) : (
      <div className="flex h-full w-full overflow-auto px-4 py-8">
        <div className="m-auto flex w-full flex-col items-center gap-4">
          {beatTarget && <BeatRunCta slug={slug} target={beatTarget} />}
          <ShareableScoreCard
            readonly
            shareUrl={shareUrl}
            score={{
              id: data.score.id,
              speed: data.score.speed,
              ...snapshot,
              accuracy: data.score.accuracy,
              score: data.score.score,
              count: data.score.count,
              mode: data.score.mode as TestModes,
              subMode: data.score.subMode as TestSubModes,
              language: data.score.language,
              options: data.score.options,
              punctuation: snapshot.punctuation ?? data.score.punctuation,
              capitals: snapshot.capitals ?? data.score.capitals,
              ranked: snapshot.ranked ?? data.score.ranked,
              createdAt: data.score.createdAt,
              user: data.user ?? undefined,
            }}
          />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex h-full w-full items-center justify-center overflow-auto px-4 py-8">
        <section className="w-full max-w-xl rounded-lg bg-base-200 p-6 text-center">
          <h1 className="text-2xl font-bold">Score unavailable</h1>
          <p className="mt-3 opacity-75">This shared score is invalid or no longer available.</p>
          <Link className="btn btn-primary btn-sm mt-6" href="/">Try TypeCafe</Link>
        </section>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{meta.title}</title>
        <link key="canonical" rel="canonical" href={meta.pageUrl} />
        <meta key="description" name="description" content={meta.description} />
        <meta key="og:type" property="og:type" content="website" />
        <meta key="og:title" property="og:title" content={meta.title} />
        <meta key="og:description" property="og:description" content={meta.description} />
        <meta key="og:url" property="og:url" content={meta.pageUrl} />
        <meta key="og:image" property="og:image" content={meta.imageUrl} />
        <meta key="og:image:width" property="og:image:width" content="1200" />
        <meta key="og:image:height" property="og:image:height" content="630" />
        <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
        <meta key="twitter:title" name="twitter:title" content={meta.title} />
        <meta key="twitter:description" name="twitter:description" content={meta.description} />
        <meta key="twitter:image" name="twitter:image" content={meta.imageUrl} />
      </Head>
      {body}
    </>
  );
};

export const getServerSideProps: GetServerSideProps<SharedScorePageProps> = async ({ params, req }) => {
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0];
  const proto = forwardedProto ?? (req.headers.host?.startsWith("localhost") ? "http" : "https");
  const host = req.headers.host ?? "typecafe.app";
  const origin = `${proto}://${host}`;

  const encodedSlug = encodeURIComponent(slug);
  const imageUrl = `${origin}/api/og/score/${encodedSlug}`;
  const pageUrl = `${origin}/score/${encodedSlug}`;

  // Meta enrichment must never break the page — fall back to generic tags if the
  // lookup fails (e.g. DB unavailable). The interactive card still loads client-side.
  let data: OgShareData | null = null;
  try {
    data = slug ? await getShareForOg(slug) : null;
  } catch {
    data = null;
  }

  let meta: ShareMeta;
  if (data?.kind === "progress") {
    const sign = data.deltaWpm >= 0 ? "+" : "";
    meta = {
      title: `${sign}${data.deltaWpm.toFixed(1)} WPM in ${data.periodLabel} on TypeCafe`,
      description: `${data.username ? `@${data.username} got ` : ""}${sign}${data.deltaWpm.toFixed(1)} WPM in ${data.periodLabel}. Track your typing progress on TypeCafe.`,
      imageUrl,
      pageUrl,
    };
  } else if (data) {
    meta = {
      title: `${data.rawWpm.toFixed(1)} WPM on TypeCafe`,
      description: `${data.username ? `@${data.username} typed ` : ""}${data.rawWpm.toFixed(1)} WPM at ${data.accuracy.toFixed(1)}% accuracy. Test your typing speed on TypeCafe.`,
      imageUrl,
      pageUrl,
    };
  } else {
    meta = {
      title: "Typing score | TypeCafe",
      description: "Test your typing speed on TypeCafe.",
      imageUrl,
      pageUrl,
    };
  }

  return { props: { slug, meta } };
};

export default SharedScorePage;
