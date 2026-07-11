import type { ReactNode } from "react"

// One segment inside a SegmentedGroup. Equal width, single line, never wraps -
// text truncates as a last resort on very narrow screens.
const segmentBase = "flex-1 basis-0 min-w-0 cursor-pointer truncate rounded-md px-2 py-2.5 text-center whitespace-nowrap text-sm font-medium transition-colors sm:text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

export const segmentClass = (isActive: boolean) =>
    `${segmentBase} ${isActive
        ? "bg-primary text-primary-content shadow-sm hover:bg-primary"
        : "text-base-content/60 hover:bg-base-content/5"
    }`

// Bordered container that holds one row of equal-width segments.
export const SegmentedGroup = ({ children }: { children: ReactNode }) => (
    <div className="flex w-full gap-1 rounded-lg border border-base-content/15 bg-base-200/40 p-1">
        {children}
    </div>
)

interface ConfigOptionProps {
    options: string[] | number[],
    values?: string[] | number[],
    active: string | number,
    onChange: (newActive: number | string) => void,
    variant?: "segmented" | "pill",
}

export const ConfigOption = (props: ConfigOptionProps) => {
    const variant = props.variant ?? "segmented"

    if (variant === "pill") {
        return (
            <SegmentedGroup>
                {props.options.map((option: string | number, i: number) => {
                    const value = props.values ? props.values[i] as string | number : i
                    const isActive = props.active == value
                    return (
                        <button
                            type="button"
                            key={i}
                            onClick={() => props.onChange(value)}
                            aria-pressed={isActive}
                            className={segmentClass(isActive)}
                        >
                            {option}
                        </button>
                    )
                })}
            </SegmentedGroup>
        )
    }

    return (
        <div className="flex w-full gap-2">
            {props.options.map((option: string | number, i: number) => {
                const isActive = props.active == (props.values ? props.values[i] as string | number : i)
                return (
                    <button
                        type="button"
                        onClick={() => props.onChange(props.values ? props.values[i] as string | number : i)}
                        key={i}
                        className={`btn btn-sm flex basis-0 grow flex-col normal-case max-w-[100px] ${isActive ? "border-primary bg-primary text-primary-content hover:border-primary hover:bg-primary" : "border-base-200 bg-base-200"}`}>
                        {option}
                    </button>
                )
            })}
        </div>
    )
}

interface ConfigToggleProps {
    label: string,
    active: boolean,
    onChange: (value: boolean) => void,
}

// A single independent on/off segment, meant to sit inside a SegmentedGroup
// alongside other toggles (e.g. punctuation + capitals).
export const ConfigToggle = (props: ConfigToggleProps) => {
    return (
        <button
            type="button"
            onClick={() => props.onChange(!props.active)}
            aria-pressed={props.active}
            className={segmentClass(props.active)}
        >
            {props.label}
        </button>
    )
}
