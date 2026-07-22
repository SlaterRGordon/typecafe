export const toolbarIconButtonClass = "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-base-content/40 transition-colors hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

export function RestartIcon() {
    return (
        // Text.tsx uses this id for the test-over restart cue.
        <svg id="restart" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="0.8 1 22 22">
            <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                <path d="M12 3a9 9 0 1 1-5.657 2" />
                <path d="M3 4.5h4v4" />
            </g>
        </svg>
    )
}

export function FullscreenIcon({ fullscreen }: { fullscreen: boolean }) {
    return fullscreen ? (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="15 -940 920 920" fill="currentColor">
            <path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z" />
        </svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="15 -940 920 920" fill="currentColor">
            <path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z" />
        </svg>
    )
}
