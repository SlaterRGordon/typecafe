import dynamic from "next/dynamic"

// The tabs cannot render useful content until client auth, local evidence, and
// language data resolve. Load that coaching graph after hydration so it never
// taxes the typing surface's first paint.
export const LazyHomeCoachTabs = dynamic(
    () => import("./HomeCoachTabs").then((module) => module.HomeCoachTabs),
    { ssr: false },
)
