// Single registry of the app's modals and the one place that knows how to read
// their open state. Modals are uncontrolled daisyUI toggles (checkbox-based,
// except the username modal which is class-based), so open state lives in the
// DOM; every consumer must go through here instead of scattering
// getElementById checks. Add new modals to MODAL_IDS and they are picked up by
// focus management and shortcut suppression automatically.
export const MODAL_IDS = {
    config: "configModal",
    color: "colorModal",
    signIn: "signInModal",
    username: "usernameModal",
} as const

export type ModalId = (typeof MODAL_IDS)[keyof typeof MODAL_IDS]

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
