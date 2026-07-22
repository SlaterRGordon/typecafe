import { parseCoachingTargetQuery, targetAction, type DrillQuery } from "./coachingTarget"

function first(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function positiveSeconds(value: string | string[] | undefined): number | null {
    const parsed = Number(first(value))
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 600 ? parsed : null
}

/** Translate retired Drill URLs without pretending unsupported intent exists. */
export function drillCompatibilityDestination(query: DrillQuery): string {
    const parsed = parseCoachingTargetQuery(query)
    if (parsed) {
        const destination = targetAction(parsed.target, {
            length: positiveSeconds(query.length) ?? undefined,
            evidence: parsed.evidence ?? undefined,
        }).href
        const reMeasure = first(query.rm)
        return reMeasure
            ? `${destination}${destination.includes("?") ? "&" : "?"}rm=${encodeURIComponent(reMeasure)}`
            : destination
    }

    const seconds = positiveSeconds(query.seconds)
    if (seconds) return `/?mode=timed&count=${seconds}`

    return "/practice"
}
