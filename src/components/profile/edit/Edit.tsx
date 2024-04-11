import { User } from "@prisma/client"
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import { api } from "~/utils/api"

interface EditProps {
    userData: User | null | undefined
    onClose: () => void
}

export const Edit = (props: EditProps) => {
    const router = useRouter()
    const session = useSession()

    const [name, setName] = useState(props.userData?.username ?? "")
    const [bio, setBio] = useState(props.userData?.bio ?? "")
    const [link, setLink] = useState(props.userData?.link ?? "")
    
    const [error, setError] = useState("")

    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const { data: usernameExists, isLoading } = api.user.checkUsernameExists.useQuery({ username: name })

    useEffect(() => {
        setName(props.userData?.username ?? "")
        setBio(props.userData?.bio ?? "")
        setLink(props.userData?.link ?? "")
    }, [props.userData])

    // delete user
    const deleteUser = api.user.delete.useMutation({
        onSuccess: () => {
            setDeleting(false)
            void signOut()
            void router.push("/")

        },
        onError: (error) => {
            console.log(error)
            setDeleting(false)
        }
    })

    // create user
    const updateUser = api.user.update.useMutation({
        onSuccess: () => {
            console.log("user updated")
            props.onClose()
            setSaving(false)
        },
        onError: (error) => {
            console.log(error)
            setError(error.message)
            setSaving(false)
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

    const deleteProfile = () => {
        setDeleting(true)

        deleteUser.mutate()
    }

    const saveChanges = () => {
        setSaving(true)

        if (name.length < 3) {
            setNameError(true)
            setError("Username must have atleast 3 characters.")
            setSaving(false)
            return
        }

        if (usernameExists && (name != (session?.data?.user ? session.data.user.username : ""))) {
            setNameError(true)
            setError("Username already in use.")
            setSaving(false)
            return
        
        }

        updateUser.mutate({
            username: name,
            bio: bio,
            link: link,
        })
    }

    return (
        <div className="flex flex-col h-full gap-2 relative">
            <div className="flex justify-between align-center">
                <h3 className="font-bold text-4xl p-1">Edit Profile</h3>
                <button onClick={deleteProfile} className="btn btn-sm btn-primary">
                    {deleting ? <div className="w-6 h-6 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div> : "Delete Profile"}
                </button>
            </div>
            {error != "" &&
                <div role="alert" className="alert alert-error justify-normal">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{error}</span>
                </div>
            }
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl p-1">Username</h3>
                <label className={`flex items-center gap-2 ${nameError ? "input-error" : ""}`}>
                    <input
                        id="nameInput"
                        placeholder="Name"
                        value={name}
                        className={`grow input input-bordered ${nameError ? "input-error" : ""}`}
                        onChange={onNameChange} />
                    {isLoading ?
                        <div className="w-6 h-6 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                        :
                        usernameExists && (name != (session?.data?.user ? session.data.user.username : "")) ?
                            <svg style={{ color: "red" }} xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path fill="currentColor" d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" /></svg>
                            :
                            <svg style={{ color: "green" }} xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path fill="currentColor" d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" /></svg>
                    }
                </label>
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
            <div className="absolute bottom-[-48px] w-full">
                <button onClick={saveChanges} className="btn btn-sm btn-primary btn-block">
                    {saving ? <div className="w-6 h-6 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div> : "Save"}
                </button>
            </div>
        </div>
    )
}
