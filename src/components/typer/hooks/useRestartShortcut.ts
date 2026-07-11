import { useEffect } from "react"

// Global Tab→Enter/Space restart shortcut. Tab arms the restart (and highlights
// the restart button when there is one); the *next* Enter or Space fires it.
// This is sequential, not a chord: you no longer have to hold Tab down while
// pressing Enter - Tab then Enter works. Any other key cancels the armed state,
// so a stray Tab can't leave a later Space (the word separator) primed to
// restart mid-test. Suppressed while any modal is open so modal keyboard
// navigation keeps working.
//
// A near-simultaneous Tab+Space (or Tab+Enter) can arrive with the restart key
// *before* Tab - the OS reports two all-but-simultaneous presses in scan order,
// not press order - which would leave the space unarmed and skip the restart.
// So a restart key also records its time; a Tab landing within CHORD_WINDOW_MS
// after it fires the restart anyway (the space already typed is wiped by it).
const CHORD_WINDOW_MS = 80

export function useRestartShortcut(
    restartRef: React.RefObject<HTMLButtonElement | null> | null,
    onRestart: () => void,
    isModalOpen: () => boolean,
    options: { enabled?: boolean } = {},
) {
    useEffect(() => {
        if (options.enabled === false) return

        let armed = false
        let lastRestartKeyAt = 0

        const isRestartKey = (key: string) =>
            key === ' ' || key === 'Space' || key === 'Spacebar' || key === 'Enter'

        const setButtonActive = (active: boolean) => {
            const btn = restartRef?.current
            if (!btn) return
            if (active) {
                btn.classList.add("btn-active")
                btn.focus()
            } else {
                btn.classList.remove("btn-active")
                btn.blur()
            }
        }

        const disarm = () => {
            armed = false
            setButtonActive(false)
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isModalOpen() || e.repeat) return

            if (e.key === 'Tab') {
                // Tab arms restart and stays armed after release (sequential). Block
                // the browser's focus-move default and React's handler.
                e.preventDefault()
                e.stopPropagation()
                // Chord race: the restart key beat Tab through the event queue.
                // Honour it - the space it already typed is wiped by the restart.
                if (performance.now() - lastRestartKeyAt < CHORD_WINDOW_MS) {
                    disarm()
                    lastRestartKeyAt = 0
                    onRestart()
                    return
                }
                armed = true
                setButtonActive(true)
                return
            }

            if (isRestartKey(e.key)) {
                if (armed) {
                    // Swallow the firing key so it can't also land on the typing input
                    // as a flashed keystroke: preventDefault blocks the browser
                    // default, stopPropagation blocks React's own keydown handler.
                    e.preventDefault()
                    e.stopPropagation()
                    disarm()
                    onRestart()
                    return
                }
                // Not armed: let it type normally, but remember it so a Tab that
                // lost the chord race (arrives just after) can still restart.
                lastRestartKeyAt = performance.now()
                return
            }

            if (!armed) return

            // Any other key cancels the armed restart (let it type normally).
            disarm()
        }

        document.addEventListener("keydown", handleKeyDown, true);

        return () => {
            document.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [restartRef, onRestart, isModalOpen, options.enabled]);
}
