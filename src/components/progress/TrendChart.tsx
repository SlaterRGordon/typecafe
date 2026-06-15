import { useId, useMemo } from "react"
import type { TrendPoint } from "~/lib/progress"

interface TrendChartProps {
    points: TrendPoint[]
    // Rolling-average line aligned 1:1 with `points` (from trendSeries).
    rollingWpm: number[]
    // Accessible/visible title for the chart.
    title: string
}

// Pick a "nice" y-axis tick interval so the gridlines land on round WPM values.
function chooseTickInterval(maxValue: number): number {
    if (maxValue <= 50) return 10
    if (maxValue <= 120) return 20
    if (maxValue <= 300) return 50
    return 100
}

function formatDate(t: number): string {
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// Per-test WPM scatter with a rolling-average line over it — the chart that
// proves "am I getting faster?" (Phase 3 §3.1.2). Pure presentation over the
// payload from src/lib/progress.ts; renders sanely for 1, 10, or 1,000 points.
export function TrendChart(props: TrendChartProps) {
    const titleId = useId()
    const descId = useId()

    const layout = useMemo(() => {
        const width = 640
        const height = 260
        const padding = { top: 20, right: 20, bottom: 34, left: 44 }
        const chartWidth = width - padding.left - padding.right
        const chartHeight = height - padding.top - padding.bottom

        const wpms = props.points.map((p) => p.wpm)
        const maxValue = Math.max(...wpms, ...props.rollingWpm, 40)
        const tick = chooseTickInterval(maxValue)
        const maxY = Math.ceil(maxValue / tick) * tick
        const yTicks = Array.from({ length: Math.floor(maxY / tick) + 1 }, (_, i) => i * tick)

        // X by real time when the points span an interval; a single point (or an
        // all-same-instant burst) centres instead of dividing by zero.
        const minT = props.points.length > 0 ? props.points[0]!.t : 0
        const maxT = props.points.length > 0 ? props.points[props.points.length - 1]!.t : 0
        const tSpan = maxT - minT
        const xFor = (point: TrendPoint, index: number) => {
            if (props.points.length === 1) return padding.left + chartWidth / 2
            if (tSpan <= 0) return padding.left + (index / (props.points.length - 1)) * chartWidth
            return padding.left + ((point.t - minT) / tSpan) * chartWidth
        }
        const yFor = (value: number) => padding.top + chartHeight - (value / maxY) * chartHeight

        const scatter = props.points.map((point, index) => ({
            x: xFor(point, index),
            y: yFor(point.wpm),
            wpm: point.wpm,
        }))
        const linePoints = props.points.map((point, index) => ({
            x: xFor(point, index),
            y: yFor(props.rollingWpm[index] ?? point.wpm),
        }))
        const linePath = linePoints
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(" ")

        const xLabels = props.points.length === 1
            ? [{ x: padding.left + chartWidth / 2, label: formatDate(minT) }]
            : [
                { x: padding.left, label: formatDate(minT) },
                { x: padding.left + chartWidth, label: formatDate(maxT) },
            ]

        return { width, height, padding, chartWidth, chartHeight, maxY, yTicks, scatter, linePath, xLabels, minT, maxT }
    }, [props.points, props.rollingWpm])

    const pointRadius = props.points.length > 120 ? 2 : props.points.length > 40 ? 3 : 5

    return (
        <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-4">
            <div className="mb-3 text-lg font-semibold text-base-content" id={titleId}>{props.title}</div>
            <svg
                className="h-auto w-full overflow-visible text-primary"
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                data-testid="trend-chart"
            >
                <desc id={descId}>
                    WPM trend over {props.points.length} {props.points.length === 1 ? "test" : "tests"}.
                </desc>
                {layout.yTicks.map((value) => {
                    const y = layout.padding.top + layout.chartHeight - (value / layout.maxY) * layout.chartHeight
                    return (
                        <g key={value}>
                            <line x1={layout.padding.left} x2={layout.padding.left + layout.chartWidth} y1={y} y2={y} stroke="currentColor" opacity="0.14" />
                            <text x={layout.padding.left - 10} y={y + 4} textAnchor="end" className="fill-base-content text-xs" opacity="0.7">{value}</text>
                        </g>
                    )
                })}
                {layout.xLabels.map((label, i) => (
                    <text key={i} x={label.x} y={layout.height - 8} textAnchor={i === 0 && layout.xLabels.length > 1 ? "start" : i === layout.xLabels.length - 1 && layout.xLabels.length > 1 ? "end" : "middle"} className="fill-base-content text-xs" opacity="0.7">{label.label}</text>
                ))}
                {layout.linePath && props.points.length > 1
                    ? <path d={layout.linePath} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                    : null}
                {layout.scatter.map((point, index) => (
                    <circle key={index} cx={point.x} cy={point.y} r={pointRadius} fill="currentColor" opacity="0.5" />
                ))}
            </svg>
        </div>
    )
}
