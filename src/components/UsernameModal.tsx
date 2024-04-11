import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { api } from "~/utils/api";

export const UsernameModal = () => {
    const session = useSession()
    const [username, setUsername] = useState("")
    const [error, setError] = useState("")

    const { data: usernameExists, isLoading } = api.user.checkUsernameExists.useQuery({ username })
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
        if (newUsername.length > 0) {
            setUsernameError(false)
        } else {
            setUsernameError(true)
        }
    }

    const handleSumbit = () => {
        if (usernameExists) {
            setError("Username already in use.")
            return
        }
        updateUsername.mutate({ username })
    }

    useEffect(() => {
        console.log(session.data)
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
                                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>{error}</span>
                            </div>
                        }
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl p-1">Username</h3>
                            <input
                                id="usernamInput"
                                type="text" placeholder="Username"
                                className={`w-full input input-bordered ${usernameError ? "input-error" : ""}`}
                                value={username}
                                onChange={onUsernameChange}
                            />
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