import { cloneElement, useId, useRef, useState, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"

interface TooltipProps {
    content: ReactNode,
    children: ReactElement<{ "aria-describedby"?: string }>,
    placement?: "top" | "bottom",
    testId?: string,
}

interface TooltipPosition {
    left: number,
    top: number,
}

export function Tooltip({ content, children, placement = "top", testId = "instant-tooltip" }: TooltipProps) {
    const id = useId()
    const triggerRef = useRef<HTMLSpanElement>(null)
    const [position, setPosition] = useState<TooltipPosition | null>(null)

    const show = () => {
        const rect = triggerRef.current?.getBoundingClientRect()
        if (!rect) return
        setPosition({ left: rect.left + rect.width / 2, top: placement === "top" ? rect.top : rect.bottom })
    }

    const hide = () => setPosition(null)
    const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ")

    return (
        <span
            ref={triggerRef}
            className="inline-flex"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocusCapture={show}
            onBlurCapture={hide}
            onKeyDown={(event) => { if (event.key === "Escape") hide() }}
        >
            {cloneElement(children, { "aria-describedby": describedBy })}
            {position && createPortal(
                <span
                    id={id}
                    role="tooltip"
                    data-testid={testId}
                    className="pointer-events-none fixed z-[1000] max-w-[min(20rem,calc(100vw-1rem))] whitespace-pre-line rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-left text-xs leading-5 text-base-content shadow-xl"
                    style={{
                        left: position.left,
                        top: position.top,
                        transform: placement === "top"
                            ? "translate(-50%, calc(-100% - 0.5rem))"
                            : "translate(-50%, 0.5rem)",
                    }}
                >
                    {content}
                </span>,
                document.body,
            )}
        </span>
    )
}
