// Single registry of the app's modals and the shared sign-in trigger. Add new
// modals to MODAL_IDS so focus management and shortcut suppression pick them up.
export const MODAL_IDS = {
    config: "configModal",
    color: "colorModal",
    signIn: "signInModal",
    username: "usernameModal",
} as const

export type ModalId = (typeof MODAL_IDS)[keyof typeof MODAL_IDS]

export const OPEN_SIGN_IN_EVENT = "typecafe:open-sign-in"

export function openSignInModal(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_SIGN_IN_EVENT))
}

export function isModalOpen(id: ModalId): boolean {
    if (typeof document === "undefined") return false
    const element = document.getElementById(id)
    if (!element) return false
    if (element instanceof HTMLInputElement) return element.checked
    return element.classList.contains("modal-open")
}

export function isAnyModalOpen(): boolean {
    return Object.values(MODAL_IDS).some(isModalOpen)
}
