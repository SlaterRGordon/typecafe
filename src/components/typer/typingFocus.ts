export function typingFocusFadeClass(isTyping: boolean, className = "") {
    return `${className} transition-opacity duration-300 motion-reduce:transition-none ${isTyping ? "pointer-events-none opacity-0" : "opacity-100"}`
}
