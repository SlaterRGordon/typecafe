import { useEffect, useRef } from "react"
import { hslToHex, interpolateColor, readableTextColor } from "~/utils/convertColor"
import { getActiveKey, subscribeActiveKey } from "~/components/typer/keySignal"
import { Tooltip } from "~/components/ui/Tooltip"
import { useSecondaryStyle, useStyle } from "~/utils/hooks/useMutationObserver"
import {
    HEATMAP_NO_DATA_COLOR,
    HEATMAP_SPACE,
    accuracyColor,
    heatmapCell,
    lookupAttempt,
    type KeyAttempt,
} from "~/lib/heatmap"
import { boardFor, composedFor, type KeyCap, type Layer } from "~/lib/keyboardLayout"
import { useLayout } from "~/hooks/useLayout"

export type KeyHeatmapSize = "mini" | "compact" | "full"

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
    // False renders a plain board: no accuracy shading, no percentages - the
    // same geometry (layers, dead styling, corner glyphs) as a neutral teaching
    // surface (the train board). Defaults true: every heatmap stays a heatmap.
    showAccuracy?: boolean,
    // Optional per-key speed overlay (Option A): a thin fill bar inside each
    // base-layer cap, normalized against the user's own pace (see keySpeedBars).
    // Colour stays accuracy; the bar adds "fast/slow for you" at a glance. Keyed
    // by lowercase glyph, with " " for the space bar. Base layer only - we don't
    // track shifted-glyph speed.
    speedBars?: ReadonlyMap<string, { fraction: number, meanMs: number, wpm: number, count: number }>,
    // Keys with fewer than this many recorded keystrokes render the neutral
    // "no data yet" state (no heat colour, no speed bar) instead of a possibly
    // misleading colour from 2-3 presses. 0 (default) keeps every key coloured -
    // the score-card/progress behaviour; the Practice board passes the config N.
    minSamples?: number,
    // Keys to ring, e.g. the diagnosed keys the user is about to drill.
    highlightKeys?: string[],
    // Practice interaction (all optional - score-card/progress stay read-only):
    // selected focus keys, a click handler, and the live "next key" to ring.
    selectedKeys?: ReadonlySet<string>,
    onKeyClick?: (key: string) => void,
    currentKey?: string,
    // Live boards (Practice): ring the typer's next key by moving classes on
    // the cells instead of re-rendering ~50 of them per keystroke
    // (typing-feel §1). Don't combine with highlightKeys - the mover owns the
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
    // layer - preserving the read-only score-card/progress views.
    interactiveKeys?: ReadonlySet<string>,
    // Which layout's board to render; defaults to the active global setting.
    // Score surfaces pass a test's own layout tag here (ledger decision 10).
    layout?: string,
    className?: string,
    testId?: string,
}

// Small marker layered above the evidence fill for a selected Practice focus.
function FocusBadge() {
    return (
        <span className="typecafe-key-focus pointer-events-none absolute -left-[0.2rem] -top-[0.2rem] z-10 h-2.5 w-2.5 rounded-full border-2 border-base-100 bg-primary shadow-sm" aria-hidden="true">
        </span>
    )
}

const ROW_CLASS_BY_SIZE: Record<KeyHeatmapSize, string> = {
    full: "flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1",
    compact: "flex justify-center gap-0.5 w-full md:gap-1",
    mini: "flex justify-center gap-0.5 w-full",
}

const KEY_CLASS_BY_SIZE: Record<KeyHeatmapSize, string> = {
    // The after: pseudo renders the teaching step badge (1→2 / ⇧ / AG) from
    // data-kb-step - set imperatively by the train board, absent everywhere
    // else, so the pseudo-element resolves to empty content and shows nothing.
    full: "relative kbd kbd-md sm:kbd-lg font-mono after:absolute after:-right-1 after:-top-1.5 after:text-[9px] after:font-bold after:text-primary after:content-[attr(data-kb-step)]",
    compact: "relative kbd !h-9 !min-h-9 !min-w-10 px-1 font-mono after:absolute after:-right-1 after:-top-1.5 after:text-[9px] after:font-bold after:text-primary after:content-[attr(data-kb-step)]",
    mini: "relative kbd kbd-sm font-mono text-xs",
}

const SPACE_CLASS_BY_SIZE: Record<KeyHeatmapSize, string> = {
    full: "!min-w-[14rem] sm:!min-w-[17.5rem]",
    compact: "!min-w-[14rem]",
    mini: "!min-w-[8rem] sm:!min-w-[8rem]",
}

export function useHeatmapColors() {
    const style = useStyle()
    const secondaryStyle = useSecondaryStyle()

    return {
        lowColor: style ? hslToHex(style) : "#ffffff",
        highColor: secondaryStyle ? hslToHex(secondaryStyle) : "#000000",
    }
}

// The shared heatmap legend items: accuracy colour scale (high → low), the speed
// bar, and the no-data swatch - the same vocabulary the Practice board and the
// /progress keyboard both read. `className` lets each surface lay them out (one
// tight row on Practice, spread across the corners on the roomier progress card).
export function KeyHeatmapLegend({ className = "" }: { className?: string }) {
    const { lowColor, highColor } = useHeatmapColors()
    // High → low, so the dots read light (strong) to pink (weak) alongside the label.
    const dots = [100, 96, 92, 86, 80]
    // The filled portion uses the same dark-shade colour the real key bars draw
    // (interpolateColor(colour, black, 0.75)), so the legend matches the board.
    const swatchBar = interpolateColor(highColor, "#000000", 0.75)
    return (
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-1 text-base-content/55 ${className}`}>
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                accuracy
                <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                    {dots.map((accuracy) => (
                        <span key={accuracy} className="h-2 w-2 rounded-full" style={{ backgroundColor: accuracyColor(accuracy, lowColor, highColor) }} />
                    ))}
                </span>
                high → low
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                <span className="relative inline-block h-1.5 w-6 overflow-hidden rounded-full border bg-base-content/20" style={{ borderColor: highColor }} aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 w-2/3 rounded-full" style={{ backgroundColor: swatchBar }} />
                </span>
                speed
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: HEATMAP_NO_DATA_COLOR }} aria-hidden="true" />
                no data yet
            </span>
        </div>
    )
}

// A reusable per-key accuracy heatmap. The rendering is intentionally the same
// primitive for Practice, score-card diagnosis, beat-run compare, and /progress.
export function KeyHeatmap(props: KeyHeatmapProps) {
    const { attempts, size = "full", includeSpace = true, speedBars, minSamples = 0, highlightKeys, selectedKeys, onKeyClick, currentKey, followActiveKey, shiftLayer, altgrLayer, interactiveKeys } = props
    const [activeLayout] = useLayout()
    const boardLayout = props.layout ?? activeLayout
    const board = boardFor(boardLayout)
    // The active layer decides which glyph each cell renders and reads accuracy
    // for (unfolded - each glyph its own tally, matching the shift layer).
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
    const labelClass = size === "compact"
        ? "absolute left-1 top-0.5 text-xs"
        : "absolute left-1 top-1 text-sm sm:left-1.5 sm:top-1.5 sm:text-base"
    const percentClass = size === "compact"
        ? "absolute bottom-0.5 right-1 text-[0.55rem] leading-none drop-shadow-sm"
        : "absolute bottom-0.5 right-1 text-[0.6rem] leading-none drop-shadow-sm sm:bottom-1 sm:right-1.5 sm:text-xs"

    // A dead cell's accuracy aggregates its own tally with every char composed
    // through it (ê rides ^'s cell) - unfolded sources carry composed chars as
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
    // the physical convention - the shift twin top-right (symbols only; a
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
        // A key under the sample floor renders the neutral "no data yet" state:
        // no heat colour, no speed bar, and a muted label.
        // minSamples 0 (score card/progress) keeps every key coloured.
        const noData = showAccuracy && cell.attempts < minSamples
        // Plain boards (train) skip the gradient entirely - the default kbd
        // surface is the "no data" look everywhere.
        const color = showAccuracy && !noData ? accuracyColor(cell.accuracy, lowColor, highColor) : undefined
        // The cell background sweeps the full theme gradient, so a static text
        // color loses contrast at the extremes (e.g. aqua's bright-cyan low end).
        // Derive a legible black/white foreground from the cell's own luminance.
        const textColor = color ? readableTextColor(color) : undefined
        const isCurrent = currentKey != null && glyph === currentKey
        // Speed bar (Option A): base layer only, not on the mini score-card board
        // (no room), and only once the key clears the sample floor. Space looks up
        // its own " " key.
        const speedBar = size !== "mini" && layer === "base" && !noData ? speedBars?.get(isSpace ? " " : glyph) : undefined
        // A dark shade of the key's own heat colour, so the bar reads as a subtle
        // deepening of the cell rather than a hard navy line.
        const speedBarColor = speedBar && color ? interpolateColor(color, "#000000", 0.75) : undefined
        const ringed = isCurrent || highlight.has(glyph)
        const isSelected = !!selectedKeys?.has(glyph)
        const isDead = !isSpace && !!cap?.dead?.includes(layer)
        const label = isSpace ? "space" : glyph
        const shiftHint = size !== "mini" && layer === "base" && cap && cap.shift !== cap.base.toUpperCase() ? cap.shift : ""
        const altgrHint = size !== "mini" && layer === "base" && cap?.altgr ? cap.altgr : ""
        const activate = () => onKeyClick?.(glyph)
        const candidates: Array<[string, string | undefined]> = isSpace
            ? [["Base", HEATMAP_SPACE]]
            : [
                ["Base", cap?.base],
                ["Shift", cap?.shift],
                ["AltGr", cap?.altgr],
                ["Shift + AltGr", cap?.shiftAltgr],
            ]
        const seenLayerGlyphs = new Set<string>()
        const layerLines = candidates.flatMap(([name, layerGlyph]) => {
            if (!layerGlyph || seenLayerGlyphs.has(layerGlyph)) return []
            seenLayerGlyphs.add(layerGlyph)
            const tally = attemptFor(layerGlyph)
            const layerCell = heatmapCell(layerGlyph, tally)
            const layerLabel = layerGlyph === HEATMAP_SPACE ? "space" : layerGlyph
            return [`${name} ${layerLabel}: ${layerCell.hasData ? `${layerCell.accuracy}% accuracy · ${tally?.attempts ?? 0} attempts` : "no data"}`]
        })
        const speedLine = speedBar ? `Speed: ${speedBar.wpm} WPM (${Math.round(speedBar.meanMs)}ms) · ${speedBar.count} samples` : undefined
        const tooltip = [
            `${label} key`,
            interactive ? (isSelected ? "Selected focus - click to remove" : "Available - click to add to focus") : undefined,
            ...(noData ? ["No natural Test data yet"]
                : showAccuracy ? [...layerLines, speedLine].filter((line): line is string => Boolean(line))
                : ["Training key"]),
            isDead ? "Dead key - waits for the next press" : undefined,
        ].filter(Boolean).join("\n")

        return (
            <Tooltip key={cap?.base ?? "space"} content={tooltip}>
            <kbd
                data-kb-key={glyph}
                data-kb-cell={cap?.base ?? " "}
                data-kb-dead={isDead ? "" : undefined}
                data-kb-state={interactive ? (isSelected ? "selected" : "available") : undefined}
                onClick={interactive ? activate : undefined}
                onKeyDown={interactive ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        activate()
                    }
                } : undefined}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-pressed={interactive ? isSelected : undefined}
                aria-label={interactive ? `${label} key, ${isSelected ? "selected focus, click to remove" : "available, click to add to focus"}, ${cell.hasData ? `${cell.accuracy}% accuracy` : "no accuracy data"}` : undefined}
                className={`${keyClass} ${isSpace ? spaceClass : ""} ${ringed ? "ring-2 ring-primary ring-offset-1 ring-offset-base-200" : ""} ${isSelected ? "typecafe-key-state-selected outline outline-2 outline-primary outline-offset-1" : ""} ${interactive ? "cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" : ""}`}
                // Focus styling never rewrites the heatmap; a no-data key keeps
                // the existing neutral grey-blue fill.
                style={color ? { backgroundColor: color, color: textColor, backgroundImage: "none", filter: "none" }
                    : noData ? { backgroundColor: HEATMAP_NO_DATA_COLOR, backgroundImage: "none", filter: "none" }
                    : undefined}
            >
                <span className={`leading-none ${showPercent ? labelClass : ""} ${speedBar ? "-translate-y-1.5" : ""} ${noData ? "text-base-content/40" : ""}`}>
                    {isSpace && !showPercent && !interactive ? "\u00a0" : label}
                </span>
                {shiftHint &&
                    <span aria-hidden="true" className="typecafe-layer-hint pointer-events-none absolute right-1 top-0.5 text-center text-[0.6rem] font-semibold leading-3 opacity-50 sm:text-[0.7rem]">
                        {shiftHint}
                    </span>
                }
                {altgrHint &&
                    <span aria-hidden="true" className="typecafe-layer-hint pointer-events-none absolute bottom-3 left-1 text-center text-[0.6rem] font-semibold leading-3 opacity-50 sm:text-[0.7rem]">
                        {altgrHint}
                    </span>
                }
                {showPercent &&
                    <span className={`pointer-events-none ${percentClass}`}>
                        {cell.accuracy}%
                    </span>
                }
                {speedBar && speedBarColor &&
                    <span
                        aria-hidden="true"
                        data-kb-speed={speedBar.fraction.toFixed(2)}
                        className="typecafe-key-speed pointer-events-none absolute inset-x-[7px] bottom-[5px] h-1 overflow-hidden rounded-[2px]"
                        style={{ backgroundColor: `color-mix(in srgb, ${speedBarColor} 30%, transparent)` }}
                    >
                        <span className="block h-full rounded-[2px]" style={{ width: `${Math.round(speedBar.fraction * 100)}%`, backgroundColor: speedBarColor }} />
                    </span>
                }
                {isSelected && <FocusBadge />}
            </kbd>
            </Tooltip>
        )
    }

    return (
        <div
            ref={rootRef}
            className={`typecafe-key-heatmap flex flex-col items-center gap-[0.25rem] ${props.className ?? ""}`}
            data-testid={props.testId}
            data-kb-size={size}
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
