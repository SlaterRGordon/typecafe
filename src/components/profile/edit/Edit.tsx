import { useSession } from "next-auth/react"
import { useState } from "react"

export const Edit = () => {

    // useEffect(() => {

    // }, [])

    const { data: sessionData } = useSession()

    const [nameError, setNameError] = useState(false)
    const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // setName(e.target.value)
        if (e.target.value.length > 0) {
            setNameError(false)
        }
    }
    const [bioError, setBioError] = useState(false)
    const onBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        // setName(e.target.value)
    }
    const [linkError, setLinkError] = useState(false)
    const onLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // setName(e.target.value)
    }

    return (
        <div className="flex flex-col h-full gap-2 relative">
            <h3 className="font-bold text-4xl p-1">Edit Profile</h3>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl p-1">Name</h3>
                <input
                    id="nameInput"
                    type="text" placeholder="Name"
                    className={`w-full input input-bordered ${nameError ? "input-error" : ""}`}
                    value={sessionData?.user.name ?? ""}
                    onChange={onNameChange}
                />
            </div>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl p-1">Bio</h3>
                <textarea
                    className={`w-full textarea textarea-bordered ${bioError ? "input-error" : ""}`}
                    placeholder="Bio"
                    value={sessionData?.user.bio ?? ""}
                    onChange={onBioChange}
                />
            </div>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl p-1">Link</h3>
                <input
                    id="linkInput"
                    type="text" placeholder="Link"
                    className={`w-full input input-bordered ${linkError ? "input-error" : ""}`}
                    value={sessionData?.user.link ?? ""}
                    onChange={onLinkChange}
                />
            </div>
            <div className="absolute bottom-0 w-full">
                <button onClick={() => { return; }} className="btn btn-sm btn-primary btn-block">
                    Save
                </button>
            </div>
        </div>
    )
}
