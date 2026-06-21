import type { CSSProperties } from "react"
import { hslToHex } from "~/utils/convertColor"
import { useSecondaryStyle, useStyle } from "~/utils/hooks/useMutationObserver"
import {
    HEATMAP_ROWS,
    HEATMAP_SPACE,
    accuracyColor,
    heatmapCell,
    lookupAttempt,
    type KeyAttempt,
} from "~/lib/heatmap"

export type KeyHeatmapSize = "mini" | "full"

interface KeyHeatmapProps {
    // Per-key accuracy source: a live session Map or serialized aggregates.
    // Data-source agnostic by design: this-test, lifetime, or any subset.
    attempts: ReadonlyMap<string, KeyAttempt> | Record<string, KeyAttempt>,
    // "full" (Practice/progress): large keys with a per-key percentage badge.
    // "mini" (score card): compact, label-only keys for an at-a-glance read.
    size?: KeyHeatmapSize,
    includeSpace?: boolean,
    // Override the per-cell percentage label; defaults on for full, off for mini.
    showPercent?: boolean,
    // Keys to ring, e.g. the diagnosed keys the user is about to drill.
    highlightKeys?: string[],
    className?: string,
    testId?: string,
}

const HEATMAP_LAYOUT = [
    { row: HEATMAP_ROWS[0], offsetUnits: 0 },
    { row: HEATMAP_ROWS[1], offsetUnits: 0.55 },
    { row: HEATMAP_ROWS[2], offsetUnits: 1.6 },
] as const

const UNIT_BY_SIZE: Record<KeyHeatmapSize, string> = {
    full: "clamp(1.8rem, 6vw, 2.9rem)",
    mini: "1.45rem",
}

const GAP_BY_SIZE: Record<KeyHeatmapSize, string> = {
    full: "clamp(0.125rem, 0.6vw, 0.35rem)",
    mini: "0.125rem",
}

const SPACE_WIDTH_UNITS = 6.2
const SPACE_OFFSET_UNITS = 2.55

// A reusable per-key accuracy heatmap. The rendering is intentionally the same
// primitive for Practice, score-card diagnosis, beat-run compare, and /progress.
export function KeyHeatmap(props: KeyHeatmapProps) {
    const { attempts, size = "full", includeSpace = true, highlightKeys } = props
    const showPercent = props.showPercent ?? size === "full"
    const style = useStyle()
    const secondaryStyle = useSecondaryStyle()

    const lowColor = style ? hslToHex(style) : "#ffffff"
    const highColor = secondaryStyle ? hslToHex(secondaryStyle) : "#000000"
    const highlight = new Set(highlightKeys)

    const unit = UNIT_BY_SIZE[size]
    const gap = GAP_BY_SIZE[size]
    const keyHeight = size === "full"
        ? "calc(var(--heatmap-key-unit) * 0.92)"
        : "calc(var(--heatmap-key-unit) * 0.9)"
    const keyClass = size === "full"
        ? "relative flex shrink-0 items-center justify-center rounded-md border border-base-content/10 font-mono text-sm font-semibold shadow-sm sm:text-base"
        : "relative flex shrink-0 items-center justify-center rounded-[0.25rem] border border-base-content/10 font-mono text-xs font-semibold"

    const renderKey = (key: string, isSpace = false) => {
        const cell = heatmapCell(key, lookupAttempt(attempts, key))
        const color = accuracyColor(cell.accuracy, lowColor, highColor)
        const ringed = highlight.has(key)
        const label = key === HEATMAP_SPACE ? "space" : key
        const width = isSpace ? `calc(var(--heatmap-key-unit) * ${SPACE_WIDTH_UNITS})` : "var(--heatmap-key-unit)"

        return (
            <kbd
                key={key}
                className={`${keyClass} ${ringed ? "ring-2 ring-primary ring-offset-1 ring-offset-base-200" : ""}`}
                style={{ backgroundColor: color, width, height: keyHeight }}
                title={`${label}: ${cell.hasData ? `${cell.accuracy}%` : "no data"}`}
            >
                <span aria-hidden={isSpace} className="leading-none">{isSpace ? "" : key}</span>
                {showPercent &&
                    <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded-sm bg-base-100/75 px-0.5 text-[0.55rem] font-semibold leading-none text-base-content/80 shadow-sm">
                        {cell.accuracy}%
                    </span>
                }
            </kbd>
        )
    }

    return (
        <div
            className={`typecafe-key-heatmap flex flex-col items-center ${props.className ?? ""}`}
            data-testid={props.testId}
            style={{ "--heatmap-key-unit": unit, "--heatmap-key-gap": gap } as CSSProperties}
        >
            {HEATMAP_LAYOUT.map(({ row, offsetUnits }) => (
                <div
                    key={row}
                    className="flex justify-center"
                    style={{
                        gap: "var(--heatmap-key-gap)",
                        marginTop: gap,
                        marginLeft: `calc(var(--heatmap-key-unit) * ${offsetUnits})`,
                    }}
                >
                    {row.split("").map((key) => renderKey(key))}
                </div>
            ))}
            {includeSpace &&
                <div
                    className="flex justify-center"
                    style={{
                        gap: "var(--heatmap-key-gap)",
                        marginTop: gap,
                        marginLeft: `calc(var(--heatmap-key-unit) * ${SPACE_OFFSET_UNITS})`,
                    }}
                >
                    {renderKey(HEATMAP_SPACE, true)}
                </div>
            }
        </div>
    )
}
