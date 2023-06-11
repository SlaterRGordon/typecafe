import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useDispatch } from "react-redux";


export const ConfigModal = () => {
    const dispatch = useDispatch()

    const { data: sessionData } = useSession()

    const [tab, setTab] = useState<"normal" | "progression" | "ngrams" | "pace">("normal")

    return (
        <>
            <input type="checkbox" id="configModal" className="modal-toggle" />
            <label htmlFor="configModal" className="modal modal-bottom !my-0 sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box !w-[640px] !max-w-5xl space-y-2 !overflow-y-visible overflow-x-hidden">
                    <div className="tabs tabs-boxed">
                        <a
                            className={`tab ${tab == "normal" ? 'tab-active' : ''}`}
                            onClick={() => { setTab("normal") }}
                        >Normal</a>
                        <a
                            className={`tab ${tab == "progression" ? 'tab-active' : ''}`}
                            onClick={() => { setTab("progression") }}
                        >Progression</a>
                        <a
                            className={`tab ${tab == "ngrams" ? 'tab-active' : ''}`}
                            onClick={() => { setTab("ngrams") }}
                        >N-Grams</a>
                        <a
                            className={`tab ${tab == "pace" ? 'tab-active' : ''}`}
                            onClick={() => { setTab("pace") }}
                        >Pace</a>
                    </div>
                    {tab == "normal" &&
                        <div>
                            <h3 className="font-bold text-2xl">Normal</h3>

                        </div>
                    }
                    {tab == "progression" &&
                        <div>
                            <h3 className="font-bold text-2xl">Progression</h3>
                        </div>
                    }
                    {tab == "ngrams" &&
                        <div>
                            <h3 className="font-bold text-2xl">N-Grams</h3>
                        </div>
                    }
                    {tab == "pace" &&
                        <div>
                            <h3 className="font-bold text-2xl">Paced</h3>
                        </div>
                    }
                </label>
            </label>
        </>
    )
}