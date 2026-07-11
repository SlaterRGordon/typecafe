// Per-keystroke "next expected key" channel: one publisher (Typer), the
// on-screen keyboards subscribe. A module singleton instead of page state so a
// keystroke re-renders the keyboard alone - never the page tree (typing-feel §1).
type Listener = (key: string) => void

const listeners = new Set<Listener>()
let activeKey = ""

export function publishActiveKey(key: string) {
    if (key === activeKey) return
    activeKey = key
    for (const listener of listeners) listener(key)
}

export function getActiveKey() {
    return activeKey
}

export function subscribeActiveKey(listener: Listener) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}
