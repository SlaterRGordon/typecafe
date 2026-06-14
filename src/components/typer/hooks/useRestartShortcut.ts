import { useEffect } from "react"

interface Keys {
    [key: string]: boolean
}

// Global Tab(+Space/Enter) restart shortcut. Tab alone highlights the restart
// button; Tab held with Space or Enter triggers the restart. Suppressed while
// any modal is open so modal keyboard navigation keeps working.
export function useRestartShortcut(
    restartRef: React.RefObject<HTMLButtonElement | null>,
    onRestart: () => void,
    isModalOpen: () => boolean,
) {
    useEffect(() => {
        let keys: Keys = {}
        let restarting = false

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isModalOpen() || keys[e.key] || e.repeat) return

            // add to currently pressed keys
            keys = { ...keys, [e.key]: true };

            if (keys['Tab']) {
                e.preventDefault()
                const restartBtn = restartRef.current
                if (restartBtn) {
                    restartBtn.classList.add("btn-active")
                    restartBtn.focus()
                }
            }

            const hasRestartKey = keys[' '] || keys['Space'] || keys['Spacebar'] || keys['Enter']

            if (keys['Tab'] && hasRestartKey && !restarting) {
                restarting = true
                onRestart()
            }
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            if (isModalOpen()) return

            // remove from currently pressed keys
            keys = { ...keys, [e.key]: false };

            const hasRestartKey = keys[' '] || keys['Space'] || keys['Spacebar'] || keys['Enter']

            if (!(keys['Tab'] && hasRestartKey) && restarting) {
                restarting = false
            }

            if (e.key == 'Tab') {
                const restartBtn = restartRef.current
                if (restartBtn) {
                    restartBtn.classList.remove("btn-active")
                    restartBtn.blur()
                }
            }
        }

        document.addEventListener("keydown", handleKeyDown, true);
        document.addEventListener("keyup", handleKeyUp, true);

        return () => {
            document.removeEventListener("keydown", handleKeyDown, true);
            document.removeEventListener("keyup", handleKeyUp, true);
        };
    }, [restartRef, onRestart, isModalOpen]);
}
