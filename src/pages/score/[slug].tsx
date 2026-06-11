import { type GetServerSideProps, type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";

import { ShareableScoreCard, type ScoreSnapshot } from "~/components/scores/ShareableScoreCard";
import type { TestModes, TestSubModes } from "~/components/typer/types";
import { getShareScoreForOg, type OgScoreData } from "~/server/og/scoreData";
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

const SharedScorePage: NextPage<SharedScorePageProps> = ({ slug, meta }) => {
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
  } else {
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

    body = (
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
              punctuation: snapshot.punctuation ?? data.score.punctuation,
              capitals: snapshot.capitals ?? data.score.capitals,
              ranked: snapshot.ranked ?? data.score.ranked,
              createdAt: data.score.createdAt,
              user: data.user,
            }}
          />
        </div>
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
  let data: OgScoreData | null = null;
  try {
    data = slug ? await getShareScoreForOg(slug) : null;
  } catch {
    data = null;
  }

  const meta: ShareMeta = data
    ? {
        title: `${data.rawWpm.toFixed(1)} WPM on TypeCafe`,
        description: `${data.username ? `@${data.username} typed ` : ""}${data.rawWpm.toFixed(1)} WPM at ${data.accuracy.toFixed(1)}% accuracy. Test your typing speed on TypeCafe.`,
        imageUrl,
        pageUrl,
      }
    : {
        title: "Typing score | TypeCafe",
        description: "Test your typing speed on TypeCafe.",
        imageUrl,
        pageUrl,
      };

  return { props: { slug, meta } };
};

export default SharedScorePage;
