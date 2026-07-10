import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { ToolbarMenu } from "~/components/typer/config/ToolbarMenu";

import { TestModes, TestSubModes } from "~/components/typer/types";
import { ShareableScoreImage } from "./ShareableScoreImage";
import { consistencyFromSamples, cumulativeWpmAtTimes, netFromRaw, wpmImprovement } from "~/lib/stats";
import type { KeyAccuracy, TypedSegment, WpmSample as ScoreWpmSample } from "~/lib/stats";
import { decodeTimeline } from "~/lib/keystrokes";
import type { EncodedKeystroke } from "~/lib/keystrokes";
import { diagnose, toDrillKeys } from "~/lib/diagnosis";
import { aggregateTransitions, worstTransitions } from "~/lib/transitions";
import { attemptsFromEvents } from "~/lib/heatmap";
import { KeyHeatmap } from "~/components/heatmap/KeyHeatmap";
import { Chip } from "~/components/ui/Chip";

export type { TypedSegment, WpmSample as ScoreWpmSample } from "~/lib/stats";

export interface ScoreSnapshot {
  durationSeconds: number;
  rawWpm: number;
  netWpm: number;
  accuracy: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  incorrectKeystrokes: number;
  // The source text shown to the typist. Optional on legacy shares, required for
  // beat-my-run links so another person can type the identical prompt.
  promptText?: string;
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
  dailyChallenge?: boolean;
  // Current practice-day streak (transient — shown on the live result card).
  streak?: number | null;
  punctuation?: boolean;
  capitals?: boolean;
  ranked?: boolean;
  // The keyboard layout the run was typed on (actual id — ledger decision 10).
  // Score surfaces render this board; absent/legacy = qwerty.
  layout?: string;
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
  // True while the just-finished test is still saving: the card is shown eagerly,
  // so the share action waits (loader) for the server to return a shareable id.
  isSaving?: boolean;
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
  [TestModes.quotes]: "Quotes",
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

// Delta-forward when a delta exists (vision §7): "getting faster" shares better
// than a bare number. Falls back to the plain headline WPM.
function buildShareText(score: ShareableScore) {
  const wpm = formatNumber(score.netWpm, 1);
  if (score.ranked !== false && typeof score.avgDelta === "number" && score.avgDelta !== 0) {
    const sign = score.avgDelta >= 0 ? "+" : "";
    return `I just typed ${wpm} WPM (${sign}${formatNumber(score.avgDelta, 1)} vs my 30-day average) on TypeCafe.`;
  }
  return `I just typed ${wpm} WPM on TypeCafe.`;
}

function tweetHref(text: string, url: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function redditHref(text: string, url: string) {
  return `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
}

function InfoIcon(props: { label: string; href?: string }) {
  const tooltipId = useId();
  const href = props.href ?? "/how-we-measure";

  return (
    <span className="group relative inline-flex">
      <Link
        href={href}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-base-content/50 text-[10px] text-base-content/80 outline-none transition hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`${props.label} Train how TypeCafe measures this.`}
        aria-describedby={tooltipId}
        title={`${props.label} Train how TypeCafe measures this.`}
      >
        ?
      </Link>
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

function Spinner() {
  return (
    <span
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
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

function ChevronDownIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const shareMenuItemClass =
  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// A link-out share target (X, Reddit). Rendered as an inert row with a trailing
// spinner until the share URL is minted, then swapped for a real anchor — so the
// click that opens the tab is a fresh user gesture (no popup-blocker fight).
function ShareMenuLink(props: { href?: string; loading: boolean; icon: ReactNode; label: string; onSelect: () => void }) {
  if (!props.href) {
    return (
      <span role="menuitem" aria-disabled="true" className={`${shareMenuItemClass} cursor-default text-base-content/45`}>
        {props.icon}
        <span>{props.label}</span>
        {props.loading && <span className="ml-auto"><Spinner /></span>}
      </span>
    );
  }

  return (
    <a
      role="menuitem"
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={props.onSelect}
      className={`${shareMenuItemClass} text-base-content hover:bg-base-300`}
    >
      {props.icon}
      <span>{props.label}</span>
    </a>
  );
}

function ShareMenuButton(props: { onClick: () => void; disabled?: boolean; loading?: boolean; icon: ReactNode; label: string; testId?: string }) {
  return (
    <button
      role="menuitem"
      type="button"
      data-testid={props.testId}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${shareMenuItemClass} ${props.disabled ? "cursor-default text-base-content/45" : "text-base-content hover:bg-base-300"}`}
    >
      {props.icon}
      <span>{props.label}</span>
      {props.loading && <span className="ml-auto"><Spinner /></span>}
    </button>
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

// One drawn series: its smoothed path plus how to stroke it. `neutral` swaps the
// primary stroke for a muted base-content line (the burst-net line reads as the
// quiet reference under the two primary cumulative lines).
interface ChartLine {
  path: string;
  width: number;
  dashed?: boolean;
  neutral?: boolean;
  animate?: boolean;
}

function WpmChart(props: { samples: ScoreWpmSample[]; durationSeconds: number; rawWpm: number; accuracy: number; timeline?: EncodedKeystroke[] }) {
  const chartTitleId = useId();
  const chartDescriptionId = useId();
  // Which sample the pointer is nearest, for the hover readout. Null = no hover.
  const [hover, setHover] = useState<number | null>(null);
  const { maxSecond, hoverPoints, lines, areaPath, legend, hasCumulative, mistakeBars, mistakeCount, yTicks, renderedXTicks, maxWpm, xSpan, chartStartSecond, width, height, padding, chartWidth, chartHeight } = useMemo(() => {
    const accuracy = props.accuracy;
    const sortedSamples = props.samples.slice().sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    const maxSecond = Math.round(Math.max(props.durationSeconds, ...sortedSamples.map((sample) => sample.elapsedSeconds), 0));
    // Start the x-axis at 1s on tests long enough to spare it. The first second is
    // where a running average is noisiest (over a tiny window it extrapolates to a
    // spike), so the lines begin cleanly at the left edge at 1s instead of ramping
    // up through that noise.
    const chartStartSecond = maxSecond > 2 ? 1 : 0;
    const recordedSamples = sortedSamples.filter((sample) => sample.elapsedSeconds >= chartStartSecond);
    const samples = recordedSamples.length > 0
      ? recordedSamples[0]!.elapsedSeconds === chartStartSecond
        ? recordedSamples
        : [{ elapsedSeconds: chartStartSecond, wpm: recordedSamples[0]!.wpm }, ...recordedSamples]
      : [{ elapsedSeconds: chartStartSecond, wpm: props.rawWpm }, { elapsedSeconds: maxSecond, wpm: props.rawWpm }];
    // Burst (instantaneous) net over the trailing window, from the raw samples.
    const burstNet = samples.map((sample) => netFromRaw(sample.wpm, accuracy));
    // Cumulative (running-average) raw and net need the per-key correctness
    // timeline; present on fresh normal tests, absent on shared/legacy snapshots.
    const events = props.timeline ? decodeTimeline(props.timeline) : [];
    const hasCumulative = events.length > 0;
    const cumulative = hasCumulative
      ? cumulativeWpmAtTimes(events, samples.map((sample) => Math.min(sample.elapsedSeconds, maxSecond)))
      : [];

    // Scale the y-axis to whatever lines we actually draw so nothing is squished.
    const drawnValues = hasCumulative
      ? [...cumulative.map((c) => c.rawWpm), ...cumulative.map((c) => c.netWpm), ...burstNet]
      : [...samples.map((s) => s.wpm), ...burstNet];
    const maxRecordedWpm = Math.max(...drawnValues, props.rawWpm, 100);
    const yTickInterval = chooseWpmTickInterval(maxRecordedWpm);
    const maxWpm = Math.ceil(maxRecordedWpm / yTickInterval) * yTickInterval;
    const width = 640;
    const height = 240;
    const padding = { top: 20, right: 24, bottom: 36, left: 48 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const xSpan = Math.max(maxSecond - chartStartSecond, 1);
    const xAt = (second: number) => padding.left + ((Math.min(second, maxSecond) - chartStartSecond) / xSpan) * chartWidth;
    const yAt = (wpm: number) => padding.top + chartHeight - (wpm / maxWpm) * chartHeight;
    // Every sample already starts at chartStartSecond, so no per-line floor is
    // needed — the axis itself begins where the running average settles.
    const pointsFor = (values: number[]) =>
      samples.map((sample, i) => ({ second: sample.elapsedSeconds, x: xAt(sample.elapsedSeconds), y: yAt(values[i]!) }));

    const burstNetPoints = pointsFor(burstNet);
    const headlinePoints = hasCumulative ? pointsFor(cumulative.map((c) => c.netWpm)) : burstNetPoints;
    const areaPath = headlinePoints.length > 0
      ? `M ${headlinePoints[0]!.x} ${padding.top + chartHeight} L ${headlinePoints[0]!.x} ${headlinePoints[0]!.y} ${buildSmoothPath(headlinePoints).replace(/^M [^C]+/, "")} L ${headlinePoints[headlinePoints.length - 1]!.x} ${padding.top + chartHeight} Z`
      : "";

    // Draw order = paint order: reference lines first, the headline net line last
    // (on top). The headline is always the last entry so its dot anchors the hover.
    const lines: ChartLine[] = hasCumulative
      ? [
          { path: buildSmoothPath(pointsFor(cumulative.map((c) => c.rawWpm))), width: 2.5, dashed: true },
          { path: buildSmoothPath(burstNetPoints), width: 2, neutral: true },
          { path: buildSmoothPath(headlinePoints), width: 4, animate: true },
        ]
      : [
          { path: buildSmoothPath(pointsFor(samples.map((s) => s.wpm))), width: 2.5, dashed: true, neutral: true },
          { path: buildSmoothPath(burstNetPoints), width: 4, animate: true },
        ];

    const legend = hasCumulative
      ? [
          { label: "Cumulative net", kind: "solid" as const, neutral: false },
          { label: "Cumulative raw", kind: "dashed" as const, neutral: false },
          { label: "Burst net", kind: "solid" as const, neutral: true },
        ]
      : [
          { label: "Net", kind: "solid" as const, neutral: false },
          { label: "Raw", kind: "dashed" as const, neutral: true },
        ];

    // Hover readout per sample: the y that the headline dot sits at, plus the
    // exact values for whichever lines are on screen.
    const hoverPoints = samples.map((sample, i) => {
      const second = Math.min(sample.elapsedSeconds, maxSecond);
      const headlineWpm = hasCumulative ? cumulative[i]!.netWpm : burstNet[i]!;
      const readouts = hasCumulative
        ? [
            { label: "net", value: cumulative[i]!.netWpm, className: "text-primary" },
            { label: "raw", value: cumulative[i]!.rawWpm, className: "text-primary/70" },
            { label: "burst", value: burstNet[i]!, className: "text-base-content/60" },
          ]
        : [
            { label: "net", value: burstNet[i]!, className: "text-primary" },
            { label: "raw", value: sample.wpm, className: "text-base-content/60" },
          ];
      return { second, x: xAt(second), headlineY: yAt(headlineWpm), readouts };
    });

    // Mistakes as a binned density strip along the bottom axis: overlapping
    // per-key errors collapse into one bar per time slice, taller where a burst
    // clustered. Reads the same whether there are 3 mistakes or 300, so nothing
    // overlaps into an unreadable smear.
    const mistakeSeconds = events.filter((event) => !event.correct).map((event) => Math.min(Math.max(event.t / 1000, chartStartSecond), maxSecond));
    const mistakeBinCount = 40;
    const mistakeBinCounts = new Array<number>(mistakeBinCount).fill(0);
    for (const second of mistakeSeconds) {
      const bin = Math.min(mistakeBinCount - 1, Math.max(0, Math.floor(((second - chartStartSecond) / xSpan) * mistakeBinCount)));
      mistakeBinCounts[bin] = (mistakeBinCounts[bin] ?? 0) + 1;
    }
    const maxMistakeBin = Math.max(1, ...mistakeBinCounts);
    const mistakeBarMaxHeight = 22;
    const mistakeBars = mistakeBinCounts
      .map((count, i) => {
        if (count === 0) return null;
        const barHeight = Math.max(4, (count / maxMistakeBin) * mistakeBarMaxHeight);
        return {
          x: padding.left + (i / mistakeBinCount) * chartWidth,
          w: chartWidth / mistakeBinCount,
          y: padding.top + chartHeight - barHeight,
          height: barHeight,
          count,
        };
      })
      .filter((bar): bar is NonNullable<typeof bar> => bar !== null);
    const mistakeCount = mistakeSeconds.length;
    const yTicks = Array.from({ length: Math.floor(maxWpm / yTickInterval) + 1 }, (_, index) => index * yTickInterval);
    const xTickInterval = chooseSecondTickInterval(xSpan);
    const xTicks = Array.from(
      { length: Math.floor(xSpan / xTickInterval) + 1 },
      (_, index) => chartStartSecond + index * xTickInterval,
    ).filter((tick) => tick <= maxSecond);
    const renderedXTicks = xTicks.includes(maxSecond) ? xTicks : [...xTicks, maxSecond];
    return { maxSecond, hoverPoints, lines, areaPath, legend, hasCumulative, mistakeBars, mistakeCount, yTicks, renderedXTicks, maxWpm, xSpan, chartStartSecond, width, height, padding, chartWidth, chartHeight };
  }, [props.samples, props.durationSeconds, props.rawWpm, props.accuracy, props.timeline]);

  // Map the pointer's x onto the nearest sample. The overlay rect spans exactly
  // the plot area, so its rendered width maps linearly onto [0, xSpan].
  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const second = chartStartSecond + Math.max(0, Math.min(1, ratio)) * xSpan;
    let nearest = 0;
    for (let i = 1; i < hoverPoints.length; i += 1) {
      if (Math.abs(hoverPoints[i]!.second - second) < Math.abs(hoverPoints[nearest]!.second - second)) nearest = i;
    }
    setHover(nearest);
  };

  const active = hover != null ? hoverPoints[hover] : null;
  const strokeFor = (line: ChartLine) => (line.neutral ? "var(--color-base-content)" : "currentColor");

  return (
    <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-4" aria-labelledby={chartTitleId}>
      <div className="mb-1 flex items-center gap-2 text-lg font-semibold text-base-content">
        <span id={chartTitleId}>WPM Over Time</span>
        <InfoIcon label={hasCumulative
          ? "Cumulative net and raw WPM (your running average, converging to your final scores) plus the burst net line (instantaneous pace). Red bars along the bottom show where mistakes clustered. Hover to read exact values."
          : "Your net and raw WPM through the test. Red bars along the bottom show where mistakes clustered. Hover to read exact values."} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/70">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden="true" className={item.neutral ? "text-base-content/45" : "text-primary"}>
              <line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={item.kind === "dashed" ? "4 3" : undefined} />
            </svg>
            {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-error"><span className="inline-block h-2.5 w-1.5 rounded-sm bg-error" />Mistakes</span>
      </div>
      <div className="relative">
        <svg className="h-auto w-full overflow-visible text-primary" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartTitleId} ${chartDescriptionId}`}>
          <desc id={chartDescriptionId}>
            {hasCumulative ? "Cumulative and burst" : "Net and raw"} WPM over {maxSecond} seconds with {mistakeCount} mistakes. Final net WPM is {formatNumber(netFromRaw(props.rawWpm, props.accuracy), 1)}, raw WPM {formatNumber(props.rawWpm, 1)}.
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
          {mistakeBars.map((bar, index) => (
            <rect key={index} x={bar.x + 0.75} y={bar.y} width={Math.max(1, bar.w - 1.5)} height={bar.height} rx="1" fill="var(--color-error)" opacity="0.6">
              <title>{bar.count} mistake{bar.count > 1 ? "s" : ""}</title>
            </rect>
          ))}
          {lines.map((line, index) =>
            line.path ? (
              <path
                key={index}
                className={line.animate ? "score-draw-line" : undefined}
                d={line.path}
                fill="none"
                stroke={strokeFor(line)}
                opacity={line.neutral ? 0.45 : 1}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={line.width}
                strokeDasharray={line.dashed ? "6 6" : undefined}
              />
            ) : null,
          )}
          {active &&
            <g>
              <line x1={active.x} x2={active.x} y1={padding.top} y2={padding.top + chartHeight} stroke="currentColor" opacity="0.3" strokeDasharray="4 4" />
              <circle cx={active.x} cy={active.headlineY} r="4.5" fill="currentColor" stroke="var(--color-base-100)" strokeWidth="2" />
            </g>
          }
          {/* Transparent hit area over the plot for the hover readout. */}
          <rect
            x={padding.left}
            y={padding.top}
            width={chartWidth}
            height={chartHeight}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
        {active &&
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-base-content/10 bg-base-100 px-2.5 py-1.5 font-mono text-xs shadow-lg shadow-base-300/40"
            style={{ left: `${(active.x / width) * 100}%`, top: `${(active.headlineY / height) * 100}%` }}
          >
            <div className="mb-0.5 text-base-content/55">{Math.round(active.second)}s</div>
            {active.readouts.map((r) => (
              <div key={r.label} className={r.className}>{formatNumber(r.value, 0)} {r.label}</div>
            ))}
          </div>
        }
      </div>
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
          <Chip
            size="md"
            tone={improved ? "success" : delta < 0 ? "error" : "neutral"}
            className="font-mono"
            icon={<i className={`fa-solid ${improved ? "fa-arrow-trend-up" : delta < 0 ? "fa-arrow-trend-down" : "fa-minus"}`} aria-hidden="true" />}
          >
            {delta >= 0 ? "+" : ""}{formatNumber(delta, 1)}
          </Chip>
        </div>
      </div>
    </div>
  );
}

// Turns the just-completed test's keystroke timeline into up to three honest,
// actionable findings, each ending in a one-click drill on /drill built from
// exactly those keys. Owner-only: rendered on the live results card, never on a
// read-only shared score (which carries no timeline anyway).
function DiagnosisPanel(props: { score: ShareableScore }) {
  const boardLayout = props.score.layout ?? "qwerty";
  const { diagnosis, attempts, transitions } = useMemo(() => {
    const events = props.score.timeline ? decodeTimeline(props.score.timeline) : [];
    return {
      diagnosis: diagnose({ events, worstKeys: props.score.worstKeys }),
      // Folded onto the layout the test was typed on, so accent keys land on
      // their real cells (ledger decision 10).
      attempts: attemptsFromEvents(events, boardLayout),
      // This test's slowest transitions, framed against this test's own pace.
      transitions: worstTransitions(aggregateTransitions(events), 2),
    };
  }, [props.score.timeline, props.score.worstKeys, boardLayout]);

  // Only normal-mode tests carry a per-key timeline; without one there is nothing
  // to diagnose, so the panel stays hidden rather than showing an empty shell.
  if (!props.score.timeline || props.score.timeline.length === 0) return null;

  // Carry this exact test's config to /drill so its "Re-measure" CTA can round-trip
  // back home and headline a before→after delta (Phase 1.3, the loop's payoff).
  const s = props.score;
  const reMeasureParam = encodeURIComponent(JSON.stringify({
    beforeWpm: s.netWpm,
    config: {
      subMode: s.subMode,
      count: s.count,
      language: s.language,
      customLength: s.ranked === false,
      punctuation: s.punctuation ?? false,
      capitals: s.capitals ?? false,
      options: s.options ?? "",
    },
  }));
  const withReMeasure = (href: string) =>
    href.startsWith("/drill") ? `${href}&rm=${reMeasureParam}` : href;

  return (
    <div data-testid="diagnosis-panel" className="score-reveal mt-5 rounded-lg border border-base-content/10 bg-base-100/45 p-5" style={{ "--reveal-delay": "200ms" } as CSSProperties}>
      <div className="mb-1 flex items-center gap-2 text-lg font-semibold text-base-content">
        <span>Diagnosis</span>
        <InfoIcon label="The keys and transitions that cost you the most this test, computed from your keystroke timeline. Each finding opens a targeted drill built from those keys." />
      </div>
      <p className="mb-4 text-sm text-base-content/60">What slowed you down this test — and the one-click fix.</p>

      {diagnosis.tooShort ?
        <p className="text-base-content/75">Too short to diagnose — try a 30s+ test.</p>
        :
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          {/* Findings + drill CTAs on the left, the per-key heatmap alongside on
              the right (stacks on mobile) — keeps the panel short. */}
          <div className="flex flex-col gap-4">
            {(() => {
              // Transitions get their own richer "N× your average" treatment below,
              // so drop the generic slow-transitions finding from this list.
              const keyFindings = diagnosis.findings.filter((f) => f.kind !== "slow-transitions");
              if (keyFindings.length === 0 && transitions.length === 0) {
                return <p className="text-base-content/75">No clear weak spots this test — a clean, even run. Keep the pace up.</p>;
              }
              return (
                <>
                  {keyFindings.length > 0 &&
                    <ul className="flex flex-col gap-3">
                      {keyFindings.map((finding) => {
                        // Toughest-words drills those exact words verbatim; every
                        // other finding drills its keys.
                        const words = finding.kind === "tough-words" ? finding.detail.map((w) => w.word) : [];
                        const drillKeys = finding.kind === "tough-words" ? [] : toDrillKeys(finding.keys);
                        const targets = words.length > 0 ? words : drillKeys;
                        const href = words.length > 0 ? `/drill?words=${words.join(",")}` : `/drill?keys=${drillKeys.join(",")}`;
                        const noun = words.length > 0 ? "words" : "keys";
                        return (
                          <li
                            key={finding.kind}
                            className="flex flex-col gap-3 border-b border-base-content/10 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="text-base-content/90">{finding.summary}</span>
                            {targets.length > 0 ?
                              <Link
                                className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                href={withReMeasure(href)}
                                aria-label={`Drill these ${noun}: ${targets.join(", ")}`}
                                title={`Drill ${targets.join(", ")}`}
                              >
                                Drill these {noun}
                              </Link>
                              :
                              null
                            }
                          </li>
                        );
                      })}
                    </ul>
                  }
                  {transitions.length > 0 &&
                    <ul data-testid="diagnosis-transitions" className="flex flex-col gap-3">
                      {transitions.map((t) => (
                        <li key={t.pair} className="flex flex-col gap-3 border-b border-base-content/10 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-base-content/90">
                            <span className="font-mono font-bold">{t.from}→{t.to}</span> takes you {t.ratio.toFixed(1)}× your average pace.
                          </span>
                          <Link
                            className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            href={withReMeasure(`/drill?transitions=${t.from}${t.to}`)}
                            aria-label={`Drill the ${t.from} to ${t.to} transition`}
                          >
                            Drill {t.from}{t.to}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  }
                </>
              );
            })()}
          </div>

          <div className="border-t border-base-content/10 pt-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">
            <p className="mb-3 text-sm text-base-content/60">This test&apos;s per-key accuracy — drilled keys ringed.</p>
            <KeyHeatmap size="mini" layout={boardLayout} attempts={attempts} highlightKeys={diagnosis.drillKeys} testId="diagnosis-heatmap" />
          </div>
        </div>
      }
    </div>
  );
}

export function ShareableScoreCard(props: ShareableScoreCardProps) {
  const { score, shareUrl, readonly = false, isCreatingShare = false, canCreateShare = false, isSaving = false, signInHtmlFor, onCreateShare, onTestAgain } = props;
  // While the result is still saving (signed-in eager render) the share action is
  // a loader, not a sign-in prompt — the user is already signed in.
  const showSignInCta = !readonly && !shareUrl && !canCreateShare && !isSaving && !!signInHtmlFor;
  const [linkState, setLinkState] = useState<ActionState>("idle");
  const [imageState, setImageState] = useState<ActionState>("idle");
  // The share menu mints the link as soon as it opens; the link-out targets stay
  // inert (spinners) until the URL exists, then become live anchors. Failed mints
  // surface a retry rather than spinning forever.
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  // Detected client-side to avoid a hydration mismatch (the server has no
  // navigator). Gates the native-share button so tests without Web Share stay
  // deterministic (the X/Reddit links always render).
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);
  const shareText = buildShareText(score);
  const resetTimerRef = useRef<number | null>(null);
  const scoreCardRef = useRef<HTMLDivElement | null>(null);
  const shareImageRef = useRef<HTMLDivElement | null>(null);
  const modeText = formatModeText(score);
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

  // Mint the share URL in the background the moment the menu opens. Guarded so a
  // reopen (or the already-minted readonly case) never creates a duplicate row.
  const startMint = async () => {
    if (shareUrl || isCreatingShare) return;
    setShareFailed(false);
    try {
      const url = await onCreateShare?.();
      if (!url) setShareFailed(true);
    } catch {
      setShareFailed(true);
    }
  };

  const openShareMenu = () => {
    setShareMenuOpen(true);
    void startMint();
  };

  const handleNativeShare = async () => {
    const nextUrl = shareUrl ?? await onCreateShare?.();
    if (!nextUrl) return;
    try {
      await navigator.share({ title: "TypeCafe", text: shareText, url: nextUrl });
    } catch {
      // Cancelled by the user or unsupported mid-flight — nothing to do; the
      // X/Reddit links and copy button remain as fallbacks.
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

  // Flattery shares the ranking quality bar (honest-review 2026-07 §2): an
  // unranked card never wears a brag, streak, or 30-day-delta chip, whatever a
  // stale snapshot carries. Undefined ranked (legacy shares) keeps them.
  const showFlattery = score.ranked !== false;

  const metricItems = useMemo(() => [
    // Net WPM is the canonical headline "WPM": speed after errors. Raw stays
    // visible as a secondary stat (and in Performance Details) but never headlines.
    { label: "WPM", value: formatNumber(score.netWpm, 1), note: "After errors", info: "Net words per minute: your speed after incorrect keystrokes are subtracted. This is your headline WPM.", hero: true },
    { label: "Accuracy", value: `${formatNumber(score.accuracy, 2)}%`, note: "Correct keystrokes", info: "The percentage of typed keystrokes that matched the expected text." },
    { label: "Duration", value: `${formatInteger(score.durationSeconds)}s`, note: "Completed", info: "The completed test duration in seconds." },
    { label: "Raw WPM", value: formatNumber(score.rawWpm, 1), note: "Before errors", info: "Raw words per minute from all typed keystrokes, before error adjustment." },
  ], [score]);

  return (
    <section className="w-full max-w-7xl px-4 sm:px-6">
      <div
        ref={scoreCardRef}
        data-testid="score-screenshot-card"
        role="region"
        aria-label="Typing test results"
        className="rounded-xl border border-base-content/15 bg-base-200 p-5 text-base-content shadow-2xl shadow-base-300/40 sm:p-6"
      >
        {/* relative z-30: each .score-reveal is its own stacking context (opacity/
            transform), so without this the share dropdown would paint behind the
            metric cards below it. */}
        <div className="score-reveal relative z-30 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {score.dailyChallenge &&
                  <Chip
                    testId="score-daily-challenge-badge"
                    tone="primary"
                    size="md"
                    icon={<i className="fa-solid fa-calendar-day" aria-hidden="true" />}
                  >
                    Daily Challenge
                  </Chip>
                }
                {showFlattery && score.brag &&
                  <Chip
                    tone="primary"
                    size="md"
                    icon={<i className="fa-solid fa-trophy" aria-hidden="true" />}
                  >
                    {score.brag}
                  </Chip>
                }
                {showFlattery && typeof score.streak === "number" && score.streak > 0 &&
                  <Chip
                    testId="score-streak"
                    tone="primary"
                    size="md"
                    icon={<i className="fa-solid fa-fire" aria-hidden="true" />}
                  >
                    {score.streak}-day streak
                  </Chip>
                }
              </div>
              {showFlattery && typeof score.avgDelta === "number" &&
                <div className="mb-2">
                  <Chip
                    testId="avg-delta"
                    tone={score.avgDelta >= 0 ? "success" : "error"}
                    size="md"
                    icon={<i className={`fa-solid ${score.avgDelta >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}`} aria-hidden="true" />}
                  >
                    {formatNumber(Math.abs(score.avgDelta), 1)} WPM {score.avgDelta >= 0 ? "over" : "under"} your 30-day average
                  </Chip>
                </div>
              }
              <p className="text-sm text-base-content/65">{modeText} / {formatDate(score.createdAt)}</p>
              {(score.punctuation || score.capitals || score.ranked === false) &&
                <div className="mt-2 flex flex-wrap gap-2">
                  {score.punctuation &&
                    <Chip
                      tone="primary"
                      size="xs"
                      icon={<i className="fa-solid fa-quote-right" aria-hidden="true" />}
                    >
                      Punctuation
                    </Chip>
                  }
                  {score.capitals &&
                    <Chip
                      tone="primary"
                      size="xs"
                      icon={<i className="fa-solid fa-font" aria-hidden="true" />}
                    >
                      Capitals
                    </Chip>
                  }
                  {score.ranked === false &&
                    <Chip
                      tone="warning"
                      size="xs"
                      icon={<i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />}
                    >
                      Unranked
                    </Chip>
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
              <ToolbarMenu
                open={shareMenuOpen}
                onClose={() => setShareMenuOpen(false)}
                testId="share-menu"
                widthClassName="min-w-56"
                trigger={
                  <button
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    disabled={isSaving || (!shareUrl && !canCreateShare)}
                    onClick={() => (shareMenuOpen ? setShareMenuOpen(false) : openShareMenu())}
                    aria-haspopup="menu"
                    aria-expanded={shareMenuOpen}
                    aria-label="Share Score"
                    title={isSaving ? "Saving your score" : "Share your score"}
                  >
                    {isSaving ? <Spinner /> : <ShareIcon />}
                    <span>{isSaving ? "Saving..." : "Share Score"}</span>
                    <ChevronDownIcon />
                  </button>
                }
              >
                <div role="menu" className="flex flex-col gap-1">
                  <ShareMenuButton
                    icon={<i className="fa-solid fa-link w-4 text-center" aria-hidden="true" />}
                    label={linkState === "copied" ? "Link copied" : "Copy link"}
                    onClick={handleCopyLink}
                    disabled={!shareUrl}
                    loading={!shareUrl && !shareFailed}
                  />
                  <ShareMenuLink
                    icon={<i className="fa-brands fa-x-twitter w-4 text-center" aria-hidden="true" />}
                    label="Share on X"
                    href={shareUrl ? tweetHref(shareText, shareUrl) : undefined}
                    loading={!shareUrl && !shareFailed}
                    onSelect={() => setShareMenuOpen(false)}
                  />
                  <ShareMenuLink
                    icon={<i className="fa-brands fa-reddit-alien w-4 text-center" aria-hidden="true" />}
                    label="Share on Reddit"
                    href={shareUrl ? redditHref(shareText, shareUrl) : undefined}
                    loading={!shareUrl && !shareFailed}
                    onSelect={() => setShareMenuOpen(false)}
                  />
                  {canNativeShare &&
                    <ShareMenuButton
                      icon={<i className="fa-solid fa-share-nodes w-4 text-center" aria-hidden="true" />}
                      label="Share via device"
                      onClick={() => { void handleNativeShare(); setShareMenuOpen(false); }}
                      disabled={!shareUrl}
                      loading={!shareUrl && !shareFailed}
                    />
                  }
                  {shareFailed &&
                    <ShareMenuButton
                      icon={<i className="fa-solid fa-rotate-right w-4 text-center" aria-hidden="true" />}
                      label="Couldn't create link — Retry"
                      onClick={() => void startMint()}
                    />
                  }
                  <div className="my-1 border-t border-base-content/10" />
                  <ShareMenuButton
                    testId="share-menu-screenshot"
                    icon={<i className="fa-solid fa-image w-4 text-center" aria-hidden="true" />}
                    label={screenshotButtonLabel}
                    onClick={handleCopyImage}
                  />
                </div>
              </ToolbarMenu>
              :
              null
            }
          </div>
        </div>

        {score.reMeasure && <ReMeasureStrip beforeWpm={score.reMeasure.beforeWpm} afterWpm={score.netWpm} />}

        <div className="score-reveal mt-7 grid gap-4 md:grid-cols-4" style={{ "--reveal-delay": "80ms" } as CSSProperties}>
          {metricItems.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>

        <div className="score-reveal mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]" style={{ "--reveal-delay": "160ms" } as CSSProperties}>
          <WpmChart samples={score.wpmSamples} durationSeconds={score.durationSeconds} rawWpm={score.rawWpm} accuracy={score.accuracy} timeline={score.timeline} />
          <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-5">
            <h2 className="mb-3 text-lg font-semibold text-base-content">Performance Details</h2>
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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-lg font-semibold text-base-content">
              <span>Your Typed Text</span>
              <InfoIcon label="The text you typed during this test. Incorrect characters are highlighted in the theme error color." />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-base-content/80">
              <span><span className="mr-2 inline-block h-3 w-3 rounded-full bg-success" />{formatInteger(score.correctKeystrokes)} correct</span>
              <span><span className="mr-2 inline-block h-3 w-3 rounded-full bg-error" />{formatInteger(score.incorrectKeystrokes)} incorrect</span>
              <span className="text-primary">{formatNumber(score.accuracy, 2)}% accuracy</span>
            </div>
          </div>
          <div className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-base-content/10 bg-base-200/70 p-4 font-mono text-base leading-8 text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-lg" tabIndex={0} role="region" aria-label="Typed text from the completed test">
            <TypedText segments={score.typedSegments} plainText={score.typedText} />
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
