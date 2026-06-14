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
    // Per-key accuracy source — a live session Map or serialized aggregates.
    // Data-source agnostic by design: this-test, lifetime, or any subset.
    attempts: ReadonlyMap<string, KeyAttempt> | Record<string, KeyAttempt>,
    // "full" (Practice, later /progress): large keys with a per-key percentage.
    // "mini" (score card): compact, label-only squares for an at-a-glance read.
    size?: KeyHeatmapSize,
    includeSpace?: boolean,
    // Override the per-cell percentage label; defaults on for full, off for mini.
    showPercent?: boolean,
    // Keys to ring (e.g. the diagnosed keys the user is about to drill).
    highlightKeys?: string[],
    className?: string,
    testId?: string,
}

// A reusable per-key accuracy heatmap. The single rendering of the keyboard
// shading used by Practice, the score-card diagnosis, and (later) /progress —
// so none of them re-implement the Practice keyboard's color math.
export function KeyHeatmap(props: KeyHeatmapProps) {
    const { attempts, size = "full", includeSpace = true, highlightKeys } = props
    const showPercent = props.showPercent ?? size === "full"
    const style = useStyle()
    const secondaryStyle = useSecondaryStyle()

    const lowColor = style ? hslToHex(style) : "#ffffff"
    const highColor = secondaryStyle ? hslToHex(secondaryStyle) : "#000000"
    const highlight = new Set(highlightKeys)

    const keyClass = size === "full" ? "kbd kbd-md sm:kbd-lg pt-2" : "kbd kbd-sm"
    const rowClass = size === "full"
        ? "flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1"
        : "flex justify-center gap-0.5 w-full"
    const spaceWidth = size === "full" ? "min-w-[17.5rem]" : "min-w-[10rem]"

    const renderKey = (key: string, isSpace = false) => {
        const cell = heatmapCell(key, lookupAttempt(attempts, key))
        const color = accuracyColor(cell.accuracy, lowColor, highColor)
        const ringed = highlight.has(key)

        return (
            <kbd
                key={key}
                className={`relative ${keyClass} ${isSpace ? spaceWidth : ""} ${ringed ? "ring-2 ring-primary ring-offset-1 ring-offset-base-200" : ""}`}
                style={{ backgroundColor: color }}
                title={`${key === HEATMAP_SPACE ? "space" : key}: ${cell.hasData ? `${cell.accuracy}%` : "no data"}`}
            >
                {showPercent &&
                    <div className={`absolute top-0 ${isSpace ? "left-0" : "right-0"} px-1 text-xs text-base-content`}>
                        {cell.accuracy}%
                    </div>
                }
                {isSpace ? <>&nbsp;</> : key}
            </kbd>
        )
    }

    return (
        <div className={`typecafe-key-heatmap flex flex-col items-center ${props.className ?? ""}`} data-testid={props.testId}>
            {HEATMAP_ROWS.map((row) => (
                <div key={row} className={rowClass}>
                    {row.split("").map((key) => renderKey(key))}
                </div>
            ))}
            {includeSpace &&
                <div className={rowClass}>
                    {renderKey(HEATMAP_SPACE, true)}
                </div>
            }
        </div>
    )
}
