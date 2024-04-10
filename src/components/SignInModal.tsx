import { signIn } from "next-auth/react";
import { useState } from "react";
import { api } from "~/utils/api";

export const SignInModal = () => {
    const [email, setEmail] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [signInForm, setSignInForm] = useState(true)

    const [error, setError] = useState("")
    const register = api.user.registerUser.useMutation({
        onSuccess: async () => {
            const result = await signIn("login", {
                email,
                password,
                redirect: false,
            })
            if (result?.error) {
                console.log(result)
                setError(result.error)
            }
        },
        onError: (error) => {
            setError("Incorrect email or password")
        }
    })

    const [usernameError, setUsernameError] = useState(true)
    const onUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUsername(e.target.value)
        if (e.target.value.length > 0) {
            setUsernameError(false)
        } else {
            setUsernameError(true)
        }
    }

    const [emailError, setEmailError] = useState(true)
    const onEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log(e.target.value)
        const newEmail = e.target.value
        setEmail(newEmail)

        if (newEmail.toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            )
        ) {
            setEmailError(false)
        } else {
            setEmailError(true)
        }
    }

    const [passwordError, setPasswordError] = useState(true)
    const onPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value)

        const lowerCaseLetters = /[a-z]/g;
        const upperCaseLetters = /[A-Z]/g;
        const numbers = /[0-9]/g;

        if (password.match(lowerCaseLetters) &&
            password.match(upperCaseLetters) &&
            password.match(numbers) &&
            password.length >= 8
        ) {
            setPasswordError(false)
        } else {
            setPasswordError(true)
        }
    }

    const handleSignIn = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>, provider: string) => {
        e.stopPropagation();
        void signIn(provider)
    }

    const handleSumbit = async () => {
        if (signInForm) {
            if (emailError || passwordError) {
                return
            }

            const result = await signIn("login", {
                email,
                password,
                redirect: false,
            })
            if (result?.error) {
                setError("Incorrect email or password")
            }
        } else {
            if (emailError || usernameError || passwordError) {
                return
            }

            register.mutate({
                email,
                username,
                password,
            })
        }
    }

    return (
        <>
            <input type="checkbox" id="signInModal" className="modal-toggle" />
            <label htmlFor="signInModal" className="modal modal-bottom sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box space-y-4">
                    <div className="flex flex-col gap-2">
                        {error != "" &&
                            <div role="alert" className="alert alert-error justify-normal">
                                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>{error}</span>
                            </div>
                        }
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl p-1">Email</h3>
                            <input
                                id="emailInput"
                                type="text" placeholder="Email"
                                className={`w-full input input-bordered ${emailError ? "input-error" : ""}`}
                                value={email}
                                onChange={onEmailChange}
                            />
                        </div>
                        {!signInForm &&
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
                        }
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl p-1">Password</h3>
                            <label className={`flex items-center gap-2 ${passwordError ? "input-error" : ""}`}>
                                <input
                                    id="passwordInput"
                                    type={`${showPassword ? "text" : "password"}`} placeholder="Password"
                                    value={password}
                                    className={`grow input input-bordered  ${passwordError ? "input-error" : ""}`}
                                    onChange={onPasswordChange} />
                                <button className="btn btn-outline" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ?
                                        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path fill="currentColor" d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z" /></svg>
                                        :
                                        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path fill="currentColor" d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z" /></svg>
                                    }
                                </button>
                            </label>
                        </div>
                        <button className="btn btn-block btn-primary mt-2" onClick={() => handleSumbit()}>
                            <span className="ml-2">{signInForm ? "Sign In" : "Sign Up"}</span>
                        </button>
                    </div>
                    <div className="divider">OR</div>
                    <button className="btn btn-block btn-outline" onClick={(e) => handleSignIn(e, "google")}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z" /></svg>
                        <span className="ml-2">Sign in with Google</span>
                    </button>
                    {/* <button className="btn btn-block btn-outline" onClick={(e) => handleSignIn(e, "github")}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33c.85 0 1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z" /></svg>
                        <span className="ml-2">Sign in with Github</span>
                    </button> */}
                    {signInForm ?
                        <button className="btn btn-block btn-outline" onClick={(e) => setSignInForm(false)}>
                            <span className="ml-2">New to TypeCafe? Join Now</span>
                        </button>
                        :
                        <button className="btn btn-block btn-outline" onClick={(e) => setSignInForm(true)}>
                            <span className="ml-2">Already a member? Sign In</span>
                        </button>
                    }
                </label>
            </label>
        </>
    )
}