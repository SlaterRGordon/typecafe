interface ConfigOptionProps {
    options: string[] | number[],
    values?: number[],
    active: number,
    onChange: (newActive: number) => void,
}

export const ConfigOption = (props: ConfigOptionProps) => {

    return (
        <div className="flex w-full gap-2">
            {props.options.map((option: string | number, i: number) => {
                return (
                    <button
                        onClick={() => props.onChange(props.values ? props.values[i] as number : i)}
                        key={i}
                        className={`flex flex-col btn btn-sm normal-case w-[90px] ${props.active == (props.values ? props.values[i] as number : i) ? "btn-secondary" : "btn-ghost"}`}>
                        {option}
                    </button>
                )
            })}
        </div>
    )
}