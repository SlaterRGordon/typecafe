interface ModalProps {
    children: JSX.Element,
    setModalOpen: (open: boolean) => void
}

export const Modal = (props: ModalProps) => {

    const handleClickOutside = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = document.getElementById("input") as HTMLInputElement
        
        if (input) {
            if (!e.target.checked) input.focus()
            else input.blur()
        }
        
        props.setModalOpen(e.target.checked)
    }

    return (
        <>
            <input onChange={handleClickOutside} type="checkbox" id="configModal" className="modal-toggle" />
            <label htmlFor="configModal" className="modal modal-bottom !my-0 sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box sm:w-[500px] !pb-[64px] !max-w-5xl space-y-2 !overflow-y-visible overflow-x-hidden !shadow-sm">
                    {props.children}
                </label>
            </label>
        </>
    )
}