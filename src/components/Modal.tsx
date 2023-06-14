interface ModalProps {
    children: JSX.Element,
}

export const Modal = (props: ModalProps) => {

    return (
        <>
            <input type="checkbox" id="configModal" className="modal-toggle" />
            <label htmlFor="configModal" className="modal modal-bottom !my-0 sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box !w-[500px] h-[500px] !max-w-5xl space-y-2 !overflow-y-visible overflow-x-hidden">
                    {props.children}
                </label>
            </label>
        </>
    )
}