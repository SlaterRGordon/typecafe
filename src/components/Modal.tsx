interface ModalProps {
    children: JSX.Element,
}

export const Modal = (props: ModalProps) => {

    const handleClickOutside = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = document.getElementById("input") as HTMLInputElement
        
        if (input) {
            if (!e.target.checked) input.focus()
            else input.blur()
        }
    }

    return (
        <>
            <input onChange={handleClickOutside} type="checkbox" id="configModal" className="modal-toggle" />
            <label htmlFor="configModal" className="modal modal-bottom !my-0 sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box sm:w-[500px] h-[500px] !max-w-5xl space-y-2 !overflow-y-visible overflow-x-hidden">
                    {props.children}
                </label>
            </label>
        </>
    )
}