import type { LevelKind } from "./levels"

// Per-kind presentation: the iconography, short label and the blurb shown in the
// "?" tooltip. Icons are hand-built from SVG primitives (no icon dep) so they
// render reliably with currentColor. `keys` is the plain default; the other three
// are the "special" kinds that earn a dropdown icon and their own rules.

type IconProps = { className?: string }

function Svg(props: { children: React.ReactNode } & IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={props.className ?? "h-4 w-4"}
        >
            {props.children}
        </svg>
    )
}

// Plain key practice — a speed bolt (every level is a speed level at heart).
function KeysIcon(props: IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={props.className ?? "h-4 w-4"}
        >
            <path d="M11 15H6L13 1V9H18L11 23V15Z" />
        </svg>
    )
}

// Timed sprint — a stopwatch.
function TimedIcon(props: IconProps) {
    return (
        <Svg className={props.className}>
            <circle cx="12" cy="14" r="8" />
            <path d="M9 2h6M12 2v4M12 14V9M18.5 7.5l1.8-1.8" />
        </Svg>
    )
}

// No-miss precision — an arrow striking a bullseye.
function NoMissIcon(props: IconProps) {
    return (
        <Svg className={props.className}>
            <circle cx="11" cy="13" r="9" />
            <circle cx="11" cy="13" r="4.5" />
            <path d="M21 3L11 13M11 13h4M11 13v-4" />
        </Svg>
    )
}

// Boss — an angry horned face.
function BossIcon(props: IconProps) {
    return (
        <Svg className={props.className}>
            <path d="M7 6.5C5.5 5 4.5 3.5 4.8 2.4C6 2.6 7.2 3.8 8 5.2" />
            <path d="M17 6.5C18.5 5 19.5 3.5 19.2 2.4C18 2.6 16.8 3.8 16 5.2" />
            <circle cx="12" cy="13" r="8" />
            <path d="M7.5 10.5L10.5 12M16.5 10.5L13.5 12" />
            <path d="M9.2 13.6h.01M14.8 13.6h.01" strokeWidth="2.2" />
            <path d="M9 17.5C10 16.3 14 16.3 15 17.5" />
        </Svg>
    )
}

export interface KindMeta {
    label: string
    /** True for the themed kinds; `keys` levels stay unbadged in the dropdown. */
    special: boolean
    Icon: (props: IconProps) => React.ReactElement
    /** Shown in the "?" tooltip: what the level demands and how it's scored. */
    blurb: string
}

export const KIND_META: Record<LevelKind, KindMeta> = {
    keys: {
        label: "Keys",
        special: false,
        Icon: KeysIcon,
        blurb: "Practice the highlighted keys at your own pace. Hit the 1★ net-WPM target to clear; faster runs earn more stars.",
    },
    speed: {
        label: "Timed",
        special: true,
        Icon: TimedIcon,
        blurb: "A timed sprint — type as much as you can before the clock runs out. Stars come from your net WPM.",
    },
    noMiss: {
        label: "No miss",
        special: true,
        Icon: NoMissIcon,
        blurb: "Precision round: one mistake ends the run instantly. Finish at 100% accuracy to clear; stars come from your net WPM.",
    },
    boss: {
        label: "Boss",
        special: true,
        Icon: BossIcon,
        blurb: "A pacer line chases you at the 1★ pace. Reach the end before it catches you — if it does, the run ends. Stars come from your net WPM.",
    },
}
