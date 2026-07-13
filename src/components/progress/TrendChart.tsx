import { useId, useMemo, useState, type ReactNode } from "react"
import type { TrendPoint } from "~/lib/progress"

interface TrendChartProps {
    // X source - only `t` is read (createdAt ms); aligned 1:1 with values/trend.
    points: TrendPoint[]
    values: number[]
    // The straight trend (least-squares fit) line, aligned 1:1 with `points`.
    trend: number[]
    // Optional secondary line at its own x positions (e.g. best WPM per day).
    // Drawn lighter/dashed so it reads as the ceiling behind the trend.
    secondary?: { t: number; value: number }[]
    secondaryLabel?: string
    trendLabel?: string
    pointKind?: "test" | "daily"
    title: string
    // "zero" anchors the y-axis at 0 (WPM); "fit" zooms to the data range
    // (accuracy, which clusters near the top and would look flat from 0).
    baseline?: "zero" | "fit"
    valueSuffix?: string
    // Optional controls rendered at the top-right of the header (e.g. metric tabs).
    action?: ReactNode
}

// Pick a "nice" y-axis tick interval so the gridlines land on round values.
function chooseTickInterval(maxValue: number): number {
    if (maxValue <= 50) return 10
    if (maxValue <= 120) return 20
    if (maxValue <= 300) return 50
    return 100
}

// A "nice" tick (…0.5, 1, 2, 5, 10…) sized to a data range, targeting ~4
// gridlines. Used by the zoom-to-fit axis so a narrow band (e.g. accuracy
// 92–99%) gets a fine tick instead of being squashed against a coarse one.
function chooseFitTick(range: number): number {
    if (range <= 0) return 1
    const rough = range / 4
    const pow = Math.pow(10, Math.floor(Math.log10(rough)))
    const norm = rough / pow
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
    return nice * pow
}

// Extend a polyline's first and last segments out to the given x edges, so the
// line spans the full plot width along its own slope instead of floating inset
// between the first and last data points.
export function extendToEdges(pts: { x: number; y: number }[], left: number, right: number) {
    if (pts.length < 2) return pts
    const a = pts[0]!, b = pts[1]!, y = pts[pts.length - 2]!, z = pts[pts.length - 1]!
    const at = (p: { x: number; y: number }, q: { x: number; y: number }, x: number) =>
        q.x === p.x ? p.y : p.y + (q.y - p.y) * (x - p.x) / (q.x - p.x)
    return [{ x: left, y: at(a, b, left) }, ...pts, { x: right, y: at(z, y, right) }]
}

function toPath(pts: { x: number; y: number }[]): string {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
}

function formatDate(t: number, withYear = false): string {
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) })
}

function formatTooltipDate(t: number): string {
    return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function formatMetric(value: number, suffix = ""): string {
    return `${value.toFixed(1)}${suffix}`
}

// Per-test scatter with a rolling-average line - the chart that proves "am I
// getting faster?" (§3.1.2). Pure presentation; renders for 1, 10, or 1,000 points.
export function TrendChart(props: TrendChartProps) {
    const titleId = useId()
    const descId = useId()
    const baseline = props.baseline ?? "zero"
    const suffix = props.valueSuffix ?? ""
    const [activeIndex, setActiveIndex] = useState<number | null>(null)

    const layout = useMemo(() => {
        const width = 640
        // The SVG is width-responsive, so its viewBox height is the actual
        // vertical budget. Keep the plot compact enough for the dashboard fold.
        const height = 140
        const padding = { top: 12, right: 20, bottom: 24, left: 44 }
        const chartWidth = width - padding.left - padding.right
        const chartHeight = height - padding.top - padding.bottom

        const secondaryValues = props.secondary?.map((s) => s.value) ?? []
        const all = [...props.values, ...props.trend, ...secondaryValues]
        const dataMax = Math.max(...all, baseline === "zero" ? 40 : -Infinity)
        const dataMin = Math.min(...all, Infinity)

        // Fit zooms to the data band with a proportional tick (accuracy clusters
        // near 100, so a 0–100 or coarse-tick axis would waste most of the panel);
        // zero anchors at 0 for WPM. The half-tick pad keeps the lowest point off
        // the axis floor without re-wasting the space we just reclaimed.
        const tick = baseline === "zero" ? chooseTickInterval(dataMax) : chooseFitTick(dataMax - dataMin)
        const minY = baseline === "zero" ? 0 : Math.max(0, Math.floor((dataMin - tick / 2) / tick) * tick)
        const rawMaxY = Math.ceil((dataMax + (baseline === "zero" ? 0 : tick / 2)) / tick) * tick
        const maxY = suffix === "%" ? Math.min(rawMaxY, 100) : rawMaxY // a percentage can't exceed 100
        const yTicks = Array.from({ length: Math.floor((maxY - minY) / tick) + 1 }, (_, i) => minY + i * tick)

        // Domain must cover every plotted x, including the secondary (best/day)
        // line. Best/day points sit at noon-UTC of each day, which can fall
        // outside the scatter's first/last test time - pinning the domain to the
        // scatter alone would push that line off the left/right edge.
        const allT = [...props.points.map((p) => p.t), ...(props.secondary?.map((s) => s.t) ?? [])]
        const minT = allT.length > 0 ? Math.min(...allT) : 0
        const maxT = allT.length > 0 ? Math.max(...allT) : 0
        const tSpan = maxT - minT
        const xForT = (t: number) => tSpan <= 0 ? padding.left + chartWidth / 2 : padding.left + ((t - minT) / tSpan) * chartWidth
        const xFor = (point: TrendPoint, index: number) => {
            if (props.points.length === 1) return padding.left + chartWidth / 2
            if (tSpan <= 0) return padding.left + (index / (props.points.length - 1)) * chartWidth
            return xForT(point.t)
        }
        const yFor = (value: number) => padding.top + chartHeight - ((value - minY) / (maxY - minY)) * chartHeight

        const rightEdge = padding.left + chartWidth
        const scatter = props.points.map((point, index) => ({ x: xFor(point, index), y: yFor(props.values[index] ?? 0) }))
        const linePoints = props.points.map((point, index) => ({ x: xFor(point, index), y: yFor(props.trend[index] ?? props.values[index] ?? 0) }))
        // Both lines run the full plot width along their own slope (edge to edge),
        // rather than stopping at the first/last data point.
        const linePath = toPath(extendToEdges(linePoints, padding.left, rightEdge))
        const secondaryPoints = (props.secondary ?? []).map((s) => ({ x: xForT(s.t), y: yFor(s.value) }))
        const secondaryPath = toPath(extendToEdges(secondaryPoints, padding.left, rightEdge))

        // Show the year on the axis labels once the data spans more than one
        // calendar year, so "Jun" alone isn't ambiguous across years.
        const multiYear = new Date(minT).getFullYear() !== new Date(maxT).getFullYear()
        const xLabels = props.points.length === 1
            ? [{ x: padding.left + chartWidth / 2, label: formatDate(minT, multiYear) }]
            : [
                { x: padding.left, label: formatDate(minT, multiYear) },
                { x: padding.left + chartWidth, label: formatDate(maxT, multiYear) },
            ]

        return { width, height, padding, chartWidth, chartHeight, minY, maxY, yTicks, scatter, linePath, secondaryPath, xLabels }
    }, [props.points, props.values, props.trend, props.secondary, baseline, suffix])

    const pointRadius = props.points.length > 120 ? 2 : props.points.length > 40 ? 3 : 5
    const yFor = (value: number) => layout.padding.top + layout.chartHeight - ((value - layout.minY) / (layout.maxY - layout.minY)) * layout.chartHeight
    const activePoint = activeIndex === null ? null : props.points[activeIndex]
    const activeScatterPoint = activeIndex === null ? null : layout.scatter[activeIndex]
    const pointLines = (point: TrendPoint) => props.pointKind === "daily" ? [
        formatTooltipDate(point.t),
        `Median net WPM ${formatMetric(point.wpm)}`,
        ...(typeof point.bestWpm === "number" ? [`Daily best ${formatMetric(point.bestWpm)}`] : []),
        `${point.tests ?? 1} ranked ${(point.tests ?? 1) === 1 ? "test" : "tests"}`,
        `Average accuracy ${formatMetric(point.accuracy, "%")}`,
        ...(typeof point.consistency === "number" ? [`Average consistency ${formatMetric(point.consistency, "%")}`] : []),
    ] : [
        formatTooltipDate(point.t),
        `Net WPM ${formatMetric(point.wpm)}`,
        `Accuracy ${formatMetric(point.accuracy, "%")}`,
        ...(typeof point.consistency === "number" ? [`Consistency ${formatMetric(point.consistency, "%")}`] : []),
    ]
    const tooltipLines = activePoint ? pointLines(activePoint) : []
    const tooltip = activePoint && activeScatterPoint ? (() => {
        const width = props.pointKind === "daily" ? 208 : 176
        const height = 30 + tooltipLines.length * 16
        const x = Math.min(Math.max(activeScatterPoint.x - width / 2, 6), layout.width - width - 6)
        const y = activeScatterPoint.y - height - 12 >= 6 ? activeScatterPoint.y - height - 12 : activeScatterPoint.y + 14

        return { x, y, width, height }
    })() : null

    return (
        <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-4">
            <div className="mb-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-base-content" id={titleId}>{props.title}</div>
                    {props.action}
                </div>
                {props.secondary && props.secondary.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 bg-current opacity-90" />{props.trendLabel ?? "Trend"}</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 bg-current opacity-40" style={{ borderTop: "2px dashed currentColor", background: "transparent" }} />{props.secondaryLabel ?? "Best/day"}</span>
                    </div>
                )}
            </div>
            <svg
                className="h-auto w-full overflow-visible text-primary"
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                data-testid="trend-chart"
            >
                <desc id={descId}>
                    {props.title} over {props.points.length} {props.pointKind === "daily" ? (props.points.length === 1 ? "practiced day" : "practiced days") : (props.points.length === 1 ? "test" : "tests")}.
                </desc>
                {layout.yTicks.map((value) => {
                    const y = yFor(value)
                    return (
                        <g key={value}>
                            <line x1={layout.padding.left} x2={layout.padding.left + layout.chartWidth} y1={y} y2={y} stroke="currentColor" opacity="0.14" />
                            <text x={layout.padding.left - 10} y={y + 4} textAnchor="end" className="fill-base-content text-xs" opacity="0.7">{Number.isInteger(value) ? value : value.toFixed(1)}{suffix}</text>
                        </g>
                    )
                })}
                {layout.xLabels.map((label, i) => (
                    <text key={i} x={label.x} y={layout.height - 8} textAnchor={i === 0 && layout.xLabels.length > 1 ? "start" : i === layout.xLabels.length - 1 && layout.xLabels.length > 1 ? "end" : "middle"} className="fill-base-content text-xs" opacity="0.7">{label.label}</text>
                ))}
                {layout.secondaryPath
                    ? <path d={layout.secondaryPath} fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" data-testid="trend-secondary" />
                    : null}
                {layout.linePath && props.points.length > 1
                    ? <path d={layout.linePath} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                    : null}
                <g role="list" aria-label={`${props.title} data points`}>
                    {layout.scatter.map((scatterPoint, index) => {
                        const point = props.points[index]
                        const lines = point ? pointLines(point) : []

                        return (
                            <g
                                key={index}
                                data-testid={`trend-point-${index}`}
                                role="listitem"
                                tabIndex={0}
                                aria-label={lines.join(", ")}
                                onMouseEnter={() => setActiveIndex(index)}
                                onMouseLeave={() => setActiveIndex((current) => current === index ? null : current)}
                                onFocus={() => setActiveIndex(index)}
                                onBlur={() => setActiveIndex((current) => current === index ? null : current)}
                                className="outline-none"
                            >
                                <circle cx={scatterPoint.x} cy={scatterPoint.y} r={Math.max(pointRadius + 9, 14)} fill="transparent" />
                                <circle
                                    cx={scatterPoint.x}
                                    cy={scatterPoint.y}
                                    r={pointRadius}
                                    fill="currentColor"
                                    opacity={activeIndex === index ? "0.95" : "0.5"}
                                    stroke="currentColor"
                                    strokeWidth={activeIndex === index ? 3 : 0}
                                />
                            </g>
                        )
                    })}
                </g>
                {tooltip && (
                    <g data-testid="trend-tooltip" pointerEvents="none">
                        <rect
                            x={tooltip.x}
                            y={tooltip.y}
                            width={tooltip.width}
                            height={tooltip.height}
                            rx="6"
                            className="fill-base-100 stroke-base-content/15"
                        />
                        {tooltipLines.map((line, index) => (
                            <text
                                key={line}
                                x={tooltip.x + 12}
                                y={tooltip.y + 20 + index * 16}
                                className={`fill-base-content text-xs ${index === 0 ? "font-semibold" : ""}`}
                            >
                                {line}
                            </text>
                        ))}
                    </g>
                )}
            </svg>
        </div>
    )
}
