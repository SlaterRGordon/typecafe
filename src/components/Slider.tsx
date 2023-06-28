
interface SliderProps {
    marks: string[],
    min: number,
    max: number,
    step: number,
    handleOnChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
}


export const Slider = (props: SliderProps) => {

    return (
        <>
            <input
                type="range"
                min={props.min}
                max={props.max}
                step={props.step}
                onChange={props.handleOnChange}
                className="range range-primary"
            />
            <div className="w-full flex justify-between text-xs px-2">
                {props.marks.map((mark,i) => {
                    return (
                        <span key={i}>{mark}</span>
                    )
                })}
            </div>
        </>
    )
}