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
    // Practice interaction (all optional — score-card/progress stay read-only):
    // keys to badge with a lock (excluded from the drill set), a click handler
    // that makes cells interactive, and the live "next key" to ring.
    lockedKeys?: ReadonlySet<string>,
    onKeyClick?: (key: string) => void,
    currentKey?: string,
    className?: string,
    testId?: string,
}

// Small padlock marking a key that's excluded from the current drill set.
function LockBadge() {
    return (
        <span className="pointer-events-none absolute right-0.5 top-0.5 opacity-70">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2Z" />
            </svg>
        </span>
    )
}

const HEATMAP_LAYOUT = HEATMAP_ROWS

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
    mini: "!min-w-[8rem] sm:!min-w-[8rem]",
}

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
    const { attempts, size = "full", includeSpace = true, highlightKeys, lockedKeys, onKeyClick, currentKey } = props
    const showPercent = props.showPercent ?? size === "full"
    const { lowColor, highColor } = useHeatmapColors()
    const highlight = new Set(highlightKeys)
    const interactive = !!onKeyClick

    const rowClass = ROW_CLASS_BY_SIZE[size]
    const keyClass = KEY_CLASS_BY_SIZE[size]
    const spaceClass = SPACE_CLASS_BY_SIZE[size]

    const renderKey = (key: string, isSpace = false) => {
        const cell = heatmapCell(key, lookupAttempt(attempts, key))
        const color = accuracyColor(cell.accuracy, lowColor, highColor)
        const isCurrent = currentKey != null && key === currentKey
        const ringed = isCurrent || highlight.has(key)
        const isLocked = !!lockedKeys?.has(key)
        const label = key === HEATMAP_SPACE ? "space" : key
        const keyLabel = isSpace ? "space" : key

        return (
            <kbd
                key={key}
                onClick={interactive ? () => onKeyClick!(key) : undefined}
                role={interactive ? "button" : undefined}
                className={`${keyClass} ${isSpace ? spaceClass : ""} ${ringed ? "ring-2 ring-primary ring-offset-1 ring-offset-base-200" : ""} ${interactive ? "cursor-pointer select-none" : ""} ${isLocked ? "opacity-60" : ""}`}
                style={{ backgroundColor: color }}
                title={`${label}: ${cell.hasData ? `${cell.accuracy}%` : "no data"}${isLocked ? " (locked \u2014 click to add)" : ""}`}
            >
                <span className={`leading-none ${showPercent ? "absolute left-1 top-1 text-sm sm:left-1.5 sm:top-1.5 sm:text-base" : ""}`}>
                    {showPercent ? keyLabel : isSpace ? "\u00a0" : key}
                </span>
                {showPercent &&
                    <span className="pointer-events-none absolute bottom-0.5 right-1 text-[0.6rem] leading-none text-white/95 drop-shadow-sm sm:bottom-1 sm:right-1.5 sm:text-xs">
                        {cell.accuracy}%
                    </span>
                }
                {isLocked && <LockBadge />}
            </kbd>
        )
    }

    return (
        <div
            className={`typecafe-key-heatmap flex flex-col items-center gap-[0.25rem] ${props.className ?? ""}`}
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
