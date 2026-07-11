import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { api } from "~/utils/api";
import { usernameSchema, USERNAME_MAX_LENGTH } from "~/lib/userProfile";

export const UsernameModal = () => {
    const session = useSession()
    const [username, setUsername] = useState("")
    const [error, setError] = useState("")

    const { data: usernameExists, isLoading } = api.user.checkUsernameExists.useQuery(
        { username },
        {
            enabled: !!session.data && usernameSchema.safeParse(username).success,
        }
    )
    const updateUsername = api.user.update.useMutation({
        onSuccess: async () => {
            await session.update()
        },
        onError: (error) => {
            setError(error.message)
        }
    })

    const [usernameError, setUsernameError] = useState(true)
    const onUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUsername = e.target.value
        setUsername(newUsername)
        setUsernameError(!usernameSchema.safeParse(newUsername).success)
    }

    const handleSumbit = () => {
        const parsed = usernameSchema.safeParse(username)
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Choose a valid username.")
            return
        }
        if (usernameExists) {
            setError("Username already in use.")
            return
        }
        updateUsername.mutate({ username: parsed.data })
    }

    useEffect(() => {
        if (session.data?.user.username) {
            const usernameModal = document.getElementById("usernameModal") as HTMLInputElement
            usernameModal.classList.remove("modal-open")
        }
    }, [session])

    return (
        <>
            <label
                id="usernameModal"
                htmlFor="usernameModal"
                className={`modal modal-bottom sm:modal-middle cursor-pointer ${session.data ? "modal-open" : ""}`}
            >
                <label htmlFor="" className="modal-box space-y-4">
                    <div className="flex flex-col gap-2">
                        {error != "" &&
                            <div role="alert" className="alert alert-error justify-normal">
                                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>{error}</span>
                            </div>
                        }
                        <div className="flex flex-col">
                            <label htmlFor="usernameInput" className="font-semibold text-2xl p-1">Username</label>
                            <label className={`flex items-center gap-2`}>
                                <input
                                    id="usernameInput"
                                    placeholder="Username"
                                    maxLength={USERNAME_MAX_LENGTH}
                                    value={username}
                                    className={`grow input input-bordered ${usernameError ? "input-error" : ""}`}
                                    onChange={onUsernameChange} />
                                {isLoading ?
                                    <div className="w-6 h-6 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                                    :
                                    usernameExists || username.length < 3 ?
                                        <svg style={{ color: "red" }} xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path fill="currentColor" d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" /></svg>
                                        :
                                        <svg style={{ color: "green" }} xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path fill="currentColor" d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" /></svg>
                                }
                            </label>
                        </div>
                        {isLoading ?
                            <button className="btn btn-block btn-primary mt-2 cursor-not-allowed">
                                <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                            </button>
                            :
                            <button className="btn btn-block btn-primary mt-2" onClick={() => handleSumbit()}>
                                <span className="ml-2">Next</span>
                            </button>
                        }

                    </div>
                </label>
            </label>
        </>
    )
}
