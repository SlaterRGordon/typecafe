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
export type KeyHeatmapPresentation = "keyboard" | "panel"

interface KeyHeatmapProps {
    // Per-key accuracy source: a live session Map or serialized aggregates.
    // Data-source agnostic by design: this-test, lifetime, or any subset.
    attempts: ReadonlyMap<string, KeyAttempt> | Record<string, KeyAttempt>,
    // "full" (Practice/progress): large keys with a per-key percentage badge.
    // "mini" (score card): compact, label-only keys for an at-a-glance read.
    size?: KeyHeatmapSize,
    presentation?: KeyHeatmapPresentation,
    includeSpace?: boolean,
    // Override the per-cell percentage label; defaults on for full, off for mini.
    showPercent?: boolean,
    // Keys to ring, e.g. the diagnosed keys the user is about to drill.
    highlightKeys?: string[],
    className?: string,
    testId?: string,
}

const HEATMAP_LAYOUT = [
    HEATMAP_ROWS[0],
    HEATMAP_ROWS[1],
    HEATMAP_ROWS[2],
] as const

const ROW_CLASS_BY_SIZE: Record<KeyHeatmapSize, string> = {
    full: "flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1",
    mini: "flex justify-center gap-0.5 w-full",
}

const KEY_CLASS_BY_SIZE: Record<KeyHeatmapSize, string> = {
    full: "relative kbd kbd-md sm:kbd-lg font-mono",
    mini: "relative kbd kbd-sm font-mono text-xs",
}

const SPACE_CLASS_BY_SIZE: Record<KeyHeatmapSize, string> = {
    full: "!min-w-[14rem] sm:!min-w-[17.5rem]",
    mini: "!min-w-[8rem] sm:!min-w-[10rem]",
}

const PANEL_ROW_CLASS = "flex justify-center gap-0.5 py-1 w-full sm:gap-1.5 md:gap-2"
const PANEL_KEY_CLASS = "relative flex h-10 w-8 shrink-0 rounded-md border border-white/20 px-1.5 py-1.5 font-mono text-sm font-semibold text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.16)] sm:h-14 sm:w-16 sm:px-2 sm:text-lg md:h-16 md:w-16"
const PANEL_SPACE_CLASS = "!w-[12rem] sm:!w-[20rem] md:!w-[22rem]"

function useHeatmapColors() {
    const style = useStyle()
    const secondaryStyle = useSecondaryStyle()

    return {
        lowColor: style ? hslToHex(style) : "#ffffff",
        highColor: secondaryStyle ? hslToHex(secondaryStyle) : "#000000",
    }
}

export function KeyHeatmapLegend() {
    const { lowColor, highColor } = useHeatmapColors()
    const swatches = [78, 86, 94, 100]

    return (
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-base-content/80 sm:justify-end sm:gap-3 sm:text-sm">
            <span>Lower accuracy</span>
            <div className="flex items-center gap-1.5" aria-hidden="true">
                {swatches.map((accuracy) => (
                    <span
                        key={accuracy}
                        className="h-5 w-5 rounded border border-white/15 shadow-sm"
                        style={{ backgroundColor: accuracyColor(accuracy, lowColor, highColor) }}
                    />
                ))}
            </div>
            <span>Higher accuracy</span>
        </div>
    )
}

// A reusable per-key accuracy heatmap. The rendering is intentionally the same
// primitive for Practice, score-card diagnosis, beat-run compare, and /progress.
export function KeyHeatmap(props: KeyHeatmapProps) {
    const { attempts, size = "full", presentation = "keyboard", includeSpace = true, highlightKeys } = props
    const showPercent = props.showPercent ?? size === "full"
    const { lowColor, highColor } = useHeatmapColors()
    const highlight = new Set(highlightKeys)

    const isPanel = presentation === "panel"
    const rowClass = isPanel ? PANEL_ROW_CLASS : ROW_CLASS_BY_SIZE[size]
    const keyClass = isPanel ? PANEL_KEY_CLASS : KEY_CLASS_BY_SIZE[size]
    const spaceClass = isPanel ? PANEL_SPACE_CLASS : SPACE_CLASS_BY_SIZE[size]

    const renderKey = (key: string, isSpace = false) => {
        const cell = heatmapCell(key, lookupAttempt(attempts, key))
        const color = accuracyColor(cell.accuracy, lowColor, highColor)
        const ringed = highlight.has(key)
        const label = key === HEATMAP_SPACE ? "space" : key
        const keyLabel = isPanel ? (isSpace ? "SPACE" : key.toUpperCase()) : key

        return (
            <kbd
                key={key}
                className={`${keyClass} ${isSpace ? spaceClass : ""} ${ringed ? "ring-2 ring-primary ring-offset-1 ring-offset-base-200" : ""}`}
                style={{ backgroundColor: color }}
                title={`${label}: ${cell.hasData ? `${cell.accuracy}%` : "no data"}`}
            >
                {isPanel ? (
                    <>
                        <span className="leading-none">{keyLabel}</span>
                        {showPercent &&
                            <span className="pointer-events-none absolute bottom-1 right-1 text-[0.65rem] font-bold leading-none text-white/95 drop-shadow-sm sm:bottom-2 sm:right-2 sm:text-base">
                                {cell.accuracy}%
                            </span>
                        }
                    </>
                ) : (
                    <>
                        <span aria-hidden={isSpace} className="leading-none">{isSpace ? "\u00a0" : key}</span>
                        {showPercent &&
                            <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded-sm bg-base-100/75 px-0.5 text-[0.55rem] font-semibold leading-none text-base-content/80 shadow-sm">
                                {cell.accuracy}%
                            </span>
                        }
                    </>
                )}
            </kbd>
        )
    }

    return (
        <div
            className={`typecafe-key-heatmap flex flex-col items-center ${props.className ?? ""}`}
            data-testid={props.testId}
        >
            {HEATMAP_LAYOUT.map((row) => (
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
