import { typingStyleSummary, type TypingStyleMetric } from "~/lib/profileStyle";

type TypingStyleProof = Parameters<typeof typingStyleSummary>[0];

const center = 120;
const radius = 72;

function radarPoint(value: number, index: number, total: number) {
    const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
    const scaled = radius * (value / 100);

    return {
        x: center + Math.cos(angle) * scaled,
        y: center + Math.sin(angle) * scaled,
    };
}

function labelPoint(index: number, total: number) {
    const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
    const scaled = radius + 10;

    return {
        x: center + Math.cos(angle) * scaled,
        y: center + Math.sin(angle) * scaled,
    };
}

function labelAnchor(index: number) {
    if (index === 1) return "start";
    if (index === 3) return "end";
    return "middle";
}

function polygonPoints(metrics: TypingStyleMetric[], scale = 1) {
    return metrics
        .map((metric, index) => radarPoint(metric.value * scale, index, metrics.length))
        .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(" ");
}

function RadarChart(props: { metrics: TypingStyleMetric[]; baselineMetrics?: TypingStyleMetric[]; title: string }) {
    const metrics = props.metrics;
    const baselineMetrics = props.baselineMetrics;
    const description = metrics.map((metric) => `${metric.label}: ${metric.displayValue}, ${metric.caption}`).join(", ");

    return (
        <div className="flex min-w-0 flex-col items-center gap-2">
            <svg
                className="h-64 w-full max-w-[19rem] shrink-0 overflow-visible text-primary"
                viewBox="0 0 240 240"
                role="img"
                aria-label={`Typing style radar for ${props.title}. ${description}.`}
                data-testid="typing-style-chart"
            >
                {[0.25, 0.5, 0.75, 1].map((scale) => (
                    <polygon
                        key={scale}
                        points={polygonPoints(metrics.map((metric) => ({ ...metric, value: 100 })), scale)}
                        className="fill-none stroke-base-content"
                        opacity="0.12"
                    />
                ))}
                {metrics.map((metric, index) => {
                    const edge = radarPoint(100, index, metrics.length);
                    return (
                        <line
                            key={metric.key}
                            x1={center}
                            y1={center}
                            x2={edge.x}
                            y2={edge.y}
                            className="stroke-base-content"
                            opacity="0.12"
                        />
                    );
                })}
                {baselineMetrics &&
                    <>
                        <polygon points={polygonPoints(baselineMetrics)} className="fill-base-content stroke-base-content" opacity="0.08" />
                        <polygon
                            points={polygonPoints(baselineMetrics)}
                            className="fill-none stroke-base-content"
                            opacity="0.38"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                            strokeLinejoin="round"
                        />
                    </>
                }
                <polygon points={polygonPoints(metrics)} className="fill-primary stroke-primary" opacity="0.2" />
                <polygon points={polygonPoints(metrics)} className="fill-none stroke-primary" strokeWidth="3" strokeLinejoin="round" />
                {metrics.map((metric, index) => {
                    const point = radarPoint(metric.value, index, metrics.length);
                    const label = labelPoint(index, metrics.length);
                    return (
                        <g key={`${metric.key}-label`}>
                            <circle cx={point.x} cy={point.y} r="4" className="fill-base-100 stroke-primary" strokeWidth="2.5">
                                <title>{`${metric.label}: ${metric.displayValue}, ${metric.caption}`}</title>
                            </circle>
                            <text
                                x={label.x}
                                y={label.y}
                                textAnchor={labelAnchor(index)}
                                dominantBaseline="middle"
                                className="fill-base-content text-[0.62rem] font-bold"
                            >
                                {metric.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <div className="flex items-center gap-4 text-[0.68rem] font-bold uppercase tracking-wide text-base-content/45">
                {baselineMetrics &&
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-5 rounded-full border border-base-content/40 bg-base-content/10" aria-hidden="true" />
                        Then
                    </span>
                }
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-5 rounded-full bg-primary" aria-hidden="true" />
                    Now
                </span>
            </div>
        </div>
    );
}

function MetricTile(props: { metric: TypingStyleMetric }) {
    return (
        <div className="min-w-0 rounded-lg border border-base-content/10 bg-base-100/35 px-3 py-2.5">
            <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
                        <i className={`fa-solid ${props.metric.icon} text-sm`} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-base-content/85">{props.metric.label}</div>
                        <div className="truncate text-xs font-semibold text-base-content/50">
                            {props.metric.caption} - {props.metric.detail}
                        </div>
                    </div>
                </div>
                <span className="shrink-0 font-mono text-sm font-bold text-base-content/70">{props.metric.displayValue}</span>
            </div>
        </div>
    );
}

function InsightLabel(props: { insight: ReturnType<typeof typingStyleSummary>["insight"] }) {
    return (
        <div className="mt-auto rounded-lg border border-primary/15 bg-primary/10 p-3 text-sm">
            <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/20">
                    <i className={`fa-solid ${props.insight.icon}`} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <div className="font-bold text-base-content/90">{props.insight.title}</div>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-base-content/55">{props.insight.body}</p>
                </div>
            </div>
        </div>
    );
}

export function TypingStylePanel(props: { proof: TypingStyleProof }) {
    const style = typingStyleSummary(props.proof);

    return (
        <section
            className="flex h-full w-full flex-col gap-4 rounded-lg border border-base-content/10 bg-base-200/45 p-5"
            data-testid="profile-typing-style"
            aria-labelledby="profile-typing-style-heading"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="profile-typing-style-heading" className="text-base font-bold">Typing style</h2>
            </div>
            <div className="grid flex-1 items-start gap-5 xl:grid-cols-[minmax(15rem,0.85fr)_minmax(20rem,1.15fr)]">
                <div className="flex min-w-0 justify-center xl:justify-center">
                    <RadarChart
                        metrics={style.metrics}
                        baselineMetrics={style.hasBaseline ? style.baselineMetrics : undefined}
                        title={style.title}
                    />
                </div>
                <div className="flex h-full min-w-0 flex-col justify-center gap-2">
                    {style.metrics.map((metric) => <MetricTile key={metric.key} metric={metric} />)}
                </div>
            </div>
            <InsightLabel insight={style.insight} />
        </section>
    );
}
