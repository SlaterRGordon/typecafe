import { useEffect, useRef } from "react"
import { hslToHex, readableTextColor } from "~/utils/convertColor"
import { getActiveKey, subscribeActiveKey } from "~/components/typer/keySignal"
import { useSecondaryStyle, useStyle } from "~/utils/hooks/useMutationObserver"
import {
    HEATMAP_SPACE,
    accuracyColor,
    heatmapCell,
    lookupAttempt,
    type KeyAttempt,
} from "~/lib/heatmap"
import { boardFor, composedFor, type KeyCap, type Layer } from "~/lib/keyboardLayout"
import { useLayout } from "~/hooks/useLayout"

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
    // False renders a plain board: no accuracy shading, no percentages — the
    // same geometry (layers, dead styling, corner glyphs) as a neutral teaching
    // surface (the train board). Defaults true: every heatmap stays a heatmap.
    showAccuracy?: boolean,
    // Keys to ring, e.g. the diagnosed keys the user is about to drill.
    highlightKeys?: string[],
    // Practice interaction (all optional — score-card/progress stay read-only):
    // keys to badge with a lock (excluded from the drill set), a click handler
    // that makes cells interactive, and the live "next key" to ring.
    lockedKeys?: ReadonlySet<string>,
    onKeyClick?: (key: string) => void,
    currentKey?: string,
    // Live boards (Practice): ring the typer's next key by moving classes on
    // the cells instead of re-rendering ~50 of them per keystroke
    // (typing-feel §1). Don't combine with highlightKeys — the mover owns the
    // ring classes and would strip a static highlight ring it lands on.
    followActiveKey?: boolean,
    // Shift layer: render each cell's shifted twin (R, ?, !, :) with its own raw
    // accuracy instead of the base glyph. Callers pass *unfolded* attempts so each
    // layer resolves its own glyph.
    shiftLayer?: boolean,
    // AltGr layer (national layouts): render each cell's AltGr glyph (@ € ~ µ,
    // all Polish accents) with its own raw accuracy. Combines with shiftLayer
    // into the shiftAltgr layer. Cells without a glyph on the layer render
    // inert. Only offered by pages when the layout has AltGr glyphs at all.
    altgrLayer?: boolean,
    // When given, only these glyphs are clickable-to-lock (e.g. the shift layer
    // exposes just the drillable marks ? ! :, leaving capitals inert). When
    // omitted, every cell is interactive in the base layer and none in the shift
    // layer — preserving the read-only score-card/progress views.
    interactiveKeys?: ReadonlySet<string>,
    // Which layout's board to render; defaults to the active global setting.
    // Score surfaces pass a test's own layout tag here (ledger decision 10).
    layout?: string,
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

const ROW_CLASS_BY_SIZE: Record<KeyHeatmapSize, string> = {
    full: "flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1",
    mini: "flex justify-center gap-0.5 w-full",
}

const KEY_CLASS_BY_SIZE: Record<KeyHeatmapSize, string> = {
    // The after: pseudo renders the teaching step badge (1→2 / ⇧ / AG) from
    // data-kb-step — set imperatively by the train board, absent everywhere
    // else, so the pseudo-element resolves to empty content and shows nothing.
    full: "relative kbd kbd-md sm:kbd-lg font-mono after:absolute after:-right-1 after:-top-1.5 after:text-[9px] after:font-bold after:text-primary after:content-[attr(data-kb-step)]",
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
    const { attempts, size = "full", includeSpace = true, highlightKeys, lockedKeys, onKeyClick, currentKey, followActiveKey, shiftLayer, altgrLayer, interactiveKeys } = props
    const [activeLayout] = useLayout()
    const boardLayout = props.layout ?? activeLayout
    const board = boardFor(boardLayout)
    // The active layer decides which glyph each cell renders and reads accuracy
    // for (unfolded — each glyph its own tally, matching the shift layer).
    const layer: Layer = altgrLayer && shiftLayer ? "shiftAltgr" : altgrLayer ? "altgr" : shiftLayer ? "shift" : "base"
    const showAccuracy = props.showAccuracy ?? true
    const showPercent = (props.showPercent ?? size === "full") && showAccuracy
    const { lowColor, highColor } = useHeatmapColors()
    const highlight = new Set(highlightKeys)

    const rootRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!followActiveKey) return
        const root = rootRef.current
        if (!root) return
        const RING = ["ring-2", "ring-primary", "ring-offset-1", "ring-offset-base-200"]
        let ringed: HTMLElement | null = null
        const apply = (key: string) => {
            ringed?.classList.remove(...RING)
            ringed = key ? root.querySelector<HTMLElement>(`[data-kb-key="${CSS.escape(key)}"]`) : null
            ringed?.classList.add(...RING)
        }
        apply(getActiveKey())
        const unsubscribe = subscribeActiveKey(apply)
        return () => {
            unsubscribe()
            ringed?.classList.remove(...RING)
        }
    }, [followActiveKey])

    const rowClass = ROW_CLASS_BY_SIZE[size]
    const keyClass = KEY_CLASS_BY_SIZE[size]
    const spaceClass = SPACE_CLASS_BY_SIZE[size]

    // A dead cell's accuracy aggregates its own tally with every char composed
    // through it (ê rides ^'s cell) — unfolded sources carry composed chars as
    // themselves; folded sources already landed them here, so the extra lookups
    // find nothing and never double-count.
    const attemptFor = (glyph: string): KeyAttempt | undefined => {
        const own = lookupAttempt(attempts, glyph)
        const composed = composedFor(glyph, boardLayout)
        if (composed.length === 0) return own
        let total = own?.attempts ?? 0
        let correct = own?.correct ?? 0
        for (const ch of composed) {
            const tally = lookupAttempt(attempts, ch)
            if (tally) {
                total += tally.attempts
                correct += tally.correct
            }
        }
        return total > 0 ? { attempts: total, correct } : undefined
    }

    // One cell per physical cap. The active layer picks the glyph (and its own
    // unfolded accuracy); full-size cells also show small secondary glyphs in
    // the physical convention — the shift twin top-right (symbols only; a
    // capital adds nothing) and the AltGr glyph bottom-left. Dead-key glyphs
    // (cap dead on this layer) carry data-kb-dead and a tooltip: the key waits
    // for the next press (ledger decision 7; the old dashed border read as
    // noise, so the state is tooltip-only now).
    const renderCap = (cap: KeyCap | null, isSpace = false) => {
        const glyph = isSpace ? HEATMAP_SPACE : cap?.[layer] ?? (layer === "shiftAltgr" ? cap?.altgr ?? "" : "")
        // A cell with no glyph on this layer (AltGr on a plain key) is inert.
        if (!glyph) {
            return (
                <kbd key={cap?.base ?? "space"} data-kb-cell={cap?.base} className={`${keyClass} opacity-30`} aria-hidden="true">
                    <span className="leading-none">&nbsp;</span>
                </kbd>
            )
        }
        // Interactive iff a click handler exists and either an explicit allow-set
        // names this glyph, or (no allow-set) we're on the base layer.
        const interactive = !!onKeyClick && (interactiveKeys ? interactiveKeys.has(glyph) : layer === "base")
        const cell = heatmapCell(glyph, attemptFor(glyph))
        // Plain boards (train) skip the gradient entirely — the default kbd
        // surface is the "no data" look everywhere.
        const color = showAccuracy ? accuracyColor(cell.accuracy, lowColor, highColor) : undefined
        // The cell background sweeps the full theme gradient, so a static text
        // color loses contrast at the extremes (e.g. aqua's bright-cyan low end).
        // Derive a legible black/white foreground from the cell's own luminance.
        const textColor = color ? readableTextColor(color) : undefined
        const isCurrent = currentKey != null && glyph === currentKey
        const ringed = isCurrent || highlight.has(glyph)
        const isLocked = !!lockedKeys?.has(glyph)
        const isDead = !isSpace && !!cap?.dead?.includes(layer)
        const label = isSpace ? "space" : glyph
        const shiftHint = size === "full" && layer === "base" && cap && cap.shift !== cap.base.toUpperCase() ? cap.shift : ""
        const altgrHint = size === "full" && layer === "base" && cap?.altgr ? cap.altgr : ""

        return (
            <kbd
                key={cap?.base ?? "space"}
                data-kb-key={glyph}
                data-kb-cell={cap?.base ?? " "}
                data-kb-dead={isDead ? "" : undefined}
                onClick={interactive ? () => onKeyClick!(glyph) : undefined}
                role={interactive ? "button" : undefined}
                className={`${keyClass} ${isSpace ? spaceClass : ""} ${ringed ? "ring-2 ring-primary ring-offset-1 ring-offset-base-200" : ""} ${interactive ? "cursor-pointer select-none" : ""} ${isLocked ? "opacity-60" : ""}`}
                style={color ? { backgroundColor: color, color: textColor } : undefined}
                title={`${label}${showAccuracy ? `: ${cell.hasData ? `${cell.accuracy}%` : "no data"}` : ""}${isDead ? " \u2014 dead key (waits for the next press)" : ""}${isLocked ? (interactive ? " (locked \u2014 click to add)" : " (locked)") : ""}`}
            >
                <span className={`leading-none ${showPercent ? "absolute left-1 top-1 text-sm sm:left-1.5 sm:top-1.5 sm:text-base" : ""}`}>
                    {isSpace && !showPercent ? "\u00a0" : label}
                </span>
                {shiftHint &&
                    <span aria-hidden="true" className="pointer-events-none absolute right-1 top-0.5 text-[0.55rem] leading-none opacity-50">
                        {shiftHint}
                    </span>
                }
                {altgrHint &&
                    <span aria-hidden="true" className="pointer-events-none absolute bottom-0.5 left-1 text-[0.55rem] leading-none opacity-50">
                        {altgrHint}
                    </span>
                }
                {showPercent &&
                    <span className="pointer-events-none absolute bottom-0.5 right-1 text-[0.6rem] leading-none drop-shadow-sm sm:bottom-1 sm:right-1.5 sm:text-xs">
                        {cell.accuracy}%
                    </span>
                }
                {isLocked && <LockBadge />}
            </kbd>
        )
    }

    return (
        <div
            ref={rootRef}
            className={`typecafe-key-heatmap flex flex-col items-center gap-[0.25rem] ${props.className ?? ""}`}
            data-testid={props.testId}
        >
            {board.rows.map((row, rowIndex) => (
                <div key={rowIndex} className={rowClass}>
                    {row.map((cap) => renderCap(cap))}
                </div>
            ))}
            {includeSpace &&
                <div className={rowClass}>
                    {renderCap(null, true)}
                </div>
            }
        </div>
    )
}
