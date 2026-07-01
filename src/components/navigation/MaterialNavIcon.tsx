type MaterialNavIconProps = {
    name: string;
    className?: string;
}

export function MaterialNavIcon({ name, className = "" }: MaterialNavIconProps) {
    return (
        <span className={`material-symbols-rounded ${className}`} aria-hidden="true">
            {name}
        </span>
    )
}
