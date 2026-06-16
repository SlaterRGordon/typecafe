import Link from "next/link";
import { type CSSProperties, useId, useMemo, useRef, useState } from "react";

import { TestModes, TestSubModes } from "~/components/typer/types";
import { ShareableScoreImage } from "./ShareableScoreImage";
import { consistencyFromSamples, wpmImprovement } from "~/lib/stats";
import type { KeyAccuracy, TypedSegment, WpmSample as ScoreWpmSample } from "~/lib/stats";
import { decodeTimeline } from "~/lib/keystrokes";
import type { EncodedKeystroke } from "~/lib/keystrokes";
import { diagnose, toDrillKeys } from "~/lib/diagnosis";
import { classifyErrors } from "~/lib/errorTaxonomy";
import { attemptsFromEvents } from "~/lib/heatmap";
import { KeyHeatmap } from "~/components/heatmap/KeyHeatmap";

export type { TypedSegment, WpmSample as ScoreWpmSample } from "~/lib/stats";

export interface ScoreSnapshot {
  durationSeconds: number;
  rawWpm: number;
  netWpm: number;
  accuracy: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  incorrectKeystrokes: number;
  typedText: string;
  typedSegments?: TypedSegment[];
  worstKeys?: KeyAccuracy[];
  // Compact per-keystroke timeline ([charCode, correct, dtMs]) for the post-test
  // diagnosis panel. Present on a freshly completed normal test; absent on legacy
  // or shared snapshots (the panel is owner-only and not shown there anyway).
  timeline?: EncodedKeystroke[];
  brag?: string | null;
  // WPM vs the user's 30-day average at save time (vision §7 — deltas everywhere).
  avgDelta?: number | null;
  // Current practice-day streak (transient — shown on the live result card).
  streak?: number | null;
  punctuation?: boolean;
  capitals?: boolean;
  ranked?: boolean;
  wpmSamples: ScoreWpmSample[];
}

export interface ShareableScore extends ScoreSnapshot {
  id?: string;
  // Present when this result is the re-run of a diagnosed test: drives the
  // before→after delta strip. Transient (never persisted to a share snapshot).
  reMeasure?: { beforeWpm: number };
  speed: number;
  score?: number;
  count: number;
  mode: TestModes;
  subMode: TestSubModes;
  language: string;
  options?: string;
  createdAt?: Date;
  user?: {
    username: string | null;
    image?: string | null;
  };
}

interface ShareableScoreCardProps {
  score: ShareableScore;
  shareUrl?: string;
  readonly?: boolean;
  isCreatingShare?: boolean;
  canCreateShare?: boolean;
  signInHtmlFor?: string;
  onCreateShare?: () => Promise<string | undefined> | string | undefined;
  onTestAgain?: () => void;
}

type ActionState = "idle" | "copied" | "downloaded" | "unsupported" | "error";

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

function formatInteger(value: number) {
  return Math.round(value).toLocaleString();
}

function formatDate(date?: Date) {
  if (!date) return "Just now";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatModeText(score: Pick<ShareableScore, "mode" | "subMode" | "language">) {
  if (score.mode === TestModes.normal) {
    return `${subModeLabels[score.subMode]} / ${score.language}`;
  }

  return `${modeLabels[score.mode]} / ${subModeLabels[score.subMode]} / ${score.language}`;
}

async function writeTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function renderScoreCardImage(scoreCard: HTMLElement) {
  const { domToBlob } = await import("modern-screenshot");
  // Wait for web fonts (Roboto Mono) so the captured image keeps the TypeCafe
  // identity instead of falling back to a system monospace.
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore — fall through and render with whatever is available
    }
  }
  const bounds = scoreCard.getBoundingClientRect();

  return domToBlob(scoreCard, {
    backgroundColor: null,
    height: bounds.height,
    scale: window.devicePixelRatio || 1,
    width: bounds.width,
  });
}

function canCopyImageToClipboard() {
  return !!navigator.clipboard?.write && typeof ClipboardItem !== "undefined";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Copy the rendered card to the clipboard when supported; otherwise (common on
// mobile) fall back to downloading the PNG so the user can still share it.
async function copyOrDownloadScoreImage(scoreCard: HTMLElement | null): Promise<"copied" | "downloaded"> {
  if (!scoreCard) throw new Error("Score card is unavailable.");

  const blob = await renderScoreCardImage(scoreCard);
  if (!blob) throw new Error("Could not render score image.");

  if (canCopyImageToClipboard()) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copied";
  }

  downloadBlob(blob, "typecafe-score.png");
  return "downloaded";
}

function InfoIcon(props: { label: string }) {
  const tooltipId = useId();

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-base-content/50 text-[10px] text-base-content/80 outline-none transition hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={props.label}
        aria-describedby={tooltipId}
        title={props.label}
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-md border border-base-content/10 bg-base-100 px-3 py-2 text-xs font-medium text-base-content opacity-0 shadow-lg shadow-base-300/40 transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {props.label}
      </span>
    </span>
  );
}

function RestartIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m7 9 5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScreenshotIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MetricCard(props: { label: string; value: string; note: string; info: string; hero?: boolean }) {
  return (
    <div
      className={
        props.hero
          ? "rounded-lg border border-primary/40 bg-primary/10 p-4 shadow-inner shadow-base-300/40 ring-1 ring-primary/30"
          : "rounded-lg border border-base-content/10 bg-base-100/45 p-4 shadow-inner shadow-base-300/40"
      }
      aria-label={`${props.label}: ${props.value}. ${props.note}`}
    >
      <div className={`flex items-center gap-2 text-sm font-semibold ${props.hero ? "text-primary" : "text-base-content/90"}`}>
        <span>{props.label}</span>
        <InfoIcon label={props.info} />
      </div>
      <div className={`mt-4 font-mono font-bold leading-none text-primary ${props.hero ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"}`}>
        {props.value}
      </div>
      <p className="mt-4 text-sm text-base-content/70">{props.note}</p>
    </div>
  );
}

// Renders the typed text with per-character correctness when segments are present.
// Incorrect characters take the theme error color (with a faint underlay so wrong
// whitespace stays visible). Falls back to plain text for legacy scores that have
// no segment data.
function TypedText(props: { segments?: TypedSegment[]; plainText: string }) {
  if (!props.plainText && (!props.segments || props.segments.length === 0)) {
    return <>No typed text recorded.</>;
  }

  if (!props.segments || props.segments.length === 0) {
    return <>{props.plainText}</>;
  }

  return (
    <>
      {props.segments.map((segment, index) =>
        segment.correct ? (
          <span key={index}>{segment.ch}</span>
        ) : (
          <span key={index} className="rounded-sm bg-error/20 text-error">{segment.ch}</span>
        ),
      )}
    </>
  );
}

function buildSmoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  const first = points[0]!;
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  const commands = [`M ${first.x} ${first.y}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    const previous = points[index - 1] ?? current;
    const following = points[index + 2] ?? next;
    const controlOne = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const controlTwo = {
      x: next.x - (following.x - current.x) / 6,
      y: next.y - (following.y - current.y) / 6,
    };

    commands.push(`C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${next.x} ${next.y}`);
  }

  return commands.join(" ");
}

function chooseSecondTickInterval(spanSeconds: number) {
  if (spanSeconds <= 12) return 1;
  if (spanSeconds <= 24) return 2;
  if (spanSeconds <= 60) return 5;
  if (spanSeconds <= 120) return 10;
  if (spanSeconds <= 240) return 20;
  if (spanSeconds <= 600) return 60;

  return 120;
}

function chooseWpmTickInterval(maxWpm: number) {
  if (maxWpm <= 100) return 25;
  if (maxWpm <= 200) return 50;
  if (maxWpm <= 400) return 100;

  return 200;
}

function WpmChart(props: { samples: ScoreWpmSample[]; durationSeconds: number; rawWpm: number }) {
  const chartTitleId = useId();
  const chartDescriptionId = useId();
  const { maxSecond, samples, points, linePath, areaPath, yTicks, renderedXTicks, maxWpm, xSpan, chartStartSecond, width, height, padding, chartWidth, chartHeight } = useMemo(() => {
    const chartStartSecond = 0;
    const recordedSamples = props.samples
      .filter((sample) => sample.elapsedSeconds >= chartStartSecond)
      .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    const maxSecond = Math.round(Math.max(props.durationSeconds, ...recordedSamples.map((sample) => sample.elapsedSeconds), chartStartSecond));
    const samples = recordedSamples.length > 0
      ? recordedSamples[0]!.elapsedSeconds === chartStartSecond
        ? recordedSamples
        : [{ elapsedSeconds: chartStartSecond, wpm: recordedSamples[0]!.wpm }, ...recordedSamples]
      : [{ elapsedSeconds: chartStartSecond, wpm: props.rawWpm }, { elapsedSeconds: maxSecond, wpm: props.rawWpm }];
    const maxRecordedWpm = Math.max(...samples.map((sample) => sample.wpm), props.rawWpm, 100);
    const yTickInterval = chooseWpmTickInterval(maxRecordedWpm);
    const maxWpm = Math.ceil(maxRecordedWpm / yTickInterval) * yTickInterval;
    const width = 640;
    const height = 240;
    const padding = { top: 20, right: 24, bottom: 36, left: 48 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const xSpan = Math.max(maxSecond - chartStartSecond, 1);
    const points = samples.map((sample) => {
      const second = Math.min(sample.elapsedSeconds, maxSecond);
      const x = padding.left + ((second - chartStartSecond) / xSpan) * chartWidth;
      const y = padding.top + chartHeight - (sample.wpm / maxWpm) * chartHeight;
      return { x, y };
    });
    const linePath = buildSmoothPath(points);
    const areaPath = points.length > 0
      ? `M ${points[0]!.x} ${padding.top + chartHeight} L ${points[0]!.x} ${points[0]!.y} ${linePath.replace(/^M [^C]+/, "")} L ${points[points.length - 1]!.x} ${padding.top + chartHeight} Z`
      : "";
    const yTicks = Array.from({ length: Math.floor(maxWpm / yTickInterval) + 1 }, (_, index) => index * yTickInterval);
    const xTickInterval = chooseSecondTickInterval(xSpan);
    const xTicks = Array.from(
      { length: Math.floor(xSpan / xTickInterval) + 1 },
      (_, index) => chartStartSecond + index * xTickInterval,
    ).filter((tick) => tick <= maxSecond);
    const renderedXTicks = xTicks.includes(maxSecond) ? xTicks : [...xTicks, maxSecond];
    return { maxSecond, samples, points, linePath, areaPath, yTicks, renderedXTicks, maxWpm, xSpan, chartStartSecond, width, height, padding, chartWidth, chartHeight };
  }, [props.samples, props.durationSeconds, props.rawWpm]);

  return (
    <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-4" aria-labelledby={chartTitleId}>
      <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-base-content">
        <span id={chartTitleId}>WPM Over Time</span>
        <InfoIcon label="Shows your raw WPM trend from the start of the test through completion." />
      </div>
      <svg className="h-auto w-full overflow-visible text-primary" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartTitleId} ${chartDescriptionId}`}>
        <desc id={chartDescriptionId}>
          WPM chart with {samples.length} samples over {maxSecond} seconds. Final raw WPM is {formatNumber(props.rawWpm, 1)}.
        </desc>
        {yTicks.map((tick) => {
          const y = padding.top + chartHeight - (tick / maxWpm) * chartHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} stroke="currentColor" opacity="0.14" />
              <text x={padding.left - 14} y={y + 5} textAnchor="end" className="fill-base-content text-sm" opacity="0.75">{tick}</text>
            </g>
          );
        })}
        {renderedXTicks.map((tick) => {
          const x = padding.left + ((tick - chartStartSecond) / xSpan) * chartWidth;
          return <text key={tick} x={x} y={height - 8} textAnchor="middle" className="fill-base-content text-sm" opacity="0.75">{tick}s</text>;
        })}
        {areaPath ? <path d={areaPath} fill="currentColor" opacity="0.13" /> : null}
        {linePath ? <path className="score-draw-line" d={linePath} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" /> : null}
        {points.map((point, index) => (
          <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="6" fill="currentColor" stroke="var(--color-base-100)" strokeWidth="2" />
        ))}
      </svg>
    </div>
  );
}

function DetailRow(props: { label: string; value: string; tone?: "success" | "error" | "accent" }) {
  const toneClass = props.tone === "success" ? "text-success" : props.tone === "error" ? "text-error" : props.tone === "accent" ? "text-primary" : "text-base-content";

  return (
    <div className="flex items-center justify-between border-b border-base-content/10 py-3 last:border-b-0">
      <span className="text-base-content/80">{props.label}</span>
      <span className={`font-mono ${toneClass}`}>{props.value}</span>
    </div>
  );
}

// The loop's payoff: the same test re-run after a drill, with the before→after
// WPM shown side by side and the delta called out. Only ever present on a fresh
// re-measure result (never on a shared snapshot).
function ReMeasureStrip(props: { beforeWpm: number; afterWpm: number }) {
  const { delta, improved } = wpmImprovement(props.beforeWpm, props.afterWpm);
  const deltaTone = improved ? "bg-success/20 text-success" : delta < 0 ? "bg-error/20 text-error" : "bg-base-content/10 text-base-content/70";

  return (
    <div data-testid="re-measure-delta" className="score-reveal mt-7 rounded-lg border border-primary/40 bg-primary/10 p-4" style={{ "--reveal-delay": "40ms" } as CSSProperties}>
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <span>Re-measure</span>
          <InfoIcon label="Your speed on this exact test before the drill versus right after it." />
        </div>
        <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-mono">
          <span className="text-base-content/55">{formatNumber(props.beforeWpm, 1)}</span>
          <span className="text-base-content/40">→</span>
          <span className="text-3xl font-bold text-primary">{formatNumber(props.afterWpm, 1)}</span>
          <span className="text-sm text-base-content/70">WPM</span>
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${deltaTone}`}>
            {delta >= 0 ? "+" : ""}{formatNumber(delta, 1)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Turns the just-completed test's keystroke timeline into up to three honest,
// actionable findings, each ending in a one-click drill into Practice mode with
// exactly those keys pre-selected. Owner-only: rendered on the live results card,
// never on a read-only shared score (which carries no timeline anyway).
function DiagnosisPanel(props: { score: ShareableScore }) {
  const { diagnosis, attempts, taxonomy } = useMemo(() => {
    const events = props.score.timeline ? decodeTimeline(props.score.timeline) : [];
    return {
      diagnosis: diagnose({ events, worstKeys: props.score.worstKeys }),
      attempts: attemptsFromEvents(events),
      taxonomy: classifyErrors(events),
    };
  }, [props.score.timeline, props.score.worstKeys]);

  // Only normal-mode tests carry a per-key timeline; without one there is nothing
  // to diagnose, so the panel stays hidden rather than showing an empty shell.
  if (!props.score.timeline || props.score.timeline.length === 0) return null;

  return (
    <div data-testid="diagnosis-panel" className="score-reveal mt-5 rounded-lg border border-base-content/10 bg-base-100/45 p-5" style={{ "--reveal-delay": "200ms" } as CSSProperties}>
      <div className="mb-1 flex items-center gap-2 text-lg font-semibold text-base-content">
        <span>Diagnosis</span>
        <InfoIcon label="The keys and transitions that cost you the most this test, computed from your keystroke timeline. Each finding drills into Practice with those keys selected." />
      </div>
      <p className="mb-4 text-sm text-base-content/60">What slowed you down this test — and the one-click fix.</p>

      {diagnosis.tooShort ?
        <p className="text-base-content/75">Too short to diagnose — try a 30s+ test.</p>
        :
        <>
        {taxonomy &&
          <div data-testid="taxonomy-finding" className="mb-4 rounded-md border border-primary/30 bg-primary/10 p-4">
            <p className="font-semibold text-base-content">{taxonomy.headline}</p>
            <p className="mt-1 text-sm text-base-content/70">{taxonomy.detail}</p>
            <Link
              href={taxonomy.action.href}
              className="mt-3 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {taxonomy.action.label}
            </Link>
          </div>
        }
        {diagnosis.findings.length === 0 ?
        <p className="text-base-content/75">No clear weak spots this test — a clean, even run. Keep the pace up.</p>
        :
        <ul className="flex flex-col gap-3">
          {diagnosis.findings.map((finding) => {
            const drillKeys = toDrillKeys(finding.keys);
            return (
              <li
                key={finding.kind}
                className="flex flex-col gap-3 border-b border-base-content/10 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-base-content/90">{finding.summary}</span>
                {drillKeys.length > 0 ?
                  <Link
                    className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    href={`/?mode=practice&keys=${drillKeys.join(",")}`}
                    aria-label={`Drill these keys: ${drillKeys.join(", ")}`}
                    title={`Practice ${drillKeys.join(", ")}`}
                  >
                    Drill these keys
                  </Link>
                  :
                  null
                }
              </li>
            );
          })}
        </ul>
        }

        <div className="mt-5 border-t border-base-content/10 pt-4">
          <p className="mb-3 text-sm text-base-content/60">This test's per-key accuracy — drilled keys ringed.</p>
          <KeyHeatmap size="mini" attempts={attempts} highlightKeys={diagnosis.drillKeys} testId="diagnosis-heatmap" />
        </div>
        </>
      }
    </div>
  );
}

export function ShareableScoreCard(props: ShareableScoreCardProps) {
  const { score, shareUrl, readonly = false, isCreatingShare = false, canCreateShare = false, signInHtmlFor, onCreateShare, onTestAgain } = props;
  const showSignInCta = !readonly && !shareUrl && !canCreateShare && !!signInHtmlFor;
  const [linkState, setLinkState] = useState<ActionState>("idle");
  const [imageState, setImageState] = useState<ActionState>("idle");
  const resetTimerRef = useRef<number | null>(null);
  const scoreCardRef = useRef<HTMLDivElement | null>(null);
  const shareImageRef = useRef<HTMLDivElement | null>(null);
  const modeText = formatModeText(score);
  const shareButtonLabel = isCreatingShare ? "Creating..." : linkState === "copied" ? "Link copied" : "Share Score";
  const screenshotButtonLabel = imageState === "copied" ? "Screenshot copied" : imageState === "downloaded" ? "Image downloaded" : "Copy Screenshot";

  const scheduleReset = () => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setLinkState("idle");
      setImageState("idle");
    }, 2500);
  };

  const handleCopyLink = async () => {
    try {
      const nextUrl = shareUrl ?? await onCreateShare?.();
      if (!nextUrl) {
        setLinkState("unsupported");
        scheduleReset();
        return;
      }

      await writeTextToClipboard(nextUrl);
      setLinkState("copied");
    } catch {
      setLinkState("error");
    } finally {
      scheduleReset();
    }
  };

  const handleCopyImage = async () => {
    try {
      const result = await copyOrDownloadScoreImage(shareImageRef.current);
      setImageState(result);
    } catch {
      setImageState("error");
    } finally {
      scheduleReset();
    }
  };

  // How steady the pace was across the test, derived from the chart samples so
  // it also works for previously shared scores. Hidden when there isn't enough
  // data to be meaningful.
  const consistency = useMemo(() => {
    if (!score.wpmSamples || score.wpmSamples.length < 4) return null;
    return consistencyFromSamples(score.wpmSamples);
  }, [score.wpmSamples]);

  const worstKeysText = useMemo(() => {
    if (!score.worstKeys || score.worstKeys.length === 0) return null;
    return score.worstKeys
      .map((entry) => `${entry.key === " " ? "space" : entry.key} (${Math.round(entry.accuracy)}%)`)
      .join(", ");
  }, [score.worstKeys]);

  const metricItems = useMemo(() => [
    { label: "WPM", value: formatNumber(score.rawWpm, 1), note: "Raw speed", info: "Raw words per minute, calculated from all typed keystrokes before error adjustment.", hero: true },
    { label: "Accuracy", value: `${formatNumber(score.accuracy, 2)}%`, note: "Correct keystrokes", info: "The percentage of typed keystrokes that matched the expected text." },
    { label: "Duration", value: `${formatInteger(score.durationSeconds)}s`, note: "Completed", info: "The completed test duration in seconds." },
    { label: "Net WPM", value: formatNumber(score.netWpm, 1), note: "Adjusted for errors", info: "Words per minute after incorrect keystrokes are subtracted from the result." },
  ], [score]);

  return (
    <section className="w-full max-w-7xl px-4 py-4 sm:px-6">
      <div
        ref={scoreCardRef}
        data-testid="score-screenshot-card"
        role="region"
        aria-label="Typing test results"
        className="rounded-xl border border-base-content/15 bg-base-200 p-5 text-base-content shadow-2xl shadow-base-300/40 sm:p-6"
      >
        <div className="score-reveal flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {score.brag &&
                  <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">{score.brag}</span>
                }
                {typeof score.streak === "number" && score.streak > 0 &&
                  <span data-testid="score-streak" className="inline-block rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">{score.streak}-day streak</span>
                }
              </div>
              {typeof score.avgDelta === "number" &&
                <p data-testid="avg-delta" className={`mb-2 text-sm font-semibold ${score.avgDelta >= 0 ? "text-success" : "text-error"}`}>
                  {formatNumber(Math.abs(score.avgDelta), 1)} WPM {score.avgDelta >= 0 ? "over" : "under"} your 30-day average
                </p>
              }
              <p className="text-sm text-base-content/65">{modeText} / {formatDate(score.createdAt)}</p>
              {(score.punctuation || score.capitals || score.ranked === false) &&
                <div className="mt-2 flex flex-wrap gap-2">
                  {score.punctuation &&
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">Punctuation</span>
                  }
                  {score.capitals &&
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">Capitals</span>
                  }
                  {score.ranked === false &&
                    <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">Unranked</span>
                  }
                </div>
              }
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {shareUrl && readonly ?
              <Link
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-base-content/15 bg-base-100/50 px-4 py-2 text-sm font-semibold text-base-content transition hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                href="/"
                aria-label="Try TypeCafe"
                title="Start a new typing test on TypeCafe"
              >
                Try TypeCafe
              </Link>
              :
              null
            }
            {!readonly && onTestAgain ?
              <button
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-base-content/15 bg-base-100/50 px-4 py-2 text-sm font-semibold text-base-content transition hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                type="button"
                onClick={onTestAgain}
                aria-label="Test Again"
                title="Restart the typing test"
              >
                <RestartIcon />
                <span>Test Again</span>
              </button>
              :
              null
            }
            {showSignInCta ?
              <label
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                htmlFor={signInHtmlFor}
                title="Sign in to save your score and create a share link"
              >
                <ShareIcon />
                <span>Sign in to save &amp; share</span>
              </label>
              : (!readonly || shareUrl) ?
              <button
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={isCreatingShare || (!shareUrl && !canCreateShare)}
                onClick={handleCopyLink}
                aria-label={shareButtonLabel}
                title={isCreatingShare ? "Creating share link" : linkState === "copied" ? "Share link copied" : "Copy share score link"}
              >
                <ShareIcon />
                <span>{shareButtonLabel}</span>
              </button>
              :
              null
            }
            <button
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-semibold text-secondary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              type="button"
              onClick={handleCopyImage}
              aria-label={screenshotButtonLabel}
              title={imageState === "copied" ? "Score screenshot copied" : imageState === "downloaded" ? "Score image downloaded" : "Copy score screenshot image"}
            >
              <ScreenshotIcon />
              <span>{screenshotButtonLabel}</span>
            </button>
          </div>
        </div>

        {score.reMeasure && <ReMeasureStrip beforeWpm={score.reMeasure.beforeWpm} afterWpm={score.rawWpm} />}

        <div className="score-reveal mt-7 grid gap-4 md:grid-cols-4" style={{ "--reveal-delay": "80ms" } as CSSProperties}>
          {metricItems.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>

        <div className="score-reveal mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]" style={{ "--reveal-delay": "160ms" } as CSSProperties}>
          <WpmChart samples={score.wpmSamples} durationSeconds={score.durationSeconds} rawWpm={score.rawWpm} />
          <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-5">
            <h2 className="mb-3 text-lg font-semibold text-base-content">Performance Details</h2>
            <DetailRow label="Total Keystrokes" value={formatInteger(score.totalKeystrokes)} />
            <DetailRow label="Correct Keystrokes" value={formatInteger(score.correctKeystrokes)} tone="success" />
            <DetailRow label="Incorrect Keystrokes" value={formatInteger(score.incorrectKeystrokes)} tone="error" />
            <DetailRow label="Accuracy" value={`${formatNumber(score.accuracy, 2)}%`} tone="accent" />
            <DetailRow label="Net WPM" value={formatNumber(score.netWpm, 1)} />
            <DetailRow label="Raw WPM" value={formatNumber(score.rawWpm, 1)} />
            {consistency !== null &&
              <DetailRow label="Consistency" value={`${formatNumber(consistency, 0)}%`} />
            }
            {worstKeysText &&
              <DetailRow label="Toughest Keys" value={worstKeysText} tone="error" />
            }
          </div>
        </div>

        {!readonly && <DiagnosisPanel score={score} />}

        <div className="score-reveal mt-5 rounded-lg border border-base-content/10 bg-base-100/45 p-5" style={{ "--reveal-delay": "240ms" } as CSSProperties}>
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-base-content">
            <span>Your Typed Text</span>
            <InfoIcon label="The text you typed during this test. Incorrect characters are highlighted in the theme error color." />
          </div>
          <div className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-base-content/10 bg-base-200/70 p-4 font-mono text-base leading-8 text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-lg" tabIndex={0} role="region" aria-label="Typed text from the completed test">
            <TypedText segments={score.typedSegments} plainText={score.typedText} />
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-base-content/10 pt-4 text-sm text-base-content/80 sm:flex-row sm:items-center sm:gap-8">
            <span><span className="mr-2 inline-block h-3 w-3 rounded-full bg-success" />{formatInteger(score.correctKeystrokes)} correct</span>
            <span><span className="mr-2 inline-block h-3 w-3 rounded-full bg-error" />{formatInteger(score.incorrectKeystrokes)} incorrect</span>
            <span className="text-primary">{formatNumber(score.accuracy, 2)}% accuracy</span>
          </div>
        </div>
      </div>

      <div aria-live="polite" role="status" className="min-h-8 pt-3 text-sm">
        {linkState === "unsupported" ?
          <p className="text-warning">Sign in and save the score before sharing a link.</p>
          :
          null
        }
        {imageState === "unsupported" ?
          <p className="text-warning">This browser cannot copy images to the clipboard yet.</p>
          :
          null
        }
        {(linkState === "error" || imageState === "error") ?
          <p className="text-error">Copy failed. Please try again.</p>
          :
          null
        }
      </div>

      {/* Off-screen, fixed-size social card that is the actual screenshot/download
          target. Positioned off-viewport (not display:none, which would render a
          blank capture) and hidden from assistive tech and the layout. */}
      <div aria-hidden="true" style={{ position: "fixed", left: "-99999px", top: 0, pointerEvents: "none" }}>
        <ShareableScoreImage ref={shareImageRef} score={score} />
      </div>
    </section>
  );
}
