// Run work after the current frame settles (typing-feel §1/§3): analytics
// aggregation, sync calls, and text-buffer refills must never ride a
// keystroke or the completion paint. The timeout bounds the wait on a busy
// main thread; setTimeout covers Safari and tests.
export function runWhenIdle(fn: () => void, timeoutMs = 1000) {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => fn(), { timeout: timeoutMs })
    else setTimeout(fn, 0)
}
