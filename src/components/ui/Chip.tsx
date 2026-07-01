import type { ReactNode } from "react";

type ChipTone = "primary" | "neutral" | "success" | "warning" | "error";
type ChipSize = "xs" | "sm" | "md";

const toneClasses: Record<ChipTone, string> = {
    primary: "border-primary/30 bg-primary/15 text-primary",
    neutral: "border-base-content/10 bg-base-200/70 text-base-content/75",
    success: "border-success/30 bg-success/15 text-success",
    warning: "border-warning/30 bg-warning/15 text-warning",
    error: "border-error/30 bg-error/15 text-error",
};

const sizeClasses: Record<ChipSize, string> = {
    xs: "px-2.5 py-0.5 text-xs",
    sm: "px-3 py-1 text-xs",
    md: "px-3 py-1 text-sm",
};

export function Chip(props: {
    children: ReactNode;
    className?: string;
    icon?: ReactNode;
    size?: ChipSize;
    testId?: string;
    tone?: ChipTone;
    title?: string;
}) {
    const size = props.size ?? "sm";
    const tone = props.tone ?? "neutral";

    return (
        <span
            data-testid={props.testId}
            title={props.title}
            className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${sizeClasses[size]} ${toneClasses[tone]} ${props.className ?? ""}`}
        >
            {props.icon}
            {props.children}
        </span>
    );
}
