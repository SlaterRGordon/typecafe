import type { User } from "~/generated/prisma/client"
import { upload } from "@vercel/blob/client";
import { useSession } from "next-auth/react";
import { Avatar } from "~/components/Avatar";
import { useEffect, useState } from "react"
import type { Area } from "react-easy-crop";
import { api } from "~/utils/api"
import { AvatarCropper } from "./AvatarCropper";
import { getCroppedAvatarFile } from "./avatarCrop";

interface EditProps {
    userData: User | null | undefined
    onClose: () => void
    openConfirmModal: () => void
}

export const Edit = (props: EditProps) => {
    const session = useSession()

    const [name, setName] = useState(props.userData?.username ?? "")
    const [bio, setBio] = useState(props.userData?.bio ?? "")
    const [link, setLink] = useState(props.userData?.link ?? "")
    const [image, setImage] = useState<string | null>(props.userData?.image ?? null)
    const [avatarChanged, setAvatarChanged] = useState(false)
    const [avatarUploading, setAvatarUploading] = useState(false)
    const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null)
    const [cropSourceName, setCropSourceName] = useState("")
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
    
    const [error, setError] = useState("")

    const [saving, setSaving] = useState(false)

    const { data: usernameExists, isLoading } = api.user.checkUsernameExists.useQuery({ username: name })

    useEffect(() => {
        setName(props.userData?.username ?? "")
        setBio(props.userData?.bio ?? "")
        setLink(props.userData?.link ?? "")
        setImage(props.userData?.image ?? null)
        setAvatarChanged(false)
    }, [props.userData])

    useEffect(() => {
        return () => {
            if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl)
        }
    }, [cropSourceUrl])

    // create user
    const updateUser = api.user.update.useMutation({
        onSuccess: () => {
            void session.update()
            props.onClose()
            setSaving(false)
        },
        onError: (error) => {
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
    const getSafeFileName = (fileName: string) => {
        return fileName
            .replace(/[^a-zA-Z0-9._-]/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 100)
    }
    const closeCropper = () => {
        if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl)
        setCropSourceUrl(null)
        setCropSourceName("")
        setCrop({ x: 0, y: 0 })
        setZoom(1)
        setCroppedAreaPixels(null)
    }
    const onAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            setError("Profile picture must be a JPG, PNG, or WebP image.")
            e.target.value = ""
            return
        }

        if (file.size > 2 * 1024 * 1024) {
            setError("Profile picture must be smaller than 2 MB.")
            e.target.value = ""
            return
        }

        setError("")
        closeCropper()
        setCropSourceName(getSafeFileName(file.name))
        setCropSourceUrl(URL.createObjectURL(file))
        e.target.value = ""
    }
    const uploadCroppedAvatar = async () => {
        const userId = session.data?.user.id
        if (!userId) {
            setError("You must be signed in to upload a profile picture.")
            return
        }

        if (!cropSourceUrl || !croppedAreaPixels) {
            setError("Could not crop profile picture.")
            return
        }

        setAvatarUploading(true)
        setError("")

        try {
            const croppedFile = await getCroppedAvatarFile(cropSourceUrl, croppedAreaPixels, cropSourceName)
            const safeName = getSafeFileName(croppedFile.name)
            const blob = await upload(`avatars/${userId}/${Date.now()}-${safeName}`, croppedFile, {
                access: "public",
                handleUploadUrl: "/api/avatar/upload",
                contentType: croppedFile.type,
            })

            setImage(blob.url)
            setAvatarChanged(true)
            closeCropper()
        } catch (error) {
            setError(error instanceof Error ? error.message : "Could not upload profile picture.")
        } finally {
            setAvatarUploading(false)
        }
    }
    const removeAvatar = () => {
        setImage(null)
        setAvatarChanged(true)
        setError("")
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
            ...(avatarChanged ? { image } : {}),
        })
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
                <h3 className="font-mono font-bold text-4xl tracking-tight">Edit Profile</h3>
                <button onClick={props.openConfirmModal} className="btn btn-sm btn-error">
                    Delete Profile
                </button>
            </div>
            {error != "" &&
                <div role="alert" className="alert alert-error justify-normal">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{error}</span>
                </div>
            }
            <div className="flex flex-col gap-2">
                <h4 className="text-lg font-bold sm:text-xl">Profile Picture</h4>
                <div className="flex items-center gap-4">
                    <Avatar size={64} image={image} name={name} />
                    <div className="flex flex-wrap items-center gap-2">
                        <label className={`btn btn-sm btn-primary ${avatarUploading || saving ? "btn-disabled" : ""}`} htmlFor="avatarInput">
                            {avatarUploading ? <div className="w-5 h-5 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div> : "Upload"}
                        </label>
                        <input
                            id="avatarInput"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={avatarUploading || saving}
                            onChange={onAvatarChange}
                        />
                        <button type="button" className="btn btn-sm btn-ghost" disabled={avatarUploading || saving || !image} onClick={removeAvatar}>
                            Remove
                        </button>
                    </div>
                </div>
                {cropSourceUrl &&
                    <AvatarCropper
                        image={cropSourceUrl}
                        crop={crop}
                        zoom={zoom}
                        applying={avatarUploading}
                        onApply={uploadCroppedAvatar}
                        onCancel={closeCropper}
                        onCropChange={setCrop}
                        onCropComplete={(_croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                        onZoomChange={setZoom}
                    />
                }
            </div>
            <div className="flex flex-col gap-2">
                <h4 className="text-lg font-bold sm:text-xl">Username</h4>
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
                            <svg className="text-error" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path fill="currentColor" d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" /></svg>
                            :
                            <svg className="text-success" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path fill="currentColor" d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" /></svg>
                    }
                </label>
            </div>
            <div className="flex flex-col gap-2">
                <h4 className="text-lg font-bold sm:text-xl">Bio</h4>
                <textarea
                    className={`w-full textarea textarea-bordered`}
                    placeholder="Bio"
                    value={bio}
                    onChange={onBioChange}
                />
            </div>
            <div className="flex flex-col gap-2">
                <h4 className="text-lg font-bold sm:text-xl">Link</h4>
                <input
                    id="linkInput"
                    type="text" placeholder="Link"
                    className={`w-full input input-bordered`}
                    value={link}
                    onChange={onLinkChange}
                />
            </div>
            <button onClick={saveChanges} disabled={avatarUploading || saving} className="btn btn-primary btn-block mt-1">
                {saving ? <div className="w-6 h-6 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div> : avatarUploading ? "Uploading..." : "Save Changes"}
            </button>
        </div>
    )
}
