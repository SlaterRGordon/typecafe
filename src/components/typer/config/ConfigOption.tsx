interface ConfigOptionProps {
    options: string[] | number[],
    values?: string[] | number[],
    active: string | number,
    onChange: (newActive: number | string) => void,
}

export const ConfigOption = (props: ConfigOptionProps) => {

    return (
        <div className="flex w-full gap-2">
            {props.options.map((option: string | number, i: number) => {
                return (
                    <button
                        onClick={() => props.onChange(props.values ? props.values[i] as string | number : i)}
                        key={i}
                        className={`flex flex-col bg-base-200 border-base-200 btn btn-sm normal-case w-[90px] ${props.active == (props.values ? props.values[i] as string | number : i) ? "!btn-primary" : ""}`}>
                        {option}
                    </button>
                )
            })}
        </div>
    )
}