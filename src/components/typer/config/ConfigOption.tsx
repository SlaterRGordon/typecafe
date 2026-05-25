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
                const isActive = props.active == (props.values ? props.values[i] as string | number : i)
                return (
                    <button
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
