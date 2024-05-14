

interface ConfirmModalProps {
    loading: boolean;
    message: string;
    callback: (result: boolean) => void;
}

export const ConfirmModal = (props: ConfirmModalProps) => {
    const { loading, message, callback } = props;

    return (
        <>
            <input type="checkbox" id="confirmModal" className="modal-toggle" />
            <label htmlFor="confirmModal" className="modal modal-bottom sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box space-y-4">
                    <div className="flex flex-col gap-2">
                        <div>
                            {message}
                        </div>
                        <div>
                            <button className="btn btn-block btn-primary mt-2" onClick={() => callback(true)}>
                                <span className="ml-2">
                                    {loading ? <div className="w-6 h-6 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div> 
                                        : "Yes"
                                    }
                                </span> 
                            </button>
                            <button className="btn btn-block btn-primary mt-2" onClick={() => callback(false)}>
                                <span className="ml-2">No</span>
                            </button>
                        </div>
                    </div>
                </label>
            </label>
        </>
    )
}