
interface Props {
    color: string,
    onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void,
}

export const ColorModal = ({ color, onClick }: Props) => {

    return (
        <>
            <input type="checkbox" id="colorModal" className="modal-toggle" />
            <label htmlFor="colorModal" className="modal modal-bottom sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box space-y-2 !overflow-y-visible">
                    <h3 className="font-bold text-2xl">Color Configuration</h3>
                    <p className="text-sm">Select a color for the background of the website.</p>
                    <h3 className="flex items-center text-xl">Background Color</h3>
                    <div className="flex space-x-2">
                        <button onClick={(e) => onClick(e)} style={{ backgroundColor: color }} className={`btn btn-square btn-outline btn-sm`} />
                        <h2 className="flex items-center font-bold">{color}</h2>
                    </div>
                    {/* <h3 className="flex items-center text-xl">Background Color</h3>
                    <div className="flex space-x-2">
                        <button onClick={(e) => onClick(e)} style={{ backgroundColor: color }} className={`btn btn-square btn-outline btn-sm`} />
                        <h2 className="flex items-center font-bold">{color}</h2>
                    </div> */}
                </label>
            </label>
        </>
    )
}