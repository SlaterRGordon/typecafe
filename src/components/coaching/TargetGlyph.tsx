import { type CSSProperties } from "react"
import { readableTextColor } from "~/utils/convertColor"

interface TargetGlyphProps {
    keys: readonly string[]
    label: string
    arrows?: boolean
    color?: string
    headline?: boolean
}

export function TargetGlyph({ keys, label, arrows = false, color, headline = false }: TargetGlyphProps) {
    if (keys.length === 0) {
        return <span className="font-mono text-sm font-semibold text-primary">{label}</span>
    }
    const capSize = headline
        ? "!h-7 !min-h-7 !min-w-7 px-1.5 text-sm"
        : "!h-6 !min-h-6 !min-w-6 px-1 text-xs"
    const style: CSSProperties | undefined = color ? {
        backgroundColor: color,
        backgroundImage: "none",
        color: readableTextColor(color),
        filter: "none",
    } : undefined

    return (
        <span className={`typecafe-key-heatmap flex shrink-0 items-center gap-1 ${headline ? "w-auto" : "w-28"}`} aria-label={label}>
            {keys.map((key, index) => (
                <span key={`${key}-${index}`} className="contents">
                    {index > 0 && arrows && <span aria-hidden="true" className="text-xs text-base-content/45">→</span>}
                    <kbd
                        aria-hidden="true"
                        className={`kbd kbd-sm inline-flex ${capSize} items-center justify-center bg-primary font-mono font-semibold text-primary-content`}
                        style={style}
                    >
                        {key}
                    </kbd>
                </span>
            ))}
        </span>
    )
}
