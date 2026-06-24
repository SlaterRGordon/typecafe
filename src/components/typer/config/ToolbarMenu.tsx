import { useEffect, useRef, type ReactNode } from "react"

interface ToolbarMenuProps {
    open: boolean
    onClose: () => void
    trigger: ReactNode
    children: ReactNode
    align?: "left" | "right"
    widthClassName?: string
    testId?: string
}

export const toolbarMenuPanelClass = "absolute top-12 z-50 rounded-lg border border-base-content/15 bg-base-200 p-2 shadow-[0_20px_70px_rgba(0,0,0,0.45)]"

export function ToolbarMenu(props: ToolbarMenuProps) {
    const ref = useRef<HTMLDivElement>(null)
    const { open, onClose } = props

    useEffect(() => {
        if (!open) return

        const handlePointerDown = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) onClose()
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose()
        }

        document.addEventListener("mousedown", handlePointerDown)
        document.addEventListener("keydown", handleKeyDown)
        return () => {
            document.removeEventListener("mousedown", handlePointerDown)
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [onClose, open])

    const alignmentClass = props.align === "left" ? "left-0" : "right-0"

    return (
        <div ref={ref} className="relative">
            {props.trigger}
            {props.open &&
                <div
                    data-testid={props.testId}
                    className={`${toolbarMenuPanelClass} ${alignmentClass} max-w-[calc(100vw-2rem)] ${props.widthClassName ?? "min-w-40"}`}
                >
                    {props.children}
                </div>
            }
        </div>
    )
}
