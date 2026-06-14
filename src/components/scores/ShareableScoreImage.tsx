import { forwardRef } from "react";

import { TestModes, TestSubModes } from "~/components/typer/types";
import type { ShareableScore } from "./ShareableScoreCard";

// Canonical marketing domain stamped onto the shared image so it works as an ad
// wherever it is reposted (never localhost / a preview origin).
const SHARE_DOMAIN = "typecafe.app";

// Universal Open Graph / social ratio. Fixed pixel dimensions keep the rendered
// screenshot deterministic regardless of the user's viewport or zoom.
export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;

const modeLabels: Record<TestModes, string> = {
  [TestModes.normal]: "Timed",
  [TestModes.practice]: "Practice",
  [TestModes.ngrams]: "N-grams",
  [TestModes.relaxed]: "Relaxed",
};

const subModeLabels: Record<TestSubModes, string> = {
  [TestSubModes.timed]: "Timed",
  [TestSubModes.words]: "Words",
};

function formatNumber(value: number, digits = 1) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatDate(date?: Date) {
  if (!date) return "Just now";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatModeText(score: Pick<ShareableScore, "mode" | "subMode" | "language">) {
  if (score.mode === TestModes.normal) {
    return `${subModeLabels[score.subMode]} / ${score.language}`;
  }

  return `${modeLabels[score.mode]} / ${subModeLabels[score.subMode]} / ${score.language}`;
}

function Sparkline(props: { samples: ShareableScore["wpmSamples"]; rawWpm: number }) {
  const width = 1088;
  const height = 150;
  const samples = props.samples.length > 0
    ? props.samples
    : [{ elapsedSeconds: 0, wpm: props.rawWpm }, { elapsedSeconds: 1, wpm: props.rawWpm }];
  const maxWpm = Math.max(...samples.map((sample) => sample.wpm), props.rawWpm, 1);
  const maxSecond = Math.max(...samples.map((sample) => sample.elapsedSeconds), 1);
  const points = samples.map((sample) => ({
    x: (sample.elapsedSeconds / maxSecond) * width,
    y: height - (sample.wpm / maxWpm) * (height - 8) - 4,
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-primary" aria-hidden="true">
      <path d={areaPath} fill="currentColor" opacity="0.14" />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xl font-semibold uppercase tracking-wide text-base-content/60">{props.label}</span>
      <span className="font-mono text-5xl font-bold leading-none text-base-content">{props.value}</span>
    </div>
  );
}

/**
 * The dedicated social/share card captured for "Copy Screenshot" and downloads.
 * It is rendered off-screen at a fixed 1200x630 and styled only with theme CSS
 * variables, so it always matches the user's active (or custom) theme.
 */
export const ShareableScoreImage = forwardRef<HTMLDivElement, { score: ShareableScore }>(
  function ShareableScoreImage({ score }, ref) {
    const username = score.user?.username ? `@${score.user.username}` : "Guest";
    const modeText = formatModeText(score);

    return (
      <div
        ref={ref}
        data-testid="score-share-image"
        style={{ width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }}
        className="flex flex-col justify-between bg-base-200 p-14 text-base-content"
      >
        {/* Identity + hero on the left; the stats column spans the full height on
            the right so Accuracy aligns with the title and Duration with the WPM
            baseline, rather than bunching in the middle. */}
        <div className="flex items-stretch justify-between">
          <div className="flex flex-col">
            {/* Wordmark with the domain stacked beneath it */}
            <span className="font-mono text-4xl font-bold tracking-tight text-base-content">TypeCafe</span>
            <span className="mt-1 font-mono text-xl text-base-content/55">{SHARE_DOMAIN}</span>
            {/* Optional brag chip (personal best / flattering percentile) */}
            {score.brag ?
              <span className="mt-6 -mb-2 self-start rounded-full bg-primary/15 px-4 py-1.5 font-mono text-lg font-bold text-primary">{score.brag}</span>
              : null}
            {/* Hero */}
            <span className="mt-6 text-2xl font-semibold uppercase tracking-widest text-primary">Words per minute</span>
            <span className="font-mono font-bold leading-none text-primary" style={{ fontSize: "150px", letterSpacing: "-0.04em" }}>
              {formatNumber(score.rawWpm, 1)}
            </span>
            <span className="my-3 font-mono text-xl text-base-content/60">{modeText} / {formatDate(score.createdAt)}</span>
          </div>
          <div className="flex flex-col justify-between pb-12">
            <Stat label="Accuracy" value={`${formatNumber(score.accuracy, 1)}%`} />
            <Stat label="Net WPM" value={formatNumber(score.netWpm, 1)} />
            <Stat label="Duration" value={`${Math.round(score.durationSeconds)}s`} />
          </div>
        </div>

        {/* Signature sparkline + attribution, clearly separated */}
        <div className="flex flex-col gap-5">
          <Sparkline samples={score.wpmSamples} rawWpm={score.rawWpm} />
          <div className="flex justify-end">
            <span className="max-w-sm truncate font-mono text-2xl font-bold text-base-content">{username}</span>
          </div>
        </div>
      </div>
    );
  },
);
