import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

import { ShareableScoreCard, type ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import type { TestModes, TestSubModes } from "~/components/typer/types";
import { api } from "~/utils/api";

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

const SharedScorePage: NextPage = () => {
  const router = useRouter();
  const slug = typeof router.query.slug === "string" ? router.query.slug : "";
  const shareUrl = typeof window !== "undefined" && slug ? `${window.location.origin}/score/${slug}` : undefined;

  const { data, isLoading, isError, error } = api.scoreShare.get.useQuery({ slug }, {
    enabled: !!slug,
    retry: false,
  });

  if (isLoading || !slug) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border border-solid border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <>
        <Head>
          <title>Score unavailable | TypeCafe</title>
        </Head>
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
      </>
    );
  }

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

  return (
    <>
      <Head>
        <title>{`${data.score.speed.toFixed(1)} WPM shared score | TypeCafe`}</title>
        <meta
          name="description"
          content={`A TypeCafe typing score with ${data.score.speed.toFixed(1)} WPM and ${data.score.accuracy.toFixed(2)}% accuracy.`}
        />
      </Head>
      <div className="flex h-full w-full overflow-auto px-4 py-8">
        <div className="m-auto flex w-full justify-center">
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
              createdAt: data.score.createdAt,
              user: data.user,
            }}
          />
        </div>
      </div>
    </>
  );
};

export default SharedScorePage;
