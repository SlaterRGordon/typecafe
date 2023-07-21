import { User } from "@prisma/client"
import { use, useEffect, useState } from "react"
import { api } from "~/utils/api"

interface EditProps {
    userData: User | null | undefined
    onClose: () => void
}

export const Edit = (props: EditProps) => {
    const [name, setName] = useState(props.userData?.name ?? "")
    const [bio, setBio] = useState(props.userData?.bio ?? "")
    const [link, setLink] = useState(props.userData?.link ?? "")

    useEffect(() => {
        setName(props.userData?.name ?? "")
        setBio(props.userData?.bio ?? "")
        setLink(props.userData?.link ?? "")
    }, [props.userData])

    // create test
    const updateUser = api.user.update.useMutation({
        onSuccess: () => {
            console.log("user updated")
            props.onClose()
        },
        onError: (error) => {
            console.log(error)
        }
    })

    const [nameError, setNameError] = useState(false)
    const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setName(e.target.value)
        if (e.target.value.length > 0) {
            setNameError(false)
        }
    }
    const onBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setBio(e.target.value)
    }
    const onLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLink(e.target.value)
    }

    const saveChanges = () => {
        if (name.length === 0) {
            setNameError(true)
            return
        }
        updateUser.mutate({
            name: name,
            bio: bio,
            link: link,
        })
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
                    value={name}
                    onChange={onNameChange}
                />
            </div>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl p-1">Bio</h3>
                <textarea
                    className={`w-full textarea textarea-bordered`}
                    placeholder="Bio"
                    value={bio}
                    onChange={onBioChange}
                />
            </div>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl p-1">Link</h3>
                <input
                    id="linkInput"
                    type="text" placeholder="Link"
                    className={`w-full input input-bordered`}
                    value={link}
                    onChange={onLinkChange}
                />
            </div>
            <div className="absolute bottom-0 w-full">
                <button onClick={saveChanges} className="btn btn-sm btn-primary btn-block">
                    Save
                </button>
            </div>
        </div>
    )
}
